import { z } from 'zod';
import { analyzeVideo } from '../../../../lib/video-analysis';
import { isSameOriginRequest } from '../../../../lib/request-origin';
import { MAX_VIDEO_BYTES, VIDEO_MIME_TYPES, VideoError } from '../../../../lib/video-extraction';

export const runtime = 'nodejs';
export const maxDuration = 120;
const metadata = z.object({
  projectId: z.string().trim().min(1).max(120), sceneId: z.string().trim().min(1).max(120),
  context: z.string().trim().max(8000), consent: z.literal('true'), costApproved: z.literal('true'),
  memoryConsent: z.enum(['true', 'false']).default('false'),
});
const MAX_BODY = MAX_VIDEO_BYTES + 64 * 1024;
const json = (body: unknown, status: number) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

// Do not let request.formData() buffer an unlimited chunked upload.
async function boundedForm(request: Request): Promise<FormData> {
  const rawLength = request.headers.get('content-length');
  if (rawLength !== null && (!/^\d+$/.test(rawLength) || Number(rawLength) > MAX_BODY)) throw new VideoError('VIDEO_SIZE', 'Upload one video, at most 64 MiB.', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new VideoError('INVALID_REQUEST', 'Multipart video upload is required.', 400);
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let expired = false;
  const cancel = () => { void reader.cancel(); };
  request.signal.addEventListener('abort', cancel, {once:true});
  const deadline = setTimeout(() => { expired = true; cancel(); }, 30_000);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > MAX_BODY) { await reader.cancel(); throw new VideoError('VIDEO_SIZE', 'Upload one video, at most 64 MiB.', 413); }
      chunks.push(value);
    }
    if (expired || request.signal.aborted) throw new VideoError('VIDEO_UPLOAD_TIMEOUT', 'Video upload timed out or was cancelled.', 408);
    const body = Buffer.concat(chunks);
    return await new Request(request.url, { method: 'POST', headers: { 'Content-Type': request.headers.get('content-type') ?? '' }, body }).formData();
  } finally { clearTimeout(deadline); request.signal.removeEventListener('abort', cancel); reader.releaseLock(); }
}

export async function POST(request: Request) {
  const deadline = Date.now() + 110_000;
  if (!isSameOriginRequest(request) || request.headers.get('sec-fetch-site') === 'cross-site') return json({ error: 'Same-origin request required.', code: 'INVALID_ORIGIN' }, 403);
  // Reject disabled paid work before reading/decoding an upload.
  if (process.env.ALLOW_PAID_ANALYSIS !== 'true' || !process.env.GEMINI_API_KEY)
    return json({ error: 'Live analysis is disabled. Configure Gemini and approve analysis costs first.', code: 'ANALYSIS_DISABLED' }, 503);
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('multipart/form-data;'))
    return json({ error: 'Multipart video upload is required.', code: 'INVALID_REQUEST' }, 400);
  try {
    const form = await boundedForm(request);
    const fields = metadata.parse({ projectId: form.get('projectId'), sceneId: form.get('sceneId'), context: form.get('context') ?? '',
      consent: form.get('consent'), costApproved: form.get('costApproved'), memoryConsent: form.get('memoryConsent') ?? 'false' });
    const uploads = form.getAll('video');
    if (uploads.length !== 1 || !(uploads[0] instanceof File))
      throw new VideoError('INVALID_REQUEST', 'Upload exactly one video.', 400);
    const video = uploads[0];
    if (!video.size || video.size > MAX_VIDEO_BYTES)
      throw new VideoError('VIDEO_SIZE', 'Upload one non-empty video, at most 64 MiB.', 413);
    if (!VIDEO_MIME_TYPES.includes(video.type as typeof VIDEO_MIME_TYPES[number]))
      throw new VideoError('UNSUPPORTED_VIDEO', 'Use MP4, WebM, or MOV video.', 400);
    const clipName = video.name.replace(/[\\/]/g, '_').trim();
    if (!clipName || clipName.length > 255) throw new VideoError('INVALID_REQUEST', 'Video filename must be 1–255 characters.', 400);
    const result = await analyzeVideo({ buffer: Buffer.from(await video.arrayBuffer()), mimeType: video.type, clipName,
      projectId: fields.projectId, sceneId: fields.sceneId, context: fields.context,
      consent: true, costApproved: true, memoryConsent: fields.memoryConsent === 'true', signal: request.signal, deadline });
    return json(result, 200);
  } catch (error) {
    if (error instanceof VideoError) return json({ error: error.message, code: error.code }, error.status);

    if (error instanceof z.ZodError || error instanceof TypeError)
      return json({ error: 'Invalid upload metadata. Upload consent and cost approval must both be true.', code: 'INVALID_REQUEST' }, 400);
    return json({ error: 'Video analysis failed. Please try again.', code: 'VIDEO_ANALYSIS_FAILED' }, 500);
  }
}
