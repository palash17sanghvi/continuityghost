import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryEnabled, memoryNamespace, rememberDecision, retrieveMemories } from './memory';

const scope = { projectId: 'project-a', sceneId: 'scene-1' };
const decision = { ...scope, id: 'finding-1', decisionId: 'decision-1', content: 'Human approved: keep the red cup.' };
const query = { ...scope, query: 'Which cup?' };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const result = (overrides = {}) => ({
  id: 'memory-1', memory: decision.content, similarity: 0.9,
  metadata: { source: 'human_decision', scope: memoryNamespace(scope.projectId, scope.sceneId), decisionId: decision.decisionId },
  isLatest: true, isInference: false, system: { updatedAt: '2026-01-15T10:30:00.000Z' }, ...overrides,
});
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.stubEnv('SUPERMEMORY_API_KEY', 'test-only-secret');
  vi.stubEnv('ALLOW_SUPERMEMORY', 'true');
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('memory namespace isolation', () => {
  it('is deterministic, opaque and API-safe', () => {
    const value = memoryNamespace('secret project / 雨', 'scene ? #');
    expect(value).toMatch(/^cg_[a-f0-9]{64}$/);
    expect(value).toBe(memoryNamespace('secret project / 雨', 'scene ? #'));
    expect(value).not.toContain('secret');
  });
  it('does not alias delimiter, project, scene, case or Unicode variants', () => {
    const pairs = [['a:b', 'c'], ['a', 'b:c'], ['a', 'c'], ['b', 'c'], ['c', 'a'], ['A', 'c'], ['é', 'c'], ['e\u0301', 'c'], [' a', 'c']];
    expect(new Set(pairs.map(([p, s]) => memoryNamespace(p, s))).size).toBe(pairs.length);
  });
  it.each([['', 's'], ['p', ''], [' ', 's']])('rejects missing scope %j %j', (p, s) => {
    expect(() => memoryNamespace(p, s)).toThrow('Invalid memory scope');
  });
});

