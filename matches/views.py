# Standard library
import json
import logging
import os
import time
from collections import defaultdict, OrderedDict
from datetime import date

logger = logging.getLogger(__name__)

# Third-party
import requests
from django.contrib import messages
from django.contrib.auth import logout
from django.contrib.auth.decorators import login_not_required
from django.contrib.auth.mixins import LoginRequiredMixin
from django.core.cache import cache
from django.db import models
from django.http import HttpResponse, Http404, JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from django.views.generic import ListView

# Local
from .forms import UserRegisterForm
from .models import (
    CachedImage, League, LeagueStandings, LiveMatch, MatchEvent,
    MatchLineup, MatchSubscription, MissingPlayer, Player, Team, UpcomingMatch,
)
from .services import fetch_match_details, fetch_last_matches_for_team


# ─────────────────────────────────
# CONSTANTS
# ─────────────────────────────────

TOP_LEAGUES_CONFIG = [
    (7,    'UEFA Champions League',      'Europa'),
    (679,  'UEFA Europa League',         'Europa'),
    (1703, 'UEFA Conference League',     'Europa'),
    (17,   'Premier League',             'England'),
    (8,    'LaLiga',                     'Spain'),
    (23,   'Serie A',                    'Italy'),
    (35,   'Bundesliga',                 'Germany'),
    (34,   'Ligue 1',                    'France'),
    (202,  'Ekstraklasa',                'Poland'),
    (37,   'VriendenLoterij Eredivisie', 'Netherlands'),
    (238,  'Liga Portugal Betclic',      'Portugal'),
    (18,   'Championship',               'England'),
    (52,   'Trendyol Süper Lig',         'Turkey'),
]

ENDED_STATUSES = frozenset([
    'ended', 'finished', 'canceled', 'cancelled', 'postponed',
    'abandoned', 'awarded', 'after penalties', 'after extra time', 'ap', 'aet',
])


# ─────────────────────────────────
# HELPERS
# ─────────────────────────────────

def _build_league_groups(matches_iterable, /, *, pop_keys=True):
    """
    Grupuje mecze po league.api_id.
    Zwraca słownik {api_id: {'name', 'country', 'matches', 'is_top'}}.
    """
    result = {}
    for match in matches_iterable:
        league = match.league
        if not league:
            continue
        api_id = int(league.api_id)
        if api_id not in result:
            result[api_id] = {
                'name': league.name,
                'country': league.country or '',
                'matches': [],
                'is_top': getattr(match, 'is_top', False),
            }
        result[api_id]['matches'].append(match)
    return result


def _league_entry(data, country=None, is_top=False):
    """Buduje słownik wpisu ligi do szablonu."""
    name = data['name']
    c = country or data.get('country', '')
    display_name = f"{name} • {c}" if c else name
    return {
        'name': name,
        'country': c,
        'display_name': display_name,
        'matches': data.get('matches', []),
        'is_top': is_top,
        'has_matches': bool(data.get('matches')),
    }


def _rating_class(avg_rating):
    """Zwraca klasę CSS oceny zawodnika (green/yellow/red) na podstawie wartości liczbowej."""
    if not avg_rating:
        return ''
    try:
        value = float(avg_rating)
        if value >= 7.0:
            return 'rating-green'
        if value >= 6.0:
            return 'rating-yellow'
        return 'rating-red'
    except (ValueError, TypeError):
        return 'rating-yellow'


def _build_pitch_data(xi_players, formation_str, is_home=True):
    """
    Parsuje formację i przypisuje pozycje (top%, left%) do zawodników XI.
    Zwraca listę słowników {player, top, left, rating_class}.
    """
    if not formation_str:
        positions = {'G': [], 'D': [], 'M': [], 'F': []}
        for p in xi_players:
            positions.get(p.position, positions.setdefault(p.position, [])).append(p)
        formation_rows = [len(positions[k]) for k in ['D', 'M', 'F'] if positions[k]]
        formation_str = '-'.join(str(n) for n in formation_rows) if formation_rows else '4-4-2'

    try:
        rows = [int(x) for x in formation_str.split('-')]
    except ValueError:
        rows = [4, 4, 2]

    groups = {'G': [], 'D': [], 'M': [], 'F': []}
    for p in xi_players:
        groups.get(p.position or 'M', groups['M']).append(p)

    all_outfield = groups['D'] + groups['M'] + groups['F']
    row_players = [groups['G']]
    idx = 0
    for count in rows:
        row_players.append(all_outfield[idx:idx + count])
        idx += count

    total_rows = len(row_players)
    pitch_data = []

    for row_idx, players_in_row in enumerate(row_players):
        if not players_in_row:
            continue
        ratio = row_idx / max(total_rows - 1, 1)
        left_pct = 5 + ratio * 40 if is_home else 95 - ratio * 40
        n = len(players_in_row)
        for col_idx, player in enumerate(players_in_row):
            top_pct = (col_idx + 1) / (n + 1) * 100
            pitch_data.append({
                'player': player,
                'top': round(top_pct, 1),
                'left': round(left_pct, 1),
                'rating_class': _rating_class(player.avg_rating),
            })

    return pitch_data


