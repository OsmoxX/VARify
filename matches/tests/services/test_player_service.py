import pytest
import requests
from unittest.mock import patch
from datetime import datetime
from matches.services.player_service import fetch_player, search_players_from_api

# ==========================================
# TESTY: fetch_player (Pobieranie szczegółów)
# ==========================================
@pytest.mark.django_db
@patch('matches.services.player_service.requests.get')
def test_fetch_player_success(mock_get):
    # 1. ARRANGE: Przygotowujemy potężnego JSON-a ze wszystkimi detalami
    mock_get.return_value.status_code = 200
    mock_get.return_value.json.return_value = {
        "player": {
            "name": "Lionel Messi",
            "firstName": "Lionel",
            "lastName": "Messi",
            "position": "F",
            "shirtNumber": 10,
            "height": 170,
            "preferredFoot": "Left",
            "marketValue": 50000000,
            "dateOfBirthTimestamp": 551577600, # Unix timestamp (połowa lat 80tych)
            "contractUntilTimestamp": 1751241600,
            "country": {"name": "Argentina"},
            "retired": False,
            "team": {"id": 101, "name": "Inter Miami"}
        }
    }
    
    # 2. ACT
    player = fetch_player(10)
    
    # 3. ASSERT: Sprawdzamy czy zmapowało wszystko jak trzeba
    assert player is not None
    assert player.name == "Lionel Messi"
    assert player.jersey_number == 10
    assert player.preferred_foot == "Left"
    assert player.nationality == "Argentina"
    
    # Sprawdzamy, czy funkcja wewnętrzna parse_ts poprawnie zamieniła sekundy na datę
    expected_dob = datetime.fromtimestamp(551577600).date()
    assert player.date_of_birth == expected_dob
    
    # Sprawdzamy, czy utworzyło klucz obcy do drużyny
    assert player.team.name == "Inter Miami"
    assert player.team.api_id == 101

@pytest.mark.django_db
@patch('matches.services.player_service.requests.get')
def test_fetch_player_no_data(mock_get):
    # ARRANGE: API zwraca pustą odpowiedź (brak klucza 'player')
    mock_get.return_value.status_code = 200
    mock_get.return_value.json.return_value = {} 
    
    # ACT & ASSERT
    assert fetch_player(99) is None

@pytest.mark.django_db
@patch('matches.services.player_service.requests.get')
def test_fetch_player_request_exception(mock_get):
    # ARRANGE: Udajemy twardy błąd biblioteki requests
    mock_get.side_effect = requests.exceptions.RequestException("Błąd HTTP")
    
    # ACT & ASSERT
    assert fetch_player(10) is None

# ==========================================
# TESTY: search_players_from_api (Wyszukiwarka)
# ==========================================
@pytest.mark.django_db
@patch('matches.services.player_service.requests.get')
def test_search_players_success_first_url(mock_get):
    # 1. ARRANGE: Pierwszy adres URL od razu działa
    mock_get.return_value.status_code = 200
    mock_get.return_value.json.return_value = {
        "results": [
            {"entity": {"id": 7, "name": "Cristiano Ronaldo", "position": "F"}},
            # Pusty gracz bez ID do pominięcia (Sprawdzamy klauzulę if not api_id):
            {"entity": {"name": "Ktoś bez ID"}}
        ]
    }
    
    # 2. ACT
    players = search_players_from_api("Ronaldo")
    
    # 3. ASSERT
    assert len(players) == 1
    assert players[0].name == "Cristiano Ronaldo"
    assert mock_get.call_count == 1

@pytest.mark.django_db
@patch('matches.services.player_service.requests.get')
def test_search_players_fallback_url(mock_get):
    # 1. ARRANGE: Symulujemy - Pierwszy URL zwraca 404, więc skrypt uderza w drugi
    class MockResponse:
        def __init__(self, status_code, json_data=None):
            self.status_code = status_code
            self._json_data = json_data or {}
        def json(self):
            return self._json_data

    mock_get.side_effect = [
        MockResponse(404),
        # Testujemy wariant z kluczem 'players' (często RapidAPI zmienia schemat JSON-a)
        MockResponse(200, {"players": [{"id": 9, "name": "Lewandowski"}]}) 
    ]
    
    # 2. ACT
    players = search_players_from_api("Lewandowski")
    
    # 3. ASSERT
    assert len(players) == 1
    assert players[0].name == "Lewandowski"
    # Upewniamy się, że skrypt spróbował DWA RAZY przed podaniem wyniku
    assert mock_get.call_count == 2

@pytest.mark.django_db
@patch('matches.services.player_service.requests.get')
def test_search_players_exception(mock_get):
    # 1. ARRANGE: Odcięty internet
    mock_get.side_effect = Exception("Timeout")
    
    # 2. ACT & ASSERT
    assert search_players_from_api("Messi") == []