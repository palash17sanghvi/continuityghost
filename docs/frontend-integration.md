# Frontend integration: current source contract

## Start here

Use `src/lib/api-contract.ts` for browser-safe Zod schemas and derived types, `src/lib/api-client.ts` for `getHealth`, `analyzeComparison`, `saveReview`, and `getAnalytics`, and `src/lib/fixtures.ts` for explicitly synthetic development/test data. These files are the integration seam being added alongside this document; route and workflow source remain authoritative when they disagree. Do not import `continuity.ts`, `database.ts`, `memory.ts`, or `workflow.ts` into client components: they own server-only dependencies and credentials.

This document audits local source, not a running service. No live API/provider/database requests were made. Configured flags, mocked tests, and synthetic fixtures do not establish live readiness. Figma handoff was not available; no design measurements, component specification, or designer approval are implied. Existing UI is `src/app/page.tsx` and `src/app/globals.css`.

## Supported surface and ownership

| Method/path | Browser helper | Purpose |
| --- | --- | --- |
| `GET /api/health` | `getHealth` | Read configuration flags |
| `POST /api/analyze` | `analyzeComparison` | Compare exactly two uploaded stills |
| `POST /api/reviews` | `saveReview` | Persist one scoped human decision; optionally share it with memory |
| `GET /api/analytics?projectId=...` | `getAnalytics` | Project aggregates, not history |

There are **no standalone project/scene create or list routes, analysis-history API, analysis-detail reload API, review-history API, export API, or memory browser API**. Project and scene are typed scope identifiers, not selectable server catalog entries. Database persistence auto-creates their rows within an analysis write when database is enabled; the failed-analysis persistence path can also create them. Entering identifiers alone creates nothing. Do not build navigation that promises to list or reopen saved analyses. Sources: [analysis route](../src/app/api/analyze/route.ts), [database insert/persistence](../src/lib/database.ts) (`insertAnalysis`, lines 104–132).

**Frontend owns:** file selection/local previews, scope/context inputs, separate consent controls, request and stale-result state, local review drafts, presentation of evidence/uncertainty and service warnings, aggregate/empty screens, JSON downloads, accessible labels/status/error messages.

**Backend owns:** authoritative validation/normalization, paid/service gates, Gemini invocation and structured output validation, UUIDs, exact-scope persistence, active-decision reconciliation, remote-memory filtering/ingestion, and analytics queries. Browser never receives API keys or database URLs and must not call providers directly. Human decides whether a potential difference is an error; model findings are not verdicts.

**Security boundary:** local-only prototype; no authentication or user authorization. Keep server bound to loopback; do not expose publicly or through tunnels. Project/scene scoping and POST Origin checks are not authentication. Both POST handlers reject a supplied Origin different from request URL origin; missing Origin is accepted. Use relative same-origin URLs, not a guessed CORS deployment. See [README](../README.md), [analyze route lines 18–20](../src/app/api/analyze/route.ts), [reviews route line 6](../src/app/api/reviews/route.ts).

## Wire conventions

Successful routes return JSON with HTTP `200` and `Cache-Control: no-store`. Error bodies are `{ "error": "message" }`; do not assume error responses have the success cache header. Treat non-2xx, network failure, unreadable JSON, and invalid success schema as distinct failed requests. Never display an invalid payload as findings or replace errors with fixtures. Scope strings are trimmed, nonblank, at most 120 characters at HTTP boundary. Preserve actual analysis/finding IDs from response. Extra response fields must not be treated as a new supported feature.

### Health

`GET /api/health`, no body or required parameters:

```ts
{
  geminiConfigured: boolean;
  model: string; // GEMINI_MODEL || 'gemini-2.5-flash'
  paidAnalysisEnabled: boolean;
  memoryConfigured: boolean;
  databaseConfigured: boolean;
}
```

Flags mean only:

