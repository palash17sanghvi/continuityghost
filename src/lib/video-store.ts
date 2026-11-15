import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import type { PoolClient } from 'pg';
import { dbTransaction } from './database';
import { ResourceError } from './resources';
import type { Keyframe, Timeline, TimelineFinding, Video, VideoAnalysis } from './video-contract';

/** Server-only. Videos and frames live on local disk for the prototype; metadata, analyses and findings live in PostgreSQL. */
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/;
export const dataRoot = () => resolve(process.cwd(), process.env.VIDEO_DATA_DIR?.trim() || '.data/videos');
export function videoDir(projectId: string, sceneId: string, videoId: string): string {
  for (const id of [projectId, sceneId, videoId]) if (!ID.test(id)) throw new ResourceError(404, 'Video not found.');
  return join(dataRoot(), projectId, sceneId, videoId);
}
export const videoFile = (p: string, s: string, v: string) => join(videoDir(p, s, v), 'video.mp4');
export const frameFile = (p: string, s: string, v: string, keyframeId: string, thumb = false) => {
  if (!ID.test(keyframeId)) throw new ResourceError(404, 'Keyframe not found.');
  return join(videoDir(p, s, v), 'frames', `${keyframeId}${thumb ? '.thumb' : ''}.jpg`);
};
const base = (p: string, s: string, v: string) => `/api/projects/${p}/scenes/${s}/videos/${v}`;
const iso = (value: unknown) => (value instanceof Date ? value.toISOString() : value === null || value === undefined ? null : String(value));
export const STALE_ANALYSIS_MS = 10 * 60 * 1000;

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export const toVideo = (r: Row): Video => ({
  id: r.id, projectId: r.project_id, sceneId: r.scene_id, title: r.title, status: r.status,
  durationSeconds: r.duration_seconds ?? null, width: r.width ?? null, height: r.height ?? null, fps: r.fps ?? null,
  sizeBytes: Number(r.size_bytes), createdAt: iso(r.created_at)!, error: r.error ?? null,
  streamUrl: `${base(r.project_id, r.scene_id, r.id)}/stream`,
});
export const toKeyframe = (r: Row): Keyframe => ({
  id: r.id, videoId: r.video_id, index: r.frame_index, timestampSeconds: r.timestamp_seconds, shotIndex: r.shot_index,
  imageUrl: `${base(r.project_id, r.scene_id, r.video_id)}/keyframes/${r.id}/image`,
  thumbnailUrl: `${base(r.project_id, r.scene_id, r.video_id)}/keyframes/${r.id}/image?size=thumb`,
  width: r.width, height: r.height,
});
export const toAnalysis = (r: Row): VideoAnalysis => ({
  id: r.id, videoId: r.video_id, projectId: r.project_id, sceneId: r.scene_id, status: r.status, source: r.source, model: r.model ?? null,
  startedAt: iso(r.started_at)!, completedAt: iso(r.completed_at), keyframeCount: r.keyframe_count, pairsPlanned: r.pairs_planned,
  pairsCompleted: r.pairs_completed, pairsFailed: r.pairs_failed, maxComparisons: r.max_comparisons, errors: r.errors ?? [],
});
const notFound = (what: string) => new ResourceError(404, `${what} not found.`);

