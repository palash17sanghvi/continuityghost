import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The Gemini SDK is mocked: these tests never contact Google. Real FFmpeg, real SQL (file-backed embedded PostgreSQL), real route handlers.
const gemini = vi.hoisted(() => ({ generate: vi.fn(), ctor: vi.fn() }));
vi.mock('@google/genai', () => ({ GoogleGenAI: class { constructor(options: unknown) { gemini.ctor(options); } models = { generateContent: gemini.generate }; } }));

import { createProject, createScene } from './resources';
import { closeLocalDatabases, warmLocalDatabase } from './pool';
import { classifyError, maxComparisons } from './video-service';
import { timelineSchema, videoSchema, VIDEO_LIMITS } from './video-contract';
import { makeColorVideo } from './video-test-helpers';
import { POST as upload, GET as listVideos } from '../app/api/projects/[projectId]/scenes/[sceneId]/videos/route';
import { GET as getVideo } from '../app/api/projects/[projectId]/scenes/[sceneId]/videos/[videoId]/route';
import { GET as stream } from '../app/api/projects/[projectId]/scenes/[sceneId]/videos/[videoId]/stream/route';
import { GET as keyframes } from '../app/api/projects/[projectId]/scenes/[sceneId]/videos/[videoId]/keyframes/route';
import { GET as keyframeImage } from '../app/api/projects/[projectId]/scenes/[sceneId]/videos/[videoId]/keyframes/[keyframeId]/image/route';
import { POST as startAnalysis } from '../app/api/projects/[projectId]/scenes/[sceneId]/videos/[videoId]/analyses/route';
import { GET as getAnalysis } from '../app/api/projects/[projectId]/scenes/[sceneId]/videos/[videoId]/analyses/[analysisId]/route';
import { GET as timeline } from '../app/api/projects/[projectId]/scenes/[sceneId]/videos/[videoId]/analyses/[analysisId]/timeline/route';
import { POST as review } from '../app/api/reviews/route';

const token = 'test-video-secret-0123456789abcdef0123456789';
const auth = { authorization: `Bearer ${token}` };
const P = 'proj', S = 's1';
let dir: string; let mp4: Buffer; let shortMp4: Buffer;
const ctx = (extra: Record<string, string> = {}, p = P, s = S) => ({ params: Promise.resolve({ projectId: p, sceneId: s, ...extra }) });
const url = (path = '') => `https://app.test/api/projects/${P}/scenes/${S}/videos${path}`;
const form = (bytes: Buffer | null, type = 'video/mp4') => { const f = new FormData(); if (bytes) f.set('video', new File([new Uint8Array(bytes)], 'take1.mp4', { type })); return f; };
const post = (body: BodyInit, headers: Record<string, string> = auth) => new Request(url(), { method: 'POST', headers, body });
const jsonPost = (path: string, body: unknown) => new Request(url(path), { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify(body) });
const get = (path = '', headers: Record<string, string> = auth) => new Request(url(path), { headers });
const body = async (r: Response) => r.json() as Promise<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const approved = { consent: true, costApproved: true };
const finding = (extra = {}) => JSON.stringify({ summary: 'Wristwatch differs.', findings: [{ category: 'props', description: 'Watch present, then absent.', referenceEvidence: 'Watch on wrist.', candidateEvidence: 'Bare wrist.', uncertainty: 'Wrist may be out of frame.', suggestedAction: 'Check script notes.', severity: 'medium', confidence: { level: 'supported', basis: 'Clear in both frames.' }, ...extra }] });

