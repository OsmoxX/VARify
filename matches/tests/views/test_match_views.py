import pytest
import json
from django.test import RequestFactory
from django.contrib.auth.models import User, AnonymousUser
from unittest.mock import patch, MagicMock

from matches.models import League, Team, LiveMatch, MatchEvent, MatchLineup, MissingPlayer, MatchSubscription
from matches.views.match_views import (
    live_matches_view, match_detail_view, HomeView, toggle_notifications, active_match_ids
)

# ==========================================
# FABRYKA DANYCH
# ==========================================
@pytest.fixture
def setup_match_data(db):
    user = User.objects.create_user(username='tester', password='123')
    l = League.objects.create(api_id=1, name="Premier League", country="England")
    t1 = Team.objects.create(api_id=10, name="Arsenal")
    t2 = Team.objects.create(api_id=20, name="Chelsea")
    
    # Mecz na żywo (zagra do HomeView)
    m_live = LiveMatch.objects.create(
        api_id=100, league=l, home_team=t1, away_team=t2, 
        status="1st Half", match_time="10000", minute=10
    )
    
    # Mecz zakończony (dla testowania detali i funkcji is_ended)
    m_ended = LiveMatch.objects.create(
        api_id=200, league=l, home_team=t2, away_team=t1, 
        status="Ended"
    )
    
    # Zdarzenie w trakcie meczu (wczesne)
    MatchEvent.objects.create(match=m_live, time=5, incident_type='goal')
    
    # Składy
    MatchLineup.objects.create(match=m_live, player_name="P1", is_home_team=True, is_starting_xi=True, shirt_number=1)
    MatchLineup.objects.create(match=m_live, player_name="P2", is_home_team=False, is_starting_xi=False, shirt_number=2)
    
    return m_live, m_ended, user

# ==========================================
# TESTY: live_matches_view (Stary/prosty widok live)
# ==========================================
@pytest.mark.django_db
@patch('matches.views.match_views.render')
def test_live_matches_view(mock_render, setup_match_data):
    m_live, _, _ = setup_match_data
    
    factory = RequestFactory()
    request = factory.get('/live/')
    request.session = MagicMock() # Zabezpieczenie przed błędem braku sesji w _subscribed_ids
    
    live_matches_view(request)
    
    mock_render.assert_called_once()
    context = mock_render.call_args[0][2]
    
    assert m_live in context['matches']
    assert 'subscribed_ids_json' in context

# ==========================================
# TESTY: match_detail_view (Szczegóły meczu)
# ==========================================
@pytest.mark.django_db
@patch('matches.views.match_views.fetch_match_details')
@patch('matches.views.match_views.render')
def test_match_detail_view_live(mock_render, mock_fetch, setup_match_data):
    m_live, _, _ = setup_match_data
    
    factory = RequestFactory()
    request = factory.get(f'/match/{m_live.id}/')
    
    # ACT: Wywołujemy widok dla meczu LIVE
    match_detail_view(request, match_id=m_live.id)
    
    # ASSERT: Skoro to mecz na żywo, a nie ma w nim pełnych danych, widok powinien pobrać go z API
    mock_fetch.assert_called_once_with(local_match_id=m_live.id, api_match_id=m_live.api_id)
    
    context = mock_render.call_args[0][2]
    assert context['match'] == m_live
    assert 'events' in context
    assert 'lineups' in context
    assert 'pitch_home' in context

@pytest.mark.django_db
@patch('matches.views.match_views.render')
def test_match_detail_view_ended_with_data(mock_render, setup_match_data):
    _, m_ended, _ = setup_match_data
    # Symulujemy, że zakończony mecz MA już w sobie wydarzenia
    MatchEvent.objects.create(match=m_ended, time=90, incident_type='period')
    
    factory = RequestFactory()
    request = factory.get(f'/match/{m_ended.id}/')
    
    # ACT: Wywołujemy widok dla ZAKOŃCZONEGO meczu z danymi
    with patch('matches.views.match_views.fetch_match_details') as mock_fetch:
        match_detail_view(request, match_id=m_ended.id)
        
        # ASSERT: Skoro ma dane, NIE powinien próbować dociągać z API
        mock_fetch.assert_not_called()

