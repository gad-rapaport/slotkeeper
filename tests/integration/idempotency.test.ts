import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { at, createFixtures, futureDate, login, resetData, startApp, TLV } from './helpers.js';
import type { Fixtures, Session, TestContext } from './helpers.js';

let ctx: TestContext;
let fx: Fixtures;
let m1: Session;
let m2: Session;

beforeAll(async () => {
  ctx = await startApp();
});
afterAll(() => ctx.close());
beforeEach(async () => {
  await resetData(ctx.pool);
  fx = await createFixtures(ctx.pool, 2);
  m1 = await login(ctx.app, 'member1@test.example');
  m2 = await login(ctx.app, 'member2@test.example');
});

const count = async () =>
  (await ctx.pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM reservations`)).rows[0]!.n;

describe('idempotent booking creation', () => {
  it('returns the original booking when a request is retried', async () => {
    const day = futureDate(TLV);
    const body = { resourceId: fx.tlvRoom, start: at(day, '09:00', TLV), end: at(day, '10:00', TLV) };
    const first = await m1.book(body, 'retry-key-0001');
    const second = await m1.book(body, 'retry-key-0001');
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(second.headers['idempotent-replayed']).toBe('true');
    expect(second.json().id).toBe(first.json().id);
    expect(await count()).toBe(1);
  });

  it('creates one booking when the same request arrives many times at once', async () => {
    const day = futureDate(TLV);
    const body = { resourceId: fx.tlvRoom, start: at(day, '11:00', TLV), end: at(day, '12:00', TLV) };
    const results = await Promise.all(Array.from({ length: 10 }, () => m1.book(body, 'burst-key-0001')));
    expect(results.map((r) => r.statusCode)).toEqual(Array(10).fill(201));
    expect(new Set(results.map((r) => r.json().id)).size).toBe(1);
    expect(await count()).toBe(1);
  });

  it('rejects a key reused for a different request', async () => {
    const day = futureDate(TLV);
    await m1.book(
      { resourceId: fx.tlvRoom, start: at(day, '09:00', TLV), end: at(day, '10:00', TLV) },
      'reuse-key-001',
    );
    const other = await m1.book(
      { resourceId: fx.tlvRoom, start: at(day, '14:00', TLV), end: at(day, '15:00', TLV) },
      'reuse-key-001',
    );
    expect(other.statusCode).toBe(422);
    expect(other.json().error.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('scopes keys per user', async () => {
    const day = futureDate(TLV);
    const a = await m1.book(
      { resourceId: fx.tlvRoom, start: at(day, '09:00', TLV), end: at(day, '10:00', TLV) },
      'shared-key-01',
    );
    const b = await m2.book(
      { resourceId: fx.tlvRoom, start: at(day, '10:00', TLV), end: at(day, '11:00', TLV) },
      'shared-key-01',
    );
    expect([a.statusCode, b.statusCode]).toEqual([201, 201]);
  });

  it('requires a key', async () => {
    const day = futureDate(TLV);
    const res = await m1.call('POST', '/api/bookings', {
      resourceId: fx.tlvRoom,
      start: at(day, '09:00', TLV),
      end: at(day, '10:00', TLV),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('does not remember failed attempts, so a retry after the slot frees up can succeed', async () => {
    const day = futureDate(TLV);
    const body = { resourceId: fx.tlvRoom, start: at(day, '16:00', TLV), end: at(day, '17:00', TLV) };
    const blocker = (await m2.book(body)).json();
    expect((await m1.book(body, 'after-free-01')).statusCode).toBe(409);
    await m2.call('POST', `/api/bookings/${blocker.id}/cancel`, { expectedVersion: blocker.version });
    expect((await m1.book(body, 'after-free-01')).statusCode).toBe(201);
  });
});
