import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { copyFile, lstat, mkdir, open, readdir, readFile, realpath, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { databaseEnabled, databaseTransaction } from './database';
import { memoryEnabled, rememberDecision, retrieveMemories } from './memory';
import { videoRecordSchema, type VideoAnalysis, type VideoPersistence, type VideoRecord } from './video-contract';

const uuid = z.string().uuid();
const scopeId = z.string().trim().min(1).max(120);
const frameId = /^frame-[a-zA-Z0-9-]+$/;
const localWarning = 'PostgreSQL disabled; saved persistently on this server only.';
const databaseWarning = 'PostgreSQL unavailable or newer data exists; saved locally, not confirmed remotely.';
const decisionSchema = z.object({
  id: uuid, findingId: uuid, status: z.enum(['confirmed', 'dismissed', 'intentional']),
  note: z.string().trim().max(4000), createdAt: z.string().datetime(), revision: z.number().int().positive(), content: z.string(),
});
const documentSchema = z.object({
  record: videoRecordSchema, revision: z.number().int().positive(), decisions: z.array(decisionSchema),
  persistence: z.object({ mode: z.enum(['local', 'postgres']), warning: z.string().optional() }),
  memory: z.object({ status: z.string(), warning: z.string().optional() }),
});
type Document = z.infer<typeof documentSchema>;
type Decision = z.infer<typeof decisionSchema>;
export const videoReviewSchema = z.object({
  analysisId: uuid, findingId: uuid, projectId: scopeId, sceneId: scopeId,
  status: z.enum(['confirmed', 'dismissed', 'intentional']), note: z.string().trim().max(4000), consent: z.boolean(),
});
export class VideoStoreError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
function root() { return path.resolve(process.env.CONTINUITY_DATA_DIR || path.join(process.cwd(), '.continuityghost'), 'videos'); }
function folder(id: string) {
  if (!uuid.safeParse(id).success) throw new VideoStoreError('Invalid analysis ID.');
  return path.join(root(), id);
}
function validateRecord(value: unknown): VideoRecord {
  return videoRecordSchema.parse(value);
}
function parseDocument(value: unknown): Document {
  const document = documentSchema.parse(value);
  document.record = validateRecord(document.record);
  return document;
}
function missing(error: unknown) { return (error as NodeJS.ErrnoException).code === 'ENOENT'; }
// A filesystem lock also serializes writes across Next module reloads and server workers.
async function locked<T>(id: string, work: () => Promise<T>): Promise<T> {
  const target = folder(id);
  await mkdir(root(), { recursive: true });
  const lock = `${target}.lock`;
  let acquired = false;
  for (let attempt = 0; attempt < 150; attempt++) {
    try { await mkdir(lock); acquired = true; break; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      // A crashed worker cannot hold a review forever. Normal operations have bounded DB/memory deadlines.
      try { if (Date.now() - (await stat(lock)).mtimeMs > 60000) { await rm(lock, { recursive: true, force: true }); continue; } }
      catch (error) { if (!missing(error)) throw error; }
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  }
  if (!acquired) throw new VideoStoreError('Video is busy; retry the review.', 503);
  try { return await work(); } finally { await rm(lock, { recursive: true, force: true }); }
}
async function atomicJSON(target: string, value: unknown) {
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    const handle = await open(temporary, 'wx', 0o600);
    try { await handle.writeFile(JSON.stringify(value)); await handle.sync(); } finally { await handle.close(); }
    await rename(temporary, target);
  } finally { await rm(temporary, { force: true }); }
}
async function localDocument(id: string): Promise<Document | null> {
  try {
    const directory = folder(id);
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new VideoStoreError('Invalid video directory.', 400);
    const file = await checkedMedia(directory, 'analysis.json');
    const document = parseDocument(JSON.parse(await readFile(file, 'utf8')));
    if (document.record.analysisId !== id) throw new VideoStoreError('Stored analysis ID does not match.', 503);
    return document;
  }
  catch (error) { if (missing(error)) return null; throw error; }
}
async function remoteDocument(id: string): Promise<Document | null> {
  return databaseTransaction(async client => {
    const result = await client.query('SELECT document FROM video_analyses WHERE id=$1', [id]);
    return result.rows[0] ? parseDocument(result.rows[0].document) : null;
  }, true);
}
async function loadDocument(id: string): Promise<Document | null> {
  folder(id);
  const local = await localDocument(id);
  if (!databaseEnabled()) return local;
  try {
    const remote = await remoteDocument(id);
    if (remote && (!local || remote.revision > local.revision)) return { ...remote, persistence: { mode: 'postgres' } };
    return local || remote;
  } catch {
    if (local) return { ...local, persistence: { mode: 'local', warning: databaseWarning } };
    throw new VideoStoreError('Video database unavailable and no local copy exists.', 503);
  }
}
async function saveRemote(document: Document) {
  const record = document.record;
  await databaseTransaction(async client => {
    await client.query('INSERT INTO projects(id) VALUES($1) ON CONFLICT DO NOTHING', [record.projectId]);
    await client.query('INSERT INTO scenes(project_id,id) VALUES($1,$2) ON CONFLICT DO NOTHING', [record.projectId, record.sceneId]);
    const result = await client.query(`INSERT INTO video_analyses(id,project_id,scene_id,created_at,revision,document)
      VALUES($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT(id) DO UPDATE SET revision=EXCLUDED.revision,document=EXCLUDED.document
      WHERE video_analyses.project_id=EXCLUDED.project_id AND video_analyses.scene_id=EXCLUDED.scene_id
      AND video_analyses.revision < EXCLUDED.revision RETURNING id`,
    [record.analysisId, record.projectId, record.sceneId, record.createdAt, document.revision, JSON.stringify({ ...document, persistence: { mode: 'postgres' } })]);
    if (!result.rowCount) throw new Error('Video revision conflict');
    for (const decision of document.decisions) {
      await client.query(`INSERT INTO video_review_decisions(id,analysis_id,project_id,scene_id,finding_id,revision,status,note,content,created_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(id) DO NOTHING`,
      [decision.id, record.analysisId, record.projectId, record.sceneId, decision.findingId, decision.revision, decision.status, decision.note, decision.content, decision.createdAt]);
    }
    const verified = await client.query('SELECT document FROM video_analyses WHERE id=$1', [record.analysisId]);
    const stored = verified.rows[0] ? parseDocument(verified.rows[0].document) : null;
    if (!stored || stored.revision !== document.revision || JSON.stringify(stored.record) !== JSON.stringify(record)) throw new Error('Video database readback failed');
  });
}
async function persistDocument(document: Document): Promise<VideoPersistence> {
  // Commit durable fallback before attempting an optional database write.
  const target = path.join(folder(document.record.analysisId), 'analysis.json');
  await mkdir(folder(document.record.analysisId), { recursive: true });
  document.persistence = { mode: 'local', warning: databaseEnabled() ? databaseWarning : localWarning };
  await atomicJSON(target, document);
  if (databaseEnabled()) {
    try { await saveRemote(document); document.persistence = { mode: 'postgres' }; }
    catch { /* Local copy is already durable. Never report a failed database write as saved remotely. */ }
    await atomicJSON(target, document);
  }
  return document.persistence;
}
function analysis(document: Document): VideoAnalysis {
  return { ...document.record, persistence: document.persistence, memory: document.memory };
}
async function checkedMedia(directory: string, name: string): Promise<string> {
  const candidate = path.join(directory, name);
  const info = await lstat(candidate);
  if (!info.isFile() || info.isSymbolicLink()) throw new VideoStoreError('Invalid stored media.', 404);
  const [base, resolved] = await Promise.all([realpath(directory), realpath(candidate)]);
  if (path.dirname(resolved) !== base) throw new VideoStoreError('Invalid media path.', 404);
  return resolved;
}
/** Copies pipeline output before its temporary directory can be removed. */
export async function saveVideo(input: VideoRecord, directory: string): Promise<VideoPersistence> {
  const record = validateRecord(input);
  if (record.findings.some(f => f.status !== 'unreviewed')) throw new VideoStoreError('New findings must be unreviewed.');
  return locked(record.analysisId, async () => {
    let existing: Document | null;
    try { existing = await loadDocument(record.analysisId); }
    catch (error) { if (!(error instanceof VideoStoreError) || error.status !== 503) throw error; existing = null; }
    if (existing) throw new VideoStoreError('Analysis already exists.', 409);
    const staging = `${folder(record.analysisId)}.${randomUUID()}.tmp`;
    await mkdir(staging);
    try {
      for (const name of ['clip', ...record.frames.map(frame => `${frame.id}.jpg`)]) {
        await copyFile(await checkedMedia(directory, name), path.join(staging, name), constants.COPYFILE_EXCL);
      }
      const document: Document = { record, revision: 1, decisions: [], persistence: { mode: 'local', warning: localWarning }, memory: { status: 'disabled' } };
      await atomicJSON(path.join(staging, 'analysis.json'), document);
      await rename(staging, folder(record.analysisId));
      return await persistDocument(document);
    } finally { await rm(staging, { recursive: true, force: true }); }
  });
}
export async function getVideo(id: string): Promise<VideoAnalysis | null> {
  const document = await loadDocument(id);
  return document ? analysis(document) : null;
}
async function historyDocuments(projectId: string, sceneId: string, limit = 100): Promise<Document[]> {
  scopeId.parse(projectId); scopeId.parse(sceneId);
  const documents = new Map<string, Document>();
  let entries: string[] = [];
  try { entries = await readdir(root()); } catch (error) { if (!missing(error)) throw error; }
  const scoped: Document[] = [];
  for (const id of entries) {
    if (!uuid.safeParse(id).success) continue;
    const document = await localDocument(id);
    if (document && document.record.projectId === projectId && document.record.sceneId === sceneId) scoped.push(document);
  }
  scoped.sort((a, b) => b.record.createdAt.localeCompare(a.record.createdAt));
  for (const document of scoped.slice(0, limit)) documents.set(document.record.analysisId, document);
  if (databaseEnabled()) {
    try {
      const remote = await databaseTransaction(async client => (await client.query(
        'SELECT document FROM video_analyses WHERE project_id=$1 AND scene_id=$2 ORDER BY created_at DESC LIMIT 100', [projectId, sceneId])).rows, true);
      for (const row of remote) {
        const document = parseDocument(row.document);
        const local = documents.get(document.record.analysisId);
        if (!local || document.revision > local.revision) documents.set(document.record.analysisId, { ...document, persistence: { mode: 'postgres' } });
      }
    } catch {
      if (!documents.size) throw new VideoStoreError('Video history unavailable.', 503);
      for (const document of documents.values()) document.persistence = { mode: 'local', warning: databaseWarning };
    }
  }
  return [...documents.values()].sort((a, b) => b.record.createdAt.localeCompare(a.record.createdAt)).slice(0, limit);
}
export async function listVideos(projectId: string, sceneId: string): Promise<VideoAnalysis[]> {
  return (await historyDocuments(projectId, sceneId)).map(analysis);
}
export async function getVideoMedia(id: string, requestedFrame: string | null) {
  const document = await loadDocument(id);
  if (!document) throw new VideoStoreError('Video not found.', 404);
  if (requestedFrame !== null && (!frameId.test(requestedFrame) || !document.record.frames.some(frame => frame.id === requestedFrame))) {
    throw new VideoStoreError('Frame not found.', 404);
  }
  const file = await checkedMedia(folder(id), requestedFrame === null ? 'clip' : `${requestedFrame}.jpg`);
  return { file, size: (await stat(file)).size, mimeType: requestedFrame === null ? document.record.mimeType : 'image/jpeg' };
}
function ruleContent(record: VideoRecord, findingId: string, status: Decision['status'], note: string) {
  const finding = record.findings.find(f => f.id === findingId)!;
  const outcome = status === 'intentional' ? 'Intentional exception approved; do not flag this specific evidenced change as a mistake.'
    : status === 'confirmed' ? 'Continuity mistake confirmed. Candidate difference is NOT an approved new canonical state.' : 'Prior rule retired; difference dismissed.';
  return `Human ${status} video review: ${finding.description}\nReference evidence: ${finding.referenceEvidence}\nCandidate evidence: ${finding.candidateEvidence}\nOutcome: ${outcome}\nReviewer note: ${note || '(none)'}`;
}
function approvedDecisions(document: Document) {
  const latest = new Map<string, Decision>();
  for (const decision of document.decisions) {
    if (!latest.has(decision.findingId) || latest.get(decision.findingId)!.revision < decision.revision) latest.set(decision.findingId, decision);
  }
  return [...latest.values()].filter(decision => decision.status !== 'dismissed' && document.record.findings.some(finding =>
    finding.id === decision.findingId && finding.status === decision.status && finding.referenceEvidence.trim() && finding.candidateEvidence.trim()));
}
export async function reviewVideo(value: z.infer<typeof videoReviewSchema>) {
  const input = videoReviewSchema.parse(value);
  return locked(input.analysisId, async () => {
    const document = await loadDocument(input.analysisId);
    if (!document || document.record.projectId !== input.projectId || document.record.sceneId !== input.sceneId ||
        !document.record.findings.some(f => f.id === input.findingId)) throw new VideoStoreError('Analysis or finding not found in this scope.', 404);
    document.revision++;
    const finding = document.record.findings.find(f => f.id === input.findingId)!;
    finding.status = input.status; finding.note = input.note;
    const decision: Decision = { id: randomUUID(), findingId: input.findingId, status: input.status, note: input.note,
      createdAt: new Date().toISOString(), revision: document.revision, content: ruleContent(document.record, input.findingId, input.status, input.note) };
    document.decisions.push(decision);
    document.memory = { status: 'disabled' };
    await persistDocument(document);
    if (input.status !== 'dismissed' && input.consent && memoryEnabled()) {
      try {
        const result = await rememberDecision({ projectId: input.projectId, sceneId: input.sceneId, id: decision.id, decisionId: decision.id, content: decision.content });
        document.memory = { status: result.status, ...(result.warning ? { warning: result.warning } : {}) };
      } catch { document.memory = { status: 'unavailable', warning: 'Review saved; remote memory unavailable.' }; }
      // Memory is advisory. Review and approval are already durably persisted above.
      await atomicJSON(path.join(folder(input.analysisId), 'analysis.json'), document);
    }
    return { persisted: true as const, persistence: document.persistence, memory: document.memory, analysis: analysis(document) };
  });
}
/** Local/PG human rules always work; consent controls only optional remote memory sharing. */
export async function loadVideoRules(projectId: string, sceneId: string, query: string, consent: boolean) {
  scopeId.parse(projectId); scopeId.parse(sceneId); z.string().trim().min(1).max(10000).parse(query);
  let documents: Document[] = [];
  let historyWarning: string | undefined;
  // History HTTP responses are capped. Approval lifetime is not: an old scene rule remains valid until a human retires it.
  try { documents = await historyDocuments(projectId, sceneId, Infinity); }
  catch { historyWarning = 'Historical video rules unavailable; no unverified memory used.'; }
  const approved = new Map<string, { id: string; content: string }>(documents.flatMap(document => approvedDecisions(document).map(decision => [decision.id, decision] as const)));
  let warning = historyWarning || documents.find(document => document.persistence.mode === 'local' && databaseEnabled())?.persistence.warning;
  if (databaseEnabled()) {
    try {
      // Rules can outlive the capped history response. Find latest decision per finding, not merely latest 100 analyses.
      const videoRows = await databaseTransaction(async client => (await client.query(`SELECT * FROM (
        SELECT DISTINCT ON (analysis_id,finding_id) id, analysis_id AS "analysisId", finding_id AS "findingId", status, content, created_at
        FROM video_review_decisions WHERE project_id=$1 AND scene_id=$2 ORDER BY analysis_id,finding_id,revision DESC
        ) latest WHERE status IN ('confirmed','intentional') ORDER BY created_at DESC LIMIT 20`, [projectId, sceneId])).rows, true);
      for (const row of videoRows) {
        // A local review made during a DB outage takes precedence over its stale remote predecessor.
        const local = typeof row.analysisId === 'string' ? await localDocument(row.analysisId) : null;
        const decisions = local?.decisions.filter(decision => decision.findingId === row.findingId);
        const latest = decisions?.reduce<Decision | undefined>((last, decision) => !last || decision.revision > last.revision ? decision : last, undefined);
        if (latest && latest.id !== row.id) continue;
        if (typeof row.id === 'string' && typeof row.content === 'string') approved.set(row.id, { id: row.id, content: row.content });
      }
      const rows = await databaseTransaction(async client => (await client.query(`SELECT r.decision_id AS "decisionId", r.content FROM continuity_rules r
        JOIN review_decisions d ON d.project_id=r.project_id AND d.scene_id=r.scene_id AND d.analysis_id=r.analysis_id
          AND d.finding_id=r.finding_id AND d.id=r.decision_id
        JOIN findings f ON f.project_id=r.project_id AND f.scene_id=r.scene_id AND f.analysis_id=r.analysis_id AND f.id=r.finding_id
        WHERE r.project_id=$1 AND r.scene_id=$2 AND r.active=true AND d.status IN ('confirmed','intentional')
          AND btrim(f.reference_evidence)<>'' AND btrim(f.candidate_evidence)<>''
        ORDER BY r.created_at DESC LIMIT 20`, [projectId, sceneId])).rows, true);
      for (const row of rows) {
        if (typeof row.decisionId === 'string' && typeof row.content === 'string') approved.set(row.decisionId, { id: row.decisionId, content: row.content });
      }
    } catch { warning = 'PostgreSQL scene rules unavailable; using only locally verified video decisions.'; }
  }
  // Bound prompt size even when notes/history are large. Evidence is never replaced by remote text.
  const facts: { id: string; content: string }[] = [];
  let budget = 24000;
  for (const decision of approved.values()) {
    if (facts.length >= 20) break;
    if (decision.content.length > budget) continue;
    facts.push({ id: decision.id, content: decision.content }); budget -= decision.content.length;
  }
  if (!consent || !memoryEnabled()) return { status: historyWarning && !facts.length ? 'unavailable' : 'ready', facts, ...(warning ? { warning } : {}) };
  try {
    const remote = await retrieveMemories({ projectId, sceneId, query });
    if (remote.status !== 'ready') return { status: 'ready', facts, warning: remote.warning || 'Remote memory unavailable; using saved video rules.' };
    // Never trust remote paraphrases, inferred facts, obsolete IDs, or another scene's decisions.
    for (const hit of remote.facts) {
      const decision = hit.decisionId ? approved.get(hit.decisionId) : undefined;
      if (decision && facts.length < 20 && decision.content.length <= budget && !facts.some(fact => fact.id === decision.id)) {
        facts.push({ id: decision.id, content: decision.content }); budget -= decision.content.length;
      }
    }
    return { status: 'ready', facts, ...(warning ? { warning } : {}) };
  } catch { return { status: 'ready', facts, warning: 'Remote memory unavailable; using saved video rules.' }; }
}
