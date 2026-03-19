"""
api_views/league_api.py

DRF API endpoints for League and LeagueStandings resources.
"""
from django.contrib.auth.decorators import login_not_required
from django.db.models import Q
from rest_framework import status
from rest_framework.decorators import api_view, throttle_classes
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle

from matches.models import League, LeagueStandings
from matches.serializers import LeagueSerializer, LeagueStandingsSerializer


@login_not_required
@api_view(['GET'])  
@throttle_classes([AnonRateThrottle, UserRateThrottle])
def get_leagues(request):
    """Lista wszystkich lig. ?search=<str> filtruje po nazwie/kraju."""
    qs = League.objects.order_by('id')
    search = request.GET.get('search', '').strip()
    if search:
        qs = qs.filter(Q(name__icontains=search) | Q(country__icontains=search))
    
    # ==========================================
    # NOWY KOD - PAGINACJA
    # ==========================================
    
    # 1. Tworzymy obiekt paginatora
    paginator = PageNumberPagination()
    
    # 2. Przepuszczamy wyfiltrowane dane przez paginator
    # 'request' jest potrzebny, żeby paginator wiedział, o którą stronę prosi URL (np. ?page=2)
    paginated_qs = paginator.paginate_queryset(qs, request)
    
    # 3. Serializujemy TYLKO tę jedną stronę wyników (paginated_qs, a nie całe qs!)
    serializer = LeagueSerializer(paginated_qs, many=True)
    
    # 4. Zwracamy odpowiedź opakowaną w informacje o stronach
    return paginator.get_paginated_response(serializer.data)


@login_not_required
@api_view(['GET'])
@throttle_classes([AnonRateThrottle, UserRateThrottle])
def get_league_detail(request, api_id):
    """Szczegóły ligi o podanym api_id."""
    try:
        league = League.objects.get(api_id=api_id)
    except League.DoesNotExist:
        return Response({'detail': 'Liga nie znaleziona.'}, status=status.HTTP_404_NOT_FOUND)
    return Response(LeagueSerializer(league).data)


@login_not_required
@api_view(['GET'])
@throttle_classes([AnonRateThrottle, UserRateThrottle])
def get_league_standings(request, league_id):
    """Tabela ligi o podanym api_id (league_id = api_id ligi)."""
    standings = (
        LeagueStandings.objects
        .filter(league__api_id=league_id)
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
    paginated_qs = paginator.paginate_queryset(standings, request)
    
    # 3. Serializujemy TYLKO tę jedną stronę wyników (paginated_qs, a nie całe qs!)
    serializer = LeagueStandingsSerializer(paginated_qs, many=True)
    
    # 4. Zwracamy odpowiedź opakowaną w informacje o stronach
    return paginator.get_paginated_response(serializer.data)
