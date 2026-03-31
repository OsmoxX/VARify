import { defineConfig, devices } from '@playwright/test';
import dns from 'node:dns';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
dns.setDefaultResultOrder('ipv4first');

const AUTH_FILE = join(__dirname, 'playwright/.auth/user.json');

// Check if the auth file has a real session (size > empty JSON placeholder)
const hasSession = existsSync(AUTH_FILE) && require(AUTH_FILE).cookies?.length > 0;

/**
 * VARify E2E Test Configuration
 * Docs: https://playwright.dev/docs/test-configuration
 *
 * Auth strategy:
 *  - `setup` project logs in once and stores the session to playwright/.auth/user.json
 *  - All browser projects depend on `setup` and reuse that session via storageState
 *  - Tests inside auth/ folder override storageState to `undefined` (fresh session)
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',

  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:8000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
},

  projects: [
    // ─── 1. Auth Setup (runs once before everything else) ────────────────────
    {
      name: 'setup',
      testMatch: '**/global-setup.ts',
    },

    // ─── 2. Chromium (authenticated) ─────────────────────────────────────────
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: AUTH_FILE,
      },
      dependencies: ['setup'],
    },

    // ─── 3. Firefox (authenticated) ──────────────────────────────────────────
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        storageState: AUTH_FILE,
      },
      dependencies: ['setup'],
    },

    // ─── 4. WebKit / Safari (authenticated) ──────────────────────────────────
    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
        storageState: AUTH_FILE,
      },
      dependencies: ['setup'],
    },

    // ─── 5. Mobile Chrome (authenticated) ────────────────────────────────────
    {
      name: 'Mobile Chrome',
      use: {
        ...devices['Pixel 5'],
        storageState: AUTH_FILE,
      },
      dependencies: ['setup'],
    },
  ],
});
