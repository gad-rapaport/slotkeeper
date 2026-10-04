import { z } from 'zod';
import { AppError } from '../domain/errors.js';

/** Parses untrusted input and converts Zod issues into a 400 with per-field messages. */
export function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_';
    fields[key] ??= issue.message;
  }
  throw new AppError(400, 'VALIDATION_FAILED', 'Some fields need attention.', { fields });
}

export const uuidParam = z.object({ id: z.uuid({ message: 'Must be a valid identifier.' }) });

export const pagination = {
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
};

/** Optional trimmed string; empty becomes undefined so "no filter" and "blank filter" behave the same. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

/** Comma-separated query list restricted to known values, e.g. `status=new,assigned`. */
export function csvEnum<const T extends readonly [string, ...string[]]>(values: T) {
  return z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (!v) return undefined;
      const parts = v
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);
      for (const p of parts) {
        if (!values.includes(p)) {
          ctx.addIssue({ code: 'custom', message: `Unknown value "${p}".` });
          return z.NEVER;
        }
      }
      return parts as T[number][];
    });
}

export const expectedVersion = z.number().int().min(1);
