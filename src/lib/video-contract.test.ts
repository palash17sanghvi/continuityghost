import {describe, expect, it} from 'vitest';
import {startAnalysisRequestSchema, timelineFindingSchema, VIDEO_LIMITS} from './video-contract';

const finding = {
  id: '3f1d6a7e-52c4-4c61-9a0e-0f1f6c6f2a11', analysisId: '9b7a1c52-0d3e-4f6b-8a45-6f2d1e0c7b99',
  source: 'mock', category: 'props', description: 'Watch present, then absent.', potentialIssue: 'Prop may have vanished.',
  uncertainty: 'Wrist may be out of frame.', suggestedAction: 'Check script notes.',
  earlierEvidence: 'Watch on left wrist.', laterEvidence: 'Bare wrist.', severity: null, confidence: null,
  earlier: {keyframeId: 'k1', timestampSeconds: 3.2, imageUrl: '/a'}, later: {keyframeId: 'k2', timestampSeconds: 11.8, imageUrl: '/b'},
  status: 'unreviewed', note: '',
};

describe('video contract', () => {
  it('accepts a finding with both timestamps and frame references', () => {
    expect(timelineFindingSchema.parse(finding).later.timestampSeconds).toBe(11.8);
  });
  it('requires a source so mock data cannot pass as a detection', () => {
    expect(timelineFindingSchema.safeParse({...finding, source: undefined}).success).toBe(false);
    expect(timelineFindingSchema.safeParse({...finding, source: 'other'}).success).toBe(false);
  });
  it('rejects a finding missing a frame reference', () => {
    expect(timelineFindingSchema.safeParse({...finding, later: undefined}).success).toBe(false);
  });
  it('requires consent and cost approval and caps comparisons', () => {
    expect(startAnalysisRequestSchema.safeParse({consent: true, costApproved: true}).success).toBe(true);
    expect(startAnalysisRequestSchema.safeParse({consent: true}).success).toBe(false);
    expect(startAnalysisRequestSchema.safeParse({consent: true, costApproved: true, maxComparisons: VIDEO_LIMITS.maxComparisonsCeiling + 1}).success).toBe(false);
    expect(startAnalysisRequestSchema.safeParse({consent: true, costApproved: true, extra: 1}).success).toBe(false);
  });
});
