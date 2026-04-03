/**
 * subscription/paywall.spec.ts
 *
 * E2E tests for the VARify "Soft Paywall" UX.
 *
 * Covers:
 *  1. Search bar — locked for FREE, unlocked for PLUS/PREMIUM
 *  2. Lineups tab paywall — visible for FREE, unlocked for PLUS/PREMIUM
 *  3. Stats tab paywall   — visible for FREE and PLUS, unlocked for PREMIUM
 *  4. All paywall upgrade buttons redirect to /subscribe/
 *  5. Username field — disabled for FREE, enabled for PLUS/PREMIUM
 *
 * Uses the tier fixtures from fixtures.ts:
 *   pageFree, pagePlus, pagePremium
 *
 * A real match URL is resolved once via the API before each group so tests
 * are not tightly coupled to a specific ID. If no matches exist, the
 * match-detail tests skip gracefully.
 */

import { test, expect } from '../fixtures';

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Fetch the URL of the first available live or upcoming match.
 * Returns null if the database is empty (CI without fixture data).
 */
async function resolveMatchUrl(page: import('@playwright/test').Page): Promise<string | null> {
  const res = await page.request.get('/api/live-matches/');
  if (res.ok()) {
    const data = await res.json();
    const results: Array<{ id: number }> = data.results ?? data;
    if (Array.isArray(results) && results.length > 0) {
      return `/match/${results[0].id}/`;
    }
  }
  return null;
}

