"""
services/match_service.py

Handles all live-match syncing, match detail fetching, incident parsing,
lineup saving, and retrieving historical match data for a team.
"""
import os
import time as _time
from datetime import datetime, timedelta

import requests
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.utils.timezone import make_aware

from matches.models import (
    League, LiveMatch, MatchEvent, MatchLineup,
    MissingPlayer, MatchSubscription, Team, UpcomingMatch,
)

# ─── Top leagues set (SportAPI unique-tournament IDs) ────────────────────────
_TOP_LEAGUES = {7, 679, 1703, 17, 8, 23, 35, 34, 202, 37, 238, 18, 52, 53, 44}


def _api_headers() -> dict:
    return {
        "x-rapidapi-key": os.getenv("SPORT_API_KEY"),
        "x-rapidapi-host": os.getenv("SPORT_API_HOST", "sportapi7.p.rapidapi.com"),
    }


# =============================================================================
#  INCIDENT MAPPERS
# =============================================================================

def _safe_nested(data, *keys, default=None):
    """Bezpiecznie wyciąga zagnieżdżoną wartość z dict."""
    current = data
    for key in keys:
        if isinstance(current, dict):
            current = current.get(key)
        else:
            return default
        if current is None:
            return default
    return current


def _map_goal(item):
    return {
        'player_name': _safe_nested(item, 'player', 'name') or item.get('playerName', ''),
        'assist_player_name': _safe_nested(item, 'assist1', 'name') or item.get('assist1Name'),
        'assist2_player_name': _safe_nested(item, 'assist2', 'name') or item.get('assist2Name'),
        'home_score': item.get('homeScore'),
        'away_score': item.get('awayScore'),
        'incident_class': item.get('incidentClass'),
    }


def _map_card(item):
    return {
        'player_name': _safe_nested(item, 'player', 'name') or item.get('playerName', ''),
        'incident_class': item.get('incidentClass'),
        'reason': item.get('reason'),
        'rescinded': item.get('rescinded', False),
    }


def _map_substitution(item):
    player_in = item.get('playerIn', {}) or {}
    player_out = item.get('playerOut', {}) or {}
    in_name = player_in.get('name') or item.get('playerNameIn', '')
    out_name = player_out.get('name') or item.get('playerNameOut', '')
    return {
        'player_in_name': in_name,
        'player_out_name': out_name,
        'player_name': in_name,
        'injury': item.get('injury', False) or False,
    }


def _map_period(item):
    return {
        'text': item.get('text'),
        'home_score': item.get('homeScore'),
        'away_score': item.get('awayScore'),
        'is_live': item.get('isLive', False),
    }


def _map_injury_time(item):
    return {'length': item.get('length')}


def _map_var_decision(item):
    return {
        'player_name': _safe_nested(item, 'player', 'name') or item.get('playerName', ''),
        'incident_class': item.get('incidentClass'),
        'confirmed': item.get('confirmed'),
    }


def _map_in_game_penalty(item):
    return {
        'player_name': _safe_nested(item, 'player', 'name') or item.get('playerName', ''),
        'incident_class': item.get('incidentClass'),
        'reason': item.get('reason'),
    }


_INCIDENT_MAPPERS = {
    'goal': _map_goal,
    'card': _map_card,
    'substitution': _map_substitution,
    'period': _map_period,
    'injuryTime': _map_injury_time,
    'varDecision': _map_var_decision,
    'inGamePenalty': _map_in_game_penalty,
}


def _map_incident(item: dict) -> dict:
    """Mapuje pojedyncze zdarzenie z JSON-a na słownik pól modelu MatchEvent."""
    i_type = item.get('incidentType', '')
    base = {
        'incident_type': i_type,
        'event_id': str(item.get('id', '')),
        'time': item.get('time', 0) or 0,
        'added_time': item.get('addedTime') or 0,
    }
    is_home = item.get('isHome')
    base['is_home_team'] = is_home if is_home is not None else True

    mapper = _INCIDENT_MAPPERS.get(i_type)
    if mapper:
        base.update(mapper(item))
    else:
        base['player_name'] = _safe_nested(item, 'player', 'name') or ''
        base['text'] = item.get('text')
        base['incident_class'] = item.get('incidentClass')
    return base


