import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import type { FramePair, Keyframe } from './video-contract';

export const MAX_VIDEO_BYTES = 64 * 1024 * 1024;
export const VIDEO_MIME_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'] as const;
export class VideoError extends Error {
  constructor(public code: string, message: string, public status = 422) { super(message); }
}

// No shell, stdin, network protocols, unbounded output, or unconstrained workers.
// Exported so fixture tests can exercise the exact production process boundary.
export function runMediaTool(tool: 'ffmpeg' | 'ffprobe', args: string[], timeout = 35_000, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(tool, args, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', bytes = 0, failure: VideoError | undefined;
    const stop = (error: VideoError) => { failure ??= error; child.kill('SIGKILL'); };
    const abort = () => stop(new VideoError('VIDEO_CANCELLED', 'Video processing was cancelled.', 408));
    signal?.addEventListener('abort', abort, {once:true});
    if (signal?.aborted) abort();
    const timer = setTimeout(() => stop(new VideoError('VIDEO_TIMEOUT', 'Video processing timed out.', 504)), timeout);
    const collect = (chunk: Buffer, stream: 'stdout' | 'stderr') => {
      bytes += chunk.length;
      if (bytes > 256 * 1024) return stop(new VideoError('VIDEO_OUTPUT_LIMIT', 'Video processing exceeded its output limit.'));
      if (stream === 'stdout') stdout += chunk.toString(); else stderr += chunk.toString();
    };
    child.stdout.on('data', chunk => collect(chunk, 'stdout'));
    child.stderr.on('data', chunk => collect(chunk, 'stderr'));
    child.on('error', () => { clearTimeout(timer); reject(new VideoError('VIDEO_TOOL_UNAVAILABLE', 'Local ffmpeg/ffprobe could not start.', 503)); });
    child.on('close', code => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      if (failure) reject(failure);
      else if (code !== 0) reject(new VideoError('INVALID_VIDEO', 'Video could not be decoded. Upload a valid MP4, WebM, or MOV clip.'));
      else resolve(tool === 'ffprobe' ? stdout : stderr);
    });
  });
}

type Descriptor = { coarse: Buffer; detail: Buffer };
const distance = (a: Buffer, b: Buffer) => {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / (a.length * 255);
};

