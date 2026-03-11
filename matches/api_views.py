# Third-party
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from django.contrib.auth.decorators import login_not_required
from django.db.models import Q

# Local
from .models import (
    League, LeagueStandings, LiveMatch, MatchEvent, MatchLineup,
    Player, Team, UpcomingMatch,
)
from .serializers import (
    LeagueSerializer, LeagueStandingsSerializer,
    LiveMatchSerializer, LiveMatchDetailSerializer,
    MatchEventSerializer, MatchLineupSerializer,
    PlayerSerializer, TeamSerializer, UpcomingMatchSerializer,
)
from .services import fetch_last_matches_for_team


# ─────────────────────────────────
# LEAGUES
# ─────────────────────────────────

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


# ─────────────────────────────────
# TEAMS
# ─────────────────────────────────

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


# ─────────────────────────────────
# PLAYERS
# ─────────────────────────────────

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
    try:
        player = Player.objects.select_related('team').get(api_id=api_id)
    except Player.DoesNotExist:
        return Response({'detail': 'Zawodnik nie znaleziony.'}, status=status.HTTP_404_NOT_FOUND)
    return Response(PlayerSerializer(player).data)


# ─────────────────────────────────
# LIVE MATCHES
# ─────────────────────────────────

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


# ─────────────────────────────────
# UPCOMING MATCHES
# ─────────────────────────────────

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


# ─────────────────────────────────
# SEARCH (global)
# ─────────────────────────────────

@login_not_required
@api_view(['GET'])
def search(request):
    """Globalne wyszukiwanie ?q=<str>. Zwraca drużyny i zawodników pasujących do zapytania."""
    q = request.GET.get('q', '').strip()
    if not q:
        return Response({'teams': [], 'players': []})

    teams = Team.objects.filter(name__icontains=q)[:20]
    players = Player.objects.filter(name__icontains=q).select_related('team')[:20]

    return Response({
        'teams': TeamSerializer(teams, many=True).data,
        'players': PlayerSerializer(players, many=True).data,
        'query': q,
    })