async function uploadOk(title = 'take1') {
  const f = form(mp4); f.set('title', title);
  const res = await upload(post(f), ctx());
  expect(res.status).toBe(201);
  return (await body(res)).video as { id: string };
}
async function analyze(videoId: string, extra: Record<string, unknown> = {}) {
  const res = await startAnalysis(jsonPost(`/${videoId}/analyses`, { ...approved, ...extra }), ctx({ videoId }));
  expect(res.status).toBe(202);
  const { analysis } = await body(res);
  for (let i = 0; i < 100; i++) {
    const current = (await body(await getAnalysis(get(`/${videoId}/analyses/${analysis.id}`), ctx({ videoId, analysisId: analysis.id })))).analysis;
    if (!['queued', 'running'].includes(current.status)) return current;
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error('analysis did not finish');
}
const readTimeline = async (videoId: string, analysisId: string) => body(await timeline(get(`/${videoId}/analyses/${analysisId}/timeline`), ctx({ videoId, analysisId })));

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cg-video-it-'));
  vi.stubEnv('BACKEND_API_TOKEN', token); vi.stubEnv('ALLOW_DATABASE', 'true');
  vi.stubEnv('DATABASE_URL', `pglite:${join(dir, 'db')}`); vi.stubEnv('VIDEO_DATA_DIR', join(dir, 'videos'));
  await warmLocalDatabase();
  await makeColorVideo(join(dir, 'ok.mp4')); await makeColorVideo(join(dir, 'short.mp4'), ['black', 'white'], 1);
  mp4 = await readFile(join(dir, 'ok.mp4')); shortMp4 = await readFile(join(dir, 'short.mp4'));
  await createProject({ id: P, name: 'Project' }); await createScene({ projectId: P, id: S, name: 'Scene 1' }); await createScene({ projectId: P, id: 's2', name: 'Scene 2' });
  await createProject({ id: 'other', name: 'Other' }); await createScene({ projectId: 'other', id: S, name: 'Other scene' });
}, 60_000);
afterAll(async () => { await closeLocalDatabases(); vi.unstubAllEnvs(); await rm(dir, { recursive: true, force: true }); });
beforeEach(() => { gemini.generate.mockReset(); gemini.ctor.mockReset(); vi.stubEnv('VIDEO_MOCK_ANALYSIS', 'false'); vi.stubEnv('ALLOW_PAID_ANALYSIS', 'false'); vi.stubEnv('GEMINI_API_KEY', ''); vi.stubEnv('VIDEO_MAX_COMPARISONS', ''); });

describe('upload validation', () => {
  it('requires authentication on every video route', async () => {
    expect((await upload(post(form(mp4), {}), ctx())).status).toBe(401);
    expect((await listVideos(get('', {}), ctx())).status).toBe(401);
    expect((await stream(get('/x/stream', {}), ctx({ videoId: 'x' }))).status).toBe(401);
    expect((await startAnalysis(new Request(url('/x/analyses'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }), ctx({ videoId: 'x' }))).status).toBe(401);
  });
  it('rejects cross-origin uploads', async () => {
    expect((await upload(post(form(mp4), { ...auth, origin: 'https://evil.test' }), ctx())).status).toBe(403);
  });
  it('rejects non-multipart, missing, empty and wrong-type files', async () => {
    expect((await upload(post('{}', { ...auth, 'content-type': 'application/json' }), ctx())).status).toBe(400);
    expect((await upload(post(form(null)), ctx())).status).toBe(400);
    expect((await upload(post(form(Buffer.alloc(0))), ctx())).status).toBe(400);
    expect((await upload(post(form(mp4, 'video/webm')), ctx())).status).toBe(415);
    expect((await upload(post(form(Buffer.from('this is plain text pretending to be a video'))), ctx())).status).toBe(415);
  });
  it('rejects a file with an MP4 header but unreadable content', async () => {
    const fake = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(200, 7)]);
    expect((await upload(post(form(fake)), ctx())).status).toBe(400);
  });
  it('rejects durations outside 5 to 60 seconds', async () => {
    const res = await upload(post(form(shortMp4)), ctx());
    expect(res.status).toBe(422); expect((await body(res)).error).toMatch(/5 to 60 seconds/);
  });
  it('rejects oversized uploads by declared length and by streamed length', async () => {
    expect((await upload(post(form(mp4), { ...auth, 'content-length': String(VIDEO_LIMITS.maxBytes + 500_000) }), ctx())).status).toBe(413);
    const big = Buffer.alloc(VIDEO_LIMITS.maxBytes + 300_000); big.write('ftypisom', 4, 'latin1');
    expect((await upload(post(form(big)), ctx())).status).toBe(413);
  }, 60_000);
  it('returns 404 for unknown scenes and leaves no files or rows behind', async () => {
    const res = await upload(post(form(mp4)), ctx({}, P, 'missing'));
    expect(res.status).toBe(404);
    expect((await body(await listVideos(get(), ctx()))).total).toBe(0);
  });
});

