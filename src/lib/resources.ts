import { type Pool, type PoolClient, type QueryResultRow } from 'pg';
import { z } from 'zod';
import { createPool } from './pool';
import type { StoredAnalysis } from './database';

export class ResourceError extends Error {
  constructor(public readonly status: number, message: string) { super(message); this.name = 'ResourceError'; }
}
const identifier = z.string().trim().min(1).max(200);
const name = z.string().trim().min(1).max(200);
const pagination = z.object({ limit: z.number().int().min(1).max(100).default(50), offset: z.number().int().min(0).max(2147483647).default(0) });
export type Pagination = { limit?: number; offset?: number };
export type Page<T> = { items: T[]; total: number; limit: number; offset: number };
export type Project = { id: string; name: string; createdAt: string };
export type Scene = Project & { projectId: string };
export type Decision = { id: string; projectId: string; sceneId: string; analysisId: string; findingId: string; status: 'confirmed' | 'dismissed' | 'intentional'; note: string; createdAt: string };
export type Finding = StoredAnalysis['findings'][number] & { projectId: string; sceneId: string; analysisId: string; detectedAt: string; note: string; decisions: Decision[]; severity?: unknown; confidence?: unknown };
export type Analysis = { analysisId: string; projectId: string; sceneId: string; summary: string; status: 'completed' | 'failed'; startedAt: string; completedAt: string; findings: Finding[]; decisions: Decision[]; memory?: unknown };
export type ActiveRule = { id: string; projectId: string; sceneId: string; analysisId: string; findingId: string; decisionId: string; content: string; createdAt: string; active: boolean };
export type ResourceEvent = { id: string; projectId: string; sceneId: string; analysisId: string; findingId: string | null; eventType: string; occurredAt: string; payload: unknown };
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ResourceError(400, 'Invalid resource input.');
  return result.data;
}
let pool: Pool | undefined;
let poolUrl: string | undefined;
function getPool() {
  if (process.env.ALLOW_DATABASE !== 'true' || !process.env.DATABASE_URL?.trim()) throw new ResourceError(503, 'Persistence unavailable.');
  const url = process.env.DATABASE_URL;
  if (!pool || poolUrl !== url) {
    if (pool) void pool.end().catch(() => {});
    pool = createPool({ connectionString: url, max: 5, connectionTimeoutMillis: 2000, query_timeout: 1500, statement_timeout: 1500 });
    poolUrl = url;
  }
  return pool;
}
async function transaction<T>(readOnly: boolean, work: (client: PoolClient) => Promise<T>): Promise<T> {
  let client: PoolClient | undefined;
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let released = false;
  const release = (destroy = false) => { if (client && !released) { released = true; client.release(destroy); } };
  try {
    const execution = (async () => {
      const acquired = await getPool().connect();
      if (expired) { acquired.release(true); throw new Error('Resource deadline exceeded.'); }
      client = acquired;
      const guarded = new Proxy(acquired, { get(target, key) {
        if (key === 'query') return (...args: unknown[]) => expired ? Promise.reject(new Error('Resource deadline exceeded.')) : Reflect.apply(target.query, target, args);
        return Reflect.get(target, key, target);
      } });
      try {
        await guarded.query(readOnly ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN');
        await guarded.query("SET LOCAL statement_timeout = '1500ms'");
        await guarded.query("SET LOCAL idle_in_transaction_session_timeout = '3000ms'");
        const result = await work(guarded);
        await guarded.query('COMMIT');
        return result;
      } catch (error) {
        if (!expired) { try { await guarded.query('ROLLBACK'); } catch { release(true); } }
        throw error;
      } finally { release(); }
    })();
    return await Promise.race([execution, new Promise<never>((_, reject) => {
      timer = setTimeout(() => { expired = true; release(true); reject(new Error('Resource deadline exceeded.')); }, 8000);
    })]);
  } catch (error) {
    if (error instanceof ResourceError) throw error;
    const code = (error as { code?: string }).code;
    if (code === '23505') throw new ResourceError(409, 'Resource already exists.');
    if (code === '23503') throw new ResourceError(404, 'Parent resource not found.');
    throw new ResourceError(503, 'Persistence unavailable.');
  } finally { clearTimeout(timer); }
}
function camel<T>(row: QueryResultRow): T {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()), value instanceof Date ? value.toISOString() : value])) as T;
}
async function requireProject(client: PoolClient, projectId: string): Promise<Project> {
  const { rows } = await client.query('SELECT * FROM projects WHERE id=$1', [projectId]);
  if (!rows[0]) throw new ResourceError(404, 'Project not found.');
  return camel<Project>(rows[0]);
}
async function requireScene(client: PoolClient, projectId: string, sceneId: string): Promise<Scene> {
  const { rows } = await client.query('SELECT * FROM scenes WHERE project_id=$1 AND id=$2', [projectId, sceneId]);
  if (!rows[0]) throw new ResourceError(404, 'Scene not found.');
  return camel<Scene>(rows[0]);
}
function scope(projectId: string, sceneId: string, analysisId?: string) {
  return parse(z.object({ projectId: identifier, sceneId: identifier, analysisId: identifier.optional() }), { projectId, sceneId, analysisId });
}
function page<T>(items: T[], total: number, options: { limit: number; offset: number }): Page<T> { return { items, total, ...options }; }
// Collections share bounded pagination; totals come from the full scoped result.
export async function createProject(input: { id: string; name: string }): Promise<Project> {
  const data = parse(z.object({ id: identifier, name }), input);
  return transaction(false, async c => camel<Project>((await c.query('INSERT INTO projects (id,name) VALUES ($1,$2) RETURNING *', [data.id, data.name])).rows[0]));
}
export async function getProject(projectId: string): Promise<Project> {
  const id = parse(identifier, projectId); return transaction(true, c => requireProject(c, id));
}
export async function listProjects(options: Pagination = {}): Promise<Page<Project>> {
  const p = parse(pagination, options);
  return transaction(true, async c => {
    const total = Number((await c.query('SELECT count(*) AS total FROM projects')).rows[0].total);
    const rows = (await c.query('SELECT * FROM projects ORDER BY created_at DESC,id LIMIT $1 OFFSET $2', [p.limit, p.offset])).rows;
    return page(rows.map(r => camel<Project>(r)), total, p);
  });
}
export async function createScene(input: { projectId: string; id: string; name: string }): Promise<Scene> {
  const data = parse(z.object({ projectId: identifier, id: identifier, name }), input);
  return transaction(false, async c => {
    await requireProject(c, data.projectId);
    return camel<Scene>((await c.query('INSERT INTO scenes (project_id,id,name) VALUES ($1,$2,$3) RETURNING *', [data.projectId, data.id, data.name])).rows[0]);
  });
}
export async function getScene(projectId: string, sceneId: string): Promise<Scene> {
  const s = scope(projectId, sceneId); return transaction(true, c => requireScene(c, s.projectId, s.sceneId));
}
export async function listScenes(projectId: string, options: Pagination = {}): Promise<Page<Scene>> {
  const id = parse(identifier, projectId); const p = parse(pagination, options);
  return transaction(true, async c => {
    await requireProject(c, id);
    const total = Number((await c.query('SELECT count(*) AS total FROM scenes WHERE project_id=$1', [id])).rows[0].total);
    const rows = (await c.query('SELECT * FROM scenes WHERE project_id=$1 ORDER BY created_at DESC,id LIMIT $2 OFFSET $3', [id, p.limit, p.offset])).rows;
    return page(rows.map(r => camel<Scene>(r)), total, p);
  });
}
async function hydrate(client: PoolClient, row: QueryResultRow): Promise<Analysis> {
  const params = [row.project_id, row.scene_id, row.id];
  const decisions = (await client.query('SELECT * FROM review_decisions WHERE project_id=$1 AND scene_id=$2 AND analysis_id=$3 ORDER BY created_at,id', params)).rows.map(r => camel<Decision>(r));
  const findings = (await client.query('SELECT * FROM findings WHERE project_id=$1 AND scene_id=$2 AND analysis_id=$3 ORDER BY detected_at,id', params)).rows.map(r => {
    const history = decisions.filter(d => d.findingId === r.id);
    return { ...camel<Finding>(r), note: history.at(-1)?.note ?? '', decisions: history };
  });
  const { id, memory_context, ...rest } = row;
  return { ...camel<Omit<Analysis, 'analysisId' | 'findings' | 'decisions'>>(rest), analysisId: id, findings, decisions, ...(memory_context == null ? {} : { memory: memory_context }) };
}
async function requireAnalysis(c: PoolClient, projectId: string, sceneId: string, analysisId: string): Promise<Analysis> {
  const row = (await c.query('SELECT * FROM analyses WHERE project_id=$1 AND scene_id=$2 AND id=$3', [projectId, sceneId, analysisId])).rows[0];
  if (!row) throw new ResourceError(404, 'Analysis not found.');
  return hydrate(c, row);
}
export async function getAnalysis(projectId: string, sceneId: string, analysisId: string): Promise<Analysis> {
  const s = scope(projectId, sceneId); const id = parse(identifier, analysisId);
  return transaction(true, c => requireAnalysis(c, s.projectId, s.sceneId, id));
}
export async function listAnalyses(projectId: string, sceneId: string, options: Pagination = {}): Promise<Page<Analysis>> {
  const s = scope(projectId, sceneId); const p = parse(pagination, options);
  return transaction(true, async c => {
    await requireScene(c, s.projectId, s.sceneId);
    const params = [s.projectId, s.sceneId];
    const total = Number((await c.query('SELECT count(*) AS total FROM analyses WHERE project_id=$1 AND scene_id=$2', params)).rows[0].total);
    const rows = (await c.query('SELECT * FROM analyses WHERE project_id=$1 AND scene_id=$2 ORDER BY started_at DESC,id LIMIT $3 OFFSET $4', [...params, p.limit, p.offset])).rows;
    const items: Analysis[] = [];
    for (const row of rows) items.push(await hydrate(c, row));
    return page(items, total, p);
  });
}
export async function listFindings(projectId: string, sceneId: string, analysisId: string, options: Pagination = {}): Promise<Page<Finding>> {
  const p = parse(pagination, options);
  const findings = (await getAnalysis(projectId, sceneId, analysisId)).findings;
  return page(findings.slice(p.offset, p.offset + p.limit), findings.length, p);
}
export async function getActiveRules(projectId: string, sceneId: string, options: Pagination = {}): Promise<Page<ActiveRule>> {
  const s = scope(projectId, sceneId); const p = parse(pagination, options);
  return transaction(true, async c => {
    await requireScene(c, s.projectId, s.sceneId);
    const params = [s.projectId, s.sceneId];
    const total = Number((await c.query('SELECT count(*) AS total FROM continuity_rules WHERE project_id=$1 AND scene_id=$2 AND active=true', params)).rows[0].total);
    const rows = (await c.query('SELECT * FROM continuity_rules WHERE project_id=$1 AND scene_id=$2 AND active=true ORDER BY created_at DESC,id LIMIT $3 OFFSET $4', [...params, p.limit, p.offset])).rows;
    return page(rows.map(r => camel<ActiveRule>(r)), total, p);
  });
}
export async function getEvents(projectId: string, options: Pagination & { sceneId?: string } = {}): Promise<Page<ResourceEvent>> {
  const id = parse(identifier, projectId);
  const p = parse(pagination.extend({ sceneId: identifier.optional() }), options);
  return transaction(true, async c => {
    if (p.sceneId !== undefined) await requireScene(c, id, p.sceneId); else await requireProject(c, id);
    const params = p.sceneId === undefined ? [id] : [id, p.sceneId];
    const where = p.sceneId === undefined ? 'project_id=$1' : 'project_id=$1 AND scene_id=$2';
    const total = Number((await c.query(`SELECT count(*) AS total FROM events WHERE ${where}`, params)).rows[0].total);
    const rows = (await c.query(`SELECT * FROM events WHERE ${where} ORDER BY occurred_at DESC,id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, p.limit, p.offset])).rows;
    return page(rows.map(r => camel<ResourceEvent>(r)), total, { limit: p.limit, offset: p.offset });
  });
}
