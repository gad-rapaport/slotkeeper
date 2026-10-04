import { randomUUID } from 'node:crypto';
import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../../server/src/app.js';
import { loadConfig } from '../../server/src/config.js';
import type { Pool } from '../../server/src/db/pool.js';
import { createPool } from '../../server/src/db/pool.js';
import { hashPassword } from '../../server/src/modules/auth/passwords.js';
import { addDays, localDate, zonedToInstant } from '../../server/src/domain/time.js';
import { testDatabaseUrl } from './dbUrl.js';

/** Test-only credential for fixture users inside the throwaway test database. */
export const PASSWORD = 'fixture-password-1234';
export const TLV = 'Asia/Jerusalem';
export const LDN = 'Europe/London';

export interface TestContext {
  app: FastifyInstance;
  pool: Pool;
  close: () => Promise<void>;
}

export async function startApp(overrides: Record<string, string> = {}): Promise<TestContext> {
  const config = loadConfig({
    DATABASE_URL: testDatabaseUrl(),
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DB_POOL_MAX: '25',
    LOGIN_RATE_LIMIT_PER_MINUTE: '1000',
    BOOKING_RATE_LIMIT_PER_MINUTE: '10000',
    BOOKING_HORIZON_DAYS: '365',
    OPENAPI_PATH: 'docs/openapi.yaml',
    ...overrides,
  });
  const pool = createPool(config);
  const app = await buildApp(config, pool);
  await app.ready();
  return {
    app,
    pool,
    close: async () => {
      await app.close();
      await pool.end();
    },
  };
}

export async function resetData(pool: Pool) {
  await pool.query(
    `TRUNCATE activity_log, idempotency_keys, reservations, resources, opening_hours, sites, sessions, users
     RESTART IDENTITY CASCADE`,
  );
}

let cachedHash: string | undefined;

export interface Fixtures {
  admin: string;
  members: string[];
  tlvRoom: string;
  tlvDesk: string;
  ldnRoom: string;
}

/** Two sites open every day (08:00-20:00 local), a 15-minute room, a 30-minute desk and a London room. */
export async function createFixtures(pool: Pool, memberCount = 8): Promise<Fixtures> {
  cachedHash ??= await hashPassword(PASSWORD);
  const user = async (email: string, role: string) =>
    (
      await pool.query<{ id: string }>(
        'INSERT INTO users (email, full_name, role, password_hash) VALUES ($1, $2, $3, $4) RETURNING id',
        [email, email.split('@')[0], role, cachedHash],
      )
    ).rows[0]!.id;
  const admin = await user('admin@test.example', 'admin');
  const members: string[] = [];
  for (let i = 1; i <= memberCount; i++) members.push(await user(`member${i}@test.example`, 'member'));

  const site = async (name: string, tz: string) => {
    const id = (
      await pool.query<{ id: string }>('INSERT INTO sites (name, timezone) VALUES ($1, $2) RETURNING id', [
        name,
        tz,
      ])
    ).rows[0]!.id;
    for (let wd = 1; wd <= 7; wd++) {
      await pool.query(`INSERT INTO opening_hours VALUES ($1, $2, '08:00', '20:00')`, [id, wd]);
    }
    return id;
  };
  const resource = async (
    siteId: string,
    kind: string,
    name: string,
    slot: number,
    min: number,
    max: number,
  ) =>
    (
      await pool.query<{ id: string }>(
        `INSERT INTO resources (site_id, kind, name, slot_minutes, min_minutes, max_minutes)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [siteId, kind, name, slot, min, max],
      )
    ).rows[0]!.id;
  const tlv = await site('Test TLV', TLV);
  const ldn = await site('Test LDN', LDN);
  return {
    admin,
    members,
    tlvRoom: await resource(tlv, 'room', 'Room 1', 15, 15, 240),
    tlvDesk: await resource(tlv, 'desk', 'Desk 1', 30, 60, 600),
    ldnRoom: await resource(ldn, 'room', 'London room', 15, 15, 240),
  };
}

export interface Session {
  userId: string;
  call: (
    method: InjectOptions['method'],
    url: string,
    payload?: unknown,
    headers?: Record<string, string>,
  ) => Promise<LightMyRequestResponse>;
  book: (body: Record<string, unknown>, key?: string) => Promise<LightMyRequestResponse>;
}

export async function login(app: FastifyInstance, email: string): Promise<Session> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email, password: PASSWORD },
  });
  if (res.statusCode !== 200) throw new Error(`login failed for ${email}: ${res.body}`);
  const cookie = `sk_session=${res.cookies.find((c) => c.name === 'sk_session')!.value}`;
  const body = res.json<{ csrfToken: string; user: { id: string } }>();
  const call: Session['call'] = (method, url, payload, headers = {}) =>
    app.inject({
      method,
      url,
      headers: { cookie, 'x-csrf-token': body.csrfToken, ...headers },
      ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
    });
  return {
    userId: body.user.id,
    call,
    book: (payload, key = randomUUID()) => call('POST', '/api/bookings', payload, { 'idempotency-key': key }),
  };
}

/** A local date a few days ahead, so tests never collide with "now" or the day boundary. */
export function futureDate(tz: string, daysAhead = 3): string {
  return addDays(localDate(Date.now(), tz), daysAhead);
}

/** ISO instant for a local wall-clock time on `date` in `tz`. */
export function at(date: string, time: string, tz: string): string {
  return new Date(zonedToInstant(date, time, tz)).toISOString();
}
