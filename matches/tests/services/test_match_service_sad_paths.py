import pytest
from unittest.mock import patch, MagicMock
from matches.models import LiveMatch, League, Team
from matches.services.match_service import (
    fetch_live_matches,
    sync_live_matches,
    fetch_match_details,
    fetch_upcoming_matches,
    fetch_last_matches_for_team,
    _check_new_incidents
)

# ==========================================
# FABRYKA DANYCH
# ==========================================
@pytest.fixture
def setup_match():
    l = League.objects.create(api_id=1, name="Test League")
    t1 = Team.objects.create(api_id=1, name="Team 1")
    t2 = Team.objects.create(api_id=2, name="Team 2")
    return LiveMatch.objects.create(api_id=999, league=l, home_team=t1, away_team=t2, id=10, home_score=0, away_score=0)

# ==========================================
# TESTY: AWARIE SIECI (Sad Paths)
# ==========================================

@pytest.mark.django_db
@patch('matches.services.match_service.requests.get')
def test_fetch_live_matches_errors(mock_get):
    # API zwraca status 500 (błąd serwera)
    mock_get.return_value.status_code = 500
    assert fetch_live_matches() is None
    
    # Całkowity brak połączenia (Timeout / Exception)
    mock_get.side_effect = Exception("Sieć wybuchła")
    assert fetch_live_matches() is None

@pytest.mark.django_db
@patch('matches.services.match_service.requests.get')
def test_fetch_match_details_api_errors(mock_get, setup_match):
    # API zwraca status 404 (nie znaleziono) na wszystkie zapytania (status, incidents, lineups, stats)
    mock_get.return_value.status_code = 404
    fetch_match_details(local_match_id=setup_match.id, api_match_id=999)
    
    # Wyjątki dla wszystkich 4 zapytań
    mock_get.side_effect = Exception("API leży")
    fetch_match_details(local_match_id=setup_match.id, api_match_id=999)

@pytest.mark.django_db
@patch('matches.services.match_service.requests.get')
def test_fetch_upcoming_matches_errors(mock_get):
    # Odpowiedź 404
    mock_get.return_value.status_code = 404
    fetch_upcoming_matches()
    
    # Wyjątek sieci
    mock_get.side_effect = Exception("Brak neta")
    fetch_upcoming_matches()

@pytest.mark.django_db
@patch('matches.services.match_service.requests.get')
def test_fetch_last_matches_for_team_errors(mock_get):
    # Odpowiedź 404
    mock_get.return_value.status_code = 404
    assert fetch_last_matches_for_team(1) == []
    
    # Wyjątek sieci
    mock_get.side_effect = Exception("Timeout")
    assert fetch_last_matches_for_team(1) == []

@pytest.mark.django_db
@patch('matches.services.match_service.requests.get')
def test_check_new_incidents_errors(mock_get, setup_match):
    # 404 i Wyjątki przy dociąganiu incydentów dla Subskrybentów WebSocket
    mock_get.return_value.status_code = 404
    _check_new_incidents(setup_match, 999, setup_match.home_team, setup_match.away_team, None, "room")
    
    mock_get.side_effect = Exception("Fail")
    _check_new_incidents(setup_match, 999, setup_match.home_team, setup_match.away_team, None, "room")

# ==========================================
# TESTY: USZKODZONE DANE Z API
# ==========================================

@pytest.mark.django_db
def test_fetch_match_details_missing_local_match():
    # Szukamy meczu, którego nie mamy w bazie lokalnej (LiveMatch.DoesNotExist)
    assert fetch_match_details(local_match_id=99999, api_match_id=123) is False

@pytest.mark.django_db
@patch('matches.services.match_service.fetch_live_matches')
def test_sync_live_matches_empty_data(mock_fetch):
    # API zwraca pusty JSON
    mock_fetch.return_value = None
    sync_live_matches() 
    
    mock_fetch.return_value = {"bad_key": "no events here"}
    sync_live_matches()

@pytest.mark.django_db
@patch('matches.services.match_service.fetch_live_matches')
def test_sync_live_matches_corrupted_json(mock_fetch):
    # Brak klucza "tournament" wewnątrz wydarzenia wywoła KeyError, 
    # który musi zostać złapany przez wbudowanego w pętlę excepta!
    mock_fetch.return_value = {'events': [{'id': 123}]} 
    sync_live_matches()

@pytest.mark.django_db
@patch('matches.services.match_service.requests.get')
def test_fetch_upcoming_matches_corrupted_json(mock_get):
    # Brak klucza "tournament" wywoła KeyError łapany w except
    mock_get.return_value.status_code = 200
    mock_get.return_value.json.return_value = {'events': [{'status': {'type': 'notstarted'}, 'id': 1}]}
    fetch_upcoming_matches()

@pytest.mark.django_db
@patch('matches.services.match_service.requests.get')
def test_fetch_last_matches_corrupted_json(mock_get):
    # Brak klucza id wewnątrz tournament wywoła KeyError łapany w except
    mock_get.return_value.status_code = 200
    mock_get.return_value.json.return_value = {'events': [{'id': 1, 'tournament': {}}]} 
    fetch_last_matches_for_team(1)

# ==========================================
# TESTY: AWARIE WEBSOCKETÓW
# ==========================================

@pytest.mark.django_db
@patch('matches.services.match_service.async_to_sync')
@patch('matches.services.match_service.fetch_live_matches')
def test_sync_live_matches_ws_exceptions(mock_fetch, mock_async, setup_match):
    # Celowo zmuszamy funkcję wysyłającą WebSockety do awarii
    mock_async.side_effect = Exception("Kanał WS zablokowany!")
    
    # Dostarczamy poprawne dane, w których zmienił się WYNIK i STATUS (żeby sprowokować WS do wysyłki)
    mock_fetch.return_value = {
        'events': [{
            'id': 999,
            'tournament': {'id': 1, 'name': 'L'},
            'homeTeam': {'id': 1, 'name': 'T1'},
            'awayTeam': {'id': 2, 'name': 'T2'},
            'homeScore': {'current': 5},  # Padło 5 goli
            'awayScore': {'current': 0},
            'status': {'description': 'Ended'} # Mecz się skończył
        }]
    }
    
    # Powinno wypisać w konsoli "Błąd wysyłki WS", ale funkcja ma się nie wysypać!
    sync_live_matches()