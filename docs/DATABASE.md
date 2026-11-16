# PostgreSQL / Tiger Data persistence

> **Evidence boundary:** live-service/configuration statements below are historical owner-approved hackathon records, not current environment checks. This portfolio pass made no provider calls, database connections, migrations, or TLS changes. Current source and fresh offline checks are described in [architecture](ARCHITECTURE.md) and [verification](VERIFICATION.md).

Persistence is **off by default**. Both `ALLOW_DATABASE=true` (exact lowercase value) and a nonempty `DATABASE_URL` are required. The legacy persistence module throws when disabled; callers check `databaseEnabled()`. Automatic video has durable local storage even with PostgreSQL disabled; its fallback is labeled local, not remote success. The legacy still-image path does not share that local video persistence. No credential discovery, extension installation, cloud provisioning, or paid calls occur here.

## Explicit setup (operator only)

Install dependencies through the application owner (`pg`, `@types/pg`, `tsx`). Configure the connection using your normal secret mechanism. For an explicitly approved target run:

```sh
ALLOW_DATABASE=true DATABASE_URL='postgresql://localhost/disposable_continuityghost' npx tsx scripts/migrate.ts
```

This is a disposable example. The migration runner intentionally supports an operator-configured PostgreSQL/Tiger URL, so operators must verify the target first. Do not point automated tests at a production URL. TLS is controlled through the PostgreSQL connection string; verified TLS remains the normal recommendation.

### Historical owner-approved hackathon setup

After explicit approval to bypass certificate verification for this demo, the local Tiger Data URL uses `sslmode=no-verify`. The installed `pg-connection-string` implementation sets `rejectUnauthorized=false` for this connection only; encryption remains enabled. Live `pg_stat_ssl` confirmed TLS 1.3 (`TLS_AES_256_GCM_SHA384`). No global `NODE_TLS_REJECT_UNAUTHORIZED` override or TLS changes to Gemini/Supermemory were made. This is vulnerable to server impersonation and must not be carried into production; restore `sslmode=verify-full` with a trusted CA/publicly trusted server certificate afterward.

Migrations `001_initial.sql`, `002_active_rules.sql` and `003_video.sql` were applied and read back from the real database. Existing synthetic analysis `42744539-1346-4efd-93fa-e1019cd83ab2` was saved through the application's review API, then queried directly in Tiger Data: 30 keyframes, one comparison, one confirmed finding, and three historical decisions. Application reload returned `persistence.mode=postgres`. Source video/JPEG bytes still live on the application server, not inside PostgreSQL. No new Gemini generation or Supermemory request was made for this database test.

Migrations are sorted versioned SQL files. The runner opens one transaction, takes a fixed transaction-scoped advisory lock, creates `schema_migrations`, and records each file's SHA-256 checksum. Reruns skip unchanged applied files. Missing applied files or checksum drift fail and roll back the entire run. Do not edit applied migrations; add a new numbered migration. The SQL files themselves are not standalone idempotent scripts; the tracked runner supplies idempotency.

## Schema and isolation

- `projects` → `scenes` → `analyses` → `findings` use composite foreign keys including project and scene.
- `review_decisions` is append-only history; a review updates the canonical finding's current status. Every review also writes a `continuity_rules` record referencing the exact scoped decision, and a review event. Migration `002_active_rules.sql` adds `active`: a re-review atomically deactivates prior rules for the exact finding before inserting its new active rule. A partial unique index enforces one active rule per scoped finding. Readers must filter `WHERE active`; historical rules remain available for audit.
- `events` stores timestamped `analysis_started`, `analysis_completed`, `analysis_failed`, `finding_detected`, `review_confirmed`, `review_dismissed`, and `review_intentional` records. Event primary key includes the time column for Timescale compatibility.
- IDs are opaque text, not assumed UUIDs. Colliding scene/analysis/finding IDs in different projects cannot cross-link.

Database scope constraints are **not authentication**. The HTTP layer must authorize project access. The database role has no per-user RLS policy in this implementation. Analysis insertion creates project/scene scope when absent; only trusted server orchestration should call it.

## Exported contracts (`src/lib/database.ts`)

