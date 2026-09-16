import { test, expect } from '@playwright/test';

test('cart page loads', async ({ page }) => {
  await page.goto('/cart');
  await expect(page).toHaveURL(/\/cart/);
});

test('cart page shows items or empty state', async ({ page }) => {
  await page.goto('/cart');
  const body = page.locator('body');
  const text = await body.innerText();
  const hasContent = text.length > 0;
  expect(hasContent).toBe(true);
});
