"""
api_views/team_api.py

DRF API endpoints for Team resources and team-related queries.
"""
from django.contrib.auth.decorators import login_not_required
from django.db.models import Q
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from matches.models import League, LeagueStandings, LiveMatch, Team
from matches.serializers import LeagueStandingsSerializer, LiveMatchSerializer, TeamSerializer
from matches.services import fetch_last_matches_for_team


@login_not_required
@api_view(['GET'])
def get_teams(request):
    """Lista drużyn. ?search=<str> filtruje po nazwie."""
    qs = Team.objects.all()
    search = request.GET.get('search', '').strip()
    if search:
        qs = qs.filter(name__icontains=search)
    return Response(TeamSerializer(qs, many=True).data)


@login_not_required
@api_view(['GET'])
def get_team_detail(request, api_id):
    """Szczegóły drużyny o podanym api_id."""
    try:
        team = Team.objects.get(api_id=api_id)
    except Team.DoesNotExist:
        return Response({'detail': 'Drużyna nie znaleziona.'}, status=status.HTTP_404_NOT_FOUND)
    return Response(TeamSerializer(team).data)


@login_not_required
@api_view(['GET'])
def get_team_standings(request, api_id):
    """Pełna tabela ligi dla drużyny o podanym api_id."""
    standings = (
        LeagueStandings.objects
        .filter(team__api_id=api_id)
        .select_related('team', 'league')
        .order_by('position')
    )
    if not standings.exists():
        return Response({'detail': 'Brak tabeli dla tej drużyny.'}, status=status.HTTP_404_NOT_FOUND)

    first_league = standings.first().league
    all_standings = (
        LeagueStandings.objects
        .filter(league=first_league)
        .select_related('team', 'league')
        .order_by('position')
    )
    return Response(LeagueStandingsSerializer(all_standings, many=True).data)


@login_not_required
@api_view(['GET'])
def get_team_matches(request, api_id):
    """Ostatnie mecze drużyny (max 20). Zwiadowca: jeśli brak danych, pobiera 3 z API."""
    try:
        team = Team.objects.get(api_id=api_id)
    except Team.DoesNotExist:
        return Response({'detail': 'Drużyna nie znaleziona.'}, status=status.HTTP_404_NOT_FOUND)

    has_matches = LiveMatch.objects.filter(Q(home_team=team) | Q(away_team=team)).exists()
    if not has_matches and team.api_id:
        try:
            fetch_last_matches_for_team(team_api_id=team.api_id, n=3)
        except Exception:
            pass

    qs = (
        LiveMatch.objects
        .filter(Q(home_team=team) | Q(away_team=team))
        .select_related('home_team', 'away_team', 'league')
        .order_by('-match_date', '-id')[:20]
    )
    return Response(LiveMatchSerializer(qs, many=True).data)
