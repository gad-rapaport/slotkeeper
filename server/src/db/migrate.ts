import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { Pool } from './pool.js';

// Arbitrary constant shared by every Slotkeeper process; serialises concurrent migration runners.
const MIGRATION_LOCK_ID = 727_003;

export function defaultMigrationsDir(): string {
  return process.env.MIGRATIONS_DIR ?? fileURLToPath(new URL('../../migrations/', import.meta.url));
}

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

export async function migrate(pool: Pool, dir = defaultMigrationsDir()): Promise<MigrationResult> {
  const files = (await readdir(dir)).filter((f) => /^\d{3}_[a-z0-9_]+\.sql$/.test(f)).sort();
  const client = await pool.connect();
  const result: MigrationResult = { applied: [], skipped: [] };
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    text PRIMARY KEY,
        checksum   text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);
    const { rows } = await client.query<{ version: string; checksum: string }>(
      'SELECT version, checksum FROM schema_migrations',
    );
    const applied = new Map(rows.map((r) => [r.version, r.checksum]));

    for (const file of files) {
      const sql = await readFile(path.join(dir, file), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const existing = applied.get(file);
      if (existing) {
        if (existing !== checksum) {
          throw new Error(
            `Migration ${file} was modified after it was applied. Add a new migration instead.`,
          );
        }
        result.skipped.push(file);
        continue;
      }
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)', [
          file,
          checksum,
        ]);
        await client.query('COMMIT');
        result.applied.push(file);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`, { cause: err });
      }
    }
    return result;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]).catch(() => undefined);
    client.release();
  }
}
