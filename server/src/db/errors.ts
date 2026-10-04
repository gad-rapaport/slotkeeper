/** PostgreSQL error with SQLSTATE code and constraint, as raised by node-postgres. */
export interface PgError extends Error {
  code: string;
  constraint?: string;
}

export function isPgError(err: unknown): err is PgError {
  return err instanceof Error && typeof (err as PgError).code === 'string';
}

export const isUniqueViolation = (err: unknown, constraint?: string) =>
  isPgError(err) && err.code === '23505' && (!constraint || err.constraint === constraint);

export const isForeignKeyViolation = (err: unknown) => isPgError(err) && err.code === '23503';
