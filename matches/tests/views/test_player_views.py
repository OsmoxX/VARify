import pytest
from django.test import RequestFactory
from matches.views.player_views import player_detail

# ==========================================
# TEST: PLAYER VIEWS
# ==========================================


@pytest.mark.django_db
def test_player_detail_view_logic():
    # 1. Tworzymy sztuczne żądanie (Request)
    factory = RequestFactory()
    request = factory.get("/player/12345/")

    # 2. Wywołujemy widok z pliku player_views.py
    response = player_detail(request, api_id=12345)

    # 3. Sprawdzamy, czy widok odpowiedział poprawnie
    assert response.status_code == 200
    assert b"12345" in response.content