- `databaseEnabled(): boolean` performs no network I/O.
- `persistAnalysis(result, startedAt: Date): Promise<void>` accepts `analysisId`, `projectId`, `sceneId`, `summary`, and `findings[]` with `id`, `category`, `description`, `referenceEvidence`, `candidateEvidence`, `uncertainty`, `suggestedAction`, `status`. Categories: wardrobe/props/placement/appearance/action/background. Status: unreviewed/confirmed/dismissed/intentional. Validates input and unique finding IDs, inserts analysis, evidence and timestamped events atomically. `analysis_started` is backfilled with the supplied real start timestamp in the completion transaction; it does not expose in-flight analyses. Duplicate analysis scope fails, rather than overwriting history.
- `persistAnalysisFailure({analysisId,projectId,sceneId}, startedAt, reason): Promise<void>` atomically writes a failed analysis and started/failed events without inventing findings. Call after a real provider failure, not after a persistence failure on an otherwise completed result.
- `persistReview({analysisId,findingId,projectId,sceneId,status,note}): Promise<{decisionId,content}>` accepts only confirmed/dismissed/intentional and review notes up to 4000 characters. The current memory adapter uses the canonical `decisionId` as the external document ID and metadata provenance. Re-reviews retain distinct decision documents; retrieval must reconcile hits to current canonical history so superseded decisions are not promoted. Locks the exact scoped finding, reads canonical evidence from PostgreSQL, and constructs content from that evidence plus the review note. The decision, rule, finding status and review event commit together. Repeated reviews append history; they are not idempotent retries.
- `getAnalytics(projectId): Promise<{categories,outcomes,trends,totals,timeSeriesMode}>` queries a consistent read-only repeatable-read snapshot. `categories` counts canonical findings by category. `outcomes` counts current finding statuses (including unreviewed), not decision history. `trends` counts `finding_detected` events in UTC daily buckets (ISO timestamps). `totals` contains all analysis rows (completed and failed), findings, and historical review decisions. Counts are numbers; no placeholder/synthetic metrics. Empty projects return zero totals and empty arrays.

All runtime data uses bound SQL parameters. The daily bucket expression is selected from two fixed SQL literals, never from user input. Versioned migration SQL is trusted static source, not runtime data.

## Timescale optional path

`001_initial.sql` checks `pg_extension` inside a `DO` block. When TimescaleDB is already installed, it invokes `create_hypertable('events', by_range('occurred_at'), if_not_exists => TRUE)`. It never runs `CREATE EXTENSION`. An unavailable extension leaves an ordinary PostgreSQL table. If an installed extension is incompatible or conversion fails, migration fails explicitly rather than silently masking a misconfigured Timescale installation.

Analytics uses `time_bucket(INTERVAL '1 day', occurred_at)` only when the installed extension **and** the actual `events` hypertable are present, returning `timeSeriesMode: 'timescale'`. Otherwise it explicitly uses UTC `date_trunc` and returns `'postgres'`. Existing plain deployments are not automatically converted if the extension is installed later; add an operator-reviewed migration to convert them. The conversion API requires TimescaleDB 2.13+.

Official references researched:

- [Tiger Data create_hypertable](https://www.tigerdata.com/docs/reference/timescaledb/hypertables/create_hypertable): `by_range`, `if_not_exists`, non-null time dimensions, and conversion constraints.
- [Tiger Data time_bucket](https://www.tigerdata.com/docs/api/latest/hyperfunctions/time_bucket/): UTC daily bucketing and interval signature.

## Verification boundaries

```sh
npx vitest run src/lib/database.test.ts src/lib/database.integration.test.ts
```

Unit tests mock only the pg boundary and assert opt-in, parameter binding, scope predicates, rollback/release, event names, real aggregate queries, both bucket modes, migration locking/checksums/reruns. Integration tests execute the actual migration SQL and application queries on a disposable in-memory PGlite PostgreSQL engine; they verify scope collisions across projects, canonical review evidence, composite constraints, event persistence, rollback, failure records, zero totals, and the explicit ordinary-PostgreSQL analytics fallback.

The offline tests described in this section contacted no remote database; the separate historical database check above is not a fresh test receipt. PGlite does not verify the optional Timescale conversion or live Tiger service behavior. The runner's advisory-lock/checksum orchestration is unit-tested with a mocked query boundary; PGlite integration executes the SQL file directly, not the runner. `psql`/`postgres` were not available on PATH. Production TLS, roles, backups, retention, and live Timescale execution still require operator verification.
