import pytest
from unittest.mock import patch
from matches.models import League, Team, LiveMatch, UpcomingMatch, MatchEvent, MatchLineup, MissingPlayer
from matches.services.match_service import sync_live_matches, fetch_upcoming_matches, fetch_match_details, fetch_last_matches_for_team

# ==========================================
# TESTY: SYNC LIVE MATCHES
# ==========================================
@pytest.mark.django_db
@patch('matches.services.match_service.get_channel_layer') # Blokujemy WebSockety
@patch('matches.services.match_service.requests.get')      # Blokujemy API
def test_sync_live_matches_creates_new_match(mock_get, mock_channel_layer):
    # 1. ARRANGE: Przygotowujemy fałszywą odpowiedź z meczem na żywo
    mock_get.return_value.status_code = 200
    mock_get.return_value.json.return_value = {
        "events": [
            {
                "id": 12345,
                "tournament": {
                    "id": 10, "name": "LaLiga", 
                    "category": {"name": "Spain"}
                },
                "homeTeam": {"id": 1, "name": "Real Madrid"},
                "awayTeam": {"id": 2, "name": "FC Barcelona"},
                "status": {"description": "2nd Half"},
                "homeScore": {"current": 2},
                "awayScore": {"current": 1},
                "startTimestamp": 1700000000,
                "time": {"initial": 2700, "currentPeriodStartTimestamp": 1700003600}
            }
        ]
    }

    # Upewniamy się, że baza jest pusta
    assert LiveMatch.objects.count() == 0

    # 2. ACT: Odpalamy synchronizację
    sync_live_matches()

    # 3. ASSERT: Sprawdzamy czy mecz zapisał się w bazie
    assert LiveMatch.objects.count() == 1
    match = LiveMatch.objects.get(api_id=12345)
    
    # Sprawdzamy czy relacje (Klucze Obce) zostały poprawnie utworzone "w locie"
    assert match.home_team.name == "Real Madrid"
    assert match.league.name == "LaLiga"
    assert match.country_name == "Spain"
    
    # Sprawdzamy wynik i status
    assert match.home_score == 2
    assert match.away_score == 1
    assert match.status == "2nd Half"

@pytest.mark.django_db
@patch('matches.services.match_service.requests.get')
def test_sync_live_matches_handles_empty_response(mock_get):
    # 1. ARRANGE: Zwracamy pusty słownik bez klucza 'events'
    mock_get.return_value.status_code = 200
    mock_get.return_value.json.return_value = {}

    # 2. ACT
    sync_live_matches()

    # 3. ASSERT: Nie powinno wybuchnąć i baza powinna zostać pusta
    assert LiveMatch.objects.count() == 0

# ==========================================
# TESTY: FETCH UPCOMING MATCHES
# ==========================================
@pytest.mark.django_db
@patch('matches.services.match_service.requests.get')
def test_fetch_upcoming_matches_success(mock_get):
    # 1. ARRANGE: Przygotowujemy fałszywy nadchodzący mecz
    mock_get.return_value.status_code = 200
    mock_get.return_value.json.return_value = {
        "events": [
            {
                "id": 99999,
                "status": {"type": "notstarted"}, # Ważne: tylko 'notstarted' są zapisywane!
                "tournament": {"id": 17, "name": "Premier League"},
                "homeTeam": {"id": 3, "name": "Arsenal"},
                "awayTeam": {"id": 4, "name": "Chelsea"},
                "startTimestamp": 1700000000,
                "eventFilters": {"level": [1]}
            },
            {
                "id": 88888,
                "status": {"type": "inprogress"}, # Ten powinien zostać zignorowany!
                "tournament": {"id": 17, "name": "Premier League"},
                "homeTeam": {"id": 5, "name": "Aston Villa"},
                "awayTeam": {"id": 6, "name": "Everton"},
                "startTimestamp": 1700000000,
            }
        ]
    }

    # 2. ACT
    fetch_upcoming_matches()

    # 3. ASSERT
    assert UpcomingMatch.objects.count() == 1
    
    # Upewniamy się, że zapisał się TYLKO ten nieistniejący (Arsenal - Chelsea)
    upcoming = UpcomingMatch.objects.first()
    assert upcoming.api_id == 99999
    assert upcoming.home_team.name == "Arsenal"