- `geminiConfigured`: truthy `GEMINI_API_KEY`.
- `paidAnalysisEnabled`: `ALLOW_PAID_ANALYSIS === 'true'`.
- `memoryConfigured`: `ALLOW_SUPERMEMORY === 'true'` and nonblank `SUPERMEMORY_API_KEY`.
- `databaseConfigured`: `ALLOW_DATABASE === 'true'` and nonblank `DATABASE_URL`.

No key validity, quota, network connectivity, migrations, or provider availability is checked. Health failure is “configuration status unavailable,” not “services unconfigured.” Missing Gemini configuration or paid gate blocks analysis; missing database or memory does not prevent image-only analysis. Sources: [health route](../src/app/api/health/route.ts), [databaseEnabled](../src/lib/database.ts), [memoryEnabled](../src/lib/memory.ts).

### Analysis request

`POST /api/analyze` with browser `FormData`. Let browser generate multipart `Content-Type` and boundary; do not set it manually.

| Field | Wire value / limit |
| --- | --- |
| `projectId`, `sceneId` | Required trimmed nonblank strings, each max 120 characters |
| `context` | String, max 12,000 characters; may be empty; omitted currently becomes empty |
| `reference`, `candidate` | Required `File` values, one each |
| `consent` | Required literal string `'true'`: sends normalized images/context to Google |
| `costApproved` | Required literal string `'true'`: explicit paid-call approval |
| `memoryConsent` | Only literal string `'true'` opts into historical-memory retrieval; omit or send `'false'` otherwise |

Keep Google data consent, paid approval, memory retrieval consent, and per-review memory-sharing consent separate and unchecked initially. Owner's server paid flag does not replace per-request approval. Analysis data consent is not memory-sharing consent. Consent does not imply provider retention guarantees.

Files: nonempty JPEG (`image/jpeg`), PNG (`image/png`), or WebP (`image/webp`), each at most 8 MiB. Server checks declared MIME against decoded format, rejects animation, malformed/truncated images and excessive decode size (24,000,000-pixel decode limit), rotates, resizes within 2048×2048 without enlargement, flattens onto white, and converts to JPEG quality 90, stripping embedded metadata. Client checks improve UX but never replace server checks. Request body bound is `MAX_IMAGE_BYTES * 2 + 100_000`, including multipart overhead; checked against declared length and streamed bytes. Oversized individual file is a validation `400`; oversized whole body is `413`. Sources: [continuity.ts lines 5–31](../src/lib/continuity.ts), [analyze route lines 10–41](../src/app/api/analyze/route.ts).

### Analysis success

```ts
{
  analysisId: string; // generated UUID
  projectId: string;
  sceneId: string;
  summary: string;
  findings: Array<{
    id: string; // generated UUID
    category: 'wardrobe' | 'props' | 'placement' | 'appearance' | 'action' | 'background';
    description: string;
    referenceEvidence: string;
    candidateEvidence: string;
    uncertainty: string;
    suggestedAction: string;
    status: 'unreviewed';
  }>;
  memory: {
    status: 'disabled' | 'ready' | 'unavailable';
    facts: Array<{id: string; content: string; source: 'supermemory'; decisionId?: string}>;
    warning?: string;
  };
  persistence: {status: 'saved' | 'disabled' | 'failed'; warning?: string};
}
```

Summary and all five finding text fields are trimmed nonempty strings, max 3,000 characters each. Findings contain 0–30 entries. No timestamps, bounding boxes, image coordinates, confidence probabilities, per-finding memory citation IDs, or review notes are returned. Zero findings is a valid successful comparison, not an error or a guarantee of perfect continuity. Source: [continuity schemas/parser](../src/lib/continuity.ts) (lines 6–17, 35–46), [response assembly](../src/app/api/analyze/route.ts) (lines 48–54).

Memory status is independent of findings and persistence. `disabled` means no retrieval consent or memory disabled. With memory enabled/consented but database disabled, status is `unavailable` and no historical facts are used. Remote results are filtered for latest, non-inferred human decisions in exact scene namespace; DB reconciliation keeps only active decision IDs and replaces content with canonical DB text. `ready` can still have `facts: []`. These are historical decision **provenance/context**, not proof that a current visual finding is correct. Prompt asks model to mention influential memory in summary, but schema does not enforce citations or a per-finding link. Do not render “cited fact” badges implying guaranteed evidence attribution. Sources: [loadMemory](../src/lib/workflow.ts) (lines 5–9), [remote retrieval](../src/lib/memory.ts) (lines 81–101), [reconcileMemories](../src/lib/database.ts) (lines 82–98), [model prompt](../src/lib/continuity.ts) (lines 40–46).

