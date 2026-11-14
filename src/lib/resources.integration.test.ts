import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const boundary = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('pg', () => ({ Pool: class { async connect() { return { query: boundary.query, release() {} }; } async end() {} } }));
import { createProject, listProjects, getProject, createScene, listScenes, getScene, listAnalyses, getAnalysis, listFindings, getActiveRules, getEvents } from './resources';
import { persistAnalysis, persistReview } from './database';
const db = new PGlite();
const finding = { id: 'f', category: 'props' as const, description: 'Cup absent', referenceEvidence: 'Cup on table', candidateEvidence: 'No cup', uncertainty: 'Maybe intended', suggestedAction: 'Check script', status: 'unreviewed' as const };
beforeAll(async () => {
  vi.stubEnv('ALLOW_DATABASE', 'true'); vi.stubEnv('DATABASE_URL', 'postgres://localhost/resources-integration-only');
  boundary.query.mockImplementation((sql: string, params?: unknown[]) => db.query(sql, params));
  for (const name of (await readdir(new URL('../../migrations/', import.meta.url))).filter(name => name.endsWith('.sql')).sort()) await db.exec(await readFile(new URL(`../../migrations/${name}`, import.meta.url), 'utf8'));
}, 30000);
afterAll(async () => { await db.close(); vi.unstubAllEnvs(); });
describe('real SQL resource persistence', () => {
  it('creates named resources, rejects duplicates and requires existing exact parents', async () => {
    const project = await createProject({ id: 'p', name: 'Production' });
    expect(project).toEqual({ id: 'p', name: 'Production', createdAt: expect.any(String) });
    expect(await getProject('p')).toEqual(project);
    await expect(createProject({ id: 'p', name: 'Overwrite' })).rejects.toMatchObject({ status: 409 });
    await expect(createScene({ projectId: 'missing', id: 's', name: 'Scene' })).rejects.toMatchObject({ status: 404 });
    const scene = await createScene({ projectId: 'p', id: 's', name: 'Opening' });
    expect(scene).toEqual({ id: 's', projectId: 'p', name: 'Opening', createdAt: expect.any(String) });
    expect(await getScene('p', 's')).toEqual(scene);
    await expect(createScene({ projectId: 'p', id: 's', name: 'Again' })).rejects.toMatchObject({ status: 409 });
    expect(await listProjects()).toMatchObject({ items: [project], total: 1, limit: 50, offset: 0 });
    expect(await listScenes('p')).toMatchObject({ items: [scene], total: 1 });
  });
  it('exports full canonical evidence, current status, notes and decision history without fabricated memory', async () => {
    await persistAnalysis({ projectId: 'p', sceneId: 's', analysisId: 'a', summary: 'Check continuity', findings: [finding] }, new Date());
    const scope = { projectId: 'p', sceneId: 's', analysisId: 'a', findingId: 'f' };
    const first = await persistReview({ ...scope, status: 'confirmed', note: 'Reset cup' });
    // Ensure deterministic chronology independent of clock granularity.
    await db.query("UPDATE review_decisions SET created_at=created_at-interval '1 second' WHERE id=$1", [first.decisionId]);
    const second = await persistReview({ ...scope, status: 'intentional', note: 'Script exception' });
    const analysis = await getAnalysis('p', 's', 'a');
    expect(analysis).toMatchObject({ analysisId: 'a', projectId: 'p', sceneId: 's', summary: 'Check continuity', status: 'completed', startedAt: expect.any(String), completedAt: expect.any(String) });
    expect(analysis.findings[0]).toMatchObject({ ...finding, status: 'intentional', note: 'Script exception' });
    expect(analysis.decisions.map(d => d.id)).toEqual([first.decisionId, second.decisionId]);
    expect(analysis.decisions.map(d => d.note)).toEqual(['Reset cup', 'Script exception']);
    expect(analysis).not.toHaveProperty('memory');
    expect((await listFindings('p', 's', 'a')).items).toEqual(analysis.findings);
    expect((await getActiveRules('p', 's')).items).toMatchObject([{ decisionId: second.decisionId, content: second.content, active: true }]);
    expect((await listAnalyses('p', 's')).items).toEqual([analysis]);
  });
  it('isolates reused ids across projects and scenes and counts out-of-range pages', async () => {
    await createProject({ id: 'q', name: 'Other' });
    await createScene({ projectId: 'p', id: 'other', name: 'Other scene' });
    for (const [projectId, sceneId] of [['q', 's'], ['p', 'other']]) await persistAnalysis({ projectId, sceneId, analysisId: 'a', summary: `${projectId}/${sceneId}`, findings: [finding] }, new Date());
    expect((await getAnalysis('q', 's', 'a')).summary).toBe('q/s');
    expect((await getAnalysis('p', 'other', 'a')).findings[0].status).toBe('unreviewed');
    expect((await getActiveRules('q', 's')).items).toEqual([]);
    expect(await listAnalyses('p', 's', { limit: 1, offset: 100 })).toEqual({ items: [], total: 1, limit: 1, offset: 100 });
    const events = await getEvents('p', { sceneId: 's', limit: 1 });
    expect(events.total).toBe(5); expect(events.items).toHaveLength(1);
    expect(events.items[0]).toMatchObject({ projectId: 'p', sceneId: 's', analysisId: 'a', eventType: expect.any(String), occurredAt: expect.any(String) });
    expect(await getEvents('p', { sceneId: 's', offset: 100 })).toMatchObject({ items: [], total: 5 });
    expect((await getEvents('p')).total).toBe(8);
    for (const op of [getProject('missing'), getScene('q', 'other'), listScenes('missing'), listAnalyses('q', 'other'), getAnalysis('q', 's', 'missing'), listFindings('q', 'other', 'a'), getActiveRules('q', 'other'), getEvents('p', { sceneId: 'missing' })]) await expect(op).rejects.toMatchObject({ status: 404 });
    await expect(getProject("p' OR true--")).rejects.toMatchObject({ status: 404 });
  });
  it('round-trips persisted optional evidence and actual retrieval provenance through real SQL', async () => {
    const confidence = { level: 'medium', reason: 'Partially obscured' };
    const memory = { status: 'ready', facts: [{ id: 'saved-hit', content: 'Canonical cup', source: 'supermemory', decisionId: 'saved-decision' }] };
    await db.query('UPDATE findings SET severity=$1,confidence=$2 WHERE project_id=$3 AND scene_id=$4 AND analysis_id=$5', ['high', JSON.stringify(confidence), 'q', 's', 'a']);
    await db.query('UPDATE analyses SET memory_context=$1 WHERE project_id=$2 AND scene_id=$3 AND id=$4', [JSON.stringify(memory), 'q', 's', 'a']);
    const restored = await getAnalysis('q', 's', 'a');
    expect(restored.memory).toEqual(memory);
    expect(restored.findings[0]).toMatchObject({ severity: 'high', confidence });
    expect((await listAnalyses('q', 's')).items[0]).toEqual(restored);
    expect((await listFindings('q', 's', 'a')).items).toEqual(restored.findings);
  });
  it('keeps defaults compatible with legacy analysis writes', async () => {
    expect(await getProject('q')).toMatchObject({ name: 'Other' });
    expect(await getScene('q', 's')).toMatchObject({ name: 'Untitled scene' });
  });
});
