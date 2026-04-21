"""
matches/views/dev_views.py

Widoki narzędziowe dla developmentu i testowania.
"""

from django.contrib.auth import get_user_model
from django.contrib.auth.decorators import user_passes_test
from django.http import JsonResponse
from django.shortcuts import get_object_or_404

from matches.models import LiveMatch

try:
    from webpush import send_user_notification
    WEBPUSH_AVAILABLE = True
except ImportError:
    WEBPUSH_AVAILABLE = False

User = get_user_model()


@user_passes_test(lambda u: u.is_superuser)
def simulate_match_event(request, match_api_id: int):
    """
    Symuluje zdarzenie dla powiadomień Push bez odpytywania z API.
    Służy do deweloperskiego debugowania dostarczalności i testów odbiorców.
    Wymagane GET params:
        ?event=goal (domyślnie) | red_card
    """
    if not WEBPUSH_AVAILABLE:
        return JsonResponse({"error": "webpush unavailable, zanstaluj django-webpush"}, status=500)

    event_type = request.GET.get("event", "goal")
    match = get_object_or_404(LiveMatch, api_id=match_api_id)

    home_team_api_id = match.home_team.api_id if match.home_team else 0
    away_team_api_id = match.away_team.api_id if match.away_team else 0

    # 1. Filtrowanie subskrybentów dzwoneczka (aktywni, powiązani z kontami zalogowanymi – brak nullów)
    subscribed_users = User.objects.filter(
        match_subscriptions__match__api_id=match_api_id,
        match_subscriptions__is_active=True,
        match_subscriptions__user__isnull=False,
    ).distinct()

    # 2. Filtrowanie fanów ulubionych drużyn, którzy z góry dostają powiadomienie, CHYBA, że ręcznie wyciszyli ten mecz
    fans = User.objects.filter(
        favorite_teams__team__api_id__in=[home_team_api_id, away_team_api_id],
        favorite_teams__is_active=True,
    ).exclude(
        match_subscriptions__match__api_id=match_api_id,
        match_subscriptions__is_active=False,  # Ochrona przed spamowaniem meczu wyciszonego
    ).distinct()

    users_to_notify = (subscribed_users | fans).distinct()

    if event_type == "red_card":
        payload = {
            "head": "🟥 TEST: CZERWONA KARTKA",
            "body": "Symulacja wykluczenia z gry.",
            "url": f"/pl/match/{match_api_id}/"
        }
    else:
        payload = {
            "head": "⚽ TEST: GOOOL!",
            "body": "To jest symulacja bramki!",
            "url": f"/pl/match/{match_api_id}/"
        }

    success_count = 0
    for user in users_to_notify:
        try:
            send_user_notification(user=user, payload=payload, ttl=1000)
            success_count += 1
        except Exception as e:
            print(f"DEV PUSH FAIL {user.username}: {e}")

    return JsonResponse({
        "status": "success",
        "event_type": event_type,
        "users_found": users_to_notify.count(),
        "users_notified": success_count,
        "payload": payload
    })
