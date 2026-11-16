# Integration verification: evidence and runbook

## Evidence labels and current audit boundary

This documentation audit inspected source/tests/migrations and Git history through `e944f1b`. It made **no live provider calls, remote database connections, credential reads or TLS changes**. Source default is `gemini-3.6-flash` (`src/lib/gemini.ts`), not proof of the current private environment or future model availability.

Use these labels consistently:

- **Implemented:** source path exists and was inspected; not proof a remote service currently works.
- **Offline exercised:** actual local test execution, with external provider boundaries mocked and PostgreSQL SQL run in disposable embedded PGlite.
- **Historical live record:** repository reports a previous owner-approved live run; not independently rerun during this audit.
- **Proposed / not established:** future work or acceptance evidence missing. A recorded success in one service does not certify a combined flow or production readiness.

### Current offline receipt

In this audit, `npm test` (`vitest run src`) exited 0: **18 test files, 227 tests passed**, duration **11.09 seconds**. Process-level provider keys/database URL were removed and all service-enable flags were set false for invocation. Tests stub their own fixture credentials/flags and mock external SDK/fetch/`pg` boundaries; PGlite executes SQL in-process and FFmpeg fixtures exercise local media processing. No live Gemini, Supermemory, Tiger Data or Timescale acceptance follows from this result.

This individual receipt covers Vitest only. The complete portfolio pass separately ran lint, TypeScript, production build, browser E2E, and Python helper checks; see [the portfolio verification receipt](VERIFICATION.md). Older numerical receipts in project history are historical snapshots, not current totals. Browser regression tests in `tests/studio.spec.ts` intercept API responses; `playwright.config.ts` starts loopback with all service flags false. Do not run credential helpers, migrations, authenticated health checks or paid probes merely to reproduce offline tests.

## Historical live evidence — not reverified here

Records below come from [AUTOMATIC-VIDEO](AUTOMATIC-VIDEO.md), [DATABASE](DATABASE.md), [MEMORY](MEMORY.md) and the prior version of this runbook. They contain identifiers for traceability, not fabricated new execution receipts.

| Recorded stage | Recorded evidence | Scope / limitation |
| --- | --- | --- |
| Earlier still-engine browser comparison | `gemini-3.6-flash`; captured frames at 0 and 1.5 seconds; HTTP 200 in 19.573 seconds; missing-watch finding; analysis `2c26d2a7-fe56-4d82-a8b3-2b37771f054b`; zero browser errors. | Earlier two-still path, not automatic frame selection. Export check replayed the recorded real response without another paid call; that replay was not new generation. |
| Automatic video Gemini run | One synthetic 15-second geometric clip; 30 extracted frames, three visual groups, one selected pair at 0 and 9 seconds; HTTP 200 in 11.901 seconds; exactly one `gemini-3.6-flash` generation; missing-watch finding. Analysis `42744539-1346-4efd-93fa-e1019cd83ab2`; confirmed review saved locally, reopened after reload and exported; supporting JPEGs loaded, no browser errors. | Original synthetic fixture, not production-footage accuracy evaluation. PostgreSQL and Supermemory were disabled during this generation. |
| Subsequent Supermemory add/recall | Same reviewed synthetic evidence shared with explicit consent. Write accepted queued; exact document GET reportedly returned HTTP 200 with matching scope/content and decision `7f385256-a439-49d0-9175-a8931ce841d9`. Semantic recall returned `ready` and hit `3495894f35f13a2e9c6cc2`; reconciliation returned canonical human-approved content. | Separate memory check with no Gemini generation or Tiger connection. Does not prove a later model changed interpretation because of memory. |
| Subsequent Tiger Data persistence | Three migrations committed/read back; real review endpoint saved existing analysis `42744539-1346-4efd-93fa-e1019cd83ab2`; SQL reportedly confirmed 30 frames, one pair, one finding, three decisions and current confirmed status; reload returned `mode: postgres`. TLS 1.3 / `TLS_AES_256_GCM_SHA384` recorded. | Metadata/decisions remote, media local. Owner approved Tiger-only certificate-verification bypass. No new Gemini/Supermemory calls; no live Timescale hypertable/`time_bucket` evidence. |

