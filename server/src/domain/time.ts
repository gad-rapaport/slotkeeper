/**
 * Wall-clock arithmetic in an explicit IANA time zone using only Intl, so behaviour does not depend on the
 * server's own zone. All instants are epoch milliseconds (UTC).
 */

export interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** ISO weekday: 1 = Monday ... 7 = Sunday */
  weekday: number;
}

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    formatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

export function localParts(instantMs: number, timeZone: string): LocalParts {
  const parts: Record<string, string> = {};
  for (const p of formatter(timeZone).formatToParts(new Date(instantMs))) parts[p.type] = p.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: WEEKDAYS[parts.weekday ?? ''] ?? 0,
  };
}

/** Offset of the zone at an instant, in ms (local minus UTC). */
export function offsetMs(instantMs: number, timeZone: string): number {
  const p = localParts(instantMs, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instantMs / 1000) * 1000;
}

/**
 * The instant at which the zone's clock shows the given local date and time.
 * Ambiguous times (autumn change) resolve to the earlier instant; non-existent times (spring change) move
 * forward by the size of the gap, matching how a person would read "09:00 on that day".
 */
export function zonedToInstant(date: string, time: string, timeZone: string): number {
  const [y, mo, d] = date.split('-').map(Number) as [number, number, number];
  const [h, mi] = time.split(':').map(Number) as [number, number];
  const local = Date.UTC(y, mo - 1, d, h, mi);
  // Offsets in force half a day before and after; a transition in between gives two different offsets.
  const before = local - offsetMs(local - 12 * 3_600_000, timeZone);
  const after = local - offsetMs(local + 12 * 3_600_000, timeZone);
  const matches = [before, after].filter((c) => {
    const p = localParts(c, timeZone);
    return p.hour === h && p.minute === mi;
  });
  // Ambiguous: two matches, take the earlier. Normal: one (or two equal). Gap: none, apply the earlier offset,
  // which lands the same distance past the gap.
  return matches.length ? Math.min(...matches) : before;
}

export function localDate(instantMs: number, timeZone: string): string {
  const p = localParts(instantMs, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** ISO weekday of a calendar date (independent of any zone). */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return js === 0 ? 7 : js;
}

/** [start, end) of a local calendar day. 23 or 25 hours long on daylight saving change days. */
export function dayBounds(date: string, timeZone: string): [number, number] {
  return [zonedToInstant(date, '00:00', timeZone), zonedToInstant(addDays(date, 1), '00:00', timeZone)];
}

export function formatLocalTime(instantMs: number, timeZone: string): string {
  const p = localParts(instantMs, timeZone);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}
