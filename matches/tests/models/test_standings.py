import pytest
from matches.models import League, Team, LeagueStandings

# ==========================================
# FABRYKA DANYCH
# ==========================================
@pytest.fixture
def standing_data():
    """Przygotowuje ligę i drużynę do testów tabeli."""
    league = League.objects.create(api_id='202', name='Ekstraklasa')
    team = Team.objects.create(api_id=1, name='Lech Poznań')
    return league, team

# ==========================================
# TESTY: HAPPY PATH
# ==========================================
@pytest.mark.django_db
def test_league_standings_creation_and_str(standing_data):
    league, team = standing_data
    
    # 1. Tworzymy wpis w tabeli ze wszystkimi statystykami
    standing = LeagueStandings.objects.create(
        league=league,
        team=team,
        position=1,
        points=65,
        matches_played=30,
        matches_won=20,
        matches_drawn=5,
        matches_lost=5,
        goals_for=60,
        goals_against=20,
        goal_difference=40
    )
    
    # Sprawdzamy, czy liczby się zgadzają
    assert standing.position == 1
    assert standing.points == 65
    assert standing.goal_difference == 40
    
    # Sprawdzamy czy data się wygenerowała
    assert standing.updated_at is not None
    
    # Sprawdzamy czytelną nazwę
    assert str(standing) == "Lech Poznań - Ekstraklasa"

# ==========================================
# TESTY: EDGE CASES & CASCADE
# ==========================================
@pytest.mark.django_db
def test_league_standings_cascade_delete(standing_data):
    league, team = standing_data
    
    # Tworzymy wpis w tabeli
    LeagueStandings.objects.create(
        league=league, team=team, position=1, points=60, 
        matches_played=30, matches_won=18, matches_drawn=6, 
        matches_lost=6, goals_for=50, goals_against=30, goal_difference=20
    )
    
    assert LeagueStandings.objects.count() == 1
    
    # USUWAJĄC LIGĘ, upewniamy się, że django usunie też jej tabele (CASCADE)
    league.delete()
    
    assert LeagueStandings.objects.count() == 0, "Wpis w tabeli powinien zostać usunięty razem z ligą!"

@pytest.mark.django_db
def test_league_standings_duplicate_not_enforced(standing_data):
    """
    Test udowadnia, że w obecnym modelu (bez unique_together) 
    można przypisać jedną drużynę dwa razy do tej samej ligi.
    """
    league, team = standing_data
    
    # Pierwszy wpis
    LeagueStandings.objects.create(
        league=league, team=team, position=1, points=60,
        matches_played=30, matches_won=18, matches_drawn=6, matches_lost=6,
        goals_for=50, goals_against=30, goal_difference=20
    )
    
    # Drugi wpis dla tej samej drużyny i ligi (nie wyrzuci błędu!)
    LeagueStandings.objects.create(
        league=league, team=team, position=2, points=59,
        matches_played=30, matches_won=17, matches_drawn=8, matches_lost=5,
        goals_for=49, goals_against=31, goal_difference=18
    )
    
    assert LeagueStandings.objects.filter(league=league, team=team).count() == 2