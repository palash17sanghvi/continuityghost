import { isSameOriginRequest } from '../../../../lib/request-origin';
import { reviewVideo, videoReviewSchema, VideoStoreError } from '../../../../lib/video-store';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  if (!isSameOriginRequest(request) || request.headers.get('sec-fetch-site') === 'cross-site') return Response.json({ error: 'Cross-origin review is not allowed.' }, { status: 403 });
  if (!request.headers.get('content-type')?.includes('application/json')) return Response.json({ error: 'Expected JSON review.' }, { status: 400 });
  let value: unknown;
  try {
    const reader = request.body?.getReader();
    if (!reader) return Response.json({ error: 'Missing review.' }, { status: 400 });
    const decoder = new TextDecoder(); let text = ''; let size = 0;
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 24000) { await reader.cancel(); return Response.json({ error: 'Review too large.' }, { status: 413 }); }
      text += decoder.decode(value, { stream: true });
    }
    value = JSON.parse(text + decoder.decode());
  } catch { return Response.json({ error: 'Invalid JSON review.' }, { status: 400 }); }
  const parsed = videoReviewSchema.safeParse(value);
  if (!parsed.success) return Response.json({ error: 'Invalid review fields.' }, { status: 400 });
  try { return Response.json(await reviewVideo(parsed.data), { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) { return Response.json({ error: error instanceof VideoStoreError ? error.message : 'Review could not be saved. Retry without closing this report.' }, { status: error instanceof VideoStoreError ? error.status : 503 }); }
}
