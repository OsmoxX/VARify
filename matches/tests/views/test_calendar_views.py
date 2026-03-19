import pytest
from django.test import RequestFactory
from django.contrib.auth.models import User, AnonymousUser
from django.utils import timezone
from datetime import timedelta
from unittest.mock import patch

from matches.models import League, Team, LiveMatch, UpcomingMatch
from matches.views.calendar_views import CalendarView, upcoming_matches_view

# ==========================================
# FABRYKA DANYCH
# ==========================================
@pytest.fixture
def setup_calendar_data(db):
    user = User.objects.create_user(username='tester', password='123')
    
    l_top = League.objects.create(api_id=1, name="Premier League", country="England")
    l_normal = League.objects.create(api_id=99, name="Test Liga", country="Polska")
    
    t1 = Team.objects.create(api_id=10, name="Arsenal")
    t2 = Team.objects.create(api_id=20, name="Chelsea")
    
    today = timezone.now().date()
    yesterday = today - timedelta(days=1)
    tomorrow = timezone.now() + timedelta(days=1)
    
    LiveMatch.objects.create(
        api_id=100, league=l_top, home_team=t1, away_team=t2, 
        status="Ended", match_date=yesterday, country_name="England"
    )
    LiveMatch.objects.create(
        api_id=101, league=l_top, home_team=t2, away_team=t1, 
        status="2nd Half", match_date=today, country_name="England"
    )
    UpcomingMatch.objects.create(
        api_id=200, league=l_top, home_team=t1, away_team=t2, 
        start_datetime=tomorrow, is_top=True
    )
    UpcomingMatch.objects.create(
        api_id=201, league=l_normal, home_team=t2, away_team=t1, 
        start_datetime=tomorrow, is_top=False
    )
    return user

# ==========================================
# TESTY: CalendarView (Zakończone mecze)
# ==========================================
@pytest.mark.django_db
def test_calendar_view_requires_login():
    # Używamy RequestFactory do "zbudowania" żądania omijając urls.py
    factory = RequestFactory()
    request = factory.get('/cokolwiek/')
    request.user = AnonymousUser()  # Udajemy niezalogowanego gościa
    
    response = CalendarView.as_view()(request)
    
    assert response.status_code == 302
    assert 'login' in getattr(response, 'url', '')

@pytest.mark.django_db
def test_calendar_view_logged_in(setup_calendar_data):
    factory = RequestFactory()
    request = factory.get('/cokolwiek/')
    request.user = setup_calendar_data  
    
    response = CalendarView.as_view()(request)
    assert response.status_code == 200
    
    context = getattr(response, 'context_data', {})
    
    assert 'structured_days' in context
    assert 'all_league_names' in context
    
    structured_days = context['structured_days']
    assert len(structured_days) > 0
    
    for day in structured_days:
        for league in day['leagues']:
            for match in league['matches']:
                assert match.status == 'Ended'

# ==========================================
# TESTY: upcoming_matches_view (Nadchodzące)
# ==========================================
@pytest.mark.django_db
@patch('matches.views.calendar_views.TOP_LEAGUES_CONFIG', [(1, 'Premier League', 'England')])
@patch('matches.views.calendar_views.render')
def test_upcoming_matches_view(mock_render, setup_calendar_data):
    factory = RequestFactory()
    request = factory.get('/cokolwiek/')
    
    # Ponieważ to jest zwykła funkcja, uderzamy w nią bezpośrednio.
    # Użyliśmy sprytnego tricku: mockujemy funkcję 'render', żeby podejrzeć,
    # jakie dane widok próbuje przekazać do szablonu HTML!
    upcoming_matches_view(request)
    
    mock_render.assert_called_once()
    
    # Wyciągamy argumenty z mocka render(request, 'szablon.html', CONTEXT)
    args, kwargs = mock_render.call_args
    context = args[2] 
    
    assert 'grouped_leagues' in context
    assert 'all_league_names' in context
    
    league_names = context['all_league_names']
    assert any('Premier League' in name for name in league_names)
    assert any('Test Liga' in name for name in league_names)

# ==========================================
# TESTY: CalendarView (Zapasowe wartości / Fallbacks)
# ==========================================
@pytest.mark.django_db
def test_calendar_view_fallback_values(setup_calendar_data):
    # 1. ARRANGE: Pobieramy istniejące drużyny z fabryki
    t1 = Team.objects.first()
    t2 = Team.objects.last()
    league = League.objects.first()
    
    # Tworzymy mecz BEZ DATY (wymusi 'Brak daty')
    LiveMatch.objects.create(
        api_id=901, home_team=t1, away_team=t2, status='Ended', 
        match_date=None, league=league, country_name="TestCountry"
    )
    
    # Tworzymy mecz BEZ LIGI i BEZ KRAJU (wymusi 'Nieznana Liga' i 'Inne')
    LiveMatch.objects.create(
        api_id=902, home_team=t1, away_team=t2, status='Ended', 
        match_date=timezone.now().date(), league=None, country_name=None
    )
    
    factory = RequestFactory()
    request = factory.get('/calendar/')
    request.user = setup_calendar_data
    
    # 2. ACT: Generujemy widok
    response = CalendarView.as_view()(request)
    context = getattr(response, 'context_data', {})
    structured_days = context['structured_days']
    
    # 3. ASSERT: Wyciągamy wygenerowane nazwy i sprawdzamy, czy zapasowe teksty zadziałały
    dates = [day['date'] for day in structured_days]
    assert 'Brak daty' in dates
    
    all_leagues = []
    all_countries = []
    for day in structured_days:
        for league in day['leagues']:
            all_leagues.append(league['name'])
            all_countries.append(league['country'])
            
    assert 'Nieznana Liga' in all_leagues
    assert 'Inne' in all_countries