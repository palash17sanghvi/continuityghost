import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { VideoRecord } from './video-contract';
const boundary = vi.hoisted(() => ({ enabled: false, transaction: vi.fn(), memoryEnabled: false, remember: vi.fn(), retrieve: vi.fn() }));
vi.mock('./database', () => ({ databaseEnabled: () => boundary.enabled, databaseTransaction: boundary.transaction }));
vi.mock('./memory', () => ({ memoryEnabled: () => boundary.memoryEnabled, rememberDecision: boundary.remember, retrieveMemories: boundary.retrieve }));
let directory: string;
let inputDirectory: string;
let record: VideoRecord;
async function store() { return import('./video-store'); }
function review(status: 'confirmed' | 'dismissed' | 'intentional' = 'confirmed') {
  return { analysisId: record.analysisId, findingId: record.findings[0].id, projectId: record.projectId, sceneId: record.sceneId, status, note: 'Keep the cup on the table.', consent: false };
}
beforeEach(async () => {
  vi.resetModules(); vi.clearAllMocks();
  boundary.enabled = false; boundary.memoryEnabled = false;
  directory = await mkdtemp(path.join(process.env.TMPDIR || process.cwd(), 'cg-video-'));
  vi.stubEnv('CONTINUITY_DATA_DIR', path.join(directory, 'data'));
  inputDirectory = path.join(directory, 'pipeline'); await mkdir(inputDirectory);
  await writeFile(path.join(inputDirectory, 'clip'), '0123456789');
  await writeFile(path.join(inputDirectory, 'frame-000.jpg'), 'jpeg-one');
  await writeFile(path.join(inputDirectory, 'frame-001.jpg'), 'jpeg-two');
  record = { analysisId: randomUUID(), projectId: 'project', sceneId: 'scene', clipName: 'shot.mp4', mimeType: 'video/mp4', duration: 10,
    createdAt: new Date().toISOString(), summary: 'Cup continuity check',
    frames: [{ id: 'frame-000', timeSeconds: 0, shotId: 0 }, { id: 'frame-001', timeSeconds: 5, shotId: 1 }],
    pairs: [{ id: 'pair-000', referenceFrameId: 'frame-000', candidateFrameId: 'frame-001', score: 0.8 }],
    findings: [{ id: randomUUID(), pairId: 'pair-000', category: 'props', description: 'Cup is absent', referenceEvidence: 'White cup on table',
      candidateEvidence: 'Empty table beside actor', uncertainty: 'May be intentional', suggestedAction: 'Check prop continuity', status: 'unreviewed' }] };
});
afterEach(async () => { await rm(directory, { recursive: true, force: true }); vi.unstubAllEnvs(); });
describe('durable video store (offline)', () => {
  it('survives module reload and pipeline cleanup with retained media and scoped history', async () => {
    const initial = await store();
    expect(await initial.saveVideo(record, inputDirectory)).toMatchObject({ mode: 'local', warning: expect.stringContaining('server only') });
    await rm(inputDirectory, { recursive: true }); vi.resetModules();
    const reloaded = await store();
    expect((await reloaded.getVideo(record.analysisId))?.findings).toEqual(record.findings);
    expect(await reloaded.listVideos('project', 'scene')).toHaveLength(1);
    expect(await reloaded.listVideos('project', 'other-scene')).toEqual([]);
    expect(await readFile((await reloaded.getVideoMedia(record.analysisId, null)).file, 'utf8')).toBe('0123456789');
    expect(await readFile((await reloaded.getVideoMedia(record.analysisId, 'frame-000')).file, 'utf8')).toBe('jpeg-one');
    expect(boundary.transaction).not.toHaveBeenCalled(); expect(boundary.remember).not.toHaveBeenCalled(); expect(boundary.retrieve).not.toHaveBeenCalled();
  });
  it('writes reviews atomically, records timestamps, retires dismissed rules, and serializes concurrent writes', async () => {
    const current = await store(); await current.saveVideo(record, inputDirectory);
    expect(await current.loadVideoRules('project', 'scene', 'cup', false)).toMatchObject({ status: 'ready', facts: [] });
    await Promise.all([current.reviewVideo(review('confirmed')), current.reviewVideo(review('intentional'))]);
    vi.resetModules(); const reloaded = await store();
    expect((await reloaded.getVideo(record.analysisId))?.findings[0]).toMatchObject({ status: expect.stringMatching(/^(confirmed|intentional)$/), note: 'Keep the cup on the table.' });
    expect((await reloaded.loadVideoRules('project', 'scene', 'cup', false)).facts).toHaveLength(1);
    expect((await reloaded.loadVideoRules('project', 'another', 'cup', true)).facts).toEqual([]);
    const saved = JSON.parse(await readFile(path.join(directory, 'data', 'videos', record.analysisId, 'analysis.json'), 'utf8'));
    expect(saved.decisions).toHaveLength(2);
    expect(saved.decisions.map((d: { status: string }) => d.status).sort()).toEqual(['confirmed','intentional']);
    expect((await reloaded.getVideo(record.analysisId))?.findings[0].status).toBe(saved.decisions.at(-1).status);
    expect(saved.decisions.map((d: { revision: number }) => d.revision)).toEqual([2, 3]);
    expect(saved.decisions[0].createdAt).toMatch(/^\d{4}-/);
    await reloaded.reviewVideo(review('dismissed'));
    expect((await reloaded.loadVideoRules('project', 'scene', 'cup', false)).facts).toEqual([]);
    expect(boundary.remember).not.toHaveBeenCalled();
  });
  it('rejects wrong scope, unknown finding, unsafe IDs, path traversal, and duplicate saves', async () => {
    const current = await store(); await current.saveVideo(record, inputDirectory);
    await expect(current.reviewVideo({ ...review(), projectId: 'other' })).rejects.toMatchObject({ status: 404 });
    await expect(current.reviewVideo({ ...review(), findingId: randomUUID() })).rejects.toMatchObject({ status: 404 });
    await expect(current.getVideo('../secret')).rejects.toMatchObject({ status: 400 });
    for (const id of ['../clip', '..%2fclip', 'frame-000.jpg', 'frame-999']) await expect(current.getVideoMedia(record.analysisId, id)).rejects.toMatchObject({ status: 404 });
    await expect(current.saveVideo(record, inputDirectory)).rejects.toMatchObject({ status: 409 });
    await expect(current.saveVideo({ ...record, analysisId: randomUUID(), frames: [{ ...record.frames[0], id: '../escape' }, record.frames[1]] }, inputDirectory)).rejects.toThrow();
    expect((await current.getVideo(record.analysisId))?.findings[0].status).toBe('unreviewed');
  });
  it('retains local data and reports failed remote persistence without claiming postgres saved', async () => {
    const current = await store(); boundary.enabled = true;
    boundary.transaction.mockRejectedValue(new Error('database offline'));
    expect(await current.saveVideo(record, inputDirectory)).toMatchObject({ mode: 'local', warning: expect.stringContaining('not confirmed remotely') });
    expect(await current.reviewVideo(review())).toMatchObject({ persisted: true, persistence: { mode: 'local' } });
    vi.resetModules(); const reloaded = await store();
    expect((await reloaded.getVideo(record.analysisId))?.findings[0].status).toBe('confirmed');
    expect((await reloaded.loadVideoRules('project', 'scene', 'cup', false)).facts).toHaveLength(1);
  });
  it('uses the existing guarded database transaction and reads approved still rules without remote consent', async () => {
    let saved: unknown;
    const query = vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes('INSERT INTO video_analyses')) saved = JSON.parse(params![5] as string);
      if (sql.includes('SELECT document FROM video_analyses WHERE id=')) return { rows: saved ? [{ document: saved }] : [], rowCount: saved ? 1 : 0 };
      if (sql.includes('FROM continuity_rules')) return { rows: [{ decisionId: 'still-decision', content: 'Canonical approved still-image evidence.' }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    boundary.transaction.mockImplementation(async work => work({ query })); boundary.enabled = true;
    const current = await store();
    expect(await current.saveVideo(record, inputDirectory)).toEqual({ mode: 'postgres' });
    expect(await current.reviewVideo(review())).toMatchObject({ persisted: true, persistence: { mode: 'postgres' } });
    const result = await current.loadVideoRules('project', 'scene', 'cup', false);
    expect(result.facts).toHaveLength(2);
    expect(result.facts).toContainEqual({ id: 'still-decision', content: 'Canonical approved still-image evidence.' });
    const rules = query.mock.calls.find(([sql]) => sql.includes('FROM continuity_rules'))!;
    expect(rules[0]).toContain("d.status IN ('confirmed','intentional')");
    expect(rules[0]).toContain('r.active=true');
    expect(query).toHaveBeenCalledWith(expect.stringContaining('FROM continuity_rules'), ['project', 'scene']);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO video_review_decisions'), expect.arrayContaining(['confirmed', 'Keep the cup on the table.']));
    expect(boundary.remember).not.toHaveBeenCalled(); expect(boundary.retrieve).not.toHaveBeenCalled();
  });
  it('requires explicit consent and memory enablement and reconciles only current scoped decisions', async () => {
    const current = await store(); await current.saveVideo(record, inputDirectory); boundary.memoryEnabled = true;
    await current.reviewVideo(review()); expect(boundary.remember).not.toHaveBeenCalled();
    boundary.remember.mockResolvedValue({ status: 'queued' });
    await current.reviewVideo({ ...review('intentional'), consent: true });
    expect(boundary.remember).toHaveBeenCalledTimes(1);
    const approved = boundary.remember.mock.calls[0][0];
    expect(approved.id).toBe(approved.decisionId); expect(approved.content).toContain('White cup on table');
    boundary.retrieve.mockResolvedValue({ status: 'ready', facts: [
      { id: 'evil', decisionId: randomUUID(), content: 'Cross-scene rule', source: 'supermemory' },
      { id: 'valid', decisionId: approved.decisionId, content: 'Untrusted paraphrase', source: 'supermemory' },
    ] });
    const result = await current.loadVideoRules('project', 'scene', 'cup', true);
    expect(result.facts).toEqual([{ id: approved.decisionId, content: approved.content }]);
    await current.reviewVideo({ ...review('dismissed'), consent: true });
    expect((await current.loadVideoRules('project', 'scene', 'cup', true)).facts).toEqual([]);
    expect(boundary.remember).toHaveBeenCalledTimes(1);
  });
  it('survives optional memory failures without losing approved decisions', async () => {
    const current = await store(); await current.saveVideo(record, inputDirectory);
    boundary.memoryEnabled = true; boundary.remember.mockRejectedValue(new Error('remote unavailable'));
    const result = await current.reviewVideo({ ...review(), consent: true });
    expect(result).toMatchObject({ persisted: true, memory: { status: 'unavailable' } });
    boundary.retrieve.mockRejectedValue(new Error('remote unavailable'));
    expect(await current.loadVideoRules('project', 'scene', 'cup', true)).toMatchObject({ status: 'ready', facts: [expect.anything()], warning: expect.any(String) });
  });
  it('does not publish incomplete media or overwrite corrupt durable documents', async () => {
    const current = await store(); await rm(path.join(inputDirectory, 'frame-001.jpg'));
    await expect(current.saveVideo(record, inputDirectory)).rejects.toThrow();
    expect(await current.getVideo(record.analysisId)).toBeNull();
    await writeFile(path.join(inputDirectory, 'frame-001.jpg'), 'jpeg-two'); await current.saveVideo(record, inputDirectory);
    await writeFile(path.join(directory, 'data', 'videos', record.analysisId, 'analysis.json'), '{broken');
    await expect(current.reviewVideo(review())).rejects.toThrow();
    await expect(current.saveVideo(record, inputDirectory)).rejects.toThrow();
  });
});
