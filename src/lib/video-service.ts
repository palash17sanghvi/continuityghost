import { GoogleGenAI } from '@google/genai';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import sharp from 'sharp';
import { z } from 'zod';
import { analyzeImages, parseFindings, responseSchema, validateImage, type ImageInput } from './continuity';
import { databaseEnabled, persistAnalysis } from './database';
import { HttpError } from './resource-http';
import { getScene } from './resources';
import { selectPairs, countCandidatePairs, type FramePair } from './video-pairs';
import { VIDEO_LIMITS, startAnalysisRequestSchema, type VideoAnalysis, type Video } from './video-contract';
import { MediaError, detectShots, extractFrame, inspectVideo, planKeyframes } from './video-ffmpeg';
import * as store from './video-store';

/** Server-only orchestration: upload validation, FFmpeg extraction, bounded Gemini comparisons, persistence. */
export const PROVIDER_TIMEOUT_MS = 60_000;
export const PROVIDER_MAX_OUTPUT_TOKENS = 1024;
const BODY_LIMIT = VIDEO_LIMITS.maxBytes + 200_000;
type ErrorCode = VideoAnalysis['errors'][number]['code'];
type Generate = (parts: Array<{ text: string } | { inlineData: ImageInput }>) => Promise<string>;

export function modelName(): string { return process.env.GEMINI_VIDEO_MODEL?.trim() || 'gemini-3.5-flash-lite'; }
export function maxComparisons(requested?: number): number {
  const configured = Number(process.env.VIDEO_MAX_COMPARISONS);
  const fallback = Number.isInteger(configured) && configured >= 1 ? configured : VIDEO_LIMITS.maxComparisonsDefault;
  return Math.min(requested ?? fallback, VIDEO_LIMITS.maxComparisonsCeiling);
}
export function analysisMode(): 'gemini' | 'mock' | 'disabled' {
  if (process.env.GEMINI_API_KEY && process.env.ALLOW_PAID_ANALYSIS === 'true') return 'gemini';
  return process.env.VIDEO_MOCK_ANALYSIS === 'true' ? 'mock' : 'disabled';
}

export function classifyError(error: unknown): ErrorCode {
  const e = error as { status?: unknown; name?: unknown; message?: unknown } | null;
  if (e?.status === 429) return 'provider_quota';
  if (e?.status === 504 || e?.status === 408 || e?.name === 'TimeoutError' || e?.name === 'AbortError') return 'provider_timeout';
  if (e?.status === 400 || e?.status === 401 || e?.status === 403 || e?.status === 404) return 'provider_rejected';
  if (error instanceof SyntaxError || error instanceof z.ZodError || /invalid JSON|empty model response/i.test(String(e?.message ?? ''))) return 'malformed_response';
  return 'internal';
}
const MESSAGES: Record<ErrorCode, string> = {
  provider_timeout: 'The AI service timed out for this frame pair.',
  provider_quota: 'AI quota or rate limit reached. Remaining pairs were skipped.',
  provider_rejected: 'The AI service rejected the request. Remaining pairs were skipped.',
  malformed_response: 'The AI returned an unreadable result for this frame pair.',
  comparison_limit_reached: 'More frame pairs were available than the comparison limit allows.',
  provider_disabled: 'AI analysis is disabled by the owner. No comparison was made.',
  internal: 'Something went wrong while comparing this frame pair.',
};
const STOP_ON: ErrorCode[] = ['provider_quota', 'provider_rejected'];

/** Gemini wire schema: keywords the API ignores are removed; Zod still validates the reply in full. */
function wireSchema() {
  const schema = z.toJSONSchema(responseSchema) as Record<string, unknown>;
  (function strip(node: unknown) {
    if (node && typeof node === 'object') { for (const k of ['$schema', 'minLength', 'maxLength', 'minItems', 'maxItems']) delete (node as Record<string, unknown>)[k]; Object.values(node).forEach(strip); }
  })(schema);
  return schema;
}
export function geminiGenerate(model: string): Generate {
  const { GEMINI_API_KEY: apiKey } = process.env;
  const ai = new GoogleGenAI({ apiKey, httpOptions: { timeout: PROVIDER_TIMEOUT_MS, retryOptions: { attempts: 1 } } });
  const schema = wireSchema();
  return async parts => {
    const response = await ai.models.generateContent({ model, contents: [{ role: 'user', parts }], config: { abortSignal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS), responseMimeType: 'application/json', responseJsonSchema: schema, maxOutputTokens: PROVIDER_MAX_OUTPUT_TOKENS } });
    if (!response.text) throw new Error('Empty model response');
    return response.text;
  };
}
/** Local development fixture. Findings are labeled MOCK and stored with source "mock". Never a detection. */
export function mockGenerate(): Generate {
  let calls = 0;
  return async () => {
    calls += 1;
    return JSON.stringify(calls === 1
      ? { summary: '[MOCK] Local development fixture. No AI model was called.', findings: [{ category: 'props', description: '[MOCK] Example finding for UI development. Not a real detection.', referenceEvidence: '[MOCK] No image was analyzed.', candidateEvidence: '[MOCK] No image was analyzed.', uncertainty: '[MOCK] This is placeholder data.', suggestedAction: '[MOCK] Run a real analysis to get an AI observation.' }] }
      : { summary: '[MOCK] Local development fixture. No AI model was called.', findings: [] });
  };
}

