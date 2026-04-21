from unittest.mock import patch

from matches.tasks import (
    fetch_match_details_task,
    fetch_top_leagues_standings_task,
    fetch_upcoming_matches_task,
    sync_live_matches,
)

# ==========================================
# TESTY: ZADANIA CELERY (TASKS)
# ==========================================
# Uwaga: po migracji do pakietu tasks/ ścieżki patchowania wskazują
# na podmoduły, gdzie faktycznie importowane są serwisy.


@patch("matches.tasks.sync_tasks.sync_live_matches_service")
def test_sync_live_matches_task(mock_sync_service):
    result = sync_live_matches()
    mock_sync_service.assert_called_once()
    assert result == "Live matches synced!"


@patch("matches.tasks.sync_tasks.fetch_match_details")
def test_fetch_match_details_task(mock_fetch_details):
    result = fetch_match_details_task(local_match_id=10, api_match_id=999)
    mock_fetch_details.assert_called_once_with(local_match_id=10, api_match_id=999)
    assert result == "Details fetched for match 10"


@patch("matches.tasks.calendar_tasks.fetch_upcoming_matches")
def test_fetch_upcoming_matches_task(mock_fetch_upcoming):
    result = fetch_upcoming_matches_task()
    mock_fetch_upcoming.assert_called_once()
    assert result == "Upcoming matches fetched!"


# ==========================================
# TESTY: POBIERANIE TOP LIG (Z błędami)
# ==========================================


@patch("matches.tasks.calendar_tasks.fetch_league_standings")
def test_fetch_top_leagues_standings_task_success(mock_fetch_standings):
    result = fetch_top_leagues_standings_task()
    # 15 ID na liście top_leagues_ids w calendar_tasks.py
    assert mock_fetch_standings.call_count == 15
    assert result == "Pobrano tabele dla 15 lig"


@patch("matches.tasks.calendar_tasks.fetch_league_standings")
def test_fetch_top_leagues_standings_task_with_exceptions(mock_fetch_standings):
    def side_effect_standings(tournament_id):
        if tournament_id == 2:
            raise Exception("Awaria API dla Ligi Mistrzów")
        return []

    mock_fetch_standings.side_effect = side_effect_standings

    result = fetch_top_leagues_standings_task()

    # Pętla idzie dalej po błędzie – 15 wywołań
    assert mock_fetch_standings.call_count == 15
    # Champions League (ID=2) popsute – sukces = 14
    assert result == "Pobrano tabele dla 14 lig"