These individual records supersede blanket “Gemini blocked on credentials” and “no live sponsor success” statements. They do not establish current credentials/flags/service health, simultaneous three-provider E2E, memory-effectiveness before/after, deletion propagation, production authorization or independent award verification. Historical event/track research is in [SPONSORS](SPONSORS.md).

### Historical failures retained as failures

The prior runbook records a generic 502 after about 43.8 seconds; cause cannot be reconstructed, so it does not prove timeout or schema rejection. A separate one-attempt direct SDK probe with a 90-second timeout returned HTTP 504 after about 88.8 seconds before parsing: upstream timeout, not schema rejection. `gemini-3.8-flash` metadata was reportedly valid while generation repeatedly timed out; later 3.6 runs succeeded. Metadata validity alone is not generation acceptance. These were prior paid/approved actions, not permission to repeat them.

## Implemented paths and safety gates

Primary flow is `/api/video/analyze` → FFprobe/FFmpeg automatic extraction/selection → one Gemini request → durable local report/media plus optional PostgreSQL metadata. `/api/video/reviews`, `/api/video/history`, `/api/video/[analysisId]` and its `/media` route support review, reload and evidence. Legacy `/api/analyze`, `/api/reviews` and `/api/analytics` remain implemented internally; legacy analytics cover still/event tables, not all video activity.

- Video route checks exact same-origin and rejects `Sec-Fetch-Site: cross-site`, disabled key/server gate before decoding, then bounds streamed multipart input and validates request consent/cost approval and actual media. Upload deadline is 30 seconds within a 110-second overall operation; provider budget is at most 65 seconds with finalization reserve. Legacy still request deadline is 80 seconds. SDK `retryOptions.attempts=1` forbids hidden generation retries.
- Same-origin comparison uses validated original Host and request protocol because Next.js can normalize URL host to `localhost`; it does not trust `Forwarded`/`X-Forwarded-*` or equate `localhost` and `127.0.0.1`. This is CSRF defense, **not authentication**. No public/tunneled deployment.
- JSON generation uses `responseMimeType: 'application/json'` and `responseJsonSchema`. Strict local parsing enforces evidence, sizes/counts and pair references. Generation grammar need not encode all local validation limits. No custom `temperature`, `topP` or `topK` is set. Mocks verify construction, not future provider schema compatibility.
- Local video saves are durable on this server disk even with PostgreSQL off. PostgreSQL requires `ALLOW_DATABASE=true` and `DATABASE_URL`; local fallback is explicitly labeled. Remote-memory flag/key plus separate per-request consent gate optional Supermemory calls. Local/PostgreSQL approved rules can still enter subsequent Gemini context without remote-memory consent.
- No provider messages, authorization headers, uploaded data or secrets belong in logs/exports. Classified errors must stay safe. Review save, remote database confirmation, queued memory ingestion and actual recalled provenance are distinct outcomes.

### Safe errors and diagnostics

| Code | HTTP | Owner action |
| --- | --- | --- |
| `GEMINI_AUTH` | 503 | Check key restrictions/project permissions privately; includes 401/403 and structured `API_KEY_INVALID`. |
| `GEMINI_MODEL` | 503 | Check configured model/access privately; metadata lookup requires separate external-call approval. |
| `GEMINI_QUOTA` | 429 | Check quota/rate limit/billing; never enable billing or auto-retry without approval. |
| `GEMINI_TIMEOUT` | 504 | Timeout/cancellation/upstream 408/504; request may still cost money. Ask before retry. |
| `GEMINI_OUTPUT`, `GEMINI_REQUEST`, `GEMINI_FAILED` | 502 | Invalid/empty output, request incompatibility or other provider failure; no synthetic findings accepted. Inspect safe codes, not raw provider bodies. |

