import type { SubscriptionTier } from '@prisma/client';

export type PlanName = 'plus' | 'premium';

export const planToTier = (plan: string | null | undefined): SubscriptionTier | undefined =>
  plan === 'plus' ? 'PLUS' : plan === 'premium' ? 'PREMIUM' : undefined;

export const ACTIVE_STATUSES = new Set(['active', 'trialing', 'past_due']);

/**
 * Plan wynikający ze statusu subskrypcji Stripe:
 *  - active / trialing → plan z ceny,
 *  - past_due → zachowujemy plan (okres karencji, Stripe ponawia płatność; po wyczerpaniu prób
 *    przyjdzie `unpaid`/`canceled`/`subscription.deleted`),
 *  - unpaid / canceled / incomplete_expired / paused → FREE,
 *  - incomplete → bez zmiany (undefined) — płatność jeszcze trwa.
 */
export function tierForSubscription(
  status: string,
  priceTier: SubscriptionTier | undefined,
): SubscriptionTier | undefined {
  switch (status) {
    case 'active':
    case 'trialing':
    case 'past_due':
      return priceTier;
    case 'unpaid':
    case 'canceled':
    case 'incomplete_expired':
    case 'paused':
      return 'FREE';
    default:
      return undefined;
  }
}

/** Stripe zwraca obiekt lub id (zależnie od expand) — normalizacja do id. */
export function idOf(v: unknown): string | null {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && typeof (v as { id?: unknown }).id === 'string') {
    return (v as { id: string }).id;
  }
  return null;
}

export function parseUserId(v: unknown): number | null {
  if (typeof v !== 'string' || !/^\d{1,10}$/.test(v)) return null;
  const n = Number(v);
  return n > 0 ? n : null;
}
