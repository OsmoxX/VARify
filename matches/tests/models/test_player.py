import pytest
from datetime import date
from django.db import IntegrityError, transaction
from matches.models import Team, Player

# ==========================================
# FABRYKA DANYCH
# ==========================================
@pytest.fixture
def team_fixture():
    """Przygotowuje drużynę do przypisania zawodnika."""
    return Team.objects.create(api_id=101, name="FC Barcelona")

# ==========================================
# TESTY: HAPPY PATH
# ==========================================
@pytest.mark.django_db
def test_player_creation_and_str_method(team_fixture):
    # 1. Tworzymy zawodnika z wypełnioną większością pól
    player = Player.objects.create(
        api_id=10,
        name="Lionel Messi",
        first_name="Lionel",
        last_name="Messi",
        team=team_fixture,
        position="F",
        jersey_number=10,
        nationality="Argentina",
        date_of_birth=date(1987, 6, 24),
        height=170,
        weight=72,
        preferred_foot="left",
        market_value=50000000,
        contract_until=date(2025, 6, 30)
        # 'retired' pomijamy, żeby sprawdzić wartość domyślną
    )
    
    assert player.api_id == 10
    assert player.team is not None
    assert player.team.name == "FC Barcelona"
    assert player.preferred_foot == "left"
    assert player.retired is False  # Sprawdzenie wartości domyślnej
    assert str(player) == "Lionel Messi"  # Test metody __str__

@pytest.mark.django_db
def test_player_creation_without_team():
    # 2. Tworzymy zawodnika bez przypisanej drużyny (Wolny Agent)
    player_free_agent = Player.objects.create(
        api_id=99,
        name="Wolny Agent"
    )
    
    assert player_free_agent.api_id == 99
    assert player_free_agent.team is None
    assert player_free_agent.retired is False
    assert str(player_free_agent) == "Wolny Agent"

# ==========================================
# TESTY: EDGE CASES (Ochrona Unikalności)
# ==========================================
@pytest.mark.django_db
def test_player_api_id_unique_constraint(team_fixture):
    # 1. Tworzymy pierwszego gracza
    Player.objects.create(
        api_id=7, 
        name="Cristiano Ronaldo", 
        team=team_fixture
    )

    # 2. Próbujemy dodać innego gracza, ale z tym samym api_id!
    # Używamy transaction.atomic(), żeby uchronić test przed wybuchem
    with pytest.raises(IntegrityError):
        with transaction.atomic():
            Player.objects.create(
                api_id=7, 
                name="Inny Zawodnik z tym samym ID", 
                team=team_fixture
            )