import { describe, expect, it } from 'vitest';
import { countCandidatePairs, selectPairs, type PairFrame } from './video-pairs';

const frame = (index: number, shotIndex: number, timestampSeconds: number): PairFrame => ({ id: `k${index}`, index, shotIndex, timestampSeconds });
const key = (pairs: ReturnType<typeof selectPairs>) => pairs.map(([a, b]) => `${a.id}>${b.id}`);

describe('frame-pair selection', () => {
  const three = [frame(0, 0, 1), frame(1, 1, 3), frame(2, 2, 5)];
  it('compares neighbouring shots first, then first against last', () => {
    expect(key(selectPairs(three, 8))).toEqual(['k0>k1', 'k1>k2', 'k0>k2']);
  });
  it('honors the comparison cap', () => {
    expect(key(selectPairs(three, 2))).toEqual(['k0>k1', 'k1>k2']);
    expect(selectPairs(three, 0)).toEqual([]);
  });
  it('always orders earlier before later and never pairs a frame with itself', () => {
    for (const [a, b] of selectPairs(three, 8)) { expect(a.timestampSeconds).toBeLessThan(b.timestampSeconds); expect(a.id).not.toBe(b.id); }
  });
  it('compares first and last frame inside a single long shot', () => {
    expect(key(selectPairs([frame(0, 0, 2), frame(1, 0, 6), frame(2, 0, 10)], 4))).toEqual(['k0>k2']);
  });
  it('returns nothing for fewer than two frames', () => {
    expect(selectPairs([], 4)).toEqual([]);
    expect(selectPairs([frame(0, 0, 1)], 4)).toEqual([]);
  });
  it('stays far below exhaustive comparison for many frames', () => {
    const many = Array.from({ length: 24 }, (_, i) => frame(i, Math.floor(i / 3), i));
    expect(selectPairs(many, 4)).toHaveLength(4);
    expect(countCandidatePairs(many)).toBeLessThan((24 * 23) / 2);
  });
  it('is deterministic and does not depend on input order', () => {
    expect(key(selectPairs([...three].reverse(), 8))).toEqual(key(selectPairs(three, 8)));
  });
});