# =============================================================================
#  WEBSOCKET INCIDENT NOTIFICATIONS
# =============================================================================

def _check_new_incidents(match_obj, api_match_id, home_team, away_team, channel_layer, room_group_name):
    """
    Pobiera zdarzenia (incidents) z API dla obserwowanego meczu.
    Porównuje event_id z tymi już w DB → nowe kartki/zmiany → wysyła WS notification.
    Wywoływana TYLKO dla meczów z aktywnymi subskrypcjami.
    """
    incidents_url = f"https://sportapi7.p.rapidapi.com/api/v1/event/{api_match_id}/incidents"
    try:
        resp = requests.get(incidents_url, headers=_api_headers(), timeout=10)
        if resp.status_code != 200:
            return
        incidents = resp.json().get('incidents', [])
    except Exception as e:
        print(f"Błąd pobierania incidentów dla meczu {api_match_id}: {e}")
        return

    existing_ids = set(
        MatchEvent.objects.filter(match=match_obj)
        .exclude(event_id__isnull=True)
        .values_list('event_id', flat=True)
    )

    for inc in incidents:
        inc_id = str(inc.get('id', ''))
        if not inc_id or inc_id in existing_ids:
            continue

        inc_type = inc.get('incidentType', '')
        inc_class = inc.get('incidentClass', '')
        is_home = inc.get('isHome', True)
        team_name = home_team.name if is_home else away_team.name
        player = inc.get('player', {}).get('name', '')
        minute = inc.get('time', '')

        if inc_type == 'card':
            if inc_class == 'yellow':
                icon, label = '🟨', 'Żółta kartka'
            elif inc_class == 'red':
                icon, label = '🟥', 'Czerwona kartka'
            elif inc_class == 'yellowRed':
                icon, label = '🟨🟥', 'Druga żółta → czerwona'
            else:
                continue
            async_to_sync(channel_layer.group_send)(
                room_group_name,
                {'type': 'match_event', 'event_type': 'card', 'icon': icon,
                 'message': f"{label}: {player} ({team_name}) {minute}'"},
            )

        elif inc_type == 'substitution':
            player_in = inc.get('playerIn', {}).get('name', '?')
            player_out = inc.get('playerOut', {}).get('name', '?')
            async_to_sync(channel_layer.group_send)(
                room_group_name,
                {'type': 'match_event', 'event_type': 'substitution', 'icon': '🔄',
                 'message': f"Zmiana ({team_name}) {minute}': ⬆️ {player_in}  ⬇️ {player_out}"},
            )

        MatchEvent.objects.get_or_create(
            match=match_obj,
            event_id=inc_id,
            defaults={
                'incident_type': inc_type,
                'incident_class': inc_class,
                'time': minute if isinstance(minute, int) else 0,
                'is_home_team': is_home,
                'player_name': player,
            }
        )


# =============================================================================
#  FETCH LIVE MATCHES (KROK 1 – dane surowe z API)
# =============================================================================

def fetch_live_matches() -> dict | None:
    """Pobiera listę meczów na żywo z API."""
    url = "https://sportapi7.p.rapidapi.com/api/v1/sport/football/events/live"
    try:
        response = requests.get(url, headers=_api_headers(), timeout=10)
        if response.status_code == 200:
            return response.json()
        print(f"Błąd API (Live Matches): {response.status_code}")
        return None
    except Exception as e:
        print(f"Błąd połączenia: {e}")
        return None


# =============================================================================
#  SYNC LIVE MATCHES (KROK 2 – zapis do DB + WebSocket powiadomienia)
# =============================================================================

