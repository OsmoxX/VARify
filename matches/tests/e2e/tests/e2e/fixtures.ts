/**
 * fixtures.ts — VARify shared Playwright fixtures
 *
 * Exports:
 *   test        — base test with `page` (auto networkidle), plus tier fixtures
 *   pageFree    — page authenticated as FREE user
 *   pagePlus    — page authenticated as PLUS user
 *   pagePremium — page authenticated as PREMIUM user
 *   expect      — re-exported from @playwright/test
 *   BASE_URL    — convenience constant
 *   AUTH_FREE / AUTH_PLUS / AUTH_PREMIUM — paths to auth state files
 */

import { test as base, Page, BrowserContext } from '@playwright/test';
import path from 'node:path';

export const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:8000';

// ── Auth state file paths ──────────────────────────────────────────────────
export const AUTH_FREE    = path.join(process.cwd(), 'playwright/.auth/user-free.json');
export const AUTH_PLUS    = path.join(process.cwd(), 'playwright/.auth/user-plus.json');
export const AUTH_PREMIUM = path.join(process.cwd(), 'playwright/.auth/user-premium.json');

// ── Fixture type definitions ───────────────────────────────────────────────
type TierFixtures = {
  /** Page pre-authenticated as the FREE tier user. */
  pageFree: Page;
  /** Page pre-authenticated as the PLUS tier user. */
  pagePlus: Page;
  /** Page pre-authenticated as the PREMIUM tier user. */
  pagePremium: Page;
};

// ── Helper: wrap page.goto to always wait for networkidle ──────────────────
function patchGoto(page: Page): Page {
  const originalGoto = page.goto.bind(page);
  page.goto = (url: string, options?: Parameters<Page['goto']>[1]) =>
    originalGoto(url, { waitUntil: 'networkidle', ...options });
  return page;
}

// ── Helper: create a context+page for a given storageState file ────────────
async function pageForTier(
  storageState: string,
  browser: import('@playwright/test').Browser,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ storageState });
  const page = patchGoto(await context.newPage());
  return { context, page };
}

/**
 * Extended `test` fixture.
 * Adds `pageFree`, `pagePlus`, `pagePremium` alongside the stock `page`.
 */
export const test = base.extend<{ page: Page } & TierFixtures>({
  // Override base `page` to auto-wait for networkidle
  page: async ({ page }, use) => {
    await use(patchGoto(page));
  },

  // FREE tier page
  pageFree: async ({ browser }, use) => {
    const { context, page } = await pageForTier(AUTH_FREE, browser);
    await use(page);
    await context.close();
  },

  // PLUS tier page
  pagePlus: async ({ browser }, use) => {
    const { context, page } = await pageForTier(AUTH_PLUS, browser);
    await use(page);
    await context.close();
  },

  // PREMIUM tier page
  pagePremium: async ({ browser }, use) => {
    const { context, page } = await pageForTier(AUTH_PREMIUM, browser);
    await use(page);
    await context.close();
  },
});

export { expect } from '@playwright/test';
