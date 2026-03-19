import pytest
from matches.services.match_service import (
    _safe_nested, _map_goal, _map_card, _map_substitution,
    _map_period, _map_injury_time, _map_var_decision,
    _map_in_game_penalty, _map_incident
)

# ==========================================
# TESTY: BEZPIECZNE WYCIĄGANIE DANYCH
# ==========================================
def test_safe_nested():
    data = {"player": {"stats": {"rating": 8.5}}}
    
    # Happy Path
    assert _safe_nested(data, "player", "stats", "rating") == 8.5
    
    # Sad Path: Brakuje klucza
    assert _safe_nested(data, "player", "info", "age") is None
    
    # Sad Path: Domyślna wartość
    assert _safe_nested(data, "coach", default="Brak") == "Brak"

# ==========================================
# TESTY: INDYWIDUALNE MAPERY
# ==========================================
def test_map_goal():
    payload = {
        "player": {"name": "Lewandowski"},
        "assist1": {"name": "Milik"},
        "homeScore": 2,
        "awayScore": 0,
        "incidentClass": "regular"
    }
    result = _map_goal(payload)
    assert result['player_name'] == "Lewandowski"
    assert result['assist_player_name'] == "Milik"
    assert result['home_score'] == 2
    assert result['incident_class'] == "regular"

def test_map_card():
    payload = {
        "playerName": "Glik",
        "incidentClass": "yellow",
        "reason": "Faul",
        "rescinded": True
    }
    result = _map_card(payload)
    assert result['player_name'] == "Glik"
    assert result['incident_class'] == "yellow"
    assert result['reason'] == "Faul"
    assert result['rescinded'] is True

def test_map_substitution():
    payload = {
        "playerIn": {"name": "Piątek"},
        "playerOut": {"name": "Lewandowski"},
        "injury": True
    }
    result = _map_substitution(payload)
    assert result['player_in_name'] == "Piątek"
    assert result['player_out_name'] == "Lewandowski"
    assert result['injury'] is True
    # Zgodnie z kodem, player_name dla zmiany to ten co wchodzi
    assert result['player_name'] == "Piątek" 

def test_map_period():
    payload = {"text": "HT", "homeScore": 1, "awayScore": 1, "isLive": False}
    result = _map_period(payload)
    assert result['text'] == "HT"
    assert result['home_score'] == 1
    assert result['is_live'] is False

def test_map_injury_time():
    assert _map_injury_time({"length": 5}) == {'length': 5}

def test_map_var_decision():
    payload = {"player": {"name": "Szczęsny"}, "incidentClass": "penalty", "confirmed": False}
    result = _map_var_decision(payload)
    assert result['player_name'] == "Szczęsny"
    assert result['confirmed'] is False

def test_map_in_game_penalty():
    payload = {"player": {"name": "Krychowiak"}, "incidentClass": "missed", "reason": "Handball"}
    result = _map_in_game_penalty(payload)
    assert result['player_name'] == "Krychowiak"
    assert result['reason'] == "Handball"

# ==========================================
# TESTY: GŁÓWNA FUNKCJA KIERUJĄCA (_map_incident)
# ==========================================
def test_map_incident_routes_correctly():
    # Testujemy, czy główna funkcja _map_incident prawidłowo kieruje ruch
    # do mapera _map_goal i łączy wyniki.
    payload = {
        "id": 999,
        "incidentType": "goal",
        "time": 45,
        "addedTime": 2,
        "isHome": False,
        "player": {"name": "Ronaldo"} # Dane do _map_goal
    }
    
    result = _map_incident(payload)
    
    # Bazowe pola
    assert result['incident_type'] == "goal"
    assert result['event_id'] == "999"
    assert result['time'] == 45
    assert result['added_time'] == 2
    assert result['is_home_team'] is False
    
    # Pola dodane przez specyficzny maper (_map_goal)
    assert result['player_name'] == "Ronaldo"

def test_map_incident_unknown_type():
    # Co się stanie, jak API wyśle nam dziwny typ, którego nie znamy?
    payload = {
        "id": 888,
        "incidentType": "alienAbduction",
        "text": "Gracz zniknął",
        "player": {"name": "Ktoś"}
    }
    
    result = _map_incident(payload)
    
    # Powinno zadziałać 'fallback' w _map_incident (klauzula else)
    assert result['incident_type'] == "alienAbduction"
    assert result['player_name'] == "Ktoś"
    assert result['text'] == "Gracz zniknął"