`persistence.saved` means completed analysis persisted. `disabled` means successful report is session-only. `failed` means analysis succeeded but DB write failed: keep report usable, show warning, offer export, and keep review saving disabled for that analysis. **Only allow server review saving for `persistence.status === 'saved'`; configuration alone is insufficient.** Source: [saveAnalysis](../src/lib/workflow.ts) (lines 11–15).

### Analysis failures and timing

| Status | Current conditions / message |
| --- | --- |
| `400` | Wrong content type (`Expected image upload form.`), missing body (`Missing upload body.`), malformed multipart (`Malformed upload form.`), invalid fields/consents (`Provide project, scene, context under 12,000 characters, data consent and cost approval.`), missing files (`Upload both reference and candidate images.`), or image validation/decode error |
| `403` | `Cross-origin analysis is not allowed.` or `Paid analysis is disabled. Owner must approve before setting ALLOW_PAID_ANALYSIS=true.` |
| `408` | `Request deadline reached before Gemini started. No analysis call was made.` |
| `413` | `Upload exceeds the request limit.` |
| `502` | `Gemini analysis failed or returned invalid findings. Check model access, quota and configuration before retrying; requests may incur charges.` |
| `503` | `Gemini is not configured. Add GEMINI_API_KEY to .env.local.` |

Image validation messages are `Use a nonempty JPEG, PNG or WebP image up to 8 MiB.` and `Image could not be decoded, is too large, or does not match its declared format.` Configuration/origin gates run before upload validation, so error ordering is not arbitrary. Route declares `maxDuration = 90`, establishes an 80-second signal/deadline, and budgets Gemini up to 45 seconds minus time reserved for downstream work. These are server budgets, not progress stages or a client completion SLA. Provider errors are deliberately sanitized. A `502`, client timeout, or cancellation does not prove no charge or server write occurred. Never silently retry paid analysis or memory writes. Source: [full analyze route](../src/app/api/analyze/route.ts).

### Review request and response

`POST /api/reviews`, `Content-Type: application/json`:

```ts
{
  analysisId: string; // UUID of persisted analysis
  findingId: string; // UUID of finding in that analysis
  projectId: string; // exact response scope, trimmed max 120
  sceneId: string; // exact response scope, trimmed max 120
  status: 'confirmed' | 'dismissed' | 'intentional';
  note: string; // required, may be empty; trimmed max 4000
  consent: boolean; // required; explicit consent to send review facts/notes to Supermemory
}
```

`unreviewed` is local initial state, not a valid save status. Use analysis response scope, not subsequently edited input values. Database must be enabled and finding must already exist in exact project/scene/analysis scope. Request never supplies canonical finding evidence: server reads it from DB. Do not send invented IDs, use synthetic analysis against live reviews, or present saving as supported for a session-only report.

```ts
{
  persisted: true;
  decisionId: string; // new UUID for this decision
  memory: {
    status: 'unknown' | 'queued' | 'extracting' | 'chunking' | 'embedding' |
            'indexing' | 'done' | 'failed' | 'disabled' | 'unavailable';
    id?: string;
    warning?: string;
  };
}
```

Database save happens before memory ingestion. `consent: false` still permits DB-only save, even when memory is configured. Memory disabled or sharing declined yields `memory.status: 'disabled'`. Memory unavailable/failed does not negate `persisted: true`. Queued/indexing states do not mean retrievable; no ingestion polling route exists. Repeated explicit saves append decisions rather than acting as an idempotent update; latest rule for that finding becomes active. Warn about ambiguous network outcomes instead of automatic resubmission. Sources: [reviews route](../src/app/api/reviews/route.ts), [saveReview workflow](../src/lib/workflow.ts) (lines 16–22), [persistReview](../src/lib/database.ts) (lines 134–149), [memory ingestion](../src/lib/memory.ts) (lines 66–78), [active-rule migration](../migrations/002_active_rules.sql).

