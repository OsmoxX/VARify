"""
matches/tasks/__init__.py

Pakiet Celery tasks dla aplikacji matches.
Importuje wszystkie zadania z podmodułów, dzięki czemu:
  - Celery auto-discovery (CELERY_IMPORTS lub autodiscovery) działa poprawnie
  - Nazwy tasków (np. "matches.tasks.sync_live_matches") pozostają niezmienione
  - Stary import `from matches.tasks import sync_live_matches` nadal działa

Struktura:
  sync_tasks.py      → synchronizacja meczów live, pobieranie szczegółów
  calendar_tasks.py  → nadchodzące mecze, tabele ligowe
  push_tasks.py      → monitor zdarzeń (główny strażnik Push) + wysyłka Web Push
"""

from .sync_tasks import (
    sync_live_matches,
    fetch_match_details_task,
    fetch_last_matches_team_task,
)

from .calendar_tasks import (
    fetch_upcoming_matches_task,
    fetch_top_leagues_standings_task,
)

from .push_tasks import (
    send_match_event_notification,
    process_match_incidents_and_notify,
)

__all__ = [
    # Sync
    "sync_live_matches",
    "fetch_match_details_task",
    "fetch_last_matches_team_task",
    # Calendar
    "fetch_upcoming_matches_task",
    "fetch_top_leagues_standings_task",
    # Push
    "send_match_event_notification",
    "process_match_incidents_and_notify",
]
