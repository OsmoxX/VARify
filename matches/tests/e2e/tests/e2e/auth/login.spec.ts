/**
 * auth/login.spec.ts
 *
 * Tests the login page and authentication flow.
 * These tests intentionally use a FRESH session (no storageState) — they are
 * testing the auth flow itself, so they must not be pre-authenticated.
 *
 * Playwright config sets storageState globally, but this file overrides it
 * via `test.use({ storageState: undefined })`.
 */

import { test, expect } from '../fixtures';

// Override: do NOT use the shared authenticated session for auth tests
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Login page — UI', () => {
    test('renders login form with username, password fields and Sign In button', async ({ page }) => {
        await page.goto('/login/');

        await expect(page).toHaveTitle(/VARify/);
        await expect(page.locator('#id_username')).toBeVisible();
        await expect(page.locator('#id_password')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
    });

    test('shows link to registration page', async ({ page }) => {
        await page.goto('/login/');

        const registerLink = page.getByRole('link', { name: /Create one now/i });
        await expect(registerLink).toBeVisible();
        await registerLink.click();
        await expect(page).toHaveURL(/\/register\//);
    });
});

test.describe('Login flow — successful', () => {
    test('logs in with valid credentials and redirects to home', async ({ page }) => {
        const username = process.env.E2E_USERNAME ?? 'test_fan_99';
        const password = process.env.E2E_PASSWORD ?? 'Strong!Password123#';

        await page.goto('/login/');
        await page.locator('#id_username').fill(username);
        await page.locator('#id_password').fill(password);
        await page.getByRole('button', { name: 'Sign In' }).click();
        await page.waitForLoadState('networkidle');

        // Should be redirected away from login
        await expect(page).not.toHaveURL(/\/login\//);
    });

    test('after login, user avatar button is visible in the navbar', async ({ page }) => {
        const username = process.env.E2E_USERNAME ?? 'test_fan_99';
        const password = process.env.E2E_PASSWORD ?? 'Strong!Password123#';

        await page.goto('/login/');
        await page.locator('#id_username').fill(username);
        await page.locator('#id_password').fill(password);
        await page.getByRole('button', { name: 'Sign In' }).click();
        await page.waitForLoadState('networkidle');

        // User menu button should be visible
        const userMenuBtn = page.getByRole('button', { name: 'Menu użytkownika' });
        await expect(userMenuBtn).toBeVisible();
    });

    test('after login, opening user menu shows logout link', async ({ page }) => {
        const username = process.env.E2E_USERNAME ?? 'test_fan_99';
        const password = process.env.E2E_PASSWORD ?? 'Strong!Password123#';

        await page.goto('/login/');
        await page.locator('#id_username').fill(username);
        await page.locator('#id_password').fill(password);
        await page.getByRole('button', { name: 'Sign In' }).click();
        await page.waitForLoadState('networkidle');

        await page.getByRole('button', { name: 'Menu użytkownika' }).click();

        const logoutLink = page.getByRole('link', { name: /Wyloguj/i });
        await expect(logoutLink).toBeVisible();
    });
});

test.describe('Login flow — validation errors', () => {
    test('shows error when using wrong password', async ({ page }) => {
        await page.goto('/login/');
        await page.locator('#id_username').fill('test_fan_99');
        await page.locator('#id_password').fill('WrongPassword!999');
        await page.getByRole('button', { name: 'Sign In' }).click();
        await page.waitForLoadState('networkidle');

        // Should stay on login page and show error
        await expect(page).toHaveURL(/\/login\//);
        const errorList = page.locator('.errorlist');
        await expect(errorList).toBeVisible();
    });

    test('shows error when submitting empty form', async ({ page }) => {
        await page.goto('/login/');
        await page.getByRole('button', { name: 'Sign In' }).click();
        await page.waitForLoadState('networkidle');

        await expect(page).toHaveURL(/\/login\//);
    });
});
