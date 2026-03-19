import pytest
import requests
from unittest.mock import patch
from matches.models import League, Team, LeagueStandings
from matches.services.standings_service import fetch_league_standings

# Klasa pomocnicza do tworzenia fałszywych odpowiedzi
class MockResponse:
    def __init__(self, status_code, json_data=None):
        self.status_code = status_code
        self._json_data = json_data or {}
    def json(self):
        return self._json_data

# ==========================================
# TESTY: HAPPY PATH
# ==========================================
@pytest.mark.django_db
@patch('matches.services.standings_service.requests.get')
def test_fetch_league_standings_auto_season_success(mock_get):
    # 1. ARRANGE: Mockujemy DWIE odpowiedzi (najpierw po sezon, potem po tabele)
    mock_get.side_effect = [
        # Odpowiedź 1: Lista sezonów
        MockResponse(200, {"seasons": [{"id": "23/24"}, {"id": "22/23"}]}),
        
        # Odpowiedź 2: Tabela
        MockResponse(200, {
            "standings": [{
                "tournament": {"name": "Premier League", "category": {"name": "England"}},
                "rows": [
                    {
                        "team": {"id": 1, "name": "Arsenal"},
                        "position": 1, "points": 80, "matches": 30,
                        "wins": 25, "draws": 5, "losses": 0,
                        "scoresFor": 70, "scoresAgainst": 20
                    }
                ]
            }]
        })
    ]

    # 2. ACT: Odpalamy serwis tylko z ID turnieju (wymusi to auto-szukanie sezonu)
    result = fetch_league_standings(tournament_id=17)

    # 3. ASSERT: Sprawdzamy, czy w bazie pojawiły się odpowiednie rekordy
    assert len(result) == 1
    assert mock_get.call_count == 2  # Udowadniamy, że wykonały się 2 zapytania
    
    # Weryfikacja Ligi
    league = League.objects.get(api_id=17)
    assert league.name == "Premier League"
    assert league.country == "England"

    # Weryfikacja Drużyny
    team = Team.objects.get(api_id=1)
    assert team.name == "Arsenal"

    # Weryfikacja Tabeli
    standing = LeagueStandings.objects.get(league=league, team=team)
    assert standing.position == 1
    assert standing.points == 80
    assert standing.goal_difference == 50  # Sprawdzamy obliczenie 70 - 20

@pytest.mark.django_db
@patch('matches.services.standings_service.requests.get')
def test_fetch_league_standings_with_provided_season_and_local_id(mock_get):
    # 1. ARRANGE: Ponieważ podajemy ID sezonu, kod pominie zapytanie nr 1.
    # Ustawiamy więc tylko JEDNĄ odpowiedź mocka.
    mock_get.return_value = MockResponse(200, {
        "standings": [{
            "tournament": {"name": "La Liga", "category": {"name": "Spain"}},
            "rows": [
                {
                    "team": {"id": 2, "name": "Real Madrid"},
                    "position": 1, "points": 90, "scoresFor": 80, "scoresAgainst": 20
                }
            ]
        }]
    })

    # 2. ACT: Odpalamy z podanymi wszystkimi parametrami
    # UWAGA: tournament_id to 8, ale każemy mu zapisać to lokalnie pod ID 999
    result = fetch_league_standings(tournament_id=8, season_id="23/24", local_league_id=999)

    # 3. ASSERT
    assert len(result) == 1
    assert mock_get.call_count == 1  # Ważne: tylko jedno zapytanie do API!
    
    # Weryfikacja, czy liga zapisała się pod local_league_id, a nie tournament_id!
    assert League.objects.filter(api_id=999).exists()
    assert not League.objects.filter(api_id=8).exists()

# ==========================================
# TESTY: EDGE CASES (BŁĘDY)
# ==========================================
@pytest.mark.django_db
@patch('matches.services.standings_service.requests.get')
def test_fetch_league_standings_season_fail(mock_get):
    # Scenariusz A: API od sezonów zwraca błąd 404
    mock_get.return_value = MockResponse(404, {})
    assert fetch_league_standings(tournament_id=17) == []
    
    # Scenariusz B: API odpowiada, ale lista sezonów jest pusta
    mock_get.return_value = MockResponse(200, {"seasons": []})
    assert fetch_league_standings(tournament_id=17) == []

@pytest.mark.django_db
@patch('matches.services.standings_service.requests.get')
def test_fetch_league_standings_standings_fail(mock_get):
    # Sezon działa (200), ale padają tabele (500)
    mock_get.side_effect = [
        MockResponse(200, {"seasons": [{"id": "23/24"}]}),
        MockResponse(500, {})
    ]
    assert fetch_league_standings(tournament_id=17) == []

@pytest.mark.django_db
@patch('matches.services.standings_service.requests.get')
def test_fetch_league_standings_network_exception(mock_get):
    # Brak internetu / Timeout
    mock_get.side_effect = requests.exceptions.Timeout("Connection timed out")
    assert fetch_league_standings(tournament_id=17) == []