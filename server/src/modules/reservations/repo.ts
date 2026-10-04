import type { Db } from '../../db/pool.js';

export interface ReservationRow {
  id: string;
  resourceId: string;
  resourceName: string;
  siteName: string;
  timezone: string;
  kind: 'booking' | 'maintenance';
  status: 'active' | 'cancelled';
  start: string;
  end: string;
  title: string;
  userId: string | null;
  userName: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  cancelledAt: string | null;
}

const COLUMNS = `
  r.id, r.resource_id AS "resourceId", res.name AS "resourceName", s.name AS "siteName", s.timezone, r.kind, r.status,
  lower(r.period) AS start, upper(r.period) AS "end", r.title, r.user_id AS "userId", u.full_name AS "userName",
  r.version, r.created_at AS "createdAt", r.updated_at AS "updatedAt", r.cancelled_at AS "cancelledAt"`;

const FROM = `
  FROM reservations r
  JOIN resources res ON res.id = r.resource_id
  JOIN sites s ON s.id = res.site_id
  LEFT JOIN users u ON u.id = r.user_id`;

/**
 * Transaction-scoped advisory lock per resource. Writers of one resource queue here instead of racing into the
 * exclusion index, where concurrent overlapping inserts can deadlock each other. The exclusion constraint still
 * decides correctness; this lock only makes contention orderly. Lock order is always user, then resource.
 */
export async function lockResource(db: Db, resourceId: string): Promise<void> {
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 7))', [resourceId]);
}

export async function getReservation(db: Db, id: string, lock = false): Promise<ReservationRow | null> {
  const { rows } = await db.query<ReservationRow>(
    `SELECT ${COLUMNS} ${FROM} WHERE r.id = $1 ${lock ? 'FOR UPDATE OF r' : ''}`,
    [id],
  );
  return rows[0] ?? null;
}

export async function insertReservation(
  db: Db,
  v: {
    resourceId: string;
    kind: 'booking' | 'maintenance';
    start: Date;
    end: Date;
    title: string;
    userId: string | null;
    createdBy: string;
  },
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO reservations (resource_id, kind, period, title, user_id, created_by)
     VALUES ($1, $2, tstzrange($3, $4, '[)'), $5, $6, $7) RETURNING id`,
    [v.resourceId, v.kind, v.start, v.end, v.title, v.userId, v.createdBy],
  );
  return rows[0]!.id;
}

export async function reschedule(db: Db, id: string, start: Date, end: Date, title: string): Promise<void> {
  await db.query(
    `UPDATE reservations SET period = tstzrange($2, $3, '[)'), title = $4, version = version + 1, updated_at = now()
      WHERE id = $1`,
    [id, start, end, title],
  );
}

export async function cancel(db: Db, id: string): Promise<void> {
  await db.query(
    `UPDATE reservations SET status = 'cancelled', cancelled_at = now(), version = version + 1, updated_at = now()
      WHERE id = $1`,
    [id],
  );
}

/** Active reservations of a resource that overlap [start, end). Uses the exclusion constraint's GiST index. */
export async function overlapping(
  db: Db,
  resourceId: string,
  start: Date,
  end: Date,
  opts: { excludeId?: string; kind?: 'booking'; lock?: boolean } = {},
): Promise<ReservationRow[]> {
  const params: unknown[] = [resourceId, start, end];
  let extra = '';
  if (opts.excludeId) {
    params.push(opts.excludeId);
    extra += ` AND r.id <> $${params.length}`;
  }
  if (opts.kind) extra += ` AND r.kind = 'booking'`;
  const { rows } = await db.query<ReservationRow>(
    `SELECT ${COLUMNS} ${FROM}
      WHERE r.resource_id = $1 AND r.status = 'active' AND r.period && tstzrange($2, $3, '[)') ${extra}
      ORDER BY lower(r.period)
      ${opts.lock ? 'FOR UPDATE OF r' : ''}`,
    params,
  );
  return rows;
}

export async function listForUser(db: Db, userId: string, scope: 'upcoming' | 'past', limit = 100) {
  const { rows } = await db.query<ReservationRow>(
    `SELECT ${COLUMNS} ${FROM}
      WHERE r.user_id = $1 AND r.kind = 'booking'
        AND ${scope === 'upcoming' ? `upper(r.period) > now() AND r.status = 'active'` : `(upper(r.period) <= now() OR r.status = 'cancelled')`}
      ORDER BY lower(r.period) ${scope === 'upcoming' ? 'ASC' : 'DESC'}
      LIMIT $2`,
    [userId, limit],
  );
  return rows;
}

export async function countActiveFuture(db: Db, userId: string): Promise<number> {
  const { rows } = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM reservations
      WHERE user_id = $1 AND status = 'active' AND kind = 'booking' AND upper(period) > now()`,
    [userId],
  );
  return rows[0]!.n;
}
