# Live approval requests — not executed

**No live provider calls are permitted by the current task.** This document requests narrowly bounded future approval; it is not approval itself. No credential helper, environment edit, migration, authentication request, application route, or provider diagnostic was executed while writing it. Public documentation retrieval only was used to check API constraints. All live backend E2E remains blocked; see [backend-status.md](backend-status.md).

Approval must name the exact request envelope below. Approval of one item does not approve another, repeated attempts, polling, production traffic, writes, model changes, billing changes, or migrations. Free-tier availability is owner-reported; quota, rate limits, possible charges, and usage after a timeout remain uncertain. Never disclose secrets or raw private images/document contents in reports.

## G1 — exactly one isolated Gemini 3.8 comparison

**Requested approval text:**

> Approve G1: one direct Gemini GenerateContent comparison using configured `gemini-3.8-flash`, the existing owner-approved reference/candidate stills and current comparison prompt/schema (including optional severity and qualitative confidence), `maxOutputTokens: 2048`, `thinkingConfig: { thinkingLevel: 'LOW' }`, temperature 0.2, SDK HTTP timeout 60000 ms, and `retryOptions: { attempts: 1 }`. Use existing free-tier credentials; no model/billing change, tools, caching, database, memory, retries, or automatic fallback. Stop after the first response or error and report sanitized evidence and available usage.

### Exact scope and rationale

- API: existing Google GenAI SDK `models.generateContent` / Gemini Developer API `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent`, authenticated privately with the existing server key. No Interactions API experiment or second request.
- Inputs: exactly the same two approved stills and current `src/lib/continuity.ts` prompt/context/image normalization. Confirm exact fixture paths privately before execution; do not select replacement images or fabricate prompt content. Use the current structured schema: summary and findings/evidence/uncertainty/action, plus optional `severity: low|medium|high` and `confidence: {level: tentative|supported|strong, basis: string}`. These are qualitative judgments, not calibrated probability scores. Optional fields can be absent without fabrication.
- Config: `responseMimeType: 'application/json'`, current JSON schema, `maxOutputTokens: 2048`, temperature 0.2, `thinkingConfig: { thinkingLevel: 'LOW' }`, `httpOptions: { timeout: 60000, retryOptions: { attempts: 1 } }`. One total attempt includes the initial call, not one extra retry. Apply a matching abort/deadline; no hidden outer retry loop. This is an isolated harness proposal, not a change to the existing pipeline's 45-second provider allowance.
- No tools, function calling, search grounding, URL context, explicit caches, memory lookup, analysis persistence, database failure-event write, or invocation of `/api/analyze`. That route has additional dependencies/possible writes and is not the approved diagnostic.
- Do not change configured model to 2.5, try a fallback after failure, raise output tokens automatically, enable billing, or broaden the prompt. The source fallback model string is not permission to use it.

Google's official 3.8 documentation supports image input, structured output, and thinking levels `low`, `medium`, `high`; `minimal` is unsupported. Thus `LOW` is deliberate, not “disable thinking.” [1][2] Lowering the cap can truncate JSON; extending timeout does not guarantee success. Existing owner observation was HTTP 504 without usage metadata at the prior pipeline settings, not proof of no quota consumption.

**Evidence to retain:** configured model actually used; total attempt count; wall time; response status/finish reason; schema validation outcome; safe finding count; optional assessment presence; usage metadata if returned. On timeout/error report usage as **unknown** when unavailable. Do not invent successful output, token totals, or latency. Stop after that result; further changes require approval.

## S1 — one existing-document GET, then at most two conditional memory searches

Exact existing identifiers from [integration-readiness.md](integration-readiness.md), preserved without normalization:

- Document: `cg-verification-3f24739f-decc-4118-becf-1254997fd86f`
- Namespace/container: `cg_7459af2b33c6d03376ff02a9dfac9021f040dd9f9ef63321a3a9e96b92299e1f`

**Requested approval text:**

> Approve S1: one authenticated read of the exact existing Supermemory verification document, requesting chunks and memories, then only if processing and dreaming are both `done`, at most two namespace-scoped `searchMode: 'memories'` searches: the existing verification fact and one paraphrase. No writes, ingestion, updates, deletions, polling, retries, broader namespace, or chunks/hybrid substitute for generated-memory readiness. Stop and report actual lifecycle/count/retrieval evidence, including zero results.

### Request envelope and readiness gate

