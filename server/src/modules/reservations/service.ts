import { createHash } from 'node:crypto';
import type { Config } from '../../config.js';
import type { Pool, PoolClient } from '../../db/pool.js';
import { withTransaction } from '../../db/pool.js';
import { isPgError } from '../../db/errors.js';
import { AppError, forbidden, notFound } from '../../domain/errors.js';
import type { Actor } from '../../domain/permissions.js';
import { policy } from '../../domain/permissions.js';
import { checkWindow } from '../../domain/rules.js';
import { formatLocalTime, localDate } from '../../domain/time.js';
import { recordActivity } from '../activity/repo.js';
import { getHours, getResource } from '../resources/repo.js';
import type { ResourceRow } from '../resources/repo.js';
import { lockUser } from '../users/repo.js';
import * as repo from './repo.js';
import type { ReservationRow } from './repo.js';

export interface BookingView {
  id: string;
  resourceId: string;
  resourceName: string;
  siteName: string;
  timezone: string;
  kind: 'booking' | 'maintenance';
  status: 'active' | 'cancelled';
  start: string;
  end: string;
  localDate: string;
  localStart: string;
  localEnd: string;
  title: string | null;
  mine: boolean;
  userName: string | null;
  version: number;
}

/** Other members see that a slot is taken, not who took it or why. */
export function present(r: ReservationRow, actor: Actor): BookingView {
  const visible = policy.seeDetails(actor, r);
  const start = new Date(r.start).getTime();
  const end = new Date(r.end).getTime();
  return {
    id: r.id,
    resourceId: r.resourceId,
    resourceName: r.resourceName,
    siteName: r.siteName,
    timezone: r.timezone,
    kind: r.kind,
    status: r.status,
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
    localDate: localDate(start, r.timezone),
    localStart: formatLocalTime(start, r.timezone),
    localEnd: formatLocalTime(end, r.timezone),
    title: visible || r.kind === 'maintenance' ? r.title : null,
    mine: r.userId === actor.id,
    userName: visible ? r.userName : null,
    version: r.version,
  };
}

/** Exclusion constraint violation -> a 409 that names the conflicting times. */
async function slotTaken(
  pool: Pool,
  actor: Actor,
  resource: ResourceRow,
  start: Date,
  end: Date,
  excludeId?: string,
) {
  const conflicts = await repo.overlapping(pool, resource.id, start, end, excludeId ? { excludeId } : {});
  const first = conflicts[0];
  const when = first ? ` (${present(first, actor).localStart}-${present(first, actor).localEnd})` : '';
  return new AppError(
    409,
    'SLOT_TAKEN',
    `${resource.name} is no longer free at that time${when}. Pick another slot; the schedule has been refreshed.`,
    { conflicts: conflicts.map((c) => present(c, actor)) },
  );
}

const isOverlap = (err: unknown) =>
  isPgError(err) && err.code === '23P01' && err.constraint === 'reservations_no_overlap';

async function loadResource(db: Pool | PoolClient, id: string) {
  const resource = await getResource(db, id);
  if (!resource) throw notFound('Resource');
  return resource;
}

async function validateWindow(
  db: Pool | PoolClient,
  resource: ResourceRow,
  start: Date,
  end: Date,
  config: Config,
) {
  const result = checkWindow({
    start: start.getTime(),
    end: end.getTime(),
    now: Date.now(),
    timeZone: resource.timezone,
    hours: await getHours(db, resource.siteId),
    rules: resource,
    horizonDays: config.BOOKING_HORIZON_DAYS,
  });
  if (!result.ok) {
    throw new AppError(422, 'BOOKING_RULE', result.message!, { rule: result.violation });
  }
}

export interface CreateBookingInput {
  resourceId: string;
  start: Date;
  end: Date;
  title: string;
}

export interface CreateResult {
  status: number;
  body: BookingView;
  replayed: boolean;
}

export function requestHash(input: CreateBookingInput): string {
  return createHash('sha256')
    .update(
      JSON.stringify([input.resourceId, input.start.toISOString(), input.end.toISOString(), input.title]),
    )
    .digest('hex');
}

