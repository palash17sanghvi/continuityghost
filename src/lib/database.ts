import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { z } from 'zod';
import type { MemoryFact } from './memory';

const identifier = z.string().trim().min(1).max(200);
const text = z.string().trim().min(1).max(3000);
const scopeSchema = z.object({ analysisId: identifier, projectId: identifier, sceneId: identifier });
const findingSchema = z.object({
  id: identifier,
  category: z.enum(['wardrobe', 'props', 'placement', 'appearance', 'action', 'background']),
  description: text, referenceEvidence: text, candidateEvidence: text, uncertainty: text, suggestedAction: text,
  status: z.enum(['unreviewed', 'confirmed', 'dismissed', 'intentional']),
});
const analysisSchema = scopeSchema.extend({ summary: text, findings: z.array(findingSchema).max(30) });
const reviewSchema = scopeSchema.extend({ findingId: identifier, status: z.enum(['confirmed', 'dismissed', 'intentional']), note: z.string().trim().max(4000) });
export type StoredAnalysis = z.infer<typeof analysisSchema>;
export type StoredReview = z.infer<typeof reviewSchema>;
type Scope = z.infer<typeof scopeSchema>;

export function databaseEnabled(): boolean {
  return process.env.ALLOW_DATABASE === 'true' && Boolean(process.env.DATABASE_URL?.trim());
}
let pool: Pool | undefined;
let poolUrl: string | undefined;
function getPool(): Pool {
  if (!databaseEnabled()) throw new Error('Database disabled: configure DATABASE_URL and ALLOW_DATABASE=true.');
  const url = process.env.DATABASE_URL!;
  if (!pool || poolUrl !== url) {
    if (pool) void pool.end().catch(() => {});
    pool = new Pool({ connectionString: url, max: 5, connectionTimeoutMillis: 2000, query_timeout: 1500, statement_timeout: 1500 });
    poolUrl = url;
  }
  return pool;
}
async function transaction<T>(work: (client: PoolClient) => Promise<T>, readOnly = false): Promise<T> {
  let acquisitionExpired = false;
  let acquisitionTimer: ReturnType<typeof setTimeout> | undefined;
  const acquisition = getPool().connect().then(client => {
    if (acquisitionExpired) { client.release(true); throw new Error('Database acquisition deadline exceeded.'); }
    return client;
  });
  let client: PoolClient;
  try {
    client = await Promise.race([acquisition, new Promise<never>((_,reject) => {
      acquisitionTimer = setTimeout(() => { acquisitionExpired = true; reject(new Error('Database acquisition deadline exceeded.')); },2000);
    })]);
  } finally { clearTimeout(acquisitionTimer); }
  let expired = false;
  let released = false;
  const release = (destroy = false) => { if (!released) { released = true; client.release(destroy); } };
  const deadlineError = new Error('Database transaction deadline exceeded.');
  // Late work must never enqueue more queries or COMMIT on a destroyed client.
  const guarded = new Proxy(client, { get(target,key) {
    if (key === 'query') return (...args: unknown[]) => {
      if (expired) return Promise.reject(deadlineError);
      return Reflect.apply(target.query,target,args);
    };
    return Reflect.get(target,key,target);
  } });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_,reject) => {
    timer = setTimeout(() => { expired = true; release(true); reject(deadlineError); },8000);
  });
  const execution = (async () => {
    try {
      await guarded.query(readOnly ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN');
      const result = await work(guarded);
      await guarded.query('COMMIT');
      return result;
    } catch (error) {
      if (!expired) {
        try { await guarded.query('ROLLBACK'); } catch { release(true); }
      }
      throw error;
    }
  })();
  try { return await Promise.race([execution,deadline]); }
  finally { clearTimeout(timer); release(); }
}

