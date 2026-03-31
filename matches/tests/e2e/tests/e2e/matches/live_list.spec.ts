/**
 * matches/live_list.spec.ts
 *
 * Tests for the live matches list page (home page `/`).
 * Uses the shared authenticated session from global-setup.
 */

import { test, expect } from '../fixtures';

test.describe('Live matches page — access control', () => {
    test('unauthenticated user visiting / is redirected to login', async ({ browser }) => {
        // Create a fresh context with no cookies
        const freshContext = await browser.newContext({ storageState: { cookies: [], origins: [] } });
        const page = await freshContext.newPage();

        await page.goto('/');
        await page.waitForLoadState('networkidle');

        await expect(page).toHaveURL(/\/login\//);
        await freshContext.close();
    });
});

test.describe('Live matches page — authenticated', () => {
    test('shows the "Mecze na żywo" heading', async ({ page }) => {
        await page.goto('/');

        const heading = page.getByRole('heading', { name: /Mecze na żywo/i });
        await expect(heading).toBeVisible();
    });

    test('shows the live dot pulsing indicator', async ({ page }) => {
        await page.goto('/');

        await expect(page.locator('.live-dot')).toBeVisible();
    });

    test('navbar shows the user avatar button (proves session is active)', async ({ page }) => {
        await page.goto('/');

        await expect(page.getByRole('button', { name: 'Menu użytkownika' })).toBeVisible();
    });

    test('leagues container is present in the DOM', async ({ page }) => {
        await page.goto('/');

        await expect(page.locator('#leagues-container')).toBeAttached();
    });
});

test.describe('Live matches page — filter menu', () => {
    test('clicking "Filtruj ligi" button opens the filter menu', async ({ page }) => {
        await page.goto('/');

        const filterBtn = page.getByRole('button', { name: /Filtruj ligi/i });
        await expect(filterBtn).toBeVisible();

        // Filter menu should be hidden initially
        await expect(page.locator('#filter-menu')).not.toBeVisible();

        await filterBtn.click();

        // Filter menu should now be visible
        await expect(page.locator('#filter-menu')).toBeVisible();
    });

    test('filter menu can be closed by clicking the X button', async ({ page }) => {
        await page.goto('/');

        // Open filter
        await page.getByRole('button', { name: /Filtruj ligi/i }).click();
        await expect(page.locator('#filter-menu')).toBeVisible();

        // Close via X icon
        const closeBtn = page.locator('.close-filter');
        await closeBtn.click();

        await expect(page.locator('#filter-menu')).not.toBeVisible();
    });

    test('filter menu search input is present and accepts text', async ({ page }) => {
        await page.goto('/');

        await page.getByRole('button', { name: /Filtruj ligi/i }).click();

        const searchInput = page.locator('#league-search-input');
        await expect(searchInput).toBeVisible();
        await searchInput.fill('Premier');
        await expect(searchInput).toHaveValue('Premier');
    });
});

test.describe('Live matches page — global toggle', () => {
    test('"Rozwiń wszystkie" toggle checkbox starts as checked', async ({ page }) => {
        await page.goto('/');

        const toggleCheckbox = page.locator('#global-toggle-input');
        await expect(toggleCheckbox).toBeChecked();
    });

    test('unchecking "Rozwiń wszystkie" toggle changes its state', async ({ page }) => {
        await page.goto('/');

        const toggleCheckbox = page.locator('#global-toggle-input');
        await expect(toggleCheckbox).toBeChecked();

        // The real <input> is visually hidden by CSS (custom switch component).
        // We click the parent <label> — exactly as a real user would.
        await page.locator('label.switch').click();
        await expect(toggleCheckbox).not.toBeChecked();
    });
});
