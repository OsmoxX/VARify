"""
api_views/search_api.py

Global search endpoint: teams and players.
"""
from django.contrib.auth.decorators import login_not_required
from rest_framework.decorators import api_view
from rest_framework.response import Response

from matches.models import Player, Team
from matches.serializers import PlayerSerializer, TeamSerializer
from matches.services import search_players_from_api


@login_not_required
@api_view(['GET'])
def search(request):
    """Globalne wyszukiwanie ?q=<str>. Zwraca drużyny i zawodników pasujących do zapytania."""
    q = request.GET.get('q', '').strip()
    if not q:
        return Response({'teams': [], 'players': []})

    teams = list(Team.objects.filter(name__icontains=q)[:20])
    players = list(Player.objects.filter(name__icontains=q).select_related('team')[:20])

    if not players:
        players = search_players_from_api(q)

    return Response({
        'teams': TeamSerializer(teams, many=True).data,
        'players': PlayerSerializer(players, many=True).data,
        'query': q,
    })
