import { z } from 'zod';

const bool = z.enum(['true', 'false']).transform((v) => v === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3103),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(8),
  DB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(100).max(60000).default(5000),
  COOKIE_SECURE: bool.default(false),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(12),
  LOGIN_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(1000).default(10),
  /** Booking creation per user per minute: protects against scripts, not against normal use. */
  BOOKING_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(10000).default(30),
  BOOKING_HORIZON_DAYS: z.coerce.number().int().min(1).max(365).default(60),
  MAX_ACTIVE_BOOKINGS_PER_USER: z.coerce.number().int().min(1).max(1000).default(20),
  IDEMPOTENCY_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(24),
  TRUST_PROXY: bool.default(false),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  MIGRATE_ON_START: bool.default(false),
  WEB_DIST: z.string().optional(),
  OPENAPI_PATH: z.string().optional(),
  DEV_ORIGIN: z.string().url().optional(),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid configuration: ${problems}`);
  }
  return parsed.data;
}
