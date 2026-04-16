import pytest
from rest_framework.test import APIClient
from rest_framework import status
from django.core.cache import cache
from django.utils import timezone
from datetime import timedelta
from matches.models import (
    League,
    Team,
    LiveMatch,
    MatchEvent,
    MatchLineup,
    UpcomingMatch,
)


# ==========================================
# FABRYKA DANYCH
# ==========================================
@pytest.fixture
def api_client():
    cache.clear()  # Zawsze czyścimy pamięć przed testem (omijamy Throttling!)
    return APIClient()


@pytest.fixture
def setup_match_data():
    """Tworzy bogaty zestaw danych: Ligi, Drużyny, Mecze Live, Zdarzenia, Składy i Nadchodzące."""
    l1 = League.objects.create(api_id=10, name="Premier League")
    l2 = League.objects.create(api_id=20, name="La Liga")

    t1 = Team.objects.create(api_id=1, name="Arsenal")
    t2 = Team.objects.create(api_id=2, name="Chelsea")

    # Mecze Live
    lm1 = LiveMatch.objects.create(
        api_id=100,
        league=l1,
        home_team=t1,
        away_team=t2,
        is_top=True,
        status="2nd Half",
    )
    lm2 = LiveMatch.objects.create(
        api_id=200,
        league=l2,
        home_team=t2,
        away_team=t1,
        is_top=False,
        status="1st Half",
    )

    # Zdarzenia dla pierwszego meczu
    MatchEvent.objects.create(
        match=lm1, time=15, incident_type="goal", player_name="Saka"
    )
    MatchEvent.objects.create(
        match=lm1, time=45, incident_type="card", player_name="Odegaard"
    )

    # Składy dla pierwszego meczu
    MatchLineup.objects.create(
        match=lm1, player_name="Raya", is_home_team=True, is_starting_xi=True
    )
    MatchLineup.objects.create(
        match=lm1, player_name="Mudryk", is_home_team=False, is_starting_xi=True
    )

    # Mecze nadchodzące (jeden na dzisiaj, drugi na jutro)
    today = timezone.now().date()
    tomorrow = today + timedelta(days=1)
    UpcomingMatch.objects.create(
        api_id=300,
        league=l1,
        home_team=t1,
        away_team=t2,
        is_top=True,
        start_datetime=timezone.now(),
    )
    UpcomingMatch.objects.create(
        api_id=400,
        league=l2,
        home_team=t2,
        away_team=t1,
        is_top=False,
        start_datetime=timezone.now() + timedelta(days=1),
    )

    return {
        "lm1": lm1,
        "lm2": lm2,
        "today": today.strftime("%Y-%m-%d"),
        "tomorrow": tomorrow.strftime("%Y-%m-%d"),
    }


# ==========================================
# TESTY: get_live_matches (Filtrowanie)
# ==========================================
@pytest.mark.django_db
def test_get_live_matches_filters(api_client, setup_match_data):
    # 1. Test filtru Ligi
    res_league = api_client.get("/api/live-matches/?league=10")
    assert res_league.status_code == status.HTTP_200_OK
    assert len(res_league.json()) == 1

    assert res_league.json()[0]["api_id"] == 100

    # 2. Test filtru Top Only
    res_top = api_client.get("/api/live-matches/?top=true")
    assert len(res_top.json()) == 1
    assert res_top.json()[0]["is_top"] is True


# ==========================================
# TESTY: get_live_match_detail (Happy & Sad Path)
# ==========================================
@pytest.mark.django_db
def test_get_live_match_detail(api_client, setup_match_data):
    # Sukces: Mecz istnieje
    lm1 = setup_match_data["lm1"]
    res_success = api_client.get(f"/api/live-matches/{lm1.id}/")
    assert res_success.status_code == status.HTTP_200_OK
    assert res_success.json()["api_id"] == 100

    # Błąd: Meczu nie ma w bazie (404)
    res_404 = api_client.get("/api/live-matches/9999/")
    assert res_404.status_code == status.HTTP_404_NOT_FOUND
    assert res_404.json()["detail"] == "Mecz nie znaleziony."


# ==========================================
# TESTY: get_match_events (Paginacja)
# ==========================================
@pytest.mark.django_db
def test_get_match_events_pagination(api_client, setup_match_data):
    lm1 = setup_match_data["lm1"]
    response = api_client.get(f"/api/live-matches/{lm1.id}/events/")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert "count" in data  # Udowadnia, że używamy Paginatora
    assert data["count"] == 2
    assert len(data["results"]) == 2


# ==========================================
# TESTY: get_match_lineups (Filtrowanie i Paginacja)
# ==========================================
@pytest.mark.django_db
def test_get_match_lineups_filters(api_client, setup_match_data):
    lm1 = setup_match_data["lm1"]

    # 1. Bez filtrów (zwraca wszystkich)
    res_all = api_client.get(f"/api/live-matches/{lm1.id}/lineups/")
    assert res_all.json()["count"] == 2

    # 2. Filtr: tylko gospodarze (home)
    res_home = api_client.get(f"/api/live-matches/{lm1.id}/lineups/?team=home")
    assert res_home.json()["count"] == 1
    assert res_home.json()["results"][0]["is_home_team"] is True

    # 3. Filtr: tylko goście (away)
    res_away = api_client.get(f"/api/live-matches/{lm1.id}/lineups/?team=away")
    assert res_away.json()["count"] == 1
    assert res_away.json()["results"][0]["is_home_team"] is False


# ==========================================
# TESTY: get_upcoming_matches (Filtrowanie)
# ==========================================
@pytest.mark.django_db
def test_get_upcoming_matches_filters(api_client, setup_match_data):
    # 1. Test filtru Ligi
    res_league = api_client.get("/api/upcoming-matches/?league=10")
    assert len(res_league.json()) == 1

    # 2. Test filtru Top Only
    res_top = api_client.get("/api/upcoming-matches/?top=true")
    assert len(res_top.json()) == 1

    # 3. Test filtru Daty (szukamy dzisiejszych)
    today_str = setup_match_data["today"]
    res_date = api_client.get(f"/api/upcoming-matches/?date={today_str}")
    assert len(res_date.json()) == 1
