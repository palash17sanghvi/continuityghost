# Backend completion status

## Read this before declaring completion

**Entire live backend end-to-end: BLOCKED / NOT VERIFIED.** Final local checks: 169 application tests across 17 files, 16 Python tests, 9 browser tests, TypeScript, lint and production build passed. PostgreSQL integration executes real SQL in disposable PGlite; external AI/memory boundaries remain mocked in these tests. Production dependency audit reports zero vulnerabilities. No live service requests or migrations were made during this implementation. Independent read-only security review found no concrete blockers in the single-owner, local-only scope. External end-to-end verification remains blocked, not certified by these tests.

The target is a complete persistent backend, not mock success. Older two-image/session-only scope in `PRD.md`, `DEMO.md`, or `INTEGRATION-VERIFICATION.md` does not establish current completion. Provider observations below are owner-reported, as recorded in [integration-readiness.md](integration-readiness.md), not newly reproduced here. See [live-approval-requests.md](live-approval-requests.md) before any external execution.

## Verification vocabulary

- **Implemented:** executable source exists, possibly uncommitted/in flight. Does not imply tests pass.
- **Local-tested:** requires captured execution evidence against the final tree. Test files alone do not qualify; mocked transport and embedded SQL tests are not live services.
- **Live-verified:** requires an approved real call and read-back evidence for the exact feature. No feature below has that status in this snapshot.
- **Blocked:** missing approval, verified trust, usable service response, or test evidence. Disabled/unavailable/failed responses must remain truthful, never fabricated success.

## Feature ledger

All local-test outcomes below are **parent pending**, even where test coverage exists. Abbreviations: `P=/api/projects/{projectId}`, `S=P/scenes/{sceneId}`, `A=S/analyses/{analysisId}`. Braces represent exact resource IDs, not user/tenant identities.

| Required feature / surface | Implemented source and current boundary | Local-tested | Live-verified / blocker |
| --- | --- | --- | --- |
| Owner authentication and session | `src/lib/backend-auth.ts`; `POST/DELETE /api/session`. Server-only `BACKEND_API_TOKEN` must be at least 32 characters. Bearer authentication or derived HttpOnly, SameSite=Strict session cookie; Secure on HTTPS, eight-hour cookie lifetime, origin checks on mutations. Missing configuration fails closed. | Pending: auth/session tests exist. | No. Local setup and approved runtime verification pending. |
| Named project creation, listing, lookup | `GET/POST /api/projects`, `GET P`; real SQL in `src/lib/resources.ts`, strict resource body/ID validation. | Pending: resource and route tests in flight. | No. Approved trusted database and migrations needed. |
| Named scene creation, listing, lookup | `GET/POST P/scenes`, `GET S`; parent scope and duplicate handling in resource SQL. | Pending. | No. Same database blocker. |
| Two-image comparison | `POST /api/analyze`; decoded JPEG/PNG/WebP validation, bounded multipart input, consent/cost/server gates, Gemini JSON schema and structured failures. `continuity.ts` now accepts optional severity and qualitative confidence. | Pending: analyze, continuity, assessment tests. | No successful comparison established. Owner's configured 3.8 request returned 504. Isolated bounded comparison requires separate approval. |
| Analysis persistence and reloadable history | `database.ts` / `workflow.ts`; `GET S/analyses`, `GET A`; actual SQL persistence and failed-analysis events. Disabled/save-failed states do not claim persistence. | Pending: mocked database tests and embedded PGlite SQL integration tests exist. | No. Gemini success plus trusted migrated database required for real save/reload. |
| Findings and assessment retrieval | `GET A/findings`; persisted current status, evidence, decision history; optional severity/confidence storage added in migration 004. Older results can omit assessments. | Pending. | No. Do not invent percentages or backfill unsupported model judgments. |
| Durable human reviews | `POST /api/reviews`; authoritative database first, confirmed/dismissed/intentional status, notes, scope checks, optional separate memory consent. Idempotency route/SQL work is in flight; migration 004 introduces request-key storage. | Pending: review/database tests; final route-to-workflow-to-SQL idempotency wiring must be reconciled. | No. Durable save, retries, changed decisions, and read-back not live-proven. |
| Active continuity rules | `GET S/rules`; current non-superseded confirmed/intentional decisions selected from SQL. Dismissed decisions are not active rules. | Pending. | No. Verify supersession/deactivation against real persisted decisions later. |
| Timeline/event history | `GET P/events`, optional `sceneId`; SQL event records and bounded pagination. | Pending. | No. Database event read-back required. |
| Analytics | `GET /api/analytics?projectId=…`; authenticated real database queries, explicit 503 when disabled/unavailable. | Pending. | No. No hard-coded live metrics may substitute for missing SQL evidence. |
| Scoped memory retrieval | `POST /api/memories`; authenticated, explicit consent, exact project/scene scope. `memory.ts` searches Supermemory; `workflow.ts` reconciles hits with authoritative database decisions before use. | Pending: memory/workflow/route tests. | No. Existing verification document is ingested, but owner reports `dreaming` and empty generated memories. Database reconciliation also blocked. |
| Decision memory ingestion | Review workflow stores database decision before optional Supermemory write; remote failure remains explicit. | Pending. | No. **No live memory writes approved** by this task or the next read-only diagnostic. |
| Persisted server export | `GET A/export`; JSON attachment built from stored analysis/findings rather than a fabricated report. | Pending. | No. Trusted database save/reload/export chain needed; browser-only export is not proof. |
| Secure database connectivity and migrations | `database.ts`, migrations `001_initial.sql`, `002_active_rules.sql`, new `003_resources.sql`, `004_review_idempotency.sql`. 003 adds resource names; current 004 adds review request keys, optional finding assessments, and analysis memory context. Additions may still change. | Pending: embedded SQL tests are not network PostgreSQL/Tiger TLS tests. | Blocked: Tiger Shared Free `verify-full` reported `SELF_SIGNED_CERT_IN_CHAIN`; no live migration approval. |
| Offline credential helper | `scripts/configure-services.py auth` locally generates a token using `secrets.token_urlsafe(48)` and appends `BACKEND_API_TOKEN`; no provider request in helper. | Pending: helper tests exist. Helper **not executed** here. | No environment changes performed. Generation is not authentication or provider verification. |