describe('paid-call gate', () => {
  it.each([['', 'true'], ['  ', 'true'], ['test', 'false'], ['test', 'TRUE'], ['test', ''], ['test', '1']])('requires both key %j and explicit flag %j', async (key, flag) => {
    vi.stubEnv('SUPERMEMORY_API_KEY', key); vi.stubEnv('ALLOW_SUPERMEMORY', flag);
    expect(memoryEnabled()).toBe(false);
    expect(await retrieveMemories(query)).toEqual({ facts: [], status: 'disabled' });
    expect(await rememberDecision(decision)).toEqual({ id: decision.id, status: 'disabled' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('enables only when both requirements are met', () => expect(memoryEnabled()).toBe(true));
});

describe('approved decision ingestion', () => {
  it('rejects missing decision provenance without publishing', async () => {
    expect((await rememberDecision({...decision,decisionId:''})).status).toBe('unavailable');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('uses a separate document for each decision on the same finding', async () => {
    fetchMock.mockResolvedValue(json({id:'provider',status:'queued'}));
    await rememberDecision(decision);await rememberDecision({...decision,decisionId:'decision-2'});
    expect(fetchMock.mock.calls.map(([,init])=>JSON.parse(init.body).id)).toEqual(['decision-1','decision-2']);
  });
  it('posts a source document with explicit non-instant processing and scope', async () => {
    fetchMock.mockResolvedValue(json({ id: decision.id, status: 'queued' }));
    expect(await rememberDecision(decision)).toEqual({ id: decision.id, status: 'queued' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://api.supermemory.ai/ns/${memoryNamespace(scope.projectId, scope.sceneId)}/document`);
    expect(init).toMatchObject({ method: 'POST', cache: 'no-store', redirect: 'error', headers: { Authorization: `Bearer ${process.env.SUPERMEMORY_API_KEY}`, 'Content-Type': 'application/json' } });
    expect(JSON.parse(init.body)).toEqual({ id: decision.decisionId, content: decision.content, taskType: 'memory', dreaming: 'dynamic', metadata: { source: 'human_decision', scope: memoryNamespace(scope.projectId, scope.sceneId), decisionId: decision.decisionId } });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each(['unknown', 'queued', 'extracting', 'chunking', 'embedding', 'indexing', 'done', 'failed'])('preserves documented ingestion status %s', async status => {
    fetchMock.mockResolvedValue(json({ id: 'provider-id', status }));
    expect(await rememberDecision(decision)).toEqual({ id: 'provider-id', status });
  });
  it.each([{ id: 'x', status: 'success' }, { status: 'queued' }, { id: '', status: 'done' }])('rejects malformed acceptance %j', async body => {
    fetchMock.mockResolvedValue(json(body));
    expect(await rememberDecision(decision)).toMatchObject({ id: decision.id, status: 'unavailable', warning: expect.any(String) });
  });
  it.each([{ content: '' }, { id: '' }, { id: 'x'.repeat(256) }, { projectId: '' }])('rejects invalid input before transmission %j', async invalid => {
    expect(await rememberDecision({ ...decision, ...invalid })).toMatchObject({ status: 'unavailable' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('documented v5 recall boundary', () => {
  it('reads results[].memory or chunk, never legacy content, and explicitly scopes the request', async () => {
    fetchMock.mockResolvedValue(json({ results: [result(), result({ id: 'chunk-1', memory: undefined, chunk: 'Approved source passage' })], searchTime: 12 }));
    expect(await retrieveMemories(query)).toEqual({ status: 'ready', facts: [
      { id: 'memory-1', decisionId: decision.decisionId, content: decision.content, source: 'supermemory' },
      { id: 'chunk-1', decisionId: decision.decisionId, content: 'Approved source passage', source: 'supermemory' },
    ] });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://api.supermemory.ai/ns/${memoryNamespace(scope.projectId, scope.sceneId)}/search`);
    expect(JSON.parse(init.body)).toEqual({ query: query.query, searchMode: 'hybrid', limit: 10, threshold: 0.6, rerank: 'none', rewriteQuery: false, include: { documents: false, related: false, forgotten: false }, filter: { operator: 'and', operands: [ { field: 'source', operator: 'eq', value: 'human_decision' }, { field: 'scope', operator: 'eq', value: memoryNamespace(scope.projectId, scope.sceneId) } ] } });
  });
  it('returns no invented facts while dynamic ingestion has not produced matches', async () => {
    fetchMock.mockResolvedValue(json({ results: [], searchTime: 1 }));
    expect(await retrieveMemories(query)).toEqual({ facts: [], status: 'ready' });
  });
  it('omits inferred, superseded, unapproved and wrong-scope results even if provider returns them', async () => {
    fetchMock.mockResolvedValue(json({ results: [result({ isInference: true }), result({ isLatest: false }), result({ metadata: { source: 'model' } }), result({ metadata: { source: 'human_decision', scope: memoryNamespace('another-project', scope.sceneId) } })], searchTime: 1 }));
    expect(await retrieveMemories(query)).toEqual({ facts: [], status: 'ready' });
  });
  it.each([
    { results: [{ id: 'x', content: 'legacy shape' }], searchTime: 1 },
    { results: [result({ memory: undefined })], searchTime: 1 },
    { results: [result({ similarity: '0.9' })], searchTime: 1 },
    { results: [result({ system: {} })], searchTime: 1 },
    { results: [result({ metadata: undefined })], searchTime: 1 },
    { results: [result()] }, { memories: [] },
  ])('fails closed on malformed recall %j', async body => {
    fetchMock.mockResolvedValue(json(body));
    expect(await retrieveMemories(query)).toMatchObject({ facts: [], status: 'unavailable', warning: expect.any(String) });
  });
  it('does not call the provider with invalid query or scope', async () => {
    for (const invalid of [{ query: '' }, { sceneId: '' }]) expect(await retrieveMemories({ ...query, ...invalid })).toMatchObject({ facts: [], status: 'unavailable' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('uses different namespaces across projects with the same decision IDs', async () => {
    fetchMock.mockResolvedValue(json({ results: [], searchTime: 1 }));
    await retrieveMemories(query); await retrieveMemories({ ...query, projectId: 'project-b' });
    expect(fetchMock.mock.calls[0][0]).not.toBe(fetchMock.mock.calls[1][0]);
  });
});

describe('safe bounded failures', () => {
  it.each([401, 402, 403, 429, 500])('does not retry HTTP %s or expose response bodies', async status => {
    fetchMock.mockResolvedValue(json({ error: 'test-only-secret private content' }, status));
    const answer = await retrieveMemories(query);
    expect(answer).toMatchObject({ facts: [], status: 'unavailable' });
    expect(JSON.stringify(answer)).not.toMatch(/test-only-secret|private content/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('handles ingestion network failure without logging or leaking raw errors', async () => {
    const log = vi.spyOn(console, 'error'); const warn = vi.spyOn(console, 'warn');
    fetchMock.mockRejectedValue(new Error('test-only-secret private content'));
    const answer = await rememberDecision(decision);
    expect(answer).toMatchObject({ status: 'unavailable', id: decision.id });
    expect(JSON.stringify(answer)).not.toMatch(/test-only-secret|private content/);
    expect(log).not.toHaveBeenCalled(); expect(warn).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('rejects invalid JSON', async () => {
    fetchMock.mockResolvedValue(new Response('not JSON'));
    expect(await retrieveMemories(query)).toMatchObject({ facts: [], status: 'unavailable' });
  });
  it.each(['read', 'write'])('aborts %s after a finite 8-second timeout without retry', async operation => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    fetchMock.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      signal = init.signal;
      signal!.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }));
    const pending = operation === 'read' ? retrieveMemories(query) : rememberDecision(decision);
    await vi.advanceTimersByTimeAsync(8000);
    expect(await pending).toMatchObject({ status: 'unavailable' });
    expect(signal?.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
