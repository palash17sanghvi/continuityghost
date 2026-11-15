import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeColorVideo } from './video-test-helpers';
import { MAX_KEYFRAMES, MediaError, detectShots, extractFrame, inspectVideo, parseCuts, parseInfo, planKeyframes, shotsFromCuts } from './video-ffmpeg';

describe('FFmpeg output parsing', () => {
  const sample = `Input #0, mov,mp4, from 'x.mp4':\n  Duration: 00:00:18.04, start: 0.000000, bitrate: 43 kb/s\n  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(progressive), 960x672 [SAR 1:1 DAR 10:7], 39 kb/s, 12 fps, 12 tbr, 10240 tbn (default)`;
  it('reads duration, size, fps and codec', () => {
    expect(parseInfo(sample)).toEqual({ durationSeconds: 18.04, width: 960, height: 672, fps: 12, codec: 'h264' });
  });
  it('rejects output without a video stream', () => {
    expect(() => parseInfo('Error opening input')).toThrowError(MediaError);
  });
  it('reads scene-cut times', () => {
    expect(parseCuts('[Parsed_showinfo_1 @ 0x1] n: 0 pts: 72 pts_time:6 \n pts_time:12.5 ')).toEqual([6, 12.5]);
  });
  it('drops cuts too close to the start, the end or each other', () => {
    expect(shotsFromCuts([0.2, 5, 5.3, 9.9], 10).map(s => [s.start, s.end])).toEqual([[0, 5], [5, 10]]);
  });
});

describe('keyframe planning', () => {
  it('takes one mid-shot frame per short shot', () => {
    expect(planKeyframes(shotsFromCuts([2, 4], 6), 6).map(f => [f.index, f.shotIndex, f.timestampSeconds])).toEqual([[0, 0, 1], [1, 1, 3], [2, 2, 5]]);
  });
  it('adds frames inside long shots and never exceeds the cap', () => {
    expect(planKeyframes([{ index: 0, start: 0, end: 20 }], 20).map(f => f.timestampSeconds)).toEqual([4, 10, 16]);
    const cuts = Array.from({ length: 40 }, (_, i) => (i + 1) * 1.4);
    const frames = planKeyframes(shotsFromCuts(cuts, 58), 58);
    expect(frames.length).toBeLessThanOrEqual(MAX_KEYFRAMES);
    expect(frames.map(f => f.index)).toEqual(frames.map((_, i) => i));
  });
  it('keeps timestamps inside the video', () => {
    for (const f of planKeyframes(shotsFromCuts([], 5), 5)) { expect(f.timestampSeconds).toBeGreaterThanOrEqual(0); expect(f.timestampSeconds).toBeLessThan(5); }
  });
});

describe('real FFmpeg extraction and timestamp accuracy', () => {
  let dir: string; let file: string;
  beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), 'cg-ffmpeg-')); file = join(dir, 'colors.mp4'); await makeColorVideo(file); }, 60_000);
  afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

  it('inspects the video without ffprobe', async () => {
    const info = await inspectVideo(file);
    expect(info.durationSeconds).toBeCloseTo(6, 0); expect([info.width, info.height, info.codec]).toEqual([160, 120, 'h264']); expect(info.fps).toBeCloseTo(10, 0);
  });
  it('finds both shot boundaries within 0.25 s', async () => {
    const info = await inspectVideo(file);
    const shots = await detectShots(file, info.durationSeconds);
    expect(shots).toHaveLength(3);
    expect(shots[1].start).toBeCloseTo(2, 0); expect(Math.abs(shots[1].start - 2)).toBeLessThan(0.25); expect(Math.abs(shots[2].start - 4)).toBeLessThan(0.25);
  });
  it('extracts the frame that really sits at each planned timestamp', async () => {
    const info = await inspectVideo(file);
    const planned = planKeyframes(await detectShots(file, info.durationSeconds), info.durationSeconds);
    const dominant: string[] = [];
    for (const frame of planned) {
      const out = join(dir, `f${frame.index}.jpg`);
      await extractFrame(file, frame.timestampSeconds, out);
      const { data, info: img } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
      const at = ((img.height >> 1) * img.width + (img.width >> 1)) * img.channels;
      const luma = data[at];
      dominant.push(luma < 50 ? 'black' : luma > 200 ? 'white' : luma > 90 && luma < 170 ? 'gray' : `other(${luma})`);
    }
    expect(planned.map(f => f.timestampSeconds)).toEqual([1, 3, 5]);
    expect(dominant).toEqual(['black', 'white', 'gray']);
  });
  it('reports a clear error for a non-video file', async () => {
    const bad = join(dir, 'bad.mp4');
    await (await import('node:fs/promises')).writeFile(bad, Buffer.from('not a video at all'));
    await expect(inspectVideo(bad)).rejects.toMatchObject({ status: 400 });
  });
});
