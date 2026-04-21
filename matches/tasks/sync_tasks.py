"""
matches/tasks/sync_tasks.py

Zadania Celery związane z synchronizacją meczów na żywo.

Architektura event-driven:
  Celery Beat (co 60s)
    → sync_live_matches          ← JEDYNE zadanie w harmonogramie
      → wykrywa zmianę wyniku/statusu
      → process_match_incidents_and_notify.delay(api_id)  ← trigger
          → wysyła Web Push tylko dla meczów z realną zmianą
"""

import logging

from celery import shared_task
from django.core.cache import cache

from matches.services import (
    fetch_last_matches_for_team,
    fetch_match_details,
    sync_live_matches as sync_live_matches_service,
)

logger = logging.getLogger(__name__)


@shared_task(name="matches.tasks.sync_live_matches")
def sync_live_matches():
    """
    STRAŻNIK + TRIGGER – jedyne zadanie w CELERY_BEAT_SCHEDULE, co 60 sekund.

    1. Synchronizuje stan meczów live z API do bazy danych.
    2. Wykrywa mecze, w których nastąpiła zmiana (wynik / status).
    3. Dla każdego zmienionego meczu triggeruje process_match_incidents_and_notify.delay()

    Blokada cache (55s) zapobiega nakładaniu się zadań przy spowolnieniu API.
    """
    lock_id = "lock_sync_live_matches"
    if not cache.add(lock_id, "true", 55):
        logger.warning("Celery: Pominięto synchronizację - zadanie zablokowane (lock 55s).")
        return "Skipped (already running)"

    logger.info("Celery Beat: Rozpoczynam synchronizację meczów live...")
    changed_api_ids = sync_live_matches_service()

    if changed_api_ids:
        # Importujemy wewnątrz funkcji, żeby uniknąć cyklicznych importów
        from matches.tasks.push_tasks import process_match_incidents_and_notify

        for api_id in changed_api_ids:
            process_match_incidents_and_notify.delay(api_id)

        logger.info(
            "Celery: Zakolejkowano %s zadań Push (event-driven, tylko zmienione mecze).",
            len(changed_api_ids),
        )
    else:
        logger.info("Celery: Brak istotnych zmian — 0 zapytań o incydenty.")

    return (
        f"Synced. Triggered push for {len(changed_api_ids or [])} changed matches."
    )


@shared_task(name="matches.tasks.fetch_match_details_task")
def fetch_match_details_task(local_match_id: int, api_match_id: int):
    """
    WYDOBYWCA – uruchamiany asynchronicznie (lazy-load przy wejściu na stronę meczu).
    Pobiera zdarzenia, składy i statystyki meczu z API.
    Blokada 60s zapobiega wielokrotnemu odpytywaniu API dla tego samego meczu.
    """
    lock_id = f"lock_fetch_match_details_{api_match_id}"
    if cache.add(lock_id, "true", 60):
        logger.info(
            "Celery: Pobieram szczegóły meczu local_id=%s, api_id=%s...",
            local_match_id,
            api_match_id,
        )
        fetch_match_details(local_match_id=local_match_id, api_match_id=api_match_id)
        return f"Details fetched for match {local_match_id}"
    else:
        return f"Skipped details fetch (locked) for match {local_match_id}"


@shared_task(name="matches.tasks.fetch_last_matches_team_task")
def fetch_last_matches_team_task(team_api_id: int, n: int = 5):
    """
    ZWIADOWCA DRUŻYNY – uruchamiany asynchronicznie w tle, gdy brak meczów w DB.
    Blokada 300s (5 min) chroni przez spamowaniem API przy wielu wejściach na profil.
    """
    lock_id = f"lock_fetch_last_matches_{team_api_id}"
    if cache.add(lock_id, "true", 300):
        logger.info("Celery: Pobieram ostatnie mecze dla team_api_id=%s", team_api_id)
        fetch_last_matches_for_team(team_api_id=team_api_id, n=n)
        return f"Fetched past matches for team {team_api_id}"
    else:
        return f"Skipped team match fetch (locked) {team_api_id}"
