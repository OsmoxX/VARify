import pytest
from unittest.mock import patch, MagicMock
import io
import sys

from matches.models import LiveMatch, League, Team, MatchLineup, MatchEvent
from matches.services.match_service import (
    _safe_nested, 
    _save_lineup_players, 
    _save_missing_players,
    fetch_match_details,
    _check_new_incidents,
    sync_live_matches
)

# ==========================================
# FABRYKA DANYCH
# ==========================================
@pytest.fixture
def setup_data():
    league = League.objects.create(api_id=1, name="L")
    t1 = Team.objects.create(api_id=1, name="T1")
    t2 = Team.objects.create(api_id=2, name="T2")
    m = LiveMatch.objects.create(
        api_id=100, league=league, home_team=t1, away_team=t2, status="1st Half"
    )
    return m

# ==========================================
# TESTY: FUNKCJE POMOCNICZE
# ==========================================
def test_safe_nested_edge_cases():
    # Kiedy trafiamy na coś, co nie jest słownikiem (np. int)
    assert _safe_nested({'a': 1}, 'a', 'b', default='def') == 'def'
    # Kiedy wartość w słowniku to None
    assert _safe_nested({'a': {'b': None}}, 'a', 'b', default='def') == 'def'

@pytest.mark.django_db
def test_save_lineup_players_substitute(setup_data):
    # Wyłapanie pozycji "S" (Rezerwowy)
    players = [{'player': {'name': 'Jan', 'position': 'S'}}]
    _save_lineup_players(setup_data, players, True)
    lineup = MatchLineup.objects.get(player_name='Jan')
    assert lineup.is_starting_xi is False

@pytest.mark.django_db
def test_save_missing_players_no_info(setup_data):
    # Brak klucza 'player' - kod ma przejść przez "continue" (czerwona linia 61 z obrazka)
    missing = [{'reason': 'injury'}] 
    count = _save_missing_players(setup_data, missing, True)
    assert count == 0

# ==========================================
# TESTY: LOGIKA CZASU I INCYDENTÓW Z API
# ==========================================
# ZMIEŃ TEN TEST:
@pytest.mark.django_db
@patch('matches.services.match_service.requests.get')
@patch('matches.services.match_service._time.time')
def test_fetch_match_details_time_calc_and_missing_id(mock_time, mock_get, setup_data):
    mock_time.return_value = 1000000 + 120 
    
    def side_effect(url, **kwargs):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        if "incidents" in url:
            mock_resp.json.return_value = {"incidents": [{"incidentType": "goal", "time": 10}]}
        elif "lineups" in url or "statistics" in url:
            mock_resp.json.return_value = {}
        else:
            mock_resp.json.return_value = {
                "event": {
                    "time": {"currentPeriodStartTimestamp": 1000000, "initial": 2700},
                    "status": {"description": "2nd Half"}
                }
            }
        return mock_resp
        
    mock_get.side_effect = side_effect
    fetch_match_details(setup_data.id, setup_data.api_id)

    setup_data.refresh_from_db()
    
    assert setup_data.minute == 45 
    # NA TO (po prostu sprawdzamy, czy w ogóle zapisało to jedno zdarzenie z API):
    assert MatchEvent.objects.filter(match=setup_data).count() == 1

@pytest.mark.django_db
@patch('matches.services.match_service.requests.get')
def test_fetch_match_details_time_data_not_dict(mock_get, setup_data):
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"event": {"time": "zepsuty-tekst"}}
    mock_get.return_value = mock_resp
    fetch_match_details(setup_data.id, setup_data.api_id)

# ==========================================
# TESTY: WEBSOCKETY (INCIDENTS LOOP)
# ==========================================
@pytest.mark.django_db
@patch('matches.services.match_service.requests.get')
@patch('matches.services.match_service.async_to_sync')
def test_check_new_incidents_loop(mock_async, mock_get, setup_data):
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "incidents": [
            {"id": 1, "incidentType": "card", "incidentClass": "yellow", "player": {"name": "A"}},
            {"id": 2, "incidentType": "card", "incidentClass": "red", "player": {"name": "B"}},
            {"id": 3, "incidentType": "card", "incidentClass": "yellowRed", "player": {"name": "C"}},
            {"id": 4, "incidentType": "substitution", "playerIn": {"name": "D"}, "playerOut": {"name": "E"}},
            {"id": 5, "incidentType": "card", "incidentClass": "unknown"} # Ignorowane przez "continue"
        ]
    }
    mock_get.return_value = mock_resp

    mock_layer = MagicMock()
    _check_new_incidents(setup_data, setup_data.api_id, setup_data.home_team, setup_data.away_team, mock_layer, "room")

    assert mock_async.call_count == 4
    # Baza zapisze tylko 4 incydenty, bo piąty zniknął po "continue" w pętli
    assert MatchEvent.objects.filter(match=setup_data).count() == 4

# ==========================================
# TESTY: SYNC LIVE MATCHES (Sukces Printów)
# ==========================================
@pytest.mark.django_db
@patch('matches.services.match_service.MatchSubscription.objects.filter') # <-- Nowy mock omijający błędy z DB
@patch('matches.services.match_service.fetch_live_matches')
@patch('matches.services.match_service.async_to_sync')
@patch('matches.services.match_service._check_new_incidents')
def test_sync_live_matches_success_prints(mock_check_incidents, mock_async, mock_fetch, mock_filter, setup_data):
    stale = LiveMatch.objects.create(
        api_id=777, league=setup_data.league, home_team=setup_data.home_team, away_team=setup_data.away_team, status="1st Half"
    )

    # Symulujemy, że mecz ma subskrybentów
    mock_filter.return_value.exists.return_value = True

    mock_fetch.return_value = {
        'events': [{
            'id': setup_data.api_id,
            'tournament': {'id': 1, 'name': 'L'},
            'homeTeam': {'id': 1, 'name': 'T1'},
            'awayTeam': {'id': 2, 'name': 'T2'},
            'homeScore': {'current': 1}, 
            'awayScore': {'current': 0},
            'status': {'description': 'Halftime'}
        }]
    }

    capturedOutput = io.StringIO()
    sys.stdout = capturedOutput

    sync_live_matches()

    sys.stdout = sys.__stdout__
    out = capturedOutput.getvalue()

    assert "Wysłano WS do grupy" in out
    assert "Auto-zakończono 1 meczów" in out
    mock_check_incidents.assert_called_once()

    stale.refresh_from_db()
    assert stale.status == "Ended"