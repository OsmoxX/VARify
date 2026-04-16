import pytest
from channels.testing import WebsocketCommunicator
from channels.routing import URLRouter
from django.urls import path
from channels.layers import get_channel_layer
from matches.consumers import MatchConsumer

# ==========================================
# FABRYKA ROUTINGU
# ==========================================
# Zamiast wczytywać całą aplikację, tworzymy "mini-router" tylko dla tego testu.
# Dzięki temu test zadziała niezależnie od tego, jak masz skonfigurowany plik routing.py.
application = URLRouter(
    [
        path("ws/match/<match_id>/", MatchConsumer.as_asgi()),
    ]
)

# ==========================================
# TESTY: MatchConsumer (WebSockety)
# ==========================================


@pytest.mark.asyncio
async def test_match_consumer_connect_disconnect():
    # 1. ARRANGE: Tworzymy symulator przeglądarki podpinający się pod kanał meczu 123
    communicator = WebsocketCommunicator(application, "/ws/match/123/")

    # 2. ACT: Próbujemy nawiązać połączenie
    connected, subprotocol = await communicator.connect()

    # 3. ASSERT: Połączenie musi zostać zaakceptowane (await self.accept())
    assert connected is True

    # Na koniec kulturalnie się rozłączamy
    await communicator.disconnect()


@pytest.mark.asyncio
async def test_match_consumer_receives_full_event():
    # 1. ARRANGE
    communicator = WebsocketCommunicator(application, "/ws/match/999/")
    connected, _ = await communicator.connect()
    assert connected is True

    # 2. ACT: Udajemy, że nasz Celery Task (albo sync_live_matches) krzyczy do grupy,
    # że właśnie padł gol w meczu 999.
    channel_layer = get_channel_layer()
    await channel_layer.group_send(
        "match_999",
        {
            "type": "match_event",
            "event_type": "goal",
            "icon": "⚽",
            "message": "Gooool!",
            "home_score": 2,
            "away_score": 1,
            "status": "2nd half",
        },
    )

    # 3. ASSERT: Nasz symulator przeglądarki powinien odebrać odpowiedź JSON
    response = await communicator.receive_json_from()

    assert response["event_type"] == "goal"
    assert response["icon"] == "⚽"
    assert response["message"] == "Gooool!"
    assert response["home_score"] == 2
    assert response["away_score"] == 1
    assert response["status"] == "2nd half"

    await communicator.disconnect()


@pytest.mark.asyncio
async def test_match_consumer_default_values():
    # 1. ARRANGE
    communicator = WebsocketCommunicator(application, "/ws/match/555/")
    await communicator.connect()

    # 2. ACT: Tym razem wysyłamy zdarzenie "kadłubek" (puste)
    channel_layer = get_channel_layer()
    await channel_layer.group_send(
        "match_555",
        {
            "type": "match_event",
            # Brak icon, message, score itp.
        },
    )

    # 3. ASSERT: Consumer powinien użyć swoich domyślnych wartości zdefiniowanych w kodzie
    response = await communicator.receive_json_from()

    assert response["event_type"] == "info"
    assert response["icon"] == "ℹ️"
    assert response["message"] == ""

    # Sprawdzamy, czy "opcjonalne" klucze zostały bezpiecznie pominięte
    assert "home_score" not in response
    assert "away_score" not in response
    assert "status" not in response

    await communicator.disconnect()
