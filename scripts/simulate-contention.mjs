// Fires many simultaneous booking requests for one free slot against a running Slotkeeper and reports what
// happened. Exactly one request should win; every other one must be a clean 409, never a 500 or a duplicate.
//
//   node scripts/simulate-contention.mjs [--base http://127.0.0.1:8103] [--per-user 5] [--keep]
//
// Uses the seeded member accounts (password SEED_MEMBER_PASSWORD from .env). The winning booking is cancelled
// afterwards unless --keep is given, so the demo data stays as it was.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const base = opt('base', 'http://127.0.0.1:8103');
const perUser = Number(opt('per-user', '5'));
const keep = args.includes('--keep');
const password =
  process.env.SEED_MEMBER_PASSWORD ??
  /^SEED_MEMBER_PASSWORD=(.*)$/m.exec(readFileSync('.env', 'utf8'))?.[1]?.trim();
const accounts = ['demo', 'maya', 'tal', 'sophie', 'priya', 'avi'].map((n) => `${n}@slotkeeper.test`);

async function signIn(email) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`sign-in failed for ${email}: ${res.status}`);
  const { csrfToken } = await res.json();
  const cookie = res.headers.get('set-cookie').split(';')[0];
  const call = (method, path, body, extra = {}) =>
    fetch(base + path, {
      method,
      headers: { cookie, 'x-csrf-token': csrfToken, 'content-type': 'application/json', ...extra },
      body: body ? JSON.stringify(body) : undefined,
    });
  return { email, call };
}

const sessions = await Promise.all(accounts.map(signIn));
const first = sessions[0];
const resources = (await (await first.call('GET', '/api/resources?kind=room')).json()).items;

// Find the first free slot from tomorrow on, in any room.
let target;
for (const r of resources) {
  const avail = await (await first.call('GET', `/api/resources/${r.id}/availability?days=7`)).json();
  for (const day of avail.days.slice(1)) {
    const idx = day.slots.findIndex(
      (s, i) =>
        s.state === 'free' &&
        day.slots.slice(i, i + 4).length === 4 &&
        day.slots.slice(i, i + 4).every((x) => x.state === 'free'),
    );
    if (idx >= 0) {
      target = {
        resource: r,
        date: day.date,
        start: day.slots[idx].start,
        end: day.slots[idx + 3].end,
        local: day.slots[idx].localStart,
      };
      break;
    }
  }
  if (target) break;
}
if (!target) throw new Error('no free hour found in the next week');

console.log(`Target: ${target.resource.name}, ${target.date} ${target.local} (${target.resource.timezone})`);
console.log(`Sending ${sessions.length * perUser} simultaneous requests from ${sessions.length} accounts...`);

const started = performance.now();
const results = await Promise.all(
  sessions.flatMap((s) =>
    Array.from({ length: perUser }, async () => {
      const t = performance.now();
      const res = await s.call(
        'POST',
        '/api/bookings',
        { resourceId: target.resource.id, start: target.start, end: target.end, title: 'Contention test' },
        { 'idempotency-key': randomUUID() },
      );
      return { email: s.email, status: res.status, body: await res.json(), ms: performance.now() - t };
    }),
  ),
);
const elapsed = performance.now() - started;

const byStatus = Object.groupBy(results, (r) => `${r.status} ${r.body.error?.code ?? 'CREATED'}`);
for (const [k, v] of Object.entries(byStatus)) console.log(`  ${k.padEnd(28)} ${v.length}`);
const latencies = results.map((r) => r.ms).sort((a, b) => a - b);
console.log(
  `  total ${elapsed.toFixed(0)} ms; per request p50 ${latencies[Math.floor(latencies.length / 2)].toFixed(0)} ms, max ${latencies.at(-1).toFixed(0)} ms`,
);

const winners = results.filter((r) => r.status === 201);
const unexpected = results.filter((r) => r.status !== 201 && r.status !== 409 && r.status !== 422);
const after = await (
  await first.call('GET', `/api/resources/${target.resource.id}/availability?date=${target.date}`)
).json();
const overlapping = after.days[0].reservations.filter((r) => r.start < target.end && r.end > target.start);
console.log(
  `Winners: ${winners.length}; reservations now in that hour: ${overlapping.length}; unexpected responses: ${unexpected.length}`,
);

if (winners.length === 1 && !keep) {
  const owner = sessions.find((s) => s.email === winners[0].email);
  await owner.call('POST', `/api/bookings/${winners[0].body.id}/cancel`, {
    expectedVersion: winners[0].body.version,
  });
  console.log('Winning booking cancelled again (use --keep to leave it).');
}
const ok = winners.length === 1 && overlapping.length === 1 && unexpected.length === 0;
console.log(ok ? 'PASS: exactly one booking, no errors.' : 'FAIL');
process.exit(ok ? 0 : 1);
