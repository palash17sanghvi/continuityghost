import { afterEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ query: vi.fn(), release: vi.fn(), options: vi.fn() }));
vi.mock('pg', () => ({ Pool: class { constructor(options: unknown) { mock.options(options); } async connect() { return { query: mock.query, release: mock.release }; } async end() {} } }));
import { createProject, getProject, getAnalysis, listAnalyses, ResourceError } from './resources';
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe('resource boundaries', () => {
  it('rejects bad input before SQL', async () => {
    await expect(createProject({ id: '', name: 'Project' })).rejects.toMatchObject({ status: 400 });
    await expect(listAnalyses('p', 's', { limit: 101 })).rejects.toMatchObject({ status: 400 });
    await expect(listAnalyses('p', 's', { offset: -1 })).rejects.toMatchObject({ status: 400 });
    expect(mock.query).not.toHaveBeenCalled();
  });
  it('fails closed when persistence is disabled', async () => {
    vi.stubEnv('ALLOW_DATABASE', 'false');
    await expect(getProject('p')).rejects.toMatchObject({ status: 503 });
  });
  it('restores optional persisted severity, confidence and actual memory provenance', async () => {
    vi.stubEnv('ALLOW_DATABASE', 'true'); vi.stubEnv('DATABASE_URL', 'postgres://localhost/resources-restore');
    const memory = { status: 'ready', facts: [{ id: 'm', content: 'Cup belongs on table', source: 'supermemory', decisionId: 'd' }] };
    const confidence = { level: 'medium', reason: 'Partial occlusion' };
    mock.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM analyses')) return { rows: [{ id: 'a', project_id: 'p', scene_id: 's', summary: 'Summary', status: 'completed', started_at: new Date(0), completed_at: new Date(1), memory_context: memory }] };
      if (sql.includes('FROM findings')) return { rows: [{ id: 'f', severity: 'high', confidence }] };
      return { rows: [] };
    });
    expect(await getAnalysis('p', 's', 'a')).toMatchObject({ memory, findings: [{ severity: 'high', confidence }] });
  });
  it('bounds pool and transaction reads and releases after rollback', async () => {
    vi.stubEnv('ALLOW_DATABASE', 'true'); vi.stubEnv('DATABASE_URL', 'postgres://localhost/resources-unit');
    mock.query.mockImplementation(async (sql: string) => {
      if (sql.startsWith('SELECT')) throw new Error('private connection details');
      return { rows: [] };
    });
    await expect(getProject("p' OR true--")).rejects.toMatchObject({ status: 503 });
    expect(mock.options).toHaveBeenCalledWith(expect.objectContaining({ max: 5, connectionTimeoutMillis: 2000, query_timeout: 1500, statement_timeout: 1500 }));
    expect(mock.query).toHaveBeenCalledWith(expect.stringContaining('READ ONLY'));
    expect(mock.query).toHaveBeenCalledWith(expect.stringContaining('statement_timeout'));
    expect(mock.query).toHaveBeenCalledWith(expect.stringContaining('WHERE id=$1'), ["p' OR true--"]);
    expect(mock.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mock.release).toHaveBeenCalled();
    expect(new ResourceError(404, 'Missing').status).toBe(404);
  });
});
