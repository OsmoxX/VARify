/**
 * global-setup.ts
 *
 * Runs once before all tests (as the `setup` project in playwright.config.ts).
 * Logs in with username/password credentials from env vars and saves the
 * authenticated browser session to playwright/.auth/user.json so that
 * all other test projects can reuse it via storageState — no re-login needed.
 *
 * Required env vars:
 *   E2E_USERNAME  — Django username (e.g. test_fan_99)
 *   E2E_PASSWORD  — Django password (e.g. Strong!Password123#)
 */

import { chromium, expect, test } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

const AUTH_FILE = path.join(process.cwd(), 'playwright/.auth/user.json');

test('authenticate and save session', async () => {
  // Używamy domyślnych danych logowania, jeżeli zmienne środowiskowe nie są ustawione
  const username = process.env.E2E_USERNAME ?? 'test_fan_99';
  const password = process.env.E2E_PASSWORD ?? 'Strong!Password123#';

  if (!username || !password) {
    throw new Error(
      'Missing E2E_USERNAME or E2E_PASSWORD environment variables.\n' +
      'Run with: E2E_USERNAME=youruser E2E_PASSWORD=yourpassword npx playwright test'
    );
  }

  // Ensure the auth directory exists
  const authDir = path.dirname(AUTH_FILE);
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  // Navigate to login and authenticate
  await page.goto('http://127.0.0.1:8000/login/', { waitUntil: 'networkidle' });

  await page.locator('#id_username').fill(username);
  await page.locator('#id_password').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForLoadState('networkidle');

  // Verify login was successful (should be on home page, not login)
  await expect(page).not.toHaveURL(/\/login\//);

  // Save cookies + localStorage so other tests skip logging in
  await context.storageState({ path: AUTH_FILE });

  await browser.close();
});
