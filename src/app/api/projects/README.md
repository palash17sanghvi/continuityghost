# Resource HTTP contract

Single-owner shared workspace, **not multi-user storage**. Every authenticated client has access to every project and scene. No per-user or tenant isolation exists.

Set server-only `BACKEND_API_TOKEN` to at least 32 characters. No default credentials. Missing/short configuration returns 503. Requests need either `Authorization: Bearer <token>` or session cookie; failures return 401. Mutations reject mismatched `Origin` and `Sec-Fetch-Site: cross-site` with 403. Requests without browser origin metadata remain available to CLI clients.

`POST /api/session` accepts JSON `{ "token": "<configured token>" }`, bounded to 4096 bytes. Valid login sets `continuityghost_session`, an HMAC-SHA256 capability derived from server token and `continuityghost-session-v1`, not raw token. Cookie uses `HttpOnly`, `SameSite=Strict`, `Path=/`, eight-hour browser lifetime, and `Secure` on HTTPS. Static capability has no server-side expiry; rotate `BACKEND_API_TOKEN` to revoke existing capabilities. `DELETE /api/session` clears browser cookie, with same mutation-origin checks. Logout does not revoke copied capabilities.

All resource responses use `Cache-Control: no-store`. Creation JSON must contain exactly `{ "id": string, "name": string }`; maximum body size 4096 bytes. IDs are 1–120 ASCII letters/digits/underscore/hyphen, starting with letter/digit. IDs are never trimmed or repaired. Names are 1–200 characters and must contain non-whitespace. Analysis IDs must be UUIDs. Invalid path IDs return 404; malformed bodies/queries return 400; oversized bodies return 413. Resource errors preserve safe status codes without exposing database errors.

Routes relative to `/api/projects`:

| Path | Methods | Result |
| --- | --- | --- |
| `/` | GET, POST | Project list; created project (201) |
| `/:projectId` | GET | Project |
| `/:projectId/scenes` | GET, POST | Scene list; created scene (201) |
| `/:projectId/scenes/:sceneId` | GET | Scene |
| `/:projectId/scenes/:sceneId/analyses` | GET | Paginated analyses |
| `/:projectId/scenes/:sceneId/analyses/:analysisId` | GET | Analysis |
| `/:projectId/scenes/:sceneId/analyses/:analysisId/findings` | GET | Findings |
| `/:projectId/scenes/:sceneId/analyses/:analysisId/export` | GET | JSON attachment `{ analysis, findings }` |
| `/:projectId/scenes/:sceneId/rules` | GET | Active rules |
| `/:projectId/events` | GET | Paginated events; optional `sceneId` filter |

List/read payloads directly match `src/lib/resources.ts` return values. Analysis/event pagination uses `limit` default 50, range 1–100; `offset` default 0, range 0–1000000. Duplicate pagination parameters and duplicate `sceneId` filters are rejected. Export filename is `analysis-<analysisId>.json`.

`readJsonBody(request)` from `src/lib/resource-http.ts` exports bounded JSON parsing for other backend routes, with a 24000-byte limit. Session/resource creation instead uses `readJson(request)` with its 4096-byte default. Both count actual streamed bytes, including requests without Content-Length.
