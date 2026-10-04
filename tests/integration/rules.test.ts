import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { addDays, localDate } from '../../server/src/domain/time.js';
import { at, createFixtures, futureDate, LDN, login, resetData, startApp, TLV } from './helpers.js';
import type { Fixtures, Session, TestContext } from './helpers.js';

let ctx: TestContext;
let fx: Fixtures;
let m1: Session;
let m2: Session;
let admin: Session;

beforeAll(async () => {
  ctx = await startApp();
});
afterAll(() => ctx.close());
beforeEach(async () => {
  await resetData(ctx.pool);
  fx = await createFixtures(ctx.pool, 2);
  m1 = await login(ctx.app, 'member1@test.example');
  m2 = await login(ctx.app, 'member2@test.example');
  admin = await login(ctx.app, 'admin@test.example');
});

describe('time boundaries', () => {
  const rule = async (start: string, end: string, resource = fx.tlvRoom) => {
    const res = await m1.book({ resourceId: resource, start, end });
    return res.statusCode === 201 ? 'ok' : (res.json().error.details?.rule ?? res.json().error.code);
  };

  it('accepts exactly the opening window and nothing beyond it', async () => {
    const day = futureDate(TLV);
    expect(await rule(at(day, '08:00', TLV), at(day, '08:15', TLV))).toBe('ok');
    expect(await rule(at(day, '19:45', TLV), at(day, '20:00', TLV))).toBe('ok');
    expect(await rule(at(day, '07:45', TLV), at(day, '08:15', TLV))).toBe('OUTSIDE_HOURS');
    expect(await rule(at(day, '19:45', TLV), at(day, '20:15', TLV))).toBe('OUTSIDE_HOURS');
  });

  it('checks alignment, length, direction, past, horizon and day spans', async () => {
    const day = futureDate(TLV);
    expect(await rule(at(day, '10:05', TLV), at(day, '10:35', TLV))).toBe('NOT_ALIGNED');
    expect(await rule(at(day, '10:00', TLV), at(day, '15:00', TLV))).toBe('TOO_LONG');
    expect(await rule(at(day, '10:00', TLV), at(day, '10:30', TLV), fx.tlvDesk)).toBe('TOO_SHORT');
    expect(await rule(at(day, '11:00', TLV), at(day, '10:00', TLV))).toBe('INVALID_PERIOD');
    const yesterday = addDays(localDate(Date.now(), TLV), -1);
    expect(await rule(at(yesterday, '10:00', TLV), at(yesterday, '11:00', TLV))).toBe('IN_PAST');
    const far = addDays(localDate(Date.now(), TLV), 500);
    expect(await rule(at(far, '10:00', TLV), at(far, '11:00', TLV))).toBe('TOO_FAR_AHEAD');
  });

  it('rejects malformed times and missing offsets', async () => {
    const res = await m1.book({
      resourceId: fx.tlvRoom,
      start: '2026-10-05T09:00:00',
      end: '2026-10-05T10:00:00',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.details.fields).toHaveProperty('start');
  });

  it('evaluates opening hours in the site time zone, not the server zone', async () => {
    const day = futureDate(LDN);
    // 08:00 in London is 10:00 or 11:00 in Tel Aviv: valid for the London room.
    expect(await rule(at(day, '08:00', LDN), at(day, '09:00', LDN), fx.ldnRoom)).toBe('ok');
    // 07:30 London is outside London hours even though it is inside Tel Aviv hours.
    expect(await rule(at(day, '07:30', LDN), at(day, '08:00', LDN), fx.ldnRoom)).toBe('OUTSIDE_HOURS');
  });
});

describe('reschedule and cancel', () => {
  it('moves a booking, refuses a taken slot and a stale version', async () => {
    const day = futureDate(TLV);
    const mine = (
      await m1.book({ resourceId: fx.tlvRoom, start: at(day, '09:00', TLV), end: at(day, '10:00', TLV) })
    ).json();
    await m2.book({ resourceId: fx.tlvRoom, start: at(day, '12:00', TLV), end: at(day, '13:00', TLV) });

    const moved = await m1.call('PATCH', `/api/bookings/${mine.id}`, {
      expectedVersion: mine.version,
      start: at(day, '10:00', TLV),
      end: at(day, '11:30', TLV),
    });
    expect(moved.statusCode).toBe(200);
    expect(moved.json()).toMatchObject({ localStart: '10:00', localEnd: '11:30', version: mine.version + 1 });

    const stale = await m1.call('PATCH', `/api/bookings/${mine.id}`, {
      expectedVersion: mine.version,
      start: at(day, '14:00', TLV),
      end: at(day, '15:00', TLV),
    });
    expect(stale.json().error.code).toBe('VERSION_CONFLICT');

    const taken = await m1.call('PATCH', `/api/bookings/${mine.id}`, {
      expectedVersion: mine.version + 1,
      start: at(day, '11:30', TLV),
      end: at(day, '12:30', TLV),
    });
    expect(taken.statusCode).toBe(409);
    expect(taken.json().error.code).toBe('SLOT_TAKEN');
  });

  it('lets a booking be extended over its own time without conflicting with itself', async () => {
    const day = futureDate(TLV);
    const b = (
      await m1.book({ resourceId: fx.tlvRoom, start: at(day, '09:00', TLV), end: at(day, '10:00', TLV) })
    ).json();
    const res = await m1.call('PATCH', `/api/bookings/${b.id}`, {
      expectedVersion: b.version,
      start: at(day, '09:00', TLV),
      end: at(day, '10:30', TLV),
    });
    expect(res.statusCode).toBe(200);
  });
});

describe('permissions and privacy', () => {
  it("keeps other members' bookings private and unchangeable", async () => {
    const day = futureDate(TLV);
    const b = (
      await m1.book({
        resourceId: fx.tlvRoom,
        start: at(day, '09:00', TLV),
        end: at(day, '10:00', TLV),
        title: 'Secret',
      })
    ).json();
    expect((await m2.call('GET', `/api/bookings/${b.id}`)).statusCode).toBe(404);
    expect(
      (await m2.call('POST', `/api/bookings/${b.id}/cancel`, { expectedVersion: b.version })).statusCode,
    ).toBe(403);
    const avail = await m2.call('GET', `/api/resources/${fx.tlvRoom}/availability?date=${day}`);
    const seen = avail.json().days[0].reservations[0];
    expect(seen).toMatchObject({ title: null, userName: null, mine: false });
    expect(
      avail.json().days[0].slots.find((s: { reservationId: string }) => s.reservationId === b.id).state,
    ).toBe('booked');
    const asAdmin = await admin.call('GET', `/api/bookings/${b.id}`);
    expect(asAdmin.json().title).toBe('Secret');
  });

  it('reserves maintenance for admins and cancels conflicts atomically on request', async () => {
    const day = futureDate(TLV);
    const b = (
      await m1.book({ resourceId: fx.tlvRoom, start: at(day, '15:00', TLV), end: at(day, '16:00', TLV) })
    ).json();
    const block = {
      start: at(day, '14:00', TLV),
      end: at(day, '18:00', TLV),
      reason: 'Air conditioning repair',
    };
    expect((await m1.call('POST', `/api/resources/${fx.tlvRoom}/maintenance`, block)).statusCode).toBe(403);

    const refused = await admin.call('POST', `/api/resources/${fx.tlvRoom}/maintenance`, block);
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error.details.conflicts.map((c: { id: string }) => c.id)).toEqual([b.id]);

    const forced = await admin.call('POST', `/api/resources/${fx.tlvRoom}/maintenance`, {
      ...block,
      cancelConflicting: true,
    });
    expect(forced.statusCode).toBe(201);
    const after = (await m1.call('GET', '/api/bookings?scope=past')).json().items;
    expect(after.find((x: { id: string }) => x.id === b.id).status).toBe('cancelled');
    const blocked = await m2.book({
      resourceId: fx.tlvRoom,
      start: at(day, '16:00', TLV),
      end: at(day, '17:00', TLV),
    });
    expect(blocked.statusCode).toBe(409);
  });

  it('logs every change in the same transaction', async () => {
    const day = futureDate(TLV);
    const b = (
      await m1.book({ resourceId: fx.tlvRoom, start: at(day, '09:00', TLV), end: at(day, '10:00', TLV) })
    ).json();
    await m1.call('POST', `/api/bookings/${b.id}/cancel`, { expectedVersion: b.version });
    const items = (await m1.call('GET', '/api/activity'))
      .json()
      .items.map((a: { action: string }) => a.action);
    expect(items.slice(0, 2)).toEqual(['booking.cancelled', 'booking.created']);
    expect(
      (await m1.call('GET', '/api/activity?all=true'))
        .json()
        .items.every((a: { actorName: string }) => a.actorName === 'member1'),
    ).toBe(true);
  });
});