// A cheap visual transition detector, not semantic shot recognition. Similar
// backgrounds can still be different scenes; Gemini must verify comparability.
export function selectFramePairs(frames: Keyframe[], descriptors: Descriptor[]): FramePair[] {
  let shotId = 0;
  for (let i = 0; i < frames.length; i++) {
    if (i && distance(descriptors[i - 1].coarse, descriptors[i].coarse) > 0.16) shotId++;
    frames[i].shotId = shotId;
  }
  // Prefer settled, interior evidence over motion/cut boundaries. A long time
  // gap alone is not evidence of a continuity change.
  const stability = frames.map((frame, i) => {
    const neighbors = [i - 1, i + 1].filter(j => frames[j]?.shotId === frame.shotId);
    return neighbors.length ? neighbors.reduce((sum, j) =>
      sum + distance(descriptors[i].detail, descriptors[j].detail), 0) / neighbors.length : 1;
  });
  const centers = frames.map(frame => {
    const shot = frames.filter(other => other.shotId === frame.shotId);
    const start = shot[0].timeSeconds, end = shot[shot.length - 1].timeSeconds;
    return Math.abs(frame.timeSeconds - (start + end) / 2) / Math.max(1, end - start);
  });
  // Whole-image averages can erase a tiny watch/prop. Require both a small
  // average AND small local residual before collapsing two evidence frames.
  const equivalent = (a: number, b: number) => {
    const left = descriptors[a].detail, right = descriptors[b].detail;
    if (distance(left, right) >= 0.002) return false;
    for (let i = 0; i < left.length; i++) if (Math.abs(left[i] - right[i]) > 12) return false;
    return true;
  };
  const candidates: { a: number; b: number; similarity: number; rank: number; changed: boolean }[] = [];
  for (let a = 0; a < frames.length; a++) for (let b = a + 1; b < frames.length; b++) {
    if (frames[b].timeSeconds - frames[a].timeSeconds < 1.5) continue;
    const difference = distance(descriptors[a].coarse, descriptors[b].coarse);
    if (difference > 0.12) continue; // A visual gate, not semantic comparability.
    const revisit = frames[a].shotId !== frames[b].shotId;
    const changed = !equivalent(a, b);
    candidates.push({ a, b, similarity: 1 - difference, changed,
      // Bounded novelty keeps small differences in contention without rewarding
      // ever-larger movement/lighting changes. The model must verify all pairs.
      rank: (revisit ? 0.2 : 0) + (changed ? 0.01 : 0) - difference -
        2 * (stability[a] + stability[b]) - 0.005 * (centers[a] + centers[b]) });
  }
  candidates.sort((a, b) => b.rank - a.rank || a.a - b.a || a.b - b.b);
  const selected: typeof candidates = [];
  const uses = new Map<number, number>();
  // First cover distinct visual view groups, then fill with distinct evidence
  // states. Shot IDs alone cannot group A-B-A revisits or repeated cutaways.
  for (const diverse of [true, false]) for (const candidate of candidates) {
    if (selected.length === 4) break;
    const { a, b } = candidate;
    if (selected.length && !candidate.changed) continue;
    if ((uses.get(a) ?? 0) >= 2 || (uses.get(b) ?? 0) >= 2) continue;
    if (selected.some(p => (equivalent(a, p.a) && equivalent(b, p.b)) ||
      (equivalent(a, p.b) && equivalent(b, p.a)))) continue;
    if (diverse && selected.some(p =>
      (distance(descriptors[a].coarse, descriptors[p.a].coarse) < 0.04 &&
        distance(descriptors[b].coarse, descriptors[p.b].coarse) < 0.04) ||
      (distance(descriptors[a].coarse, descriptors[p.b].coarse) < 0.04 &&
        distance(descriptors[b].coarse, descriptors[p.a].coarse) < 0.04))) continue;
    selected.push(candidate);
    uses.set(a, (uses.get(a) ?? 0) + 1); uses.set(b, (uses.get(b) ?? 0) + 1);
    if (selected.length === 4) break;
  }
  return selected.map(({ a, b, similarity }, i) => ({
    id: `pair-${String(i).padStart(3, '0')}`, referenceFrameId: frames[a].id,
    candidateFrameId: frames[b].id, score: Number(similarity.toFixed(4)),
  }));
}

