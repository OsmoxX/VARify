"""
accounts/decorators.py

Dekoratory kontroli dostępu dla widoków Django.
"""

from django.shortcuts import redirect
from django.http import JsonResponse
from django.contrib import messages
from functools import wraps
from .models import SubscriptionTier
from .permissions import has_access

# Czytelne etykiety planów do komunikatów
TIER_LABELS = {
    SubscriptionTier.PLUS: 'PLUS',
    SubscriptionTier.PREMIUM: 'PREMIUM 👑',
}


def require_tier(minimum_tier):
    """
    Dekorator sprawdzający, czy użytkownik ma odpowiedni plan subskrypcji.
    Hierarchia: PREMIUM > PLUS > FREE

    Obsługuje:
    - Niezalogowanych: przekierowanie do /login/
    - Zapytania AJAX: zwraca JsonResponse z błędem 403
    - Zwykłe GET/POST: przekierowanie na /subscribe/ + komunikat

    Użycie:
        @require_tier(SubscriptionTier.PLUS)
        def my_view(request): ...
    """
    def decorator(view_func):
        @wraps(view_func)
        def _wrapped_view(request, *args, **kwargs):

            # 1) Niezalogowany → login
            if not request.user.is_authenticated:
                return redirect('login')

            # 2) Sprawdź uprawnienia przez has_access (hierarchiczne)
            if not has_access(request.user, minimum_tier):
                label = TIER_LABELS.get(minimum_tier, minimum_tier)
                error_msg = (
                    f'🔒 Aby uzyskać dostęp do tej funkcji, wymagany jest plan {label}. '
                    f'Ulepsz swój plan, aby odblokować pełne możliwości VARify.'
                )

                # AJAX: zwróć JSON zamiast redirect
                is_ajax = (
                    request.headers.get('X-Requested-With') == 'XMLHttpRequest'
                    or 'application/json' in request.headers.get('Accept', '')
                )
                if is_ajax:
                    return JsonResponse({
                        'error': 'access_denied',
                        'message': error_msg,
                        'required_tier': minimum_tier,
                        'upgrade_url': '/subscribe/',
                    }, status=403)

                # Zwykłe żądanie: komunikat + redirect na cennik
                messages.warning(request, error_msg)
                return redirect('subscribe')

            # 3) Dostęp OK → wykonaj widok
            return view_func(request, *args, **kwargs)

        return _wrapped_view
    return decorator
