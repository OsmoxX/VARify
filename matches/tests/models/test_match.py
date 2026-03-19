import pytest
from django.db import IntegrityError, transaction
from matches.models import League, Team, LiveMatch, UpcomingMatch, MatchSubscription

# ==========================================
# FABRYKA DANYCH
# ==========================================
@pytest.fixture
def base_data():
    """Przygotowuje podstawowe drużyny i ligę do testów meczów."""
    league = League.objects.create(api_id='100', name='Test League')
    team_a = Team.objects.create(api_id=1, name='Team A')
    team_b = Team.objects.create(api_id=2, name='Team B')
    return league, team_a, team_b

# ==========================================
# TESTY: HAPPY PATH (Metody i Properties)
# ==========================================
@pytest.mark.django_db
def test_live_and_upcoming_match_properties(base_data):
    league, team_a, team_b = base_data
    
    # Tworzymy mecz na żywo
    live_match = LiveMatch.objects.create(
        api_id=123, league=league, home_team=team_a, away_team=team_b, status="live"
    )
    
    # Tworzymy mecz nadchodzący
    upcoming_match = UpcomingMatch.objects.create(
        api_id=456, league=league, home_team=team_a, away_team=team_b
    )

    # 1. Test metody __str__
    assert str(live_match) == "Team A vs Team B"
    assert str(upcoming_match) == "Team A vs Team B"

    # 2. Test property updated_at_timestamp (czy zwraca int > 0)
    assert isinstance(live_match.updated_at_timestamp, int)
    assert live_match.updated_at_timestamp > 0
    assert isinstance(upcoming_match.updated_at_timestamp, int)

    # 3. Test edge case: co jeśli updated_at to None? (symulujemy to ręcznie)
    live_match.updated_at = None
    upcoming_match.updated_at = None
    assert live_match.updated_at_timestamp == 0
    assert upcoming_match.updated_at_timestamp == 0

@pytest.mark.django_db
def test_match_subscription_str(base_data):
    _, team_a, team_b = base_data
    match = LiveMatch.objects.create(api_id=789, home_team=team_a, away_team=team_b, status="live")
    
    sub = MatchSubscription.objects.create(session_key="session_xyz", match=match)
    assert str(sub) == "session_xyz - Team A vs Team B"

# ==========================================
# TESTY: EDGE CASES (Ochrona Unikalności z atomic)
# ==========================================
@pytest.mark.django_db
def test_matches_unique_constraints(base_data):
    # Tworzymy pierwsze, poprawne rekordy
    match_live = LiveMatch.objects.create(api_id=999, status="live")
    UpcomingMatch.objects.create(api_id=888)
    MatchSubscription.objects.create(session_key="abc", match=match_live)

    # 1. LiveMatch: blokada zduplikowanego api_id
    with pytest.raises(IntegrityError):
        with transaction.atomic():
            LiveMatch.objects.create(api_id=999, status="ended")

    # 2. UpcomingMatch: blokada zduplikowanego api_id
    with pytest.raises(IntegrityError):
        with transaction.atomic():
            UpcomingMatch.objects.create(api_id=888)

    # 3. MatchSubscription: blokada zduplikowanej subskrypcji dla tej samej sesji i meczu
    with pytest.raises(IntegrityError):
        with transaction.atomic():
            MatchSubscription.objects.create(session_key="abc", match=match_live)
            
    # 4. Ale inna sesja może zasubskrybować ten sam mecz!
    MatchSubscription.objects.create(session_key="xyz", match=match_live)