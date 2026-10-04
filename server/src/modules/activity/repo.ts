import type { Db } from '../../db/pool.js';

export interface ActivityInput {
  actorId: string | null;
  reservationId: string | null;
  action: string;
  summary: string;
  details?: Record<string, unknown>;
}

/** Always called with the transaction of the change it records. */
export async function recordActivity(db: Db, input: ActivityInput): Promise<void> {
  await db.query(
    `INSERT INTO activity_log (actor_id, reservation_id, action, summary, details) VALUES ($1, $2, $3, $4, $5)`,
    [input.actorId, input.reservationId, input.action, input.summary, input.details ?? {}],
  );
}

export interface ActivityRow {
  id: number;
  actorName: string | null;
  reservationId: string | null;
  resourceName: string | null;
  action: string;
  summary: string;
  createdAt: string;
}

export async function listActivity(db: Db, opts: { actorId?: string | undefined; limit: number }) {
  const params: unknown[] = [opts.limit];
  let where = '';
  if (opts.actorId) {
    params.push(opts.actorId);
    where = 'WHERE a.actor_id = $2';
  }
  const { rows } = await db.query<ActivityRow>(
    `SELECT a.id, u.full_name AS "actorName", a.reservation_id AS "reservationId", res.name AS "resourceName",
            a.action, a.summary, a.created_at AS "createdAt"
       FROM activity_log a
       LEFT JOIN users u ON u.id = a.actor_id
       LEFT JOIN reservations r ON r.id = a.reservation_id
       LEFT JOIN resources res ON res.id = r.resource_id
       ${where}
      ORDER BY a.id DESC
      LIMIT $1`,
    params,
  );
  return rows;
}
