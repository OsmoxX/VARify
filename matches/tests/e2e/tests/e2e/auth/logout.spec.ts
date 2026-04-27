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

    test('clicking logout link in user menu redirects to login page', async ({ page }) => {
        // Open the user dropdown menu
        await page.getByRole('button', { name: 'Menu użytkownika' }).click();

        // Click the logout link
        const logoutLink = page.getByRole('link', { name: /Wyloguj/i });
        await expect(logoutLink).toBeVisible();
        await logoutLink.click();
        await page.waitForLoadState('networkidle');

        // Should be redirected to login
        await expect(page).toHaveURL(/\/login\//);
    });

    test('after logout, visiting home page redirects back to login', async ({ page }) => {
        // Logout via user menu
        await page.getByRole('button', { name: 'Menu użytkownika' }).click();
        await page.getByRole('link', { name: /Wyloguj/i }).click();
        await page.waitForLoadState('networkidle');

        // Now try going home — should redirect to login (LoginRequiredMiddleware)
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        await expect(page).toHaveURL(/\/login\//);
    });
});
