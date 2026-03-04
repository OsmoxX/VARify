from collections import defaultdict, OrderedDict
from django.db import models
from django.shortcuts import render, get_object_or_404
from django.http import JsonResponse
from django.views.generic import ListView
from .models import LiveMatch, MatchEvent, MatchLineup, Team, MissingPlayer, UpcomingMatch, Player, MatchSubscription
from .services import fetch_match_details, fetch_last_matches_for_team, search_teams_from_api
from .services import fetch_player
from datetime import date
import os
import requests
from django.http import HttpResponse, Http404
from django.core.cache import cache 
import json
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST



# Create your views here.

def live_matches_view(request):
    live_matches = LiveMatch.objects.filter(status__icontains='half').select_related('home_team', 'away_team', 'league')
    
    # Pobierz listę obserwowanych meczów dla tej sesji (do przywrócenia stanu dzwoneczków)
    subscribed_ids = []
    if request.session.session_key:
        subscribed_ids = list(
            MatchSubscription.objects.filter(session_key=request.session.session_key)
            .values_list('match__api_id', flat=True)
        )
    
    return render(request, 'matches/live_match_list.html', {
        'matches': live_matches,
        'subscribed_ids_json': json.dumps(subscribed_ids),
    })


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

    # Filtruj "przyszłe" markery (HT/FT) dla meczów live
    # API incidents zwraca HT/FT z wyprzedzeniem, zanim mecz tam dotrze
    if not is_ended:
        import time as _time
        # Oblicz aktualną minutę meczu
        if match.match_time:
            try:
                period_start = int(match.match_time)
                elapsed = int((_time.time() - period_start) / 60)
                current_minute = match.minute + elapsed
            except (ValueError, TypeError):
                current_minute = match.minute or 0
        else:
            current_minute = match.minute or 0

        status_lower = match.status.lower().strip()
        is_first_half = '1st' in status_lower or 'first' in status_lower
        is_second_half = '2nd' in status_lower or 'second' in status_lower
        is_halftime = 'half' in status_lower and 'time' in status_lower

        def should_show_period(e):
            if not e.is_period_marker:
                return True
            # HT marker
            if e.text == 'HT' or e.time == 45:
                if is_first_half:
                    return False
            # FT marker
            if e.text == 'FT' or e.time == 90:
                if is_first_half or is_halftime or is_second_half:
                    return False
            return e.time <= current_minute

        events = [e for e in events if should_show_period(e)]

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

        # Top 12 lig wg rankingu UEFA (api_id, nazwa, kraj)
        TOP_12_LEAGUES = [
            ('1',    'Premier League',           'England'),
            ('33',   'Serie A',                  'Italy'),
            ('36',   'LaLiga',                   'Spain'),
            ('42',   'Bundesliga',               'Germany'),
            ('4',    'Ligue 1',                  'France'),
            ('52',   'Liga Portugal Betclic',    'Portugal'),
            ('39',   'VriendenLoterij Eredivisie','Netherlands'),
            ('38',   'Pro League',               'Belgium'),
            ('62',   'Trendyol Süper Lig',       'Turkey'),
            ('49',   'Czech First League',       'Czech Republic'),
            ('127',  'Stoiximan Super League',   'Greece'),
            ('64',   'Ekstraklasa',              'Poland'),
        ]
        top_api_ids = {t[0] for t in TOP_12_LEAGUES}

        # Pogrupuj mecze wg league.api_id
        matches_by_api_id = {}
        for match in all_matches:
            league = match.league
            if not league:
                continue
            api_id = league.api_id
            if api_id not in matches_by_api_id:
                matches_by_api_id[api_id] = {
                    'name': league.name,
                    'country': league.country or '',
                    'matches': [],
                }
            matches_by_api_id[api_id]['matches'].append(match)

        # Buduj listę top 12 (tylko te, które mają aktualnie mecze live)
        grouped_leagues = []
        for api_id, name, country in TOP_12_LEAGUES:
            data = matches_by_api_id.pop(api_id, None)
            if data:
                display_name = f"{name} • {country}" if country else name
                grouped_leagues.append({
                    'name': name,
                    'country': country,
                    'display_name': display_name,
                    'matches': data['matches'],
                    'is_top': True,
                    'has_matches': True,
                })

        # Reszta lig — posortowane alfabetycznie
        other_leagues = sorted(matches_by_api_id.values(), key=lambda x: x['name'])
        for data in other_leagues:
            country = data['country']
            display_name = f"{data['name']} • {country}" if country else data['name']
            grouped_leagues.append({
                'name': data['name'],
                'country': country,
                'display_name': display_name,
                'matches': data['matches'],
                'is_top': False,
                'has_matches': True,
            })

        # Do filtrów - unikalne nazwy lig
        all_league_names = [l['display_name'] for l in grouped_leagues]

        context['all_league_names'] = all_league_names
        context['structured_data'] = grouped_leagues

        # Obserwowane mecze dla tej sesji (przywracanie stanu dzwoneczków + auto-connect WS)
        subscribed_ids = []
        if self.request.session.session_key:
            subscribed_ids = list(
                MatchSubscription.objects.filter(session_key=self.request.session.session_key)
                .values_list('match__api_id', flat=True)
            )
        context['subscribed_ids_json'] = json.dumps(subscribed_ids)

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
    query = request.GET.get('q', '').strip()
    
    if not query:
        return render(request, 'matches/search_results.html', {'error': 'Wpisz zapytanie do wyszukiwarki.'})

    from .models import Team, Player
    local_teams = Team.objects.filter(name__icontains=query)
    local_players = Player.objects.filter(name__icontains=query)

    if not local_teams.exists() and not local_players.exists():
        print(f"Brak wyników lokalnie dla '{query}'. Szukam w zewnętrznym API...")
        
        from .services import search_teams_from_api, search_players_from_api
        
        # Dopiero teraz uderzamy do API (raz dla drużyn, raz dla zawodników)
        api_teams = search_teams_from_api(query)
        api_players = search_players_from_api(query)
        
        teams_to_show = api_teams
        players_to_show = api_players
    else:
        print(f"Znaleziono lokalnie '{query}'. Pomijam API!")
        teams_to_show = local_teams
        players_to_show = local_players

    # 3. Zwracamy połączone wyniki do szablonu
    context = {
        'teams': teams_to_show,
        'players': players_to_show,
        'query': query,
    }
    
    return render(request, 'matches/search_results.html', context)


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


