# Offline service credential setup (macOS)

Existing Gemini configuration is preserved byte-for-byte. Helper locks `.env.local`, appends only missing credential variables, refuses existing variables (including placeholders), disallows symlinks, uses mode 0600, and rolls back its append on write failure. All service flags must be false. Does not retrieve Apple Passwords automatically; copy key yourself into hidden terminal input. No network requests or database changes.

From repository:

```bash
python3 scripts/configure-services.py supermemory
python3 scripts/configure-services.py tiger
python3 scripts/configure-services.py status
```

1. In Apple Passwords, open `ContinuityGhost — Supermemory API`, copy key, run first command and paste into hidden prompt. Nothing echoes. Clear clipboard afterward. Never paste it into chat.
2. Second command asks permission before reading `~/Downloads/tiger-cloud-continuityghost-db-credentials.txt`. Type `READ` only if you approve. Builds percent-encoded PostgreSQL URL with `sslmode=verify-full` (TLS plus certificate and hostname verification). Never prints URL.
3. Status prints variable names and configured/missing states only. All three credentials should say configured, all three service flags disabled. Key presence does not prove credentials valid.

Unsupported dotenv-sensitive key characters (quotes, backslash, dollar) are rejected without writing; connection components are URL-encoded first. Do not manually weaken TLS to bypass certificate issues. This helper targets macOS/POSIX (file locking).

After configuration, request approval before any minimal live tests: one Gemini comparison (potential charge), one Supermemory ingest/search (potential charge, note asynchronous ingestion), and one read-only Tiger connection/TLS check. Database migrations and end-to-end data writes need separate explicit approval. Scripts do not enable services or billing. Restart Next.js after configuration when ready.

Tests: `python3 -m unittest discover -s scripts -p 'test_configure*.py'`. Includes Next's real environment-loader round-trip using disposable fixtures, preservation, duplicate rejection, enabled flag comments, TLS encoding, symlinks and permissions. No actual credentials in tests.
