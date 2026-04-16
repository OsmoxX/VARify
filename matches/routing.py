from django.urls import re_path
from matches.consumers import MatchConsumer

websocket_urlpatterns = [
    re_path(r"ws/matches/(?P<match_id>\w+)/$", MatchConsumer.as_asgi()),
]
