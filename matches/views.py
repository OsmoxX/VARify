from collections import defaultdict, OrderedDict
from django.db import models
from django.shortcuts import render, get_object_or_404
from django.http import JsonResponse
from django.views.generic import ListView
from .models import LiveMatch, MatchEvent, MatchLineup, Team, MissingPlayer
from .services import fetch_match_details, fetch_last_matches_for_team, search_teams_from_api

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

    # MECHANIZM 3 – WYDOBYWCA (ulepszony)
    # Jeżeli mecz NADAL TRWA (nie zakończony) → ZAWSZE odśwież dane z API.
    # Dzięki temu: wynik, zdarzenia (gole, kartki), minuta – wszystko jest aktualne.
    # Jeżeli mecz ZAKOŃCZONY → serwuj z bazy (0 zapytań do API).
    ENDED_STATUSES = ['ended', 'finished', 'canceled', 'cancelled', 'postponed',
                      'abandoned', 'awarded', 'after penalties', 'after extra time',
                      'ap', 'aet']
    is_ended = match.status.lower().strip() in ENDED_STATUSES

    if is_ended and (match.events.exists() or match.stats_json):
        # Mecz zakończony i dane już w bazie → serwujemy natychmiast
        print(f"Wydobywca: Mecz {match} zakończony – serwuję z bazy (0 API).")
    else:
        # Mecz live LUB brak danych → (od)śwież zdarzenia z API
        if not is_ended:
            print(f"Wydobywca: Mecz {match} TRWA – odświeżam dane z API...")
            # Czyścimy stare zdarzenia żeby uniknąć duplikatów i nieaktualnych markerów (FT itp.)
            match.events.all().delete()
        else:
            print(f"Wydobywca: Mecz {match} – brak danych, pobieram po raz pierwszy...")

        fetch_match_details(local_match_id=match.id, api_match_id=match.api_id)
        match.refresh_from_db()


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

    # 5. Statystyki – parsujemy JSON → lista do szablonu
    stats_periods = []
    if match.stats_json:
        for period in match.stats_json:
            items = []
            for group in period.get('groups', []):
                for item in group.get('statisticsItems', []):
                    hv = float(item.get('homeValue', 0) or 0)
                    av = float(item.get('awayValue', 0) or 0)
                    total = hv + av
                    h_pct = round((hv / total) * 100) if total > 0 else 50
                    a_pct = 100 - h_pct
                    items.append({
                        'name': item.get('name', ''),
                        'home': item.get('home', hv),
                        'away': item.get('away', av),
                        'h_pct': h_pct,
                        'a_pct': a_pct,
                        'is_possession': item.get('name') == 'Ball possession',
                    })
            stats_periods.append({
                'period': period.get('period', 'ALL'),
                'items': items,
            })

    return render(request, 'matches/match_detail.html', {
        'match': match,
        'events': events,
        'lineups': lineups,
        'pitch_home': pitch_home,
        'pitch_away': pitch_away,
        'missing_home': missing_home,
        'missing_away': missing_away,
        'stats_periods': stats_periods,
    })



# matches/views.py

class HomeView(ListView):
    model = LiveMatch
    template_name = 'matches/live_match_list.html'
    context_object_name = 'matches'

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)

        # Tylko mecze NIE zakończone (zakończone idą do Kalendarza)
        all_matches = LiveMatch.objects.select_related('league', 'home_team', 'away_team').exclude(status='Ended')

        raw_data = defaultdict(lambda: defaultdict(list))

        for match in all_matches:
            country = match.country_name or (match.league.country if match.league else None) or 'Inne'

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

        # -------------------------------------------------------
        # Priorytet top lig – każda reguła: (fragment nazwy ligi, kraj, priorytet)
        # Obie wartości muszą pasować, żeby uniknąć fałszywych trafień
        # (np. "Queensland Premier League" ≠ angielska Premier League).
        # Pusty string dla kraju = nie sprawdzamy kraju (np. Champions League).
        # -------------------------------------------------------
        TOP_LEAGUES = [
            ('premier league',  'england',     0),
            ('la liga',         'spain',       1),
            ('serie a',         'italy',       2),
            ('bundesliga',      'germany',     3),
            ('ligue 1',         'france',      4),
            ('champions league','',            5),   # UEFA – brak jednego kraju
            ('europa league',   '',            6),   # UEFA – brak jednego kraju
            ('primeira liga',   'portugal',    7),
            ('eredivisie',      'netherlands', 8),
            ('championship',    'england',     9),
        ]

        def _is_top(entry):
            """Czy ten blok kraj/liga należy do top 10?"""
            country_lower = entry['country'].lower()
            for league_kw, country_kw, idx in TOP_LEAGUES:
                for league in entry['leagues']:
                    if league_kw not in league['name'].lower():
                        continue
                    # Jeśli reguła wymaga konkretnego kraju – sprawdź go
                    if country_kw and country_kw not in country_lower:
                        continue
                    return True, idx
            return False, 999

        def league_priority(entry):
            is_t, idx = _is_top(entry)
            if is_t:
                return (0, idx, entry['country'])
            return (1, 999, entry['country'])

        structured_data.sort(key=league_priority)

        # Oznacz każdy blok flagą is_top dla szablonu
        for entry in structured_data:
            entry['is_top'], _ = _is_top(entry)


        # Flat list of unique league names for the filter search
        all_league_names = sorted(set(
            ln for item in structured_data for league in item['leagues'] for ln in [league['name']]
        ))
        context['all_league_names'] = all_league_names

        context['structured_data'] = structured_data

        return context


