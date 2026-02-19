from collections import defaultdict
from django.db import models
from django.shortcuts import render, get_object_or_404
from django.http import JsonResponse
from django.views.generic import ListView
from .models import LiveMatch, MatchEvent, MatchLineup, Team, MissingPlayer
from .services import fetch_match_details

# Create your views here.

def live_matches_view(request):
    live_matches = LiveMatch.objects.filter(status__icontains='half').select_related('home_team', 'away_team', 'league')
    return render(request, 'matches/live_match_list.html', {'matches': live_matches})


def _build_pitch_data(xi_players, formation_str, is_home=True):
    """
    Parse formation string and assign (top%, left%) to each starting XI player.
    Home: GK at top, attack at bottom.  Away: GK at bottom, attack at top.
    Returns list of dicts: {player, top, left}.
    """
    # Parse formation: "4-3-3" → [4, 3, 3]
    if not formation_str:
        # Fallback: guess from position counts
        positions = {'G': [], 'D': [], 'M': [], 'F': []}
        for p in xi_players:
            positions.get(p.position, positions.setdefault(p.position, [])).append(p)
        formation_rows = []
        for key in ['D', 'M', 'F']:
            if positions[key]:
                formation_rows.append(len(positions[key]))
        formation_str = '-'.join(str(n) for n in formation_rows) if formation_rows else '4-4-2'

    try:
        rows = [int(x) for x in formation_str.split('-')]
    except ValueError:
        rows = [4, 4, 2]

    # Group players by position: G, D, M, F
    groups = {'G': [], 'D': [], 'M': [], 'F': []}
    for p in xi_players:
        pos = p.position or 'M'
        if pos in groups:
            groups[pos].append(p)
        else:
            groups['M'].append(p)

    # Build row assignments: [GK] + formation rows mapped to position groups
    # rows = [4, 3, 3] means: 4 defenders, 3 midfielders, 3 forwards
    pos_order = ['D', 'M', 'F']

    # If formation has more segments than D/M/F (e.g., 4-1-2-3 = 4 rows),
    # we merge extra mid rows
    all_outfield = []
    for key in pos_order:
        all_outfield.extend(groups[key])

    # Assign players to formation rows
    row_players = [groups['G']]  # Row 0 = GK
    idx = 0
    for count in rows:
        row_players.append(all_outfield[idx:idx + count])
        idx += count

    # Vertical positions (top %) — evenly spaced
    total_rows = len(row_players)
    pitch_data = []

    for row_idx, players_in_row in enumerate(row_players):
        if not players_in_row:
            continue


        if is_home:
            # Home: GK at left (5%), attack at right (45%)
            # Horizontal layout: left_pct is X-axis (0-100), top_pct is Y-axis (0-100)
            left_pct = 5 + (row_idx / max(total_rows - 1, 1)) * 40
        else:
            # Away: GK at right (95%), attack at left (55%)
            left_pct = 95 - (row_idx / max(total_rows - 1, 1)) * 40

        n = len(players_in_row)
        for col_idx, player in enumerate(players_in_row):
            # Vertical distribution (Y-axis): evenly spread
            top_pct = (col_idx + 1) / (n + 1) * 100

            # Pre-compute rating color class
            rating_class = ''
            if player.avg_rating:
                try:
                    rv = float(player.avg_rating)
                    if rv >= 7.0:
                        rating_class = 'rating-green'
                    elif rv >= 6.0:
                        rating_class = 'rating-yellow'
                    else:
                        rating_class = 'rating-red'
                except (ValueError, TypeError):
                    rating_class = 'rating-yellow'

            pitch_data.append({
                'player': player,
                'top': round(top_pct, 1),   # Y-axis
                'left': round(left_pct, 1), # X-axis
                'rating_class': rating_class,
            })

    return pitch_data


