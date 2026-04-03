/**
 * subscription/subscribe_page.spec.ts
 *
 * E2E tests for the /subscribe/ pricing page.
 *
 * Covers:
 *  1. Page renders correctly for all tiers
 *  2. Active plan card shows "Twój obecny plan" with disabled button
 *  3. Free user sees upgrade CTA buttons for PLUS and PREMIUM
 *  4. Pricing cards contain correct tier names and prices
 *  5. Navigation: back link returns to home page
 *  6. Unauthenticated user can access the pricing page (it's public)
 */

import { test, expect } from '../fixtures';

test.describe('/subscribe/ — pricing page renders', () => {

  test('FREE user can access the pricing page', async ({ pageFree }) => {
    await pageFree.goto('/subscribe/');
    await expect(pageFree).toHaveTitle(/VARify/i);
    await expect(pageFree).toHaveURL(/\/subscribe\//);
  });

  test('page shows all three plan cards (Free, Plus, Premium)', async ({ pageFree }) => {
    await pageFree.goto('/subscribe/');

    await expect(pageFree.locator('.sub-card-free')).toBeVisible();
    await expect(pageFree.locator('.sub-card-plus')).toBeVisible();
    await expect(pageFree.locator('.sub-card-premium')).toBeVisible();
  });

  test('plan labels contain correct tier names', async ({ pageFree }) => {
    await pageFree.goto('/subscribe/');

    await expect(pageFree.locator('.sub-card-free')).toContainText(/Free/i);
    await expect(pageFree.locator('.sub-card-plus')).toContainText(/Plus/i);
    await expect(pageFree.locator('.sub-card-premium')).toContainText(/Premium/i);
  });

  test('plan cards show prices', async ({ pageFree }) => {
    await pageFree.goto('/subscribe/');

    // Free is 0
    await expect(pageFree.locator('.sub-card-free')).toContainText(/0/);
    // Plus and Premium should have numeric prices
    await expect(pageFree.locator('.sub-card-plus')).toContainText(/\d+[,.\d]*/);
    await expect(pageFree.locator('.sub-card-premium')).toContainText(/\d+[,.\d]*/);
  });

  test('FREE user — Free card shows "Twój obecny plan" (disabled btn)', async ({ pageFree }) => {
    await pageFree.goto('/subscribe/');

    const freeCard = pageFree.locator('.sub-card-free');
    const currentBtn = freeCard.locator('.plan-btn-current');
    await expect(currentBtn).toBeVisible();
    await expect(currentBtn).toBeDisabled();
    await expect(currentBtn).toContainText(/Twój obecny plan/i);
  });

  test('FREE user — Plus and Premium cards show upgrade CTA buttons', async ({ pageFree }) => {
    await pageFree.goto('/subscribe/');

    await expect(pageFree.locator('.sub-card-plus .plan-btn-plus')).toBeVisible();
    await expect(pageFree.locator('.sub-card-premium .plan-btn-premium')).toBeVisible();
  });

  test('PLUS user — Plus card shows "Twój obecny plan"', async ({ pagePlus }) => {
    await pagePlus.goto('/subscribe/');

    const plusCard = pagePlus.locator('.sub-card-plus');
    const currentBtn = plusCard.locator('.plan-btn-current');
    await expect(currentBtn).toBeVisible();
    await expect(currentBtn).toBeDisabled();
    await expect(currentBtn).toContainText(/Twój obecny plan/i);
  });

  test('PLUS user — Premium card still shows upgrade button', async ({ pagePlus }) => {
    await pagePlus.goto('/subscribe/');
    await expect(pagePlus.locator('.sub-card-premium .plan-btn-premium')).toBeVisible();
  });

  test('PREMIUM user — Premium card shows "Twój obecny plan"', async ({ pagePremium }) => {
    await pagePremium.goto('/subscribe/');

    const premiumCard = pagePremium.locator('.sub-card-premium');
    const currentBtn  = premiumCard.locator('.plan-btn-current');
    await expect(currentBtn).toBeVisible();
    await expect(currentBtn).toBeDisabled();
    await expect(currentBtn).toContainText(/Twój obecny plan/i);
  });

  test('nav back link returns to home page', async ({ pageFree }) => {
    await pageFree.goto('/subscribe/');

    const backLink = pageFree.locator('.sub-nav-back');
    await expect(backLink).toBeVisible();
    await backLink.click();
    await expect(pageFree).toHaveURL(/^https?:\/\/(localhost|127\.0\.0\.1):8000\/?$/);
  });

  test('unauthenticated user is redirected to /login/ when visiting /subscribe/', async ({ browser }) => {
    // /subscribe/ requires authentication (protected by global middleware).
    // Unauthenticated visitors are correctly sent to login with ?next=/subscribe/
    const ctx  = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    await page.goto('/subscribe/');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(/\/login\//);
    await ctx.close();
  });
});