// ── 1. NAVBAR SEARCH BAR ───────────────────────────────────────────────────
test.describe('Navbar search bar — tier access', () => {

  test('FREE user sees a locked/disabled search input', async ({ pageFree }) => {
    await pageFree.goto('/');
    const lockedBar = pageFree.locator('[data-testid="locked-search-bar"]');
    await expect(lockedBar).toBeVisible();

    const disabledInput = pageFree.locator('[data-testid="search-input-locked"]');
    await expect(disabledInput).toBeDisabled();
  });

  test('FREE user — hovering locked bar reveals tooltip with upgrade link', async ({ pageFree }) => {
    await pageFree.goto('/');
    const lockedBar = pageFree.locator('[data-testid="locked-search-bar"]');
    await lockedBar.hover();

    const tooltip = pageFree.locator('[data-testid="search-lock-tooltip"]');
    await expect(tooltip).toBeVisible();

    const upgradeBtn = pageFree.locator('[data-testid="search-upgrade-btn"]');
    await expect(upgradeBtn).toBeVisible();
    await expect(upgradeBtn).toHaveAttribute('href', /\/subscribe\//);
  });

  test('FREE user — clicking "Ulepsz teraz" in tooltip navigates to /subscribe/', async ({ pageFree }) => {
    await pageFree.goto('/');
    const lockedBar = pageFree.locator('[data-testid="locked-search-bar"]');
    await lockedBar.hover();
    await pageFree.locator('[data-testid="search-upgrade-btn"]').click();
    await expect(pageFree).toHaveURL(/\/subscribe\//);
  });

  test('PLUS user sees a functional (enabled) search bar', async ({ pagePlus }) => {
    await pagePlus.goto('/');
    const search = pagePlus.locator('#live-search-input');
    await expect(search).toBeVisible();
    await expect(search).toBeEnabled();
    // Locked bar must NOT be present
    await expect(pagePlus.locator('[data-testid="locked-search-bar"]')).not.toBeVisible();
  });

  test('PREMIUM user sees a functional (enabled) search bar', async ({ pagePremium }) => {
    await pagePremium.goto('/');
    const search = pagePremium.locator('#live-search-input');
    await expect(search).toBeVisible();
    await expect(search).toBeEnabled();
    await expect(pagePremium.locator('[data-testid="locked-search-bar"]')).not.toBeVisible();
  });
});

// ── 2. MATCH DETAIL — LINEUPS TAB (PLUS gate) ─────────────────────────────
test.describe('Match detail — Składy tab paywall (FREE blocked, PLUS+ unlocked)', () => {
  let matchUrl: string | null = null;

  test.beforeAll(async ({ browser }) => {
    const ctx  = await browser.newContext({ storageState: 'playwright/.auth/user-free.json' });
    const page = await ctx.newPage();
    matchUrl   = await resolveMatchUrl(page);
    await ctx.close();
  });

  test('FREE user sees blur + paywall overlay on Składy tab', async ({ pageFree }) => {
    if (!matchUrl) test.skip();
    await pageFree.goto(matchUrl!);
    await pageFree.getByRole('button', { name: /Składy/i }).click();

    const paywall = pageFree.locator('[data-testid="paywall-lineups"]');
    await expect(paywall).toBeVisible();

    const overlay = pageFree.locator('[data-testid="paywall-lineups-overlay"]');
    await expect(overlay).toBeVisible();
    await expect(overlay).toContainText(/PLUS/i);
  });

  test('FREE user — Składy upgrade btn redirects to /subscribe/', async ({ pageFree }) => {
    if (!matchUrl) test.skip();
    await pageFree.goto(matchUrl!);
    await pageFree.getByRole('button', { name: /Składy/i }).click();

    const upgradeBtn = pageFree.locator('[data-testid="paywall-lineups-upgrade-btn"]');
    await expect(upgradeBtn).toBeVisible();
    await upgradeBtn.click();
    await expect(pageFree).toHaveURL(/\/subscribe\//);
  });

  test('PLUS user sees real lineups content (no paywall overlay)', async ({ pagePlus }) => {
    if (!matchUrl) test.skip();
    await pagePlus.goto(matchUrl!);
    await pagePlus.getByRole('button', { name: /Składy/i }).click();

    // Paywall must NOT be present
    await expect(pagePlus.locator('[data-testid="paywall-lineups"]')).not.toBeAttached();

    // Real lineups content must be visible
    const lineupsTab = pagePlus.locator('#lineups-tab');
    await expect(lineupsTab).toBeVisible();
  });

  test('PREMIUM user sees real lineups content (no paywall overlay)', async ({ pagePremium }) => {
    if (!matchUrl) test.skip();
    await pagePremium.goto(matchUrl!);
    await pagePremium.getByRole('button', { name: /Składy/i }).click();

    await expect(pagePremium.locator('[data-testid="paywall-lineups"]')).not.toBeAttached();
    await expect(pagePremium.locator('#lineups-tab')).toBeVisible();
  });
});

// ── 3. MATCH DETAIL — STATS TAB (PREMIUM gate) ────────────────────────────
test.describe('Match detail — Statystyki tab paywall (FREE+PLUS blocked, PREMIUM unlocked)', () => {
  let matchUrl: string | null = null;

  test.beforeAll(async ({ browser }) => {
    const ctx  = await browser.newContext({ storageState: 'playwright/.auth/user-free.json' });
    const page = await ctx.newPage();
    matchUrl   = await resolveMatchUrl(page);
    await ctx.close();
  });

  test('FREE user sees PREMIUM crown banner on Statystyki tab', async ({ pageFree }) => {
    if (!matchUrl) test.skip();
    await pageFree.goto(matchUrl!);
    await pageFree.getByRole('button', { name: /Statystyki/i }).click();

    const banner = pageFree.locator('[data-testid="paywall-stats"]');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(/PREMIUM/i);
  });

  test('PLUS user still sees PREMIUM crown banner on Statystyki tab', async ({ pagePlus }) => {
    if (!matchUrl) test.skip();
    await pagePlus.goto(matchUrl!);
    await pagePlus.getByRole('button', { name: /Statystyki/i }).click();

    const banner = pagePlus.locator('[data-testid="paywall-stats"]');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(/PREMIUM/i);
  });

  test('PLUS user — stats upgrade btn redirects to /subscribe/', async ({ pagePlus }) => {
    if (!matchUrl) test.skip();
    await pagePlus.goto(matchUrl!);
    await pagePlus.getByRole('button', { name: /Statystyki/i }).click();

    const upgradeBtn = pagePlus.locator('[data-testid="paywall-stats-upgrade-btn"]');
    await expect(upgradeBtn).toBeVisible();
    await upgradeBtn.click();
    await expect(pagePlus).toHaveURL(/\/subscribe\//);
  });

  test('PREMIUM user sees real stats content (no crown banner)', async ({ pagePremium }) => {
    if (!matchUrl) test.skip();
    await pagePremium.goto(matchUrl!);
    await pagePremium.getByRole('button', { name: /Statystyki/i }).click();

    // Crown paywall must NOT exist
    await expect(pagePremium.locator('[data-testid="paywall-stats"]')).not.toBeAttached();
    await expect(pagePremium.locator('#stats-tab')).toBeVisible();
  });
});

// ── 4. ACCOUNT SETTINGS — USERNAME FIELD ──────────────────────────────────
test.describe('Account settings — username field tier access', () => {

  test('FREE user — username field is disabled', async ({ pageFree }) => {
    await pageFree.goto('/account/');
    const usernameInput = pageFree.locator('#username');
    await expect(usernameInput).toBeDisabled();
  });

  test('FREE user — upgrade hint text is visible near username field', async ({ pageFree }) => {
    await pageFree.goto('/account/');
    const hint = pageFree.locator('.form-hint-locked');
    await expect(hint).toBeVisible();
    await expect(hint).toContainText(/PLUS/i);
  });

  test('PLUS user — username field is enabled and editable', async ({ pagePlus }) => {
    await pagePlus.goto('/account/');
    const usernameInput = pagePlus.locator('#username');
    await expect(usernameInput).toBeEnabled();
  });

  test('PREMIUM user — username field is enabled and editable', async ({ pagePremium }) => {
    await pagePremium.goto('/account/');
    const usernameInput = pagePremium.locator('#username');
    await expect(usernameInput).toBeEnabled();
  });
});