def _subscribed_ids(request):
    """Zwraca listę api_id meczów obserwowanych przez bieżącą sesję."""
    if not request.session.session_key:
        return []
    return list(
        MatchSubscription.objects
        .filter(session_key=request.session.session_key)
        .values_list('match__api_id', flat=True)
    )


# ─────────────────────────────────
# VIEWS
# ─────────────────────────────────

def live_matches_view(request):
    """Strona główna: lista meczów live pogrupowanych wg ligi."""
    live_matches = (
        LiveMatch.objects
        .filter(status__icontains='half')
        .select_related('home_team', 'away_team', 'league')
    )
    return render(request, 'matches/live_match_list.html', {
        'matches': live_matches,
        'subscribed_ids_json': json.dumps(_subscribed_ids(request)),
    })


def match_detail_view(request, match_id):
    """Szczegółowa strona meczu: wynik, oś czasu, składy, statystyki."""
    match = get_object_or_404(LiveMatch, id=match_id)

    is_ended = match.status.lower().strip() in ENDED_STATUSES

    if not (is_ended and (match.events.exists() or match.stats_json)):
        if not is_ended:
            match.events.all().delete()
        fetch_match_details(local_match_id=match.id, api_match_id=match.api_id)
        match.refresh_from_db()

    events = MatchEvent.objects.filter(match=match).order_by('time', 'added_time', 'id')

    if not is_ended:
        current_minute = _current_match_minute(match)
        status_lower = match.status.lower().strip()
        events = [e for e in events if _should_show_event(e, status_lower, current_minute)]

    lineups_qs = MatchLineup.objects.filter(match=match)
    home_xi = list(lineups_qs.filter(is_home_team=True, is_starting_xi=True).order_by('shirt_number'))
    away_xi = list(lineups_qs.filter(is_home_team=False, is_starting_xi=True).order_by('shirt_number'))

    lineups = {
        'home_xi': home_xi,
        'home_subs': lineups_qs.filter(is_home_team=True, is_starting_xi=False).order_by('shirt_number'),
        'away_xi': away_xi,
        'away_subs': lineups_qs.filter(is_home_team=False, is_starting_xi=False).order_by('shirt_number'),
    }

    stats_periods = _parse_stats(match.stats_json)

    return render(request, 'matches/match_detail.html', {
        'match': match,
        'events': events,
        'lineups': lineups,
        'pitch_home': _build_pitch_data(home_xi, match.home_formation, is_home=True),
        'pitch_away': _build_pitch_data(away_xi, match.away_formation, is_home=False),
        'missing_home': MissingPlayer.objects.filter(match=match, is_home_team=True),
        'missing_away': MissingPlayer.objects.filter(match=match, is_home_team=False),
        'stats_periods': stats_periods,
    })


def _current_match_minute(match):
    """Oblicza bieżącą minutę meczu na podstawie match_time (Unix timestamp)."""
    if not match.match_time:
        return match.minute or 0
    try:
        elapsed = int((time.time() - int(match.match_time)) / 60)
        return (match.minute or 0) + elapsed
    except (ValueError, TypeError):
        return match.minute or 0


def _should_show_event(event, status_lower, current_minute):
    """Filtruje zdarzenia: ukrywa przedwczesne markery HT/FT dla meczów live."""
    if not event.is_period_marker:
        return True

    is_first_half = '1st' in status_lower or 'first' in status_lower
    is_second_half = '2nd' in status_lower or 'second' in status_lower
    is_halftime = 'half' in status_lower and 'time' in status_lower

    if (event.text == 'HT' or event.time == 45) and is_first_half:
        return False
    if (event.text == 'FT' or event.time == 90) and (is_first_half or is_halftime or is_second_half):
        return False

    return event.time <= current_minute


def _parse_stats(stats_json):
    """Parsuje stats_json (lista okresy → grupy → pozycje) na listę gotową do szablonu."""
    if not stats_json:
        return []
    periods = []
    for period in stats_json:
        items = []
        for group in period.get('groups', []):
            for item in group.get('statisticsItems', []):
                home_val = float(item.get('homeValue', 0) or 0)
                away_val = float(item.get('awayValue', 0) or 0)
                total = home_val + away_val
                h_pct = round((home_val / total) * 100) if total > 0 else 50
                items.append({
                    'name': item.get('name', ''),
                    'home': item.get('home', home_val),
                    'away': item.get('away', away_val),
                    'h_pct': h_pct,
                    'a_pct': 100 - h_pct,
                    'is_possession': item.get('name') == 'Ball possession',
                })
        periods.append({'period': period.get('period', 'ALL'), 'items': items})
    return periods


