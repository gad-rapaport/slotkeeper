import { readFile } from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Config } from './config.js';
import type { Pool } from './db/pool.js';
import { AppError, notFound } from './domain/errors.js';
import { policy } from './domain/permissions.js';
import { addDays, localDate } from './domain/time.js';
import { requireAuth } from './http/auth.js';
import { expectedVersion, optionalText, parse, uuidParam } from './http/validation.js';
import { listActivity } from './modules/activity/repo.js';
import { availability } from './modules/resources/availability.js';
import { getResource, listResources, listSites } from './modules/resources/repo.js';
import { listForUser, getReservation } from './modules/reservations/repo.js';
import * as bookings from './modules/reservations/service.js';

const instant = z.iso.datetime({
  offset: true,
  message: 'Use an ISO 8601 time with an offset, e.g. 2026-10-05T09:00:00+03:00.',
});
const window = z
  .object({ start: instant, end: instant })
  .transform((w) => ({ start: new Date(w.start), end: new Date(w.end) }));

const createBody = z
  .object({
    resourceId: z.uuid(),
    start: instant,
    end: instant,
    title: z.string().trim().max(120).default(''),
  })
  .transform((b) => ({
    resourceId: b.resourceId,
    start: new Date(b.start),
    end: new Date(b.end),
    title: b.title,
  }));
const rescheduleBody = z
  .object({ expectedVersion, start: instant, end: instant, title: z.string().trim().max(120).optional() })
  .strict();
const cancelBody = z.object({ expectedVersion });
const maintenanceBody = z.object({
  start: instant,
  end: instant,
  reason: z.string().trim().min(3, 'Give a short reason.').max(120),
  cancelConflicting: z.boolean().default(false),
});
const availabilityQuery = z.object({
  date: z.iso.date().optional(),
  days: z.coerce.number().int().min(1).max(7).default(1),
});
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{8,100}$/;

export function routes(app: FastifyInstance, pool: Pool, config: Config) {
  app.get('/api/sites', async (req) => {
    requireAuth(req);
    return { items: await listSites(pool) };
  });

  app.get('/api/resources', async (req) => {
    requireAuth(req);
    const q = parse(
      z.object({ siteId: z.uuid().optional(), kind: z.enum(['room', 'desk', 'equipment']).optional() }),
      req.query,
    );
    return { items: await listResources(pool, q) };
  });

  app.get('/api/resources/:id', async (req) => {
    requireAuth(req);
    const { id } = parse(uuidParam, req.params);
    const resource = await getResource(pool, id);
    if (!resource) throw notFound('Resource');
    return resource;
  });

  app.get('/api/resources/:id/availability', async (req) => {
    const actor = requireAuth(req);
    const { id } = parse(uuidParam, req.params);
    const q = parse(availabilityQuery, req.query);
    const resource = await getResource(pool, id);
    if (!resource) throw notFound('Resource');
    const today = localDate(Date.now(), resource.timezone);
    const from = q.date ?? today;
    if (from < addDays(today, -7) || from > addDays(today, config.BOOKING_HORIZON_DAYS)) {
      throw new AppError(400, 'VALIDATION_FAILED', 'Date is outside the bookable range.', {
        fields: { date: 'Out of range.' },
      });
    }
    return {
      resource,
      today,
      days: await availability(pool, actor, resource, from, q.days),
    };
  });

  app.get('/api/bookings', async (req) => {
    const actor = requireAuth(req);
    const q = parse(z.object({ scope: z.enum(['upcoming', 'past']).default('upcoming') }), req.query);
    const rows = await listForUser(pool, actor.id, q.scope);
    return { items: rows.map((r) => bookings.present(r, actor)) };
  });

  app.get('/api/bookings/:id', async (req) => {
    const actor = requireAuth(req);
    const { id } = parse(uuidParam, req.params);
    const row = await getReservation(pool, id);
    if (!row || (row.kind === 'booking' && !policy.seeDetails(actor, row))) throw notFound('Booking');
    return bookings.present(row, actor);
  });

  app.post(
    '/api/bookings',
    {
      config: {
        rateLimit: {
          max: config.BOOKING_RATE_LIMIT_PER_MINUTE,
          timeWindow: '1 minute',
          keyGenerator: (req) => req.auth?.user.id ?? req.ip,
        },
      },
    },
    async (req, reply) => {
      const actor = requireAuth(req);
      const key = req.headers['idempotency-key'];
      if (typeof key !== 'string' || !IDEMPOTENCY_KEY.test(key)) {
        throw new AppError(
          400,
          'IDEMPOTENCY_KEY_REQUIRED',
          'Send an Idempotency-Key header (8-100 letters, digits, - or _) so a retried request cannot book twice.',
        );
      }
      const result = await bookings.createBooking(pool, config, actor, key, parse(createBody, req.body));
      if (result.replayed) reply.header('idempotent-replayed', 'true');
      return reply.code(result.status).send(result.body);
    },
  );

  app.patch('/api/bookings/:id', async (req) => {
    const actor = requireAuth(req);
    const { id } = parse(uuidParam, req.params);
    const body = parse(rescheduleBody, req.body);
    const w = parse(window, body);
    return bookings.rescheduleBooking(pool, config, actor, id, body.expectedVersion, {
      ...w,
      title: body.title,
    });
  });

  app.post('/api/bookings/:id/cancel', async (req) => {
    const actor = requireAuth(req);
    const { id } = parse(uuidParam, req.params);
    return bookings.cancelReservation(pool, actor, id, parse(cancelBody, req.body).expectedVersion);
  });

  app.post('/api/resources/:id/maintenance', async (req, reply) => {
    const actor = requireAuth(req);
    const { id } = parse(uuidParam, req.params);
    const body = parse(maintenanceBody, req.body);
    const block = await bookings.createMaintenance(pool, actor, {
      resourceId: id,
      start: new Date(body.start),
      end: new Date(body.end),
      reason: body.reason,
      cancelConflicting: body.cancelConflicting,
    });
    return reply.code(201).send(block);
  });

  app.get('/api/activity', async (req) => {
    const actor = requireAuth(req);
    const q = parse(z.object({ all: optionalText(5) }), req.query);
    const all = q.all === 'true' && policy.readAllActivity(actor);
    return { items: await listActivity(pool, { actorId: all ? undefined : actor.id, limit: 50 }) };
  });

  // The hand-written contract, served as-is. tests/integration/contract.test.ts keeps it honest.
  app.get('/api/openapi.yaml', async (_req, reply) => {
    if (!config.OPENAPI_PATH) throw notFound('API description');
    reply.header('content-type', 'application/yaml; charset=utf-8');
    return readFile(config.OPENAPI_PATH, 'utf8');
  });
}
