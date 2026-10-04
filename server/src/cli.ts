/**
 * Operational entry point: node dist/server/cli.js migrate | seed | reset-demo --yes | healthcheck
 */
import { loadConfig } from './config.js';
import { migrate } from './db/migrate.js';
import { createPool } from './db/pool.js';
import { seed } from './db/seed.js';

function seedPasswords() {
  const admin = process.env.SEED_ADMIN_PASSWORD;
  const member = process.env.SEED_MEMBER_PASSWORD;
  if (!admin || !member)
    throw new Error('SEED_ADMIN_PASSWORD and SEED_MEMBER_PASSWORD must be set (see .env.example).');
  if (admin.length < 12 || member.length < 12)
    throw new Error('Seed passwords must be at least 12 characters.');
  return { admin, member };
}

async function healthcheck() {
  const port = process.env.PORT ?? '3103';
  try {
    const res = await fetch(`http://127.0.0.1:${port}/readyz`, { signal: AbortSignal.timeout(3000) });
    process.exit(res.ok ? 0 : 1);
  } catch {
    process.exit(1);
  }
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'healthcheck') return healthcheck();
  const config = loadConfig();
  const pool = createPool({ ...config, DB_POOL_MAX: 2 });
  try {
    switch (command) {
      case 'migrate': {
        const r = await migrate(pool);
        console.log(
          `migrations applied: ${r.applied.join(', ') || 'none'}; already present: ${r.skipped.length}`,
        );
        break;
      }
      case 'seed': {
        await migrate(pool);
        const s = await seed(pool, seedPasswords());
        console.log(
          `seed complete: ${s.users} users, ${s.sites} sites, ${s.reservationsInserted} new reservations`,
        );
        break;
      }
      case 'reset-demo': {
        if (!args.includes('--yes')) {
          console.error(
            'reset-demo deletes ALL Slotkeeper data and re-seeds it. Re-run with --yes to confirm.',
          );
          process.exitCode = 2;
          return;
        }
        await migrate(pool);
        await pool.query(
          `TRUNCATE activity_log, idempotency_keys, reservations, resources, opening_hours, sites, sessions, users
           RESTART IDENTITY CASCADE`,
        );
        await pool.query('DROP TABLE IF EXISTS seed_meta');
        const s = await seed(pool, seedPasswords());
        console.log(`demo reset: ${s.users} users, ${s.sites} sites, ${s.reservationsInserted} reservations`);
        break;
      }
      default:
        console.error('usage: cli.js migrate | seed | reset-demo --yes | healthcheck');
        process.exitCode = 2;
    }
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
