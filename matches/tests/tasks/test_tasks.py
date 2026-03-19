import pytest
from unittest.mock import patch
from matches.tasks import (
    sync_live_matches,
    fetch_match_details_task,
    fetch_upcoming_matches_task,
    fetch_top_leagues_standings_task
)

# ==========================================
# TESTY: ZADANIA CELERY (TASKS)
# ==========================================

@patch('matches.tasks.sync_live_matches_service')
def test_sync_live_matches_task(mock_sync_service):
    # ACT: Odpalamy taska
    result = sync_live_matches()
    
    # ASSERT: Sprawdzamy czy poprawnie uruchomił serwis pod spodem
    mock_sync_service.assert_called_once()
    assert result == "Live matches synced!"

@patch('matches.tasks.fetch_match_details')
def test_fetch_match_details_task(mock_fetch_details):
    # ACT: Odpalamy taska z parametrami
    result = fetch_match_details_task(local_match_id=10, api_match_id=999)
    
    # ASSERT: Sprawdzamy czy przekazał parametry dalej do serwisu
    mock_fetch_details.assert_called_once_with(local_match_id=10, api_match_id=999)
    assert result == "Details fetched for match 10"

@patch('matches.tasks.fetch_upcoming_matches')
def test_fetch_upcoming_matches_task(mock_fetch_upcoming):
    # ACT
    result = fetch_upcoming_matches_task()
    
    # ASSERT
    mock_fetch_upcoming.assert_called_once()
    assert result == "Upcoming matches fetched!"

# ==========================================
# TESTY: POBIERANIE TOP LIG (Z błędami)
# ==========================================

@patch('matches.tasks.fetch_league_standings')
def test_fetch_top_leagues_standings_task_success(mock_fetch_standings):
    # ACT: Uruchamiamy pobieranie tabel
    result = fetch_top_leagues_standings_task()
    
    # ASSERT: Masz 15 ID na liście `top_leagues_ids` w pliku tasks.py!
    # Upewniamy się, że pętla wykonała się dokładnie 15 razy.
    assert mock_fetch_standings.call_count == 15
    assert result == "Pobrano tabele dla 15 lig z TOP 12"

@patch('matches.tasks.fetch_league_standings')
def test_fetch_top_leagues_standings_task_with_exceptions(mock_fetch_standings):
    # ARRANGE: Magia symulacji błędów w pętli.
    # Sprawimy, że dla 'Champions League' (ID=2) funkcja rzuci błąd, 
    # a dla reszty zadziała normalnie.
    def side_effect_standings(tournament_id):
        if tournament_id == 2:
            raise Exception("Awaria API dla Ligi Mistrzów")
        return [] # Sukces dla reszty

    mock_fetch_standings.side_effect = side_effect_standings

    # ACT
    result = fetch_top_leagues_standings_task()

    # ASSERT
    # Funkcja i tak powinna spróbować wywołać się 15 razy (pętla idzie dalej po błędzie)
    assert mock_fetch_standings.call_count == 15
    
    # Ale licznik sukcesów powinien wynosić 14! (15 minus 1 awaria)
    assert result == "Pobrano tabele dla 14 lig z TOP 12"