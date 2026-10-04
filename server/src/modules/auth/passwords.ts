import { hash, verify } from '@node-rs/argon2';

// OWASP Password Storage Cheat Sheet baseline for Argon2id: m=19 MiB, t=2, p=1.
// algorithm 2 is Argon2id; the package exposes it only as an ambient const enum.
const OPTIONS = { algorithm: 2, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * Verifies against a throwaway hash when the email is unknown, so response time does not reveal
 * whether an account exists.
 */
export async function burnVerification(password: string): Promise<void> {
  dummyHash ??= hashPassword('slotkeeper-timing-equaliser');
  await verifyPassword(await dummyHash, password);
}
