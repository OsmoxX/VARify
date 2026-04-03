"""
accounts/permissions.py

Centralna logika kontroli dostępu dla subskrypcji VARify.
Używaj has_access() wszędzie, gdzie potrzebujesz sprawdzić uprawnienia.
"""

from django.contrib.auth.base_user import AbstractBaseUser
from django.contrib.auth.models import AnonymousUser

from .models import SubscriptionTier

# Odwzorowanie tieru na wartość liczbową — wyższy = więcej przywilejów.
# Klucze to STRINGI (wartości .value), bo Django CharField zawsze zwraca str.
TIER_LEVEL: dict[str, int] = {
    SubscriptionTier.FREE:    0,  # 'FREE'
    SubscriptionTier.PLUS:    1,  # 'PLUS'
    SubscriptionTier.PREMIUM: 2,  # 'PREMIUM'
}


def _tier_value(tier: "SubscriptionTier | str") -> str:
    """Coerce SubscriptionTier enum OR plain string to its string value."""
    if isinstance(tier, SubscriptionTier):
        return tier.value
    return str(tier)


def has_access(user: "AbstractBaseUser | AnonymousUser", required_tier: "SubscriptionTier | str") -> bool:
    """
    Sprawdza, czy użytkownik ma dostęp do funkcji wymagającej danego poziomu.
    Respektuje hierarchię: PREMIUM >= PLUS >= FREE.

    Użycie:
        from accounts.permissions import has_access
        if has_access(request.user, SubscriptionTier.PLUS):
            ...
    """
    if not user.is_authenticated:
        return False

    try:
        user_tier: str = user.profile.tier  # type: ignore[union-attr]
    except AttributeError:
        # Profil nie istnieje (np. stary użytkownik) → traktujemy jak FREE
        return _tier_value(required_tier) == SubscriptionTier.FREE.value

    user_level    = TIER_LEVEL.get(_tier_value(user_tier), 0)
    required_level = TIER_LEVEL.get(_tier_value(required_tier), 0)

    return user_level >= required_level
