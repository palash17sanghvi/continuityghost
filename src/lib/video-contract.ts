// Browser-safe wire contract for the video-first MVP. PROPOSED: server routes are not implemented yet.
// Never import provider/database modules here. See docs/video-api.md.
import {z} from 'zod';
import {categorySchema, reviewStatusSchema} from './api-contract';

export const VIDEO_LIMITS = {
  maxBytes: 50 * 1024 * 1024,
  minDurationSeconds: 5,
  maxDurationSeconds: 60,
  mimeType: 'video/mp4',
  maxComparisonsDefault: 4,
  maxComparisonsCeiling: 8,
} as const;

const id = z.string().min(1).max(120);
const iso = z.string();
const evidence = z.string().trim().min(1).max(3000);

export const videoStatusSchema = z.enum(['uploaded', 'processing', 'ready', 'failed']);
export const videoSchema = z.object({
  id, projectId: id, sceneId: id,
  title: z.string(),
  status: videoStatusSchema,
  durationSeconds: z.number().nullable(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  fps: z.number().nullable(),
  sizeBytes: z.number().int(),
  createdAt: iso,
  error: z.string().nullable(),
  /** Relative URL for <video src>. Supports HTTP Range. Requires the session cookie. */
  streamUrl: z.string(),
});

export const keyframeSchema = z.object({
  id, videoId: id,
  index: z.number().int().nonnegative(),
  /** Real position in the source video, measured by FFmpeg. */
  timestampSeconds: z.number().nonnegative(),
  shotIndex: z.number().int().nonnegative(),
  /** Relative JPEG URLs. Require the session cookie. */
  imageUrl: z.string(),
  thumbnailUrl: z.string(),
  width: z.number().int(), height: z.number().int(),
});

export const analysisStatusSchema = z.enum(['queued', 'running', 'completed', 'completed_with_errors', 'failed']);
export const analysisErrorCodeSchema = z.enum([
  'provider_timeout', 'provider_quota', 'provider_rejected', 'malformed_response', 'comparison_limit_reached', 'provider_disabled', 'internal',
]);
/** `gemini` = real model output. `mock` = local development fixture; the UI must label it and never treat it as a detection. */
export const findingSourceSchema = z.enum(['gemini', 'mock']);

export const videoAnalysisSchema = z.object({
  id, videoId: id, projectId: id, sceneId: id,
  status: analysisStatusSchema,
  source: findingSourceSchema,
  model: z.string().nullable(),
  startedAt: iso, completedAt: iso.nullable(),
  keyframeCount: z.number().int(),
  pairsPlanned: z.number().int(),
  pairsCompleted: z.number().int(),
  pairsFailed: z.number().int(),
  maxComparisons: z.number().int(),
  errors: z.array(z.object({code: analysisErrorCodeSchema, message: z.string(), pairIndex: z.number().int().nullable()})),
});

export const timelineFindingSchema = z.object({
  /** UUID. Pass as findingId to the existing POST /api/reviews. */
  id: z.string().uuid(),
  analysisId: z.string().uuid(),
  source: findingSourceSchema,
  category: categorySchema,
  /** Observed difference. */
  description: evidence,
  /** Why it might be a continuity issue. Not a verdict. */
  potentialIssue: evidence,
  uncertainty: evidence,
  suggestedAction: evidence,
  earlierEvidence: evidence,
  laterEvidence: evidence,
  severity: z.enum(['low', 'medium', 'high']).nullable(),
  confidence: z.object({level: z.enum(['tentative', 'supported', 'strong']), basis: evidence}).nullable(),
  earlier: z.object({keyframeId: id, timestampSeconds: z.number(), imageUrl: z.string()}),
  later: z.object({keyframeId: id, timestampSeconds: z.number(), imageUrl: z.string()}),
  /** AI observations stay `unreviewed` until a person decides. Only `confirmed` means a reviewer called it a mistake. */
  status: z.enum(['unreviewed', ...reviewStatusSchema.options]),
  note: z.string(),
});

export const timelineSchema = z.object({
  video: videoSchema,
  analysis: videoAnalysisSchema,
  keyframes: z.array(keyframeSchema),
  findings: z.array(timelineFindingSchema),
});

export const uploadVideoResponseSchema = z.object({video: videoSchema});
export const startAnalysisRequestSchema = z.object({
  consent: z.literal(true),
  costApproved: z.literal(true),
  maxComparisons: z.number().int().min(1).max(VIDEO_LIMITS.maxComparisonsCeiling).optional(),
}).strict();
export const startAnalysisResponseSchema = z.object({analysis: videoAnalysisSchema});

export type Video = z.infer<typeof videoSchema>;
export type Keyframe = z.infer<typeof keyframeSchema>;
export type VideoAnalysis = z.infer<typeof videoAnalysisSchema>;
export type TimelineFinding = z.infer<typeof timelineFindingSchema>;
export type Timeline = z.infer<typeof timelineSchema>;
export type StartAnalysisRequest = z.infer<typeof startAnalysisRequestSchema>;
