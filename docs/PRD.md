# Product requirements: automatic continuity review

## Problem and user

Script supervisors need a second look at visible continuity differences. ContinuityGhost supports human judgment; it does not determine narrative intent, certify every frame or replace script supervision.

**Current milestone:** upload one 15–60-second clip, automatically choose comparable extracted frames, request Gemini evidence-backed possible differences, review timeline/evidence, and persist human decisions locally. PostgreSQL metadata persistence and Supermemory recall/sharing are optional. This supersedes the original two-still/session-only milestone; those internal APIs remain implemented, not the primary product flow.

## User flow

1. Start on loopback; select one MP4/WebM/MOV and stable project/scene IDs, with optional context.
2. Read the local-storage and selected-keyframe disclosure. Explicitly consent to analysis data transmission and separately approve possible API costs. Owner must also enable server paid analysis. Optional remote-memory consent remains separate.
3. Submit once. Show bounded processing and actionable validation/configuration/provider errors; never fall back to invented AI output.
4. Review sampled timeline markers and paired frames. Each finding includes visible reference/candidate evidence, uncertainty and suggested action; available interpretation/confidence labels describe evidence, not calibrated accuracy or confirmed mistakes.
5. Confirm, dismiss or mark intentional; add a note and save. Show durable save mode/warnings and optional remote-ingestion status separately. Export and reopen saved history. Preserve unsaved drafts across finding reselection/player retry and warn before leaving; export alone is not save.

## Current acceptance criteria and limits

### Media and generation

- Exactly one intended clip, nonempty and ≤64 MiB, 15–60 seconds. Validate actual supported container/MIME, duration, dimensions and bounded decode/probe resources; bound the whole multipart stream even without `Content-Length`. Unsupported/corrupt/oversized media must not reach Gemini.
- No provider call without `GEMINI_API_KEY`, exact `ALLOW_PAID_ANALYSIS=true`, browser `costApproved=true` and browser `consent=true`. Credentials do not establish billing approval. One SDK generation attempt; no hidden billable retries.
- Extract timestamped JPEGs automatically; choose at most four heuristic similar-view pairs. Send only selected frames plus disclosed context/rules, not the whole video. Sampling is not exhaustive coverage. No comparable pair is an honest failure; empty model findings are valid.
- Parse structured findings against the local schema and reject unknown pair IDs. Attach authoritative frame/timestamp references on the server, never trust model-generated timecodes. Invalid JSON/schema, timeout or provider error remains an error, not synthetic success.
- Require readable evidence and uncertainty. Treat model output as untrusted text, not instructions/HTML. Visible change is not necessarily a continuity mistake; only human review confirms one. No guaranteed detection, frame-perfect onset or unsupported accuracy percentage.

### Persistence and memory

Video reports, clips, extracted frames and saved decisions persist on the local server by default. Reload is not expected to erase saved reviews; **unsaved** drafts can still be lost. Disk loss/ephemeral hosting remains a durability limit. Optional PostgreSQL copies metadata/findings/decision history, not media bytes; explicit fallback warnings must distinguish local saves from remote confirmation.

Canonical human decisions supersede stale recalled hints. Latest confirmed/intentional decisions become saved scene rules; dismissal retires the earlier approval. A confirmed error does not establish the changed state as canonical. Unreviewed model findings never become approved facts. Preserve superseded decisions/provenance for audit.

Saved local/PostgreSQL rules can be reused in later Gemini analysis under its disclosure. Optional Supermemory retrieval/sharing additionally requires configured key, `ALLOW_SUPERMEMORY=true` and request-level consent. Save must work without remote sharing. Remote hits are reconciled against current canonical decisions in the exact project/scene scope; namespace/filtering is not user authorization. Queued write ≠ completed indexing ≠ successful recall; unavailable write can have been accepted before a timeout. Avoid blind duplicate/billable submissions.

### Accessibility and scope

Use keyboard-accessible labeled controls, visible focus, loading/error feedback and accessible evidence/player navigation. Keep long evidence/source labels contained and clustered timeline targets selectable. Saved-history errors must not masquerade as empty results. Existing browser regression tests exercise these behaviors with intercepted API responses; they do not certify provider detection.

## Legacy milestone and proposed work

The original reference/candidate still engine (`/api/analyze`) retains two JPEG/PNG/WebP inputs, each ≤8 MiB, actual decode/MIME/animation/pixel validation and independent request/cost/consent gates. Its PostgreSQL reviews, active rules, events and SQL analytics exist. The original session-only/no-database/no-video requirements describe an earlier milestone, not current implementation. Still/event analytics are not a complete video dashboard; Timescale branches in code do not establish live hypertable acceptance.

Not implemented: authentication, memberships/multi-user authorization, public deployment readiness, project collaboration, retention/deletion controls, object storage/cloud media backup, vendor imports, script parsing, TXT/CSV import, PDF/OCR and automatic narrative conflict resolution. Add server-owned authorized scopes, tested tenant isolation, explicit retention/media policy and recovery before public deployment. Future imports need size/encoding validation, mapping/preview, provenance, human confirmation and CSV formula protections; vendor compatibility needs representative version-specific exports. Sponsor participation or export availability is not integration evidence.

## Privacy, cost and TLS

Local-only operation is mandatory because no authentication exists. Bind loopback; no public tunnels. Same-origin checks, composite foreign keys and hashed namespaces do not establish project ownership or per-user RLS. Footage and reports persist locally, and chosen images/context/rules are sent to Google only after approval; optional approved human content can go to Supermemory. Do not claim provider retention guarantees without separate policy review. Avoid logging uploads, secrets, base64 or full production notes. Exports are sensitive copies.

External calls, database migrations and TLS changes require explicit service-specific owner approval. Use verified TLS. The historical owner-approved Tiger-only `sslmode=no-verify` exception retained encryption but disabled server authentication; it is vulnerable to impersonation and must not be a production default or a global TLS bypass.

## Verification and historical evidence

Source inspection establishes implemented paths. Offline tests establish validation, gates, parsing, extraction/selection, local persistence and embedded PostgreSQL behavior with mocked external services. They do **not** prove live Gemini/Supermemory/Tiger/Timescale acceptance or model quality.

[AUTOMATIC-VIDEO](AUTOMATIC-VIDEO.md) records historical owner-approved Gemini generation, later Supermemory add/recall and a Tiger metadata save/readback. These supersede blanket “all live integrations blocked” statements; they are records, not fresh checks or proof of one combined three-provider/memory-effectiveness run. [Integration verification](INTEGRATION-VERIFICATION.md) separates these records from the current offline receipt and future approved verification gates.

Award context supplied by the owner: **Winner — Best Use of Gemini API | SunHacks 2026**, November 15, 2026, four-person team. Award was not independently reverified in this audit. Planned work and historical event/track research must not be presented as shipped features or extra award wins.
