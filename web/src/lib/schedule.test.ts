import { describe, expect, it } from 'vitest';
import type { Day, Slot } from '../api/types';
import { blocks, durationOptions, formatDate, formatMinutes, shiftDate } from './schedule';

const slot = (i: number, state: Slot['state'], reservationId: string | null = null): Slot => ({
  start: new Date(Date.UTC(2026, 9, 5, 6, i * 15)).toISOString(),
  end: new Date(Date.UTC(2026, 9, 5, 6, (i + 1) * 15)).toISOString(),
  localStart: `09:${String(i * 15).padStart(2, '0')}`,
  state,
  reservationId,
});

const day = (slots: Slot[]): Day => ({
  date: '2026-10-05',
  weekday: 1,
  open: true,
  opens: '09:00',
  closes: '10:00',
  dayLengthHours: 24,
  slots,
  reservations: [],
});

describe('schedule blocks', () => {
  it('groups consecutive slots of the same kind and reservation', () => {
    const d = day([slot(0, 'past'), slot(1, 'free'), slot(2, 'booked', 'a'), slot(3, 'booked', 'b')]);
    expect(blocks(d).map((b) => [b.type, b.slots.length])).toEqual([
      ['past', 1],
      ['free', 1],
      ['reserved', 1],
      ['reserved', 1],
    ]);
  });
});

describe('duration options', () => {
  const rules = { slotMinutes: 15, minMinutes: 30, maxMinutes: 60 };
  it('respects minimum, maximum and the next taken slot', () => {
    const d = day([slot(0, 'free'), slot(1, 'free'), slot(2, 'free'), slot(3, 'booked', 'x')]);
    expect(durationOptions(d, 0, rules)).toEqual([30, 45]);
    expect(durationOptions(d, 2, rules)).toEqual([]);
  });
  it('treats the booking being moved as free', () => {
    const d = day([slot(0, 'mine', 'own'), slot(1, 'mine', 'own'), slot(2, 'free'), slot(3, 'free')]);
    expect(durationOptions(d, 0, rules, 'own')).toEqual([30, 45, 60]);
  });
});

describe('formatting', () => {
  it('formats durations and dates without the browser zone', () => {
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatMinutes(90)).toBe('1 h 30 min');
    expect(formatDate('2026-10-05')).toBe('Mon 5 Oct');
    expect(shiftDate('2026-10-31', 1)).toBe('2026-11-01');
  });
});
