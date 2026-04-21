# Ten plik jest zachowany dla kompatybilności.
# Właściwa logika tasków znajduje się w pakiecie matches/tasks/
# Python automatycznie preferuje pakiet (katalog) nad tym plikiem.
# Patrz: matches/tasks/__init__.py


import os
import logging

import requests
from celery import shared_task
from django.contrib.auth import get_user_model

from .models import LiveMatch
from .services import (
    fetch_match_details,
    fetch_league_standings,
    fetch_upcoming_matches,
    sync_live_matches as sync_live_matches_service,
)
from .services.match_service import _api_headers

try:
    from webpush import send_user_notification
    WEBPUSH_AVAILABLE = True
except ImportError:
    WEBPUSH_AVAILABLE = False

logger = logging.getLogger(__name__)
User = get_user_model()

# URL bazowy (np. "https://13.62.58.123.nip.io") – pochodzi z .env
_BASE_URL = os.getenv("SITE_BASE_URL", "https://13.62.58.123.nip.io")


# =============================================================================
#  1. STRAŻNIK – synchronizacja meczów live
# =============================================================================

@shared_task(name="matches.tasks.sync_live_matches")
def sync_live_matches():
    """Uruchamiany co ~45 s przez Celery Beat. Aktualizuje LiveMatch w bazie."""
    logger.info("Celery Beat: Rozpoczynam synchronizację meczów live...")
    sync_live_matches_service()
    return "Live matches synced!"


# =============================================================================
#  2. WYDOBYWCA – szczegóły meczu na żądanie
# =============================================================================

@shared_task(name="matches.tasks.fetch_match_details_task")
def fetch_match_details_task(local_match_id: int, api_match_id: int):
    """Pobiera zdarzenia, składy i statystyki meczu w tle (lazy-load)."""
    logger.info("Celery: Pobieram szczegóły meczu local_id=%s, api_id=%s...", local_match_id, api_match_id)
    fetch_match_details(local_match_id=local_match_id, api_match_id=api_match_id)
    return f"Details fetched for match {local_match_id}"


# =============================================================================
#  3. CALENDARIO – nadchodzące mecze
# =============================================================================

@shared_task(name="matches.tasks.fetch_upcoming_matches")
def fetch_upcoming_matches_task():
    """Pobiera nadchodzące mecze (wywoływany 1× dziennie o ustalonej godzinie)."""
    logger.info("Celery Beat: Rozpoczynam pobieranie nadchodzących meczów...")
    fetch_upcoming_matches()
    return "Upcoming matches fetched!"


# =============================================================================
#  4. TABELARZ – tabele ligowe
# =============================================================================

@shared_task(name="matches.tasks.fetch_top_leagues_standings_task")
def fetch_top_leagues_standings_task():
    """Pobiera aktualną tabelę dla TOP lig (wywoływany 1× dziennie)."""
    top_leagues_ids = [
        2, 3, 8, 17, 8, 23, 35, 34, 202, 37, 238, 18, 52, 53, 44,
    ]
    logger.info("Celery: Rozpoczynam pobieranie tabel dla TOP lig...")
    success_count = 0
    for tournament_id in top_leagues_ids:
        try:
            fetch_league_standings(tournament_id=tournament_id)
            success_count += 1
        except Exception as e:
            logger.warning("Błąd pobierania tabeli dla ID %s: %s", tournament_id, e)
    return f"Pobrano tabele dla {success_count} lig"


# =============================================================================
#  5. GONIEC – wysyłka powiadomienia Push dla jednego zdarzenia
# =============================================================================

