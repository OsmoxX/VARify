/**
 * matches/match_detail.spec.ts
 *
 * Tests the match detail page: tabs, back button navigation, and search.
 * Uses the shared authenticated session.
 *
 * NOTE: Match detail pages require a real match ID in the database.
 * We navigate to one via the live search bar to avoid hardcoding an ID.
 */

import { test, expect } from '../fixtures';

test.describe('Match detail — navigation via search', () => {
    test('can search for a team and navigate to its match', async ({ page }) => {
        await page.goto('/');

        const searchInput = page.locator('#live-search-input');
        await expect(searchInput).toBeVisible();

        // Type in search — this triggers the live search dropdown
        await searchInput.fill('Manchester');
        await page.waitForTimeout(600); // wait for debounce

        const dropdown = page.locator('#search-results-dropdown');
        // If there are results, click the first one
        const firstResult = dropdown.locator('a.search-item').first();
        const hasResults = await firstResult.count() > 0;

        if (hasResults) {
            await firstResult.click();
            await page.waitForLoadState('networkidle');
            // Should have navigated away from the home page
            await expect(page).not.toHaveURL(/^http:\/\/127\.0\.0\.1:8000\/$/);
        } else {
            // No live matches available right now — skip gracefully
            test.skip();
        }
    });
});

test.describe('Match detail page — direct URL', () => {
    /**
     * These tests navigate directly to /match/<id>/ via the API to find a real match.
     * If no matches exist, tests are skipped gracefully.
     */
    let matchUrl: string | null = null;

    test.beforeAll(async ({ browser }) => {
        const context = await browser.newContext({
            storageState: 'playwright/.auth/user.json',
        });
        const page = await context.newPage();

        // Fetch live matches from the API to get a real match ID
        const response = await page.request.get('/api/live-matches/');
        if (response.ok()) {
            const data = await response.json();
            const results = data.results ?? data;
            if (Array.isArray(results) && results.length > 0) {
                const firstMatch = results[0];
                matchUrl = `/match/${firstMatch.id}/`;
            }
        }
        await context.close();
    });

    test('shows home and away team names in the scoreboard', async ({ page }) => {
        if (!matchUrl) test.skip();
        await page.goto(matchUrl!);

        // Both team name sections must be visible
        const scoreboardHeader = page.locator('.scoreboard-header');
        await expect(scoreboardHeader).toBeVisible();
        await expect(scoreboardHeader.locator('.team-name-lg').first()).toBeVisible();
        await expect(scoreboardHeader.locator('.team-name-lg').last()).toBeVisible();
    });

    test('shows all three tab buttons: Oś czasu, Składy, Statystyki', async ({ page }) => {
        if (!matchUrl) test.skip();
        await page.goto(matchUrl!);

        await expect(page.getByRole('button', { name: /Oś czasu/i })).toBeVisible();
        await expect(page.getByRole('button', { name: /Składy/i })).toBeVisible();
        await expect(page.getByRole('button', { name: /Statystyki/i })).toBeVisible();
    });

    test('clicking the Składy tab shows lineups content and hides timeline', async ({ page }) => {
        if (!matchUrl) test.skip();
        await page.goto(matchUrl!);

        // Timeline tab should be active by default
        await expect(page.locator('#timeline-tab')).toBeVisible();
        await expect(page.locator('#lineups-tab')).not.toBeVisible();

        // Click Składy
        await page.getByRole('button', { name: /Składy/i }).click();

        await expect(page.locator('#lineups-tab')).toBeVisible();
        await expect(page.locator('#timeline-tab')).not.toBeVisible();
    });

    test('clicking the Statystyki tab shows stats content', async ({ page }) => {
        if (!matchUrl) test.skip();
        await page.goto(matchUrl!);

        await page.getByRole('button', { name: /Statystyki/i }).click();

        await expect(page.locator('#stats-tab')).toBeVisible();
    });

    test('"Wróć do wyników" back button navigates to home page', async ({ page }) => {
        if (!matchUrl) test.skip();
        await page.goto(matchUrl!);

        const backBtn = page.getByRole('link', { name: /Wróć do wyników/i });
        await expect(backBtn).toBeVisible();
        await backBtn.click();
        await page.waitForLoadState('networkidle');

        await expect(page).toHaveURL(/^http:\/\/127\.0\.0\.1:8000\//);
    });
});
