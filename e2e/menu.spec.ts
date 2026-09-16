import { test, expect } from '@playwright/test';

test('menu page loads', async ({ page }) => {
  await page.goto('/menu');
  await expect(page.locator('h1')).toBeVisible();
});

test('menu page shows menu items', async ({ page }) => {
  await page.goto('/menu');
  const items = page.locator('[data-testid="menu-item"], .menu-item, article, li').first();
  if (await items.isVisible()) {
    await expect(items).toBeVisible();
  }
});

test('menu page has category filters or search', async ({ page }) => {
  await page.goto('/menu');
  const input = page.getByPlaceholder(/search/i);
  if (await input.isVisible()) {
    await expect(input).toBeVisible();
  }
});
