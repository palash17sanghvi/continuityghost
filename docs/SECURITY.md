# Security and privacy boundaries

## Local-only scope

**No production-grade authentication or private-user isolation exists. Do not deploy publicly, bind publicly, or expose through tunnels.** Project and scene identifiers scope data but are not authorization. Same-origin request checks reduce a class of browser misuse; they do not authenticate callers.

Keep Next.js bound to `127.0.0.1`. A successful production build is a build check, not authorization to host the application.

## Costs and consent

Gemini requires configured server credentials, owner approval before enabling `ALLOW_PAID_ANALYSIS=true`, and separate browser consent for upload and potential cost. Consent must not be pre-selected. Supermemory requires its own server flag, key, and applicable request/review consent. PostgreSQL requires separate configuration and approval; migrations alter the target database.

Provider errors, local cancellation, or timeout do not prove a request was free or canceled remotely. Do not retry blindly. The app must not replace blocked or failed analysis with fabricated findings.

## Media and credentials

- Only process footage/context you have permission to share. Synthetic test fixtures are not evidence of live analysis.
- Google receives selected frame images and approved context, not the whole uploaded video. The full video, extracted frames, records, and saved decisions persist locally for successful video analyses by default under gitignored `.continuityghost/videos/`. Custom `CONTINUITY_DATA_DIR` locations need equivalent access and Git-exclusion controls.
- There is no implemented automatic retention/deletion policy. Local success/failure cleanup is not a complete privacy lifecycle. Provider retention is independent of local storage.
- Optional PostgreSQL stores structured records/review history; optional Supermemory shares eligible text facts rather than raw frames. See [database](DATABASE.md) and [memory](MEMORY.md) for boundaries and partial-failure behavior.
- Never commit `.env.local`, `.env`, credentials, source footage, or private exports. Keep keys server-only and out of chat, browser forms, shell history, logs, and command arguments. [Setup](SETUP.md).

## Trust boundaries

Upload and model-output validation are security controls, not cosmetic checks. The implementation bounds request bodies, decoded image sizes, video dimensions/duration, media-tool runtime/output/workers, and provider evidence. FFmpeg/ffprobe run without a shell and with restricted protocols. Structured findings must pass schema and pair-reference validation before display/storage. These controls do not constitute an independent security audit or make unauthenticated hosting safe.

## Historical TLS limitation

The repository records one owner-approved hackathon Tiger Data connection using encrypted TLS 1.3 while skipping server-certificate verification for that database URL. Encryption without certificate verification does not reliably establish server identity. **Do not copy, broaden, or describe that exception as production-safe. Restore verified TLS before any production consideration.** New credential setup uses `sslmode=verify-full`; see [database caveats](DATABASE.md) and [credential setup](CREDENTIAL-SETUP.md).

This portfolio pass did not read private credentials, change service flags, run migrations, call paid providers, or deploy anything. Historical service records are distinguished from freshly executed offline checks in [verification](VERIFICATION.md).
