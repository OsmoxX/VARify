import { test as base, Page } from '@playwright/test';

/**
 * Rozszerzamy domyślny `test` o własny fixture `page`,
 * który automatycznie czeka na 'networkidle' przy każdym page.goto().
 * Dzięki temu CSS i JS zawsze są załadowane przed asercjami.
 */
export const test = base.extend<{ page: Page }>({
    page: async ({ page }, use) => {
        // Nadpisujemy page.goto() żeby zawsze czekać na networkidle
        const originalGoto = page.goto.bind(page);
        page.goto = (url: string, options?: Parameters<Page['goto']>[1]) => {
            return originalGoto(url, { waitUntil: 'networkidle', ...options });
        };

        await use(page);
    },
});

export { expect } from '@playwright/test';
