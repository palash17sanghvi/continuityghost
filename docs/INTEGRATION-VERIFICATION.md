# Integration verification runbook

## Actual status

Gemini credentials absent; no live Gemini, Supermemory, Tiger Data, or Timescale success claimed. Automated provider tests mock HTTP/SDK boundaries. PostgreSQL integration tests execute real SQL in disposable embedded PGlite, not Tiger Data. Existing UI stays local-only, without authentication.

## Configure Gemini (owner, about 2 minutes)

1. Visit https://aistudio.google.com/apikey and create an API key for a project with Gemini access. Current official key guidance: https://ai.google.dev/gemini-api/docs/api-key. Newly issued authorization keys are preferred; unrestricted legacy standard keys are rejected.
2. Run `npm run setup:gemini` from this repository. Hidden input writes `.env.local` mode 0600 and refuses overwrite. Never paste secrets into chat. Model defaults to `gemini-2.5-flash`; key must have model/quota access. Key presence does not establish free usage or billing approval.
3. Leave `ALLOW_PAID_ANALYSIS=false` until owner explicitly approves API usage. Do not enable Cloud billing automatically. Restart Next.js after environment edits.

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
