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
  it.each([false, true])('keeps a single static 15s view comparable (watch disappears: %s)', async disappears => {
    const file = path.join(directory, `static-${disappears}.mp4`);
    const watch = `drawbox=x=180:y=240:w=34:h=40:color=black:t=fill${disappears ? ":enable='lt(t,7.5)'" : ''}`;
    await runMediaTool('ffmpeg', ['-hide_banner','-nostdin','-loglevel','error','-y','-filter_threads','1',
      '-f','lavfi','-i',`color=c=0x303d52:s=640x360:r=10:d=15,drawbox=x=160:y=240:w=320:h=40:color=tan:t=fill,${watch}`,
      '-an','-c:v','libx264','-preset','ultrafast','-threads','2','-pix_fmt','yuv420p',file]);
    const extracted = await extractVideo(await readFile(file), 'video/mp4');
    try {
      expect(new Set(extracted.frames.map(frame => frame.shotId)).size).toBe(1);
      expect(extracted.pairs).toHaveLength(1);
      const pair = extracted.pairs[0];
      const before = extracted.frames.find(frame => frame.id === pair.referenceFrameId)!;
      const after = extracted.frames.find(frame => frame.id === pair.candidateFrameId)!;
      if (disappears) {
        expect(before.timeSeconds).toBeLessThan(7.5);
        expect(after.timeSeconds).toBeGreaterThanOrEqual(7.5);
      } else {
        expect(before.timeSeconds).toBeGreaterThan(0);
        expect(after.timeSeconds).toBeLessThan(14);
      }
    } finally { await rm(extracted.directory, {recursive:true,force:true}); }
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

describe('stable and diverse comparison evidence', () => {
  const describeFrames = (values: { view: number; state?: number; motion?: number }[]) => {
    const frames: Keyframe[] = values.map((_, i) => ({ id:`frame-${i}`,timeSeconds:i,shotId:0 }));
    const descriptors = values.map(({ view, state = 0, motion = 0 }) => {
      const detail = Buffer.alloc(1000, view + motion);
      detail[100] = view + state;
      return { coarse:Buffer.alloc(48, view + motion), detail };
    });
    return { frames, descriptors };
  };
  const indices = (pair: { referenceFrameId: string; candidateFrameId: string }) =>
    [Number(pair.referenceFrameId.slice(6)), Number(pair.candidateFrameId.slice(6))];

  it('preserves a localized change below whole-frame average dedupe thresholds', () => {
    const values = Array.from({length:15}, (_, i) => ({view:60,state:i < 7 ? 0 : 80}));
    const {frames,descriptors} = describeFrames(values);
    const pairs = selectFramePairs(frames,descriptors);
    expect(pairs).toHaveLength(1);
    const [a,b] = indices(pairs[0]);
    expect(a).toBeLessThan(7); expect(b).toBeGreaterThanOrEqual(7);
    expect(a).toBeGreaterThan(0); expect(b).toBeLessThan(14);
  });

  it('prefers settled revisited-view frames over moving endpoints and a cutaway', () => {
    const values = [
      ...[20,0,0,0,20].map(motion => ({view:60,motion,state:0})),
      ...Array.from({length:3}, () => ({view:210,state:0})),
      ...[20,0,0,0,20].map(motion => ({view:60,motion,state:80})),
    ];
    const {frames,descriptors} = describeFrames(values);
    const pairs = selectFramePairs(frames,descriptors);
    const [a,b] = indices(pairs[0]);
    expect(a).toBe(2); expect(b).toBe(10);
    expect(frames[a].shotId).not.toBe(frames[b].shotId);
    expect(pairs.length).toBeLessThanOrEqual(4);
    expect(pairs).toEqual(selectFramePairs(frames,descriptors));
  });

  it('covers two changed view groups before filling repeated evidence in one group', () => {
    const values = [
      ...Array.from({length:5}, () => ({view:30,state:0})),
      ...Array.from({length:5}, () => ({view:180,state:0})),
      ...Array.from({length:5}, () => ({view:30,state:80})),
      ...Array.from({length:5}, () => ({view:180,state:60})),
    ];
    const {frames,descriptors} = describeFrames(values);
    const pairs = selectFramePairs(frames,descriptors);
    expect(pairs).toHaveLength(2);
    expect(new Set(pairs.map(pair => values[indices(pair)[0]].view))).toEqual(new Set([30,180]));
    for (const pair of pairs) {
      const [a,b] = indices(pair);
      expect(values[a].view).toBe(values[b].view);
      expect(values[a].state).not.toBe(values[b].state);
    }
  });

  it('caps five eligible view groups at four distinct comparisons', () => {
    const values = [0,40].flatMap(state => [0,50,100,150,200].flatMap(view =>
      Array.from({length:4}, () => ({view,state}))));
    const {frames,descriptors} = describeFrames(values);
    const pairs = selectFramePairs(frames,descriptors);
    expect(pairs).toHaveLength(4);
    expect(new Set(pairs.map(pair => values[indices(pair)[0]].view)).size).toBe(4);
    expect(new Set(pairs.map(pair => pair.id)).size).toBe(4);
    for (const pair of pairs) {
      const [a,b] = indices(pair);
      expect(values[a].view).toBe(values[b].view);
      expect(values[a].state).not.toBe(values[b].state);
    }
  });

  it('collapses duplicate evidence across A-B-A-B-A revisits, including reversed states', () => {
    const values = [0,80,0].flatMap((state, i) => [
      ...Array.from({length:5}, () => ({view:30,state})),
      ...(i < 2 ? Array.from({length:3}, () => ({view:210,state:0})) : []),
    ]);
    const {frames,descriptors} = describeFrames(values);
    const pairs = selectFramePairs(frames,descriptors);
    expect(pairs).toHaveLength(1);
    const [a,b] = indices(pairs[0]);
    expect(values[a].state).not.toBe(values[b].state);
  });

  it('keeps identical static evidence minimal and centered rather than selecting clip endpoints', () => {
    const {frames,descriptors} = describeFrames(Array.from({length:15}, () => ({view:80})));
    const pairs = selectFramePairs(frames,descriptors);
    expect(pairs).toHaveLength(1);
    const [a,b] = indices(pairs[0]);
    expect(a).toBeGreaterThan(0); expect(b).toBeLessThan(14);
    expect(b-a).toBeGreaterThanOrEqual(1.5);
  });

  it('does not promote brief ordinary motion or lighting spikes over settled evidence', () => {
    const values = Array.from({length:15}, (_, i) => ({view:80,motion:i === 0 || i === 14 ? 25 : 0}));
    const {frames,descriptors} = describeFrames(values);
    const pairs = selectFramePairs(frames,descriptors);
    const [a,b] = indices(pairs[0]);
    expect(values[a].motion).toBe(0); expect(values[b].motion).toBe(0);
    expect(frames.every(frame => frame.shotId === 0)).toBe(true);
    expect(pairs.length).toBeLessThanOrEqual(4);
    // Pixel differences are evidence candidates, never asserted continuity errors.
    expect(Object.keys(pairs[0]).sort()).toEqual(['candidateFrameId','id','referenceFrameId','score']);
  });
});
