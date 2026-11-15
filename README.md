# ContinuityGhost

Automatic video continuity analyzer for SunHacks: **one video → automatic keyframes/comparisons → timestamped evidence → human review → reload-safe decisions**. See [automatic workflow, limits and approval boundaries](docs/AUTOMATIC-VIDEO.md). Requires FFmpeg and ffprobe on PATH. Primary flow never requires manual frame selection.

## Status and limits

- Automatic video pipeline is **live verified** with `gemini-3.6-flash`: one 15-second video → 30 frames / three visual shot groups → automatic 0-to-9-second comparison → missing watch finding, HTTP 200 in 11.901 seconds. One owner-approved Gemini call; review, reload and JSON export verified against real local storage. Automated tests still mock provider calls. Missing keys or approval block analysis.
- Supermemory and Tiger Data are enabled and **live verified**: approved memory ingested/recalled; all three SQL migrations applied; real video metadata, finding and review history saved/read back from Tiger Data. Per-request memory consent remains required. Owner-approved hackathon database connection uses encrypted TLS 1.3 with certificate verification skipped for this database URL only; restore verified TLS before production. Media files remain local. See [memory setup](docs/MEMORY.md) and [database setup](docs/DATABASE.md).
- Video analyses, evidence media and saved decisions persist on the local application server for reload support. PostgreSQL/Tiger Data is optional; local fallback is clearly labeled, never presented as live Tiger. Supermemory sharing requires separate consent. Project/scene partitioning is not user authentication.
- Only automatically selected frames and approved context/rules are sent to Google, not the full video. Obtain permission for footage; provider retention is separate from application storage.
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

Imported Figma design runs in the existing Next.js app; original export is untouched. Primary workflow accepts one 15–60-second MP4/WebM/MOV, extracts evidence and selects comparisons automatically. Findings link to real sample timestamps and supporting frames; saved decisions survive reload. Heuristic sampling is not exhaustive video understanding. Earlier live two-frame success does not verify this new automatic pipeline; offline tests do not claim genuine AI detection. Fresh explicit approval is required for live Gemini/Supermemory/Tiger Data tests. Legacy still API remains reusable internally.