/**
 * Creates a booking exactly once per (user, Idempotency-Key).
 *
 * Isolation is READ COMMITTED. Correctness comes from three explicit mechanisms rather than SERIALIZABLE:
 *  - the user row is locked first, so one user's creations run one at a time: the per-user limit cannot be
 *    raced and a retry with the same Idempotency-Key waits, then finds and replays the stored response;
 *  - a per-resource advisory lock queues writers of the same resource, so overlapping inserts never deadlock
 *    in the exclusion index;
 *  - the exclusion constraint rejects any overlapping active reservation, including ones committed by
 *    concurrent transactions a moment earlier. It is the actual guarantee; the locks only keep it orderly.
 */
export async function createBooking(
  pool: Pool,
  config: Config,
  actor: Actor,
  key: string,
  input: CreateBookingInput,
): Promise<CreateResult> {
  const resource = await loadResource(pool, input.resourceId);
  const hash = requestHash(input);
  try {
    return await withTransaction(pool, async (tx) => {
      await lockUser(tx, actor.id);
      const claim = await tx.query(
        `INSERT INTO idempotency_keys (user_id, key, request_sha256, response_status, response_body)
         VALUES ($1, $2, $3, 0, '{}') ON CONFLICT DO NOTHING`,
        [actor.id, key, hash],
      );
      if (claim.rowCount === 0) {
        const { rows } = await tx.query<{
          request_sha256: string;
          response_status: number;
          response_body: BookingView;
        }>(
          'SELECT request_sha256, response_status, response_body FROM idempotency_keys WHERE user_id = $1 AND key = $2',
          [actor.id, key],
        );
        const stored = rows[0]!;
        if (stored.request_sha256 !== hash) {
          throw new AppError(
            422,
            'IDEMPOTENCY_KEY_REUSED',
            'This Idempotency-Key was already used for a different booking request.',
          );
        }
        return { status: stored.response_status, body: stored.response_body, replayed: true };
      }

      await validateWindow(tx, resource, input.start, input.end, config);
      await repo.lockResource(tx, resource.id);
      const active = await repo.countActiveFuture(tx, actor.id);
      if (active >= config.MAX_ACTIVE_BOOKINGS_PER_USER) {
        throw new AppError(
          422,
          'LIMIT_REACHED',
          `You already have ${active} upcoming bookings, the maximum. Cancel one to book another.`,
        );
      }
      const id = await repo.insertReservation(tx, {
        resourceId: resource.id,
        kind: 'booking',
        start: input.start,
        end: input.end,
        title: input.title,
        userId: actor.id,
        createdBy: actor.id,
      });
      const view = present((await repo.getReservation(tx, id))!, actor);
      await recordActivity(tx, {
        actorId: actor.id,
        reservationId: id,
        action: 'booking.created',
        summary: `Booked ${resource.name} ${view.localDate} ${view.localStart}-${view.localEnd}`,
      });
      await tx.query(
        'UPDATE idempotency_keys SET response_status = 201, response_body = $3 WHERE user_id = $1 AND key = $2',
        [actor.id, key, view],
      );
      return { status: 201, body: view, replayed: false };
    });
  } catch (err) {
    if (isOverlap(err)) throw await slotTaken(pool, actor, resource, input.start, input.end);
    throw err;
  }
}

async function lockForChange(tx: PoolClient, actor: Actor, id: string, expectedVersion: number) {
  const current = await repo.getReservation(tx, id, true);
  if (!current) throw notFound('Booking');
  if (!policy.changeReservation(actor, current)) throw forbidden('You can only change your own bookings.');
  if (current.version !== expectedVersion) {
    throw new AppError(
      409,
      'VERSION_CONFLICT',
      'This booking changed since you loaded it. Reload and try again.',
      {
        current: present(current, actor),
      },
    );
  }
  if (current.status === 'cancelled') {
    throw new AppError(422, 'BOOKING_RULE', 'This booking is already cancelled.', { rule: 'CANCELLED' });
  }
  if (new Date(current.end).getTime() <= Date.now()) {
    throw new AppError(422, 'BOOKING_RULE', 'Past bookings cannot be changed.', { rule: 'IN_PAST' });
  }
  return current;
}

