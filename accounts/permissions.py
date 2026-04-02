"""
accounts/permissions.py

Centralna logika kontroli dostępu dla subskrypcji VARify.
Używaj has_access() wszędzie, gdzie potrzebujesz sprawdzić uprawnienia.
"""

from .models import SubscriptionTier

# Odwzorowanie tieru na wartość liczbową — wyższy = więcej przywilo
TIER_LEVEL = {
    SubscriptionTier.FREE: 0,
    SubscriptionTier.PLUS: 1,
    SubscriptionTier.PREMIUM: 2,
}


def has_access(user, required_tier: str) -> bool:
    """
    Sprawdza, czy użytkownik ma dostęp do funkcji wymagającej danego poziomu.
    Respektuje hierarchię: PREMIUM >= PLUS >= FREE.

    Użycie:
        from accounts.permissions import has_access
        if has_access(request.user, 'PLUS'):
            ...
    """
    if not user.is_authenticated:
        return False

    try:
        user_tier = user.profile.tier
    except AttributeError:
        # Profil nie istnieje (np. stary użytkownik) → traktujemy jak FREE
        return required_tier == SubscriptionTier.FREE

    user_level = TIER_LEVEL.get(user_tier, 0)
    required_level = TIER_LEVEL.get(required_tier, 0)

    return user_level >= required_level
