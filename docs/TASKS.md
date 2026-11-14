# Tasks

Status convention: unchecked means acceptance not certified here. This documentation pass does not certify tests or mark live integration complete. No database or memory integration exists.

## Verified local milestone

- `npm test`: 25 tests passed across two files (mocked provider).
- `npm run test:e2e`: 3 browser tests passed, including preview validation, consent UI, mocked comparison, review/export and invalidation.
- `npm run lint`, TypeScript and production build passed.
- `npm audit --omit=dev`: 0 production vulnerabilities. Full audit still reports 7 moderate development-tool findings.
- Desktop and 390px mobile layout checked; no horizontal overflow. Independent backend review found no blockers.
- Live Gemini remains blocked on credentials and owner cost approval; Supermemory/Tiger Data integrations remain unimplemented.

## Immediate: two-image Gemini comparison

- [ ] Exercise local UI with two user-approved JPEG/PNG/WebP stills, labels/context, and accessible previews; confirm session-only review/export behavior and reload-loss warning.
- [ ] Run mocked tests for actual decode/MIME mismatch, corrupt/oversized/animated input, pixel limits, and total multipart limits with and without `Content-Length`; ensure invalid input never reaches provider.
- [ ] Verify each gate separately: absent key, disabled server approval, missing browser cost approval, and missing browser data consent. Confirm schema-invalid/provider failures remain honest errors; zero real findings remains valid.
- [ ] Run `npx vitest run`, `npm run lint`, and `npm run build`; record actual output. Exercise browser tests separately if configured. Mock providers in automated checks; no live charges hidden in tests.
- [ ] Only after owner approval/key and explicit browser approvals, perform real local Gemini comparison. Record real outcome/model and limitations without media/secrets. Until then, **live API E2E blocked, not verified**.

## Later: safe persistence and retrieval — not implemented

- [ ] Add authentication and relational project membership/authorization before public deployment. Define retention/deletion and media policy; continue no-media persistence unless separately approved.
- [ ] Add relational schema/migrations for findings, provenance, human review decisions, and ingestion state. Human decisions supersede conflicting retrieved memories; test cross-project denial.
- [ ] Pin one Supermemory API/SDK generation. Reconcile `/v3/memories` references against current `/v3/documents` and v5 namespace docs; verify add/search E2E, delayed indexing, deletion, idempotency, and server-owned project scoping.
- [ ] Provision Tiger Data only with approval; implement event hypertable and project-filtered `time_bucket` query, then demonstrate real query output. Do not equate database design with sponsor integration.

## Later: imports — not implemented

- [ ] Build bounded TXT/CSV import with mapping, preview, provenance, validation, and human confirmation. Add spreadsheet-formula protections to CSV exports.
- [ ] Obtain representative authorized exports from ScriptE, Scriptation, MovieSlate, and LockitScript. Test exact product version and report type; no blanket interoperability claim.
- [ ] Evaluate PDF parsing/OCR only after ordinary text/CSV flow works. Vendor PDF availability does not imply a current PDF importer.

## Submission evidence

- [ ] Recheck event schedule and challenge requirements. Event page lists Gemini and Tiger Data tracks; Supermemory appears as a sponsor but its challenge is unverified. Sources: [SPONSORS](SPONSORS.md).
- [ ] Capture only truthful local demo: distinguish implemented request path, mocked tests, authorized real call if any, and future architecture. No fake AI results or unbuilt sponsor claims.

Next action: run `npx vitest run` locally; record output before marking any test item complete.