def sync_live_matches():
    """Pobiera mecze live z API i zapisuje je do bazy danych."""
    data = fetch_live_matches()
    if not data or 'events' not in data:
        print("Brak danych do zsynchronizowania.")
        return

    count = 0
    for event in data['events']:
        try:
            league_data = event['tournament']
            unique_tournament = league_data.get('uniqueTournament', {})
            league_id = unique_tournament.get('id') or league_data['id']
            league_name = unique_tournament.get('name') or league_data['name']
            category = league_data.get('category', {})
            country_name = category.get('name', 'Inne')

            league, created = League.objects.get_or_create(
                api_id=league_id,
                defaults={'name': league_name, 'country': country_name},
            )
            if not created:
                updated = False
                if not league.country and country_name:
                    league.country = country_name
                    updated = True
                if league.name != league_data['name']:
                    league.name = league_data['name']
                    updated = True
                if updated:
                    league.save()

            home_data = event['homeTeam']
            away_data = event['awayTeam']
            home_team, _ = Team.objects.get_or_create(api_id=home_data['id'], defaults={'name': home_data['name']})
            away_team, _ = Team.objects.get_or_create(api_id=away_data['id'], defaults={'name': away_data['name']})

            status_data = event.get('status', {})
            status_desc = status_data.get('description', '')
            start_ts = event.get('startTimestamp')
            match_date = (datetime.fromtimestamp(start_ts) + timedelta(hours=1)).date() if start_ts else None

            time_data = event.get('time', {})
            if not isinstance(time_data, dict):
                time_data = {}
            period_start_ts = time_data.get('currentPeriodStartTimestamp')
            initial_min = (time_data.get('initial', 0) or 0) // 60

            if period_start_ts:
                minute_to_save = initial_min
                match_time_to_save = str(int(period_start_ts))
            else:
                minute_to_save = 0
                match_time_to_save = ''

            home_score = event['homeScore'].get('current', 0)
            away_score = event['awayScore'].get('current', 0)
            is_top = league_id in _TOP_LEAGUES

            defaults = {
                'league': league,
                'home_team': home_team,
                'away_team': away_team,
                'home_score': home_score,
                'away_score': away_score,
                'status': status_desc,
                'minute': minute_to_save,
                'match_time': match_time_to_save,
                'match_date': match_date,
                'country_name': country_name,
                'is_top': is_top,
            }

            try:
                old_match = LiveMatch.objects.get(api_id=event['id'])
                channel_layer = get_channel_layer()
                room_group_name = f'match_{event["id"]}'

                if old_match.home_score < home_score or old_match.away_score < away_score:
                    print(f"🔔 BRAMKA! {home_team.name} {old_match.home_score}→{home_score} - {old_match.away_score}→{away_score} {away_team.name}")
                    try:
                        async_to_sync(channel_layer.group_send)(
                            room_group_name,
                            {'type': 'match_event', 'event_type': 'goal', 'icon': '⚽',
                             'message': f'GOOOOL! {home_team.name} {home_score} - {away_score} {away_team.name}',
                             'home_score': home_score, 'away_score': away_score, 'status': status_desc},
                        )
                        print(f"  ✅ Wysłano WS do grupy {room_group_name}")
                    except Exception as ws_err:
                        print(f"  ❌ Błąd wysyłki WS: {ws_err}")

                if old_match.status != status_desc and status_desc:
                    period_icons = {
                        'Halftime': '⏸️', 'Ended': '🏁',
                        '2nd Half': '▶️', 'Extra Time 1st Half': '⏱️',
                        'Penalties': '🎯',
                    }
                    icon = period_icons.get(status_desc, '⏱️')
                    try:
                        async_to_sync(channel_layer.group_send)(
                            room_group_name,
                            {'type': 'match_event', 'event_type': 'period', 'icon': icon,
                             'message': f'{home_team.name} vs {away_team.name} — {status_desc}',
                             'home_score': home_score, 'away_score': away_score,
                             'status': status_desc, 'is_ended': status_desc == 'Ended'},
                        )
                    except Exception as ws_err:
                        print(f"  ❌ Błąd wysyłki WS status: {ws_err}")

                has_subscribers = MatchSubscription.objects.filter(match=old_match).exists()
                if has_subscribers:
                    _check_new_incidents(old_match, event['id'], home_team, away_team, channel_layer, room_group_name)

            except LiveMatch.DoesNotExist:
                pass

            LiveMatch.objects.update_or_create(api_id=event['id'], defaults=defaults)
            count += 1
        except Exception as e:
            print(f"Błąd przy zapisie meczu ID {event.get('id')}: {e}")
            continue

    print(f"Zakończono! Zsynchronizowano {count} meczów.")

    live_api_ids = {event['id'] for event in data['events']}
    stale_matches = LiveMatch.objects.filter(
        status__iregex=r'(half|halftime|extra|awaiting|penalties|break|live|progress|period)'
    ).exclude(api_id__in=live_api_ids)
    ended_count = stale_matches.update(status='Ended')
    if ended_count:
        print(f"Auto-zakończono {ended_count} meczów.")


