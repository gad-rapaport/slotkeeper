import { localDate, weekdayOf, zonedToInstant } from './time.js';

export interface ResourceRules {
  slotMinutes: number;
  minMinutes: number;
  maxMinutes: number;
}

export interface Hours {
  opens: string; // HH:MM local
  closes: string;
}

export type HoursByWeekday = Partial<Record<number, Hours>>;

export type RuleViolation =
  | 'INVALID_PERIOD'
  | 'IN_PAST'
  | 'TOO_FAR_AHEAD'
  | 'CLOSED_DAY'
  | 'SPANS_DAYS'
  | 'OUTSIDE_HOURS'
  | 'NOT_ALIGNED'
  | 'TOO_SHORT'
  | 'TOO_LONG';

export interface RuleResult {
  ok: boolean;
  violation?: RuleViolation;
  message?: string;
}

const MINUTE = 60_000;

/**
 * Pure booking-window rules, evaluated in the site's time zone. The database separately guarantees that
 * accepted windows never overlap; these rules decide which windows are acceptable at all.
 */
export function checkWindow(input: {
  start: number;
  end: number;
  now: number;
  timeZone: string;
  hours: HoursByWeekday;
  rules: ResourceRules;
  horizonDays: number;
}): RuleResult {
  const { start, end, now, timeZone, hours, rules, horizonDays } = input;
  const fail = (violation: RuleViolation, message: string): RuleResult => ({ ok: false, violation, message });

  if (!(end > start)) return fail('INVALID_PERIOD', 'The end time must be after the start time.');
  if (start < now - MINUTE) return fail('IN_PAST', 'This time has already passed.');
  if (start > now + horizonDays * 24 * 60 * MINUTE) {
    return fail('TOO_FAR_AHEAD', `Bookings can be made up to ${horizonDays} days ahead.`);
  }

  const day = localDate(start, timeZone);
  if (localDate(end - 1, timeZone) !== day)
    return fail('SPANS_DAYS', 'A booking must start and end on the same day.');
  const window = hours[weekdayOf(day)];
  if (!window) return fail('CLOSED_DAY', 'This site is closed on that day.');
  const opens = zonedToInstant(day, window.opens, timeZone);
  const closes = zonedToInstant(day, window.closes, timeZone);
  if (start < opens || end > closes) {
    return fail(
      'OUTSIDE_HOURS',
      `Bookings must fall within opening hours, ${window.opens} to ${window.closes}.`,
    );
  }

  const slot = rules.slotMinutes * MINUTE;
  if ((start - opens) % slot !== 0 || (end - start) % slot !== 0) {
    return fail('NOT_ALIGNED', `Start and duration must be in steps of ${rules.slotMinutes} minutes.`);
  }
  const minutes = (end - start) / MINUTE;
  if (minutes < rules.minMinutes)
    return fail('TOO_SHORT', `The minimum booking is ${rules.minMinutes} minutes.`);
  if (minutes > rules.maxMinutes)
    return fail('TOO_LONG', `The maximum booking is ${rules.maxMinutes} minutes.`);
  return { ok: true };
}
