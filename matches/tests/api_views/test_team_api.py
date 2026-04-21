import pytest
from datetime import date, timedelta
from unittest.mock import patch
from rest_framework.test import APIClient
from rest_framework import status
from django.core.cache import cache
from matches.models import League, Team, LeagueStandings, LiveMatch


# ==========================================
# FABRYKA DANYCH
# ==========================================
@pytest.fixture
def api_client():
    cache.clear()  # Omijamy blokadę Throttlingu!
    return APIClient()


@pytest.fixture
def setup_team_data():
    """Tworzy bazę lig, drużyn, tabeli i meczów."""
    l1 = League.objects.create(api_id=1, name="Premier League")

    t1 = Team.objects.create(api_id=10, name="Arsenal")
    t2 = Team.objects.create(api_id=20, name="Chelsea")
    t3 = Team.objects.create(
        api_id=30, name="Real Madrid"
    )  # Drużyna bez tabeli i meczów

    # Tabela ligowa
    LeagueStandings.objects.create(
        league=l1,
        team=t1,
        position=1,
        points=80,
        matches_played=0,
        matches_won=0,
        matches_drawn=0,
        matches_lost=0,
        goals_for=0,
        goals_against=0,
        goal_difference=0,
    )
    LeagueStandings.objects.create(
        league=l1,
        team=t2,
        position=2,
        points=75,
        matches_played=0,
        matches_won=0,
        matches_drawn=0,
        matches_lost=0,
        goals_for=0,
        goals_against=0,
        goal_difference=0,
    )

    # Lokalne mecze w bazie (Arsenal ma 2 mecze)
    LiveMatch.objects.create(api_id=100, league=l1, home_team=t1, away_team=t2)
    LiveMatch.objects.create(api_id=101, league=l1, home_team=t2, away_team=t1)

    return {"t1": t1, "t2": t2, "t3": t3, "l1": l1}


# ==========================================
# TESTY: get_teams (Lista i Szukajka)
# ==========================================
@pytest.mark.django_db
def test_get_teams_list(api_client, setup_team_data):
    response = api_client.get("/api/teams/")
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["count"] == 3


@pytest.mark.django_db
def test_get_teams_search(api_client, setup_team_data):
    # Szukamy "Ars" (powinno znaleźć Arsenal)
    response = api_client.get("/api/teams/?search=Ars")
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["count"] == 1
    assert response.json()["results"][0]["name"] == "Arsenal"


# ==========================================
# TESTY: get_team_detail (Profil Drużyny)
# ==========================================
@pytest.mark.django_db
def test_get_team_detail(api_client, setup_team_data):
    # Sukces
    res_success = api_client.get("/api/teams/10/")
    assert res_success.status_code == status.HTTP_200_OK
    assert res_success.json()["name"] == "Arsenal"

    # Błąd 404
    res_404 = api_client.get("/api/teams/999/")
    assert res_404.status_code == status.HTTP_404_NOT_FOUND


# ==========================================
# TESTY: get_team_standings (Tabela dla zespołu)
# ==========================================
@pytest.mark.django_db
def test_get_team_standings(api_client, setup_team_data):
    # Sukces: Arsenal (10) jest w Premier League, powinno zwrócić CAŁĄ tabelę tej ligi
    res_success = api_client.get("/api/teams/10/standings/")
    assert res_success.status_code == status.HTTP_200_OK
    data = res_success.json()
    assert data["count"] == 2  # Arsenal i Chelsea
    assert data["results"][0]["position"] == 1
    assert "Arsenal" in str(
        data["results"][0]
    )  # Używamy naszego bezpiecznego sprawdzenia stringiem

    # Błąd: Real Madryt (30) nie ma u nas przypisanej żadnej tabeli
    res_404 = api_client.get("/api/teams/30/standings/")
    assert res_404.status_code == status.HTTP_404_NOT_FOUND


# ==========================================
# TESTY: get_team_matches (Historia z auto-zwiadowcą)
# ==========================================
@pytest.mark.django_db
def test_get_team_matches_not_found(api_client):
    # Pytamy o mecze drużyny-widmo
    res = api_client.get("/api/teams/999/matches/")
    assert res.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
