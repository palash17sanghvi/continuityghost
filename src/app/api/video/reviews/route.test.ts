import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
const boundary = vi.hoisted(() => ({ database: vi.fn(), remember: vi.fn() }));
vi.mock('../../../../lib/database', () => ({ databaseEnabled: () => false, databaseTransaction: boundary.database }));
vi.mock('../../../../lib/memory', () => ({ memoryEnabled: () => false, rememberDecision: boundary.remember, retrieveMemories: vi.fn() }));
import { saveVideo, getVideo } from '../../../../lib/video-store';
import { POST } from './route';
import { GET as history } from '../history/route';
import { GET as detail } from '../[analysisId]/route';
import { GET as media } from '../[analysisId]/media/route';
let directory: string;
const analysisId = randomUUID(), findingId = randomUUID();
const record = { analysisId, projectId: 'p', sceneId: 's', clipName: 'clip.mp4', mimeType: 'video/mp4' as const, duration: 5,
  createdAt: new Date().toISOString(), summary: 'Review cup',
  frames: [{ id: 'frame-000', timeSeconds: 0, shotId: 0 }, { id: 'frame-001', timeSeconds: 2, shotId: 1 }],
  pairs: [{ id: 'pair-000', referenceFrameId: 'frame-000', candidateFrameId: 'frame-001', score: 0.5 }],
  findings: [{ id: findingId, pairId: 'pair-000', category: 'props' as const, description: 'Cup missing', referenceEvidence: 'Cup on table', candidateEvidence: 'Table empty', uncertainty: 'May be intended', suggestedAction: 'Check script', status: 'unreviewed' as const }] };
const payload = { analysisId, findingId, projectId: 'p', sceneId: 's', status: 'confirmed', note: 'Keep cup', consent: false };
const context = { params: Promise.resolve({ analysisId }) };
function request(value: unknown = payload, origin = 'http://localhost:3000') { return new Request('http://localhost:3000/api/video/reviews', { method: 'POST', headers: { 'Content-Type': 'application/json', origin }, body: JSON.stringify(value) }); }
beforeEach(async () => {
  vi.clearAllMocks(); directory = await mkdtemp(path.join(process.env.TMPDIR || process.cwd(), 'cg-video-api-'));
  vi.stubEnv('CONTINUITY_DATA_DIR', path.join(directory, 'data'));
  const source = path.join(directory, 'source'); await mkdir(source);
  await Promise.all(['clip', 'frame-000.jpg', 'frame-001.jpg'].map(name => writeFile(path.join(source, name), '0123456789')));
  await saveVideo(record, source);
});
afterEach(async () => { await rm(directory, { recursive: true, force: true }); vi.unstubAllEnvs(); });
describe('video HTTP persistence (offline)', () => {
  it('persists scoped review, returns analysis and reload-safe detail/history', async () => {
    const response = await POST(request()); expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ persisted: true, persistence: { mode: 'local' }, memory: { status: 'disabled' }, analysis: { findings: [{ id: findingId, status: 'confirmed', note: 'Keep cup' }] } });
    expect(await (await detail(new Request('http://localhost/api/video/' + analysisId), context)).json()).toMatchObject({ analysisId, findings: [{ status: 'confirmed' }] });
    expect(await (await history(new Request('http://localhost/api/video/history?projectId=p&sceneId=s'))).json()).toMatchObject({ analyses: [{ analysisId }] });
    expect(await (await history(new Request('http://localhost/api/video/history?projectId=p&sceneId=other'))).json()).toEqual({ analyses: [] });
    expect(boundary.database).not.toHaveBeenCalled(); expect(boundary.remember).not.toHaveBeenCalled();
  });
  it('rejects cross origin, malformed JSON, oversized input, missing consent, wrong scopes and invalid IDs', async () => {
    expect((await POST(request(payload, 'https://evil.test'))).status).toBe(403);
    expect((await POST(new Request('http://localhost/api/video/reviews', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' }))).status).toBe(400);
    expect((await POST(request({ ...payload, note: 'x'.repeat(24001) }))).status).toBe(413);
    expect((await POST(request({ ...payload, consent: undefined }))).status).toBe(400);
    expect((await POST(request({ ...payload, status: 'approved' }))).status).toBe(400);
    expect((await POST(request({ ...payload, projectId: 'other' }))).status).toBe(404);
    expect((await POST(request({ ...payload, analysisId: '../file' }))).status).toBe(400);
    expect((await getVideo(analysisId))?.findings[0].status).toBe('unreviewed');
  });
  it('streams full media, byte ranges, suffixes and keyframes after pipeline cleanup', async () => {
    await rm(path.join(directory, 'source'), { recursive: true });
    const full = await media(new Request('http://localhost/api/video/media'), context);
    expect(full.status).toBe(200); expect(full.headers.get('Content-Type')).toBe('video/mp4'); expect(await full.text()).toBe('0123456789');
    for (const [range, content, contentRange] of [['bytes=2-5', '2345', 'bytes 2-5/10'], ['bytes=-3', '789', 'bytes 7-9/10'], ['bytes=7-', '789', 'bytes 7-9/10']]) {
      const response = await media(new Request('http://localhost/api/video/media', { headers: { Range: range } }), context);
      expect(response.status).toBe(206); expect(response.headers.get('Content-Range')).toBe(contentRange); expect(await response.text()).toBe(content);
    }
    const frame = await media(new Request('http://localhost/api/video/media?frameId=frame-000'), context);
    expect(frame.headers.get('Content-Type')).toBe('image/jpeg'); expect(await frame.text()).toBe('0123456789');
    for (const range of ['bytes=99-', 'bytes=5-2', 'bytes=-0', 'bytes=0-1,3-4', 'invalid']) expect((await media(new Request('http://localhost/api/video/media', { headers: { Range: range } }), context)).status).toBe(416);
    expect((await media(new Request('http://localhost/api/video/media?frameId=..%2Fclip'), context)).status).toBe(404);
  });
  it('reports invalid/missing detail and bad history scope', async () => {
    expect((await detail(new Request('http://localhost/api/video/x'), { params: Promise.resolve({ analysisId: '../x' }) })).status).toBe(400);
    expect((await detail(new Request('http://localhost/api/video/x'), { params: Promise.resolve({ analysisId: randomUUID() }) })).status).toBe(404);
    expect((await history(new Request('http://localhost/api/video/history'))).status).toBe(400);
  });
});
