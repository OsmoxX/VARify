from celery import shared_task
from .services import sync_live_matches as sync_live_matches_service
from .services import (
    fetch_match_details,
    fetch_upcoming_matches,
    fetch_league_standings,
)


@shared_task(name="matches.tasks.sync_live_matches")
def sync_live_matches():
    """
    MECHANIZM 1 – STRAŻNIK
    Uruchamiany automatycznie co 3 minuty przez Celery Beat.
    Sprawdza mecze live i aktualizuje ich status/wynik w bazie.
    """
    print("Celery Beat: Rozpoczynam synchronizację meczów live...")
    sync_live_matches_service()
    return "Live matches synced!"


@shared_task(name="matches.tasks.fetch_match_details_task")
def fetch_match_details_task(local_match_id: int, api_match_id: int):
    """
    MECHANIZM 3 – WYDOBYWCA (wersja asynchroniczna)
    Pobiera zdarzenia, składy i statystyki meczu w tle.
    Wywoływany przy pierwszym kliknięciu w mecz (jeśli brak danych).
    """
    print(
        f"Celery: Pobieram szczegóły meczu local_id={local_match_id}, api_id={api_match_id}..."
    )
    fetch_match_details(local_match_id=local_match_id, api_match_id=api_match_id)
    return f"Details fetched for match {local_match_id}"


@shared_task(name="matches.tasks.fetch_upcoming_matches")
def fetch_upcoming_matches_task():
    """
    MECHANIZM 2 – PRZEWIDYWANIE (wersja asynchroniczna)
    Pobiera nadchodzące mecze na dany dzień.
    Wywoływany raz dziennie o północy przez Celery Beat.
    """
    print("Celery Beat: Rozpoczynam pobieranie nadchodzących meczów...")
    fetch_upcoming_matches()
    return "Upcoming matches fetched!"


@shared_task(name="matches.tasks.fetch_top_leagues_standings_task")
def fetch_top_leagues_standings_task():
    """
    Pobiera aktualną tabelę dla zdefiniowanych TOP lig.
    Wywoływane automatycznie codziennie np. o 02:00 przez Celery Beat.
    """
    # Lista wyselekcjonowanych niezmiennych ID turniejów ze SportAPI
    top_leagues_ids = [
        2,  # Champions League
        3,  # Europa League
        8,  # Conference League
        17,  # Premier League
        8,  # LaLiga
        23,  # Serie A
        35,  # Bundesliga
        34,  # Ligue 1
        202,  # Ekstraklasa
        37,  # Eredivisie
        238,  # Liga Portugal
        18,  # Championship
        52,  # Süper Lig
        53,  # Scottish Premiership
        44,  # Pro League (Belgium)
    ]

    print("Celery: Rozpoczynam pobieranie tabel dla TOP 12 lig...")
    success_count = 0

    for tournament_id in top_leagues_ids:
        try:
            # Automatycznie pobiera najwyższy trwający 'season_id' i odświeża tabelę
            fetch_league_standings(tournament_id=tournament_id)
            success_count += 1
        except Exception as e:
            print(f"Błąd pobierania tabeli dla ID {tournament_id}: {e}")

    return f"Pobrano tabele dla {success_count} lig z TOP 12"