class HomeView(LoginRequiredMixin, ListView):
    """Strona główna: lista meczów live pogrupowanych wg ligi."""

    model = LiveMatch
    template_name = 'matches/live_match_list.html'
    context_object_name = 'matches'

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        all_matches = (
            LiveMatch.objects
            .select_related('league', 'home_team', 'away_team')
            .exclude(status='Ended')
        )
        matches_by_api_id = _build_league_groups(all_matches)

        grouped_leagues = []
        for api_id, name, country in TOP_LEAGUES_CONFIG:
            data = matches_by_api_id.pop(api_id, None)
            if data:
                grouped_leagues.append(_league_entry(data, country=country, is_top=True))

        for data in sorted(matches_by_api_id.values(), key=lambda x: x['name']):
            grouped_leagues.append(_league_entry(data, is_top=False))

        context['structured_data'] = grouped_leagues
        context['all_league_names'] = [lg['display_name'] for lg in grouped_leagues]
        context['subscribed_ids_json'] = json.dumps(_subscribed_ids(self.request))
        return context


class CalendarView(LoginRequiredMixin, ListView):
    """Kalendarz zakończonych meczów pogrupowanych wg daty, kraju i ligi."""

    model = LiveMatch
    template_name = 'matches/calendar.html'
    context_object_name = 'matches'

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        ended_matches = (
            LiveMatch.objects
            .select_related('league', 'home_team', 'away_team')
            .filter(status='Ended')
            .order_by('-match_date', 'league__name')
        )

        days_data = OrderedDict()
        for match in ended_matches:
            day = match.match_date or 'Brak daty'
            country = match.country_name or (match.league.country if match.league else None) or 'Inne'
            league_name = match.league.name if match.league else 'Nieznana Liga'
            days_data.setdefault(day, defaultdict(lambda: defaultdict(list)))[country][league_name].append(match)

        structured_days = []
        for day, countries in days_data.items():
            leagues_list = []
            league_names_set = set()
            for country, leagues in countries.items():
                for league_name, matches in leagues.items():
                    leagues_list.append({'name': league_name, 'country': country, 'matches': matches})
                    league_names_set.add(league_name)
            structured_days.append({
                'date': day,
                'leagues': leagues_list,
                'league_names': sorted(league_names_set),
            })

        all_league_names = sorted({
            league['name']
            for day in structured_days
            for league in day['leagues']
        })
        context['structured_days'] = structured_days
        context['all_league_names'] = all_league_names
        return context


def search_api_view(request):
    """Renderuje stronę wyników wyszukiwania (dane pobierane przez JS z /api/search/)."""
    return render(request, 'matches/search_results.html')


def team_detail_view(request, team_id):
    """Strona drużyny — dane pobierane przez JS z DRF API (/api/teams/<api_id>/)."""
    team = get_object_or_404(Team, id=team_id)
    return render(request, 'matches/team_detail.html', {'api_id': team.api_id})


def player_detail(request, api_id):
    """Profil zawodnika — dane pobierane przez JS z DRF API (/api/players/<api_id>/)."""
    return render(request, 'matches/player_detail.html', {'api_id': api_id})


def upcoming_matches_view(request):
    """Widok nadchodzących meczów pogrupowanych wg ligi."""
    upcoming = (
        UpcomingMatch.objects
        .select_related('home_team', 'away_team', 'league')
        .order_by('start_datetime', 'id')
    )
    matches_by_api_id = _build_league_groups(upcoming)

    grouped_leagues = []

    for api_id, name, country in TOP_LEAGUES_CONFIG:
        data = matches_by_api_id.pop(api_id, None)
        entry_data = data if data else {'name': name, 'country': country, 'matches': []}
        grouped_leagues.append(_league_entry(entry_data, country=country, is_top=True))

    top_other = sorted(
        [d for d in matches_by_api_id.values() if d.get('is_top')],
        key=lambda x: x['name'],
    )
    for data in top_other:
        grouped_leagues.append(_league_entry(data, is_top=True))

    non_top = sorted(
        [d for d in matches_by_api_id.values() if not d.get('is_top')],
        key=lambda x: x['name'],
    )
    for data in non_top:
        grouped_leagues.append(_league_entry(data, is_top=False))

    return render(request, 'matches/calendar.html', {
        'grouped_leagues': grouped_leagues,
        'all_league_names': [lg['display_name'] for lg in grouped_leagues],
    })