| Status | Current message / condition |
| --- | --- |
| `400` | `Expected JSON review.`, `Missing review.`, or `Invalid review fields.` |
| `403` | `Cross-origin review is not allowed.` |
| `413` | `Review too large.` (streamed body over 24,000 bytes) |
| `503` | `Review could not be saved. Check database configuration and analysis scope. Local review is unchanged.` |

Malformed JSON currently falls through catch to `503`, not `400`. Scope mismatch/DB disabled/DB failure share the same `503`; do not invent a `404`, `409`, or auth error. Keep local draft/status/note intact on failure. Source: [reviews route lines 5–15](../src/app/api/reviews/route.ts).

### Analytics

`GET /api/analytics?projectId=${encodeURIComponent(projectId.trim())}`. Required nonblank project ID, max 120 characters; no scene/time-range/page/history parameters.

```ts
{
  categories: Array<{category: string; count: number}>;
  outcomes: Array<{status: string; count: number}>;
  trends: Array<{bucket: string; count: number}>;
  totals: {analyses: number; findings: number; reviews: number};
  timeSeriesMode: 'timescale' | 'postgres';
}
```

Counts are numeric, finite, nonnegative; bucket is an ISO timestamp from DB day aggregation. Categories count stored findings; outcomes reflect **current finding state**, including unreviewed; reviews total counts decision history, not unique reviewed findings. Analyses total includes failed persisted analyses. Trends count `finding_detected` events by day, not completed analyses or review saves. Sparse buckets are not zero-filled. `timescale` requires installed extension plus actual events hypertable; otherwise PostgreSQL day buckets are valid output. Never label fallback as broken Timescale or turn these aggregates into a history list. Unknown/no-data project returns empty arrays and zero totals, not a missing-project error.

Errors: `400` → `Choose a project first.`; `503` → `Database is not enabled. No live analytics available.` or `Analytics query failed. Check database configuration and migrations.` Sources: [analytics route](../src/app/api/analytics/route.ts), [getAnalytics](../src/lib/database.ts) (lines 151–170).

## Frontend states and current-page gaps

Implement separate analysis, review-save, and analytics loading states; disable conflicting writes and show accessible status text. Keep named file inputs/buttons, keyboard interaction, image alt text, labeled checkboxes/notes, `role="alert"` for errors, and status announcements. Local object URLs must be revoked on replacement/unmount. Abort/unmount and input changes must prevent stale replies overwriting new scope; existing page uses request generation plus `AbortController`. Cancellation is UI cleanup, not proof paid work stopped.

| State | Expected behavior |
| --- | --- |
| Initial / health loading | Empty upload targets; unchecked consents; no invented summary/charts; do not enable analysis before configuration is known |
| Missing key / paid gate / health error | Explain specific configuration issue or unknown status; do not imply verified provider readiness |
| Comparing | Lock conflicting controls, show real loading indicator; no invented percentage/progress phases |
| Success with no findings | Show returned summary and explicit no-supported-differences state; allow report export |
| DB/memory degraded | Keep successful findings; show independent memory/persistence warnings; offer local review/export; save only persisted analyses |
| Review save error or pending memory | Preserve draft; separate DB success from remote ingestion warning/pending status |
| Analytics empty/error | Empty aggregate message for zero data; explicit unavailable message for failure; no fabricated chart bars |

Current `page.tsx` uses hand-written local types/validators and direct `fetch`, not the new shared client. Treat migration to shared contracts as integration work, not already done. Its `Finding` state widens wire status with review states and optional `note`; keep this local draft type separate from analysis-response schema, which correctly requires `unreviewed`.

Two existing page behaviors need explicit handoff:

