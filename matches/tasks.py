from celery import shared_task
from .services import sync_live_matches

@shared_task
def sync_football_data():
    """To zadanie pobiera mecze w tle nie blokując działania strony."""
    print("Celery: Rozpoczynam pobieranie meczów z API...")
    sync_live_matches()
    return "Mecze zaktualizowane pomyślnie!"