1. One `GET https://api.supermemory.ai/v3/documents/cg-verification-3f24739f-decc-4118-becf-1254997fd86f`, private bearer auth. Request inclusion of **chunks and memories** through the supported document response/SDK options. The inspected official GET reference establishes the path but does not establish an `include` query parameter; do not invent one or probe alternate endpoints. Resolve inclusion syntax from the installed SDK/current official contract offline before execution; if it cannot return the requested fields in one read, stop for clarification rather than spend extra live calls. Verify returned document/container association against the exact namespace. Missing scope/lifecycle fields are not inferred success. [3]
2. Inspect raw `system.status`, `system.dreamingStatus`, returned chunks, and memories privately. Report only safe status/count/scope evidence. Owner's previous result was processing `done`, dreaming `dreaming`, `memories: []`; this is **not** generated-memory readiness. If dreaming is still pending, fails, is missing, or the document is out of scope, stop with **zero searches**. Both statuses `done` with zero memories is a legitimate observation, not permission to add content or loop.
3. Only with both lifecycle statuses `done`, make at most two authenticated read-only semantic searches: exact namespace above, `searchMode: 'memories'`, `limit: 10`, and the approved verification fact for the first query and one paraphrase of that same fact for the second. Derive both privately from the existing verification fixture; exact query text must be fixed before approval/execution, not invented in this document. The current official search guide documents `supermemory.search(namespace, { query, searchMode, limit })`; the application adapter also uses namespace-based search. An attempted legacy API-reference URL returned 404. Resolve the exact installed-SDK method or HTTP path/body **offline and attach it to approval before execution**; this is not permission to guess a legacy `/v4/search`/`q` contract, probe endpoints, or omit namespace isolation. [4]
4. Validate returned scope and actual relevance; record counts and safe identifiers without leaking content. Missing/irrelevant/zero hits remain failures to demonstrate recall. A chunk-only or production hybrid hit must not be relabeled generated-memory verification. This diagnostic does not prove database reconciliation or end-to-end application memory use.

No new documents, decision writes, upserts, reingestion, metadata edits, forgotten-memory changes, or automatic repair are approved. Any write is a separate future request with explicit destination/payload and read-back plan.

## D1 — secure database path selection, not connection or migration approval

Current blocker: owner reports Tiger Shared Free `verify-full` failure `SELF_SIGNED_CERT_IN_CHAIN`; readiness notes record the custom-certificate limitation. Retain strict certificate-chain and hostname verification. Do not use `rejectUnauthorized: false`, `NODE_TLS_REJECT_UNAUTHORIZED=0`, insecure `sslmode` changes, guessed certificates, or an unauthenticated downloaded trust anchor.

Seek one of these separately approved paths:

1. **Preferred provider path:** an authenticated Tiger/platform-supported trust-chain solution compatible with Shared Free and strict verification. Document authoritative provenance and hostname verification before proposing a bounded connectivity read. Do not declare sponsor integration working from credential presence.
2. **Local development fallback:** explicit permission to provision/use local PostgreSQL, with exact loopback target and data scope. This can exercise real SQL persistence without the sponsor service; it is **not Tiger live verification**. Embedded PGlite tests likewise do not verify network TLS or deployment.
3. **Hosted secure alternative:** if provider trust remains blocked, return a separate architectural approval request covering provider, hosting/costs, data destination, credential management, migration/rollback, and continuity/sponsor implications. No hosting/provider switch is authorized now.

No D1 connection, database creation, trust-store change, environment edit, or provisioning is approved by this document. An approved path selection is still not permission to apply migrations.

## M1 — future live migration approval must be explicit

Before asking for execution approval, freeze/review the actual migration contents and identify the exact database host/name privately. Current tree includes `001_initial.sql`, `002_active_rules.sql`, `003_resources.sql` (resource names), and `004_review_idempotency.sql` (request keys and currently additional optional assessments/memory context). These files are being developed concurrently; their names are not a stable checksum or a final review.

The later request must include: secure verified destination, exact final migration list and content identifiers, existing schema/version and prerequisite checks, proposed writes/backfills, backups/rollback or recovery limitations, expected effects on existing records, execution bounds, and read-back checks. Reconcile applied migrations before executing; do not assume rerunning an edited numbered migration upgrades an already-migrated database. No destructive reset, automatic migration on startup, or sponsor migration is implicitly approved by local tests or “complete the backend.”

Only after trusted connectivity and explicit migration approval can a separately approved backend E2E write/read-back plan verify project/scene creation, comparison persistence, durable idempotent reviews, active rules, timeline, analytics, export, and consented memory behavior. Every live backend E2E status remains **blocked** until evidence exists.

## Sources

[1] Google AI Studio, Gemini 3.8 Flash model reference: https://aistudio.google.com/docs/models/gemini-3.8-flash

[2] Google AI Studio, What's new in Gemini 3.8 Flash (thinking levels and SDK configuration): https://aistudio.google.com/docs/whats-new-gemini-3.8

[3] Supermemory, Get document API reference: https://supermemory.ai/docs/api-reference/documents/get-document

[4] Supermemory, current Search guide: https://supermemory.ai/docs/recall/search (the attempted legacy `https://supermemory.ai/docs/api-reference/search/search-memories-post` reference returned HTTP 404; no request contract was inferred from it).

Local evidence: `docs/integration-readiness.md`, `src/lib/continuity.ts`, `src/app/api/analyze/route.ts`, `src/lib/memory.ts`, `src/lib/workflow.ts`, and current migration files. Public documentation checks are not authenticated provider calls or live verification.