class CalendarView(ListView):
    model = LiveMatch
    template_name = 'matches/calendar.html'
    context_object_name = 'matches'

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)

        ended_matches = LiveMatch.objects.select_related(
            'league', 'home_team', 'away_team'
        ).filter(status='Ended').order_by('-match_date', 'league__name')

        # Grupowanie: data → kraj → liga → mecze
        days_data = OrderedDict()
        for match in ended_matches:
            day = match.match_date or 'Brak daty'
            country = match.country_name or (match.league.country if match.league else None) or 'Inne'
            league_name = match.league.name if match.league else 'Nieznana Liga'

            if day not in days_data:
                days_data[day] = defaultdict(lambda: defaultdict(list))
            days_data[day][country][league_name].append(match)

        # Przekształcenie na strukturę do szablonu
        structured_days = []
        for day, countries in days_data.items():
            leagues_list = []
            all_league_names_set = set()
            for country, leagues in countries.items():
                for league_name, matches in leagues.items():
                    leagues_list.append({
                        'name': league_name,
                        'country': country,
                        'matches': matches,
                    })
                    all_league_names_set.add(league_name)
            structured_days.append({
                'date': day,
                'leagues': leagues_list,
                'league_names': sorted(all_league_names_set),
            })

        context['structured_days'] = structured_days

        # Flat list of unique league names for the filter
        all_league_names = sorted(set(
            ln for day in structured_days for league in day['leagues'] for ln in [league['name']]
        ))
        context['all_league_names'] = all_league_names

        return context


def search_api_view(request):
    """
    WYSZUKIWARKA – działa w dwóch krokach:

    Krok 1: szukamy w LOKALNEJ bazie (szybkie, bez API)
    Krok 2: gdy baz  nie zna tej drużyny → szukamy w zewnętrznym API
            i zapisujemy znalezione drużyny do lokalnej tabeli Team
            (tylko id + name, BEZ meczów)

    UWAGA: Zwiadowca (pobieranie 3 ostatnich meczów) działa teraz dopiero
    przy wejściu na stronę drużyny (team_detail_view), nie przy każdym użyciu wyszukiwarki.
    """
    query = request.GET.get('q', '').strip()

    if len(query) < 2:
        return JsonResponse({'results': []})

    # KROK 1: lokalna baza
    teams = list(Team.objects.filter(name__icontains=query)[:10])

    # KROK 2: jeżeli nic nie ma w bazie → zapytaj zewnętrzne API
    if not teams:
        print(f"Wyszukiwarka: '{query}' nie ma w bazie – szukam w API...")
        try:
            teams = search_teams_from_api(query)
        except Exception as e:
            print(f"Wyszukiwarka API Search błąd: {e}")

    results = [
        {'id': t.id, 'name': t.name, 'logo_url': t.logo_url or ''}
        for t in teams
    ]

    return JsonResponse({'results': results})


def team_detail_view(request, team_id):
    """Strona drużyny: ostatnie mecze + skład."""
    from .models import Team, LiveMatch, MatchLineup

    team = get_object_or_404(Team, id=team_id)

    # MECHANIZM 2 – ZWIADOWCA
    # Jeżeli drużyna nie ma żadnych meczów w bazie (np. właśnie odkryta przez wyszukiwarkę API)
    # → pobieramy 3 ostatnie mecze (tylko podstawowe dane, BEZ zdarzeń/składów/statystyk)
    has_matches = LiveMatch.objects.filter(
        models.Q(home_team=team) | models.Q(away_team=team)
    ).exists()

    if not has_matches and team.api_id:
        print(f"Zwiadowca: {team.name} nie ma meczów w bazie – pobieram z API...")
        try:
            fetch_last_matches_for_team(team_api_id=team.api_id, n=3)
        except Exception as e:
            print(f"Zwiadowca błąd: {e}")

    # Ostatnie mecze (max 20), posortowane od najnowszego
    all_team_matches = LiveMatch.objects.filter(
        models.Q(home_team=team) | models.Q(away_team=team)
    ).select_related('home_team', 'away_team', 'league').order_by('-match_date', '-id')

    recent_matches = all_team_matches[:20]

    # Skład – unikalni gracze z najnowszego meczu który ma skład
    latest_match_with_lineup = all_team_matches.filter(lineups__isnull=False).first()
    squad = []
    if latest_match_with_lineup:
        squad = MatchLineup.objects.filter(
            match=latest_match_with_lineup,
            is_home_team=(latest_match_with_lineup.home_team == team)
        ).order_by('-is_starting_xi', 'shirt_number')

    return render(request, 'matches/team_detail.html', {
        'team': team,
        'recent_matches': recent_matches,
        'squad': squad,
        'latest_match': all_team_matches.first(),
    })