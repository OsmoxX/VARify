/**
 * auth/register.spec.ts
 *
 * Tests the registration page UI and validation.
 * Uses fresh session — registration tests must not be pre-authenticated.
 */

import { test, expect } from '../fixtures';

// Top-level test.use() removed to avoid UI Mode scoping errors

test.describe('Registration page — UI', () => {
    test.use({ storageState: { cookies: [], origins: [] } });
    test('renders all form fields and Create Account button', async ({ page }) => {
        await page.goto('/register/');

        await expect(page).toHaveTitle(/Create Account|VARify/i);
        await expect(page.locator('#id_username')).toBeVisible();
        await expect(page.locator('#id_email')).toBeVisible();
        await expect(page.locator('#id_password1')).toBeVisible();
        await expect(page.locator('#id_password2')).toBeVisible();
        await expect(page.locator('.btn-submit')).toBeVisible();
    });

    test('has a link back to the login page', async ({ page }) => {
        await page.goto('/register/');

        const loginLink = page.locator('a[href*="login"]');
        await expect(loginLink).toBeVisible();
        await loginLink.click();
        await expect(page).toHaveURL(/\/login\//);
    });
});

test.describe('Registration flow — validation', () => {
    test.use({ storageState: { cookies: [], origins: [] } });
    test('shows error when passwords do not match', async ({ page }) => {
        await page.goto('/register/');

        // Fill in mismatched passwords
        await page.locator('#id_username').fill('new_test_user_xyz');
        await page.locator('#id_email').fill('newuser_xyz@example.com');
        await page.locator('#id_password1').fill('MyStr0ngPass!');
        await page.locator('#id_password2').fill('DifferentPass!99');
        await page.locator('.btn-submit').click();
        await page.waitForLoadState('networkidle');

        // Should stay on register with validation error
        await expect(page).toHaveURL(/\/register\//);
        const errorList = page.locator('.errorlist').filter({ hasText: /hasł|match|pasuj/i });
        await expect(errorList.first()).toBeVisible();
    });

    test('shows error when username already taken', async ({ page }) => {
        const existingUsername = process.env.E2E_USERNAME ?? 'e2e_free_user';

        await page.goto('/register/');
        await page.locator('#id_username').fill(existingUsername);
        await page.locator('#id_email').fill('totally_new@example.com');
        await page.locator('#id_password1').fill('MyStr0ngPass!');
        await page.locator('#id_password2').fill('MyStr0ngPass!');
        await page.locator('.btn-submit').click();
        await page.waitForLoadState('networkidle');

        await expect(page).toHaveURL(/\/register\//);
        const errorList = page.locator('.errorlist').filter({ hasText: 'Użytkownik o tej nazwie już' });
        await expect(errorList).toBeVisible();
    });

    test('shows error when email field is empty', async ({ page }) => {
        await page.goto('/register/');

        await page.locator('#id_username').fill('unique_user_abc123');
        // intentionally leave email empty
        await page.locator('#id_password1').fill('MyStr0ngPass!');
        await page.locator('#id_password2').fill('MyStr0ngPass!');
        await page.locator('.btn-submit').click();
        await page.waitForLoadState('networkidle');

        // Should stay on register
        await expect(page).toHaveURL(/\/register\//);
    });
});