@login_not_required
def proxy_image_view(request, entity_type, api_id):
    """
    Serwuje herb drużyny / zdjęcie zawodnika.
    Priorytet: baza danych (CachedImage) → zewnętrzne API.
    """
    if entity_type not in ('player', 'team'):
        raise Http404('Nieznany typ obrazka')

    try:
        cached = CachedImage.objects.get(entity_type=entity_type, api_id=api_id)
        logger.info('DB CACHE HIT: %s %s (0 zapytań API)', entity_type, api_id)
        return HttpResponse(bytes(cached.content), content_type=cached.content_type)
    except CachedImage.DoesNotExist:
        pass

    logger.warning('API HIT: pobieram %s %s z RapidAPI (-1 z limitu)', entity_type, api_id)
    url = f"https://sportapi7.p.rapidapi.com/api/v1/{entity_type}/{api_id}/image"
    headers = {
        'x-rapidapi-key': os.getenv('SPORT_API_KEY'),
        'x-rapidapi-host': os.getenv('SPORT_API_HOST', 'sportapi7.p.rapidapi.com'),
    }

    try:
        response = requests.get(url, headers=headers, timeout=5)
        if response.status_code != 200:
            return HttpResponse(status=404)
        content_type = response.headers.get('Content-Type', 'image/jpeg')
        CachedImage.objects.create(
            entity_type=entity_type,
            api_id=api_id,
            content=response.content,
            content_type=content_type,
        )
        logger.info('Zapisano %s %s do bazy danych', entity_type, api_id)
        return HttpResponse(response.content, content_type=content_type)
    except Exception:
        return HttpResponse(status=404)


@csrf_exempt
@require_POST
def toggle_notifications(request):
    """Przełącza subskrypcję powiadomień WebSocket dla meczu (toggle)."""
    if not request.session.session_key:
        request.session.create()

    data = json.loads(request.body)
    match_api_id = data.get('match_id')

    try:
        match = LiveMatch.objects.get(api_id=match_api_id)
    except LiveMatch.DoesNotExist:
        return JsonResponse({'status': 'error', 'message': 'Mecz nie istnieje'})

    subscription, created = MatchSubscription.objects.get_or_create(
        match=match,
        session_key=request.session.session_key,
    )

    if not created:
        subscription.delete()
        return JsonResponse({'status': 'removed', 'message': 'Powiadomienia wyłączone 🔕'})

    return JsonResponse({'status': 'added', 'message': 'Powiadomienia włączone 🔔'})


@login_not_required
def active_match_ids(request):
    """Zwraca podzbiór podanych api_id meczów, które są nadal live (status != 'Ended')."""
    ids_param = request.GET.get('ids', '')
    if not ids_param:
        return JsonResponse({'active_ids': []})

    try:
        requested_ids = [int(i) for i in ids_param.split(',') if i.strip()]
    except ValueError:
        return JsonResponse({'active_ids': []})

    active_ids = list(
        LiveMatch.objects
        .filter(api_id__in=requested_ids)
        .exclude(status='Ended')
        .values_list('api_id', flat=True)
    )
    return JsonResponse({'active_ids': active_ids})


@login_not_required
def register(request):
    """Rejestracja nowego użytkownika."""
    form = UserRegisterForm(request.POST or None)
    if request.method == 'POST' and form.is_valid():
        form.save()
        username = form.cleaned_data.get('username')
        messages.success(request, f'Konto dla {username} zostało utworzone! Możesz się zalogować.')
        return redirect('login')
    return render(request, 'matches/register.html', {'form': form})


def logout_view(request):
    """Wylogowuje użytkownika i przekierowuje na stronę główną."""
    logout(request)
    return redirect('home')


def league_detail_view(request, api_id):
    """Strona ligi — dane pobierane przez JS z DRF API (/api/leagues/<api_id>/)."""
    league = League.objects.filter(api_id=api_id).first()

    if not league:
        return render(request, 'matches/league_detail.html', {
            'league': {'name': 'Nieznana Liga', 'country': ''},
            'upcoming_matches': [],
            'recent_matches': [],
            'standings': [],
            'error': 'Liga nie została jeszcze pobrana przez system.',
        })

    upcoming_matches = (
        UpcomingMatch.objects
        .filter(league=league)
        .select_related('home_team', 'away_team')
        .order_by('start_datetime')[:10]
    )
    recent_matches = (
        LiveMatch.objects
        .filter(league=league, status__in=['ended', 'finished', 'after extra time', 'after penalties'])
        .select_related('home_team', 'away_team')
        .order_by('-match_date')[:10]
    )
    standings = (
        LeagueStandings.objects
        .filter(league=league)
        .select_related('team')
        .order_by('position')
    )

    return render(request, 'matches/league_detail.html', {
        'league': league,
        'upcoming_matches': upcoming_matches,
        'recent_matches': recent_matches,
        'standings': standings,
    })
