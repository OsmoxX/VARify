import type { SubscriptionTier } from '@prisma/client';

/**
 * Hierarchia planów (odpowiednik Django accounts/permissions.py TIER_LEVEL):
 * PREMIUM >= PLUS >= FREE.
 */
export const TIER_LEVEL: Record<SubscriptionTier, number> = {
  FREE: 0,
  PLUS: 1,
  PREMIUM: 2,
};

export function hasAccess(
  userTier: SubscriptionTier | null | undefined,
  requiredTier: SubscriptionTier,
): boolean {
  if (requiredTier === 'FREE') return true;
  if (!userTier) return false;
  return (TIER_LEVEL[userTier] ?? 0) >= TIER_LEVEL[requiredTier];
}
