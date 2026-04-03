/**
 * global-setup.ts
 *
 * Runs once before all tests (the `setup` project in playwright.config.ts).
 * Creates THREE authenticated browser sessions — one per subscription tier:
 *
 *   playwright/.auth/user-free.json    ← FREE tier user
 *   playwright/.auth/user-plus.json    ← PLUS tier user
 *   playwright/.auth/user-premium.json ← PREMIUM tier user
 *
 * Required env vars (with defaults for local dev):
 *   E2E_USERNAME_FREE    / E2E_PASSWORD_FREE    (default: e2e_free_user)
 *   E2E_USERNAME_PLUS    / E2E_PASSWORD_PLUS    (default: e2e_plus_user)
 *   E2E_USERNAME_PREMIUM / E2E_PASSWORD_PREMIUM (default: e2e_premium_user)
 *
 * Before running, seed the users:
 *   docker compose exec web python manage.py create_e2e_users
 */

import { chromium, expect, test } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:8000';

const USERS = [
  {
    label: 'FREE',
    username: process.env.E2E_USERNAME_FREE     ?? 'e2e_free_user',
    password: process.env.E2E_PASSWORD_FREE     ?? 'E2e!Free2024#',
    authFile: path.join(process.cwd(), 'playwright/.auth/user-free.json'),
  },
  {
    label: 'PLUS',
    username: process.env.E2E_USERNAME_PLUS     ?? 'e2e_plus_user',
    password: process.env.E2E_PASSWORD_PLUS     ?? 'E2e!Plus2024#',
    authFile: path.join(process.cwd(), 'playwright/.auth/user-plus.json'),
  },
  {
    label: 'PREMIUM',
    username: process.env.E2E_USERNAME_PREMIUM  ?? 'e2e_premium_user',
    password: process.env.E2E_PASSWORD_PREMIUM  ?? 'E2e!Premium2024#',
    authFile: path.join(process.cwd(), 'playwright/.auth/user-premium.json'),
  },
] as const;

// ── Helper: login one user and persist auth state ─────────────────────────
async function loginAndSave(
  username: string,
  password: string,
  authFile: string,
  label: string,
): Promise<void> {
  const authDir = path.dirname(authFile);
  if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page    = await context.newPage();

  console.log(`[Setup][${label}] → ${BASE_URL}/login/`);
  await page.goto(`${BASE_URL}/login/`, { waitUntil: 'networkidle' });
  await page.locator('#id_username').waitFor({ state: 'visible' });

  await page.locator('#id_username').fill(username);
  await page.locator('#id_password').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForLoadState('networkidle');

  // Guard: must have left the login page
  await expect(page, `[${label}] Login redirect failed for "${username}"`).not.toHaveURL(/\/login\//);

  await context.storageState({ path: authFile });
  console.log(`[Setup][${label}] ✅  session saved → ${path.basename(authFile)}`);
  await browser.close();
}

// ── Setup test: runs all three logins sequentially ────────────────────────
test('authenticate all tier users', async () => {
  for (const user of USERS) {
    await loginAndSave(user.username, user.password, user.authFile, user.label);
  }
});
