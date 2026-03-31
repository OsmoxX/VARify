/**
 * fixtures.ts — VARify shared Playwright fixtures
 *
 * Exports:
 *   test     — base test extended with `page` that always waits for networkidle on goto()
 *   expect   — re-exported from @playwright/test
 *   BASE_URL — convenience constant for the app base URL
 */

import { test as base, Page } from '@playwright/test';

export const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:8000';

/**
 * Extended `test` fixture.
 * Overrides `page.goto()` to always wait for `networkidle` so CSS/JS are
 * fully loaded before assertions run — no need to add waitForLoadState() calls everywhere.
 */
export const test = base.extend<{ page: Page }>({
    page: async ({ page }, use) => {
        const originalGoto = page.goto.bind(page);
        page.goto = (url: string, options?: Parameters<Page['goto']>[1]) => {
            return originalGoto(url, { waitUntil: 'networkidle', ...options });
        };
        await use(page);
    },
});

export { expect } from '@playwright/test';
