# Integration verification runbook

## Actual status

Live browser test succeeded with `gemini-3.6-flash`: synthetic video → frames captured at 0 and 1.5 seconds → HTTP 200 in 19.573 seconds → missing-watch finding, zero browser errors. Analysis ID: `2c26d2a7-fe56-4d82-a8b3-2b37771f054b`. Export was checked by replaying that recorded real response without another paid call; matching analysis ID and source-video timestamps were preserved. Owner approved paid analysis. `gemini-3.8-flash` metadata was valid but generation repeatedly timed out; configured/default model now uses live-verified 3.6.

Automated provider tests mock HTTP/SDK boundaries. No live Gemini generation, Supermemory, Tiger Data, or Timescale success is claimed by these backend tests. PostgreSQL integration tests execute real SQL in disposable embedded PGlite, not Tiger Data. Application remains local-only, without authentication.

## Configure Gemini (owner, about 2 minutes)

1. Visit https://aistudio.google.com/apikey and create an API key for a project with Gemini access. Current official key guidance: https://ai.google.dev/gemini-api/docs/api-key. Newly issued authorization keys are preferred; unrestricted legacy standard keys are rejected.
2. For a fresh configuration, run `npm run setup:gemini` from this repository. Hidden input writes `.env.local` mode 0600 and refuses overwrite. If `.env` already exists, the helper refuses to create a shadowing `.env.local`; edit existing settings locally instead. Next.js loads both formats, with `.env.local` taking precedence. Never paste secrets into chat. Model defaults to verified `gemini-3.8-flash`; key must have model/quota access. Key presence does not establish free usage or billing approval.
3. Leave `ALLOW_PAID_ANALYSIS=false` until owner explicitly approves API usage. Do not enable Cloud billing automatically. Restart Next.js after environment edits.

## Safe diagnostics

`GET /api/health` reports configuration presence, selected model and service gates only. HTTP 200 does not validate credentials, model support, quota or generation. The server does not make paid calls from health checks.

Use an authenticated `GET https://generativelanguage.googleapis.com/v1beta/models` metadata request to check a model before changing it. Load server environment through `@next/env`, send the key in `x-goog-api-key`, follow pagination, and print only model names and `supportedGenerationMethods`. Never print the key, full environment or raw provider errors. Metadata checks do not run `generateContent`.

Analysis errors now return a fixed safe `error` plus `code`; raw provider messages and submitted data are never returned or logged:

| Code | HTTP | Owner action |
| --- | --- | --- |
| `GEMINI_AUTH` | 503 | Check key, API restrictions and project permissions. Includes HTTP 401/403 and structured `API_KEY_INVALID` errors. |
| `GEMINI_MODEL` | 503 | HTTP 404: verify configured model against authenticated metadata. |
| `GEMINI_QUOTA` | 429 | Check quota/rate limit and billing; do not enable billing without approval or auto-retry paid requests. |
| `GEMINI_TIMEOUT` | 504 | Timeout, cancellation, or upstream HTTP 408/504; request may still incur costs. Obtain approval before retrying. |
| `GEMINI_OUTPUT` | 502 | Empty/malformed structured findings after a provider response; no findings accepted. |
| `GEMINI_REQUEST` | 502 | Other upstream HTTP 400; check request/model/schema compatibility. |
| `GEMINI_FAILED` | 502 | Other provider failures or invalid findings; inspect configuration before another potentially paid request. |

Missing credentials still return 503; disabled server paid gate still returns 403 before generation. Per-request image-sharing consent, cost approval, same-origin checks and upload validation remain required. SDK requests use `responseJsonSchema` derived from the Zod `responseSchema`, with `responseMimeType: 'application/json'`; local parsing validates every response again. Mocks verify request shape, not live model schema support. Run only the owner-approved single generated-frame comparison to verify live acceptance; do not repeat automatically on failure.

Gemini 3.6+ ignores custom sampling parameters and may reject them in future; requests omit `temperature`, `topP` and `topK` per the [official troubleshooting guide](https://ai.google.dev/gemini-api/docs/troubleshooting). API, health, setup and example use live-verified `gemini-3.6-flash`. Generation grammar omits string/item limits to avoid upstream schema rejection; strict response validation still enforces nonempty evidence, 3000-character limits and at most 30 findings.

Provider work has a maximum 65-second budget within the existing 80-second request deadline, reserving 10 seconds for finalization if preparation used much of the deadline. SDK `httpOptions.retryOptions.attempts=1` explicitly prohibits hidden retries. Failure logs contain only fixed classification code, stage (`provider`, `output`, `persistence`) and elapsed milliseconds, never provider messages or uploaded data. The first owner-run smoke returned generic 502 after about 43.8 seconds before these diagnostics existed; its cause cannot be reconstructed from that response, so it does not establish a timeout or structured-output failure. A subsequent owner-run direct SDK probe with a 90-second timeout and one attempt returned `ApiError` HTTP 504 after about 88.8 seconds, before parsing. This establishes an upstream timeout on that probe, not a schema rejection. No HTTP(S)/ALL proxy or Gemini/Vertex base-URL override variables were configured during a safe presence-only check. No successful live generation is claimed here; further paid probes need owner approval.

Next.js can normalize `request.url` to `localhost` even when the browser uses `127.0.0.1`. Analysis and review routes therefore compare Origin against the validated original `Host` plus request URL protocol, falling back to URL authority when Host is absent. They do not trust `Forwarded` or `X-Forwarded-*` headers, and do not consider `localhost` and `127.0.0.1` interchangeable origins. This fixes false 403s without weakening foreign-origin rejection. Same-origin protection is not authentication; keep the server loopback-only.

## Original test images

Run `npm run demo:images`. Generated `.demo-images/reference.png` and `candidate.png` are original geometric restaurant illustrations (not footage, detected evidence, or AI output). Reference has silver watch; candidate does not. Images remain local until approved analysis. No network call occurs during generation.

## Approved live walkthrough (blocked until owner approval)

- Configure Gemini, Supermemory and Tiger Data credentials locally; approve each service's costs before setting its `ALLOW_*` flag. Database migrations modify the configured database: inspect URL locally and use only this project's dedicated database.
- Run `npm run db:migrate` after database approval. No migration runs automatically on startup. Review [database docs](DATABASE.md) and [memory docs](MEMORY.md).
- Upload originals with stable project and scene IDs. Approve Gemini disclosure/cost checkbox. First comparison needs no memory consent. Record actual findings; no particular finding is guaranteed.
- If Gemini flags a supported difference, select intentional, note that watch removal was scripted, consent to Supermemory sharing, then Save decision. Confirm database-save status separately from asynchronous memory ingestion status. Do not call queued ingestion a successful retrieval.
- Wait for ingestion; run later comparison with memory consent. Confirm retrieved decision is visible in provenance and assess whether actual model interpretation changes. Empty search is not evidence of successful ingestion; do not auto-loop paid requests.
- Load project analytics. Check actual recorded analysis/review events and `timeSeriesMode`. Only `timescale` confirms the hypertable/time_bucket path; `postgres` is a transparent fallback.

Live acceptance is incomplete until all three sponsor services are exercised successfully with approved credentials and the real before/after findings and retrieved evidence are documented without secrets or private images.
