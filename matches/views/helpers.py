"""
views/helpers.py

Shared constants and private helper functions used across multiple view modules.
"""
import time

from matches.models import MatchSubscription


# ─────────────────────────────────────────────────────────────
# CONSTANTS
# ─────────────────────────────────────────────────────────────

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


# ─────────────────────────────────────────────────────────────
# GROUPING HELPERS
# ─────────────────────────────────────────────────────────────

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


# ─────────────────────────────────────────────────────────────
# MATCH DETAIL HELPERS
# ─────────────────────────────────────────────────────────────

def _rating_class(avg_rating):
    """Zwraca klasę CSS oceny zawodnika (green/yellow/red)."""
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
        positions: dict[str, list] = {'G': [], 'D': [], 'M': [], 'F': []}
        for p in xi_players:
            positions.get(p.position, positions.setdefault(p.position, [])).append(p)
        formation_rows = [len(positions[k]) for k in ['D', 'M', 'F'] if positions[k]]
        formation_str = '-'.join(str(n) for n in formation_rows) if formation_rows else '4-4-2'

    try:
        rows = [int(x) for x in formation_str.split('-')]
    except ValueError:
        rows = [4, 4, 2]

    groups: dict[str, list] = {'G': [], 'D': [], 'M': [], 'F': []}
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
