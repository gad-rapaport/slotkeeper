import type { Db } from '../../db/pool.js';
import type { Actor } from '../../domain/permissions.js';
import { addDays, dayBounds, formatLocalTime, weekdayOf, zonedToInstant } from '../../domain/time.js';
import { present } from '../reservations/service.js';
import type { BookingView } from '../reservations/service.js';
import { overlapping } from '../reservations/repo.js';
import { getHours } from './repo.js';
import type { ResourceRow } from './repo.js';

export type SlotState = 'free' | 'booked' | 'mine' | 'maintenance' | 'past';

export interface Slot {
  start: string;
  end: string;
  localStart: string;
  state: SlotState;
  reservationId: string | null;
}

export interface DayAvailability {
  date: string;
  weekday: number;
  open: boolean;
  opens: string | null;
  closes: string | null;
  /** Hours in the local day: 23 or 25 on daylight saving change days. */
  dayLengthHours: number;
  slots: Slot[];
  reservations: BookingView[];
}

/** Slot grid for consecutive local days, built from opening hours and the active reservations. */
export async function availability(
  db: Db,
  actor: Actor,
  resource: ResourceRow,
  fromDate: string,
  days: number,
  now = Date.now(),
): Promise<DayAvailability[]> {
  const tz = resource.timezone;
  const hours = await getHours(db, resource.siteId);
  const [rangeStart] = dayBounds(fromDate, tz);
  const [, rangeEnd] = dayBounds(addDays(fromDate, days - 1), tz);
  const reservations = (await overlapping(db, resource.id, new Date(rangeStart), new Date(rangeEnd))).map(
    (r) => present(r, actor),
  );
  const step = resource.slotMinutes * 60_000;

  const result: DayAvailability[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(fromDate, i);
    const weekday = weekdayOf(date);
    const [dayStart, dayEnd] = dayBounds(date, tz);
    const window = hours[weekday];
    const dayReservations = reservations.filter(
      (r) => new Date(r.start).getTime() < dayEnd && new Date(r.end).getTime() > dayStart,
    );
    const slots: Slot[] = [];
    if (window) {
      const opens = zonedToInstant(date, window.opens, tz);
      const closes = zonedToInstant(date, window.closes, tz);
      for (let t = opens; t + step <= closes; t += step) {
        const hit = dayReservations.find(
          (r) => new Date(r.start).getTime() < t + step && new Date(r.end).getTime() > t,
        );
        // Past time is past regardless of what was booked in it; only the future is actionable.
        const state: SlotState =
          t + step <= now
            ? 'past'
            : hit
              ? hit.kind === 'maintenance'
                ? 'maintenance'
                : hit.mine
                  ? 'mine'
                  : 'booked'
              : 'free';
        slots.push({
          start: new Date(t).toISOString(),
          end: new Date(t + step).toISOString(),
          localStart: formatLocalTime(t, tz),
          state,
          reservationId: hit?.id ?? null,
        });
      }
    }
    result.push({
      date,
      weekday,
      open: Boolean(window),
      opens: window?.opens ?? null,
      closes: window?.closes ?? null,
      dayLengthHours: Math.round((dayEnd - dayStart) / 3_600_000),
      slots,
      reservations: dayReservations,
    });
  }
  return result;
}