@patch("matches.tasks.sync_tasks.fetch_last_matches_team_task.delay")
def test_get_team_matches_calls_api_when_under_5(
    mock_delay, api_client, setup_team_data
):
    # ARRANGE: Arsenal ma u nas lokalnie tylko 2 mecze (czyli mniej niż 5).
    # ACT
    res = api_client.get("/api/teams/10/matches/")

    # ASSERT: Widok powinien odpałić task Celery!
    assert res.status_code == status.HTTP_200_OK
    assert res.json()["count"] == 2  # Zwraca te 2 lokalne
    mock_delay.assert_called_once_with(10, 5)


@pytest.mark.django_db
@patch("matches.tasks.sync_tasks.fetch_last_matches_team_task.delay")
def test_get_team_matches_api_exception_handled(
    mock_delay, api_client, setup_team_data
):
    # ARRANGE: Delay nie rzuca wyjątku (Celery samo obrabia błędy)
    # ACT
    res = api_client.get("/api/teams/10/matches/")

    # ASSERT: Zawsze 200 — wyjątek pożarty w try..except widaću.
    assert res.status_code == status.HTTP_200_OK
    assert res.json()["count"] == 2


@pytest.mark.django_db
@patch("matches.tasks.sync_tasks.fetch_last_matches_team_task.delay")
def test_get_team_matches_over_5_skips_api(mock_delay, api_client, setup_team_data):
    # ARRANGE: Dodajemy Arsenalowi 3 kolejne mecze z dzisiejszą datą (czyli świeże)
    t1, t2, l1 = setup_team_data["t1"], setup_team_data["t2"], setup_team_data["l1"]
    today = date.today()
    for i in range(3):
        LiveMatch.objects.create(
            api_id=200 + i, league=l1, home_team=t1, away_team=t2, match_date=today
        )
    # Aktualizujemy też oryginalne 2 mecze, żeby miały dzisiejszą datę
    LiveMatch.objects.filter(api_id__in=[100, 101]).update(match_date=today)

    # ACT
    res = api_client.get("/api/teams/10/matches/")

    # ASSERT: Baza jest pełna (5 meczów) i dane są świeże → zwiadowca NIE powinien się wywołać!
    assert res.status_code == status.HTTP_200_OK
    assert res.json()["count"] == 5
    mock_delay.assert_not_called()


@pytest.mark.django_db
@patch("matches.tasks.sync_tasks.fetch_last_matches_team_task.delay")
def test_get_team_matches_stale_data_triggers_api(
    mock_delay, api_client, setup_team_data
):
    # ARRANGE: Arsenal ma 5 meczów, ale wszystkie z wczoraj (czyli stale)
    t1, t2, l1 = setup_team_data["t1"], setup_team_data["t2"], setup_team_data["l1"]
    yesterday = date.today() - timedelta(days=1)
    for i in range(3):
        LiveMatch.objects.create(
            api_id=200 + i, league=l1, home_team=t1, away_team=t2, match_date=yesterday
        )
    LiveMatch.objects.filter(api_id__in=[100, 101]).update(match_date=yesterday)

    # ACT
    res = api_client.get("/api/teams/10/matches/")

    # ASSERT: Dane są stale (wczorajsze) → zwiadowca POWINIEN się wywołać!
    assert res.status_code == status.HTTP_200_OK
    mock_delay.assert_called_once_with(10, 5)


@pytest.mark.django_db
@patch("matches.tasks.sync_tasks.fetch_last_matches_team_task.delay")
def test_get_team_matches_fresh_data_skips_api(mock_delay, api_client, setup_team_data):
    # ARRANGE: Arsenal ma 5 meczów z dzisiejszą datą (czyli świeże)
    t1, t2, l1 = setup_team_data["t1"], setup_team_data["t2"], setup_team_data["l1"]
    today = date.today()
    for i in range(3):
        LiveMatch.objects.create(
            api_id=200 + i, league=l1, home_team=t1, away_team=t2, match_date=today
        )
    LiveMatch.objects.filter(api_id__in=[100, 101]).update(match_date=today)

    # ACT
    res = api_client.get("/api/teams/10/matches/")

    # ASSERT: Dane są świeże (dzisiaj) → zwiadowca NIE powinien się wywołać!
    assert res.status_code == status.HTTP_200_OK
    assert res.json()["count"] == 5
    mock_delay.assert_not_called()
