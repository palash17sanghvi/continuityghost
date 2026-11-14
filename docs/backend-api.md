# Backend API — feature branch contract

This supersedes the endpoint-availability/auth sections of `frontend-integration.md` on `feat/backend-completion`. UI is intentionally untouched. No live provider or database success is implied.

## Authentication and authorization

Generate local owner credential without printing it: `python3 scripts/configure-services.py auth`. This appends a random BACKEND_API_TOKEN to the existing gitignored file, never changes service flags or replaces keys. Restart server. Do not run just to test with live services; all provider gates stay off.

- `POST /api/session` JSON `{token}` validates server owner credential, returns `{authenticated:true}`, sets HttpOnly SameSite=Strict cookie (Secure over HTTPS). Browser should send only on login, never localStorage or URL. Session cookie is a derived bearer capability, expires browser-side in 8h; server token rotation revokes existing sessions. This is single-owner shared-workspace authorization, not multiple-user/tenant membership.
- `DELETE /api/session` clears cookie.
- Protected routes accept cookie or `Authorization: Bearer ...`; token remains server-side except owner login input. Missing/invalid auth 401; server auth unconfigured503. Cross-origin mutations403. Health remains public configuration booleans, no secrets.
- Do not deploy publicly without separate approval/security hardening.

## Resource endpoints

Path IDs: 1–120 ASCII letters/numbers/underscore/hyphen, first alphanumeric. Names nonblank≤200. Create payload `{id,name}`. Lists `{items,total,limit,offset}`. Default limit50, max100, offset≥0. Query pagination for all lists supported at route level. `resource-client.ts` provides initial typed helpers; callers can extend pagination options without inventing routes.

| Route | Methods | Result |
|---|---|---|
| `/api/projects` | GET, POST | project page / created project201 |
| `/api/projects/:projectId` | GET | `{id,name,createdAt}` |
| `/api/projects/:projectId/scenes` | GET, POST | scene page / created scene201 |
| `/api/projects/:projectId/scenes/:sceneId` | GET | scene adds `projectId` |
| `/api/projects/:projectId/scenes/:sceneId/analyses` | GET | full saved analysis page |
| `/api/projects/:projectId/scenes/:sceneId/analyses/:analysisId` | GET | analysis, current findings, decision history and actual saved memory context |
| same analysis path + `/findings` | GET | findings page |
| same analysis path + `/export` | GET | attachment JSON `{analysis,findings}` |
| scene path + `/rules` | GET | active continuity rule page |
| `/api/projects/:projectId/events` | GET | event page; optional `sceneId` |
| `/api/analytics?projectId=...` | GET | category/outcome counts, finding trends, totals and timeseries mode |
| `/api/memories` | POST | `{projectId,sceneId,query,consent:true}` → reconciled memory status/facts/warning |

Exact scope is checked on every read. Unknown resource404, duplicate create409, invalid input400, unavailable persistence503. All SQL uses parameters. Queries don't fetch or store images. No deletion implemented.

## Comparison and review

`POST /api/analyze` remains multipart two-image upload+comparison in one request. Fields: `reference`, `candidate`, `projectId`, `sceneId`, `context`, `consent='true'`, `costApproved='true'`, optional `memoryConsent='true'`. JPEG/PNG/WebP≤8MiB each; total body bounded; full decode/MIME verification normalized before transmission. No separate persistent image upload endpoint: this deliberately avoids storing private footage. When database enabled, project/scene must already exist; failed scope lookup occurs before Gemini. Existing configured model is unchanged; service gate remains independently required.

Response retains existing analysis contract. Optional finding `severity:low|medium|high`, `confidence:{level:tentative|supported|strong,basis}` are evidence-qualified, not calibrated probabilities. Uncertainty mandatory. Metadata stored with findings. Memory used is persisted with analysis for export provenance.

`POST /api/reviews`: existing request plus optional UUID `idempotencyKey`. Status `confirmed|dismissed|intentional`; note≤4000; consent controls Supermemory sharing, not database save. Exact scoped finding is locked; same current status/note replays existing decision instead of duplicating; idempotency key replay must match original payload, conflicting reuse409. A changed decision creates a new historical decision and supersedes prior active rule. Replayed decisions do not trigger another remote ingestion. Response may include `replayed:true`; memory warning explicitly explains no new request was made. Later reads preserve decision history. Active DB decision IDs invalidate stale remote memories even when reversal is not republished.

## Typed modules and frontend integration

- Existing `api-contract.ts`, `api-client.ts`: analysis/review/health/analytics.
- New `resource-contract.ts`, `resource-client.ts`: saved resources, history, rules, events, exports and session login.
- Saved findings can have reviewed status; initial AI response status remains `unreviewed`. Do not use initial-only schema for history.
- Initial UI has no login flow and is not redesigned in this backend task. Teammate must establish session, create/select project+scene, then call protected APIs. Existing mock browser tests are UI regression evidence only.
- Disabled provider/network failures never silently fall back to fixtures. Errors preserve drafts; successful AI but failed DB save must remain visibly unsaved.

## Local migrations vs live approval

Local tests execute migrations001–004 in disposable embedded PostgreSQL. 003 adds project/scene names; 004 adds review idempotency and assessment/provenance columns. Live database is untouched. Migration execution requires separate explicit approval and secure verified connection. Full live workflow remains blocked; see `backend-status.md` and `live-approval-requests.md`.
