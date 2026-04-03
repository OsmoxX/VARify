/**
 * matches/match_detail.spec.ts
 *
 * Tests the match detail page: tabs, back button navigation, search.
 *
 * The default session is FREE tier (set in playwright.config.ts).
 * Paywall-specific assertions (blur overlays, crown banner) live in
 * subscription/paywall.spec.ts.
 *
 * NOTE: Tests navigate to a real match URL resolved via the API.
 * If the database is empty (e.g., CI without fixture data) tests skip.
 */

import { test, expect } from '../fixtures';

// ── Helpers ────────────────────────────────────────────────────────────────
const BASE_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1):8000\//;

// ── Navigation via live search ─────────────────────────────────────────────
test.describe('Match detail — navigation via search', () => {
  // The search bar is gated for FREE users. PLUS session is needed to type.
  test('PLUS user can search for a team and navigate to its match', async ({ pagePlus }) => {
    await pagePlus.goto('/');

    const searchInput = pagePlus.locator('#live-search-input');
    await expect(searchInput).toBeVisible();

    await searchInput.fill('Manchester');
    await pagePlus.waitForTimeout(600); // debounce

    const dropdown    = pagePlus.locator('#search-results-dropdown');
    const firstResult = dropdown.locator('a.search-item').first();
    const hasResults  = (await firstResult.count()) > 0;

    if (hasResults) {
      await firstResult.click();
      await pagePlus.waitForLoadState('networkidle');
      await expect(pagePlus).not.toHaveURL(/^https?:\/\/(localhost|127\.0\.0\.1):8000\/$/);
    } else {
      test.skip();
    }
  });
});

// ── Direct URL (resolved from API) ────────────────────────────────────────
test.describe('Match detail page — direct URL', () => {
  let matchUrl: string | null = null;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext({
      storageState: 'playwright/.auth/user-free.json',
    });
    const page = await context.newPage();

    const response = await page.request.get('/api/live-matches/');
    if (response.ok()) {
      const data    = await response.json();
      const results = data.results ?? data;
      if (Array.isArray(results) && results.length > 0) {
        matchUrl = `/match/${results[0].id}/`;
      }
    }
    await context.close();
  });

  test('shows home and away team names in the scoreboard', async ({ page }) => {
    if (!matchUrl) test.skip();
    await page.goto(matchUrl!);

    const scoreboard = page.locator('.scoreboard-header');
    await expect(scoreboard).toBeVisible();
    await expect(scoreboard.locator('.team-name-lg').first()).toBeVisible();
    await expect(scoreboard.locator('.team-name-lg').last()).toBeVisible();
  });

  test('shows all three tab buttons: Oś czasu, Składy, Statystyki', async ({ page }) => {
    if (!matchUrl) test.skip();
    await page.goto(matchUrl!);

    await expect(page.getByRole('button', { name: /Oś czasu/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Składy/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Statystyki/i })).toBeVisible();
  });

  test('timeline tab is active by default; Składy tab is hidden', async ({ page }) => {
    if (!matchUrl) test.skip();
    await page.goto(matchUrl!);

    await expect(page.locator('#timeline-tab')).toBeVisible();
    await expect(page.locator('#lineups-tab')).not.toBeVisible();
  });

  test('clicking Składy tab hides timeline and shows lineups area', async ({ page }) => {
    if (!matchUrl) test.skip();
    await page.goto(matchUrl!);

    await page.getByRole('button', { name: /Składy/i }).click();

    await expect(page.locator('#lineups-tab')).toBeVisible();
    await expect(page.locator('#timeline-tab')).not.toBeVisible();
  });

  test('FREE user — Składy tab shows paywall overlay (not real lineups)', async ({ page }) => {
    if (!matchUrl) test.skip();
    await page.goto(matchUrl!);

    await page.getByRole('button', { name: /Składy/i }).click();

    // Paywall must be visible for FREE users
    await expect(page.locator('[data-testid="paywall-lineups"]')).toBeVisible();
  });

  test('clicking Statystyki tab shows that tab panel', async ({ page }) => {
    if (!matchUrl) test.skip();
    await page.goto(matchUrl!);

    await page.getByRole('button', { name: /Statystyki/i }).click();
    await expect(page.locator('#stats-tab')).toBeVisible();
  });

  test('FREE user — Statystyki tab shows PREMIUM crown banner', async ({ page }) => {
    if (!matchUrl) test.skip();
    await page.goto(matchUrl!);

    await page.getByRole('button', { name: /Statystyki/i }).click();
    await expect(page.locator('[data-testid="paywall-stats"]')).toBeVisible();
  });

  test('"Wróć do wyników" back button navigates to home page', async ({ page }) => {
    if (!matchUrl) test.skip();
    await page.goto(matchUrl!);

    const backBtn = page.getByRole('link', { name: /Wróć do wyników/i });
    await expect(backBtn).toBeVisible();
    await backBtn.click();
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(BASE_PATTERN);
  });
});
