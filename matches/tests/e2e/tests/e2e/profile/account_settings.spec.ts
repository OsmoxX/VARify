/**
 * profile/account_settings.spec.ts
 *
 * Tests the account settings page (/account/).
 *
 * Covers:
 *  - Unauthenticated redirect
 *  - Page structure (shared / tier-agnostic)
 *  - Tier-specific username field behaviour (FREE locked, PLUS+ enabled)
 *    → Paywall-specific tests live in subscription/paywall.spec.ts
 */

import { test, expect } from '../fixtures';

test.describe('Account settings — access control', () => {
  test('unauthenticated user is redirected to /login/ when visiting /account/', async ({ browser }) => {
    const ctx  = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    await page.goto('/account/');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(/\/login\//);
    await ctx.close();
  });
});

test.describe('Account settings — page structure (FREE baseline)', () => {
  test('loads the account settings page successfully', async ({ page }) => {
    await page.goto('/account/');
    await expect(page).toHaveTitle(/Ustawienia konta|VARify/i);
    await expect(page.locator('p.account-subtitle')).toBeVisible();
  });

  test('shows the profile data section with username and email inputs', async ({ page }) => {
    await page.goto('/account/');
    await expect(page.getByText(/Dane profilu/i)).toBeVisible();
    await expect(page.locator('#username')).toBeVisible();
    await expect(page.locator('#email')).toBeVisible();
  });

  test('username field is pre-filled with the logged-in user\'s name', async ({ page }) => {
    await page.goto('/account/');
    const value = await page.locator('#username').inputValue();
    expect(value.length).toBeGreaterThan(0);
  });

  test('shows the change password section with all three password fields', async ({ page }) => {
    await page.goto('/account/');
    await expect(page.getByText(/Zmiana has/i)).toBeVisible();
    await expect(page.locator('#current_password')).toBeVisible();
    await expect(page.locator('#new_password')).toBeVisible();
    await expect(page.locator('#confirm_password')).toBeVisible();
  });

  test('shows "Zapisz zmiany" and "Zmień hasło" submit buttons', async ({ page }) => {
    await page.goto('/account/');
    await expect(page.getByRole('button', { name: /Zapisz zmiany/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Zmień has/i })).toBeVisible();
  });

  test('"Powrót" back link goes to the home page', async ({ page }) => {
    await page.goto('/account/');
    const backBtn = page.getByRole('link', { name: /Powrót/i });
    await expect(backBtn).toBeVisible();
    await backBtn.click();
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/^https?:\/\/(localhost|127\.0\.0\.1):8000\/[a-z]{2}\/?$/);
  });
});

// ── Tier-specific: username field ──────────────────────────────────────────
// These mirror the tests in subscription/paywall.spec.ts — they serve as the
// regression guard inside the settings-page suite.

test.describe('Account settings — username field by tier', () => {
  test('FREE user sees a READONLY username input with upgrade hint', async ({ pageFree }) => {
    await pageFree.goto('/account/');
    const usernameInput = pageFree.locator('#username');
    await expect(usernameInput).not.toBeEditable();
    await expect(usernameInput).toHaveAttribute('readonly');
    await expect(pageFree.locator('.form-hint-locked')).toBeVisible();
  });

  test('PLUS user sees an ENABLED username input (no lock)', async ({ pagePlus }) => {
    await pagePlus.goto('/account/');
    await expect(pagePlus.locator('#username')).toBeEnabled();
    await expect(pagePlus.locator('.form-hint-locked')).not.toBeAttached();
  });

  test('PREMIUM user sees an ENABLED username input (no lock)', async ({ pagePremium }) => {
    await pagePremium.goto('/account/');
    await expect(pagePremium.locator('#username')).toBeEnabled();
    await expect(pagePremium.locator('.form-hint-locked')).not.toBeAttached();
  });
});
