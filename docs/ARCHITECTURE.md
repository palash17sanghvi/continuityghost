# Architecture

## Current local video workflow

The primary UI is `src/components/studio.tsx`, rendered by `src/app/page.tsx`. One clip replaces the original manual two-still selection flow. This describes source at `e944f1b`; it is not a fresh live-service certification.

```text
Browser on loopback
  ├─ one clip + project/scene/context
  ├─ upload/data consent + separate cost approval
  └─ POST /api/video/analyze (bounded multipart)
       ├─ same-origin + key + ALLOW_PAID_ANALYSIS gate
       ├─ FFprobe validates actual container, duration and dimensions
       ├─ FFmpeg extracts timestamped JPEGs; local heuristics choose pairs
       ├─ load saved human scene rules; optional consented Supermemory recall
       ├─ one Gemini structured-output request with selected keyframes
       ├─ validate findings/pair IDs; attach authoritative evidence timestamps
       └─ save clip, frames and report locally; optional PostgreSQL metadata copy
  ← report, timeline, paired evidence, uncertainty and coverage caveat
  ├─ POST /api/video/reviews → durable decision; optional consented memory sharing
  ├─ GET /api/video/history → scoped saved reports
  ├─ GET /api/video/[analysisId] → saved report
  └─ GET /api/video/[analysisId]/media → local clip/frame bytes
```

### Extraction and model boundary

`src/lib/video-extraction.ts` accepts one nonempty MP4, WebM or MOV, at most 64 MiB, 15–60 seconds. Declared MIME and probed container must each be supported, and probe results must satisfy resource bounds; the code does not enforce an exact MIME-to-container match. It selects actual source frames at intervals of `max(0.5, duration / 39)` seconds, up to 40 frames, groups visual transitions and chooses at most four similar-view pairs. These are image heuristics, not semantic shot identification or exhaustive video understanding. No comparable pair is an honest error, not invented evidence.

Media tools run without a shell, with file-only protocols, restricted containers, bounded output, threads, allocation and deadlines. The HTTP route bounds streamed bodies even without `Content-Length` and enforces a 30-second upload timeout. `src/lib/video-analysis.ts` gives the overall operation a 110-second deadline and Gemini at most 65 seconds, reserving finalization time. SDK `retryOptions.attempts=1` prevents hidden generation retries. Selected JPEGs, context and included human rules go to Gemini; the whole video is not uploaded to Gemini.

`src/lib/gemini.ts` sets the source default to `gemini-3.6-flash`; `GEMINI_MODEL` can override it. Zod validates structured output, including real extracted pair IDs and required evidence/uncertainty. The server assigns frame references and sample timestamps. Markers identify evidence samples, not frame-perfect mistake onset. Empty findings are valid; provider failures and invalid output never become synthetic success.

### Durable storage, not session-only review

`src/lib/video-store.ts` copies the clip, extracted JPEGs and `analysis.json` into `.continuityghost/videos/<analysisId>/` by default (`CONTINUITY_DATA_DIR` changes the base). Atomic JSON replacement and filesystem locks protect saves. Temporary extraction data is removed after processing. Local persistence survives page reload/server restart only while that disk remains available; it is not cloud backup, object storage or ephemeral-host durability.

PostgreSQL is optional and requires both `ALLOW_DATABASE=true` and `DATABASE_URL`. Migration `003_video.sql` adds `video_analyses` JSON documents/revisions and append-only `video_review_decisions`, scoped through projects/scenes from migration `001_initial.sql`. Media bytes remain local even when report metadata is remote. Disabled/unavailable PostgreSQL yields an explicit local-only/fallback warning; newer local decisions must not be silently replaced by stale remote data. A `postgres` report status does not mean media was uploaded or a Timescale query ran.

Reviews use canonical saved findings and evidence, validate scope and preserve decision history. Latest confirmed/intentional decisions become reusable rules; dismissal retires the earlier approval. A confirmed mistake is **not** an approved new canonical scene state. Unsaved browser edits remain drafts; saving, export and navigation warnings are separate concerns.

### Memory and consent

