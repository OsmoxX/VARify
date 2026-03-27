// matches/tests/e2e/test_auth_flow.spec.ts

import { test, expect } from './fixtures';
    // --- LOGOWANIE ---
    test('Log in with the account', async ({ page }) => {
        const myUsername = 'test_fan_99';
        const myPassword = 'Strong!Password123#';
        await page.goto('/login/');
        // Wpisujemy nasze stałe dane
        await page.locator('#id_username').fill(myUsername);
        await page.locator('#id_password').fill(myPassword);
        
        // Klikamy przycisk logowania
        await page.getByRole('button', { name: 'Sign In' }).click();
        await page.waitForLoadState('networkidle');

        // Sprawdzamy, czy weszliśmy na stronę główną
        await expect(page).toHaveURL(/(\/$)|(\/dashboard\/)/);
        await page.getByRole('button', { name: 'Menu użytkownika' }).click();
        await page.waitForLoadState('networkidle');
        // Sprawdzamy, czy pojawił się przycisk wylogowania
        const logoutButton = page.getByRole('link', { name: /Logout|Wyloguj/i });
        await expect(logoutButton).toBeVisible();
    });
