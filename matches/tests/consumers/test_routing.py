import pytest
from matches.routing import websocket_urlpatterns
from matches.consumers import MatchConsumer

# ==========================================
# TESTY: ROUTING WEBSOCKETÓW
# ==========================================

def test_websocket_routing_loads_correctly():
    # 1. Sprawdzamy, czy w ogóle załadowała się jakaś ścieżka
    assert len(websocket_urlpatterns) == 1
    
    # 2. Pobieramy pierwszą ścieżkę z listy
    pattern = websocket_urlpatterns[0]
    
    # 3. Sprawdzamy, czy adres URL zgadza się z Twoim regexem z pliku routing.py
    assert pattern.pattern._regex == r'ws/matches/(?P<match_id>\w+)/$'
    
    # 4. Upewniamy się, że ten adres prowadzi do prawidłowej klasy Consumera
    assert pattern.callback.consumer_class == MatchConsumer

from matches.routing import websocket_urlpatterns

def test_websocket_urlpatterns_exists():
    # Sprawdzamy, czy ścieżka do MatchConsumer jest poprawnie zdefiniowana
    assert len(websocket_urlpatterns) > 0
    assert websocket_urlpatterns[0].pattern._regex == r'ws/matches/(?P<match_id>\w+)/$'