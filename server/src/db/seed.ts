import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from './pool.js';
import { withTransaction } from './pool.js';
import { hashPassword } from '../modules/auth/passwords.js';
import { addDays, localDate, weekdayOf, zonedToInstant } from '../domain/time.js';

/**
 * Deterministic synthetic demo data with stable ids; re-running inserts nothing new. Bookings are generated
 * relative to the first seed time, inside opening hours and without overlaps. All names are fictional and
 * all emails use the reserved .test domain.
 */

export function stableId(name: string): string {
  const b = createHash('sha256').update(`slotkeeper:${name}`).digest();
  b[6] = (b[6]! & 0x0f) | 0x50;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = b.subarray(0, 16).toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

function prng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)) };
}

type HoursTable = Readonly<Record<number, readonly [string, string]>>;

const USERS = [
  { key: 'admin', email: 'admin@slotkeeper.test', name: 'Facilities Admin', role: 'admin' },
  { key: 'maya', email: 'maya@slotkeeper.test', name: 'Maya Klein', role: 'member' },
  { key: 'omer', email: 'omer@slotkeeper.test', name: 'Omer Dahan', role: 'member' },
  { key: 'ruth', email: 'ruth@slotkeeper.test', name: 'Ruth Avery', role: 'member' },
  { key: 'demo', email: 'demo@slotkeeper.test', name: 'Demo Member', role: 'member' },
  // Colleagues who only exist to fill the calendar realistically.
  { key: 'tal', email: 'tal@slotkeeper.test', name: 'Tal Mor', role: 'member' },
  { key: 'noam', email: 'noam@slotkeeper.test', name: 'Noam Segal', role: 'member' },
  { key: 'ellis', email: 'ellis@slotkeeper.test', name: 'Ellis Grant', role: 'member' },
  { key: 'dana', email: 'dana@slotkeeper.test', name: 'Dana Weiss', role: 'member' },
  { key: 'priya', email: 'priya@slotkeeper.test', name: 'Priya Nair', role: 'member' },
  { key: 'yonatan', email: 'yonatan@slotkeeper.test', name: 'Yonatan Bar', role: 'member' },
  { key: 'sophie', email: 'sophie@slotkeeper.test', name: 'Sophie Lane', role: 'member' },
  { key: 'avi', email: 'avi@slotkeeper.test', name: 'Avi Shani', role: 'member' },
] as const;

const TLV_HOURS: HoursTable = {
  // Israeli working week: Sunday to Thursday, short Friday, closed Saturday.
  7: ['08:00', '19:00'],
  1: ['08:00', '19:00'],
  2: ['08:00', '19:00'],
  3: ['08:00', '19:00'],
  4: ['08:00', '19:00'],
  5: ['08:00', '13:00'],
};
const LDN_HOURS: HoursTable = {
  1: ['09:00', '18:00'],
  2: ['09:00', '18:00'],
  3: ['09:00', '18:00'],
  4: ['09:00', '18:00'],
  5: ['09:00', '18:00'],
};

const SITES = [
  {
    key: 'tlv',
    name: 'Tel Aviv HQ',
    timezone: 'Asia/Jerusalem',
    hours: TLV_HOURS,
    resources: [
      {
        key: 'yarkon',
        kind: 'room',
        name: 'Yarkon room',
        capacity: 8,
        description: 'Screen, whiteboard, video bar.',
        slot: 15,
        min: 15,
        max: 240,
      },
      {
        key: 'carmel',
        kind: 'room',
        name: 'Carmel room',
        capacity: 4,
        description: 'Quiet room for small meetings.',
        slot: 15,
        min: 15,
        max: 120,
      },
      {
        key: 'negev',
        kind: 'room',
        name: 'Negev hall',
        capacity: 16,
        description: 'Workshops and all-hands.',
        slot: 30,
        min: 60,
        max: 480,
      },
      {
        key: 'desk-a1',
        kind: 'desk',
        name: 'Desk A1',
        capacity: null,
        description: 'Window side, dual monitors.',
        slot: 30,
        min: 60,
        max: 600,
      },
      {
        key: 'desk-a2',
        kind: 'desk',
        name: 'Desk A2',
        capacity: null,
        description: 'Standing desk.',
        slot: 30,
        min: 60,
        max: 600,
      },
      {
        key: 'camera',
        kind: 'equipment',
        name: 'Camera kit',
        capacity: null,
        description: 'Mirrorless camera, two lenses, tripod.',
        slot: 60,
        min: 60,
        max: 480,
      },
    ],
  },
  {
    key: 'ldn',
    name: 'London Studio',
    timezone: 'Europe/London',
    hours: LDN_HOURS,
    resources: [
      {
        key: 'thames',
        kind: 'room',
        name: 'Thames room',
        capacity: 6,
        description: 'Video conferencing.',
        slot: 15,
        min: 15,
        max: 240,
      },
      {
        key: 'kew',
        kind: 'room',
        name: 'Kew booth',
        capacity: 2,
        description: 'Phone booth.',
        slot: 15,
        min: 15,
        max: 60,
      },
      {
        key: 'hotdesk',
        kind: 'desk',
        name: 'Hot desk 1',
        capacity: null,
        description: 'Near the kitchen.',
        slot: 30,
        min: 60,
        max: 540,
      },
    ],
  },
] as const;

const TITLES = [
  'Weekly sync',
  'Customer call',
  'Design review',
  'Interview',
  'Planning',
  '1:1',
  'Focus time',
  'Workshop',
];