## Authentication model: deliberately single owner

This is **one shared owner workspace**, not multi-tenant SaaS. Every authenticated client can access all projects/scenes/resources. Resource scoping prevents cross-project/scene reference mistakes; it does not provide per-user ownership or tenant isolation. Do not describe bearer tokens, scene IDs, or memory namespace hashes as per-user authorization.

The backend-auth child owns the server session implementation. Keep the owner token server-side; do not embed it in frontend bundles, URLs, documentation, or logs. The session capability is derived from the token rather than containing the raw token. Rotation invalidates prior derived capabilities; deletion clears the browser cookie. Final session-security behavior still requires the parent's tests and review.

## Provider blockers and implementation boundaries

- **Gemini:** owner reports `gemini-3.8-flash`, free-tier access, and HTTP 504 without usage metadata for the existing comparison. Existing pipeline uses a 45-second maximum provider allowance, 6000 output tokens, temperature 0.2, an 80-second handler deadline, and route `maxDuration=90`. Its fallback source string is still 2.5; this does **not** authorize changing the configured 3.8 model or making a fallback request. Proposed isolated 3.8 diagnostic uses 2048 output tokens, `LOW` thinking, 60-second timeout, one total attempt; it has not been run or substituted into production code.
- **Supermemory:** ingestion `done` is distinct from generated-memory readiness. Use only the existing verification document and exact scope recorded in `integration-readiness.md`; one approved status GET first, then at most two approved scoped searches if ready. No writes/reingestion or polling loop.
- **Tiger:** retain strict chain and hostname verification. Shared Free custom-certificate limitation is unresolved. Seek authenticated provider/platform trust or a separately approved local PostgreSQL development fallback. Local fallback would validate development persistence only, **not** a sponsor/Tiger integration. A hosted secure alternative is an architectural decision requiring later explicit approval.

## Remaining acceptance gate

1. Parent reconciles concurrent source changes, then records final local test/build results and unresolved failures. Do not mark “local-tested” from test existence or another branch's run.
2. Owner approves bounded provider diagnostics separately; capture schema-valid result or sanitized error/unknown usage honestly.
3. Resolve secure database trust and obtain explicit approval for the exact destination and final migration set before applying anything live.
4. Only after those approvals, verify authenticated create → analyze → persist → review/retry → reload → rules/events/analytics → export, plus consented, canonically reconciled memory behavior. Read back the exact written targets.
5. Until real evidence exists, **all live backend E2E remains blocked**. No mock adapter, local embedded SQL pass, configured credential, or documentation claim closes that gate.

## Inspected evidence

Repository-relative sources: `src/app/api/**/route.ts`, `src/lib/backend-auth.ts`, `resource-http.ts`, `resources.ts`, `database.ts`, `continuity.ts`, `workflow.ts`, `memory.ts`, corresponding test files, `migrations/003_resources.sql`, `migrations/004_review_idempotency.sql`, and `scripts/configure-services.py`. Provider history and existing diagnostic identifiers: [integration-readiness.md](integration-readiness.md). This report writes documentation only; no environment values were read or changed.