1. Save handler/button checks configured database, not `analysis.persistence.status === 'saved'`. Add persisted-analysis guard when wiring new UI; backend exact-scope check remains authoritative.
2. When memory is configured, page currently requires sharing consent to save at all. Backend supports DB-only save with `consent: false`; new UI should allow declining memory sharing without blocking DB save. Never silently check consent or combine it with paid approval.

Source: [page state/requests/export](../src/app/page.tsx) (lines 50–138), [save button/consent](../src/app/page.tsx) (lines 156–159).

## Exports and retention

Export is browser-generated JSON, not a server endpoint. Current page downloads `continuityghost-report.json` containing current analysis plus `context`, ISO `exportedAt`, `reviewScope: 'session-only'`, and `sourceFiles: {reference, candidate}` filenames. Local status/note edits are included in findings; image bytes/previews are not. It currently retains `reviewScope: 'session-only'` even after a DB save, so do not infer persisted status from that label; use response persistence/review acknowledgements separately.

No automatic browser storage/reload recovery or import endpoint exists. Reload/input changes/new analysis can discard session drafts; export before closing. DB stores analysis/findings/decisions/rules/events, not media; application non-storage does not promise Google/Supermemory retention behavior. Source: [exportReport](../src/app/page.tsx) (lines 134–138), [DB schema](../migrations/001_initial.sql), [README privacy/status](../README.md).

## Teammate integration checklist

1. Branch from backend contract work (`feat/frontend-integration-contract` at audit), or cherry-pick its completed contract/client/fixture changes into your own feature branch before wiring screens. Resolve schema drift against actual route/workflow source; do not maintain a second guessed API type set.
2. Build screens against `src/lib/fixtures.ts` with an explicit development/test-only mocked adapter or request interception. Label fixtures **SYNTHETIC**; choose scenarios for loading, no findings, errors, DB-disabled/save-failed, empty analytics, and pending/unavailable memory. Do not ship a permanent mock fallback, silently catch live failures into fixtures, or save fixture UUIDs to live DB.
3. Wire the four real browser helpers; keep local drafts separate from wire output. Validate at client boundary, preserve explicit consents and exact response scope, and handle all documented success/degraded/error states. Do not add project/history endpoints to satisfy visual placeholders.
4. Verify with mocked local tests (`npm test`, `npm run typecheck`, `npm run lint`) and project browser tests (`npm run test:e2e`) as appropriate; fixture success is not provider proof. Paid/provider/DB verification requires separate owner approval and setup; never enable service flags merely to make a screen appear ready.
5. Review handoff against source and actual available design files. Figma-specific work remains blocked until an accessible handoff is provided. Merge only after checking zero-findings, scope changes, consent declined, persisted-save gating, accessible loading/error states, and JSON export. No claim of live readiness until separately verified.

## Source verification map

| Contract area | Authoritative repository files |
| --- | --- |
| HTTP methods, guards, status/error bodies | [`src/app/api/health/route.ts`](../src/app/api/health/route.ts), [`src/app/api/analyze/route.ts`](../src/app/api/analyze/route.ts), [`src/app/api/reviews/route.ts`](../src/app/api/reviews/route.ts), [`src/app/api/analytics/route.ts`](../src/app/api/analytics/route.ts) |
| Image limits, model schema, findings IDs/status/prompt | [`src/lib/continuity.ts`](../src/lib/continuity.ts) |
| Consent gates, degraded persistence/memory semantics | [`src/lib/workflow.ts`](../src/lib/workflow.ts), [`src/lib/memory.ts`](../src/lib/memory.ts) |
| Exact scope, canonical evidence, aggregates, auto-created rows | [`src/lib/database.ts`](../src/lib/database.ts), [`migrations/001_initial.sql`](../migrations/001_initial.sql), [`migrations/002_active_rules.sql`](../migrations/002_active_rules.sql) |
| Existing UX, local state/download, local-only constraints | [`src/app/page.tsx`](../src/app/page.tsx), [`src/app/globals.css`](../src/app/globals.css), [`README.md`](../README.md) |

This is a source audit, not a live acceptance test. File references were read locally; no runtime service availability or Figma handoff was verified.
