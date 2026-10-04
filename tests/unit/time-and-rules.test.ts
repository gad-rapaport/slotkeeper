import { describe, expect, it } from 'vitest';
import { checkWindow } from '../../server/src/domain/rules.js';
import type { HoursByWeekday } from '../../server/src/domain/rules.js';
import { addDays, dayBounds, localParts, weekdayOf, zonedToInstant } from '../../server/src/domain/time.js';

const iso = (ms: number) => new Date(ms).toISOString();

describe('zoned time', () => {
  it('converts wall-clock time in different zones', () => {
    expect(iso(zonedToInstant('2026-10-05', '09:00', 'Asia/Jerusalem'))).toBe('2026-10-05T06:00:00.000Z');
    expect(iso(zonedToInstant('2026-12-01', '09:00', 'Asia/Jerusalem'))).toBe('2026-12-01T07:00:00.000Z');
    expect(iso(zonedToInstant('2026-07-01', '09:00', 'Europe/London'))).toBe('2026-07-01T08:00:00.000Z');
  });

  it('handles the autumn change: 25-hour day, ambiguous 01:30 resolves to the earlier instant', () => {
    // Europe/London leaves BST at 02:00 local on 2026-10-25.
    const [start, end] = dayBounds('2026-10-25', 'Europe/London');
    expect((end - start) / 3_600_000).toBe(25);
    expect(iso(zonedToInstant('2026-10-25', '01:30', 'Europe/London'))).toBe('2026-10-25T00:30:00.000Z');
    expect(iso(zonedToInstant('2026-10-25', '09:00', 'Europe/London'))).toBe('2026-10-25T09:00:00.000Z');
  });

  it('handles the spring change: 23-hour day, the missing 01:30 moves forward', () => {
    const [start, end] = dayBounds('2026-03-29', 'Europe/London');
    expect((end - start) / 3_600_000).toBe(23);
    expect(iso(zonedToInstant('2026-03-29', '01:30', 'Europe/London'))).toBe('2026-03-29T01:30:00.000Z');
  });

  it('knows weekdays and local parts', () => {
    expect(weekdayOf('2026-10-04')).toBe(7); // a Sunday
    expect(weekdayOf('2026-10-05')).toBe(1);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(localParts(Date.parse('2026-10-04T21:30:00Z'), 'Asia/Jerusalem')).toMatchObject({
      day: 5,
      hour: 0,
      minute: 30,
      weekday: 1,
    });
  });
});

describe('booking window rules', () => {
  const tz = 'Europe/London';
  const hours: HoursByWeekday = {
    1: { opens: '09:00', closes: '18:00' },
    7: { opens: '09:00', closes: '18:00' },
  };
  const rules = { slotMinutes: 15, minMinutes: 30, maxMinutes: 120 };
  const now = Date.parse('2026-10-01T00:00:00Z');
  const check = (
    date: string,
    from: string,
    to: string,
    extra: Partial<Parameters<typeof checkWindow>[0]> = {},
  ) =>
    checkWindow({
      start: zonedToInstant(date, from, tz),
      end: zonedToInstant(date, to, tz),
      now,
      timeZone: tz,
      hours,
      rules,
      horizonDays: 60,
      ...extra,
    }).violation ?? 'ok';

  it.each([
    ['2026-10-05', '09:00', '10:00', 'ok'],
    ['2026-10-05', '16:00', '18:00', 'ok'],
    ['2026-10-05', '08:45', '09:30', 'OUTSIDE_HOURS'],
    ['2026-10-05', '17:30', '18:15', 'OUTSIDE_HOURS'],
    ['2026-10-05', '09:10', '09:40', 'NOT_ALIGNED'],
    ['2026-10-05', '09:00', '09:15', 'TOO_SHORT'],
    ['2026-10-05', '09:00', '11:15', 'TOO_LONG'],
    ['2026-10-05', '10:00', '09:00', 'INVALID_PERIOD'],
    ['2026-10-06', '10:00', '11:00', 'CLOSED_DAY'],
  ])('%s %s-%s -> %s', (date, from, to, expected) => {
    expect(check(date, from, to)).toBe(expected);
  });

  it('applies local opening hours on the 25-hour day', () => {
    expect(check('2026-10-25', '09:00', '10:00')).toBe('ok');
    expect(check('2026-10-25', '17:00', '18:00')).toBe('ok');
  });

  it('rejects past and too-distant starts', () => {
    expect(check('2026-09-28', '10:00', '11:00')).toBe('IN_PAST');
    expect(check('2026-09-27', '10:00', '11:00')).toBe('IN_PAST');
    expect(check('2026-12-20', '10:00', '11:00')).toBe('TOO_FAR_AHEAD');
  });

  it('rejects a booking that crosses midnight', () => {
    const allDay: HoursByWeekday = {
      1: { opens: '00:00', closes: '23:59' },
      2: { opens: '00:00', closes: '23:59' },
    };
    const r = checkWindow({
      start: zonedToInstant('2026-10-05', '23:00', tz),
      end: zonedToInstant('2026-10-06', '01:00', tz),
      now,
      timeZone: tz,
      hours: allDay,
      rules: { slotMinutes: 15, minMinutes: 15, maxMinutes: 240 },
      horizonDays: 60,
    });
    expect(r.violation).toBe('SPANS_DAYS');
  });
});
