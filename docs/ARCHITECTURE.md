# Architecture

## Current local image prototype

```text
Local browser (loopback)
  ├─ two still previews + project/scene/context
  ├─ explicit data consent + cost approval
  └─ POST /api/analyze (multipart)
       ├─ same-origin check; configured key + server paid-analysis gate
       ├─ bounded streamed request; form/schema checks
       ├─ actual image decode + MIME match + normalization
       ├─ Gemini generateContent (two inline normalized images + context)
       └─ schema-validated findings OR honest error
  ← session-only findings/review/export; no durable storage
```

Next.js Node route uses `@google/genai`, `sharp`, and `zod`. Source responsibilities: `src/app/api/analyze/route.ts` handles request gates and provider invocation; `src/lib/continuity.ts` validates images, constructs comparison input, and validates output. Frontend lives in `src/app/page.tsx`. File presence and request construction do not prove real-provider success.

No database queries, object storage, Supermemory ingestion, or durable memory exist in this milestone. Model IDs and timestamps on returned results are response metadata, not a stored audit trail.

## Trust boundaries

- **Browser → server:** server validates approvals, labels/context, image fields, and whole-body size independently of browser checks. Current request cap is two 8 MiB inputs plus 100,000 bytes multipart overhead. Both header-declared and streamed body sizes must be bounded.
- **Bytes → image decoder:** accepted MIME types are `image/jpeg`, `image/png`, `image/webp`. Fully decode; match detected format to declared MIME. Reject animation and decoded images above the configured 24,000,000-pixel limit. Normalize orientation and resize within 2048×2048 without enlargement; encode JPEG and strip source metadata.
- **Server → Google:** secrets remain server-side. Server `ALLOW_PAID_ANALYSIS=true` plus explicit browser cost/data approvals are required. Send only approved image/context inputs. No application media persistence; provider processing is separate.
- **Model → UI:** require schema-valid summary/findings and bounded fields. Treat image text and model prose as untrusted data, not instructions. Render as text. Invalid output fails closed; a real empty findings array is not an error.
- **Browser → export:** review decisions/downloads are session-only. Do not imply remote save or durability. Public deployment is prohibited without authentication and authorization; origin checks are insufficient.

Gemini officially documents multiple inline images in one `generateContent` request. Provider support is a design dependency, not a tested integration claim. API and source citations: [SPONSORS](SPONSORS.md).

## Proposed durable design — NOT BUILT

### Relational authority and isolation

Use PostgreSQL/Tiger Data for users, projects, memberships, scenes, takes, analysis runs, findings, review decisions, and import provenance. Every record must carry an authorized relational `project_id`; scene/take foreign keys must belong to that project. Add tenant ownership and membership checks (and test row-level policies if used) before exposure beyond loopback. User-provided project labels are never authorization.

For Supermemory retrieval, derive a server-owned project scope after relational authorization. A legacy v3/v4 adapter would use project container tags on **every** add/search/list/update/delete; current v5 uses namespaces. Never accept an arbitrary browser tag as proof of ownership. Metadata filters supplement scope, not replace it. API generations differ; pin and test one version rather than mix SDK shapes. Official sources and observed documentation conflict are in [SPONSORS](SPONSORS.md).

### Conflicting memories and human decisions

Persist original observation, image/run provenance (without media unless separately approved), model/version, and timestamps. Persist human accept/reject/override as explicit decision events linked to findings. Relational latest authorized decision is authoritative; a retrieved memory is a hint, not permission to overrule a decision. Preserve superseded decisions and reasons rather than silently overwrite history. Never promote model guesses to accepted production truth automatically.

### Ingestion consistency

Treat memory ingestion/indexing as asynchronous, with pending/ready/failed state and retry-safe identifiers. A successful add/queued response does not prove immediate search visibility. Keep source record and ingestion status in relational storage; poll/check completion according to the pinned API and surface pending state. Bound retries and avoid duplicate/billable blind re-submissions. Test delayed indexing, timeout, conflict, and deletion propagation before claiming memory works.

### Time-series design

Proposed `analysis_events`/`review_events` append-only stream: `occurred_at TIMESTAMPTZ`, `project_id`, run/finding IDs, event type, and minimal non-media payload. Make suitable high-volume event tables hypertables partitioned by time; keep ownership, scene metadata, and current authoritative decisions relational. Account for time-partition-column requirements in unique keys. Bucket counts/latency with `time_bucket` plus **mandatory authorized project filters**. A hypertable is storage/time partitioning, not authorization or semantic memory. No hypertable, migration, bucket query, dashboard, or production database has been implemented. Official hypertable and `time_bucket` sources are recorded in [SPONSORS](SPONSORS.md).

### Import boundary

First planned imports: ordinary UTF-8 TXT and CSV through explicit column mapping and preview. Validate file size/encoding/columns; treat imported text as untrusted; protect CSV exports against spreadsheet formulas. Preserve source/version/row provenance and require human confirmation before ingesting memories. PDF parsing/OCR and vendor-specific adapters follow later. Export availability is not parser compatibility; obtain representative user-authorized exports and test schemas before any compatibility claim.
