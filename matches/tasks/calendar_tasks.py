"""
matches/tasks/calendar_tasks.py

Zadania Celery związane z kalendarzem i tabelami:
  - fetch_upcoming_matches_task        → nadchodzące mecze (1× dziennie)
  - fetch_top_leagues_standings_task   → tabele ligowe (1× dziennie)
"""

import logging

from celery import shared_task

from matches.services import fetch_league_standings, fetch_upcoming_matches

logger = logging.getLogger(__name__)


@shared_task(name="matches.tasks.fetch_upcoming_matches")
def fetch_upcoming_matches_task():
    """
    CALENDARIO – uruchamiany 1× dziennie przez Celery Beat.
    Pobiera mecze zaplanowane na dziś i 4 kolejne dni.
    """
    logger.info("Celery Beat: Rozpoczynam pobieranie nadchodzących meczów...")
    fetch_upcoming_matches()
    return "Upcoming matches fetched!"


@shared_task(name="matches.tasks.fetch_top_leagues_standings_task")
def fetch_top_leagues_standings_task():
    """
    TABELARZ – uruchamiany 1× dziennie przez Celery Beat.
    Pobiera i odświeża tabele ligowe dla wyselekcjonowanych TOP lig.
    """
    top_leagues_ids = [
        2,    # Champions League
        3,    # Europa League
        8,    # Conference League
        17,   # Premier League
        8,  # LaLiga  (TODO: potwierdź ID w SportAPI jeśli liga nie pobiera się poprawnie)
        23,   # Serie A
        35,   # Bundesliga
        34,   # Ligue 1
        202,  # Ekstraklasa
        37,   # Eredivisie
        238,  # Liga Portugal
        18,   # Championship
        52,   # Süper Lig
        53,   # Scottish Premiership
        44,   # Pro League (Belgium)
    ]
    # Deduplikacja na wypadek pomyłki w liście (zachowuje kolejność)
    top_leagues_ids = list(dict.fromkeys(top_leagues_ids))

    logger.info("Celery: Rozpoczynam pobieranie tabel dla TOP lig...")
    success_count = 0
    for tournament_id in top_leagues_ids:
        try:
            fetch_league_standings(tournament_id=tournament_id)
            success_count += 1
        except Exception as e:
            logger.warning("Błąd pobierania tabeli dla ID %s: %s", tournament_id, e)
    return f"Pobrano tabele dla {success_count} lig"