export async function rescheduleBooking(
  pool: Pool,
  config: Config,
  actor: Actor,
  id: string,
  expectedVersion: number,
  change: { start: Date; end: Date; title?: string | undefined },
) {
  let resource: ResourceRow | undefined;
  try {
    await withTransaction(pool, async (tx) => {
      // Resource lock before the row lock: the same order maintenance uses, so the two cannot deadlock.
      const peek = await repo.getReservation(tx, id);
      if (!peek) throw notFound('Booking');
      await repo.lockResource(tx, peek.resourceId);
      const current = await lockForChange(tx, actor, id, expectedVersion);
      if (current.kind !== 'booking')
        throw new AppError(422, 'BOOKING_RULE', 'Use the maintenance controls for blocks.');
      resource = await loadResource(tx, current.resourceId);
      await validateWindow(tx, resource, change.start, change.end, config);
      await repo.reschedule(tx, id, change.start, change.end, change.title ?? current.title);
      const after = present((await repo.getReservation(tx, id))!, actor);
      await recordActivity(tx, {
        actorId: actor.id,
        reservationId: id,
        action: 'booking.rescheduled',
        summary: `Moved to ${after.localDate} ${after.localStart}-${after.localEnd}`,
        details: { from: { start: current.start, end: current.end } },
      });
    });
  } catch (err) {
    if (isOverlap(err) && resource)
      throw await slotTaken(pool, actor, resource, change.start, change.end, id);
    throw err;
  }
  return present((await repo.getReservation(pool, id))!, actor);
}

export async function cancelReservation(pool: Pool, actor: Actor, id: string, expectedVersion: number) {
  await withTransaction(pool, async (tx) => {
    const current = await lockForChange(tx, actor, id, expectedVersion);
    await repo.cancel(tx, id);
    await recordActivity(tx, {
      actorId: actor.id,
      reservationId: id,
      action: current.kind === 'booking' ? 'booking.cancelled' : 'maintenance.removed',
      summary: current.kind === 'booking' ? 'Cancelled booking' : 'Removed maintenance block',
    });
  });
  return present((await repo.getReservation(pool, id))!, actor);
}

/**
 * Admin maintenance block. Overlapping bookings either stop the request (409 with the list) or, when
 * `cancelConflicting` is set, are cancelled in the same transaction so the block and the cancellations
 * succeed or fail together.
 */
export async function createMaintenance(
  pool: Pool,
  actor: Actor,
  input: { resourceId: string; start: Date; end: Date; reason: string; cancelConflicting: boolean },
) {
  if (!policy.manageMaintenance(actor)) throw forbidden('Only admins can schedule maintenance.');
  const resource = await loadResource(pool, input.resourceId);
  if (!(input.end > input.start)) {
    throw new AppError(422, 'BOOKING_RULE', 'The end time must be after the start time.', {
      rule: 'INVALID_PERIOD',
    });
  }
  try {
    const id = await withTransaction(pool, async (tx) => {
      await repo.lockResource(tx, resource.id);
      const conflicts = await repo.overlapping(tx, resource.id, input.start, input.end, {
        kind: 'booking',
        lock: true,
      });
      if (conflicts.length && !input.cancelConflicting) {
        throw new AppError(
          409,
          'SLOT_TAKEN',
          `${conflicts.length} booking(s) overlap this block. Cancel them first or choose to cancel them automatically.`,
          { conflicts: conflicts.map((c) => present(c, actor)) },
        );
      }
      for (const c of conflicts) {
        await repo.cancel(tx, c.id);
        await recordActivity(tx, {
          actorId: actor.id,
          reservationId: c.id,
          action: 'booking.cancelled_for_maintenance',
          summary: `Cancelled for maintenance: ${input.reason}`,
        });
      }
      const newId = await repo.insertReservation(tx, {
        resourceId: resource.id,
        kind: 'maintenance',
        start: input.start,
        end: input.end,
        title: input.reason,
        userId: null,
        createdBy: actor.id,
      });
      await recordActivity(tx, {
        actorId: actor.id,
        reservationId: newId,
        action: 'maintenance.created',
        summary: `Maintenance on ${resource.name}: ${input.reason}`,
        details: { cancelled: conflicts.map((c) => c.id) },
      });
      return newId;
    });
    return present((await repo.getReservation(pool, id))!, actor);
  } catch (err) {
    // Two maintenance blocks overlapping each other also hit the exclusion constraint.
    if (isOverlap(err)) throw await slotTaken(pool, actor, resource, input.start, input.end);
    throw err;
  }
}

export async function purgeIdempotencyKeys(pool: Pool, ttlHours: number): Promise<number> {
  const { rowCount } = await pool.query(
    `DELETE FROM idempotency_keys WHERE created_at < now() - make_interval(hours => $1)`,
    [ttlHours],
  );
  return rowCount ?? 0;
}