/** Remote hits are candidates only; active human decisions remain authoritative. */
export async function reconcileMemories(projectId: string, sceneId: string, facts: MemoryFact[]): Promise<MemoryFact[]> {
  // Preserve exact scope rather than normalizing remote identifiers.
  identifier.parse(projectId); identifier.parse(sceneId);
  const decisionIds = [...new Set(facts.flatMap(fact =>
    typeof fact.decisionId === 'string' && fact.decisionId.trim().length > 0 && fact.decisionId.length <= 200 ? [fact.decisionId] : []))];
  if (!decisionIds.length) return [];
  return transaction(async client => {
    const result = await client.query<{decisionId: string; content: string}>(
      'SELECT decision_id AS "decisionId", content FROM continuity_rules WHERE project_id=$1 AND scene_id=$2 AND active=true AND decision_id = ANY($3::text[])',
      [projectId,sceneId,decisionIds]);
    const canonical = new Map(result.rows.map(row => [row.decisionId,row.content]));
    return facts.flatMap(fact => {
      const content = fact.decisionId ? canonical.get(fact.decisionId) : undefined;
      return content === undefined ? [] : [{...fact,content}];
    });
  },true);
}
async function event(client: PoolClient, scope: Scope, type: string, at: Date, findingId: string | null = null, payload: object = {}) {
  await client.query('INSERT INTO events (id, project_id, scene_id, analysis_id, finding_id, event_type, occurred_at, payload) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)',
    [randomUUID(), scope.projectId, scope.sceneId, scope.analysisId, findingId, type, at, JSON.stringify(payload)]);
}
async function insertAnalysis(client: PoolClient, scope: Scope, startedAt: Date, completedAt: Date, status: 'completed' | 'failed', summary: string) {
  await client.query('INSERT INTO projects (id) VALUES ($1) ON CONFLICT (id) DO NOTHING', [scope.projectId]);
  await client.query('INSERT INTO scenes (project_id, id) VALUES ($1,$2) ON CONFLICT (project_id,id) DO NOTHING', [scope.projectId,scope.sceneId]);
  await client.query('INSERT INTO analyses (id,project_id,scene_id,summary,status,started_at,completed_at) VALUES ($1,$2,$3,$4,$5,$6,$7)', [scope.analysisId,scope.projectId,scope.sceneId,summary,status,startedAt,completedAt]);
  await event(client,scope,'analysis_started',startedAt);
}
function validStart(startedAt: Date) { z.date().parse(startedAt); if (startedAt.getTime() > Date.now()) throw new Error('Analysis start is in the future.'); }
export async function persistAnalysis(input: StoredAnalysis, startedAt: Date): Promise<void> {
  const result = analysisSchema.parse(input); validStart(startedAt);
  if (new Set(result.findings.map(f => f.id)).size !== result.findings.length) throw new Error('Duplicate finding IDs.');
  await transaction(async client => {
    const completedAt = new Date();
    await insertAnalysis(client,result,startedAt,completedAt,'completed',result.summary);
    for (const f of result.findings) {
      await client.query('INSERT INTO findings (id,project_id,scene_id,analysis_id,category,description,reference_evidence,candidate_evidence,uncertainty,suggested_action,status,detected_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
        [f.id,result.projectId,result.sceneId,result.analysisId,f.category,f.description,f.referenceEvidence,f.candidateEvidence,f.uncertainty,f.suggestedAction,f.status,completedAt]);
      await event(client,result,'finding_detected',completedAt,f.id,{category:f.category});
    }
    await event(client,result,'analysis_completed',completedAt);
  });
}
// Caller invokes this only after a real analysis failure; no findings are fabricated.
export async function persistAnalysisFailure(input: Scope, startedAt: Date, reason: string): Promise<void> {
  const scope = scopeSchema.parse(input); validStart(startedAt); const message = text.parse(reason);
  await transaction(async client => {
    const failedAt = new Date();
    await insertAnalysis(client,scope,startedAt,failedAt,'failed',message);
    await event(client,scope,'analysis_failed',failedAt,null,{reason:message});
  });
}
export async function persistReview(input: StoredReview): Promise<{decisionId: string; content: string}> {
  const review = reviewSchema.parse(input);
  return transaction(async client => {
    const params = [review.projectId,review.sceneId,review.analysisId,review.findingId];
    const canonical = await client.query('SELECT category, description, reference_evidence AS "referenceEvidence", candidate_evidence AS "candidateEvidence", uncertainty, suggested_action AS "suggestedAction" FROM findings WHERE project_id=$1 AND scene_id=$2 AND analysis_id=$3 AND id=$4 FOR UPDATE',params);
    if (canonical.rows.length !== 1) throw new Error('Finding does not exist in exact project/scene/analysis scope.');
    const f = canonical.rows[0];
    const content = [`${review.status}: ${f.category} — ${f.description}`, `Reference: ${f.referenceEvidence}`, `Candidate: ${f.candidateEvidence}`, `Uncertainty: ${f.uncertainty}`, `Suggested action: ${f.suggestedAction}`, ...(review.note ? [`Review note: ${review.note}`] : [])].join('\n');
    const decisionId = randomUUID(); const at = new Date();
    await client.query('INSERT INTO review_decisions (id,project_id,scene_id,analysis_id,finding_id,status,note,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',[decisionId,...params,review.status,review.note,at]);
    await client.query('UPDATE findings SET status=$5 WHERE project_id=$1 AND scene_id=$2 AND analysis_id=$3 AND id=$4',[...params,review.status]);
    await client.query('UPDATE continuity_rules SET active=false WHERE project_id=$1 AND scene_id=$2 AND analysis_id=$3 AND finding_id=$4 AND active',params);
    await client.query('INSERT INTO continuity_rules (id,project_id,scene_id,analysis_id,finding_id,decision_id,content,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',[randomUUID(),...params,decisionId,content,at]);
    await event(client,review,`review_${review.status}`,at,review.findingId,{decisionId});
    return {decisionId,content};
  });
}
export type Analytics = { categories: {category:string;count:number}[]; outcomes: {status:string;count:number}[]; trends: {bucket:string;count:number}[]; totals: {analyses:number;findings:number;reviews:number}; timeSeriesMode:'timescale'|'postgres' };
export async function getAnalytics(projectId: string): Promise<Analytics> {
  const id = identifier.parse(projectId);
  return transaction(async client => {
    const extension = await client.query("SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname='timescaledb') AND EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='_timescaledb_catalog' AND c.relname='hypertable') AS available");
    let timescale = false;
    if (extension.rows[0]?.available) {
      const hypertable = await client.query("SELECT EXISTS (SELECT 1 FROM timescaledb_information.hypertables WHERE hypertable_schema=current_schema() AND hypertable_name='events') AS available");
      timescale = Boolean(hypertable.rows[0]?.available);
    }
    const categories = await client.query('SELECT category, count(*) AS count FROM findings WHERE project_id=$1 GROUP BY category ORDER BY category',[id]);
    // Outcomes reflect current finding state; review totals count decision history.
    const outcomes = await client.query('SELECT status, count(*) AS count FROM findings WHERE project_id=$1 GROUP BY status ORDER BY status',[id]);
    const bucket = timescale ? "time_bucket(INTERVAL '1 day', occurred_at)" : "date_trunc('day', occurred_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'";
    const trends = await client.query(`SELECT ${bucket} AS bucket, count(*) AS count FROM events WHERE project_id=$1 AND event_type='finding_detected' GROUP BY bucket ORDER BY bucket`,[id]);
    const totals = await client.query('SELECT (SELECT count(*) FROM analyses WHERE project_id=$1) AS analyses, (SELECT count(*) FROM findings WHERE project_id=$1) AS findings, (SELECT count(*) FROM review_decisions WHERE project_id=$1) AS reviews',[id]);
    const t = totals.rows[0];
    return { categories: categories.rows.map(r=>({category:r.category,count:Number(r.count)})), outcomes: outcomes.rows.map(r=>({status:r.status,count:Number(r.count)})), trends: trends.rows.map(r=>({bucket:new Date(r.bucket).toISOString(),count:Number(r.count)})), totals:{analyses:Number(t.analyses),findings:Number(t.findings),reviews:Number(t.reviews)}, timeSeriesMode:timescale?'timescale':'postgres' };
  },true);
}