def match_detail_view(request, match_id):
    # 1. Pobieramy mecz
    match = get_object_or_404(LiveMatch, id=match_id)
    events = MatchEvent.objects.filter(match=match).order_by('time', 'added_time', 'id')

    # 2. Pobieramy składy – podział na XI i rezerwę
    lineups_query = MatchLineup.objects.filter(match=match)

    home_xi = list(lineups_query.filter(is_home_team=True, is_starting_xi=True).order_by('shirt_number'))
    away_xi = list(lineups_query.filter(is_home_team=False, is_starting_xi=True).order_by('shirt_number'))

    lineups = {
        'home_xi': home_xi,
        'home_subs': lineups_query.filter(is_home_team=True, is_starting_xi=False).order_by('shirt_number'),
        'away_xi': away_xi,
        'away_subs': lineups_query.filter(is_home_team=False, is_starting_xi=False).order_by('shirt_number'),
    }

    # 3. Pitch data — pozycje graczy na boisku
    pitch_home = _build_pitch_data(home_xi, match.home_formation, is_home=True)
    pitch_away = _build_pitch_data(away_xi, match.away_formation, is_home=False)

    # 4. Brakujący gracze
    missing_home = MissingPlayer.objects.filter(match=match, is_home_team=True)
    missing_away = MissingPlayer.objects.filter(match=match, is_home_team=False)

    return render(request, 'matches/match_detail.html', {
        'match': match,
        'events': events,
        'lineups': lineups,
        'pitch_home': pitch_home,
        'pitch_away': pitch_away,
        'missing_home': missing_home,
        'missing_away': missing_away,
    })



# matches/views.py

class HomeView(ListView):
    model = LiveMatch
    template_name = 'matches/live_match_list.html'
    context_object_name = 'matches'

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        
        # Pobieramy mecze z "dociągnięciem" relacji (select_related), żeby nie zamulić bazy
        all_matches = LiveMatch.objects.select_related('league', 'home_team', 'away_team').all()
        
        raw_data = defaultdict(lambda: defaultdict(list))
        
        for match in all_matches:
            country = match.country_name or (match.league.country if match.league else None) or 'Inne'
            
            # --- POPRAWKA TUTAJ ---
            # Stare: league = match.league_name
            # Nowe: Pobieramy nazwę z obiektu League (jeśli istnieje)
            if match.league:
                league = match.league.name
            else:
                league = "Nieznana Liga"
            # ----------------------

            raw_data[country][league].append(match)

        structured_data = []
        for country, leagues in raw_data.items():
            league_list = []
            for league_name, matches in leagues.items():
                league_list.append({
                    'name': league_name,
                    'matches': matches
                })
            structured_data.append({
                'country': country,
                'leagues': league_list
            })

        context['structured_data'] = structured_data

        # Flat list of unique league names for the filter search
        all_league_names = sorted(set(
            ln for item in structured_data for league in item['leagues'] for ln in [league['name']]
        ))
        context['all_league_names'] = all_league_names

        return context


def search_api_view(request):
    """Wyszukiwanie drużyn w lokalnej bazie (bez API)."""
    query = request.GET.get('q', '').strip()

    if len(query) < 2:
        return JsonResponse({'results': []})

    from .models import Team
    teams = Team.objects.filter(name__icontains=query)[:10]

    results = [
        {'id': t.id, 'name': t.name, 'logo_url': t.logo_url or ''}
        for t in teams
    ]

    return JsonResponse({'results': results})


def team_detail_view(request, team_id):
    """Strona drużyny: ostatnie mecze + skład."""
    from .models import Team, LiveMatch, MatchLineup

    team = get_object_or_404(Team, id=team_id)

    # Ostatnie mecze (max 20)
    recent_matches = LiveMatch.objects.filter(
        models.Q(home_team=team) | models.Q(away_team=team)
    ).select_related('home_team', 'away_team', 'league').order_by('-id')[:20]

    # Skład – unikalni gracze z najnowszego meczu
    latest_match = recent_matches.first() if recent_matches.exists() else None
    squad = []
    if latest_match:
        squad = MatchLineup.objects.filter(
            match=latest_match,
            is_home_team=(latest_match.home_team == team)
        ).order_by('-is_starting_xi', 'shirt_number')

    return render(request, 'matches/team_detail.html', {
        'team': team,
        'recent_matches': recent_matches,
        'squad': squad,
        'latest_match': latest_match,
    })