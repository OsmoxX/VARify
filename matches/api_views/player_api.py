"""
api_views/player_api.py

DRF API endpoints for Player resources.
"""
from django.contrib.auth.decorators import login_not_required
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from matches.models import Player
from matches.serializers import PlayerSerializer
from matches.services import fetch_player


@login_not_required
@api_view(['GET'])
def get_players(request):
    """Lista zawodników. ?search=<str> filtruje po nazwie, ?team=<api_id> po drużynie."""
    qs = Player.objects.select_related('team').all()
    search = request.GET.get('search', '').strip()
    team_api_id = request.GET.get('team', '').strip()
    if search:
        qs = qs.filter(name__icontains=search)
    if team_api_id:
        qs = qs.filter(team__api_id=team_api_id)
    return Response(PlayerSerializer(qs, many=True).data)


@login_not_required
@api_view(['GET'])
def get_player_detail(request, api_id):
    """Profil zawodnika o podanym api_id."""
    player = Player.objects.select_related('team').filter(api_id=api_id).first()

    # Jeśli brak w bazie lub nie ma pełnych danych (np. wzrostu/daty urodzenia), doczytajmy z API
    if not player or not player.date_of_birth:
        player = fetch_player(api_id)

    if not player:
        return Response({'detail': 'Zawodnik nie znaleziony.'}, status=status.HTTP_404_NOT_FOUND)
    return Response(PlayerSerializer(player).data)
