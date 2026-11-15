import { execFile } from 'node:child_process';
import { stat } from 'node:fs/promises';

/** Server-only. All FFmpeg calls use argument arrays (no shell) and a hard timeout. */
export const ffmpegBin = () => process.env.FFMPEG_PATH?.trim() || 'ffmpeg';
// Cuts in flat synthetic footage score ~0.18 and static frames ~0.0001; real cuts score higher. MIN_SHOT_SECONDS filters motion false positives.
export const SCENE_THRESHOLD = 0.12;
export const MIN_SHOT_SECONDS = 0.75;
export const MAX_KEYFRAMES = 24;
export const FRAME_MAX_WIDTH = 1024;

export class MediaError extends Error {
  constructor(public readonly status: number, message: string) { super(message); this.name = 'MediaError'; }
}
function run(args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(ffmpegBin(), ['-hide_banner', '-nostdin', ...args], { timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024, encoding: 'utf8' }, (error, _stdout, stderr) => {
      const failure = error as (NodeJS.ErrnoException & { killed?: boolean }) | null;
      if (failure?.code === 'ENOENT') return reject(new MediaError(503, 'FFmpeg is not installed. Set FFMPEG_PATH or add ffmpeg to PATH.'));
      if (failure?.killed) return reject(new MediaError(422, 'Video processing timed out.'));
      resolve(stderr); // ffmpeg writes diagnostics to stderr and exits non-zero for info-only runs.
    });
  });
}

export type VideoInfo = { durationSeconds: number; width: number; height: number; fps: number; codec: string };
/** ffprobe is not available everywhere, so metadata comes from `ffmpeg -i` output. */
export function parseInfo(stderr: string): VideoInfo {
  const duration = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
  const video = /Stream #[^\n]*Video:\s*([A-Za-z0-9_]+)[^\n]*?,\s*(\d{2,5})x(\d{2,5})[\s,[]/.exec(stderr);
  if (!duration || !video) throw new MediaError(400, 'File is not a readable video.');
  const fps = /(\d+(?:\.\d+)?)\s*fps/.exec(stderr) ?? /(\d+(?:\.\d+)?)\s*tbr/.exec(stderr);
  return {
    durationSeconds: Math.round((Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3])) * 1000) / 1000,
    width: Number(video[2]), height: Number(video[3]), fps: fps ? Number(fps[1]) : 0, codec: video[1],
  };
}
export async function inspectVideo(file: string): Promise<VideoInfo> {
  return parseInfo(await run(['-i', file], 20_000));
}

export type Shot = { index: number; start: number; end: number };
export function shotsFromCuts(cuts: number[], duration: number): Shot[] {
  const kept: number[] = [];
  for (const cut of [...cuts].sort((a, b) => a - b)) {
    const previous = kept.at(-1) ?? 0;
    if (cut - previous >= MIN_SHOT_SECONDS && duration - cut >= MIN_SHOT_SECONDS) kept.push(cut);
  }
  const edges = [0, ...kept, duration];
  return edges.slice(0, -1).map((start, index) => ({ index, start, end: edges[index + 1] }));
}
export function parseCuts(stderr: string): number[] {
  return [...stderr.matchAll(/pts_time:(\d+(?:\.\d+)?)/g)].map(match => Number(match[1]));
}
export async function detectShots(file: string, duration: number): Promise<Shot[]> {
  const stderr = await run(['-i', file, '-vf', `select='gt(scene,${SCENE_THRESHOLD})',showinfo`, '-an', '-f', 'null', '-'], 90_000);
  return shotsFromCuts(parseCuts(stderr), duration);
}

export type PlannedFrame = { index: number; timestampSeconds: number; shotIndex: number };
/** One frame at the middle of every shot, plus 20%/80% frames inside shots of 5 s or longer. Bounded by MAX_KEYFRAMES. */
export function planKeyframes(shots: Shot[], duration: number, max = MAX_KEYFRAMES): PlannedFrame[] {
  const at = (shot: Shot, fraction: number) => Math.min(Math.max(0, duration - 0.05), Math.round((shot.start + (shot.end - shot.start) * fraction) * 1000) / 1000);
  let frames = shots.flatMap(shot => (shot.end - shot.start >= 5 ? [0.2, 0.5, 0.8] : [0.5]).map(f => ({ timestampSeconds: at(shot, f), shotIndex: shot.index })));
  if (frames.length > max) frames = shots.map(shot => ({ timestampSeconds: at(shot, 0.5), shotIndex: shot.index }));
  if (frames.length > max) frames = Array.from({ length: max }, (_, i) => frames[Math.round((i * (frames.length - 1)) / (max - 1))]);
  return frames.map((frame, index) => ({ ...frame, index }));
}
export async function extractFrame(file: string, timestampSeconds: number, output: string): Promise<void> {
  await run(['-y', '-ss', timestampSeconds.toFixed(3), '-i', file, '-frames:v', '1', '-vf', `scale='min(${FRAME_MAX_WIDTH},iw)':-2`, '-q:v', '3', output], 30_000);
  let size = 0;
  try { size = (await stat(output)).size; } catch { /* handled below */ }
  if (size === 0) throw new MediaError(422, 'Could not extract a frame from the video.');
}