@shared_task(name="matches.tasks.send_match_event_notification")
def send_match_event_notification(
    match_api_id: int,
    home_team_api_id: int,
    away_team_api_id: int,
    event_title: str,
    event_body: str,
):
    """
    Wysyła Web Push dla danego zdarzenia meczowego do właściwych użytkowników.

    Logika wyboru odbiorców:
      A) Użytkownicy, którzy ręcznie subskrybowali mecz (dzwoneczek: is_active=True)
         LUB
      B) Fani, którzy mają jedną z grających drużyn w ulubionych
         CHYBA ŻE wyciszyli TEN mecz (is_active=False w MatchSubscription).

    Wymagania: MatchSubscription musi mieć FK do User (pole 'user').
    """
    if not WEBPUSH_AVAILABLE:
        logger.error("django-webpush nie jest zainstalowany – pomijam wysyłkę Push.")
        return "webpush unavailable"

    match_url = f"{_BASE_URL}/pl/match/{match_api_id}/"

    # A) Ręczni subskrybenci tego meczu (dzwoneczek włączony)
    subscribed_users = User.objects.filter(
        match_subscriptions__match__api_id=match_api_id,
        match_subscriptions__is_active=True,
    )

    # B) Fani drużyn – z wykluczeniem tych, którzy wyciszyli TEN mecz
    fans = User.objects.filter(
        favorite_teams__team__api_id__in=[home_team_api_id, away_team_api_id],
        favorite_teams__is_active=True,         # globalna gwiazdka włączona
    ).exclude(
        match_subscriptions__match__api_id=match_api_id,
        match_subscriptions__is_active=False,   # nie wyciszyli tego meczu
    )

    users_to_notify = (subscribed_users | fans).distinct()

    payload = {
        "head": event_title,
        "body": event_body,
        "url": match_url,
    }

    success_count = 0
    for user in users_to_notify:
        try:
            send_user_notification(user=user, payload=payload, ttl=3600)
            success_count += 1
        except Exception as e:
            logger.warning("Błąd Push do usera '%s': %s", user.username, e)

    logger.info("Push '%s' wysłany do %s użytkowników.", event_title, success_count)
    return f"Push '{event_title}' → {success_count} użytkowników"


# =============================================================================
#  6. MONITOR – detekcja nowych zdarzeń i triggerowanie Push
# =============================================================================

# Typy incydentów, które generują Push Notification
_PUSH_INCIDENT_TYPES = {"goal", "card", "varDecision", "inGamePenalty"}

# Mapowanie incydentClass → emoji + tytuł
_INCIDENT_LABELS = {
    # BRAMKI
    ("goal", "regular"):          ("⚽", "GOOOL!"),
    ("goal", "ownGoal"):          ("⚽", "Gol samobójczy!"),
    ("goal", "penalty"):          ("⚽", "Gol z rzutu karnego!"),
    # KARTKI
    ("card", "yellow"):           ("🟨", "Żółta kartka!"),
    ("card", "red"):              ("🟥", "Czerwona kartka!"),
    ("card", "yellowRed"):        ("🟨🟥", "Druga żółta!"),
    # VAR
    ("varDecision", "goalCancelled"):  ("❌", "Bramka anulowana (VAR)!"),
    ("varDecision", "cardUpgrade"):    ("📺", "Zmiana karty (VAR)!"),
    ("varDecision", "penaltyNotGiven"): ("📺", "Karny odwołany (VAR)!"),
    ("varDecision", "penaltyGiven"):   ("🎯", "Karny przyznany (VAR)!"),
    # RZUT KARNY (w trakcie meczu, nie seria)
    ("inGamePenalty", "scored"):  ("🎯", "Rzut karny – GOOL!"),
    ("inGamePenalty", "missed"):  ("💨", "Rzut karny – spudłowany!"),
    ("inGamePenalty", "penaltyAwarded"): ("🎯", "Podyktowany rzut karny!"),
}


def _fetch_incidents_for_match(api_match_id: int) -> list[dict]:
    """Pobiera incydenty dla meczu z SportAPI. Zwraca listę lub [] przy błędzie."""
    url = f"https://sportapi7.p.rapidapi.com/api/v1/event/{api_match_id}/incidents"
    try:
        resp = requests.get(url, headers=_api_headers(), timeout=10)
        if resp.status_code == 200:
            return resp.json().get("incidents", [])
        logger.warning("API incidents %s: HTTP %s", api_match_id, resp.status_code)
    except Exception as e:
        logger.warning("Błąd sieciowy incidents %s: %s", api_match_id, e)
    return []


def _build_push_body(inc: dict, home_name: str, away_name: str,
                     home_score: int, away_score: int) -> str:
    """Buduje treść Push na podstawie incydentu."""
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


