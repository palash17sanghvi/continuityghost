# Local setup and checks

ContinuityGhost is a local-use prototype, not an authenticated hosted service. Never bind it publicly, deploy it, or expose it through a tunnel. No credentials or live calls are needed for the offline checks below.

## Prerequisites

- Node.js compatible with Next.js 16 (20.9+) and npm. No runtime version is pinned in this repository.
- FFmpeg and ffprobe on `PATH` for video analysis and media integration tests.
- Python 3 for the optional private credential helpers and their tests.

```bash
npm ci
npm run dev -- --hostname 127.0.0.1
```

Open http://127.0.0.1:3000. Missing credentials block analysis rather than producing simulated findings.

## Private configuration

The non-secret [`.env.example`](../.env.example) lists supported variables. Do not overwrite existing `.env` or `.env.local`. Local environment files are gitignored; never commit credentials or paste them into chat, source, browser forms, command arguments, or shell history.

For first-time Gemini setup, run in your own terminal:

```bash
npm run setup:gemini
```

The helper uses hidden input, creates `.env.local` with mode 0600, rejects dotenv-sensitive key characters, refuses existing environment files, and leaves all service flags false. If configuration exists, edit it privately instead. It makes no provider request. Restart Next.js after configuration changes.

| Variable | Purpose / gate |
| --- | --- |
| `GEMINI_API_KEY` | Server-only Google credential |
| `GEMINI_MODEL` | Model identifier; default `gemini-3.6-flash`. Account availability must be checked separately; do not silently substitute a model. |
| `ALLOW_PAID_ANALYSIS` | Must equal `true` before paid analysis is allowed; requires explicit owner approval before enabling |
| `SUPERMEMORY_API_KEY`, `ALLOW_SUPERMEMORY` | Optional external memory; relevant per-request consent is also required |
| `DATABASE_URL`, `ALLOW_DATABASE` | Optional external PostgreSQL; separate approval required before enabling or migrating |

Server approval alone does not authorize a browser request. The reviewer must explicitly approve both transmission of images/context and potential API cost. Do not pre-check consent. Optional memory sharing has its own consent. Failures or cancellation can still incur charges; obtain approval before retrying.

For additional services use the existing [private setup helpers](CREDENTIAL-SETUP.md). Do not weaken TLS verification to make setup pass. Never run `npm run db:migrate` without permission to modify the configured database.

## Free checks

```bash
npm run lint
npm test
npm run build
npm run typecheck
python3 -m unittest discover -s scripts -p 'test_*.py'
```

Stop the dev server before building; restart it afterward rather than reusing stale `.next` assets. A clean build generates Next.js type files needed by the TypeScript check.

```bash
npx playwright install chromium
npm run test:e2e
```

Playwright starts its own loopback server on port 3200 with paid analysis, Supermemory, and database flags disabled. Browser tests use generated video and intercepted API responses; they write screenshots under `docs/overnight-screenshots/`. Review or restore generated screenshot changes rather than accidentally committing unrelated binary churn.

Vitest exercises real FFmpeg/filesystem behavior and embedded PGlite SQL where indicated, but mocks external providers. It does not verify current Gemini, Supermemory, or Tiger Data account access. [Verification scope](VERIFICATION.md).

## API reference

The current UI uses `POST /api/video/analyze` with multipart video, scope, and explicit approvals. See [automatic video](AUTOMATIC-VIDEO.md) for its full limits and storage behavior.

The legacy `POST /api/analyze` accepts `reference` and `candidate` files plus `projectId`, `sceneId`, optional `context`, `consent=true`, and `costApproved=true`; optional `memoryConsent=true` enables scoped recall only when server configuration permits it.

- JPEG/PNG/WebP; each file at most 8 MiB and at most 24 million decoded pixels. AVIF/HEIF are not accepted.
- Total multipart body at most **16,877,216 bytes**: two 8 MiB files plus 100,000 bytes overhead. Streamed bodies are bounded too.
- Project and scene labels: 1–120 trimmed characters each; context: at most 12,000 characters. Labels do not provide authorization.
- Findings include both-image evidence, uncertainty, and suggested action. Still-image findings do not establish video timestamps, bounding boxes, or calibrated probabilities.

The legacy route rejects malformed input/consent/images (`400`), disallowed origins or disabled server cost approval (`403`), oversized requests (`413`), missing configuration or unavailable credentials/model (`503`), rate limits (`429`), invalid/provider output (`502`), and timeouts (`504`), as applicable. Configuration gates may run first. Provider payloads and credentials must never appear in client errors. See [route source](../src/app/api/analyze/route.ts) and [failure classifier](../src/lib/gemini.ts).