def upcoming_matches_view(request):
    """Widok nadchodzących meczów — pogrupowane wg ligi, top 12 wg rankingu UEFA."""
    upcoming_matches = UpcomingMatch.objects.select_related(
        'home_team', 'away_team', 'league'
    ).order_by('start_datetime', 'id')

    # Top 12 lig wg rankingu UEFA (api_id jako string — bo tak trzyma je baza, nazwa, kraj)
    TOP_12_LEAGUES = [
        ('1',    'Premier League',           'England'),
        ('33',   'Serie A',                  'Italy'),
        ('36',   'LaLiga',                   'Spain'),
        ('42',   'Bundesliga',               'Germany'),
        ('4',    'Ligue 1',                  'France'),
        ('52',   'Liga Portugal Betclic',    'Portugal'),
        ('39',   'VriendenLoterij Eredivisie','Netherlands'),
        ('38',   'Pro League',               'Belgium'),
        ('62',   'Trendyol Süper Lig',       'Turkey'),
        ('49',   'Czech First League',       'Czech Republic'),
        ('127',  'Stoiximan Super League',   'Greece'),
        ('64',   'Ekstraklasa',              'Poland'),
    ]
    top_api_ids = {t[0] for t in TOP_12_LEAGUES}

    # Pogrupuj mecze wg league.api_id
    matches_by_api_id = {}
    for match in upcoming_matches:
        league = match.league
        if not league:
            continue
        api_id = league.api_id
        if api_id not in matches_by_api_id:
            matches_by_api_id[api_id] = {
                'name': league.name,
                'country': league.country or '',
                'matches': [],
            }
        matches_by_api_id[api_id]['matches'].append(match)

    # Buduj listę top 12 (zawsze widoczne, nawet bez meczów)
    grouped_leagues = []
    for api_id, name, country in TOP_12_LEAGUES:
        data = matches_by_api_id.pop(api_id, None)
        display_name = f"{name} • {country}" if country else name
        grouped_leagues.append({
            'name': name,
            'country': country,
            'display_name': display_name,
            'matches': data['matches'] if data else [],
            'is_top': True,
            'has_matches': bool(data),
        })

    # Reszta lig — posortowane alfabetycznie
    other_leagues = sorted(matches_by_api_id.values(), key=lambda x: x['name'])
    for data in other_leagues:
        country = data['country']
        display_name = f"{data['name']} • {country}" if country else data['name']
        grouped_leagues.append({
            'name': data['name'],
            'country': country,
            'display_name': display_name,
            'matches': data['matches'],
            'is_top': False,
            'has_matches': True,
        })

    all_league_names = [l['display_name'] for l in grouped_leagues]

    return render(request, 'matches/calendar.html', {
        'grouped_leagues': grouped_leagues,
        'all_league_names': all_league_names,
    })