describe('video-first workflow in labeled mock mode, with persistence across restart', () => {
  it('upload, keyframes with real timestamps, analysis, timeline, review and reload', async () => {
    vi.stubEnv('VIDEO_MOCK_ANALYSIS', 'true');
    const { id } = await uploadOk();
    const meta = videoSchema.parse((await body(await getVideo(get(`/${id}`), ctx({ videoId: id })))).video);
    expect(meta).toMatchObject({ status: 'ready', width: 160, height: 120 }); expect(meta.durationSeconds).toBeCloseTo(6, 0);

    const frames = (await body(await keyframes(get(`/${id}/keyframes`), ctx({ videoId: id })))).items as Array<{ id: string; timestampSeconds: number; shotIndex: number; imageUrl: string }>;
    expect(frames.map(f => f.timestampSeconds)).toEqual([1, 3, 5]); expect(frames.map(f => f.shotIndex)).toEqual([0, 1, 2]);
    const img = await keyframeImage(get(`/${id}/keyframes/${frames[0].id}/image`), ctx({ videoId: id, keyframeId: frames[0].id }));
    expect([img.status, img.headers.get('content-type')]).toEqual([200, 'image/jpeg']);
    const thumb = await keyframeImage(get(`/${id}/keyframes/${frames[0].id}/image?size=thumb`), ctx({ videoId: id, keyframeId: frames[0].id }));
    expect(thumb.status).toBe(200);
    expect((await keyframeImage(get(`/${id}/keyframes/${frames[0].id}/image?size=huge`), ctx({ videoId: id, keyframeId: frames[0].id }))).status).toBe(400);

    const ranged = await stream(get(`/${id}/stream`, { ...auth, range: 'bytes=0-99' }), ctx({ videoId: id }));
    expect([ranged.status, ranged.headers.get('content-range')?.startsWith('bytes 0-99/')]).toEqual([206, true]);
    expect((await ranged.arrayBuffer()).byteLength).toBe(100);
    expect((await stream(get(`/${id}/stream`, { ...auth, range: 'bytes=999999999-' }), ctx({ videoId: id }))).status).toBe(416);

    const done = await analyze(id);
    expect(done).toMatchObject({ status: 'completed', source: 'mock', model: null });
    expect(gemini.generate).not.toHaveBeenCalled();
    const tl = timelineSchema.parse(await readTimeline(id, done.id));
    expect(tl.findings).toHaveLength(1);
    const f = tl.findings[0];
    expect(f).toMatchObject({ source: 'mock', status: 'unreviewed' }); expect(f.description).toMatch(/^\[MOCK\]/);
    expect(f.earlier.timestampSeconds).toBeLessThan(f.later.timestampSeconds);
    expect(frames.map(k => k.id)).toEqual(expect.arrayContaining([f.earlier.keyframeId, f.later.keyframeId]));
    expect(f.earlier.imageUrl).toMatch(/\/keyframes\/.+\/image$/);

    const reviewReq = (key: string, status = 'confirmed') => new Request('https://app.test/api/reviews', { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ analysisId: done.id, findingId: f.id, projectId: P, sceneId: S, status, note: 'Checked against script.', consent: false, idempotencyKey: key }) });
    const key = crypto.randomUUID();
    const first = await body(await review(reviewReq(key)));
    expect(first).toMatchObject({ persisted: true });
    const replay = await body(await review(reviewReq(key)));
    expect(replay.decisionId).toBe(first.decisionId);
    expect((await readTimeline(id, done.id)).findings[0]).toMatchObject({ status: 'confirmed', note: 'Checked against script.' });

    await closeLocalDatabases(); // simulates a server restart: the database file is reopened from disk
    const reloaded = timelineSchema.parse(await readTimeline(id, done.id));
    expect(reloaded.findings[0]).toMatchObject({ id: f.id, status: 'confirmed', note: 'Checked against script.', source: 'mock' });
    expect(reloaded.keyframes.map(k => k.timestampSeconds)).toEqual([1, 3, 5]);
    expect((await stream(get(`/${id}/stream`, auth), ctx({ videoId: id }))).status).toBe(200);
    expect((await body(await listVideos(get(), ctx()))).total).toBeGreaterThan(0);
  }, 60_000);

  it('keeps videos isolated by project and scene', async () => {
    const { id } = await uploadOk('private');
    for (const [p, s] of [[P, 's2'], ['other', S]] as const) {
      expect((await getVideo(get(`/${id}`), ctx({ videoId: id }, p, s))).status).toBe(404);
      expect((await keyframes(get(`/${id}/keyframes`), ctx({ videoId: id }, p, s))).status).toBe(404);
      expect((await stream(get(`/${id}/stream`), ctx({ videoId: id }, p, s))).status).toBe(404);
      expect((await startAnalysis(jsonPost(`/${id}/analyses`, approved), ctx({ videoId: id }, p, s))).status).toBe(404);
      expect((await body(await listVideos(get(), ctx({}, p, s)))).items.find((v: { id: string }) => v.id === id)).toBeUndefined();
    }
    const frame = (await body(await keyframes(get(`/${id}/keyframes`), ctx({ videoId: id })))).items[0];
    expect((await keyframeImage(get('/x'), ctx({ videoId: id, keyframeId: frame.id }, P, 's2'))).status).toBe(404);
  }, 30_000);

  it('rejects path-traversal identifiers', async () => {
    expect((await getVideo(get('/x'), ctx({ videoId: '../../etc' }))).status).toBe(404);
    expect((await keyframeImage(get('/x'), ctx({ videoId: 'a', keyframeId: '..%2f..' }))).status).toBe(404);
  });
});