export type NewVideo = { id: string; projectId: string; sceneId: string; title: string; sizeBytes: number; durationSeconds: number; width: number; height: number; fps: number };
export async function insertVideo(v: NewVideo): Promise<void> {
  await dbTransaction(client => client.query(
    "INSERT INTO videos (id,project_id,scene_id,title,status,duration_seconds,width,height,fps,size_bytes) VALUES ($1,$2,$3,$4,'processing',$5,$6,$7,$8,$9)",
    [v.id, v.projectId, v.sceneId, v.title, v.durationSeconds, v.width, v.height, v.fps, v.sizeBytes]));
}
export type NewKeyframe = { id: string; index: number; timestampSeconds: number; shotIndex: number; width: number; height: number };
export async function markVideoReady(projectId: string, sceneId: string, videoId: string, frames: NewKeyframe[]): Promise<void> {
  await dbTransaction(async client => {
    for (const f of frames) await client.query('INSERT INTO keyframes (id,project_id,scene_id,video_id,frame_index,timestamp_seconds,shot_index,width,height) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [f.id, projectId, sceneId, videoId, f.index, f.timestampSeconds, f.shotIndex, f.width, f.height]);
    await client.query("UPDATE videos SET status='ready', error=NULL WHERE project_id=$1 AND scene_id=$2 AND id=$3", [projectId, sceneId, videoId]);
  });
}
export async function markVideoFailed(projectId: string, sceneId: string, videoId: string, message: string): Promise<void> {
  await dbTransaction(client => client.query("UPDATE videos SET status='failed', error=$4 WHERE project_id=$1 AND scene_id=$2 AND id=$3", [projectId, sceneId, videoId, message.slice(0, 500)]));
}
export async function listVideos(projectId: string, sceneId: string, limit: number, offset: number) {
  return dbTransaction(async client => {
    const total = Number((await client.query('SELECT count(*) AS n FROM videos WHERE project_id=$1 AND scene_id=$2', [projectId, sceneId])).rows[0].n);
    const rows = (await client.query('SELECT * FROM videos WHERE project_id=$1 AND scene_id=$2 ORDER BY created_at DESC, id LIMIT $3 OFFSET $4', [projectId, sceneId, limit, offset])).rows;
    return { items: rows.map(toVideo), total, limit, offset };
  }, true);
}
async function videoRow(client: PoolClient, p: string, s: string, v: string): Promise<Row> {
  const row = (await client.query('SELECT * FROM videos WHERE project_id=$1 AND scene_id=$2 AND id=$3', [p, s, v])).rows[0];
  if (!row) throw notFound('Video');
  return row;
}
export const getVideo = (p: string, s: string, v: string) => dbTransaction(async c => toVideo(await videoRow(c, p, s, v)), true);
async function keyframeRows(client: PoolClient, p: string, s: string, v: string) {
  return (await client.query('SELECT * FROM keyframes WHERE project_id=$1 AND scene_id=$2 AND video_id=$3 ORDER BY frame_index', [p, s, v])).rows.map(toKeyframe);
}
export const listKeyframes = (p: string, s: string, v: string) => dbTransaction(async c => { await videoRow(c, p, s, v); return keyframeRows(c, p, s, v); }, true);
export const getKeyframe = (p: string, s: string, v: string, k: string) => dbTransaction(async c => {
  const row = (await c.query('SELECT * FROM keyframes WHERE project_id=$1 AND scene_id=$2 AND video_id=$3 AND id=$4', [p, s, v, k])).rows[0];
  if (!row) throw notFound('Keyframe');
  return toKeyframe(row);
}, true);

/** Marks analyses that were interrupted (for example by a server restart) as failed instead of leaving them "running" forever. */
async function failStale(client: PoolClient, p: string, s: string, v: string) {
  await client.query(
    `UPDATE video_analyses SET status='failed', completed_at=now(), errors = errors || $4::jsonb
     WHERE project_id=$1 AND scene_id=$2 AND video_id=$3 AND status IN ('queued','running') AND started_at < now() - ($5 || ' milliseconds')::interval`,
    [p, s, v, JSON.stringify([{ code: 'internal', message: 'Analysis was interrupted before it finished. Start a new analysis.', pairIndex: null }]), String(STALE_ANALYSIS_MS)]);
}
export type NewAnalysis = { projectId: string; sceneId: string; videoId: string; source: 'gemini' | 'mock'; model: string | null; maxComparisons: number; keyframeCount: number; pairsPlanned: number; errors: VideoAnalysis['errors'] };
/** Returns the active analysis for the video if one exists, so a double click cannot start two paid runs. */
export async function createAnalysis(input: NewAnalysis): Promise<{ analysis: VideoAnalysis; created: boolean }> {
  return dbTransaction(async client => {
    const video = await videoRow(client, input.projectId, input.sceneId, input.videoId);
    if (video.status !== 'ready') throw new ResourceError(409, 'Video is not ready for analysis.');
    await client.query('SELECT id FROM videos WHERE project_id=$1 AND scene_id=$2 AND id=$3 FOR UPDATE', [input.projectId, input.sceneId, input.videoId]);
    await failStale(client, input.projectId, input.sceneId, input.videoId);
    const active = (await client.query("SELECT * FROM video_analyses WHERE project_id=$1 AND scene_id=$2 AND video_id=$3 AND status IN ('queued','running') ORDER BY started_at DESC LIMIT 1", [input.projectId, input.sceneId, input.videoId])).rows[0];
    if (active) return { analysis: toAnalysis(active), created: false };
    const id = randomUUID();
    const row = (await client.query(
      "INSERT INTO video_analyses (id,project_id,scene_id,video_id,status,source,model,started_at,keyframe_count,pairs_planned,max_comparisons,errors) VALUES ($1,$2,$3,$4,'queued',$5,$6,now(),$7,$8,$9,$10::jsonb) RETURNING *",
      [id, input.projectId, input.sceneId, input.videoId, input.source, input.model, input.keyframeCount, input.pairsPlanned, input.maxComparisons, JSON.stringify(input.errors)])).rows[0];
    return { analysis: toAnalysis(row), created: true };
  });
}
export const getAnalysis = (p: string, s: string, v: string, a: string) => dbTransaction(async client => {
  await failStale(client, p, s, v);
  const row = (await client.query('SELECT * FROM video_analyses WHERE project_id=$1 AND scene_id=$2 AND video_id=$3 AND id=$4', [p, s, v, a])).rows[0];
  if (!row) throw notFound('Analysis');
  return toAnalysis(row);
});
export async function updateAnalysis(p: string, s: string, a: string, patch: { status?: VideoAnalysis['status']; pairsCompleted?: number; pairsFailed?: number; errors?: VideoAnalysis['errors']; complete?: boolean }): Promise<void> {
  await dbTransaction(client => client.query(
    `UPDATE video_analyses SET status=COALESCE($4,status), pairs_completed=COALESCE($5,pairs_completed), pairs_failed=COALESCE($6,pairs_failed),
       errors=COALESCE($7::jsonb,errors), completed_at=CASE WHEN $8 THEN now() ELSE completed_at END WHERE project_id=$1 AND scene_id=$2 AND id=$3`,
    [p, s, a, patch.status ?? null, patch.pairsCompleted ?? null, patch.pairsFailed ?? null, patch.errors ? JSON.stringify(patch.errors) : null, patch.complete ?? false]));
}
export type FindingLink = { findingId: string; earlierKeyframeId: string; laterKeyframeId: string; potentialIssue: string };
export async function linkFindings(p: string, s: string, v: string, a: string, source: 'gemini' | 'mock', links: FindingLink[]): Promise<void> {
  await dbTransaction(async client => {
    for (const l of links) await client.query('INSERT INTO video_findings (project_id,scene_id,analysis_id,finding_id,video_id,source,potential_issue,earlier_keyframe_id,later_keyframe_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [p, s, a, l.findingId, v, source, l.potentialIssue, l.earlierKeyframeId, l.laterKeyframeId]);
  });
}

/** Everything the UI needs in one read, including the saved review status so a page reload keeps decisions. */
export async function getTimeline(p: string, s: string, v: string, a: string): Promise<Timeline> {
  return dbTransaction(async client => {
    await failStale(client, p, s, v);
    const video = toVideo(await videoRow(client, p, s, v));
    const analysisRow = (await client.query('SELECT * FROM video_analyses WHERE project_id=$1 AND scene_id=$2 AND video_id=$3 AND id=$4', [p, s, v, a])).rows[0];
    if (!analysisRow) throw notFound('Analysis');
    const keyframes = await keyframeRows(client, p, s, v);
    const rows = (await client.query(
      `SELECT f.id, f.analysis_id, f.category, f.description, f.reference_evidence, f.candidate_evidence, f.uncertainty, f.suggested_action, f.severity, f.confidence, f.status,
              vf.source, vf.potential_issue, vf.earlier_keyframe_id, vf.later_keyframe_id, ek.timestamp_seconds AS earlier_ts, lk.timestamp_seconds AS later_ts
       FROM video_findings vf
       JOIN findings f ON f.project_id=vf.project_id AND f.scene_id=vf.scene_id AND f.analysis_id=vf.analysis_id AND f.id=vf.finding_id
       JOIN keyframes ek ON ek.project_id=vf.project_id AND ek.scene_id=vf.scene_id AND ek.video_id=vf.video_id AND ek.id=vf.earlier_keyframe_id
       JOIN keyframes lk ON lk.project_id=vf.project_id AND lk.scene_id=vf.scene_id AND lk.video_id=vf.video_id AND lk.id=vf.later_keyframe_id
       WHERE vf.project_id=$1 AND vf.scene_id=$2 AND vf.video_id=$3 AND vf.analysis_id=$4 ORDER BY lk.timestamp_seconds, ek.timestamp_seconds, f.id`, [p, s, v, a])).rows;
    const notes = new Map<string, string>();
    for (const d of (await client.query('SELECT finding_id, note FROM review_decisions WHERE project_id=$1 AND scene_id=$2 AND analysis_id=$3 ORDER BY created_at, id', [p, s, a])).rows) notes.set(d.finding_id, d.note);
    const url = (k: string) => `${base(p, s, v)}/keyframes/${k}/image`;
    const findings: TimelineFinding[] = rows.map(r => ({
      id: r.id, analysisId: r.analysis_id, source: r.source, category: r.category, description: r.description, potentialIssue: r.potential_issue,
      uncertainty: r.uncertainty, suggestedAction: r.suggested_action, earlierEvidence: r.reference_evidence, laterEvidence: r.candidate_evidence,
      severity: r.severity ?? null, confidence: r.confidence ?? null,
      earlier: { keyframeId: r.earlier_keyframe_id, timestampSeconds: r.earlier_ts, imageUrl: url(r.earlier_keyframe_id) },
      later: { keyframeId: r.later_keyframe_id, timestampSeconds: r.later_ts, imageUrl: url(r.later_keyframe_id) },
      status: r.status, note: notes.get(r.id) ?? '',
    }));
    return { video, analysis: toAnalysis(analysisRow), keyframes, findings };
  }, false);
}