async function readBounded(request: Request): Promise<FormData> {
  const length = request.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > BODY_LIMIT)) throw new HttpError(413, 'Video exceeds the 50 MiB limit.');
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('multipart/form-data')) throw new HttpError(400, 'Expected multipart form with a video file.');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'Missing upload body.');
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > BODY_LIMIT) { await reader.cancel(); throw new HttpError(413, 'Video exceeds the 50 MiB limit.'); }
    chunks.push(value);
  }
  try { return await new Response(Buffer.concat(chunks), { headers: { 'content-type': request.headers.get('content-type')! } }).formData(); }
  catch { throw new HttpError(400, 'Malformed upload form.'); }
}
const isMp4 = (head: Buffer) => head.length >= 12 && head.subarray(4, 8).toString('latin1') === 'ftyp';

export async function uploadVideo(request: Request, projectId: string, sceneId: string): Promise<Video> {
  if (!databaseEnabled()) throw new HttpError(503, 'Persistence unavailable. Configure DATABASE_URL and ALLOW_DATABASE=true.');
  await getScene(projectId, sceneId);
  const form = await readBounded(request);
  const file = form.get('video');
  if (!(file instanceof File)) throw new HttpError(400, 'Upload one MP4 file in the "video" field.');
  if (file.size === 0) throw new HttpError(400, 'The video file is empty.');
  if (file.size > VIDEO_LIMITS.maxBytes) throw new HttpError(413, 'Video exceeds the 50 MiB limit.');
  const title = String(form.get('title') ?? '').trim().slice(0, 200) || file.name.replace(/[^\w .-]/g, '').slice(0, 200) || 'Untitled video';
  const bytes = Buffer.from(await file.arrayBuffer());
  if (file.type !== VIDEO_LIMITS.mimeType || !isMp4(bytes)) throw new HttpError(415, 'Only MP4 video is supported.');
  const id = randomUUID();
  const dir = store.videoDir(projectId, sceneId, id);
  const path = store.videoFile(projectId, sceneId, id);
  let inserted = false;
  try {
    await mkdir(dirname(path), { recursive: true }); await mkdir(`${dir}/frames`, { recursive: true });
    await writeFile(path, bytes, { mode: 0o600 });
    const info = await inspectVideo(path);
    if (info.durationSeconds < VIDEO_LIMITS.minDurationSeconds || info.durationSeconds > VIDEO_LIMITS.maxDurationSeconds) throw new HttpError(422, `Video must be ${VIDEO_LIMITS.minDurationSeconds} to ${VIDEO_LIMITS.maxDurationSeconds} seconds long.`);
    const shots = await detectShots(path, info.durationSeconds);
    const frames: store.NewKeyframe[] = [];
    for (const planned of planKeyframes(shots, info.durationSeconds)) {
      const frameId = randomUUID();
      const out = store.frameFile(projectId, sceneId, id, frameId);
      await extractFrame(path, planned.timestampSeconds, out);
      const meta = await sharp(out).metadata();
      await sharp(out).resize({ width: 240, withoutEnlargement: true }).jpeg({ quality: 70 }).toFile(store.frameFile(projectId, sceneId, id, frameId, true));
      frames.push({ id: frameId, index: planned.index, timestampSeconds: planned.timestampSeconds, shotIndex: planned.shotIndex, width: meta.width ?? 0, height: meta.height ?? 0 });
    }
    await store.insertVideo({ id, projectId, sceneId, title, sizeBytes: bytes.length, durationSeconds: info.durationSeconds, width: info.width, height: info.height, fps: info.fps });
    inserted = true;
    await store.markVideoReady(projectId, sceneId, id, frames);
    return store.getVideo(projectId, sceneId, id);
  } catch (error) {
    if (inserted) await store.markVideoFailed(projectId, sceneId, id, 'Keyframe extraction failed.').catch(() => {});
    else await rm(dir, { recursive: true, force: true }).catch(() => {});
    if (error instanceof MediaError) throw new HttpError(error.status, error.message);
    throw error;
  }
}

