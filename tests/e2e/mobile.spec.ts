import { expect, test } from '@playwright/test';
import {
  chooseSite,
  clearDemoBookings,
  expectNoSeriousA11yViolations,
  nextOpenDay,
  signIn,
  trackConsole,
} from './support.js';

test('booking on a phone works with taps only and without sideways scrolling', async ({ page, request }) => {
  await clearDemoBookings(request);
  const errors = trackConsole(page);
  await signIn(page);
  await chooseSite(page, 'Tel Aviv HQ');
  await page.getByRole('link', { name: 'Desk A2' }).click();
  await nextOpenDay(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.locator('.slot-btn').first().tap();
  await page.getByRole('dialog').getByRole('button', { name: 'Book', exact: true }).tap();
  await expect(page.locator('.row--mine')).toHaveCount(1);
  await expectNoSeriousA11yViolations(page);
  expect(errors).toEqual([]);
  await clearDemoBookings(request);
});
