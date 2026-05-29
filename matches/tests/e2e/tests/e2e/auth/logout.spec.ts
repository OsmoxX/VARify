/**
 * auth/logout.spec.ts
 *
 * Tests the logout flow for an authenticated user.
 * Uses a fresh login (not storageState) to test the full logout cycle cleanly.
 */

import { test, expect } from '../fixtures';

// Top-level test.use() removed to avoid UI Mode scoping errors

test.describe('Logout flow', () => {
    test.use({ storageState: { cookies: [], origins: [] } });
    /**
     * Helper: log in before each test in this describe block.
     */
    test.beforeEach(async ({ page }) => {
        const username = process.env.E2E_USERNAME ?? 'e2e_free_user';
        const password = process.env.E2E_PASSWORD ?? 'E2e!Free2024#';

        await page.goto('/login/');
        await page.locator('#id_username').fill(username);
        await page.locator('#id_password').fill(password);
        await page.locator('.btn-submit').click();
        await page.waitForLoadState('networkidle');
    });

    test('clicking logout link in user menu logs the user out and lands on a guest page', async ({ page }) => {
        // Open the user dropdown menu
        await page.getByRole('button', { name: 'Menu użytkownika' }).click();

        // Click the logout link
        const logoutLink = page.getByRole('link', { name: /Wyloguj/i });
        await expect(logoutLink).toBeVisible();
        await logoutLink.click();
        await page.waitForLoadState('networkidle');

        // Logout redirects to the (now guest-accessible) home page, NOT to /login/.
        await expect(page).not.toHaveURL(/\/login\//);
        // The navbar now shows the guest "Zaloguj" link instead of the user menu.
        await expect(page.getByRole('link', { name: /Zaloguj/i })).toBeVisible();
    });

    test('after logout, the home page is accessible as a guest', async ({ page }) => {
        // Logout via user menu
        await page.getByRole('button', { name: 'Menu użytkownika' }).click();
        await page.getByRole('link', { name: /Wyloguj/i }).click();
        await page.waitForLoadState('networkidle');

        // Home is open to guests now — no redirect to login.
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        await expect(page).not.toHaveURL(/\/login\//);
        await expect(page.getByRole('link', { name: /Zaloguj/i })).toBeVisible();
    });
});
