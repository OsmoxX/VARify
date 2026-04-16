import pytest
from django.db import IntegrityError
from matches.models import League


# ==========================================
# TESTY: HAPPY PATH
# ==========================================
@pytest.mark.django_db
def test_league_creation_and_str_method():
    # 1. Tworzymy ligę z kompletem danych (w tym opcjonalne pole 'country')
    league_full = League.objects.create(
        api_id="17", name="Premier League", country="England"
    )

    assert league_full.api_id == "17"
    assert league_full.country == "England"
    assert str(league_full) == "Premier League"  # Test metody __str__


@pytest.mark.django_db
def test_league_creation_without_country():
    # 2. Tworzymy ligę bez podawania państwa (pole country ma blank=True, null=True)
    league_empty_country = League.objects.create(api_id="7", name="Champions League")

    assert league_empty_country.api_id == "7"
    assert league_empty_country.country is None or league_empty_country.country == ""
    assert str(league_empty_country) == "Champions League"


# ==========================================
# TESTY: EDGE CASES (SAD PATH)
# ==========================================
@pytest.mark.django_db
def test_league_api_id_must_be_unique():
    # 1. Tworzymy pierwszą ligę
    League.objects.create(api_id="999", name="Pierwsza Liga Testowa")

    # 2. Próbujemy utworzyć drugą, ZUPEŁNIE INNĄ ligę, ale z tym samym api_id
    # Spodziewamy się, że baza danych rzuci IntegrityError dzięki fladze unique=True
    with pytest.raises(IntegrityError):
        League.objects.create(api_id="999", name="Druga Liga Testowa - Kopia ID")
