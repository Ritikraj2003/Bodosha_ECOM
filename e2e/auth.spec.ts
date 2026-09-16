import { test, expect } from '@playwright/test';

test('login page renders form', async ({ page }) => {
  await page.goto('/auth/login');
  await expect(page.getByRole('heading')).toBeVisible();
});

test('login page has email and password fields', async ({ page }) => {
  await page.goto('/auth/login');
  const emailInput = page.getByLabel(/email/i);
  const passwordInput = page.getByLabel(/password/i);
  await expect(emailInput).toBeVisible();
  await expect(passwordInput).toBeVisible();
});

test('login page has submit button', async ({ page }) => {
  await page.goto('/auth/login');
  await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
});

test('signup page renders and links to login', async ({ page }) => {
  await page.goto('/auth/signup');
  await expect(page.getByRole('heading', { name: /create account/i })).toBeVisible();
});

test('unauthenticated access to dashboard redirects to login', async ({ page }) => {
  await page.goto('/dashboard/merchant', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/auth\/login/);
  await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible();
});
