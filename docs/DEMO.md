# Local demo runbook

## Start safely

1. With dependencies already installed, run `npm run dev -- --hostname 127.0.0.1` and open http://127.0.0.1:3000. Install dependencies separately if needed. No public deployment or tunnels: this build has no authentication.
2. For a no-provider walkthrough, privately ensure `ALLOW_PAID_ANALYSIS=false`, `ALLOW_SUPERMEMORY=false` and `ALLOW_DATABASE=false`, then restart. Do not display environment files, keys or authorization headers. Local saved reports/media can still exist with all three flags off.
3. Explain current scope: upload one clip, automatic frame/pair selection, Gemini evidence review, timeline navigation, durable local saves, optional PostgreSQL metadata and separately consented remote memory. Legacy two-still APIs remain internal; video and persistence are implemented, vendor imports are not.

## Walkthrough without a real API call

Show video upload, project/scene/context, data disclosure and separate cost approval. Leave approvals unchecked; do not enable services or press an enabled paid analysis button. Explain server gates independently enforce key plus `ALLOW_PAID_ANALYSIS=true` and request approvals. This is a **UI/gate walkthrough**, not AI detection.

A previously saved report can be shown as a **recorded result**, with its analysis ID and source limitations. Reload/history/media reads use local storage and may query PostgreSQL if enabled; disable it for a no-database walkthrough. Do not Save with remote-memory consent enabled during an offline demo. Test fixtures, intercepted browser responses and mock screenshots must be labeled as such, not live Gemini output.

`npm test` exercises mocked external providers, real local FFmpeg fixtures and disposable embedded PGlite SQL. Build/lint/test success is not live sponsor verification. Current receipt and historical provider evidence are separated in [integration verification](INTEGRATION-VERIFICATION.md).

## Authorized real automatic-video demo

These instructions authorize nothing by themselves. Obtain explicit owner approval for each external service, possible charges and any database writes before proceeding.

1. Configure Gemini privately using [credential setup](CREDENTIAL-SETUP.md); enable `ALLOW_PAID_ANALYSIS=true` only with cost approval and restart. Keep optional database/Supermemory disabled unless separately approved. Source default is `gemini-3.6-flash`; an environment override may differ.
2. Choose one owned/approved MP4, WebM or MOV: 15–60 seconds, nonempty, ≤64 MiB. Enter stable project/scene IDs and optional context. The server persists the clip and extracted frames locally; selected JPEGs, context and included saved human rules go to Gemini. Explicitly check data/cost approvals. Remote-memory consent is separate.
3. Submit once. Show processing, then only actual response or honest error. Similarity heuristics can find no comparable pair; Gemini may return no findings. Do not promise the synthetic watch example will always be detected or auto-retry a failed billable call.
4. Open a finding/marker. Show both extracted frames, sampled timestamps, uncertainty and suggested action. Use evidence timestamp buttons to seek the visible video player. Timestamps are sampled evidence, not exact mistake onset; apparent changes may be intended action, lighting, reverse angle or occlusion.
5. Mark confirmed/dismissed/intentional, add a note and Save. Check save result and persistence warning; remote-memory sharing is optional. Export, then reload/reopen history to verify the saved decision. Unsaved drafts are not persisted merely by exporting; honor leave warnings. Turn paid/optional services off privately and restart when finished, according to owner policy.

Local persistence survives reload while the server disk is retained. `local` means on-disk, not browser-only and not Tiger Data. `postgres` confirms metadata/report persistence; video/JPEG bytes remain on the local server. Database fallback warnings must stay visible. Saving a human review and queuing Supermemory ingestion are distinct outcomes; queued is not indexed or retrieved.

## Optional memory demonstration

Only with separately approved Supermemory credentials/flag and explicit browser consent: share a supported human review, distinguish save from ingestion status, then obtain approval for a subsequent Gemini analysis with retrieval consent. Inspect actual retrieved provenance and canonical decision content. An empty search is not proof of indexing; do not poll/retry indefinitely or claim a changed model interpretation without a recorded before/after result. Saved local/PostgreSQL human rules can already be reused without Supermemory consent; remote recall is optional.

The Tiger-only certificate-verification bypass described in historical records is not a demo prerequisite. Keep verified TLS; changing it needs explicit approval. Never use a global TLS-disable flag. Legacy `/api/analytics` reports still/event SQL aggregates; do not present it as complete automatic-video analytics or claim live Timescale from a `postgres` save.

## If something fails

| Symptom | Action |
| --- | --- |
| Analysis disabled / missing approval | Keep demo blocked; configure privately only with owner permission. Do not bypass independent server/browser gates. |
| Invalid, oversized or unprocessable video / no comparable pair | Use a valid bounded clip with visible comparable views; do not rename files to disguise type. |
| Provider error / invalid output / timeout | Show error honestly. Inspect redacted diagnostic codes, not footage/secrets. A timeout can still cost money; ask before retrying. |
| Save/history/player failure | Keep review drafts open, use offered retry, and inspect save/persistence warnings. Saved history failure is not an empty history. Player retry should preserve draft. |
| Memory queued/unavailable or PostgreSQL fallback | State partial result precisely: saved locally is not confirmed remotely; ingestion acceptance is not successful recall. |

## Pitch and historical context

Suggested pitch: “ContinuityGhost is a local-first continuity review tool. Upload a short clip; it selects comparable evidence frames, asks Gemini for possible visual differences, and lets humans inspect, decide and save. Sampling can miss changes and visible differences are not automatically mistakes. PostgreSQL and separately consented Supermemory are optional.”

Award context supplied by the project owner: **Winner — Best Use of Gemini API | SunHacks 2026**, November 15, 2026, four-person team. This documentation audit did not independently verify the award. Historical event schedule/track research remains in [SPONSORS](SPONSORS.md); do not treat pre-submission track uncertainty as a current application limitation or imply additional awards. Recorded live Gemini, Supermemory and Tiger results are in [AUTOMATIC-VIDEO](AUTOMATIC-VIDEO.md) and [integration verification](INTEGRATION-VERIFICATION.md), not fresh service checks.
