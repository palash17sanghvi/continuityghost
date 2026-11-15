# Video API contract (PROPOSED)

**Status: contract only.** Routes below are not implemented yet. Build the frontend against `src/lib/video-contract.ts` (Zod, browser-safe). Shapes may change only through a commit that updates both this file and the schema. Existing endpoints in [backend-api.md](backend-api.md) are unchanged.

## Honesty rules the UI must follow

- Every analysis and finding carries `source`: `gemini` (real model output) or `mock` (local development fixture). **Show a visible "MOCK" label on mock data.** Never present mock data as a detection.
- A finding is an AI observation until a person reviews it. `status: "unreviewed"` means unconfirmed. Only `confirmed` means a reviewer called it a continuity mistake.
- Not every visual difference is an error. Camera angle, lighting and scripted action can explain a difference. Show `uncertainty` next to each finding.
- Live Gemini is **not yet verified** for images. `gemini-3.8-flash` timed out (504) on every image attempt. `gemini-3.5-flash-lite` returned 400 INVALID_ARGUMENT on its one approved attempt. Expect `mock` until a live call succeeds.

## Auth, scope, limits

- Same as the rest of the API: `POST /api/session {token}` sets an HttpOnly cookie. All routes below need it. Unauthenticated 401. Cross-origin mutations 403.
- Videos belong to one `projectId/sceneId`. Another scene's video returns 404.
- Upload limits: one MP4 (`video/mp4`, H.264 recommended), at most 50 MiB, 5 to 60 seconds. Constants are in `VIDEO_LIMITS`.
- Analysis cap: `maxComparisons` default 4, ceiling 8. The server picks frame pairs across shots, never frame-by-frame.

## Endpoints

`V = /api/projects/:projectId/scenes/:sceneId/videos`

| Method and path | Purpose | Success |
|---|---|---|
| `POST V` | Upload. `multipart/form-data`: `video` (file), optional `title`. | 201 `{video}` |
| `GET V` | List videos in the scene. Standard page `{items,total,limit,offset}`. | 200 |
| `GET V/:videoId` | Video metadata. | 200 `{video}` |
| `GET V/:videoId/stream` | MP4 bytes for `<video src>`. Supports `Range`. | 200 or 206 |
| `GET V/:videoId/keyframes` | All extracted keyframes with real timestamps. | 200 `{items: Keyframe[]}` |
| `GET V/:videoId/keyframes/:keyframeId/image` | Full-size JPEG. Add `?size=thumb` for a thumbnail. | 200 `image/jpeg` |
| `POST V/:videoId/analyses` | Start analysis. Body `{consent:true, costApproved:true, maxComparisons?}`. | 202 `{analysis}` (status `queued`) |
| `GET V/:videoId/analyses/:analysisId` | Poll status. Poll every 2 s, stop on `completed`, `completed_with_errors` or `failed`. | 200 `{analysis}` |
| `GET V/:videoId/analyses/:analysisId/timeline` | Everything the UI needs in one call: video, analysis, keyframes, findings. | 200 `Timeline` |
| `POST /api/reviews` | **Existing endpoint, unchanged.** Send the timeline finding's `id` as `findingId` and the analysis `id` as `analysisId`. Include a fresh `idempotencyKey` UUID per click. `confirmed` is Confirm, `dismissed` is Dismiss. | 200 |

Re-reading the timeline after a review shows the saved `status` and `note`, so a page reload keeps the decision.

## Timeline finding

```jsonc
{
  "id": "uuid",
  "analysisId": "uuid",
  "source": "gemini",            // or "mock"
  "category": "props",
  "description": "Wristwatch visible on left wrist in the earlier frame, absent later.",
  "potentialIssue": "Prop may have disappeared between shots.",
  "uncertainty": "Wrist may be out of frame in the later shot.",
  "suggestedAction": "Check script notes for the watch.",
  "earlierEvidence": "...", "laterEvidence": "...",
  "severity": "medium",          // or null
  "confidence": {"level": "supported", "basis": "..."},   // or null
  "earlier": {"keyframeId": "...", "timestampSeconds": 3.2, "imageUrl": ".../keyframes/<id>/image"},
  "later":   {"keyframeId": "...", "timestampSeconds": 11.8, "imageUrl": ".../keyframes/<id>/image"},
  "status": "unreviewed",        // unreviewed | confirmed | dismissed | intentional
  "note": ""
}
```

Side-by-side view: render `earlier.imageUrl` and `later.imageUrl`. Timeline marker position: `timestampSeconds / video.durationSeconds`. Use `later.timestampSeconds` as the marker and show the earlier time in the panel.

## Analysis status and errors

`status`: `queued`, `running`, `completed`, `completed_with_errors` (some pairs failed, findings from the rest are kept), `failed`.

`errors[].code`:

| Code | Meaning | Suggested UI text |
|---|---|---|
| `provider_timeout` | Gemini deadline passed | "The AI service timed out. Try again later." |
| `provider_quota` | Rate limit or quota (429) | "AI quota reached. Wait before retrying." |
| `provider_rejected` | Gemini returned 400 or 403 | "The AI service rejected the request." |
| `malformed_response` | Output failed schema validation | "The AI returned an unreadable result." |
| `comparison_limit_reached` | More pairs wanted than `maxComparisons` | "Analysis limited to N comparisons." |
| `provider_disabled` | Paid analysis gate is off | "AI analysis is disabled by the owner." |
| `internal` | Server fault | "Something went wrong." |

Upload errors use the existing `{error: string}` body: 400 invalid file or type, 413 too large, 415 not MP4, 422 duration outside 5 to 60 s, 404 unknown scene.

## Persistence plan (backend-side, not frontend work)

New migration adds `videos`, `keyframes` and a `video_findings` link table that points at the existing `findings` rows. This keeps `POST /api/reviews`, idempotency and scope isolation unchanged. Video files and frames live on local disk for the prototype. A local file-backed PostgreSQL mode is planned for demos while the hosted database stays blocked.