@shared_task(name="matches.tasks.monitor_live_matches")
def monitor_live_matches():
    """
    GŁÓWNY STRAŻNIK PUSH NOTIFICATIONS.

    Uruchamiany co ~60 s przez Celery Beat.
    Dla każdego aktywnego meczu Live:
      1. Pobiera incydenty z API
      2. Porównuje z notified_event_ids (pamięć meczu)
      3. Dla nowych ważnych incydentów → triggeruje send_match_event_notification
      4. Wykrywa zmianę wyniku → Push o bramce (osobna ścieżka bo API czasem wolno)
      5. Zapisuje zaktualizowaną listę notified_event_ids do bazy
    """
    # Tylko mecze które faktycznie trwają (nie zakończone, nie nierozpoczęte)
    active_matches = LiveMatch.objects.select_related(
        "home_team", "away_team"
    ).exclude(status__iexact="Ended").exclude(status__iexact="Not started")

    checked = 0
    pushed = 0

    for match in active_matches:
        if not match.home_team or not match.away_team:
            continue

        home_name = match.home_team.name
        away_name = match.away_team.name
        home_api_id = match.home_team.api_id
        away_api_id = match.away_team.api_id

        # 1. Pobierz incydenty z API
        incidents = _fetch_incidents_for_match(match.api_id)

        # 2. Załaduj "pamięć" meczu – co już wysłaliśmy
        already_notified: list = match.notified_event_ids or []
        already_notified_set: set = set(already_notified)
        new_notified_ids: list = []

        # 3. Procesuj incydenty
        for inc in incidents:
            inc_id = str(inc.get("id", ""))
            if not inc_id or inc_id in already_notified_set:
                continue  # Już powiadomiliśmy lub brak ID

            inc_type = inc.get("incidentType", "")
            inc_class = inc.get("incidentClass", "") or ""

            if inc_type not in _PUSH_INCIDENT_TYPES:
                continue  # Pomijamy zmiany, przerwy itp.

            # Sprawdź czy mamy label dla tego zdarzenia
            label_key = (inc_type, inc_class)
            label_info = _INCIDENT_LABELS.get(label_key)
            if label_info is None:
                # Fallback dla nieznanych klas
                if inc_type == "goal":
                    label_info = ("⚽", "GOOOL!")
                elif inc_type == "card":
                    label_info = ("🃏", "Kartka!")
                else:
                    continue  # Nieznany typ – pomijamy

            emoji, title_base = label_info

            # Tytuł zawiera emoji + nazwy drużyn
            full_title = f"{emoji} {title_base} | {home_name} – {away_name}"

            # Wynik z incydentu (dla bramek) lub aktualny z meczu
            inc_home_score = inc.get("homeScore") if inc_type == "goal" else match.home_score
            inc_away_score = inc.get("awayScore") if inc_type == "goal" else match.away_score
            if inc_home_score is None:
                inc_home_score = match.home_score
            if inc_away_score is None:
                inc_away_score = match.away_score

            body = _build_push_body(inc, home_name, away_name, inc_home_score, inc_away_score)

            # 4. Triggeruj wysyłkę asynchronicznie
            send_match_event_notification.delay(
                match_api_id=match.api_id,
                home_team_api_id=home_api_id,
                away_team_api_id=away_api_id,
                event_title=full_title,
                event_body=body,
            )
            new_notified_ids.append(inc_id)
            pushed += 1
            logger.info(
                "🔔 Push zakolejkowany: [%s] %s (%s)", match.api_id, title_base, inc_id
            )

        # 5. Sprawdzenie zmiany wyniku (fallback gdy API incidents wolno)
        current_score_str = f"{match.home_score}:{match.away_score}"
        if (
            current_score_str != match.last_notified_score
            and match.home_score + match.away_score > sum(
                int(x) for x in match.last_notified_score.split(":")
            )
        ):
            # Bramka — ale sprawdź czy nie było już zdarzenia goal w tym przebiegu
            score_push_already_sent = any(
                inc.get("incidentType") == "goal" for inc in incidents
                if str(inc.get("id", "")) in set(new_notified_ids)
            )
            if not score_push_already_sent:
                score_title = f"⚽ GOOOL! | {home_name} – {away_name}"
                score_body = f"{home_name} {current_score_str} {away_name}"
                send_match_event_notification.delay(
                    match_api_id=match.api_id,
                    home_team_api_id=home_api_id,
                    away_team_api_id=away_api_id,
                    event_title=score_title,
                    event_body=score_body,
                )
                pushed += 1
                logger.info("🔔 Push wynikowy zakolejkowany: %s", current_score_str)

        # 6. Zapisz stan (tylko jeśli coś nowego)
        if new_notified_ids or current_score_str != match.last_notified_score:
            LiveMatch.objects.filter(pk=match.pk).update(
                notified_event_ids=already_notified + new_notified_ids,
                last_notified_score=current_score_str,
            )

        checked += 1

    logger.info(
        "monitor_live_matches: sprawdzono %s meczów, zakolejkowano %s Push.", checked, pushed
    )
    return f"Sprawdzono {checked} meczów, zakolejkowano {pushed} Push."