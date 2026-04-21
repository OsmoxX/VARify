"""
matches/tasks/push_tasks.py

Zadania Celery związane z Web Push Notifications:
  - send_match_event_notification      → wysyła Push do właściwych użytkowników
  - process_match_incidents_and_notify → przetwarza incydenty JEDNEGO meczu i pusuje

Łańcuch działania (event-driven):
  sync_live_matches (Celery Beat, co 60s)
    → wykrywa zmianę wyniku/statusu w meczach live
    → process_match_incidents_and_notify.delay(match_api_id)
      ← wywoływane TYLKO dla meczów z realną zmianą ← KLUCZ OPTYMALIZACJI
      → pobiera incydenty z API (1 GET dla 1 meczu)
      → porównuje z notified_event_ids
      → send_match_event_notification.delay(...)
        → filtruje użytkowników (subskrybenci + fani drużyn)
        → send_user_notification() → Web Push → wibracja telefonu

Optymalizacje API:
  1. EVENT-DRIVEN     — GET /incidents TYLKO gdy wynik/status się zmienił
  2. PRE-FLIGHT CHECK — GET wysyłany tylko jeśli ktoś obserwuje dany mecz
  3. 404-BLACKLISTING — mecze bez danych o incydentach trwale pomijane
"""

import logging
import os

import requests
from matches.services.api_tracker import api_get
from celery import shared_task
from django.contrib.auth import get_user_model

from matches.models import FavoriteTeam, LiveMatch, MatchSubscription
from matches.services.match_service import _api_headers

try:
    from webpush import send_user_notification
    WEBPUSH_AVAILABLE = True
except ImportError:
    WEBPUSH_AVAILABLE = False

logger = logging.getLogger(__name__)
User = get_user_model()

_BASE_URL = os.getenv("SITE_BASE_URL", "https://13.62.58.123.nip.io")


# =============================================================================
#  MAPOWANIE INCYDENTÓW → emoji + tytuł powiadomienia
# =============================================================================

_PUSH_INCIDENT_TYPES = {"goal", "card", "varDecision", "inGamePenalty"}

_INCIDENT_LABELS: dict[tuple[str, str], tuple[str, str]] = {
    # ── bramki ──────────────────────────────────────────────────────────────
    ("goal", "regular"):                 ("⚽", "GOOOL!"),
    ("goal", "ownGoal"):                 ("⚽", "Gol samobójczy!"),
    ("goal", "penalty"):                 ("⚽", "Gol z rzutu karnego!"),
    # ── kartki ──────────────────────────────────────────────────────────────
    ("card", "yellow"):                  ("🟨", "Żółta kartka!"),
    ("card", "red"):                     ("🟥", "Czerwona kartka!"),
    ("card", "yellowRed"):               ("🟨🟥", "Druga żółta → czerwona!"),
    # ── decyzje VAR ─────────────────────────────────────────────────────────
    ("varDecision", "goalCancelled"):    ("❌", "Bramka anulowana (VAR)!"),
    ("varDecision", "cardUpgrade"):      ("📺", "Zmiana karty (VAR)!"),
    ("varDecision", "penaltyNotGiven"): ("📺", "Karny odwołany (VAR)!"),
    ("varDecision", "penaltyGiven"):     ("🎯", "Karny przyznany (VAR)!"),
    # ── rzut karny w trakcie meczu ───────────────────────────────────────────
    ("inGamePenalty", "scored"):         ("🎯", "Rzut karny – GOOL!"),
    ("inGamePenalty", "missed"):         ("💨", "Rzut karny – spudłowany!"),
    ("inGamePenalty", "penaltyAwarded"): ("🎯", "Podyktowany rzut karny!"),
}


# =============================================================================
#  POMOCNICZE FUNKCJE (prywatne)
# =============================================================================

def _is_match_of_interest(match: LiveMatch) -> bool:
    """
    Sprawdza, czy KTOKOLWIEK aktywnie śledzi ten mecz.
    Zwraca False → monitor pomija GET do API (oszczędność limitów).
    """
    if MatchSubscription.objects.filter(match=match, is_active=True).exists():
        return True

    team_ids = []
    if match.home_team:
        team_ids.append(match.home_team.api_id)
    if match.away_team:
        team_ids.append(match.away_team.api_id)

    if team_ids and FavoriteTeam.objects.filter(
        team__api_id__in=team_ids,
        is_active=True,
    ).exists():
        return True

    return False


def _fetch_incidents_for_match(api_match_id: int) -> tuple[list[dict], bool]:
    """
    Pobiera incydenty dla meczu z SportAPI.

    Zwraca:
      (incidents, has_data)
        has_data = False  → 404/403/204 → blacklist tego meczu w DB
        has_data = True   → OK lub błąd przejściowy (np. 500, timeout)
    """
    url = f"https://sportapi7.p.rapidapi.com/api/v1/event/{api_match_id}/incidents"
    try:
        resp = api_get(url, headers=_api_headers(), timeout=10)
        if resp.status_code == 200:
            return resp.json().get("incidents", []), True
        if resp.status_code in (404, 403, 204):
            logger.info(
                "API incidents %s: HTTP %s — brak danych, blacklistuję mecz.",
                api_match_id, resp.status_code,
            )
            return [], False
        logger.warning(
            "API incidents %s: HTTP %s (przejściowy) — nie blacklistuję.",
            api_match_id, resp.status_code,
        )
    except Exception as e:
        logger.warning("Błąd sieciowy incidents %s: %s", api_match_id, e)
    return [], True


