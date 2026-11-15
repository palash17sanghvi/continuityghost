export type PairFrame = { id: string; index: number; timestampSeconds: number; shotIndex: number };
export type FramePair = [earlier: PairFrame, later: PairFrame];

/**
 * Choose a small, deterministic set of frame pairs across shots. Never exhaustive.
 * Priority: neighbouring shots, then first vs last shot, then wider shot gaps, then spread inside one long shot.
 */
export function selectPairs(frames: PairFrame[], max: number): FramePair[] {
  if (max < 1 || frames.length < 2) return [];
  const sorted = [...frames].sort((a, b) => a.timestampSeconds - b.timestampSeconds || a.index - b.index);
  const byShot = new Map<number, PairFrame[]>();
  for (const frame of sorted) byShot.set(frame.shotIndex, [...(byShot.get(frame.shotIndex) ?? []), frame]);
  const shotIds = [...byShot.keys()].sort((a, b) => a - b);
  const rep = (shot: number) => { const list = byShot.get(shot)!; return list[Math.floor((list.length - 1) / 2)]; };
  const candidates: FramePair[] = [];
  for (let i = 0; i + 1 < shotIds.length; i++) candidates.push([rep(shotIds[i]), rep(shotIds[i + 1])]);
  if (shotIds.length >= 3) candidates.push([rep(shotIds[0]), rep(shotIds[shotIds.length - 1])]);
  for (let gap = 2; gap < shotIds.length - 1; gap++) for (let i = 0; i + gap < shotIds.length; i++) candidates.push([rep(shotIds[i]), rep(shotIds[i + gap])]);
  for (const shot of shotIds) { const list = byShot.get(shot)!; if (list.length >= 2) candidates.push([list[0], list[list.length - 1]]); }
  const seen = new Set<string>(); const pairs: FramePair[] = [];
  for (const pair of candidates) {
    const key = `${pair[0].id}|${pair[1].id}`;
    if (pair[0].id === pair[1].id || seen.has(key)) continue;
    seen.add(key); pairs.push(pair);
  }
  return pairs.slice(0, max);
}
export function countCandidatePairs(frames: PairFrame[]): number { return selectPairs(frames, Number.MAX_SAFE_INTEGER).length; }