Video missing-key/disabled-gate errors use `ANALYSIS_DISABLED` / 503; legacy still missing key is 503 and disabled paid gate is 403. Do not assume both endpoints have identical status behavior. `GET /api/health` currently returns local configuration booleans and model name only; it performs no authenticated model lookup. The older `?checkModel=1` diagnostic described in prior docs is not implemented by the current handler and does not verify model metadata, generation or free quota. Any separate authenticated metadata probe still requires owner approval.

## Future approved live walkthrough — instructions, not a receipt

1. Obtain explicit owner approval for footage, each service/cost and database target. Configure credentials privately via [credential setup](CREDENTIAL-SETUP.md); never paste keys into chat. Source default is `gemini-3.6-flash`; key/model/quota access and an override are private runtime matters. Restart after environment edits. Existing credentials do not authorize calls or billing changes.
2. Keep optional services off for a Gemini-only run. Use one approved 15–60-second MP4/WebM/MOV ≤64 MiB, stable project/scene IDs, context and explicit browser data/cost consent. Submit once; record actual model/outcome/analysis ID without footage or secrets. Failure/empty findings is honest; no auto-loop paid requests.
3. Review supporting evidence, sampled timestamps and uncertainty; save one human decision without remote sharing first. Read exact saved report/history back after reload, distinguish `local` from `postgres`, and check export against that report. Unsaved drafts/export are not durable saves.
4. Only if separately approved, enable Supermemory and consent to share a canonical human decision. Distinguish queued ingestion from exact-document readback and scoped recall. A further paid comparison with retrieval consent needs approval; document actual provenance and interpretation before claiming a memory-effectiveness result.
5. Only if separately approved, verify database target privately, run `npm run db:migrate`, and read exact stored metadata/review back. Migrations write the configured database and do not run on startup. Use verified TLS. Legacy analytics `timeSeriesMode: timescale` plus real query/hypertable evidence is needed for that specific claim; ordinary `postgres` is fallback, not Timescale verification.

### TLS exception and migration discipline

Historical demo used explicit owner approval for **Tiger only** `sslmode=no-verify`, retaining encryption but setting `rejectUnauthorized=false`. This permits server impersonation; restore `sslmode=verify-full` with trusted CA/server certificate for production. Do not weaken Gemini/Supermemory TLS or use global `NODE_TLS_REJECT_UNAUTHORIZED`. This audit did not inspect/change current connection settings.

Migrations `001_initial.sql`, `002_active_rules.sql`, `003_video.sql` exist. Runner uses one transaction, advisory lock and checksum-tracked `schema_migrations`; unchanged reruns skip applied files and drift/missing files fail. Never edit applied migrations or run tests against production URLs. Embedded tests execute SQL but do not validate Tiger TLS, cloud availability or Timescale extension acceptance.

## Offline fixture and regression references

`npm run demo:images` generates original geometric reference/candidate stills (watch present/absent), not AI output. `npx tsx scripts/create-video-fixture.ts /absolute/native/path/watch-change.mp4` creates an original silent 15-second geometric clip with watch present 0–5 seconds, cutaway 5–8 seconds, then same view without watch. Generation is local; submitting it to Gemini is not. Historical extraction yielded 30 samples/three groups/0-to-9-second pair; do not present fixture geometry or selection as new model detection.

Relevant offline tests: `src/lib/video-extraction.test.ts`, `video-analysis.test.ts`, `video-workflow.integration.test.ts`, `video-store.test.ts`, `video-store.integration.test.ts`, `database.integration.test.ts`, memory/workflow tests and route tests. These cover real media processing/local saves/embedded SQL with mocked external boundaries. Browser regressions additionally cover player/timestamp navigation, long evidence, clustered markers, saved-history errors, draft preservation, preview retry and unsaved-leave warnings. Browser tests were not rerun in this receipt. See [architecture](ARCHITECTURE.md), [demo](DEMO.md) and [tasks](TASKS.md).