def _build_push_body(
    inc: dict,
    home_name: str,
    away_name: str,
    home_score: int,
    away_score: int,
) -> str:
    """Buduje czytelną treść powiadomienia Push na podstawie incydentu."""
    player = (inc.get("player") or {}).get("name", "")
    team_name = home_name if inc.get("isHome", True) else away_name
    minute = inc.get("time", "")
    score_str = f"{home_score}:{away_score}"
    inc_type = inc.get("incidentType", "")

    if inc_type == "goal":
        scorer = f" – {player}" if player else ""
        return f"{home_name} {score_str} {away_name}{scorer} ({minute}')"
    if inc_type == "card":
        return f"{player} ({team_name}) – {minute}'"
    if inc_type in ("varDecision", "inGamePenalty"):
        detail = f" {player}" if player else ""
        return f"{team_name}{detail} – {minute}'"
    return f"{home_name} vs {away_name}"


# =============================================================================
#  TASK 1: GONIEC – wysyłka Push dla jednego zdarzenia
# =============================================================================

@shared_task(name="matches.tasks.send_match_event_notification")
def send_match_event_notification(
    match_api_id: int,
    home_team_api_id: int,
    away_team_api_id: int,
    event_title: str,
    event_body: str,
) -> str:
    """
    Wysyła Web Push dla danego zdarzenia meczowego do właściwych użytkowników.

    Odbiorcy:
      A) Subskrybenci dzwoneczka (MatchSubscription.is_active=True)
      B) Fani drużyn (FavoriteTeam.is_active=True) – chyba że wyciszyli mecz
    """
    if not WEBPUSH_AVAILABLE:
        logger.error("django-webpush nie jest zainstalowany — pomijam wysyłkę Push.")
        return "webpush unavailable"

    match_url = f"{_BASE_URL}/pl/match/{match_api_id}/"

    # A) Ręczni subskrybenci (user__isnull=False wyklucza anonimowe sesje bez urządzenia)
    subscribed_users = User.objects.filter(
        match_subscriptions__match__api_id=match_api_id,
        match_subscriptions__is_active=True,
        match_subscriptions__user__isnull=False,
    ).distinct()

    # B) Fani drużyn (z wykluczeniem wyciszonych)
    fans = User.objects.filter(
        favorite_teams__team__api_id__in=[home_team_api_id, away_team_api_id],
        favorite_teams__is_active=True,
    ).exclude(
        match_subscriptions__match__api_id=match_api_id,
        match_subscriptions__is_active=False,
    ).distinct()

    users_to_notify = (subscribed_users | fans).distinct()
    payload = {"head": event_title, "body": event_body, "url": match_url}

    success_count = 0
    for user in users_to_notify:
        try:
            send_user_notification(user=user, payload=payload, ttl=3600)
            success_count += 1
        except Exception as e:
            logger.warning("Błąd Push do usera '%s': %s", user.username, e)

    total = users_to_notify.count()
    logger.info("Push '%s' wysłany do %s/%s użytkowników.", event_title, success_count, total)
    return f"Push '{event_title}' → {success_count} użytkowników"


# =============================================================================
#  TASK 2: ANALIZATOR – przetwarza incydenty JEDNEGO meczu i triggeruje Gońca
# =============================================================================

