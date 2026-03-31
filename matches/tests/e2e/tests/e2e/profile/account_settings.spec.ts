/**
 * profile/account_settings.spec.ts
 *
 * Tests the account settings page (/account/).
 * Uses the shared authenticated session.
 */

import { test, expect } from '../fixtures';

test.describe('Account settings page — access control', () => {
    test('unauthenticated user is redirected to login when visiting /account/', async ({ browser }) => {
        const freshContext = await browser.newContext({ storageState: { cookies: [], origins: [] } });
        const page = await freshContext.newPage();

        await page.goto('/account/');
        await page.waitForLoadState('networkidle');

        await expect(page).toHaveURL(/\/login\//);
        await freshContext.close();
    });
});

test.describe('Account settings page — authenticated', () => {
    test('loads the account settings page successfully', async ({ page }) => {
        await page.goto('/account/');

        await expect(page).toHaveTitle(/Ustawienia konta|VARify/i);
        // Target the specific subtitle paragraph, not the nav dropdown link
        // (getByText('Ustawienia konta') would match 2 elements — strict mode violation)
        await expect(page.locator('p.account-subtitle')).toBeVisible();
    });

    test('shows the profile data section with username and email inputs', async ({ page }) => {
        await page.goto('/account/');

        // Profile section heading
        await expect(page.getByText(/Dane profilu/i)).toBeVisible();

        // Username and email fields
        await expect(page.locator('#username')).toBeVisible();
        await expect(page.locator('#email')).toBeVisible();
    });

    test('username field is pre-filled with the logged-in user\'s name', async ({ page }) => {
        await page.goto('/account/');

        const usernameInput = page.locator('#username');
        const value = await usernameInput.inputValue();
        // The field should not be empty — it should contain the actual username
        expect(value.length).toBeGreaterThan(0);
    });

    test('shows the change password section with all three password fields', async ({ page }) => {
        await page.goto('/account/');

        // Password section heading
        await expect(page.getByText(/Zmiana hasła/i)).toBeVisible();

        // All three password inputs
        await expect(page.locator('#current_password')).toBeVisible();
        await expect(page.locator('#new_password')).toBeVisible();
        await expect(page.locator('#confirm_password')).toBeVisible();
    });

    test('shows "Zapisz zmiany" and "Zmień hasło" submit buttons', async ({ page }) => {
        await page.goto('/account/');

        await expect(page.getByRole('button', { name: /Zapisz zmiany/i })).toBeVisible();
        await expect(page.getByRole('button', { name: /Zmień hasło/i })).toBeVisible();
    });

    test('"Powrót" back link goes to the home page', async ({ page }) => {
        await page.goto('/account/');

        const backBtn = page.getByRole('link', { name: /Powrót/i });
        await expect(backBtn).toBeVisible();
        await backBtn.click();
        await page.waitForLoadState('networkidle');

        await expect(page).toHaveURL(/^http:\/\/(localhost|127\.0\.0\.1):8000\//);
    });
});
