# Sponsors, APIs, and compatibility research

Research snapshot: November 14, 2026. Official product/organizer pages only. Documentation retrieval verifies what a page says, **not** working account access, billing eligibility, SDK runtime behavior, or an implemented integration. No paid provider call was made for this documentation pass.

## Event and challenge evidence

- MLH's Sunhacks page explicitly lists **Best Use of Gemini API** and **Best Use of Tiger Data**. Its Tiger Data description calls for PostgreSQL/time-series capabilities. This verifies listed tracks, not project eligibility or prize acceptance. [1]
- Organizer dashboard lists November 14–15, 2026 at ASU Tempe and a Sunday November 15 **11:00 AM projects-due** entry. Treat this as Arizona local time (America/Phoenix); recheck organizer announcements before submission. [2]
- Dashboard sponsor list includes Supermemory, Gemini, and Tiger Data. A sponsor logo/listing is not a challenge. **Supermemory prize track remains unverified**: no such category was found on the retrieved MLH challenge page. Ask organizers for written criteria before claiming eligibility. [1][2]
- `https://mlh.link/tigerdata` did not provide useful documentation in the supplied investigation; use official Tiger Data documentation below instead. Do not infer API details from an empty referral page.

## Current implementation versus this research snapshot

The compatibility research below predates the automatic video workflow. Current code uses FFmpeg-sampled frame pairs in one Gemini request; the earlier two-still endpoint remains available. Optional Supermemory and PostgreSQL paths are implemented. [Architecture](ARCHITECTURE.md), [automatic-video records](AUTOMATIC-VIDEO.md), and [integration ledger](INTEGRATION-VERIFICATION.md) distinguish source support, offline tests, and earlier owner-approved live observations. They supersede prototype-status assumptions in this snapshot.

The owner reports **Winner — Best Use of Gemini API | SunHacks 2026**, November 15, 2026, for the four-person ContinuityGhost team. The supplied [certificate](assets/awards/sunhacks-2026-gemini-certificate.jpg) confirms the category, project, and date. This is not an overall hackathon win; no Tiger Data or Supermemory award is claimed. The organizer challenge list below is historical research, not the evidence of winning.

## Gemini: image understanding

Official image-understanding guide shows multiple images in one prompt and JavaScript `ai.models.generateContent` with inline image data. `generateContent` REST reference describes generation inputs/outputs. This supports both paired still images and the current selected-frame batch, not direct processing of the complete video. [3][4]

Current project configuration is `GEMINI_API_KEY` (server only) and `GEMINI_MODEL=gemini-3.6-flash`, matching `.env.example` and `src/lib/gemini.ts`; the original research used `gemini-2.5-flash`. A configured model identifier does not guarantee current account availability. Repository uses `@google/genai`. Do not expose the key to the browser or commit it. This portfolio pass made no provider request, changed no model, and verified no current account access. Historical runtime observations are linked above; no Vertex AI endpoint is claimed.

The legacy still-image endpoint accepts only JPEG/PNG/WebP ≤8 MiB per input even if Google's API supports additional formats. Application decodes, strips metadata, and normalizes the inputs before inline transmission. Provider limits and the application's raw-multipart cap are different boundaries: inline base64 enlarges data. Keep the provider request within current documented limits, including prompt/inline overhead. [3]

No provider call without all gates: configured key, server `ALLOW_PAID_ANALYSIS=true`, explicit browser cost approval, explicit browser data consent. Fresh API verification remains blocked absent these prerequisites. No fake response may stand in for a failed/missing call. Provider retention/billing policies require separate review; local storage/cleanup behavior is not a Google retention promise.

## Supermemory: historical API-generation research

`https://supermemory.ai/docs` routes to the introduction; `/docs/intro` currently contains legacy-style examples: `client.add({ content: ... })` and `client.search.execute({ q: ... })`. The SDK reference currently shows namespace-first `supermemory.add("user_123", { ... })` and `supermemory.search("user_123", { query: ... })`. These are **not interchangeable signatures**. [5][20]

