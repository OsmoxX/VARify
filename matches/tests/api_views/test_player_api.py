import pytest
from unittest.mock import patch
from django.core.cache import cache
from rest_framework.test import APIClient
from rest_framework import status
from matches.models import Player, Team

# ==========================================
# FABRYKA DANYCH
# ==========================================
@pytest.fixture
def api_client():
    cache.clear()
    return APIClient()

@pytest.fixture
def setup_players():
    """Przygotowuje kilku zawodników i drużyny do testów filtrowania."""
    team_barca = Team.objects.create(api_id=1, name="FC Barcelona")
    team_real = Team.objects.create(api_id=2, name="Real Madrid")
    
    Player.objects.create(api_id=10, name="Lionel Messi", team=team_barca, date_of_birth="1987-06-24")
    Player.objects.create(api_id=20, name="Pedri", team=team_barca, date_of_birth="2002-11-25")
    Player.objects.create(api_id=30, name="Vinicius Jr", team=team_real, date_of_birth="2000-07-12")

# ==========================================
# TESTY: get_players (Lista, Paginacja i Filtry)
# ==========================================
@pytest.mark.django_db
def test_get_players_list_and_pagination(api_client, setup_players):
    # ACT: Uderzamy w endpoint listy graczy
    response = api_client.get('/api/players/')
    
    # ASSERT: Sprawdzamy, czy działa paginacja
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert 'count' in data
    assert data['count'] == 3  # Mamy 3 graczy w bazie
    assert len(data['results']) == 3

@pytest.mark.django_db
def test_get_players_search_filter(api_client, setup_players):
    # ACT: Filtrujemy po nazwie (search=Messi)
    response = api_client.get('/api/players/?search=Messi')
    
    # ASSERT
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data['count'] == 1
    assert data['results'][0]['name'] == "Lionel Messi"

@pytest.mark.django_db
def test_get_players_team_filter(api_client, setup_players):
    # ACT: Filtrujemy po ID drużyny (team=1 czyli Barcelona)
    response = api_client.get('/api/players/?team=1')
    
    # ASSERT
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data['count'] == 2  # Messi i Pedri

# ==========================================
# TESTY: get_player_detail (Profil gracza i dociąganie danych)
# ==========================================
@pytest.mark.django_db
@patch('matches.api_views.player_api.fetch_player')
def test_get_player_detail_exists_with_dob(mock_fetch, api_client, setup_players):
    # ARRANGE: Messi (ID 10) ma zapisaną datę urodzenia w bazie.
    
    # ACT
    response = api_client.get('/api/players/10/')
    
    # ASSERT: API zwraca profil od razu, NIE uderzając do zewnętrznego RapidAPI
    assert response.status_code == status.HTTP_200_OK
    assert response.json()['name'] == "Lionel Messi"
    mock_fetch.assert_not_called()  # Dowód, że fetch_player nie zostało uruchomione!

@pytest.mark.django_db
@patch('matches.api_views.player_api.fetch_player')
def test_get_player_detail_without_dob_calls_api(mock_fetch, api_client):
    # ARRANGE: Gracz jest w bazie, ale ma puste pole date_of_birth
    p_incomplete = Player.objects.create(api_id=99, name="Kylian Mbappe") 
    
    # Mockujemy, że fetch_player dociąga brakujące dane i zwraca tego gracza
    mock_fetch.return_value = p_incomplete
    
    # ACT
    response = api_client.get('/api/players/99/')
    
    # ASSERT: Endpoint zauważył brak daty i odpalił fetch_player
    assert response.status_code == status.HTTP_200_OK
    mock_fetch.assert_called_once_with(99)

@pytest.mark.django_db
@patch('matches.api_views.player_api.fetch_player')
def test_get_player_detail_not_found_returns_404(mock_fetch, api_client):
    # ARRANGE: Gracza nie ma w bazie, a zmockowane API też go nie znajduje (zwraca None)
    mock_fetch.return_value = None
    
    # ACT
    response = api_client.get('/api/players/999/')
    
    # ASSERT: Endpoint poprawnie zwraca błąd 404
    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert response.json()['detail'] == 'Zawodnik nie znaleziony.'
    mock_fetch.assert_called_once_with(999)