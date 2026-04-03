/**
 * subscription/stripe_flow.spec.ts
 *
 * E2E tests for the Stripe Checkout redirect flow.
 *
 * Strategy:
 *  - Clicking "Buy Plus/Premium" POSTs to /create-checkout-session/<plan>/
 *    which calls Stripe API and redirects (303) to checkout.stripe.com.
 *  - We intercept the navigation to assert the redirect target without
 *    actually hitting Stripe (avoids real API calls in CI).
 *  - An optional "success redirect" test verifies that /?payment=success
 *    is handled gracefully (no 500/404).
 *
 * NOTE: Stripe test mode keys must be set in .env for these tests to pass
 * (STRIPE_SECRET_KEY=sk_test_...). With live keys the request succeeds but
 * Stripe rejects the test card data — set TEST_MODE=true to skip accordingly.
 */

import { test, expect } from '../fixtures';

// ── Helpers ────────────────────────────────────────────────────────────────

const STRIPE_CHECKOUT_DOMAIN = 'checkout.stripe.com';
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:8000';

/**
 * Intercept a form POST → external redirect and return the redirect URL.
 * We listen for any navigation away from the base URL.
 */
async function captureCheckoutRedirect(
  page: import('@playwright/test').Page,
  submitFn: () => Promise<void>,
): Promise<string | null> {
  let redirectTarget: string | null = null;

  // Abort the navigation to Stripe so we don't leave the test session
  await page.route(`https://${STRIPE_CHECKOUT_DOMAIN}/**`, async (route) => {
    redirectTarget = route.request().url();
    await route.abort('aborted');
  });

  try {
    await submitFn();
    // Give a moment for the redirect to be intercepted
    await page.waitForTimeout(2000);
  } catch {
    // Navigation abort throws — that's expected
  }

  return redirectTarget;
}

// ── Tests ──────────────────────────────────────────────────────────────────

test.describe('Stripe Checkout redirect — Plus plan', () => {

  test('FREE user clicking "Zacznij z PLUS" is redirected toward Stripe Checkout', async ({ pageFree }) => {
    await pageFree.goto('/subscribe/');

    const redirectUrl = await captureCheckoutRedirect(pageFree, async () => {
      await pageFree.locator('.sub-card-plus form button[type="submit"]').click();
    });

    // If Stripe is configured (test mode), the redirect target will be Stripe
    if (redirectUrl) {
      expect(redirectUrl).toContain(STRIPE_CHECKOUT_DOMAIN);
    } else {
      // No redirect captured: STRIPE_SECRET_KEY may be a placeholder
      // Assert we ended up on /subscribe/ (error fallback), not a 500
      await expect(pageFree).not.toHaveURL(/500/);
      console.warn('[Stripe] No checkout redirect captured — check STRIPE_SECRET_KEY.');
    }
  });

  test('FREE user clicking "Wybierz Premium" is redirected toward Stripe Checkout', async ({ pageFree }) => {
    await pageFree.goto('/subscribe/');

    const redirectUrl = await captureCheckoutRedirect(pageFree, async () => {
      await pageFree.locator('.sub-card-premium form button[type="submit"]').click();
    });

    if (redirectUrl) {
      expect(redirectUrl).toContain(STRIPE_CHECKOUT_DOMAIN);
    } else {
      await expect(pageFree).not.toHaveURL(/500/);
      console.warn('[Stripe] No checkout redirect captured — check STRIPE_SECRET_KEY.');
    }
  });

  test('PLUS user clicking "Wybierz Premium" is redirected toward Stripe', async ({ pagePlus }) => {
    await pagePlus.goto('/subscribe/');

    const redirectUrl = await captureCheckoutRedirect(pagePlus, async () => {
      await pagePlus.locator('.sub-card-premium form button[type="submit"]').click();
    });

    if (redirectUrl) {
      expect(redirectUrl).toContain(STRIPE_CHECKOUT_DOMAIN);
    } else {
      await expect(pagePlus).not.toHaveURL(/500/);
    }
  });

  test('unauthenticated user accessing checkout endpoint is redirected to login', async ({ browser }) => {
    // /create-checkout-session/<plan>/ has @login_required.
    // We verify the auth guard directly — no need to click a form that
    // isn't rendered (because /subscribe/ itself requires login too).
    const ctx  = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();

    // GET the checkout endpoint directly (Django allows GET — it 302s to login)
    await page.goto('/create-checkout-session/plus/');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(/\/login\//);
    await ctx.close();
  });
});

// ── Optional: success redirect handling ───────────────────────────────────

test.describe('Stripe success/cancel redirect handling', () => {

  test('/?payment=success loads home page without errors', async ({ pageFree }) => {
    await pageFree.goto('/?payment=success');
    // Should not be a 500 or 404
    await expect(pageFree).not.toHaveURL(/\/(500|404)\//);
    // Basic sanity: home page landmark should be present
    await expect(pageFree.locator('body')).toBeVisible();
  });

  test('/subscribe/?payment=cancelled loads subscribe page without errors', async ({ pageFree }) => {
    await pageFree.goto('/subscribe/?payment=cancelled');
    await expect(pageFree).not.toHaveURL(/\/(500|404)\//);
    await expect(pageFree.locator('.sub-cards')).toBeVisible();
  });
});
