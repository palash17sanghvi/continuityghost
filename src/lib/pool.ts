import { Pool, type PoolConfig } from 'pg';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { PGlite } from '@electric-sql/pglite';

/**
 * Local persistence mode for demos while the hosted database is blocked.
 * DATABASE_URL=pglite:.data/db opens a file-backed embedded PostgreSQL (survives restarts) and applies
 * the same migrations/*.sql used for Tiger Data, so the schema stays compatible.
 * Any other URL goes to the normal pg Pool with unchanged TLS behavior.
 */
export const LOCAL_PREFIX = 'pglite:';
type Local = { db: PGlite; lock: Promise<void> };
const registry = globalThis as unknown as { __cgLocalDbs?: Map<string, Promise<Local>> };

export function isLocalDatabaseUrl(url: string | undefined): boolean { return Boolean(url?.startsWith(LOCAL_PREFIX)); }

async function migrateLocal(db: PGlite): Promise<void> {
  await db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
  const applied = new Set((await db.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map(row => row.name));
  const dir = resolve(process.cwd(), 'migrations');
  for (const name of (await readdir(dir)).filter(file => /^\d+_[a-z0-9_]+\.sql$/.test(file)).sort()) {
    if (applied.has(name)) continue;
    const sql = await readFile(resolve(dir, name), 'utf8');
    await db.transaction(async tx => {
      await tx.exec(sql);
      await tx.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1,$2)', [name, createHash('sha256').update(sql).digest('hex')]);
    });
  }
}
function openLocal(target: string): Promise<Local> {
  const maps = (registry.__cgLocalDbs ??= new Map());
  let opened = maps.get(target);
  if (!opened) {
    opened = (async () => {
      const { PGlite } = await import('@electric-sql/pglite');
      const db = new PGlite(target.startsWith('memory://') ? target : resolve(process.cwd(), target));
      await db.waitReady;
      await migrateLocal(db);
      return { db, lock: Promise.resolve() };
    })();
    maps.set(target, opened);
    opened.catch(() => maps.delete(target));
  }
  return opened;
}
/** Opens and migrates the local database ahead of the first request. A cold start runs every migration (about 3 s),
 * which would otherwise exceed the 2 s connection deadline used by the request code. No-op for non-local URLs. */
export async function warmLocalDatabase(): Promise<void> {
  const url = process.env.DATABASE_URL?.trim();
  if (process.env.ALLOW_DATABASE === 'true' && isLocalDatabaseUrl(url)) await openLocal(url!.slice(LOCAL_PREFIX.length));
}
/** Test and shutdown hook: closes every local database so a file can be reopened ("restart"). */
export async function closeLocalDatabases(): Promise<void> {
  const maps = registry.__cgLocalDbs; registry.__cgLocalDbs = undefined;
  for (const opened of maps?.values() ?? []) { try { await (await opened).db.close(); } catch { /* already closed */ } }
}
function localPool(target: string): Pool {
  // One embedded connection: a lock hands it to one transaction at a time, like a pool of size 1.
  const pool = {
    async connect() {
      const local = await openLocal(target);
      const previous = local.lock;
      let unlock!: () => void;
      local.lock = new Promise<void>(done => { unlock = done; });
      await previous;
      let released = false;
      return {
        query: (sql: string, params?: unknown[]) => local.db.query(sql, params as unknown[]),
        release: () => { if (!released) { released = true; unlock(); } },
      };
    },
    async end() { /* shared instance; closeLocalDatabases() owns shutdown */ },
  };
  return pool as unknown as Pool;
}
export function createPool(config: PoolConfig & { connectionString: string }): Pool {
  return isLocalDatabaseUrl(config.connectionString) ? localPool(config.connectionString.slice(LOCAL_PREFIX.length)) : new Pool(config);
}
