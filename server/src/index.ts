import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { migrate } from './db/migrate.js';
import { createPool } from './db/pool.js';
import { purgeExpiredSessions } from './modules/auth/sessions.js';
import { purgeIdempotencyKeys } from './modules/reservations/service.js';

const config = loadConfig();
const pool = createPool(config);
const app = await buildApp(config, pool);

if (config.MIGRATE_ON_START) {
  const result = await migrate(pool);
  app.log.info({ applied: result.applied }, 'migrations checked');
}

// Housekeeping: expired sessions and idempotency records older than their retention window.
const housekeeping = setInterval(
  () => {
    Promise.all([purgeExpiredSessions(pool), purgeIdempotencyKeys(pool, config.IDEMPOTENCY_TTL_HOURS)])
      .then(([sessions, keys]) => {
        if (sessions || keys) app.log.info({ sessions, idempotencyKeys: keys }, 'housekeeping purge');
      })
      .catch((err: unknown) => app.log.warn({ err }, 'housekeeping failed'));
  },
  60 * 60 * 1000,
);
housekeeping.unref();

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, 'shutting down');
  clearInterval(housekeeping);
  await app.close();
  await pool.end();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ host: config.HOST, port: config.PORT });
