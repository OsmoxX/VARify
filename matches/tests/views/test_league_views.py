import pytest
from django.test import RequestFactory
from django.utils import timezone
from datetime import timedelta
from unittest.mock import patch

from matches.models import League, Team, UpcomingMatch, LiveMatch, LeagueStandings
from matches.views.league_views import league_detail_view

# ==========================================
# FABRYKA DANYCH
# ==========================================
@pytest.fixture
def setup_league_data(db):
    """Tworzy testową ligę z meczami i tabelą."""
    l = League.objects.create(api_id=99, name="Test League", country="Poland")
    t1 = Team.objects.create(api_id=1, name="Team A")
    t2 = Team.objects.create(api_id=2, name="Team B")
    
    # Mecz nadchodzący
    UpcomingMatch.objects.create(
        api_id=10, league=l, home_team=t1, away_team=t2, 
        start_datetime=timezone.now() + timedelta(days=1)
    )
    
    # Mecz zakończony (status 'ended')
    LiveMatch.objects.create(
        api_id=20, league=l, home_team=t2, away_team=t1,
        status='ended', match_date=timezone.now().date()
    )
    
    # Tabela wyników (pamiętamy o zerach, żeby uniknąć błędu z MySQL!)
    LeagueStandings.objects.create(
        league=l, team=t1, position=1, points=3,
        matches_played=1, matches_won=1, matches_drawn=0, matches_lost=0,
        goals_for=2, goals_against=0, goal_difference=2
    )
    
    return l

# ==========================================
# TESTY: Widok Detali Ligi
# ==========================================

@pytest.mark.django_db
@patch('matches.views.league_views.render')
def test_league_detail_view_not_found(mock_render):
    # 1. ARRANGE: Żądanie do nieistniejącej ligi
    factory = RequestFactory()
    request = factory.get('/cokolwiek/')
    
    # 2. ACT
    league_detail_view(request, api_id=999) # Liga o tym ID nie istnieje w pustej bazie
    
    # 3. ASSERT: Sprawdzamy czy wygenerowano szablon z błędem
    mock_render.assert_called_once()
    args, kwargs = mock_render.call_args
    context = args[2]  # Kontekst to trzeci argument przekazywany do render()
    
    assert 'error' in context
    assert context['error'] == 'Liga nie została jeszcze pobrana przez system.'
    assert context['league']['name'] == 'Nieznana Liga'
    assert len(context['recent_matches']) == 0

@pytest.mark.django_db
@patch('matches.views.league_views.render')
def test_league_detail_view_success(mock_render, setup_league_data):
    # 1. ARRANGE
    factory = RequestFactory()
    request = factory.get('/cokolwiek/')
    
    # 2. ACT: Uderzamy pod poprawne ID z naszej fabryki
    league_detail_view(request, api_id=99)
    
    # 3. ASSERT: Sprawdzamy, czy widok wyciągnął wszystkie powiązane dane z bazy
    mock_render.assert_called_once()
    args, kwargs = mock_render.call_args
    context = args[2]
    
    # Sprawdzamy zawartość kontekstu przekazywaną do HTML
    assert context['league'] == setup_league_data
    assert len(context['upcoming_matches']) == 1
    assert len(context['recent_matches']) == 1
    assert len(context['standings']) == 1
    
    # Dodatkowo sprawdzamy czy tabela dobrze połączyła się z drużyną
    assert context['standings'][0].team.name == "Team A"