| Official evidence retrieved | What is verified | What must not be assumed |
| --- | --- | --- |
| API overview | Describes REST base `https://api.supermemory.ai` and legacy v3/v4 naming, including `/v3/memories`. [6] | That this summary matches every current endpoint or SDK. |
| Add-document OpenAPI reference | Explicit operation `POST /v3/documents`; schema includes deprecated `containerTags`. [18] | That `POST /v3/memories` is the current document-ingestion endpoint. |
| Search-document OpenAPI reference | Explicit `POST /v3/search`, with `containerTag` or `containerTags` filters. [9] | That this uses current v5 namespace SDK signatures. |
| Direct-memory reference | Explicit operation `POST /v4/memories`. [19] | That direct structured-memory creation equals document ingestion or uses v3. |
| v5 migration and quickstart | v5 moves legacy document/search operations to namespace-scoped `/ns/:namespace/document` and `/ns/:namespace/search`; current examples call `client.add(namespace, ...)` and `client.search(namespace, ...)`. Migration states client 5.x+ requirement. [7][8] | That old examples can be copied into a new installed SDK unchanged. |

**Conclusion:** requested `/v3/memories` add/search assumptions and `memories.add` SDK spelling are **not verified as a compatible current implementation**. Official pages disagree across generations. Do not invent an adapter or claim success. Before changing API generations, pin the API contract, inspect that version's reference, and execute separately authorized tests with the same project scope. Current code uses a direct HTTP adapter in `src/lib/memory.ts`, not the Supermemory SDK. The older research below is not runtime evidence; subsequent integration observations are in [the evidence ledger](INTEGRATION-VERIFICATION.md).

Current docs call namespaces the isolation boundary, formerly v3/v4 container tags. Any future authenticated integration must pair relational project authorization with server-derived project container tags (legacy) or namespace (v5), consistently on every operation. Scope supplied by a browser is not authorization. Never mix cross-project search results. [22]

Ingestion is not immediate durable recall: documented stages include queued, extraction, chunking, embedding, indexing, and done/failed. Current SDK reference says default `dreaming: "dynamic"` batches memory extraction and a fresh namespace may have zero memories/empty profile for minutes; `"instant"` changes extraction timing, not the need to check readiness/errors. Build visible pending/failed states and preserve relational human decisions as authoritative when retrieved memories conflict. The current adapter reports search readiness and provider ingestion states separately and filters eligible retrieved facts; failures may return `unavailable`. A general conflict resolver or authenticated tenant isolation is not implemented. See [memory behavior](MEMORY.md). [20][21]

## Tiger Data: historical proposal versus current integration

Official hypertable guide describes a PostgreSQL table partitioned into time chunks and supplies current `CREATE TABLE ... WITH (tsdb.hypertable, tsdb.partition_column = 'time')` examples. `time_bucket` reference documents time-bucket aggregation with interval and timestamp arguments. These are authoritative alternatives to the empty referral path. [10][11]

Original proposal: append-only analysis/review event hypertable with `occurred_at` and authorized `project_id`; relational tables for project membership, scenes, runs, and authoritative human decisions. Aggregate counts/latency with `time_bucket`, always filtered by authorized project. Foreign keys, uniqueness constraints, retention, migrations, and indexes require design/testing against the chosen TimescaleDB version. **Current status supersedes that proposal:** PostgreSQL tables, analysis/review persistence, SQL migrations, and scoped analytics are implemented in `src/lib/database.ts` and `migrations/`; [database docs](DATABASE.md) explain optional TimescaleDB hypertable support and the portable bucketed SQL analytics actually used. The `.env.example` blank `DATABASE_URL` is a safe template, not a statement that integration is unimplemented. Production project membership/authorization and retention remain future work.

## Export compatibility investigation — no adapters implemented