# ==========================================
# TESTY: FETCH MATCH DETAILS
# ==========================================
@pytest.mark.django_db
@patch('matches.services.match_service.requests.get')
def test_fetch_match_details_success(mock_get):
    # 1. ARRANGE: Przygotowujemy bazę i "oszukane" odpowiedzi
    league = League.objects.create(api_id=1, name="Test League")
    team_h = Team.objects.create(api_id=1, name="Home")
    team_a = Team.objects.create(api_id=2, name="Away")
    
    match = LiveMatch.objects.create(
        api_id=555, league=league, home_team=team_h, away_team=team_a,
        home_score=0, away_score=0, status="1st Half"
    )

    # Tworzymy klasę pomocniczą do generowania odpowiedzi
    class MockResponse:
        def __init__(self, status_code, json_data):
            self.status_code = status_code
            self._json_data = json_data
        def json(self):
            return self._json_data

    # Ustawiamy kolejkę 4 odpowiedzi dla 4 zapytań w funkcji!
    mock_get.side_effect = [
        # Odpowiedź 1: Stan meczu (Event)
        MockResponse(200, {"event": {
            "status": {"description": "Ended"}, 
            "homeScore": {"current": 3}, "awayScore": {"current": 1},
            "time": {"played": 90}
        }}),
        
        # Odpowiedź 2: Zdarzenia (Incidents)
        MockResponse(200, {"incidents": [
            {"id": 101, "incidentType": "goal", "time": 15, "isHome": True, "player": {"name": "Lewy"}}
        ]}),
        
        # Odpowiedź 3: Składy (Lineups)
        MockResponse(200, {
            "home": {
                "formation": "4-4-2", 
                "players": [{"player": {"name": "Szczesny", "position": "G"}, "substitute": False}],
                "missingPlayers": []
            },
            "away": {
                "formation": "4-3-3", 
                "players": [],
                "missingPlayers": [{"player": {"name": "Milik"}, "type": "injury"}]
            }
        }),
        
        # Odpowiedź 4: Statystyki (Statistics)
        MockResponse(200, {"statistics": [{"period": "ALL", "groups": [{"name": "Shots"}]}]})
    ]

    # 2. ACT: Odpalamy naszą potężną funkcję
    result = fetch_match_details(local_match_id=match.id, api_match_id=555)

    # 3. ASSERT: Sprawdzamy, czy wszystko zapisało się w bazie
    assert result is True
    assert mock_get.call_count == 4

    # Odświeżamy obiekt meczu z bazy
    match.refresh_from_db()
    
    # Sprawdzamy krok 0: Stan meczu
    assert match.status == "Ended"
    assert match.home_score == 3
    assert match.minute == 90
    
    # Sprawdzamy krok 1: Zdarzenia (Musi być 1 gol)
    assert MatchEvent.objects.filter(match=match).count() == 1
    assert MatchEvent.objects.first().player_name == "Lewy"
    
    # Sprawdzamy krok 2: Składy i Formacje
    assert match.home_formation == "4-4-2"
    assert MatchLineup.objects.filter(match=match).count() == 1
    assert MissingPlayer.objects.filter(match=match).count() == 1
    
    # Sprawdzamy krok 3: Statystyki
    assert match.stats_json is not None
    assert len(match.stats_json) == 1

@pytest.mark.django_db
def test_fetch_match_details_match_not_found():
    # Co jeśli podamy ID meczu, którego nie ma w lokalnej bazie?
    # Nie musimy nawet mockować requests.get, bo funkcja powinna przerwać działanie wcześniej.
    result = fetch_match_details(local_match_id=9999, api_match_id=123)
    assert result is False

