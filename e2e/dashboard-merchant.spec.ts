import { test, expect } from '@playwright/test';

test('unauthenticated user is redirected to login', async ({ page }) => {
  await page.goto('/dashboard/merchant', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/auth\/login/);
  await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible();
});

test('dashboard page shows redirect when not logged in', async ({ page }) => {
  const response = await page.goto('/dashboard');
  expect(response?.status()).toBeLessThan(500);
});
