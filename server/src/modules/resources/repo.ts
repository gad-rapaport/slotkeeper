import type { Db } from '../../db/pool.js';
import type { HoursByWeekday } from '../../domain/rules.js';

export interface ResourceRow {
  id: string;
  siteId: string;
  siteName: string;
  timezone: string;
  kind: 'room' | 'desk' | 'equipment';
  name: string;
  description: string;
  capacity: number | null;
  slotMinutes: number;
  minMinutes: number;
  maxMinutes: number;
}

const SELECT = `
  SELECT r.id, r.site_id AS "siteId", s.name AS "siteName", s.timezone, r.kind, r.name, r.description, r.capacity,
         r.slot_minutes AS "slotMinutes", r.min_minutes AS "minMinutes", r.max_minutes AS "maxMinutes"
    FROM resources r JOIN sites s ON s.id = r.site_id`;

export async function listSites(db: Db) {
  const { rows } = await db.query<{ id: string; name: string; timezone: string; resources: number }>(
    `SELECT s.id, s.name, s.timezone, count(r.id)::int AS resources
       FROM sites s LEFT JOIN resources r ON r.site_id = s.id AND r.is_active
      GROUP BY s.id ORDER BY s.name`,
  );
  return rows;
}

export async function listResources(db: Db, f: { siteId?: string | undefined; kind?: string | undefined }) {
  const where = ['r.is_active'];
  const params: unknown[] = [];
  if (f.siteId) {
    params.push(f.siteId);
    where.push(`r.site_id = $${params.length}`);
  }
  if (f.kind) {
    params.push(f.kind);
    where.push(`r.kind = $${params.length}::resource_kind`);
  }
  const { rows } = await db.query<ResourceRow>(
    `${SELECT} WHERE ${where.join(' AND ')} ORDER BY s.name, r.kind, r.name`,
    params,
  );
  return rows;
}

export async function getResource(db: Db, id: string): Promise<ResourceRow | null> {
  const { rows } = await db.query<ResourceRow>(`${SELECT} WHERE r.id = $1 AND r.is_active`, [id]);
  return rows[0] ?? null;
}

export async function getHours(db: Db, siteId: string): Promise<HoursByWeekday> {
  const { rows } = await db.query<{ weekday: number; opens: string; closes: string }>(
    `SELECT weekday, to_char(opens, 'HH24:MI') AS opens, to_char(closes, 'HH24:MI') AS closes
       FROM opening_hours WHERE site_id = $1`,
    [siteId],
  );
  const hours: HoursByWeekday = {};
  for (const r of rows) hours[r.weekday] = { opens: r.opens, closes: r.closes };
  return hours;
}
