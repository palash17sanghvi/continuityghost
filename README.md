# ContinuityGhost

Local film-continuity review prototype: compare a reference still with a candidate still using Gemini, then let a human review potential differences. Immediate milestone: **two images → evidence-backed findings → session-only review/export**.

## Status and limits

- Gemini is **live verified** with `gemini-3.6-flash`: local video → captured frames → HTTP 200 in 19.6 seconds → missing-watch finding. Automated tests mock provider calls; missing keys or approval still block analysis.
- Supermemory v5 scene-scoped retrieval/decision ingestion and PostgreSQL persistence/analytics are implemented behind disabled-by-default service flags. Live sponsor success is **not verified**. See [memory setup](docs/MEMORY.md) and [database setup](docs/DATABASE.md).
- Reviews are local until explicitly saved with a configured database. Supermemory sharing requires separate consent. Reloading can lose unsaved work; JSON exports remain available. Project/scene partitioning is not user authentication.
- No media is persisted by the application. Approved analysis sends normalized images and supplied context to Google; application non-persistence is not a claim about provider retention.
- **Local only. No authentication. Do not deploy publicly or expose through tunnels.** Same-origin checks are not authentication.

## Run locally

```bash
npm ci
npm run dev -- --hostname 127.0.0.1
```

Open http://127.0.0.1:3000. Keep the server bound to loopback. Build/lint checks: `npm run build` and `npm run lint`. Mocked unit/route tests: `npm test`. Browser tests: `npm run test:e2e` (first run: `npx playwright install chromium`). Passing mocks is not a real Gemini end-to-end verification. Stop the dev server before a production build, then restart it before browser checks to avoid stale `.next` assets.

## Credentials and paid-analysis approval

Copy `.env.example` to `.env.local` **only if `.env.local` does not already exist**. `.gitignore` excludes local environment files and explicitly permits the non-secret `.env.example` template. Never commit credentials.

Never paste keys into chat, source, browser form fields, command arguments, or shell history. From this repository, run this hidden-input setup command in your own terminal. It creates `.env.local` exclusively and refuses to overwrite an existing file:

```bash
python3 - <<'PY'
import getpass
import os
from pathlib import Path

path = Path('.env.local')
if path.exists():
    raise SystemExit('.env.local exists; keep it and edit privately instead.')
key = getpass.getpass('Gemini API key (hidden; Enter leaves analysis blocked): ').strip()
if any(c in key for c in '\r\n\x00\'"#$\\'):
    raise SystemExit('Unexpected key characters; no file written.')
text = '\n'.join([
    f'GEMINI_API_KEY={key}',
    'GEMINI_MODEL=gemini-3.6-flash',
    'SUPERMEMORY_API_KEY=',
    'DATABASE_URL=',
    'ALLOW_PAID_ANALYSIS=false',
    '',
])
fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, 'w') as file:
    file.write(text)
print('Created private .env.local; paid analysis remains disabled.')
PY
```

Before any live call, the owner must approve potential costs and privately change server `ALLOW_PAID_ANALYSIS=true`, then restart the server. The browser must also explicitly approve **both** potential API cost and transmission of images/context. Neither checkbox substitutes for server approval; server approval does not substitute for browser consent. Do not pre-check consent. Missing any gate means no provider call. Failed requests may still incur provider charges; do not retry blindly.

Supermemory and PostgreSQL are optional integrations, disabled until separately configured and approved. Never prefix server secrets with `NEXT_PUBLIC_`.

## Upload contract

`POST /api/analyze` accepts multipart fields `reference`, `candidate`, `projectId`, `sceneId`, `context`, `consent=true`, and `costApproved=true`.

- Exactly two intended stills; each nonempty JPEG, PNG, or WebP up to **8 MiB (8,388,608 bytes)**. Declared MIME must match decoded bytes; filenames alone are not validation.
- Server decodes actual bytes, rejects corrupt/mismatched/animated images and excessive decoded pixel counts, then strips metadata and normalizes images before sending them.
- Total multipart request is bounded at **16,877,216 bytes** (two 8 MiB files plus 100,000 bytes of form overhead), including streamed bodies without a trusted `Content-Length`.
- Project/scene labels: 1–120 characters after trimming. Context: up to 12,000 characters. Do not put secrets or unapproved production material in context.
- Findings include evidence from both images, uncertainty, suggested action, and human review state. No inferred timestamps, fabricated bounding boxes, calibrated probabilities, or auto-confirmed continuity errors.

Responses: `400` malformed input/consent/image, `403` disallowed origin or server cost gate, `413` oversized request, `503` missing Gemini configuration, `502` provider failure or invalid model response. Configuration gates may run before input validation. Errors must not disclose provider payloads or keys.

Gemini supports multiple images in one prompt; this is the intended provider mechanism, not proof a live request succeeded. See official research and sources in [SPONSORS](docs/SPONSORS.md).

## Project docs

- [PRD](docs/PRD.md): scope, user flow, acceptance criteria.
- [Architecture](docs/ARCHITECTURE.md): current boundary and future isolation/storage design.
- [Tasks](docs/TASKS.md): milestone checklist and deferred work; no invented completion checks.
- [Demo](docs/DEMO.md): honest local demo, consent gates, mocked-vs-live distinction.
- [Sponsors and compatibility research](docs/SPONSORS.md): official citations, API-version caveats, export research.

## Integrated frontend

Imported Figma design runs in the existing Next.js app; original export is untouched. Local video import/playback/seeking/capture, still uploads, side-by-side/overlay, Gemini findings, review, session Projects/Scenes and JSON export work. Only two selected stills are sent, not the video. No automatic full-video scan or durable media/project library; export before reload.