# ==========================================
# TESTY: HomeView (Class Based View - Strona Główna)
# ==========================================
@pytest.mark.django_db
def test_home_view_requires_login():
    factory = RequestFactory()
    request = factory.get('/')
    request.user = AnonymousUser()
    
    response = HomeView.as_view()(request)
    assert response.status_code == 302
    assert 'login' in response.url

@pytest.mark.django_db
@patch('matches.views.match_views.TOP_LEAGUES_CONFIG', [(1, 'Premier League', 'England')])
def test_home_view_logged_in(setup_match_data):
    m_live, m_ended, user = setup_match_data
    
    factory = RequestFactory()
    request = factory.get('/')
    request.user = user
    request.session = MagicMock()
    
    response = HomeView.as_view()(request)
    assert response.status_code == 200
    
    context = response.context_data
    assert 'structured_data' in context
    
    # Pobieramy przefiltrowane dane
    structured_data = context['structured_data']
    
    # Sprawdzamy, czy w strukturze jest Premier League (api_id=1 z fabryki)
    # i czy zawiera tylko nasz mecz LIVE, a nie ten zakończony
    assert len(structured_data) == 1
    league_entry = structured_data[0]
    assert league_entry['name'] == "Premier League"
    
    matches_in_league = league_entry['matches']
    assert len(matches_in_league) == 1
    assert matches_in_league[0].api_id == m_live.api_id
    assert matches_in_league[0].status != 'Ended'

# ==========================================
# TESTY: toggle_notifications (Subskrypcja Ajax)
# ==========================================
@pytest.mark.django_db
def test_toggle_notifications(setup_match_data):
    m_live, _, _ = setup_match_data
    
    factory = RequestFactory()
    # Żądanie POST z body JSON, jakiego oczekuje funkcja
    request = factory.post('/toggle/', data=json.dumps({'match_id': m_live.api_id}), content_type='application/json')
    request.session = MagicMock()
    request.session.session_key = "fake_session_123"
    
    # Krok 1: Włączamy subskrypcję (DODANIE)
    response_add = toggle_notifications(request)
    assert json.loads(response_add.content)['status'] == 'added'
    assert MatchSubscription.objects.count() == 1
    
    # Krok 2: Klikamy jeszcze raz, żeby wyłączyć (USUNIĘCIE)
    response_remove = toggle_notifications(request)
    assert json.loads(response_remove.content)['status'] == 'removed'
    assert MatchSubscription.objects.count() == 0

@pytest.mark.django_db
def test_toggle_notifications_not_found():
    factory = RequestFactory()
    request = factory.post('/toggle/', data=json.dumps({'match_id': 99999}), content_type='application/json')
    request.session = MagicMock()
    
    response = toggle_notifications(request)
    assert json.loads(response.content)['status'] == 'error'

# ==========================================
# TESTY: active_match_ids (Pobieranie ID żywych meczów Ajax)
# ==========================================
@pytest.mark.django_db
def test_active_match_ids(setup_match_data):
    m_live, m_ended, _ = setup_match_data
    
    factory = RequestFactory()
    
    # 1. Pytamy o oba mecze po przecinku (?ids=100,200)
    request = factory.get(f'/active/?ids={m_live.api_id},{m_ended.api_id}')
    response = active_match_ids(request)
    
    data = json.loads(response.content)
    # Zwróci TYLKO 100, bo 200 ma status Ended
    assert len(data['active_ids']) == 1
    assert data['active_ids'][0] == m_live.api_id
    
    # 2. Puste żądanie
    request_empty = factory.get('/active/')
    assert len(json.loads(active_match_ids(request_empty).content)['active_ids']) == 0
    
    # 3. Żądanie z zepsutym ID (tekst zamiast int)
    request_broken = factory.get('/active/?ids=tekst')
    assert len(json.loads(active_match_ids(request_broken).content)['active_ids']) == 0