# =============================================================================
#  FETCH MATCH DETAILS (KROK 3 – zdarzenia, składy, statystyki)
# =============================================================================

def _save_lineup_players(match, players_list: list, is_home: bool) -> int:
    count = 0
    for p in players_list:
        player_info = p.get('player', {})
        statistics = p.get('statistics', {})
        is_substitute = p.get('substitute', False)
        pos = player_info.get('position', '')
        if pos == 'S':
            is_substitute = True
        MatchLineup.objects.update_or_create(
            match=match,
            player_name=player_info.get('name', 'Nieznany'),
            is_home_team=is_home,
            defaults={
                'player_api_id': player_info.get('id'),
                'shirt_number': player_info.get('jerseyNumber') or p.get('shirtNumber'),
                'position': pos,
                'is_starting_xi': not is_substitute,
                'is_captain': p.get('captain', False) or False,
                'avg_rating': statistics.get('rating'),
            }
        )
        count += 1
    return count


def _save_missing_players(match, missing_list: list, is_home: bool) -> int:
    if not missing_list:
        return 0
    count = 0
    for item in missing_list:
        player_info = item.get('player', {})
        if not player_info:
            continue
        MissingPlayer.objects.get_or_create(
            match=match,
            player_name=player_info.get('name', 'Nieznany'),
            is_home_team=is_home,
            defaults={'type': item.get('type', 'missing'), 'reason': str(item.get('reason', ''))},
        )
        count += 1
    return count


