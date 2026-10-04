import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from '../db/pool.js';
import { AppError } from '../domain/errors.js';
import { findSession, SESSION_COOKIE } from '../modules/auth/sessions.js';
import type { SessionUser } from './types.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function requireAuth(req: FastifyRequest): SessionUser {
  if (!req.auth) throw new AppError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
  return req.auth.user;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Resolves the session cookie on every API request and enforces CSRF protection on state-changing
 * requests. Two independent checks: the Origin header (when sent) must be our own origin, and an
 * authenticated request must echo the per-session CSRF token in `X-CSRF-Token`. SameSite=Lax cookies are
 * a third layer.
 */
export function registerAuth(app: FastifyInstance, pool: Pool, opts: { extraOrigin?: string | undefined }) {
  app.decorateRequest('auth', null);

  app.addHook('onRequest', async (req) => {
    if (!req.url.startsWith('/api/')) return;

    const token = req.cookies[SESSION_COOKIE];
    if (token && token.length <= 128) {
      req.auth = await findSession(pool, token);
    }

    if (SAFE_METHODS.has(req.method)) return;

    const origin = req.headers.origin;
    if (origin) {
      const own = `${req.protocol}://${req.host}`;
      if (origin !== own && origin !== opts.extraOrigin) {
        throw new AppError(403, 'CSRF_REJECTED', 'Request origin is not allowed.');
      }
    }

    if (req.auth) {
      const header = req.headers['x-csrf-token'];
      if (typeof header !== 'string' || !safeEqual(header, req.auth.csrfToken)) {
        throw new AppError(403, 'CSRF_REJECTED', 'Your session token is missing or stale. Reload the page.');
      }
    }
  });
}