export interface SeedPasswords {
  admin: string;
  member: string;
}

async function seedUsers(tx: PoolClient, pw: SeedPasswords) {
  const adminHash = await hashPassword(pw.admin);
  const memberHash = await hashPassword(pw.member);
  for (const u of USERS) {
    await tx.query(
      `INSERT INTO users (id, email, full_name, role, password_hash) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
      [stableId(`user:${u.key}`), u.email, u.name, u.role, u.role === 'admin' ? adminHash : memberHash],
    );
  }
}

async function seedSites(tx: PoolClient) {
  for (const s of SITES) {
    const siteId = stableId(`site:${s.key}`);
    await tx.query(`INSERT INTO sites (id, name, timezone) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`, [
      siteId,
      s.name,
      s.timezone,
    ]);
    for (const [weekday, [opens, closes]] of Object.entries(s.hours)) {
      await tx.query(
        `INSERT INTO opening_hours (site_id, weekday, opens, closes) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
        [siteId, Number(weekday), opens, closes],
      );
    }
    for (const r of s.resources) {
      await tx.query(
        `INSERT INTO resources (id, site_id, kind, name, description, capacity, slot_minutes, min_minutes, max_minutes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (id) DO NOTHING`,
        [
          stableId(`resource:${r.key}`),
          siteId,
          r.kind,
          r.name,
          r.description,
          r.capacity,
          r.slot,
          r.min,
          r.max,
        ],
      );
    }
  }
}

/** The first day within 1-4 days ahead when Tel Aviv is open until 19:00: 16:00-19:00 that day. */
function maintenanceWindow(anchor: number): [number, number] | null {
  const tz = SITES[0].timezone;
  for (let d = 1; d <= 4; d++) {
    const date = addDays(localDate(anchor, tz), d);
    const hours = TLV_HOURS[weekdayOf(date)];
    if (hours && hours[1] >= '19:00')
      return [zonedToInstant(date, '16:00', tz), zonedToInstant(date, '19:00', tz)];
  }
  return null;
}

async function seedReservations(tx: PoolClient, anchor: number): Promise<number> {
  const rnd = prng(20261004);
  const members = USERS.filter((u) => u.role === 'member' && u.key !== 'demo');
  let inserted = 0;

  const maintenance = maintenanceWindow(anchor);
  if (maintenance) {
    const res = await tx.query(
      `INSERT INTO reservations (id, resource_id, kind, period, title, created_by)
       VALUES ($1, $2, 'maintenance', tstzrange($3, $4, '[)'), 'Projector replacement', $5) ON CONFLICT (id) DO NOTHING`,
      [
        stableId('maintenance:negev'),
        stableId('resource:negev'),
        new Date(maintenance[0]),
        new Date(maintenance[1]),
        stableId('user:admin'),
      ],
    );
    inserted += res.rowCount ?? 0;
  }

  for (const s of SITES) {
    const today = localDate(anchor, s.timezone);
    for (const r of s.resources) {
      const resourceId = stableId(`resource:${r.key}`);
      for (let d = -3; d <= 10; d++) {
        const date = addDays(today, d);
        const hours = s.hours[weekdayOf(date)];
        if (!hours) continue;
        const opens = zonedToInstant(date, hours[0], s.timezone);
        const closes = zonedToInstant(date, hours[1], s.timezone);
        const step = r.slot * 60_000;
        let cursor = opens + rnd.int(0, 4) * step;
        let n = 0;
        while (cursor < closes && n < 4) {
          const len = Math.max(r.min, Math.min(r.max, r.slot * rnd.int(2, 6))) * 60_000;
          const end = cursor + len;
          if (end > closes) break;
          const book = rnd.next() < 0.55;
          const blocked =
            r.key === 'negev' && maintenance !== null && cursor < maintenance[1] && end > maintenance[0];
          if (book && !blocked) {
            const who = members[rnd.int(0, members.length - 1)]!;
            const userId = stableId(`user:${who.key}`);
            const res = await tx.query(
              `INSERT INTO reservations (id, resource_id, kind, period, title, user_id, created_by, created_at)
               VALUES ($1, $2, 'booking', tstzrange($3, $4, '[)'), $5, $6, $6, $7) ON CONFLICT (id) DO NOTHING`,
              [
                stableId(`booking:${r.key}:${d}:${n}`),
                resourceId,
                new Date(cursor),
                new Date(end),
                TITLES[rnd.int(0, TITLES.length - 1)],
                userId,
                new Date(Math.min(anchor, cursor) - 86_400_000),
              ],
            );
            inserted += res.rowCount ?? 0;
            n++;
          }
          cursor = end + rnd.int(1, 6) * step;
        }
      }
    }
  }
  return inserted;
}

export async function seed(pool: Pool, passwords: SeedPasswords) {
  return withTransaction(pool, async (tx) => {
    await tx.query(
      `CREATE TABLE IF NOT EXISTS seed_meta (key text PRIMARY KEY, anchored_at timestamptz NOT NULL)`,
    );
    const anchor = await tx.query<{ anchored_at: Date }>(
      `INSERT INTO seed_meta (key, anchored_at) VALUES ('demo', now())
       ON CONFLICT (key) DO UPDATE SET key = EXCLUDED.key RETURNING anchored_at`,
    );
    await seedUsers(tx, passwords);
    await seedSites(tx);
    const reservations = await seedReservations(tx, anchor.rows[0]!.anchored_at.getTime());
    return { users: USERS.length, sites: SITES.length, reservationsInserted: reservations };
  });
}
