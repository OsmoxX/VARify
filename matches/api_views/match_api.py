"""
api_views/match_api.py

DRF API endpoints for LiveMatch and UpcomingMatch resources.
"""
from django.contrib.auth.decorators import login_not_required
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from matches.models import LiveMatch, MatchEvent, MatchLineup, UpcomingMatch
from matches.serializers import (
    LiveMatchSerializer, LiveMatchDetailSerializer,
    MatchEventSerializer, MatchLineupSerializer,
    UpcomingMatchSerializer,
)


@login_not_required
@api_view(['GET'])
def get_live_matches(request):
    """Lista meczów live (bez zakończonych). ?league=<api_id>, ?top=true."""
    qs = (
        LiveMatch.objects
        .select_related('home_team', 'away_team', 'league')
        .exclude(status__iexact='ended')
    )
    league_id = request.GET.get('league', '').strip()
    top_only = request.GET.get('top', '').strip().lower() == 'true'

    if league_id:
        qs = qs.filter(league__api_id=league_id)
    if top_only:
        qs = qs.filter(is_top=True)

    return Response(LiveMatchSerializer(qs, many=True).data)


@login_not_required
@api_view(['GET'])
def get_live_match_detail(request, match_id):
    """Szczegółowy widok meczu: wynik, zdarzenia, składy, statystyki. match_id = Django ID."""
    try:
        match = (
            LiveMatch.objects
            .select_related('home_team', 'away_team', 'league')
            .prefetch_related('events', 'lineups', 'missing_players')
            .get(id=match_id)
        )
    except LiveMatch.DoesNotExist:
        return Response({'detail': 'Mecz nie znaleziony.'}, status=status.HTTP_404_NOT_FOUND)
    return Response(LiveMatchDetailSerializer(match).data)


@login_not_required
@api_view(['GET'])
def get_match_events(request, match_id):
    """Zdarzenia meczu (gole, kartki, zmiany). match_id = Django ID."""
    events = MatchEvent.objects.filter(match_id=match_id).order_by('time', 'added_time', 'id')
    return Response(MatchEventSerializer(events, many=True).data)


@login_not_required
@api_view(['GET'])
def get_match_lineups(request, match_id):
    """Składy obu drużyn. ?team=home|away filtruje po stronie boiska."""
    qs = MatchLineup.objects.filter(match_id=match_id).order_by('-is_starting_xi', 'shirt_number')
    team_side = request.GET.get('team', '').strip().lower()
    if team_side == 'home':
        qs = qs.filter(is_home_team=True)
    elif team_side == 'away':
        qs = qs.filter(is_home_team=False)
    return Response(MatchLineupSerializer(qs, many=True).data)


@login_not_required
@api_view(['GET'])
def get_upcoming_matches(request):
    """Nadchodzące mecze posortowane czasowo. ?league=<api_id>, ?top=true."""
    qs = (
        UpcomingMatch.objects
        .select_related('home_team', 'away_team', 'league')
        .order_by('start_datetime', 'id')
    )
    league_id = request.GET.get('league', '').strip()
    top_only = request.GET.get('top', '').strip().lower() == 'true'

    if league_id:
        qs = qs.filter(league__api_id=league_id)
    if top_only:
        qs = qs.filter(is_top=True)

    return Response(UpcomingMatchSerializer(qs, many=True).data)
