"""
api_views/league_api.py

DRF API endpoints for League and LeagueStandings resources.
"""
from django.contrib.auth.decorators import login_not_required
from django.db.models import Q
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from matches.models import League, LeagueStandings
from matches.serializers import LeagueSerializer, LeagueStandingsSerializer


@login_not_required
@api_view(['GET'])
def get_leagues(request):
    """Lista wszystkich lig. ?search=<str> filtruje po nazwie/kraju."""
    qs = League.objects.all()
    search = request.GET.get('search', '').strip()
    if search:
        qs = qs.filter(Q(name__icontains=search) | Q(country__icontains=search))
    return Response(LeagueSerializer(qs, many=True).data)


@login_not_required
@api_view(['GET'])
def get_league_detail(request, api_id):
    """Szczegóły ligi o podanym api_id."""
    try:
        league = League.objects.get(api_id=api_id)
    except League.DoesNotExist:
        return Response({'detail': 'Liga nie znaleziona.'}, status=status.HTTP_404_NOT_FOUND)
    return Response(LeagueSerializer(league).data)


@login_not_required
@api_view(['GET'])
def get_league_standings(request, league_id):
    """Tabela ligi o podanym api_id (league_id = api_id ligi)."""
    standings = (
        LeagueStandings.objects
        .filter(league__api_id=league_id)
        .select_related('team', 'league')
        .order_by('position')
    )
    return Response(LeagueStandingsSerializer(standings, many=True).data)
