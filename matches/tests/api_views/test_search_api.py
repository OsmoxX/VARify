import pytest
from unittest.mock import patch
from rest_framework.test import APIClient
from rest_framework import status
from django.core.cache import cache
from matches.models import Player, Team


# ==========================================
# FABRYKA DANYCH
# ==========================================
@pytest.fixture
def api_client():
    cache.clear()  # Omijamy Throttling!
    return APIClient()


# ==========================================
# TESTY: Wyszukiwarka (search_api.py)
# ==========================================
@pytest.mark.django_db
def test_search_empty_query(api_client):
    # ACT: Wysyłamy zapytanie bez parametru 'q' lub z pustym
    response = api_client.get("/api/search/")

    # ASSERT: Zgodnie z linijką 23, powinno zwrócić puste listy
    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {"teams": [], "players": []}


@pytest.mark.django_db
@patch("matches.api_views.search_api.search_players_from_api")
def test_search_found_in_local_db(mock_external_search, api_client):
    # ARRANGE: Tworzymy lokalną drużynę i gracza
    t = Team.objects.create(api_id=1, name="Real Madrid")
    Player.objects.create(api_id=10, name="Vinicius Junior", team=t)

    # ACT: Szukamy "Vinicius"
    response = api_client.get("/api/search/?q=Vinicius")

    # ASSERT:
    assert response.status_code == status.HTTP_200_OK
    data = response.json()

    # Znalazł 1 gracza i 0 drużyn z tym słowem
    assert len(data["players"]) == 1
    assert data["players"][0]["name"] == "Vinicius Junior"
    assert len(data["teams"]) == 0
    assert data["query"] == "Vinicius"

    # NAJWAŻNIEJSZE: Skoro gracz był w lokalnej bazie,
    # funkcja NIE POWINNA wołać zewnętrznego API!
    mock_external_search.assert_not_called()


@pytest.mark.django_db
@patch("matches.api_views.search_api.search_players_from_api")
def test_search_not_in_db_calls_api(mock_external_search, api_client):
    # ARRANGE: W lokalnej bazie mamy drużynę, ale NIE MAMY gracza, którego szukamy
    Team.objects.create(api_id=2, name="Paris SG")

    # Mockujemy zachowanie funkcji zewnętrznej - udajemy, że znalazła gracza w RapidAPI
    # Widok używa serializera, więc mock musi zwrócić obiekt modelu Player!
    mock_player = Player(api_id=99, name="Kylian Mbappe")
    mock_external_search.return_value = [mock_player]

    # ACT: Szukamy "Mbappe", którego nie ma w lokalnej DB
    response = api_client.get("/api/search/?q=Mbappe")

    # ASSERT:
    assert response.status_code == status.HTTP_200_OK
    data = response.json()

    assert len(data["players"]) == 1
    assert data["players"][0]["name"] == "Kylian Mbappe"

    # Dowód, że skrypt wszedł w klauzulę `if not players:` i uderzył do zewnętrznego API
    mock_external_search.assert_called_once_with("Mbappe")
