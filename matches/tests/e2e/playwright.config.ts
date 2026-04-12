import { defineConfig, devices } from '@playwright/test';
import dns from 'node:dns';
import path from 'node:path';
dns.setDefaultResultOrder('ipv4first');

// ── Auth state file paths ─────────────────────────────────────────────────
const AUTH_FREE    = path.join(__dirname, 'playwright/.auth/user-free.json');
const AUTH_PLUS    = path.join(__dirname, 'playwright/.auth/user-plus.json');
const AUTH_PREMIUM = path.join(__dirname, 'playwright/.auth/user-premium.json');

/**
 * VARify E2E Test Configuration
 *
 * Auth strategy:
 *  - `setup` project runs global-setup.ts, which logs in all 3 tier users
 *    and saves their sessions to playwright/.auth/user-{free,plus,premium}.json
 *  - Browser projects all depend on `setup`.
 *  - Tests use the default `user-free.json` session (the most restrictive).
 *  - Tests that need a specific tier import `pageFree`, `pagePlus`, or
 *    `pagePremium` from fixtures.ts — these lazily open a fresh context
 *    with the correct storageState for each tier.
 *  - Tests inside auth/ override storageState to `undefined` (fresh session).
 *
 * Docs: https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html'], ['list']],

  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:8000',
    locale: 'pl-PL',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Ignore self-signed cert errors when testing against nip.io / HTTPS proxy
    ignoreHTTPSErrors: true,
  },

  projects: [
    // ── 1. Auth Setup (runs once, creates all 3 tier sessions) ─────────────
    {
      name: 'setup',
      testMatch: '**/global-setup.ts',
      timeout: 90_000, // generous for 3 sequential logins
    },

    // ── 2. Chromium — default session is FREE (most restrictive) ───────────
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: AUTH_FREE,
      },
      dependencies: ['setup'],
    },

    // ── 3. Firefox ─────────────────────────────────────────────────────────
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        storageState: AUTH_FREE,
      },
      dependencies: ['setup'],
    },

    // ── 4. WebKit / Safari ─────────────────────────────────────────────────
    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
        storageState: AUTH_FREE,
      },
      dependencies: ['setup'],
    },

    // ── 5. Mobile Chrome ──────────────────────────────────────────────────
    {
      name: 'Mobile Chrome',
      use: {
        ...devices['Pixel 5'],
        storageState: AUTH_FREE,
      },
      dependencies: ['setup'],
    },
  ],
});
