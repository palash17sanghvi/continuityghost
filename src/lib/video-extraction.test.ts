import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createVideoFixture } from '../../scripts/create-video-fixture';
import { extractVideo, MAX_VIDEO_BYTES, runMediaTool, selectFramePairs } from './video-extraction';
import type { Keyframe } from './video-contract';

let directory: string, buffer: Buffer;
beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'video-extraction-test-'));
  await createVideoFixture(path.join(directory, 'watch.mp4'));
  buffer = await readFile(path.join(directory, 'watch.mp4'));
}, 30_000);
afterAll(async () => { if(directory) await rm(directory, {recursive:true,force:true}); });
describe('actual offline ffmpeg extraction', () => {
  it('grounds timestamps, detects visual transitions and selects the revisited watch-change view deterministically', async () => {
    const first = await extractVideo(buffer, 'video/mp4');
    const second = await extractVideo(buffer, 'video/mp4');
    try {
      expect(first.duration).toBe(15);
      expect(first.frames.length).toBeGreaterThan(20); expect(first.frames.length).toBeLessThanOrEqual(40);
      expect(first.frames).toEqual(second.frames); expect(first.pairs).toEqual(second.pairs);
      expect(new Set(first.frames.map(f=>f.shotId)).size).toBe(3);
      expect(first.pairs.length).toBeLessThanOrEqual(4);
      const frames = new Map(first.frames.map(f=>[f.id,f]));
      expect(first.pairs.some(p=>frames.get(p.referenceFrameId)!.timeSeconds<5 && frames.get(p.candidateFrameId)!.timeSeconds>=8)).toBe(true);
      // Stable repeated views collapse instead of paying for eight near-identical comparisons.
      expect(first.pairs.length).toBeLessThanOrEqual(2);
      for (const frame of first.frames) {
        expect(frame.timeSeconds).toBeGreaterThanOrEqual(0); expect(frame.timeSeconds).toBeLessThan(15);
        expect(frame.timeSeconds * 10).toBeCloseTo(Math.round(frame.timeSeconds * 10), 5);
      }
      expect(await readdir(first.directory)).toContain('clip');
      expect((await readFile(path.join(first.directory, 'frame-000.jpg'))).subarray(0,2)).toEqual(Buffer.from([255,216]));
    } finally { await Promise.all([first,second].map(x=>rm(x.directory,{recursive:true,force:true}))); }
  },30_000);
  it('rejects malformed media, unsupported type, oversize and cancelled processing', async () => {
    await expect(extractVideo(Buffer.from('not media'),'video/mp4')).rejects.toMatchObject({code:'INVALID_VIDEO'});
    await expect(extractVideo(buffer,'text/plain')).rejects.toMatchObject({code:'UNSUPPORTED_VIDEO'});
    await expect(extractVideo(Buffer.alloc(MAX_VIDEO_BYTES+1),'video/mp4')).rejects.toMatchObject({code:'VIDEO_SIZE'});
    await expect(extractVideo(buffer,'video/mp4',AbortSignal.abort())).rejects.toMatchObject({code:'VIDEO_CANCELLED'});
  });
  it('rejects valid but too-short media before extraction', async () => {
    const short = path.join(directory,'short.mp4');
    await runMediaTool('ffmpeg',['-hide_banner','-nostdin','-loglevel','error','-y','-i',path.join(directory,'watch.mp4'),'-t','1','-c','copy',short]);
    await expect(extractVideo(await readFile(short),'video/mp4')).rejects.toMatchObject({code:'VIDEO_DURATION'});
  });
  it('does not force unrelated backgrounds into comparisons', () => {
    const frames:Keyframe[]=[{id:'frame-000',timeSeconds:0,shotId:0},{id:'frame-001',timeSeconds:3,shotId:0}];
    expect(selectFramePairs(frames,[{coarse:Buffer.alloc(432,0),detail:Buffer.alloc(6912,0)},{coarse:Buffer.alloc(432,255),detail:Buffer.alloc(6912,255)}])).toEqual([]);
  });
});
