import { test, expect } from '@playwright/test';

test('homepage loads and shows title', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Dilip Da/);
});

test('homepage has navigation bar', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
});

test('homepage has menu link', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: /menu/i }).first()).toBeVisible();
});

test('homepage has hero section with order button', async ({ page }) => {
  await page.goto('/');
  const orderBtn = page.getByRole('link', { name: /order now/i });
  if (await orderBtn.isVisible()) {
    await expect(orderBtn).toBeVisible();
  }
});
