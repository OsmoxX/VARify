"""
accounts/permissions.py

Centralna logika kontroli dostępu dla subskrypcji VARify.
Używaj has_access() wszędzie, gdzie potrzebujesz sprawdzić uprawnienia.
"""

from django.contrib.auth.base_user import AbstractBaseUser
from django.contrib.auth.models import AnonymousUser
from django.core.exceptions import ObjectDoesNotExist

from .models import SubscriptionTier

# KLUCZOWA ZMIANA 1: Używamy .value, aby klucze na 100% były stringami.
# To rozwiązuje błędy niezgodności typów (str vs Enum) i sprawia, że .get() działa!
TIER_LEVEL: dict[str, int] = {
    SubscriptionTier.FREE.value:    0,
    SubscriptionTier.PLUS.value:    1,
    SubscriptionTier.PREMIUM.value: 2,
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
    """
    if not user.is_authenticated:
        return False

    try:
        profile = getattr(user, 'profile')
        user_tier = profile.tier
    except (AttributeError, ObjectDoesNotExist):
        return _tier_value(required_tier) == SubscriptionTier.FREE.value

    val_user = _tier_value(user_tier)
    val_req = _tier_value(required_tier)
    
    user_level = TIER_LEVEL.get(val_user, 0)
    required_level = TIER_LEVEL.get(val_req, 0)
  
    return user_level >= required_level