export type AnalysisPlan = { analysis: VideoAnalysis; run: (() => Promise<void>) | null };
export async function startAnalysis(projectId: string, sceneId: string, videoId: string, body: unknown): Promise<AnalysisPlan> {
  const parsed = startAnalysisRequestSchema.safeParse(body);
  if (!parsed.success) throw new HttpError(400, 'Provide consent, cost approval and an optional maxComparisons from 1 to 8.');
  const frames = await store.listKeyframes(projectId, sceneId, videoId);
  const limit = maxComparisons(parsed.data.maxComparisons);
  const pairFrames = frames.map(f => ({ id: f.id, index: f.index, timestampSeconds: f.timestampSeconds, shotIndex: f.shotIndex }));
  const pairs = selectPairs(pairFrames, limit);
  const mode = analysisMode();
  const errors: VideoAnalysis['errors'] = [];
  if (countCandidatePairs(pairFrames) > limit) errors.push({ code: 'comparison_limit_reached', message: `Analysis limited to ${limit} comparisons.`, pairIndex: null });
  const { analysis, created } = await store.createAnalysis({ projectId, sceneId, videoId, source: mode === 'mock' ? 'mock' : 'gemini', model: mode === 'gemini' ? modelName() : null, maxComparisons: limit, keyframeCount: frames.length, pairsPlanned: mode === 'disabled' ? 0 : pairs.length, errors });
  if (!created) return { analysis, run: null };
  if (mode === 'disabled') {
    await store.updateAnalysis(projectId, sceneId, analysis.id, { status: 'failed', errors: [{ code: 'provider_disabled', message: MESSAGES.provider_disabled, pairIndex: null }], complete: true });
    return { analysis: await store.getAnalysis(projectId, sceneId, videoId, analysis.id), run: null };
  }
  const generate = mode === 'gemini' ? geminiGenerate(modelName()) : mockGenerate();
  return { analysis, run: () => runAnalysis({ projectId, sceneId, videoId, analysisId: analysis.id, startedAt: new Date(analysis.startedAt), source: mode, pairs, errors, generate }) };
}

export type RunInput = { projectId: string; sceneId: string; videoId: string; analysisId: string; startedAt: Date; source: 'gemini' | 'mock'; pairs: FramePair[]; errors: VideoAnalysis['errors']; generate: Generate };
async function loadFrame(projectId: string, sceneId: string, videoId: string, keyframeId: string): Promise<ImageInput> {
  const bytes = await readFile(store.frameFile(projectId, sceneId, videoId, keyframeId));
  return validateImage(new File([bytes], 'frame.jpg', { type: 'image/jpeg' }));
}
/** One comparison per selected pair, in order, no retries. Stops early on quota or rejection to cap spend. */
export async function runAnalysis(input: RunInput): Promise<void> {
  const { projectId, sceneId, videoId, analysisId } = input;
  const errors = [...input.errors];
  type Found = { finding: ReturnType<typeof parseFindings>['findings'][number]; pair: FramePair };
  const found: Found[] = []; const summaries: string[] = [];
  let completed = 0; let failed = 0;
  try {
    await store.updateAnalysis(projectId, sceneId, analysisId, { status: 'running' });
    for (const [pairIndex, pair] of input.pairs.entries()) {
      try {
        const [reference, candidate] = await Promise.all([loadFrame(projectId, sceneId, videoId, pair[0].id), loadFrame(projectId, sceneId, videoId, pair[1].id)]);
        const context = `Video frames from one scene. REFERENCE is at ${pair[0].timestampSeconds.toFixed(1)}s and CANDIDATE is at ${pair[1].timestampSeconds.toFixed(1)}s. A visible difference may be camera angle, lighting or scripted action rather than an error.`;
        const result = await analyzeImages({ projectId, sceneId, context, reference, candidate }, input.generate);
        completed += 1; summaries.push(`${pair[0].timestampSeconds.toFixed(1)}s to ${pair[1].timestampSeconds.toFixed(1)}s: ${result.summary}`);
        for (const finding of result.findings) found.push({ finding, pair });
      } catch (error) {
        failed += 1;
        const code = classifyError(error);
        errors.push({ code, message: MESSAGES[code], pairIndex });
        if (STOP_ON.includes(code)) break;
      } finally {
        await store.updateAnalysis(projectId, sceneId, analysisId, { pairsCompleted: completed, pairsFailed: failed, errors });
      }
    }
    if (completed > 0) {
      const summary = summaries.join(' | ').slice(0, 3000) || 'No summary.';
      await persistAnalysis({ analysisId, projectId, sceneId, summary, findings: found.map(f => f.finding) }, new Date(Math.min(input.startedAt.getTime(), Date.now() - 1)));
      await store.linkFindings(projectId, sceneId, videoId, analysisId, input.source, found.map(({ finding, pair }) => ({
        findingId: finding.id, earlierKeyframeId: pair[0].id, laterKeyframeId: pair[1].id,
        potentialIssue: `Possible ${finding.category} continuity issue between ${pair[0].timestampSeconds.toFixed(1)}s and ${pair[1].timestampSeconds.toFixed(1)}s. This is an AI observation until a reviewer confirms it.`,
      })));
    }
    const status = completed === 0 ? 'failed' : failed > 0 ? 'completed_with_errors' : 'completed';
    await store.updateAnalysis(projectId, sceneId, analysisId, { status, pairsCompleted: completed, pairsFailed: failed, errors, complete: true });
  } catch {
    errors.push({ code: 'internal', message: MESSAGES.internal, pairIndex: null });
    await store.updateAnalysis(projectId, sceneId, analysisId, { status: 'failed', errors, complete: true }).catch(() => {});
  }
}