export async function extractVideo(buffer: Buffer, mimeType: string, signal?: AbortSignal): Promise<{
  duration: number; frames: Keyframe[]; pairs: FramePair[]; directory: string;
}> {
  if (!VIDEO_MIME_TYPES.includes(mimeType as typeof VIDEO_MIME_TYPES[number]))
    throw new VideoError('UNSUPPORTED_VIDEO', 'Use MP4, WebM, or MOV video.', 400);
  if (!buffer.length || buffer.length > MAX_VIDEO_BYTES)
    throw new VideoError('VIDEO_SIZE', 'Upload one non-empty video, at most 64 MiB.', 413);
  const directory = await mkdtemp(path.join(tmpdir(), 'continuity-video-'));
  try {
    const source = path.join(directory, 'clip');
    await writeFile(source, buffer, { flag: 'wx' });
    const probe = JSON.parse(await runMediaTool('ffprobe', [
      '-v', 'error', '-protocol_whitelist', 'file', '-format_whitelist', 'mov,matroska,webm', '-threads', '2', '-max_alloc', '67108864',
      '-probesize', '5000000', '-analyzeduration', '5000000', '-select_streams', 'v:0',
      '-show_entries', 'format=duration,format_name:stream=width,height,duration,avg_frame_rate', '-of', 'json', source,
    ], 8_000, signal)) as { format?: { duration?: string; format_name?: string }; streams?: { width?: number; height?: number; duration?: string; avg_frame_rate?: string }[] };
    const stream = probe.streams?.[0];
    const duration = Number(stream?.duration ?? probe.format?.duration);
    if (!stream || !Number.isFinite(duration) || duration < 15 || duration > 60)
      throw new VideoError('VIDEO_DURATION', 'Video must be between 15 and 60 seconds.');
    // Reject playlist/demuxer surprises even when the client claims video/mp4.
    if (!probe.format?.format_name?.split(',').some(name => ['mov', 'mp4', 'matroska', 'webm'].includes(name)))
      throw new VideoError('UNSUPPORTED_VIDEO', 'Container must be MP4, WebM, or MOV.');
    const [numerator, denominator] = (stream.avg_frame_rate ?? '0/1').split('/').map(Number);
    const fps = numerator / denominator;
    if (!stream.width || !stream.height || stream.width > 4096 || stream.height > 4096 ||
      stream.width * stream.height > 8_847_360 || !Number.isFinite(fps) || fps > 120)
      throw new VideoError('VIDEO_DIMENSIONS', 'Video exceeds supported dimensions or frame rate.');
    // Select actual decoded frames, not synthetic fps-filter duplicates. showinfo
    // supplies their source presentation times; model never supplies timestamps.
    const interval = Math.max(0.5, duration / 39);
    const log = await runMediaTool('ffmpeg', [
      '-hide_banner', '-nostdin', '-loglevel', 'info', '-protocol_whitelist', 'file', '-format_whitelist', 'mov,matroska,webm',
      '-threads', '2', '-max_alloc', '67108864', '-probesize', '5000000', '-analyzeduration', '5000000', '-i', source,
      '-map', '0:v:0', '-an', '-sn', '-dn', '-t', '60', '-filter_threads', '1',
      '-vf', `setpts=PTS-STARTPTS,select='isnan(prev_selected_t)+gte(t-prev_selected_t,${interval})',scale=640:-2,showinfo`,
      '-fps_mode', 'vfr', '-frames:v', '40', '-threads', '2', '-q:v', '3', '-start_number', '0', path.join(directory, 'frame-%03d.jpg'),
    ], 35_000, signal);
    const timestamps = [...log.matchAll(/\bn:\s*\d+\s+pts:\s*-?\d+\s+pts_time:([\d.eE+-]+)/g)].map(match => Number(match[1]));
    const frames: Keyframe[] = [];
    const descriptors: Descriptor[] = [];
    for (let i = 0; i < Math.min(40, timestamps.length); i++) {
      const timeSeconds = timestamps[i];
      if (!Number.isFinite(timeSeconds) || timeSeconds < 0 || timeSeconds >= duration || (i && timeSeconds <= timestamps[i - 1]))
        throw new VideoError('INVALID_TIMESTAMPS', 'Video has unsupported frame timing.');
      const id = `frame-${String(i).padStart(3, '0')}`;
      const image = await readFile(path.join(directory, `${id}.jpg`));
      descriptors.push({
        coarse: await sharp(image).resize(16, 9, { fit: 'fill' }).removeAlpha().raw().toBuffer(),
        detail: await sharp(image).resize(64, 36, { fit: 'fill' }).removeAlpha().raw().toBuffer(),
      });
      frames.push({ id, timeSeconds, shotId: 0 });
    }
    if (frames.length < 2) throw new VideoError('VIDEO_FRAMES', 'Video did not contain enough decodable frames.');
    const pairs = selectFramePairs(frames, descriptors);
    if (!pairs.length) throw new VideoError('NO_COMPARABLE_FRAMES', 'No similar revisited views were found. Try a clip showing the same subject or setup again.');
    return { duration, frames, pairs, directory };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    if (error instanceof VideoError) throw error;
    throw new VideoError('INVALID_VIDEO', 'Video could not be processed.');
  }
}
