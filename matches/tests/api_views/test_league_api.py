import pytest
from rest_framework.test import APIClient
from rest_framework import status
from django.core.cache import cache
from matches.models import League, Team, LeagueStandings


# ==========================================
# FABRYKA DANYCH
# ==========================================
@pytest.fixture
def api_client():
    # Czyścimy pamięć przed każdym testem, żeby nas nie zablokował Throttling!
    cache.clear()
    return APIClient()


@pytest.fixture
def setup_leagues():
    """Przygotowuje Ligi, Drużyny i Tabele do testów."""
    l1 = League.objects.create(api_id=10, name="Premier League", country="England")
    League.objects.create(api_id=20, name="La Liga", country="Spain")
    League.objects.create(api_id=30, name="Ekstraklasa", country="Poland")

    t1 = Team.objects.create(api_id=1, name="Arsenal")
    t2 = Team.objects.create(api_id=2, name="Chelsea")

    # Tworzymy tabelę dla Premier League
    LeagueStandings.objects.create(
        league=l1,
        team=t1,
        position=1,
        points=80,
        matches_played=30,
        matches_won=25,
        matches_drawn=5,
        matches_lost=0,
        goals_for=70,
        goals_against=20,
        goal_difference=50,
    )
    LeagueStandings.objects.create(
        league=l1,
        team=t2,
        position=2,
        points=75,
        matches_played=30,
        matches_won=23,
        matches_drawn=6,
        matches_lost=1,
        goals_for=60,
        goals_against=25,
        goal_difference=35,
    )


# ==========================================
# TESTY: get_leagues (Lista i Paginacja)
# ==========================================
@pytest.mark.django_db
def test_get_leagues_list_and_pagination(api_client, setup_leagues):
    # ACT
    response = api_client.get("/api/leagues/")

    # ASSERT
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert "count" in data
    assert data["count"] == 3  # Mamy 3 ligi w bazie
    assert len(data["results"]) == 3


@pytest.mark.django_db
def test_get_leagues_search_by_name(api_client, setup_leagues):
    # ACT: Szukamy po nazwie (część słowa, np. "mier")
    response = api_client.get("/api/leagues/?search=mier")

    # ASSERT
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["count"] == 1
    assert data["results"][0]["name"] == "Premier League"


@pytest.mark.django_db
def test_get_leagues_search_by_country(api_client, setup_leagues):
    # ACT: Szukamy po kraju (np. "Spain") z dodatkowymi spacjami (test strip())
    response = api_client.get("/api/leagues/?search=  Spain  ")

    # ASSERT
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["count"] == 1
    assert data["results"][0]["country"] == "Spain"


# ==========================================
# TESTY: get_league_detail (Profil Ligi)
# ==========================================
@pytest.mark.django_db
def test_get_league_detail_success(api_client, setup_leagues):
    # ACT
    response = api_client.get("/api/leagues/30/")

    # ASSERT
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["name"] == "Ekstraklasa"


@pytest.mark.django_db
def test_get_league_detail_not_found(api_client):
    # ACT: Pytamy o ligę, której nie ma w bazie
    response = api_client.get("/api/leagues/999/")

    # ASSERT
    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert response.json()["detail"] == "Liga nie znaleziona."


# ==========================================
# TESTY: get_league_standings (Tabela Ligi)
# ==========================================
@pytest.mark.django_db
def test_get_league_standings_success(api_client, setup_leagues):
    # ACT: Pobieramy tabelę dla Premier League (api_id = 10)
    response = api_client.get("/api/leagues/10/standings/")

    # ASSERT
    assert response.status_code == status.HTTP_200_OK
    data = response.json()

    # Mamy dwie drużyny w tabeli Premier League
    assert data["count"] == 2
    results = data["results"]

    # Sprawdzamy czy kolejność jest poprawna (Arsenal pozycja 1, Chelsea pozycja 2)
    assert results[0]["position"] == 1
    assert "Arsenal" in str(
        results[0]
    )  # Sprawdzamy, czy Arsenal po prostu jest w tym rzędzie tabeli
    assert results[1]["position"] == 2
    assert "Chelsea" in str(results[1])


@pytest.mark.django_db
def test_get_league_standings_empty(api_client, setup_leagues):
    # ACT: Pobieramy tabelę dla La Ligi (api_id = 20), dla której nie stworzyliśmy wpisów
    response = api_client.get("/api/leagues/20/standings/")

    # ASSERT
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["count"] == 0
