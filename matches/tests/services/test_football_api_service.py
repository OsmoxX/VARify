import pytest
import requests
from unittest.mock import patch
from matches.models import Team
from matches.services.football_api_service import search_teams_from_api

# ==========================================
# TESTY: HAPPY PATH
# ==========================================
@pytest.mark.django_db
@patch('matches.services.football_api_service.requests.get')
def test_search_teams_success_on_first_url(mock_get):
    # 1. ARRANGE: Udajemy, że pierwszy URL od razu zwraca sukces i JSON-a.
    # Wrzucamy też 'śmiecia' (type: player), żeby sprawdzić czy pętla go pominie.
    mock_get.return_value.status_code = 200
    mock_get.return_value.json.return_value = {
        "results": [
            {"type": "team", "entity": {"id": 111, "name": "Arsenal FC"}},
            {"type": "player", "entity": {"id": 999, "name": "Bukayo Saka"}} # To powinno zostać zignorowane!
        ]
    }

    # 2. ACT
    teams = search_teams_from_api("Arsenal")

    # 3. ASSERT
    assert len(teams) == 1
    assert teams[0].name == "Arsenal FC"
    assert teams[0].api_id == 111
    
    # Sprawdzamy czy zapisało do bazy
    assert Team.objects.count() == 1
    
    # Upewniamy się, że requests.get zostało wywołane tylko RAZ (bo pierwszy URL zadziałał)
    assert mock_get.call_count == 1

@pytest.mark.django_db
@patch('matches.services.football_api_service.requests.get')
def test_search_teams_uses_fallback_urls(mock_get):
    # 1. ARRANGE: Magia `side_effect`! 
    # Mówimy mockowi: Przy pierwszym wywołaniu rzuć błąd 404, przy drugim zwróć sukces 200.
    class MockResponse:
        def __init__(self, status_code, json_data=None):
            self.status_code = status_code
            self._json_data = json_data or {}
        def json(self):
            return self._json_data

    mock_get.side_effect = [
        MockResponse(404),  # Pierwszy URL z listy: Błąd
        MockResponse(200, {"teams": [{"type": "team", "entity": {"id": 222, "name": "Chelsea FC"}}]}), # Drugi URL: Sukces!
        MockResponse(200)   # Trzeci URL (nigdy nie powinien zostać osiągnięty)
    ]

    # 2. ACT
    teams = search_teams_from_api("Chelsea")

    # 3. ASSERT
    assert len(teams) == 1
    assert teams[0].name == "Chelsea FC"
    
    # Sprawdzamy, czy funkcja uderzyła do API dokładnie 2 razy i przerwała pętlę.
    assert mock_get.call_count == 2


# ==========================================
# TESTY: EDGE CASES & AWARIE (SAD PATH)
# ==========================================
@pytest.mark.django_db
@patch('matches.services.football_api_service.requests.get')
def test_search_teams_api_timeout_exception(mock_get):
    # 1. ARRANGE: Udajemy, że serwery RapidAPI padły (Timeout)
    mock_get.side_effect = requests.exceptions.Timeout("Connection timed out")

    # 2. ACT
    teams = search_teams_from_api("Liverpool")

    # 3. ASSERT: Funkcja powinna złapać wyjątek (except Exception as e) i zwrócić pustą listę.
    assert teams == []
    assert Team.objects.count() == 0