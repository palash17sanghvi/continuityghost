import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { Pool } from 'pg';

export async function migrate(): Promise<void> {
  if (process.env.ALLOW_DATABASE !== 'true' || !process.env.DATABASE_URL?.trim()) {
    throw new Error('Migration disabled: configure DATABASE_URL and ALLOW_DATABASE=true.');
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 5000 });
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // One transaction and fixed lock serialize all runners before metadata is read.
      await client.query('SELECT pg_advisory_xact_lock($1)', [1734180321]);
      await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
      const dir = new URL('../migrations/', import.meta.url);
      const files = (await readdir(dir)).filter(name => /^\d+_[a-z0-9_]+\.sql$/.test(name)).sort();
      const existing = await client.query<{name:string;checksum:string}>('SELECT name, checksum FROM schema_migrations ORDER BY name');
      const applied = new Map(existing.rows.map(row => [row.name, row.checksum]));
      for (const name of applied.keys()) if (!files.includes(name)) throw new Error(`Applied migration missing: ${name}`);
      for (const name of files) {
        const sql = await readFile(new URL(name,dir),'utf8');
        const checksum = createHash('sha256').update(sql).digest('hex');
        if (applied.has(name)) {
          if (applied.get(name) !== checksum) throw new Error(`Migration checksum mismatch: ${name}`);
          continue;
        }
        // Trusted versioned SQL only; never construct SQL from runtime input.
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name,checksum) VALUES ($1,$2)', [name,checksum]);
      }
      await client.query('COMMIT');
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { /* Preserve original failure. */ }
      throw error;
    } finally { client.release(); }
  } finally { await pool.end(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  migrate().catch(error => { console.error(error instanceof Error ? error.message : 'Migration failed.'); process.exitCode = 1; });
}
