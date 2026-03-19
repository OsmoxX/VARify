import pytest
from django.db import IntegrityError
from django.db import transaction
from matches.models import League, Team, LiveMatch, MatchLineup, MissingPlayer

# ==========================================
# FABRYKA DANYCH
# ==========================================
@pytest.fixture
def match_fixture():
    """Przygotowuje podstawowy mecz, do którego będziemy przypinać zawodników."""
    league = League.objects.create(api_id=999, name="Testowa Liga")
    team_a = Team.objects.create(api_id=101, name="Drużyna Home")
    team_b = Team.objects.create(api_id=102, name="Drużyna Away")
    return LiveMatch.objects.create(
        api_id=5000, 
        league=league, 
        home_team=team_a, 
        away_team=team_b
    )

# ==========================================
# TESTY: WŁAŚCIWOŚCI (PROPERTIES)
# ==========================================
@pytest.mark.django_db
def test_match_lineup_position_properties(match_fixture):
    # Bramkarz (Goalkeeper)
    gk = MatchLineup.objects.create(match=match_fixture, player_name="Szczęsny", position="G")
    assert gk.position_label == "GK"
    assert gk.is_goalkeeper is True

    # Obrońca (Defender)
    def_player = MatchLineup.objects.create(match=match_fixture, player_name="Glik", position="D")
    assert def_player.position_label == "DEF"
    assert def_player.is_goalkeeper is False

    # Pomocnik i Napastnik
    mid = MatchLineup.objects.create(match=match_fixture, player_name="Zieliński", position="M")
    fwd = MatchLineup.objects.create(match=match_fixture, player_name="Lewandowski", position="F")
    assert mid.position_label == "MID"
    assert fwd.position_label == "FWD"

    # Zła lub pusta pozycja (Fallback)
    unknown = MatchLineup.objects.create(match=match_fixture, player_name="Ktoś", position="XYZ")
    empty = MatchLineup.objects.create(match=match_fixture, player_name="Inny", position=None)
    assert unknown.position_label == "XYZ"  # Zwraca to, co dostał
    assert empty.position_label == ""       # Zwraca pusty string

# ==========================================
# TESTY: METODY __STR__
# ==========================================
@pytest.mark.django_db
def test_match_lineup_and_missing_str_methods(match_fixture):
    # Test __str__ dla składu
    lineup_home = MatchLineup.objects.create(match=match_fixture, player_name="Messi", is_home_team=True)
    lineup_away = MatchLineup.objects.create(match=match_fixture, player_name="Ronaldo", is_home_team=False)
    
    assert str(lineup_home) == f"Messi (Home) - {match_fixture}"
    assert str(lineup_away) == f"Ronaldo (Away) - {match_fixture}"

    # Test __str__ dla nieobecnych graczy
    missing = MissingPlayer.objects.create(match=match_fixture, player_name="Neymar", type="missing", is_home_team=True)
    doubtful = MissingPlayer.objects.create(match=match_fixture, player_name="Mbappe", type="doubtful", is_home_team=False)
    
    assert str(missing) == "Neymar (Home) - Missing"
    assert str(doubtful) == "Mbappe (Away) - Doubtful"

# ==========================================
# TESTY: EDGE CASES (SAD PATH)
# ==========================================
@pytest.mark.django_db
def test_match_lineup_unique_together_constraint(match_fixture):
    # 1. Dodajemy zawodnika do składu gospodarzy
    MatchLineup.objects.create(
        match=match_fixture,
        player_name="Kamil Grosicki",
        is_home_team=True
    )

    # 2. Próbujemy dodać GO JESZCZE RAZ.
    # Używamy transaction.atomic(), żeby uchronić główną transakcję testu przed wybuchem!
    with pytest.raises(IntegrityError):
        with transaction.atomic(): 
            MatchLineup.objects.create(
                match=match_fixture,
                player_name="Kamil Grosicki",
                is_home_team=True
            )

    # 3. Dodanie zawodnika o tym samym imieniu do DRUŻYNY PRZECIWNEJ.
    MatchLineup.objects.create(
        match=match_fixture,
        player_name="Kamil Grosicki",
        is_home_team=False
    )