describe('Gemini limits and failure handling (SDK mocked, no live calls)', () => {
  beforeEach(() => { vi.stubEnv('GEMINI_API_KEY', 'test-key-not-real'); vi.stubEnv('ALLOW_PAID_ANALYSIS', 'true'); });

  it('requires consent and cost approval and caps maxComparisons', async () => {
    const { id } = await uploadOk();
    for (const bad of [{}, { consent: true }, { ...approved, maxComparisons: 9 }, { ...approved, extra: 1 }]) expect((await startAnalysis(jsonPost(`/${id}/analyses`, bad), ctx({ videoId: id }))).status).toBe(400);
    expect(gemini.generate).not.toHaveBeenCalled();
  }, 30_000);

  it('makes at most maxComparisons requests with the bounded request shape and labels results as gemini', async () => {
    gemini.generate.mockResolvedValue({ text: finding() });
    const { id } = await uploadOk();
    const done = await analyze(id, { maxComparisons: 1 });
    expect(gemini.generate).toHaveBeenCalledTimes(1);
    const options = gemini.ctor.mock.calls[0][0]; expect(options.httpOptions).toEqual({ timeout: 60000, retryOptions: { attempts: 1 } });
    const call = gemini.generate.mock.calls[0][0];
    expect(call.model).toBe('gemini-3.5-flash-lite'); expect(call.config.maxOutputTokens).toBe(1024);
    expect(call.config).not.toHaveProperty('thinkingConfig'); expect(call.config).not.toHaveProperty('tools');
    expect(JSON.stringify(call.config.responseJsonSchema)).not.toMatch(/minLength|maxLength|\$schema/);
    const images = call.contents[0].parts.filter((p: { inlineData?: unknown }) => p.inlineData);
    expect(images).toHaveLength(2);
    expect(done).toMatchObject({ status: 'completed', source: 'gemini', model: 'gemini-3.5-flash-lite', pairsPlanned: 1, pairsCompleted: 1, maxComparisons: 1 });
    expect(done.errors.map((e: { code: string }) => e.code)).toEqual(['comparison_limit_reached']);
    const tl = await readTimeline(id, done.id);
    expect(tl.findings).toHaveLength(1); expect(tl.findings[0]).toMatchObject({ source: 'gemini', status: 'unreviewed', severity: 'medium' });
  }, 30_000);

  it('uses the configured ceiling when no cap is requested', () => {
    expect(maxComparisons()).toBe(VIDEO_LIMITS.maxComparisonsDefault);
    vi.stubEnv('VIDEO_MAX_COMPARISONS', '2'); expect(maxComparisons()).toBe(2);
    vi.stubEnv('VIDEO_MAX_COMPARISONS', '99'); expect(maxComparisons()).toBe(VIDEO_LIMITS.maxComparisonsCeiling);
    expect(maxComparisons(3)).toBe(3);
  });

  it('stops after the first quota error instead of spending more requests', async () => {
    gemini.generate.mockRejectedValue(Object.assign(new Error('{"error":{"message":"private image detail"}}'), { status: 429 }));
    const { id } = await uploadOk();
    const done = await analyze(id);
    expect(gemini.generate).toHaveBeenCalledTimes(1);
    expect(done.status).toBe('failed'); expect(done.errors.some((e: { code: string }) => e.code === 'provider_quota')).toBe(true);
    expect(JSON.stringify(done)).not.toMatch(/private image detail|test-key-not-real/);
    expect((await readTimeline(id, done.id)).findings).toEqual([]);
  }, 30_000);

  it('records a timeout per pair, keeps going within the cap, and exposes no raw error text', async () => {
    gemini.generate.mockRejectedValue(Object.assign(new Error('Deadline expired'), { status: 504 }));
    const { id } = await uploadOk();
    const done = await analyze(id, { maxComparisons: 2 });
    expect(gemini.generate).toHaveBeenCalledTimes(2);
    expect(done).toMatchObject({ status: 'failed', pairsFailed: 2, pairsCompleted: 0 });
    expect(done.errors.filter((e: { code: string }) => e.code === 'provider_timeout')).toHaveLength(2);
  }, 30_000);

  it('keeps findings from good pairs when another pair fails (completed_with_errors)', async () => {
    gemini.generate.mockResolvedValueOnce({ text: finding() }).mockRejectedValueOnce(Object.assign(new Error('x'), { name: 'TimeoutError' }));
    const { id } = await uploadOk();
    const done = await analyze(id, { maxComparisons: 2 });
    expect(done).toMatchObject({ status: 'completed_with_errors', pairsCompleted: 1, pairsFailed: 1 });
    expect((await readTimeline(id, done.id)).findings).toHaveLength(1);
  }, 30_000);

  it('rejects malformed model output without storing findings', async () => {
    gemini.generate.mockResolvedValue({ text: '{"summary":"x","findings":[{"category":"nonsense"}]}' });
    const { id } = await uploadOk();
    const done = await analyze(id, { maxComparisons: 1 });
    expect(done.status).toBe('failed'); expect(done.errors.map((e: { code: string }) => e.code)).toContain('malformed_response');
    expect((await readTimeline(id, done.id)).findings).toEqual([]);
  }, 30_000);

  it('does not start a second paid run while one is active', async () => {
    gemini.generate.mockImplementation(() => new Promise(r => setTimeout(() => r({ text: finding() }), 300)));
    const { id } = await uploadOk();
    const [a, b] = await Promise.all([startAnalysis(jsonPost(`/${id}/analyses`, { ...approved, maxComparisons: 1 }), ctx({ videoId: id })), startAnalysis(jsonPost(`/${id}/analyses`, { ...approved, maxComparisons: 1 }), ctx({ videoId: id }))]);
    expect((await body(a)).analysis.id).toBe((await body(b)).analysis.id);
    await new Promise(r => setTimeout(r, 800));
    expect(gemini.generate).toHaveBeenCalledTimes(1);
  }, 30_000);

  it('records provider_disabled and makes no call when analysis is not enabled', async () => {
    vi.stubEnv('ALLOW_PAID_ANALYSIS', 'false');
    const { id } = await uploadOk();
    const res = await startAnalysis(jsonPost(`/${id}/analyses`, approved), ctx({ videoId: id }));
    expect((await body(res)).analysis).toMatchObject({ status: 'failed', errors: [{ code: 'provider_disabled' }] });
    expect(gemini.generate).not.toHaveBeenCalled();
  }, 30_000);

  it('classifies provider errors', () => {
    expect([429, 504, 408, 400, 403].map(status => classifyError({ status }))).toEqual(['provider_quota', 'provider_timeout', 'provider_timeout', 'provider_rejected', 'provider_rejected']);
    expect(classifyError(Object.assign(new Error('t'), { name: 'AbortError' }))).toBe('provider_timeout');
    expect(classifyError(new SyntaxError('bad'))).toBe('malformed_response');
    expect(classifyError(new Error('boom'))).toBe('internal');
  });
});
