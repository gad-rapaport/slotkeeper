import pg from 'pg';
import type { Config } from '../config.js';

export type Pool = pg.Pool;
export type PoolClient = pg.PoolClient;
/** Anything that can run a query: the pool itself or a client inside a transaction. */
export type Db = pg.Pool | pg.PoolClient;

// Return bigint columns (request refs, activity ids) as JS numbers. Values stay far below 2^53.
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number.parseInt(v, 10));

export function createPool(
  config: Pick<Config, 'DATABASE_URL' | 'DB_POOL_MAX' | 'DB_STATEMENT_TIMEOUT_MS'>,
): Pool {
  return new pg.Pool({
    connectionString: config.DATABASE_URL,
    max: config.DB_POOL_MAX,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: config.DB_STATEMENT_TIMEOUT_MS,
    application_name: 'slotkeeper',
  });
}

type IsolationLevel = 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE';

/** SQLSTATEs where PostgreSQL rolled the transaction back and a clean retry is the documented remedy. */
const RETRYABLE = new Set(['40P01', '40001']); // deadlock_detected, serialization_failure

export const MAX_TRANSACTION_ATTEMPTS = 3;

/**
 * Runs `fn` in a transaction. If PostgreSQL aborts it as a deadlock victim or for a serialization failure, the
 * whole transaction is retried (up to 3 attempts, short random pause). Concurrent inserts guarded by an
 * exclusion constraint can deadlock each other: each inserts its index entry, then waits for the other's
 * outcome. One is aborted; on retry it sees the winner's committed row and fails cleanly with a conflict.
 */
export async function withTransaction<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>,
  isolation: IsolationLevel = 'READ COMMITTED',
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const client = await pool.connect();
    try {
      await client.query(`BEGIN ISOLATION LEVEL ${isolation}`);
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      const code = (err as { code?: unknown }).code;
      if (typeof code !== 'string' || !RETRYABLE.has(code) || attempt >= MAX_TRANSACTION_ATTEMPTS) throw err;
    } finally {
      client.release();
    }
    await new Promise((resolve) => setTimeout(resolve, 5 + Math.random() * 20));
  }
}
