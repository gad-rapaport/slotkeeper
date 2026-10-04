import { expect, test } from '@playwright/test';
import {
  adminPassword,
  chooseSite,
  clearDemoBookings,
  expectNoSeriousA11yViolations,
  nextOpenDay,
  signIn,
  trackConsole,
} from './support.js';

test.beforeEach(async ({ request }) => {
  await clearDemoBookings(request);
});

test('a member finds a room, books a free slot and sees it in My bookings', async ({ page }) => {
  const errors = trackConsole(page);
  await signIn(page);
  await expect(page.getByRole('heading', { name: 'Find a space' })).toBeVisible();
  await chooseSite(page, 'Tel Aviv HQ');
  await page.getByRole('link', { name: 'Yarkon room' }).click();
  await expect(page.getByText(/Times in/)).toContainText('Israel time');

  await nextOpenDay(page);
  const firstFree = page.locator('.slot-btn').first();
  await expect(firstFree).toBeVisible();
  const time = (await firstFree.textContent())!.trim();
  await firstFree.click();

  const dialog = page.getByRole('dialog', { name: 'Book Yarkon room' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Title').fill('E2E planning');
  await dialog.getByRole('button', { name: 'Book', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Booked Yarkon room' })).toBeVisible();
  await expect(page.locator('.row--mine').filter({ hasText: 'E2E planning' })).toBeVisible();

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'My bookings' }).click();
  await expect(
    page
      .locator('section', { has: page.getByRole('heading', { name: 'Upcoming' }) })
      .locator('.booking')
      .filter({ hasText: 'Yarkon room' })
      .filter({ hasText: time }),
  ).toBeVisible();
  await expectNoSeriousA11yViolations(page);
  expect(errors).toEqual([]);
});

test('a slot taken by someone else in the meantime gives a clear message, not a duplicate', async ({
  page,
  browser,
}) => {
  await signIn(page);
  await chooseSite(page, 'Tel Aviv HQ');
  await page.getByRole('link', { name: 'Carmel room' }).click();
  await nextOpenDay(page);
  const slot = page.locator('.slot-btn').first();
  await slot.click();
  const dialog = page.getByRole('dialog', { name: 'Book Carmel room' });
  await expect(dialog).toBeVisible();

  // Another person books the same time first, through a second browser session.
  const other = await browser.newPage();
  await signIn(other, 'admin@slotkeeper.test', adminPassword());
  await other.goto(page.url());
  await other.locator('.slot-btn').first().click();
  await other.getByRole('dialog').getByRole('button', { name: 'Book', exact: true }).click();
  await expect(other.locator('.row--mine')).toHaveCount(1);

  await dialog.getByRole('button', { name: 'Book', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'no longer free' })).toBeVisible();
  await expect(page.locator('.row--booked').first()).toBeVisible();

  // Clean up the admin's booking.
  await other.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'My bookings' }).click();
  await other
    .getByRole('button', { name: /^Cancel Carmel room/ })
    .first()
    .click();
  await other.getByRole('button', { name: 'Confirm cancel' }).click();
  await expect(other.getByRole('status').filter({ hasText: 'Cancelled' })).toBeVisible();
});

test('a booking can be moved and cancelled', async ({ page }) => {
  await signIn(page);
  await chooseSite(page, 'Tel Aviv HQ');
  await page.getByRole('link', { name: 'Desk A1' }).click();
  await nextOpenDay(page);
  await page.locator('.slot-btn').first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Book', exact: true }).click();
  await expect(page.locator('.row--mine')).toHaveCount(1);

  await page.goto('/bookings');
  await page.getByRole('button', { name: 'Change time' }).first().click();
  const dialog = page.getByRole('dialog');
  const start = dialog.getByLabel('Start');
  const options = await start.locator('option').allTextContents();
  await start.selectOption({ label: options.at(-2)! });
  await dialog.getByRole('button', { name: 'Move booking' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Moved to' })).toBeVisible();

  await page
    .getByRole('button', { name: /^Cancel Desk A1/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Confirm cancel' }).click();
  await expect(page.getByText('No upcoming bookings.')).toBeVisible();
});

test('the week view summarises availability and opens a day', async ({ page }) => {
  await signIn(page);
  await chooseSite(page, 'Tel Aviv HQ');
  await page.getByRole('link', { name: 'Negev hall' }).click();
  await page.getByRole('button', { name: 'Week', exact: true }).click();
  await expect(page.locator('.week__day')).toHaveCount(7);
  await expect(page.getByRole('list', { name: 'Colour key' })).toBeVisible();
  await page.locator('.week__btn').nth(2).click();
  await expect(page.getByRole('button', { name: 'Day', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('only admins can schedule maintenance', async ({ page }) => {
  await signIn(page);
  await page.getByRole('link', { name: 'Thames room' }).click();
  await expect(page.getByRole('button', { name: 'Schedule maintenance' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await signIn(page, 'admin@slotkeeper.test', adminPassword());
  await page.getByRole('link', { name: 'Thames room' }).click();
  await expect(page.getByRole('button', { name: 'Schedule maintenance' })).toBeVisible();
});