def fetch_match_details(local_match_id: int, api_match_id: int) -> bool:
    """
    Pobiera szczegóły meczu: stan, zdarzenia, składy, statystyki.
    """
    try:
        match = LiveMatch.objects.get(id=local_match_id)
    except LiveMatch.DoesNotExist:
        print(f"Mecz o ID {local_match_id} nie istnieje w lokalnej bazie.")
        return False

    headers = _api_headers()

    # 0. Stan meczu
    event_url = f"https://sportapi7.p.rapidapi.com/api/v1/event/{api_match_id}"
    try:
        response_ev = requests.get(event_url, headers=headers, timeout=10)
        if response_ev.status_code == 200:
            ev_data = response_ev.json().get('event', {})
            time_data = ev_data.get('time', {})
            period_start_ts = time_data.get('currentPeriodStartTimestamp')
            initial_min = (time_data.get('initial', 0) or 0) // 60

            if period_start_ts:
                elapsed = int((_time.time() - period_start_ts) / 60)
                exact_minute = initial_min + elapsed
            else:
                exact_minute = time_data.get('current') or time_data.get('played') or 0

            new_status = ev_data.get('status', {}).get('description', '')
            home_score = ev_data.get('homeScore', {}).get('current')
            away_score = ev_data.get('awayScore', {}).get('current')

            update_fields = []
            if period_start_ts:
                match.match_time = str(period_start_ts)
                match.minute = initial_min
                update_fields += ['match_time', 'minute']
            elif exact_minute > 0:
                match.minute = exact_minute
                match.match_time = ''
                update_fields += ['minute', 'match_time']
            if new_status:
                match.status = new_status
                update_fields.append('status')
            if home_score is not None:
                match.home_score = home_score
                update_fields.append('home_score')
            if away_score is not None:
                match.away_score = away_score
                update_fields.append('away_score')
            if update_fields:
                match.save(update_fields=update_fields)
        else:
            print(f"Błąd API Event: {response_ev.status_code}")
    except Exception as e:
        print(f"Wyjątek przy pobieraniu stanu meczu: {e}")

    # 1. Zdarzenia
    incidents_url = f"https://sportapi7.p.rapidapi.com/api/v1/event/{api_match_id}/incidents"
    try:
        response_inc = requests.get(incidents_url, headers=headers, timeout=10)
        if response_inc.status_code == 200:
            incidents = response_inc.json().get('incidents', [])
            created_count = 0
            for item in incidents:
                mapped = _map_incident(item)
                event_id = mapped.pop('event_id', None)
                if event_id:
                    _, created = MatchEvent.objects.update_or_create(
                        match=match, event_id=event_id, defaults=mapped
                    )
                    if created:
                        created_count += 1
                else:
                    MatchEvent.objects.create(match=match, **mapped)
                    created_count += 1
            print(f"Zapisano {created_count} nowych zdarzeń (z {len(incidents)} w API).")
        else:
            print(f"Błąd API Incidents: {response_inc.status_code}")
    except Exception as e:
        print(f"Wyjątek przy pobieraniu zdarzeń: {e}")

    # 2. Składy
    lineups_url = f"https://sportapi7.p.rapidapi.com/api/v1/event/{api_match_id}/lineups"
    try:
        response_lin = requests.get(lineups_url, headers=headers, timeout=10)
        if response_lin.status_code == 200:
            data = response_lin.json()
            home_formation = data.get('home', {}).get('formation')
            away_formation = data.get('away', {}).get('formation')
            if home_formation or away_formation:
                if home_formation:
                    match.home_formation = home_formation
                if away_formation:
                    match.away_formation = away_formation
                match.save()

            home_data = data.get('home', {})
            away_data = data.get('away', {})
            home_count = _save_lineup_players(match, home_data.get('players', []), is_home=True)
            home_miss = _save_missing_players(match, home_data.get('missingPlayers', []), is_home=True)
            away_count = _save_lineup_players(match, away_data.get('players', []), is_home=False)
            away_miss = _save_missing_players(match, away_data.get('missingPlayers', []), is_home=False)
            print(f"Składy: Home {home_count}, Away {away_count} | Brak: Home {home_miss}, Away {away_miss}")
        else:
            print(f"Błąd API Lineups: {response_lin.status_code}")
    except Exception as e:
        print(f"Wyjątek przy pobieraniu składów: {e}")

    # 3. Statystyki
    url_stats = f"https://sportapi7.p.rapidapi.com/api/v1/event/{api_match_id}/statistics"
    try:
        response_stats = requests.get(url_stats, headers=headers, timeout=10)
        if response_stats.status_code == 200:
            match.stats_json = response_stats.json().get('statistics', [])
            match.save()
            print("Zapisano statystyki meczowe.")
        else:
            print(f"Błąd API Statistics: {response_stats.status_code}")
    except Exception as e:
        print(f"Wyjątek przy pobieraniu statystyk: {e}")

    return True


# =============================================================================
#  UPCOMING MATCHES
# =============================================================================

def fetch_upcoming_matches():
    """Pobiera mecze zaplanowane na dziś i 4 kolejne dni (łącznie 5 dni)."""
    url_template = "https://sportapi7.p.rapidapi.com/api/v1/sport/football/scheduled-events/{date}"
    today = datetime.now().date()

    # Usuwamy tylko przeszłe mecze – nie kasujemy tych, które wczęśniej pobraliśmy
    UpcomingMatch.objects.filter(start_datetime__date__lt=today).delete()
    print(f"Usunięto stare mecze sprzed {today}.")

    for delta in range(5):  # 0 = dziś, 1 = jutro, ..., 4 = za 4 dni
        fetch_date = today + timedelta(days=delta)
        date_str = fetch_date.strftime("%Y-%m-%d")
        url = url_template.format(date=date_str)
        try:
            response = requests.get(url, headers=_api_headers(), timeout=10)
        except Exception as e:
            print(f"Błąd połączenia dla daty {date_str}: {e}")
            continue

        if response.status_code != 200:
            print(f"Błąd API dla daty {date_str}: {response.status_code}")
            continue

        events = response.json().get('events', [])
        print(f"[{date_str}] Znaleziono {len(events)} eventów.")

        for event in events:
            try:
                status_type = event['status']['type']
                if status_type != 'notstarted':
                    continue

                league_data = event['tournament']
                unique_tournament = league_data.get('uniqueTournament', {})
                league_id = unique_tournament.get('id') or league_data['id']
                league_name = unique_tournament.get('name') or league_data['name']

                is_top = league_id in _TOP_LEAGUES
                api_id = event['id']
                start_ts = event['startTimestamp']
                start_datetime = make_aware(datetime.fromtimestamp(start_ts) + timedelta(hours=1))

                league_obj, _ = League.objects.get_or_create(
                    api_id=league_id,
                    defaults={'name': league_name}
                )
                home_team_data = event['homeTeam']
                away_team_data = event['awayTeam']
                home_team_obj, _ = Team.objects.get_or_create(
                    api_id=home_team_data['id'], defaults={'name': home_team_data['name']}
                )
                away_team_obj, _ = Team.objects.get_or_create(
                    api_id=away_team_data['id'], defaults={'name': away_team_data['name']}
                )

                match, created = UpcomingMatch.objects.update_or_create(
                    api_id=api_id,
                    defaults={
                        'home_team': home_team_obj, 'away_team': away_team_obj,
                        'league': league_obj, 'start_datetime': start_datetime,
                        'is_top': is_top,
                    }
                )
                action = 'DODANO' if created else 'ZAKTUALIZOWANO'
                print(f"  {'⭐' if is_top else '  '} {action}: {home_team_obj.name} vs {away_team_obj.name} [{date_str}]")
            except Exception as e:
                print(f"  Błąd przy meczu ID {event.get('id')}: {e}")
                continue


