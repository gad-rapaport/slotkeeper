import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { ERROR_CODES } from '../../server/src/domain/errors.js';
import { startApp } from './helpers.js';
import type { TestContext } from './helpers.js';

interface Spec {
  paths: Record<string, Record<string, unknown>>;
  components: { schemas: { Error: { properties: { error: { properties: { code: { enum: string[] } } } } } } };
}

const spec = parse(readFileSync('docs/openapi.yaml', 'utf8')) as Spec;
const METHODS = ['get', 'post', 'put', 'patch', 'delete'];
const documented = new Set(
  Object.entries(spec.paths).flatMap(([p, ops]) =>
    Object.keys(ops)
      .filter((m) => METHODS.includes(m))
      .map((m) => `${m.toUpperCase()} ${p.replace(/\{(\w+)\}/g, ':$1')}`),
  ),
);

let ctx: TestContext;
beforeAll(async () => {
  ctx = await startApp();
});
afterAll(() => ctx.close());

/**
 * Every (method, path) in Fastify's routing table. printRoutes draws a tree where child lines hold only the
 * path suffix, indented four characters per level; the full path is rebuilt from the parents.
 */
function registeredRoutes(): string[] {
  const out: string[] = [];
  const stack: string[] = [];
  for (const line of ctx.app.printRoutes({ commonPrefix: false }).split('\n')) {
    const m = /(\/\S*) \(([^)]+)\)/.exec(line);
    if (!m) continue;
    const depth = (line.indexOf(m[1]!) - 4) / 4;
    stack.length = depth;
    stack.push(m[1]!);
    const path = stack.join('');
    for (const method of m[2]!.split(',').map((s) => s.trim())) {
      if (method !== 'HEAD' && method !== 'OPTIONS') out.push(`${method} ${path}`);
    }
  }
  return out;
}

describe('OpenAPI contract', () => {
  it('documents only routes that exist', () => {
    for (const entry of documented) {
      const [method, url] = entry.split(' ') as [string, string];
      expect(ctx.app.hasRoute({ method: method as 'GET', url }), entry).toBe(true);
    }
  });

  it('documents every route the server exposes', () => {
    const routes = registeredRoutes();
    expect(routes.length).toBeGreaterThan(10);
    expect(routes.filter((r) => !documented.has(r))).toEqual([]);
  });

  it('lists exactly the error codes the server can return', () => {
    expect([...spec.components.schemas.Error.properties.error.properties.code.enum].sort()).toEqual(
      [...ERROR_CODES].sort(),
    );
  });

  it('is served by the API', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/openapi.yaml' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('openapi: 3.1.0');
  });
});
