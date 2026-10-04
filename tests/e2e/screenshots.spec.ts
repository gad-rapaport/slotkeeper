import { expect, test } from '@playwright/test';
import { chooseSite, clearDemoBookings, nextOpenDay, signIn } from './support.js';

const out = (name: string) => `docs/screenshots/${name}.png`;

test('capture README screenshots', async ({ page, browser, request }) => {
  await clearDemoBookings(request);
  await signIn(page);
  await chooseSite(page, 'Tel Aviv HQ');
  await expect(page.locator('.card').first()).toBeVisible();
  await page.screenshot({ path: out('spaces') });

  await page.getByRole('link', { name: 'Yarkon room' }).click();
  await nextOpenDay(page);
  await expect(page.locator('.slot-btn').first()).toBeVisible();
  await page.screenshot({ path: out('day'), fullPage: true });

  await page.locator('.slot-btn').nth(2).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.screenshot({ path: out('booking-dialog') });
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Week', exact: true }).click();
  await expect(page.locator('.week__day').first()).toBeVisible();
  await page.screenshot({ path: out('week') });

  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await signIn(phone);
  await chooseSite(phone, 'Tel Aviv HQ');
  await phone.getByRole('link', { name: 'Carmel room' }).click();
  await nextOpenDay(phone);
  await expect(phone.locator('.slot-btn').first()).toBeVisible();
  await phone.screenshot({ path: out('mobile-day') });
});
