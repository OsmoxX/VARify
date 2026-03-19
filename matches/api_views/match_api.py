"""
api_views/match_api.py

DRF API endpoints for LiveMatch and UpcomingMatch resources.
"""
from django.contrib.auth.decorators import login_not_required
from rest_framework import status
from rest_framework.decorators import api_view, throttle_classes
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle

from matches.models import LiveMatch, MatchEvent, MatchLineup, UpcomingMatch
from matches.serializers import (
    LiveMatchSerializer, LiveMatchDetailSerializer,
    MatchEventSerializer, MatchLineupSerializer,
    UpcomingMatchSerializer,
)


@login_not_required
@api_view(['GET'])
@throttle_classes([AnonRateThrottle, UserRateThrottle])
def get_live_matches(request):
    """Zwraca WSZYSTKIE mecze na żywo na jednej stronie."""
    league_id = request.GET.get('league', '').strip()
    top_only = request.GET.get('top', '').strip().lower() == 'true'

    qs = (
        LiveMatch.objects
        .select_related('home_team', 'away_team', 'league')
        .exclude(status__iexact='Ended')
        .order_by('id')
    )

    if league_id:
        qs = qs.filter(league__api_id=league_id)
    if top_only:
        qs = qs.filter(is_top=True)
        
    serializer = LiveMatchSerializer(qs, many=True)
    return Response(serializer.data)

@login_not_required
@api_view(['GET'])
@throttle_classes([AnonRateThrottle, UserRateThrottle])
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
@throttle_classes([AnonRateThrottle, UserRateThrottle])
def get_match_events(request, match_id):
    """Zdarzenia meczu (gole, kartki, zmiany). match_id = Django ID."""
    events = MatchEvent.objects.filter(match_id=match_id).order_by('time', 'added_time', 'id')
    
    # ==========================================
    # NOWY KOD - PAGINACJA
    # ==========================================
    
    # 1. Tworzymy obiekt paginatora
    paginator = PageNumberPagination()
    
    # 2. Przepuszczamy wyfiltrowane dane przez paginator
    # 'request' jest potrzebny, żeby paginator wiedział, o którą stronę prosi URL (np. ?page=2)
    paginated_events = paginator.paginate_queryset(events, request)
    
    # 3. Serializujemy TYLKO tę jedną stronę wyników (paginated_qs, a nie całe qs!)
    serializer = MatchEventSerializer(paginated_events, many=True)
    
    # 4. Zwracamy odpowiedź opakowaną w informacje o stronach
    return paginator.get_paginated_response(serializer.data)


@login_not_required
@api_view(['GET'])
@throttle_classes([AnonRateThrottle, UserRateThrottle])
def get_match_lineups(request, match_id):
    """Składy obu drużyn. ?team=home|away filtruje po stronie boiska."""
    qs = MatchLineup.objects.filter(match_id=match_id).order_by('-is_starting_xi', 'shirt_number', 'id')
    team_side = request.GET.get('team', '').strip().lower()
    if team_side == 'home':
        qs = qs.filter(is_home_team=True)
    elif team_side == 'away':
        qs = qs.filter(is_home_team=False)
        
    # ==========================================
    # NOWY KOD - PAGINACJA
    # ==========================================
    
    # 1. Tworzymy obiekt paginatora
    paginator = PageNumberPagination()
    
    # 2. Przepuszczamy wyfiltrowane dane przez paginator
    # 'request' jest potrzebny, żeby paginator wiedział, o którą stronę prosi URL (np. ?page=2)
    paginated_qs = paginator.paginate_queryset(qs, request)
    
    # 3. Serializujemy TYLKO tę jedną stronę wyników (paginated_qs, a nie całe qs!)
    serializer = MatchLineupSerializer(paginated_qs, many=True)
    
    # 4. Zwracamy odpowiedź opakowaną w informacje o stronach
    return paginator.get_paginated_response(serializer.data)


@login_not_required
@api_view(['GET'])
@throttle_classes([AnonRateThrottle, UserRateThrottle])
def get_upcoming_matches(request):
    """Nadchodzące mecze posortowane czasowo. ?league=<api_id>, ?top=true, ?date=YYYY-MM-DD."""
    qs = (
        UpcomingMatch.objects
        .select_related('home_team', 'away_team', 'league')
        .order_by('start_datetime', 'id')
    )
    league_id = request.GET.get('league', '').strip()
    top_only = request.GET.get('top', '').strip().lower() == 'true'
    date_str = request.GET.get('date', '').strip()

    if league_id:
        qs = qs.filter(league__api_id=league_id)
    if top_only:
        qs = qs.filter(is_top=True)
    if date_str:
        qs = qs.filter(start_datetime__date=date_str)

    return Response(UpcomingMatchSerializer(qs, many=True).data)