Saved local/PostgreSQL human scene rules may be included in later Gemini analysis under the analysis disclosure even with remote-memory consent off. That checkbox controls optional **Supermemory** retrieval/sharing, not all saved-rule reuse. Both `ALLOW_SUPERMEMORY=true` and a configured key are also required; credentials alone are not consent. Review saving does not require remote sharing.

The v5 REST adapter derives a SHA-256 namespace from the exact project/scene tuple. Metadata filters and returned-hit checks supplement that scope. Video recall reconciles returned decision IDs against current canonical approvals and does not trust remote paraphrases, stale approvals, inferred facts or another scene's decisions. Unreviewed model findings never become approved memory. Queued ingestion is not completed indexing or proven recall; a timeout may occur after a write was accepted. Keep ingestion status distinct from durable review-save status and avoid blind billable resubmissions.

## Legacy two-still path

`POST /api/analyze` and `src/lib/continuity.ts` remain implemented internally, not the primary UI flow. They validate/decode two JPEG/PNG/WebP images (each ≤8 MiB), check MIME and pixel/animation limits, normalize through Sharp, then make a gated Gemini comparison. The request has an 80-second deadline and at most 65 seconds for generation. `src/lib/workflow.ts`, `/api/reviews` and `/api/analytics` provide the original optional PostgreSQL persistence, memory reconciliation and scoped SQL analytics.

Migrations `001_initial.sql` and `002_active_rules.sql` implement still findings, append-only reviews, active continuity rules, ingestion state and timestamped events. The migration runner tracks checksums transactionally and uses an advisory lock; never edit applied migrations. Optional Timescale support checks for the extension, creates the event hypertable when available, and uses `time_bucket`; ordinary PostgreSQL uses `date_trunc`. This code exists, but neither embedded tests nor the recorded video Tiger save proves the live Timescale path. Legacy analytics query the still/event tables, not a complete video analytics dashboard.

## Trust boundaries and deployment limits

- **Browser → server:** validate scope, body size, approvals and actual media independently of browser controls. Exact same-origin checks use validated Host/protocol, not untrusted forwarded headers. Project labels and namespaces are not authorization.
- **Model/memory → application:** schema-validate and render as text, never executable HTML/instructions. Preserve observation, uncertainty, provenance and human override history. No automatic confirmation or guaranteed accuracy score.
- **Application → providers/database:** secrets remain server-side. Require service-specific approval, bounded requests and honest persistence/ingestion status. Do not log keys, authorization headers, base64 frames, provider bodies or private production notes.
- **Local server → network:** no authentication, memberships or per-user RLS exists. Bind loopback; never publish/tunnel this build. Same-origin protections and composite foreign keys do not make it multi-tenant safe.
- **Disk/export → people:** footage, JPEGs, reports, notes and exports are sensitive persisted copies. Retention/deletion controls are not implemented. Obtain footage permission; do not assert Google/Supermemory retention guarantees without policy review.

Historical records describe an owner-approved Tiger-only `sslmode=no-verify` exception: encryption retained, server-certificate verification disabled. This is vulnerable to server impersonation, not a production recommendation. Use verified TLS (`sslmode=verify-full` with a trusted CA); do not introduce a global `NODE_TLS_REJECT_UNAUTHORIZED` override or weaken Gemini/Supermemory TLS. See [database details](DATABASE.md) and [evidence/runbook](INTEGRATION-VERIFICATION.md).

## Proposed production work — not implemented

Add authentication, server-owned project membership/authorization, tested tenant isolation, retention/deletion, media policy and operational recovery before exposure beyond loopback. A future relational model can add users, takes and import provenance; existing project/scene records do not imply those features exist. Make canonical authorized human decisions authoritative over retrieved hints and test indexing delays, reversal/deletion propagation and retry-safe ingestion before stronger memory claims.

TXT/CSV imports remain proposed: bound size/encoding, map/preview fields, preserve source/version/row provenance, require human confirmation and prevent spreadsheet-formula injection in CSV exports. PDF parsing/OCR and ScriptE/Scriptation/MovieSlate/LockitScript adapters require representative authorized exports and version-specific tests. Export availability is not interoperability. See [PRD](PRD.md), [tasks](TASKS.md), [automatic workflow records](AUTOMATIC-VIDEO.md), [database](DATABASE.md) and [memory](MEMORY.md).
