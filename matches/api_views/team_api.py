"""
api_views/team_api.py

DRF API endpoints for Team resources and team-related queries.
"""
from django.contrib.auth.decorators import login_not_required
from django.db.models import Q
from rest_framework import status
from rest_framework.decorators import api_view, throttle_classes
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle

from matches.models import LeagueStandings, LiveMatch, Team
from matches.serializers import LeagueStandingsSerializer, LiveMatchSerializer, TeamSerializer
from matches.services import fetch_last_matches_for_team


@login_not_required
@api_view(['GET'])
@throttle_classes([AnonRateThrottle, UserRateThrottle])
def get_teams(request):
    """Lista drużyn. ?search=<str> filtruje po nazwie."""
    qs = Team.objects.order_by('name', 'id')
    search = request.GET.get('search', '').strip()
    if search:
        qs = qs.filter(name__icontains=search)
    
    # ==========================================
    # NOWY KOD - PAGINACJA
    # ==========================================
    
    # 1. Tworzymy obiekt paginatora
    paginator = PageNumberPagination()
    
    # 2. Przepuszczamy wyfiltrowane dane przez paginator
    # 'request' jest potrzebny, żeby paginator wiedział, o którą stronę prosi URL (np. ?page=2)
    paginated_qs = paginator.paginate_queryset(qs, request)
    
    # 3. Serializujemy TYLKO tę jedną stronę wyników (paginated_qs, a nie całe qs!)
    serializer = TeamSerializer(paginated_qs, many=True)
    
    # 4. Zwracamy odpowiedź opakowaną w informacje o stronach
    return paginator.get_paginated_response(serializer.data)


@login_not_required
@api_view(['GET'])
@throttle_classes([AnonRateThrottle, UserRateThrottle])
def get_team_detail(request, api_id):
    """Szczegóły drużyny o podanym api_id."""
    try:
        team = Team.objects.get(api_id=api_id)
    except Team.DoesNotExist:
        return Response({'detail': 'Drużyna nie znaleziona.'}, status=status.HTTP_404_NOT_FOUND)
    return Response(TeamSerializer(team).data)


@login_not_required
@api_view(['GET'])
@throttle_classes([AnonRateThrottle, UserRateThrottle])
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
        .order_by('position', 'id')
    )
    
    # ==========================================
    # NOWY KOD - PAGINACJA
    # ==========================================
    
    # 1. Tworzymy obiekt paginatora
    paginator = PageNumberPagination()
    
    # 2. Przepuszczamy wyfiltrowane dane przez paginator
    # 'request' jest potrzebny, żeby paginator wiedział, o którą stronę prosi URL (np. ?page=2)
    paginated_qs = paginator.paginate_queryset(all_standings, request)
    
    # 3. Serializujemy TYLKO tę jedną stronę wyników (paginated_qs, a nie całe qs!)
    serializer = LeagueStandingsSerializer(paginated_qs, many=True)
    
    # 4. Zwracamy odpowiedź opakowaną w informacje o stronach
    return paginator.get_paginated_response(serializer.data)


@login_not_required
@api_view(['GET'])
@throttle_classes([AnonRateThrottle, UserRateThrottle])
def get_team_matches(request, api_id):
    """Ostatnie mecze drużyny. Zwiadowca: jeśli brak danych, pobiera 3 z API."""
    try:
        team = Team.objects.get(api_id=api_id)
    except Team.DoesNotExist:
        return Response({'detail': 'Drużyna nie znaleziona.'}, status=status.HTTP_404_NOT_FOUND)

    matches_count = LiveMatch.objects.filter(Q(home_team=team) | Q(away_team=team)).count()
    if matches_count < 5 and team.api_id:
        try:
            fetch_last_matches_for_team(team_api_id=team.api_id, n=5)
        except Exception:
            pass

    qs = (
        LiveMatch.objects
        .filter(Q(home_team=team) | Q(away_team=team))
        .select_related('home_team', 'away_team', 'league')
        .order_by('-match_date', '-id')
    )
    
    # ==========================================
    # NOWY KOD - PAGINACJA
    # ==========================================
    
    # 1. Tworzymy obiekt paginatora
    paginator = PageNumberPagination()
    
    # 2. Przepuszczamy wyfiltrowane dane przez paginator
    # 'request' jest potrzebny, żeby paginator wiedział, o którą stronę prosi URL (np. ?page=2)
    paginated_qs = paginator.paginate_queryset(qs, request)
    
    # 3. Serializujemy TYLKO tę jedną stronę wyników (paginated_qs, a nie całe qs!)
    serializer = LiveMatchSerializer(paginated_qs, many=True)
    
    # 4. Zwracamy odpowiedź opakowaną w informacje o stronach
    return paginator.get_paginated_response(serializer.data)
