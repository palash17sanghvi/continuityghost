# Tasks and acceptance status

Status labels distinguish **implemented**, **offline exercised**, **historical live record** and **open acceptance**. Unchecked does not mean all related code is absent. Source baseline: `e944f1b`. This replaces the old two-still/session-only and “persistence not implemented / all live services blocked” checklist without erasing its historical context.

## Current milestone

- **Implemented:** primary one-clip automatic FFmpeg extraction/pair selection, gated one-attempt Gemini analysis, timeline/paired evidence, human review/export, saved history and durable local media/report storage. Original two-still engine remains internal, not primary UI.
- **Implemented:** opt-in PostgreSQL schema/reviews/events/legacy analytics and video metadata/decision history; optional separately consented Supermemory adapter and canonical human-rule reconciliation. Disabled/unavailable PostgreSQL is labeled local fallback, not Tiger success. Media bytes remain local.
- **Offline exercised in this audit:** `npm test` exited 0, **18 files / 227 tests passed**, **11.09 seconds**. External SDK/fetch/`pg` boundaries mocked; embedded PGlite runs SQL and local FFmpeg fixtures run real media processing. No live provider/database connection was made. [Receipt and boundaries](INTEGRATION-VERIFICATION.md).
- **Historical live records:** earlier still Gemini run, automatic video Gemini analysis `42744539-1346-4efd-93fa-e1019cd83ab2`, subsequent Supermemory add/recall and Tiger metadata save/readback. Recorded individually, not reverified here and not proof of combined three-provider E2E, memory effectiveness or live Timescale.
- **Historical UI/test context:** Git includes timestamp/player accessibility, clustered markers, long evidence containment, saved-history errors, draft preservation, preview retry and unsaved-leave fixes. Browser regression source exists. Earlier 112-test/9-browser-test/lint/build/audit receipts are old snapshots. The portfolio pass separately refreshed the current browser suite (27 tests), lint, typecheck, build, Python helper checks, and production dependency audit; see [verification](VERIFICATION.md).

## Do next: current acceptance work

- [x] Portfolio pass reran browser E2E, lint, TypeScript and production build locally; [actual receipt](VERIFICATION.md) records commands and scope separately from provider verification. Do not reuse these totals as evidence for later code changes.
- [ ] Recheck desktop/mobile keyboard flow, timeline clusters, evidence/player seeking, long text, saved-history errors, save failures, draft preservation/retry and leave warnings. Verify saved review survives reload; unsaved draft/export must not be described as a save.
- [ ] If a fresh live run is needed, obtain service-specific cost/data approval first and follow [integration runbook](INTEGRATION-VERIFICATION.md). Submit once, record real outcome and limitations; do not auto-retry. Existing historical success is not fresh authorization.
- [ ] Before claiming memory effectiveness, record an approved before/after generation with actual canonical retrieved provenance and resulting interpretation. Separate queued ingestion, exact-document readback and scoped semantic recall; test delay, reversal/deletion and timeout behavior without blind billable resubmission.
- [ ] Before claiming live Timescale, obtain approval and record actual extension/hypertable/`time_bucket` acceptance. `postgres` video metadata persistence and embedded SQL tests do not prove it; legacy analytics are not a full video dashboard.

## Later: production security, durability and collaboration

- [ ] Add authentication, relational project membership/authorization and tested cross-tenant denial before public deployment. Composite keys, labels, same-origin checks and namespaces are not user authorization. Continue loopback-only; no tunnels.
- [ ] Define footage permission, retention/deletion, export handling, media backups/object storage and recovery policy. Current clip/JPEG/report persistence is real but tied to local disk. Test remote/local revision conflicts and operational recovery before stronger durability claims.
- [ ] Restore verified Tiger TLS before production. Historical owner-approved `sslmode=no-verify` retained encryption but disabled server authentication; no global TLS bypass or changes to Gemini/Supermemory TLS.
- [ ] Extend ingestion lifecycle/deletion/idempotency checks and server-owned authorized scopes. Preserve decision history; never promote unreviewed model guesses or stale recalled paraphrases to approved facts. A confirmed error is not a new canonical state.
- [ ] Consider multi-user review/take/import provenance and video analytics only after authorization and retention boundaries are defined. Existing schema and legacy event analytics are not those proposed features.

## Later: imports — not implemented

- [ ] Build bounded UTF-8 TXT/CSV import with column mapping, preview, source/version/row provenance, validation and human confirmation. Protect CSV exports against spreadsheet-formula injection.
- [ ] Obtain representative authorized exports from ScriptE, Scriptation, MovieSlate and LockitScript. Test exact product version/report type; no blanket interoperability claim.
- [ ] Evaluate PDF parsing/OCR only after text/CSV flow works. Vendor export availability does not establish parser compatibility.

## Portfolio evidence and historical submission work

Owner-supplied outcome: **Winner — Best Use of Gemini API | SunHacks 2026**, November 15, 2026, four-person team; award not independently reverified in this audit. Historical pre-submission event/track checks remain in [SPONSORS](SPONSORS.md). Preserve that research, but do not imply the event is still upcoming, attribute extra awards, or treat a track listing as implementation proof.

For demos/reports, distinguish current implemented path, mocked/offline receipts, recorded authorized live outcomes and future work. No fake detections, unbuilt import claims, hidden paid retries, secret screenshots or production-readiness claims. See [PRD](PRD.md), [architecture](ARCHITECTURE.md), [demo](DEMO.md) and [automatic workflow records](AUTOMATIC-VIDEO.md).

Next bounded step: review the evidence table in [INTEGRATION-VERIFICATION](INTEGRATION-VERIFICATION.md) before quoting a live-service claim.
