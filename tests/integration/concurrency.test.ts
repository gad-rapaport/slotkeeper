import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { at, createFixtures, futureDate, login, resetData, startApp, TLV } from './helpers.js';
import type { Fixtures, Session, TestContext } from './helpers.js';

let ctx: TestContext;
let fx: Fixtures;
let members: Session[];

beforeAll(async () => {
  ctx = await startApp({ MAX_ACTIVE_BOOKINGS_PER_USER: '3' });
});
afterAll(() => ctx.close());
beforeEach(async () => {
  await resetData(ctx.pool);
  fx = await createFixtures(ctx.pool, 8);
  members = await Promise.all(fx.members.map((_, i) => login(ctx.app, `member${i + 1}@test.example`)));
});

async function activeOverlaps(resourceId: string): Promise<number> {
  const { rows } = await ctx.pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM reservations a JOIN reservations b
       ON a.resource_id = b.resource_id AND a.id < b.id AND a.period && b.period
      WHERE a.resource_id = $1 AND a.status = 'active' AND b.status = 'active'`,
    [resourceId],
  );
  return rows[0]!.n;
}

describe('competing requests', () => {
  it('lets exactly one of many simultaneous requests for the same slot win', async () => {
    const day = futureDate(TLV);
    const body = { resourceId: fx.tlvRoom, start: at(day, '10:00', TLV), end: at(day, '11:00', TLV) };
    // 8 users x 3 requests each = 24 truly concurrent transactions for one slot.
    const results = await Promise.all(members.flatMap((m) => [m.book(body), m.book(body), m.book(body)]));
    const codes = results.map((r) => r.statusCode);
    expect(codes.filter((c) => c !== 201 && c !== 409)).toEqual([]);
    expect(codes.filter((c) => c === 201)).toHaveLength(1);
    expect(codes.filter((c) => c === 409)).toHaveLength(23);
    expect(results.find((r) => r.statusCode === 409)!.json().error.code).toBe('SLOT_TAKEN');
    const { rows } = await ctx.pool.query(
      `SELECT count(*)::int AS n FROM reservations WHERE status = 'active'`,
    );
    expect(rows[0].n).toBe(1);
  });

  it('never stores overlapping bookings when staggered requests race', async () => {
    const day = futureDate(TLV);
    // 16 one-hour windows starting every 15 minutes: heavy pairwise overlap.
    const requests = Array.from({ length: 16 }, (_, i) => {
      const start = new Date(new Date(at(day, '09:00', TLV)).getTime() + i * 15 * 60_000);
      return members[i % members.length]!.book({
        resourceId: fx.tlvRoom,
        start: start.toISOString(),
        end: new Date(start.getTime() + 60 * 60_000).toISOString(),
      });
    });
    const results = await Promise.all(requests);
    // Some of these transactions deadlock on the exclusion index; the server retries them, so none surfaces as 500.
    expect(results.map((r) => r.statusCode).filter((c) => c !== 201 && c !== 409)).toEqual([]);
    expect(results.some((r) => r.statusCode === 201)).toBe(true);
    expect(await activeOverlaps(fx.tlvRoom)).toBe(0);
  });

  it('enforces the per-user limit under parallel creation', async () => {
    const day = futureDate(TLV);
    const m = members[0]!;
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        m.book({
          resourceId: fx.tlvRoom,
          start: at(day, `${10 + i}:00`, TLV),
          end: at(day, `${10 + i}:30`, TLV),
        }),
      ),
    );
    expect(results.filter((r) => r.statusCode === 201)).toHaveLength(3);
    expect(
      results.filter((r) => r.statusCode === 422).every((r) => r.json().error.code === 'LIMIT_REACHED'),
    ).toBe(true);
  });
});

describe('database guarantee', () => {
  it('rejects an overlapping insert even when the application is bypassed', async () => {
    const day = futureDate(TLV);
    const insert = (from: string, to: string) =>
      ctx.pool.query(
        `INSERT INTO reservations (resource_id, kind, period, user_id, created_by)
         VALUES ($1, 'booking', tstzrange($2, $3, '[)'), $4, $4)`,
        [fx.tlvRoom, at(day, from, TLV), at(day, to, TLV), fx.members[0]],
      );
    await insert('10:00', '11:00');
    await expect(insert('10:30', '11:30')).rejects.toMatchObject({
      code: '23P01',
      constraint: 'reservations_no_overlap',
    });
  });

  it('treats intervals as half-open: back-to-back bookings are allowed', async () => {
    const day = futureDate(TLV);
    const a = await members[0]!.book({
      resourceId: fx.tlvRoom,
      start: at(day, '10:00', TLV),
      end: at(day, '11:00', TLV),
    });
    const b = await members[1]!.book({
      resourceId: fx.tlvRoom,
      start: at(day, '11:00', TLV),
      end: at(day, '12:00', TLV),
    });
    expect([a.statusCode, b.statusCode]).toEqual([201, 201]);
  });

  it('frees a slot when the booking is cancelled', async () => {
    const day = futureDate(TLV);
    const body = { resourceId: fx.tlvRoom, start: at(day, '13:00', TLV), end: at(day, '14:00', TLV) };
    const first = (await members[0]!.book(body)).json();
    expect((await members[1]!.book(body)).statusCode).toBe(409);
    const cancel = await members[0]!.call('POST', `/api/bookings/${first.id}/cancel`, {
      expectedVersion: first.version,
    });
    expect(cancel.statusCode).toBe(200);
    expect((await members[1]!.book(body)).statusCode).toBe(201);
  });

  it('names what is in the way when a slot is taken', async () => {
    const day = futureDate(TLV);
    await members[0]!.book({
      resourceId: fx.tlvRoom,
      start: at(day, '15:00', TLV),
      end: at(day, '16:00', TLV),
      title: 'Private',
    });
    const res = await members[1]!.book({
      resourceId: fx.tlvRoom,
      start: at(day, '15:30', TLV),
      end: at(day, '16:30', TLV),
    });
    expect(res.statusCode).toBe(409);
    const conflict = res.json().error.details.conflicts[0];
    expect(conflict).toMatchObject({ localStart: '15:00', localEnd: '16:00', mine: false, title: null });
  });
});