# ==========================================
# TESTY: ZWIADOWCA (fetch_last_matches_for_team)
# ==========================================
@pytest.mark.django_db
@patch('matches.services.match_service.requests.get')
def test_fetch_last_matches_for_team_success_and_slicing(mock_get):
    # 1. ARRANGE: Tworzymy odpowiedź symulującą 3 mecze, ale poprosimy o 2 (n=2).
    # Chcemy udowodnić, że kod 'events[-n:]' prawidłowo odrzuci najstarszy mecz.
    mock_get.return_value.status_code = 200
    mock_get.return_value.json.return_value = {
        "events": [
            {
                # Ten mecz powinien zostać POMINIĘTY (jest najstarszy na liście)
                "id": 1000, "tournament": {"id": 1, "name": "LaLiga"},
                "homeTeam": {"id": 1, "name": "Real"}, "awayTeam": {"id": 5, "name": "Getafe"}
            },
            {
                "id": 1001, "tournament": {"id": 1, "name": "LaLiga"},
                "homeTeam": {"id": 1, "name": "Real Madrid"}, "awayTeam": {"id": 2, "name": "FC Barcelona"},
                "status": {"description": "Ended"}, "homeScore": {"current": 3}, "awayScore": {"current": 1},
                "startTimestamp": 1600000000
            },
            {
                "id": 1002, "tournament": {"id": 7, "name": "Champions League"},
                "homeTeam": {"id": 1, "name": "Real Madrid"}, "awayTeam": {"id": 3, "name": "Bayern Munich"},
                "status": {"description": "Ended"}, "homeScore": {"current": 2}, "awayScore": {"current": 2},
                "startTimestamp": 1590000000
            }
        ]
    }

    assert LiveMatch.objects.count() == 0

    # 2. ACT: Odpalamy Zwiadowcę prosząc tylko o 2 mecze (n=2)
    saved_matches = fetch_last_matches_for_team(team_api_id=1, n=2)

    # 3. ASSERT: Sprawdzamy, czy w bazie znalazły się tylko 2 mecze
    assert len(saved_matches) == 2
    assert LiveMatch.objects.count() == 2

    # Upewniamy się, że to te dwa najnowsze (1001 i 1002), a 1000 został pominięty
    assert not LiveMatch.objects.filter(api_id=1000).exists()
    assert LiveMatch.objects.filter(api_id=1001).exists()
    assert LiveMatch.objects.filter(api_id=1002).exists()

@pytest.mark.django_db
@patch('matches.services.match_service.requests.get')
def test_fetch_last_matches_for_team_api_errors(mock_get):
    # Testujemy awarię samego serwera HTTP (np. błąd 500)
    mock_get.return_value.status_code = 500
    assert fetch_last_matches_for_team(team_api_id=1) == []

    # Testujemy całkowity brak połączenia (np. odcięty internet)
    mock_get.side_effect = Exception("Connection timeout")
    assert fetch_last_matches_for_team(team_api_id=1) == []

@pytest.mark.django_db
@patch('matches.services.match_service.requests.get')
def test_fetch_last_matches_for_team_skips_corrupted_event(mock_get):
    # Co jeśli API zwróci listę meczów, ale jeden z nich będzie zepsuty (np. brak ID ligi)?
    # Pętla `for event in last_events:` powinna to wyłapać przez `try..except`, pominąć ten mecz i lecieć dalej.
    mock_get.return_value.status_code = 200
    mock_get.return_value.json.return_value = {
        "events": [
            {
                "id": 900, "tournament": None, # TO WYZWOLI BŁĄD w kodzie (próba odczytania 'id' z None)
            },
            {
                "id": 901, "tournament": {"id": 1, "name": "LaLiga"},
                "homeTeam": {"id": 1, "name": "A"}, "awayTeam": {"id": 2, "name": "B"}
            }
        ]
    }

    saved_matches = fetch_last_matches_for_team(team_api_id=1, n=5)

    # Zepsuty mecz (900) został odrzucony, ale dobry (901) zapisał się poprawnie!
    assert len(saved_matches) == 1
    assert saved_matches[0].api_id == 901