def player_detail(request, api_id):
    """Dedykowany widok profilu zawodnika. Pobiera/aktualizuje z API w locie."""
    
    player = Player.objects.filter(api_id=api_id).first()
    
    if not player or not player.nationality or not player.date_of_birth:
        player = fetch_player(api_id)
        
    if not player:
        return render(request, 'matches/player_detail.html', {'error': 'Nie znaleziono danych o zawodniku'})
        
    # Wyliczanie wieku
    age = None
    if player.date_of_birth:
        today = date.today()
        dob = player.date_of_birth
        age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
    
    # Ładne formatowanie wartości rynkowej (np. 45000000 -> 45.0 mln €)
    formatted_market_value = None
    if player.market_value:
        formatted_market_value = f"{player.market_value / 1000000:.1f} mln €"
        
    context = {
        'player': player,
        'age': age,
        'formatted_market_value': formatted_market_value,
    }
    
    return render(request, 'matches/player_detail.html', context)





def proxy_image_view(request, entity_type, api_id):
    """
    Pobiera zdjęcie zawodnika lub herb z API i buforuje je w pamięci serwera, 
    aby oszczędzać limity zapytań.
    """
    if entity_type not in ['player', 'team']:
        raise Http404("Nieznany typ obrazka")

    # Tworzymy unikalny klucz dla tego konkretnego obrazka (np. 'image_team_2817')
    cache_key = f"image_{entity_type}_{api_id}"
    
    # 1. SPRAWDZAMY KIESZEŃ (CACHE)
    cached_image_data = cache.get(cache_key)
    if cached_image_data:
        print(f"🟢 CACHE HIT: Obrazek {entity_type} {api_id} pobrany z pamięci (0 zapytań!)")
        return HttpResponse(
            cached_image_data['content'], 
            content_type=cached_image_data['content_type']
        )

    # A tuż przed wykonaniem requests.get(url...):
    print(f"🔴 API HIT: Pobieram obrazek {entity_type} {api_id} z RapidAPI (-1 z limitu)")

    # 2. OBRAZKA NIE MA W PAMIĘCI - UDERZAMY DO API
    url = f"https://sportapi7.p.rapidapi.com/api/v1/{entity_type}/{api_id}/image"
    headers = {
        "x-rapidapi-key": os.getenv("SPORT_API_KEY"),
        "x-rapidapi-host": os.getenv("SPORT_API_HOST", "sportapi7.p.rapidapi.com")
    }

    try:
        response = requests.get(url, headers=headers, timeout=5)
        if response.status_code == 200:
            content_type = response.headers.get('Content-Type', 'image/jpeg')
            
            # Zapisujemy pobrany obrazek do cache'a na 30 dni! (60s * 60m * 24h * 30d = 2592000 sekund)
            cache.set(cache_key, {
                'content': response.content,
                'content_type': content_type
            }, timeout=2592000)

            return HttpResponse(response.content, content_type=content_type)
        else:
            return HttpResponse(status=404)
    except Exception:
        return HttpResponse(status=404)


@csrf_exempt
@require_POST
def toggle_notifications(request):
    
    if not request.session.session_key:
        request.session.create()


    data = json.loads(request.body)
    match_api_id = data.get('match_id')

    try:
        match = LiveMatch.objects.get(api_id=match_api_id)

        subscription, created = MatchSubscription.objects.get_or_create(
            match=match,
            session_key=request.session.session_key
        )

        if not created:
            subscription.delete()
            return JsonResponse({'status' : 'removed', 'message': 'Powiadomienia wyłączone 🔕'})
        
        return JsonResponse({'status' : 'added', 'message': 'Powiadomienia włączone 🔔'})

    except LiveMatch.DoesNotExist:
        return JsonResponse({'status' : 'error', 'message': 'Mecz nie istnieje'})