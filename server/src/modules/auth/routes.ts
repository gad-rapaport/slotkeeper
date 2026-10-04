import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Config } from '../../config.js';
import type { Pool } from '../../db/pool.js';
import { AppError } from '../../domain/errors.js';
import { parse } from '../../http/validation.js';
import { recordActivity } from '../activity/repo.js';
import { findUserForLogin } from '../users/repo.js';
import { burnVerification, verifyPassword } from './passwords.js';
import { createSession, deleteSession, SESSION_COOKIE } from './sessions.js';

const loginBody = z.object({
  email: z.string().trim().toLowerCase().max(200),
  password: z.string().min(1, 'Enter your password.').max(200),
});

export function authRoutes(app: FastifyInstance, pool: Pool, config: Config) {
  const cookieOptions = {
    path: '/',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: config.COOKIE_SECURE,
  };

  app.post(
    '/api/auth/login',
    {
      config: {
        rateLimit: {
          max: config.LOGIN_RATE_LIMIT_PER_MINUTE,
          timeWindow: '1 minute',
          // Limit per client address and target account, so one noisy client cannot lock others out.
          keyGenerator: (req) => {
            const email = (req.body as { email?: unknown } | undefined)?.email;
            return `${req.ip}|${typeof email === 'string' ? email.toLowerCase() : ''}`;
          },
        },
      },
    },
    async (req, reply) => {
      const { email, password } = parse(loginBody, req.body);
      const user = await findUserForLogin(pool, email);
      if (!user) {
        await burnVerification(password);
      }
      const valid = user ? await verifyPassword(user.passwordHash, password) : false;
      if (!user || !valid || !user.isActive) {
        req.log.info({ event: 'login_failed' }, 'login failed');
        throw new AppError(401, 'UNAUTHENTICATED', 'Email or password is incorrect.');
      }
      const session = await createSession(pool, user.id, config.SESSION_TTL_HOURS);
      await recordActivity(pool, {
        actorId: user.id,
        reservationId: null,
        action: 'session.login',
        summary: `${user.fullName} signed in`,
      });
      reply.setCookie(SESSION_COOKIE, session.token, { ...cookieOptions, expires: session.expiresAt });
      return {
        user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role },
        csrfToken: session.csrfToken,
      };
    },
  );

  app.post('/api/auth/logout', async (req, reply) => {
    if (req.auth) await deleteSession(pool, req.auth.sessionHash);
    reply.clearCookie(SESSION_COOKIE, cookieOptions);
    return reply.code(204).send();
  });

  // Session probe: answers 200 either way so a signed-out page load is not reported as a failed request.
  app.get('/api/auth/session', async (req) => {
    if (!req.auth) return { user: null, csrfToken: null };
    return { user: req.auth.user, csrfToken: req.auth.csrfToken };
  });
}