| Product / official source | Export fact verified | Planned compatibility boundary |
| --- | --- | --- |
| **ScriptE/S v3 (Mac/iPad)** | Product page says breakdown exports to **PDF or CSV**, by scene number, location, or script day. Official newsletter also describes CSV take export for ScriptE/S; product/version matters. [12][13] | Investigate authorized CSV samples and field mapping. Do not promise support for every report, ScriptE Windows format, or proprietary project file. |
| **Scriptation Tagging** | Official help says Breakdown Summaries, Element Reports, and Category Reports are available as **PDF and CSV**, with notes represented in reports. [14] | Candidate CSV import after ordinary TXT/CSV parser exists. Tagging report export does not prove a take-log or continuity database schema. |
| **MovieSlate** | Official reports page lists shot-log **CSV and plain text**, Avid ALE/Locators TXT, and Premiere Batch CSV. Official FAQ says breakdown CSV starts at 8.9.56; Production Reports and Editor's/Facing pages are **PDF only**, while Shot Log and Sound Report support CSV. [15][16] | Target selected CSV/TXT report types only after sample tests; never claim all reports export to CSV. PDF reports deferred. |
| **LockitScript** | Ambient's official page describes production reports, editor's logs, clip logs, lined-script **PDF**, and customizable export/report metadata workflows. [17] | **Generic CSV/TXT continuity export not verified** on this page. Obtain official schema/sample/version or vendor clarification before promising an adapter. Do not infer CSV from “metadata” or editor compatibility. |

First planned import support is ordinary user-selected UTF-8 TXT/CSV, with mapping/preview and provenance. **Not implemented.** PDF parsing/OCR is later. A vendor's export support is evidence to investigate interoperability, not evidence ContinuityGhost already imports it. No fabricated sample exports or guessed proprietary formats were used.

## Sources

Numbers are stable research-ledger IDs; links refer to retrieved official pages. External documents can change after this snapshot.

[1] MLH, Sunhacks challenge categories — https://www.mlh.com/events/sunhacks-ec

[2] Sunhacks organizer dashboard and schedule — https://sunhacks.io/dash

[3] Google, Image understanding — https://ai.google.dev/gemini-api/docs/image-understanding

[4] Google, `generateContent` API — https://ai.google.dev/api/generate-content

[5] Supermemory introduction (legacy-style examples observed) — https://supermemory.ai/docs/intro

[6] Supermemory API overview — https://supermemory.ai/docs/api-reference/overview

[7] Supermemory API v5 migration — https://supermemory.ai/docs/migration/api-v5

[8] Supermemory current quickstart — https://supermemory.ai/docs/quickstart.md

[9] Supermemory document search OpenAPI — https://supermemory.ai/docs/api-reference/documents/search-documents.md

[10] Tiger Data, Hypertables — https://www.tigerdata.com/docs/use-timescale/latest/hypertables

[11] Tiger Data, `time_bucket` — https://www.tigerdata.com/docs/api/latest/hyperfunctions/time_bucket

[12] ScriptE/S v3 product page — https://www.scriptesystems.com/scripte-for-mac-and-ipad

[13] ScriptE Systems, January newsletter (take CSV export) — https://www.scriptesystems.com/scripte-systems-blog/january-newsletter

[14] Scriptation, How do I use Tagging? — https://help.scriptation.com/en/article/how-do-i-use-tagging-9lma1q

[15] MovieSlate, Reports — https://www.movie-slate.com/reports

[16] MovieSlate, report export FAQ — https://www.movie-slate.com/FAQs/10650/60/76

[17] Ambient, LockitScript App — https://ambient.de/en/pages/lockitscript-app

[18] Supermemory, Add document OpenAPI — https://supermemory.ai/docs/api-reference/ingest/add-document.md

[19] Supermemory, Create memories directly OpenAPI — https://supermemory.ai/docs/api-reference/content-management/create-memories-directly.md

[20] Supermemory SDK reference — https://supermemory.ai/docs/integrations/supermemory-sdk.md

[21] Supermemory ingestion pipeline — https://supermemory.ai/docs/concepts/how-it-works.md

[22] Supermemory namespaces / former container tags — https://supermemory.ai/docs/concepts/container-tags
