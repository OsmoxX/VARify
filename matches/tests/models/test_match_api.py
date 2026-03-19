import pytest
from rest_framework.test import APIClient
from django.core.cache import cache

# Dekorator mówi: "Zezwól temu testowi na dostęp do bazy danych"
# W pliku matches/tests/test_match_api.py

@pytest.mark.django_db
def test_live_matches_endpoint_returns_flat_list():
    # 1. ARRANGE
    client = APIClient()
    
    # 2. ACT
    response = client.get('/api/live-matches/')
    
    # 3. ASSERT
    assert response.status_code == 200
    
    data = response.json()
    
    assert isinstance(data, list), "Oczekiwano płaskiej listy meczów, a nie słownika paginacji!"

@pytest.mark.django_db
def test_upcoming_matches_throttling_for_anonymous_users():
    # ----------------------------------------
    # 1. ARRANGE
    # ----------------------------------------
    client = APIClient()
    
    # BARDZO WAŻNE: Czyścimy pamięć podręczną serwera (Cache)!
    # Bez tego Pytest mógłby pamiętać zapytania z poprzednich testów 
    # i zablokować nas za wcześnie.
    cache.clear()

    # ----------------------------------------
    # 2. ACT & ASSERT (Testujemy 30 udanych prób)
    # ----------------------------------------
    # Uderzamy w API 5 razy z rzędu w pętli. Każde powinno zwrócić status 200.
    for i in range(5):
        response = client.get('/api/upcoming-matches/')
        assert response.status_code == 200, f"Zapytanie numer {i+1} zostało zablokowane za wcześnie!"

    # ----------------------------------------
    # 3. ACT & ASSERT (Testujemy tarczę)
    # ----------------------------------------
    response_blocked = client.get('/api/upcoming-matches/')
    
    assert response_blocked.status_code == 429