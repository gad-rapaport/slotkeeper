import { existsSync, readFileSync } from 'node:fs';
import { AxeBuilder } from '@axe-core/playwright';
import { expect } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';

function readEnv(key: string): string {
  if (process.env[key]) return process.env[key]!;
  if (existsSync('.env')) {
    const m = new RegExp(`^${key}=(.*)$`, 'm').exec(readFileSync('.env', 'utf8'));
    if (m?.[1]) return m[1].trim();
  }
  throw new Error(`${key} is not set (environment or .env)`);
}

export const memberPassword = () => readEnv('SEED_MEMBER_PASSWORD');
export const adminPassword = () => readEnv('SEED_ADMIN_PASSWORD');

export async function signIn(page: Page, email = 'demo@slotkeeper.test', password = memberPassword()) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('#main')).toBeVisible();
}

export function trackConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

export async function expectNoSeriousA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}

/** Cancels every upcoming booking of the demo member through the API, so each test starts clean. */
export async function clearDemoBookings(request: APIRequestContext) {
  const login = await request.post('/api/auth/login', {
    data: { email: 'demo@slotkeeper.test', password: memberPassword() },
  });
  const { csrfToken } = await login.json();
  const list = await (await request.get('/api/bookings')).json();
  for (const b of list.items as { id: string; version: number }[]) {
    await request.post(`/api/bookings/${b.id}/cancel`, {
      data: { expectedVersion: b.version },
      headers: { 'x-csrf-token': csrfToken },
    });
  }
}

/** Moves forward one day at a time until the schedule shows bookable slots (skips closed days). */
export async function nextOpenDay(page: Page) {
  for (let i = 0; i < 4; i++) {
    await page.getByRole('button', { name: 'Next day' }).click();
    await page.waitForLoadState('networkidle');
    if ((await page.locator('.slot-btn').count()) > 0) return;
  }
  throw new Error('no open day with free slots in the next four days');
}

/** Picks an office on the spaces page and waits until the choice is applied. */
export async function chooseSite(page: Page, name: string) {
  const radio = page.getByRole('radio', { name });
  await page.locator('label', { has: radio }).click();
  await expect(radio).toBeChecked();
}