@shared_task(name="matches.tasks.process_match_incidents_and_notify")
def process_match_incidents_and_notify(match_api_id: int) -> str:
    """
    Przetwarza incydenty dla JEDNEGO konkretnego meczu i wysyła Push Notifications.

    Wywoływane WYŁĄCZNIE przez sync_live_matches gdy wykryje zmianę wyniku lub statusu.
    Dzięki temu API /incidents jest odpytywane TYLKO gdy na boisku faktycznie coś się stało.

    Algorytm:
      1. Wczytaj mecz z DB (czy ma has_incident_data=True, czy ktoś go śledzi)
      2. Pobierz incydenty (1 GET do API)
         → 404/403 → blacklist, skip dalej
      3. Cold-start: jeśli pierwszy raz, zapamiętaj ID bez pushowania
      4. Przetwórz nowe incydenty (bramka/kartka/VAR) → send_match_event_notification.delay()
      5. Fallback: jeśli wynik zmienił się, a API incidents jest opóźnione → push wynikowy
      6. Zaktualizuj notified_event_ids i last_notified_score w DB
    """
    # ── Wczytaj mecz ──────────────────────────────────────────────────────────
    try:
        match = LiveMatch.objects.select_related("home_team", "away_team").get(
            api_id=match_api_id
        )
    except LiveMatch.DoesNotExist:
        logger.warning("process_match_incidents_and_notify: mecz %s nie istnieje w DB.", match_api_id)
        return f"Match {match_api_id} not found"

    if not match.has_incident_data:
        logger.debug("Pominięto mecz %s — blacklista 404.", match_api_id)
        return f"Skipped (blacklisted) {match_api_id}"

    if not match.home_team or not match.away_team:
        return f"Skipped (missing teams) {match_api_id}"

    home_name = match.home_team.name
    away_name = match.away_team.name
    home_api_id = match.home_team.api_id
    away_api_id = match.away_team.api_id

    # ── Pre-flight: czy ktoś śledzi ten mecz? ─────────────────────────────────
    if not _is_match_of_interest(match):
        logger.debug("Pominięto mecz %s — nikt nie obserwuje.", match_api_id)
        return f"Skipped (no interest) {match_api_id}"

    # ── Pobierz incydenty (1 GET / 1 mecz) ────────────────────────────────────
    incidents, has_data = _fetch_incidents_for_match(match_api_id)

    if not has_data:
        LiveMatch.objects.filter(pk=match.pk).update(has_incident_data=False)
        logger.info(
            "🚫 Blacklist: mecz [%s] %s – %s bez danych incydentów (API 404).",
            match_api_id, home_name, away_name,
        )
        return f"Blacklisted {match_api_id}"

    # ── Cold-start: pierwszy raz widzimy ten mecz ─────────────────────────────
    already_notified: list = match.notified_event_ids or []
    already_notified_set: set = set(already_notified)
    new_notified_ids: list = []

    if not already_notified:
        all_current_ids = [
            str(inc.get("id", ""))
            for inc in incidents
            if str(inc.get("id", ""))
        ]
        if all_current_ids:
            current_score_str = f"{match.home_score}:{match.away_score}"
            LiveMatch.objects.filter(pk=match.pk).update(
                notified_event_ids=all_current_ids,
                last_notified_score=current_score_str,
            )
            logger.info(
                "🔕 Cold-start meczu [%s]: zapamiętano %s ID, brak powiadomień.",
                match_api_id, len(all_current_ids),
            )
        return f"Cold-start {match_api_id}"

    # ── Procesuj nowe incydenty ────────────────────────────────────────────────
    pushed = 0
    for inc in incidents:
        inc_id = str(inc.get("id", ""))
        if not inc_id or inc_id in already_notified_set:
            continue

        inc_type = inc.get("incidentType", "")
        inc_class = inc.get("incidentClass") or ""

        if inc_type not in _PUSH_INCIDENT_TYPES:
            continue

        label_key = (inc_type, inc_class)
        label_info = _INCIDENT_LABELS.get(label_key)
        if label_info is None:
            if inc_type == "goal":
                label_info = ("⚽", "GOOOL!")
            elif inc_type == "card":
                label_info = ("🃏", "Kartka!")
            else:
                continue

        emoji, title_base = label_info
        full_title = f"{emoji} {title_base} | {home_name} – {away_name}"

        inc_home = inc.get("homeScore") if inc_type == "goal" else None
        inc_away = inc.get("awayScore") if inc_type == "goal" else None
        h_score = inc_home if inc_home is not None else match.home_score
        a_score = inc_away if inc_away is not None else match.away_score

        body = _build_push_body(inc, home_name, away_name, h_score, a_score)

        send_match_event_notification.delay(
            match_api_id=match_api_id,
            home_team_api_id=home_api_id,
            away_team_api_id=away_api_id,
            event_title=full_title,
            event_body=body,
        )
        new_notified_ids.append(inc_id)
        pushed += 1
        logger.info(
            "🔔 Push zakolejkowany: [%s] %s (inc_id=%s)",
            match_api_id, title_base, inc_id,
        )

    # ── Fallback wynikowy (API incidents opóźnione względem live score) ────────
    current_score_str = f"{match.home_score}:{match.away_score}"
    try:
        old_total = sum(int(x) for x in match.last_notified_score.split(":"))
    except (ValueError, AttributeError):
        old_total = 0

    if (
        current_score_str != match.last_notified_score
        and match.home_score + match.away_score > old_total
    ):
        goal_already_pushed = any(
            inc.get("incidentType") == "goal"
            for inc in incidents
            if str(inc.get("id", "")) in set(new_notified_ids)
        )
        if not goal_already_pushed:
            send_match_event_notification.delay(
                match_api_id=match_api_id,
                home_team_api_id=home_api_id,
                away_team_api_id=away_api_id,
                event_title=f"⚽ GOOOL! | {home_name} – {away_name}",
                event_body=f"{home_name} {current_score_str} {away_name}",
            )
            pushed += 1
            logger.info("🔔 Push wynikowy (fallback): %s", current_score_str)

    # ── Zapisz stan ────────────────────────────────────────────────────────────
    if new_notified_ids or current_score_str != match.last_notified_score:
        LiveMatch.objects.filter(pk=match.pk).update(
            notified_event_ids=already_notified + new_notified_ids,
            last_notified_score=current_score_str,
        )

    logger.info(
        "process_match_incidents_and_notify [%s]: zakolejkowano %s Push.",
        match_api_id, pushed,
    )
    return f"Processed {match_api_id}: {pushed} push notifications queued."