# =============================================================================
#  LAST MATCHES FOR TEAM (Zwiadowca)
# =============================================================================

def fetch_last_matches_for_team(team_api_id: int, n: int = 5) -> list:
    """
    Pobiera ostatnie n meczów drużyny z API i zapisuje TYLKO podstawowe dane.
    NIE pobiera: zdarzeń, składów, statystyk.
    """
    url = f"https://sportapi7.p.rapidapi.com/api/v1/team/{team_api_id}/events/last/0"
    try:
        response = requests.get(url, headers=_api_headers(), timeout=10)
        if response.status_code != 200:
            print(f"Błąd API (team events): {response.status_code}")
            return []
        events = response.json().get('events', [])
    except Exception as e:
        print(f"Błąd połączenia (fetch_last_matches_for_team): {e}")
        return []

    last_events = events[-n:] if len(events) >= n else events
    saved_matches = []

    for event in last_events:
        try:
            league_data = event.get('tournament', {})
            unique_tournament = league_data.get('uniqueTournament', {})
            league_id = unique_tournament.get('id') or league_data['id']
            league_name = unique_tournament.get('name') or league_data.get('name', 'Nieznana Liga')
            category = league_data.get('category', {})
            country_name = category.get('name', 'Inne')

            league, _ = League.objects.get_or_create(
                api_id=league_id,
                defaults={'name': league_name, 'country': country_name},
            )
            home_data = event.get('homeTeam', {})
            away_data = event.get('awayTeam', {})
            home_team, _ = Team.objects.get_or_create(api_id=home_data['id'], defaults={'name': home_data.get('name', 'Nieznana')})
            away_team, _ = Team.objects.get_or_create(api_id=away_data['id'], defaults={'name': away_data.get('name', 'Nieznana')})

            start_ts = event.get('startTimestamp')
            match_date = (datetime.fromtimestamp(start_ts) + timedelta(hours=1)).date() if start_ts else None

            status_desc = event.get('status', {}).get('description', '')
            home_score = event.get('homeScore', {}).get('current', 0) or 0
            away_score = event.get('awayScore', {}).get('current', 0) or 0

            match_obj, _ = LiveMatch.objects.update_or_create(
                api_id=event['id'],
                defaults={
                    'league': league, 'home_team': home_team, 'away_team': away_team,
                    'home_score': home_score, 'away_score': away_score,
                    'status': status_desc, 'match_date': match_date,
                    'country_name': country_name,
                }
            )
            saved_matches.append(match_obj)
            print(f"Zwiadowca: {home_team.name} {home_score}-{away_score} {away_team.name}")
        except Exception as e:
            print(f"Zwiadowca: błąd przy meczu ID {event.get('id')}: {e}")
            continue

    return saved_matches
