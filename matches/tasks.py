from celery import shared_task
from .services import sync_live_matches as sync_live_matches_service
from .services import fetch_match_details


@shared_task(name='matches.tasks.sync_live_matches')
def sync_live_matches():
    """
    MECHANIZM 1 – STRAŻNIK
    Uruchamiany automatycznie co 3 minuty przez Celery Beat.
    Sprawdza mecze live i aktualizuje ich status/wynik w bazie.
    """
    print("Celery Beat: Rozpoczynam synchronizację meczów live...")
    sync_live_matches_service()
    return "Live matches synced!"


@shared_task(name='matches.tasks.fetch_match_details_task')
def fetch_match_details_task(local_match_id: int, api_match_id: int):
    """
    MECHANIZM 3 – WYDOBYWCA (wersja asynchroniczna)
    Pobiera zdarzenia, składy i statystyki meczu w tle.
    Wywoływany przy pierwszym kliknięciu w mecz (jeśli brak danych).
    """
    print(f"Celery: Pobieram szczegóły meczu local_id={local_match_id}, api_id={api_match_id}...")
    fetch_match_details(local_match_id=local_match_id, api_match_id=api_match_id)
    return f"Details fetched for match {local_match_id}"