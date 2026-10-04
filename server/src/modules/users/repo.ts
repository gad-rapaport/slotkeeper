import type { Db } from '../../db/pool.js';
import type { Role } from '../../domain/permissions.js';

export interface UserRow {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  isActive: boolean;
}

export async function findUserForLogin(db: Db, email: string) {
  const { rows } = await db.query<UserRow & { passwordHash: string }>(
    `SELECT id, email, full_name AS "fullName", role, is_active AS "isActive", password_hash AS "passwordHash"
       FROM users WHERE email = $1`,
    [email],
  );
  return rows[0] ?? null;
}

/**
 * Row lock on the user: serialises one user's booking creations so per-user limits cannot be raced.
 * NO KEY UPDATE does not conflict with the KEY SHARE locks that foreign-key checks take on this row, so other
 * writes referencing the user (sessions, activity) are not blocked. It must be the first lock the transaction
 * takes: acquiring it after inserting a row that references the user deadlocks two concurrent requests.
 */
export async function lockUser(db: Db, id: string): Promise<void> {
  await db.query('SELECT 1 FROM users WHERE id = $1 FOR NO KEY UPDATE', [id]);
}
