import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { getVideoMedia, VideoStoreError } from '../../../../../lib/video-store';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, context: { params: Promise<{ analysisId: string }> }) {
  try {
    const { analysisId } = await context.params;
    const media = await getVideoMedia(analysisId, new URL(request.url).searchParams.get('frameId'));
    const headers = new Headers({ 'Content-Type': media.mimeType, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
    const range = request.headers.get('range');
    let start = 0, end = media.size - 1;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || (!match[1] && !match[2])) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${media.size}` } });
      if (!match[1]) { const suffix = Number(match[2]); start = Math.max(0, media.size - suffix); }
      else { start = Number(match[1]); if (match[2]) end = Math.min(Number(match[2]), end); }
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= media.size || (match[1] === '' && Number(match[2]) === 0)) {
        return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${media.size}` } });
      }
      headers.set('Content-Range', `bytes ${start}-${end}/${media.size}`);
    }
    headers.set('Content-Length', String(Math.max(0, end - start + 1)));
    if (media.size === 0) return new Response(null, { headers });
    const stream = createReadStream(media.file, { start, end });
    return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, { status: range ? 206 : 200, headers });
  } catch (error) {
    const status = error instanceof VideoStoreError ? error.status : (error as NodeJS.ErrnoException).code === 'ENOENT' ? 404 : 503;
    return Response.json({ error: 'Stored media unavailable.' }, { status });
  }
}
