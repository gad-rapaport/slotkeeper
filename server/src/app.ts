import { randomUUID } from 'node:crypto';
import path from 'node:path';
import Fastify from 'fastify';
import type { FastifyError, FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import type { Config } from './config.js';
import type { Pool } from './db/pool.js';
import { AppError } from './domain/errors.js';
import { registerAuth } from './http/auth.js';
import './http/types.js';
import { authRoutes } from './modules/auth/routes.js';
import { routes } from './routes.js';

const REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

export async function buildApp(config: Config, pool: Pool): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      redact: {
        paths: ['req.headers.cookie', 'req.headers.authorization', 'req.headers["x-csrf-token"]'],
        remove: true,
      },
    },
    bodyLimit: 64 * 1024,
    trustProxy: config.TRUST_PROXY,
    // Reuse a well-formed upstream request id so logs can be correlated across a proxy; otherwise mint one.
    genReqId: (req) => {
      const incoming = req.headers['x-request-id'];
      return typeof incoming === 'string' && REQUEST_ID.test(incoming) ? incoming : randomUUID();
    },
  });

  await app.register(cookie);
  await app.register(helmet, {
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    // HSTS only makes sense behind HTTPS; the public profile sets COOKIE_SECURE=true together with TLS.
    hsts: config.COOKIE_SECURE ? { maxAge: 15_552_000 } : false,
    crossOriginEmbedderPolicy: false,
  });
  await app.register(rateLimit, {
    global: false,
    hook: 'preHandler',
    errorResponseBuilder: (_req, ctx) =>
      new AppError(
        429,
        'RATE_LIMITED',
        `Too many attempts. Try again in ${Math.ceil(ctx.ttl / 1000)} seconds.`,
      ),
  });

  registerAuth(app, pool, { extraOrigin: config.DEV_ORIGIN });

  // Handlers are installed before any route so every route, including those added after an awaited
  // plugin registration, inherits them.
  app.setNotFoundHandler(async (req, reply) => {
    const wantsPage = req.method === 'GET' && !req.url.startsWith('/api/') && config.WEB_DIST;
    if (wantsPage) {
      reply.header('cache-control', 'no-cache');
      return reply.sendFile('index.html');
    }
    return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Not found.' }, requestId: req.id });
  });

  app.setErrorHandler(async (err: FastifyError | AppError, req, reply) => {
    if (err instanceof AppError) {
      if (err.status >= 500) req.log.error({ err }, 'application error');
      return reply.code(err.status).send({
        error: { code: err.code, message: err.message, details: err.details },
        requestId: req.id,
      });
    }
    const status = err.statusCode ?? 500;
    if (status < 500) {
      // Framework-level client errors: malformed JSON, body too large, wrong content type.
      return reply.code(status).send({
        error: {
          code: 'VALIDATION_FAILED',
          message: status === 413 ? 'Request body is too large.' : 'Malformed request.',
        },
        requestId: req.id,
      });
    }
    req.log.error({ err }, 'unhandled error');
    return reply.code(500).send({
      error: {
        code: 'INTERNAL',
        message: 'Something went wrong on our side. Quote the request id if it keeps happening.',
      },
      requestId: req.id,
    });
  });

  app.addHook('onSend', async (req, reply) => {
    reply.header('x-request-id', req.id);
    if (req.url.startsWith('/api/')) reply.header('cache-control', 'no-store');
  });

  app.get('/healthz', async () => ({ status: 'ok' }));
  app.get('/readyz', async (_req, reply) => {
    try {
      await pool.query('SELECT 1');
      return { status: 'ready' };
    } catch {
      return reply.code(503).send({ status: 'unavailable' });
    }
  });

  authRoutes(app, pool, config);
  routes(app, pool, config);

  if (config.WEB_DIST) {
    await app.register(fastifyStatic, {
      root: path.resolve(config.WEB_DIST),
      index: false,
      wildcard: false,
      setHeaders: (res, filePath) => {
        res.header(
          'cache-control',
          filePath.includes(`${path.sep}assets${path.sep}`)
            ? 'public, max-age=31536000, immutable'
            : 'no-cache',
        );
      },
    });
  }

  return app;
}
