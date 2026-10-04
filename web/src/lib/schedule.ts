import type { Day, Reservation, Slot } from '../api/types';

/** A run of consecutive slots shown as one row: free time, a reservation, or past time. */
export type Block =
  | { type: 'free'; slots: Slot[] }
  | { type: 'past'; slots: Slot[] }
  | { type: 'reserved'; slots: Slot[]; reservation: Reservation | undefined; state: Slot['state'] };

export function blocks(day: Day): Block[] {
  const out: Block[] = [];
  for (const slot of day.slots) {
    const last = out.at(-1);
    if (slot.state === 'free') {
      if (last?.type === 'free') last.slots.push(slot);
      else out.push({ type: 'free', slots: [slot] });
    } else if (slot.state === 'past') {
      if (last?.type === 'past') last.slots.push(slot);
      else out.push({ type: 'past', slots: [slot] });
    } else if (last?.type === 'reserved' && last.slots[0]!.reservationId === slot.reservationId) {
      last.slots.push(slot);
    } else {
      out.push({
        type: 'reserved',
        slots: [slot],
        state: slot.state,
        reservation: day.reservations.find((r) => r.id === slot.reservationId),
      });
    }
  }
  return out;
}

/**
 * Durations (minutes) a booking starting at `slotIndex` may take: multiples of the slot size between the
 * resource's minimum and maximum, stopping at the first slot that is not free (or not `ownId`).
 */
export function durationOptions(
  day: Day,
  slotIndex: number,
  rules: { slotMinutes: number; minMinutes: number; maxMinutes: number },
  ownId?: string,
): number[] {
  const options: number[] = [];
  let minutes = 0;
  for (let i = slotIndex; i < day.slots.length; i++) {
    const s = day.slots[i]!;
    const usable = s.state === 'free' || (ownId !== undefined && s.reservationId === ownId);
    if (!usable) break;
    minutes += rules.slotMinutes;
    if (minutes > rules.maxMinutes) break;
    if (minutes >= rules.minMinutes) options.push(minutes);
  }
  return options;
}

export function formatMinutes(m: number): string {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

export function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

export function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

const WEEKDAY = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Mon 5 Oct" from a calendar date, independent of the browser's time zone. */
export function formatDate(date: string, weekday?: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const wd = weekday ?? ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) + 1;
  return `${WEEKDAY[wd]} ${d} ${MONTH[m - 1]}`;
}

/** Human label for a zone at a moment, e.g. "Tel Aviv time (GMT+3)". */
export function zoneLabel(timeZone: string, at = new Date()): string {
  const offset =
    new Intl.DateTimeFormat('en-GB', { timeZone, timeZoneName: 'shortOffset' })
      .formatToParts(at)
      .find((p) => p.type === 'timeZoneName')?.value ?? '';
  const city = timeZone.split('/').pop()!.replace(/_/g, ' ');
  return `${city === 'Jerusalem' ? 'Israel' : city} time (${offset})`;
}
