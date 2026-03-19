import pytest
from django.db import IntegrityError, transaction
from matches.models import Team

# ==========================================
# TESTY: HAPPY PATH
# ==========================================
@pytest.mark.django_db
def test_team_creation_and_str_method():
    # 1. Tworzymy drużynę z kompletem danych
    team_full = Team.objects.create(
        api_id=86,
        name="Real Madryt",
        logo_url="https://example.com/real_madryt.png"
    )

    assert team_full.api_id == 86
    assert team_full.name == "Real Madryt"
    assert team_full.logo_url == "https://example.com/real_madryt.png"
    assert str(team_full) == "Real Madryt"  # Test metody __str__

@pytest.mark.django_db
def test_team_creation_without_logo():
    # 2. Tworzymy drużynę bez podawania URL do logo (blank=True, null=True)
    team_no_logo = Team.objects.create(
        api_id=101,
        name="Drużyna Bez Logo"
    )

    assert team_no_logo.api_id == 101
    assert team_no_logo.logo_url is None or team_no_logo.logo_url == ''
    assert str(team_no_logo) == "Drużyna Bez Logo"

# ==========================================
# TESTY: EDGE CASES (Ochrona Unikalności)
# ==========================================
@pytest.mark.django_db
def test_team_api_id_unique_constraint():
    # 1. Tworzymy pierwszą drużynę
    Team.objects.create(
        api_id=999,
        name="Pierwszy Zespół"
    )

    # 2. Próbujemy utworzyć drugą, ZUPEŁNIE INNĄ drużynę, ale z tym samym api_id!
    # Używamy transaction.atomic(), żeby uchronić test przed wybuchem
    with pytest.raises(IntegrityError):
        with transaction.atomic():
            Team.objects.create(
                api_id=999,
                name="Drugi Zespół (Klon ID)"
            )