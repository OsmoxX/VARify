import pytest
import time
from unittest.mock import Mock, MagicMock
from matches.models import LiveMatch, MatchSubscription
from matches.views.helpers import (
    _build_league_groups, _league_entry, _rating_class, _build_pitch_data,
    _subscribed_ids, _current_match_minute, _should_show_event, _parse_stats
)

# ==========================================
# TESTY: LOGIKA WIDOKÓW (helpers.py)
# ==========================================

def test_build_league_groups():
    # Przygotowanie mocków zamiast uderzania w prawdziwą bazę danych (dla szybkości)
    m1 = Mock()
    m1.league.api_id = 1
    m1.league.name = "Premier League"
    m1.league.country = "England"
    m1.is_top = True

    m2 = Mock()
    m2.league.api_id = 1
    
    m3 = Mock()
    m3.league = None # Testujemy bezpieczne omijanie braku ligi

    result = _build_league_groups([m1, m2, m3])
    
    assert 1 in result
    assert result[1]['name'] == "Premier League"
    assert result[1]['country'] == "England"
    assert len(result[1]['matches']) == 2
    assert result[1]['is_top'] is True

def test_league_entry():
    data = {'name': 'Serie A', 'country': 'Italy', 'matches': [1, 2]}
    
    # Kiedy podajemy kraj
    res1 = _league_entry(data, is_top=True)
    assert res1['display_name'] == "Serie A • Italy"
    assert res1['is_top'] is True
    assert res1['has_matches'] is True
    
    # Kiedy kraj jest pusty
    res2 = _league_entry({'name': 'World Cup', 'country': '', 'matches': []})
    assert res2['display_name'] == "World Cup"
    assert res2['has_matches'] is False

def test_rating_class():
    assert _rating_class(7.5) == 'rating-green'
    assert _rating_class("6.2") == 'rating-yellow'
    assert _rating_class(5.0) == 'rating-red'
    assert _rating_class(None) == ''
    assert _rating_class("invalid") == 'rating-yellow'

def test_build_pitch_data():
    # Tworzymy zmyślonych graczy
    p_g = Mock(position='G', avg_rating=7.0)
    p_d1 = Mock(position='D', avg_rating=6.0)
    p_d2 = Mock(position='D', avg_rating=5.0)
    p_m1 = Mock(position='M', avg_rating=None)
    p_f1 = Mock(position='F', avg_rating=8.0)
    
    xi = [p_g, p_d1, p_d2, p_m1, p_f1]
    
    # 1. Podajemy konkretną formację
    res_home = _build_pitch_data(xi, "2-1-1", is_home=True)
    assert len(res_home) == 5
    assert res_home[0]['rating_class'] == 'rating-green' # Bramkarz
    
    # Sprawdzamy czy drużyny przeciwne są po drugiej stronie boiska
    res_away = _build_pitch_data(xi, "2-1-1", is_home=False)
    assert res_home[0]['left'] < res_away[0]['left']
    
    # 2. Test pustej formacji (powinno wygenerować na podstawie ich pozycji G/D/M/F)
    res_empty = _build_pitch_data(xi, "", is_home=True)
    assert len(res_empty) == 5
    
    # 3. Zepsuta formacja (np. tekst)
    res_broken = _build_pitch_data(xi, "abc", is_home=True)
    assert len(res_broken) == 5

@pytest.mark.django_db
def test_subscribed_ids():
    # Symulacja requesta bez sesji
    request_no_session = MagicMock()
    request_no_session.session.session_key = None
    assert _subscribed_ids(request_no_session) == []
    
    # Symulacja requesta z przypisaną sesją w bazie
    request_with_session = MagicMock()
    request_with_session.session.session_key = "abc123xyz"
    
    # Tworzymy powiązanie w bazie
    match = LiveMatch.objects.create(api_id=999, home_score=0, away_score=0)
    MatchSubscription.objects.create(session_key="abc123xyz", match=match)
    
    assert _subscribed_ids(request_with_session) == [999]

def test_current_match_minute():
    # Brak timestampu
    m_no_time = Mock(match_time=None, minute=15)
    assert _current_match_minute(m_no_time) == 15
    
    # Obliczanie z timestampem z przeszłości (120 sek temu = 2 minuty dodane)
    past_timestamp = int(time.time()) - 120
    m_with_time = Mock(match_time=str(past_timestamp), minute=45)
    assert _current_match_minute(m_with_time) == 47
    
    # Uszkodzony timestamp
    m_broken = Mock(match_time="zepsute", minute=30)
    assert _current_match_minute(m_broken) == 30

def test_should_show_event():
    # Zwykły event
    ev_normal = Mock(is_period_marker=False, time=10)
    assert _should_show_event(ev_normal, "live", 15) is True
    
    # Event końca połowy, ale mecz nadal trwa (1. połowa)
    ev_ht = Mock(is_period_marker=True, text="HT", time=45)
    assert _should_show_event(ev_ht, "1st half", 46) is False
    
    # Event końca meczu podczas przerwy
    ev_ft = Mock(is_period_marker=True, text="FT", time=90)
    assert _should_show_event(ev_ft, "halftime", 45) is False
    
    # Normalny event końca, kiedy mecz się skończył
    assert _should_show_event(ev_ft, "ended", 95) is True

def test_parse_stats():
    assert _parse_stats(None) == []
    
    raw_stats = [{
        "period": "ALL",
        "groups": [{
            "statisticsItems": [
                {"name": "Ball possession", "home": "60%", "away": "40%", "homeValue": 60, "awayValue": 40},
                {"name": "Shots", "home": "10", "away": "5", "homeValue": 10, "awayValue": 5},
                {"name": "0/0 test", "homeValue": 0, "awayValue": 0}
            ]
        }]
    }]
    
    result = _parse_stats(raw_stats)
    assert len(result) == 1
    items = result[0]['items']
    
    # Sprawdzamy wyliczanie procentów z "possession"
    assert items[0]['h_pct'] == 60
    assert items[0]['is_possession'] is True
    
    # Sprawdzamy total shotów i zabezpieczenie przed błędem Dzielenia przez Zero
    assert items[1]['h_pct'] == 67 # (10/15) * 100
    assert items[2]['h_pct'] == 50 # Default dla 0/0