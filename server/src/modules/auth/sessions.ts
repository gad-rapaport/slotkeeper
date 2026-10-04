import { createHash, randomBytes } from 'node:crypto';
import type { Db } from '../../db/pool.js';
import type { SessionUser } from '../../http/types.js';

export const SESSION_COOKIE = 'sk_session';

export function hashToken(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}

export async function createSession(db: Db, userId: string, ttlHours: number) {
  const token = randomBytes(32).toString('base64url');
  const csrfToken = randomBytes(24).toString('base64url');
  const idHash = hashToken(token);
  const { rows } = await db.query<{ expires_at: Date }>(
    `INSERT INTO sessions (id_hash, user_id, csrf_token, expires_at)
     VALUES ($1, $2, $3, now() + make_interval(hours => $4))
     RETURNING expires_at`,
    [idHash, userId, csrfToken, ttlHours],
  );
  return { token, csrfToken, idHash, expiresAt: rows[0]!.expires_at };
}

export async function findSession(db: Db, token: string) {
  const idHash = hashToken(token);
  const { rows } = await db.query<{
    csrf_token: string;
    id: string;
    email: string;
    full_name: string;
    role: SessionUser['role'];
  }>(
    `SELECT s.csrf_token, u.id, u.email, u.full_name, u.role
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.id_hash = $1 AND s.expires_at > now() AND u.is_active`,
    [idHash],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    sessionHash: idHash,
    csrfToken: row.csrf_token,
    user: { id: row.id, email: row.email, fullName: row.full_name, role: row.role },
  };
}

export async function deleteSession(db: Db, idHash: Buffer): Promise<void> {
  await db.query('DELETE FROM sessions WHERE id_hash = $1', [idHash]);
}

export async function purgeExpiredSessions(db: Db): Promise<number> {
  const { rowCount } = await db.query('DELETE FROM sessions WHERE expires_at <= now()');
  return rowCount ?? 0;
}
