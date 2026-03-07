
import os
import requests
from dotenv import load_dotenv
from matches.models import (
    League, Team, LiveMatch, MatchEvent, MatchLineup, Player,
    MissingPlayer, UpcomingMatch, CachedImage, LeagueStandings
)
from datetime import datetime, timedelta
from django.utils.timezone import make_aware
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
# Ładujemy klucze z pliku .env
load_dotenv()


def fetch_player(player_id):
    """Pobiera i zapisuje/aktualizuje dane konkretnego zawodnika z API."""
    
    url = f"https://sportapi7.p.rapidapi.com/api/v1/player/{player_id}"
    headers = {
        "x-rapidapi-key": os.getenv("SPORT_API_KEY"),
        "x-rapidapi-host": os.getenv("SPORT_API_HOST")
    }

    try:
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()  # Automatycznie wyrzuci wyjątek dla błędów np. 404, 500
        
        data = response.json().get('player')
        if not data:
            return None

        team_obj = None
        team_data = data.get('team')
        if team_data and team_data.get('id'):
            team_obj, _ = Team.objects.update_or_create(
                api_id=team_data['id'],
                defaults={'name': team_data.get('name', 'Nieznany')}
            )

        def parse_ts(timestamp):
            return datetime.fromtimestamp(timestamp).date() if timestamp else None

        defaults = {
            'name': data.get('name', ''),
            'first_name': data.get('firstName'),
            'last_name': data.get('lastName'),
            'position': data.get('position'),
            'jersey_number': data.get('jerseyNumber') or data.get('shirtNumber'),
            'height': data.get('height'),
            'preferred_foot': data.get('preferredFoot'),
            'market_value': data.get('marketValue'),
            'date_of_birth': parse_ts(data.get('dateOfBirthTimestamp')),
            'contract_until': parse_ts(data.get('contractUntilTimestamp')),
            'nationality': data.get('country', {}).get('name'), # Bezpieczne wyciąganie z zagnieżdżonego słownika
            'retired': data.get('retired', False),
            'team': team_obj
        }

        player_obj, created = Player.objects.update_or_create(
            api_id=player_id,
            defaults=defaults
        )
        
        return player_obj

    except requests.exceptions.RequestException as e:
        print(f"Błąd połączenia API dla zawodnika {player_id}: {e}")
        return None
    except Exception as e:
        print(f"Niespodziewany błąd przy fetch_player {player_id}: {e}")
        return None

# =============================================================================
#  WYSZUKIWARKA ZAWODNIKÓW W API
# =============================================================================

def search_players_from_api(query: str) -> list:
    """
    Szuka zawodników w zewnętrznym API po nazwie, używając dedykowanego endpointu.
    Zapisuje podstawowe dane do lokalnej tabeli Player.
    """
    import os
    import requests
    from .models import Player

    # Używamy dokładnie tego endpointu, który znalazłeś (zabezpieczony w .env)
    url = f"https://sportapi7.p.rapidapi.com/api/v1/search/players/{query}/more"

    headers = {
        "x-rapidapi-key": os.getenv("SPORT_API_KEY"),
        "x-rapidapi-host": os.getenv("SPORT_API_HOST", "sportapi7.p.rapidapi.com"),
    }

    try:
        response = requests.get(url, headers=headers, timeout=10)
        
        # Jeśli API z jakiegoś powodu nie wspiera "/more" dla tego zapytania, 
        # próbujemy uderzyć w podstawowy endpoint szukania zawodników
        if response.status_code != 200:
            url = f"https://sportapi7.p.rapidapi.com/api/v1/search/players/{query}"
            response = requests.get(url, headers=headers, timeout=10)

        if response.status_code == 200:
            data = response.json()
            # Zależnie od odpowiedzi, API może to ułożyć w kluczu 'results' lub 'players'
            results = data.get('results', []) or data.get('players', []) or []
        else:
            print(f"Błąd wyszukiwania zawodnika API: {response.status_code}")
            return []

    except Exception as e:
        print(f"Wyjątek wyszukiwania zawodnika API: {e}")
        return []

    players = []
    for row in results:
        # Endpointy dedykowane potrafią zwracać gracza od razu na najwyższym poziomie,
        # lub chować go w słowniku 'entity'. Sprawdzamy oba scenariusze:
        entity = row.get('entity') if 'entity' in row else row
        
        api_id = entity.get('id')
        name = entity.get('name', '').strip()

        if not api_id or not name:
            continue

        # Zapisujemy do bazy tylko "wizytówkę"
        player_obj, created = Player.objects.get_or_create(
            api_id=api_id,
            defaults={
                'name': name,
                'first_name': entity.get('firstName'),
                'last_name': entity.get('lastName'),
                'position': entity.get('position')
            }
        )
        players.append(player_obj)

    return players

def fetch_live_matches():
    """KROK 1: Pobiera listę meczów na żywo"""
    url = "https://sportapi7.p.rapidapi.com/api/v1/sport/football/events/live"

    headers = {
        "x-rapidapi-key": os.getenv("SPORT_API_KEY"),
        "x-rapidapi-host": os.getenv("SPORT_API_HOST")
    }

    try:
        response = requests.get(url, headers=headers, timeout=10)
        if response.status_code == 200:
            return response.json()
        print(f"Błąd API (Live Matches): {response.status_code}")
        return None
    except Exception as e:
        print(f"Błąd połączenia: {e}")
        return None

def fetch_upcoming_matches():
    """KROK 1: Pobiera listę meczów które odbędą się danego dnia"""
    url = "https://sportapi7.p.rapidapi.com/api/v1/sport/football/scheduled-events/{date}"

    headers = {
        "x-rapidapi-key": os.getenv("SPORT_API_KEY"),
        "x-rapidapi-host": os.getenv("SPORT_API_HOST")
    }

    date = datetime.now().strftime("%Y-%m-%d")
    url = url.format(date=date)
    response = requests.get(url, headers=headers)
    if response.status_code == 200:
        data = response.json()
        events = data.get('events', [])
        
        # Wyczyść poprzednie nadchodzące mecze, żeby nie gromadziły się z poprzednich dni
        UpcomingMatch.objects.all().delete()
        print("Wyczyszczono stare nadchodzące mecze.")
        
        upcoming_top_matches = []   
        print("Nadchodzące hity dzisiejszego dnia:")
        for event in events:
            status_type = event['status']['type']
            filters = event.get('eventFilters', {})
            levels = filters.get('level', [])
            # Sprawdzamy, czy mecz się jeszcze nie zaczął
            if status_type == 'notstarted':
                is_top = 'top-competitions' in levels
                api_id = event['id']
                start_timestamp = event['startTimestamp']
                start_datetime = make_aware(datetime.fromtimestamp(start_timestamp) + timedelta(hours=1))
               
                league_data = event['tournament']
                league_obj, _ = League.objects.get_or_create(
                    api_id=league_data['id'],
                    defaults={'name': league_data['name']}
                )

                home_team_data = event['homeTeam']
                home_team_obj, _ = Team.objects.get_or_create(
                    api_id=home_team_data['id'],
                    defaults={'name': home_team_data['name']}
                )
                
                away_team_data = event['awayTeam']
                away_team_obj, _ = Team.objects.get_or_create(
                    api_id=away_team_data['id'],
                    defaults={'name': away_team_data['name']}
                )
                
                match, created = UpcomingMatch.objects.update_or_create(
                    api_id=api_id,
                    defaults={
                        'home_team': home_team_obj,
                        'away_team': away_team_obj,
                        'league': league_obj,
                        'start_datetime': start_datetime,
                        'is_top': is_top,
                    }
                )
                if created:
                    print(f"{'⭐' if is_top else '  '} DODANO: {home_team_obj.name} vs {away_team_obj.name}")
                else:
                    print(f"{'⭐' if is_top else '  '} ZAKTUALIZOWANO: {home_team_obj.name} vs {away_team_obj.name}")

def _check_new_incidents(match_obj, api_match_id, home_team, away_team, channel_layer, room_group_name):
    """
    Pobiera zdarzenia (incidents) z API dla obserwowanego meczu.
    Porównuje event_id z tymi już w DB → nowe kartki/zmiany → wysyła WS notification.
    Wywoływana TYLKO dla meczów z aktywnymi subskrypcjami.
    """
    from .models import MatchEvent

    incidents_url = f"https://sportapi7.p.rapidapi.com/api/v1/event/{api_match_id}/incidents"
    headers = {
        "x-rapidapi-key": os.getenv("SPORT_API_KEY"),
        "x-rapidapi-host": os.getenv("SPORT_API_HOST")
    }

    try:
        resp = requests.get(incidents_url, headers=headers, timeout=10)
        if resp.status_code != 200:
            return
        incidents = resp.json().get('incidents', [])
    except Exception as e:
        print(f"Błąd pobierania incidentów dla meczu {api_match_id}: {e}")
        return

    # ID zdarzeń już w bazie
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

        # Kartki
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
                {
                    'type': 'match_event',
                    'event_type': 'card',
                    'icon': icon,
                    'message': f"{label}: {player} ({team_name}) {minute}'",
                }
            )

        # Zmiany zawodników
        elif inc_type == 'substitution':
            player_in = inc.get('playerIn', {}).get('name', '?')
            player_out = inc.get('playerOut', {}).get('name', '?')

            async_to_sync(channel_layer.group_send)(
                room_group_name,
                {
                    'type': 'match_event',
                    'event_type': 'substitution',
                    'icon': '🔄',
                    'message': f"Zmiana ({team_name}) {minute}': ⬆️ {player_in}  ⬇️ {player_out}",
                }
            )

        # Zapisujemy event do DB żeby nie wysyłać go ponownie
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


def sync_live_matches():
    """KROK 2: Zapisuje mecze do bazy (bez zmian w logice)"""
    data = fetch_live_matches()

    if not data or 'events' not in data:
        print("Brak danych do zsynchronizowania.")
        return

    count = 0
    for event in data['events']:
        try:
            # 1. Liga + Kraj z tournament.category
            league_data = event['tournament']
            category = league_data.get('category', {})
            country_name = category.get('name', 'Inne')
            country_alpha2 = category.get('alpha2', '')

            league, created = League.objects.get_or_create(
                api_id=league_data['id'],
                defaults={
                    'name': league_data['name'],
                    'country': country_name,
                }
            )
            # Aktualizuj kraj i nazwę jeśli liga już istnieje
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

            # 2. Drużyny
            home_data = event['homeTeam']
            away_data = event['awayTeam']

            home_team, _ = Team.objects.get_or_create(
                api_id=home_data['id'],
                defaults={'name': home_data['name']}
            )
            away_team, _ = Team.objects.get_or_create(
                api_id=away_data['id'],
                defaults={'name': away_data['name']}
            )

            # 3. Mecz – czas z API
            from datetime import datetime, timedelta

            status_data = event.get('status', {})
            status_desc = status_data.get('description', '')
            start_ts = event.get('startTimestamp')
            match_date = (datetime.fromtimestamp(start_ts) + timedelta(hours=1)).date() if start_ts else None

            # CZAS MECZU – prosto z API
            # event['time'] zawiera currentPeriodStartTimestamp + initial
            # (UWAGA: to event['time'], NIE event['status']['time']!)
            time_data = event.get('time', {})
            if not isinstance(time_data, dict):
                time_data = {}

            period_start_ts = time_data.get('currentPeriodStartTimestamp')
            initial_min = (time_data.get('initial', 0) or 0) // 60  # API zwraca sekundy! 2700 → 45 min

            # Jeśli mamy period_start_ts → zapisz do match_time, JS obliczy minutę sam
            # Jeśli nie → minute = 0, JS pokaże statyczną wartość
            if period_start_ts:
                minute_to_save = initial_min
                match_time_to_save = str(int(period_start_ts))
            else:
                minute_to_save = 0
                match_time_to_save = ''

            home_score = event['homeScore'].get('current', 0)
            away_score = event['awayScore'].get('current', 0)

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
            }
            try:
                old_match = LiveMatch.objects.get(api_id=event['id'])
                
                channel_layer = get_channel_layer()
                room_group_name = f'match_{event["id"]}'

                # ── BRAMKI ── (wykrywane przez porównanie wyniku — zero dodatkowych API calls)
                if old_match.home_score < home_score or old_match.away_score < away_score:
                    print(f"🔔 BRAMKA WYKRYTA! {home_team.name} {old_match.home_score}→{home_score} - {old_match.away_score}→{away_score} {away_team.name}")
                    try:
                        async_to_sync(channel_layer.group_send)(
                            room_group_name,
                            {
                                'type': 'match_event',
                                'event_type': 'goal',
                                'icon': '⚽',
                                'message': f'GOOOOL! {home_team.name} {home_score} - {away_score} {away_team.name}',
                                'home_score': home_score,
                                'away_score': away_score,
                                'status': status_desc,
                            }
                        )
                        print(f"  ✅ Wysłano WS do grupy {room_group_name}")
                    except Exception as ws_err:
                        print(f"  ❌ Błąd wysyłki WS: {ws_err}")

                # ── ZMIANA STATUSU / OKRESU ── (np. Przerwa, Koniec meczu)
                if old_match.status != status_desc and status_desc:
                    period_icons = {
                        'Halftime': '⏸️', 'Ended': '🏁',
                        '2nd Half': '▶️', 'Extra Time 1st Half': '⏱️',
                        'Penalties': '🎯',
                    }
                    icon = period_icons.get(status_desc, '⏱️')
                    print(f"⏱️ ZMIANA STATUSU: {home_team.name} vs {away_team.name} — {old_match.status} → {status_desc}")
                    try:
                        async_to_sync(channel_layer.group_send)(
                            room_group_name,
                            {
                                'type': 'match_event',
                                'event_type': 'period',
                                'icon': icon,
                                'message': f'{home_team.name} vs {away_team.name} — {status_desc}',
                                'home_score': home_score,
                                'away_score': away_score,
                                'status': status_desc,
                                'is_ended': status_desc == 'Ended',
                            }
                        )
                        print(f"  ✅ Wysłano WS status do grupy {room_group_name}")
                    except Exception as ws_err:
                        print(f"  ❌ Błąd wysyłki WS status: {ws_err}")

                # ── KARTKI I ZMIANY ── (dodatkowe API call, ALE tylko dla obserwowanych meczów!)
                from .models import MatchSubscription
                has_subscribers = MatchSubscription.objects.filter(match=old_match).exists()
                
                if has_subscribers:
                    _check_new_incidents(old_match, event['id'], home_team, away_team, channel_layer, room_group_name)

            except LiveMatch.DoesNotExist:
                pass  # Meczu nie było w bazie, nie wysyłamy powiadomienia

            LiveMatch.objects.update_or_create(
                api_id=event['id'],
                defaults=defaults
            )
            count += 1
        except Exception as e:
            print(f"Błąd przy zapisie meczu ID {event.get('id')}: {e}")
            continue

    print(f"Zakończono! Zsynchronizowano {count} meczów.")

    # ==========================================
    # AUTO-ZAKOŃCZENIE – mecze których API już nie zwraca
    # ==========================================
    # Zbieramy api_id wszystkich meczów które API nadal zwraca jako live
    live_api_ids = {event['id'] for event in data['events']}

    # Mecze w bazie z "live" statusem, ale NIE obecne w API → zakończone
    stale_matches = LiveMatch.objects.filter(
        status__iregex=r'(half|halftime|extra|break|live|progress|period)'
    ).exclude(api_id__in=live_api_ids)

    ended_count = stale_matches.update(status='Ended')
    if ended_count:
        print(f"Auto-zakończono {ended_count} meczów (nie ma ich już w API live).")


# =============================================================================
#  MAPOWANIE ZDARZEŃ (INCIDENTS) – pełna obsługa wszystkich typów
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
    """Mapuje zdarzenie typu 'goal'."""
    return {
        'player_name': _safe_nested(item, 'player', 'name') or item.get('playerName', ''),
        'assist_player_name': _safe_nested(item, 'assist1', 'name') or item.get('assist1Name'),
        'assist2_player_name': _safe_nested(item, 'assist2', 'name') or item.get('assist2Name'),
        'home_score': item.get('homeScore'),
        'away_score': item.get('awayScore'),
        'incident_class': item.get('incidentClass'),  # regular, ownGoal, penalty, missedPenalty
    }


def _map_card(item):
    """Mapuje zdarzenie typu 'card'."""
    return {
        'player_name': _safe_nested(item, 'player', 'name') or item.get('playerName', ''),
        'incident_class': item.get('incidentClass'),  # yellow, yellowRed, red
        'reason': item.get('reason'),
        'rescinded': item.get('rescinded', False),
    }


def _map_substitution(item):
    """Mapuje zdarzenie typu 'substitution'."""
    
    player_in = item.get('playerIn', {}) or {}
    player_out = item.get('playerOut', {}) or {}
    
    in_name = player_in.get('name') or item.get('playerNameIn', '')
    out_name = player_out.get('name') or item.get('playerNameOut', '')

    return {
        'player_in_name': in_name,
        'player_out_name': out_name,
        'player_name': in_name,  # Główny gracz powiązany ze zdarzeniem to ten wchodzący
        'injury': item.get('injury', False) or False,
    }


def _map_period(item):
    """Mapuje zdarzenie typu 'period' (HT, FT, itp.)."""
    return {
        'text': item.get('text'),
        'home_score': item.get('homeScore'),
        'away_score': item.get('awayScore'),
        'is_live': item.get('isLive', False),
    }


def _map_injury_time(item):
    """Mapuje zdarzenie typu 'injuryTime'."""
    return {
        'length': item.get('length'),
    }


def _map_var_decision(item):
    """Mapuje zdarzenie typu 'varDecision'."""
    return {
        'player_name': _safe_nested(item, 'player', 'name') or item.get('playerName', ''),
        'incident_class': item.get('incidentClass'),
        'confirmed': item.get('confirmed'),
    }


# Dispatcher: typ zdarzenia → funkcja mapująca
INCIDENT_MAPPERS = {
    'goal': _map_goal,
    'card': _map_card,
    'substitution': _map_substitution,
    'period': _map_period,
    'injuryTime': _map_injury_time,
    'varDecision': _map_var_decision,
}


def _map_incident(item):
    """Mapuje pojedyncze zdarzenie z JSON-a na słownik pól modelu MatchEvent."""
    i_type = item.get('incidentType', '')

    # Wspólne pola dla każdego zdarzenia
    base = {
        'incident_type': i_type,
        'event_id': str(item.get('id', '')),
        'time': item.get('time', 0) or 0,
        'added_time': item.get('addedTime') or 0,
    }

    # isHome – API zwraca bool lub null
    is_home = item.get('isHome')
    base['is_home_team'] = is_home if is_home is not None else True

    # Pola specyficzne dla typu
    mapper = INCIDENT_MAPPERS.get(i_type)
    if mapper:
        base.update(mapper(item))
    else:
        # Nieznany typ – zapisujemy co możemy
        base['player_name'] = _safe_nested(item, 'player', 'name') or ''
        base['text'] = item.get('text')
        base['incident_class'] = item.get('incidentClass')

    return base


# =============================================================================
#  FETCH MATCH DETAILS – pobieranie zdarzeń i składów
# =============================================================================

def fetch_match_details(local_match_id, api_match_id):
    """
    KROK 3: Pobiera szczegóły meczu (Zdarzenia + Składy).
    Pełne mapowanie JSON → model z obsługą wszystkich typów zdarzeń.
    """
    try:
        match = LiveMatch.objects.get(id=local_match_id)
    except LiveMatch.DoesNotExist:
        print(f"Mecz o ID {local_match_id} nie istnieje w lokalnej bazie.")
        return False

    headers = {
        "x-rapidapi-key": os.getenv("SPORT_API_KEY"),
        "x-rapidapi-host": "sportapi7.p.rapidapi.com"
    }

    # ==========================================
    # 0. POBIERANIE STANU MECZU (Event details)
    # → time.current = dokładna aktualna minuta meczu
    # → status.description = aktualny status (1st half, 2nd half, HT, Ended...)
    # → homeScore/awayScore = aktualny wynik
    # ==========================================
    event_url = f"https://sportapi7.p.rapidapi.com/api/v1/event/{api_match_id}"
    print(f"Pobieram stan meczu API ID: {api_match_id}...")

    try:
        response_ev = requests.get(event_url, headers=headers, timeout=10)

        if response_ev.status_code == 200:
            ev_data = response_ev.json().get('event', {})

            # Dane czasu meczu
            time_data = ev_data.get('time', {})
            period_start_ts = time_data.get('currentPeriodStartTimestamp')  # Unix timestamp startu okresu
            initial_min = (time_data.get('initial', 0) or 0) // 60          # API zwraca sekundy! 2700 → 45 min

            # Obliczamy bieżącą minutę (do wyświetlenia i jako fallback)
            if period_start_ts:
                import time as _time
                elapsed = int((_time.time() - period_start_ts) / 60)
                exact_minute = initial_min + elapsed
            else:
                exact_minute = time_data.get('current') or time_data.get('played') or 0

            # Status
            status_info = ev_data.get('status', {})
            new_status = status_info.get('description', '')

            # Wynik
            home_score = ev_data.get('homeScore', {}).get('current')
            away_score = ev_data.get('awayScore', {}).get('current')

            # Zapisujemy
            update_fields = []

            # Kluczowe: zapisz period_start_timestamp w match_time (js użyje go do obliczenia minuty)
            # oraz initial_min w minute (bazowa minuta okresu: 0 dla 1. połowy, 45 dla 2. połowy)
            if period_start_ts:
                match.match_time = str(period_start_ts)   # np. "1709000000"
                match.minute = initial_min                  # 0 lub 45 (lub 90 dla dogrywki)
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
                print(f"  Stan meczu: {exact_minute}' (period_start={period_start_ts}, initial={initial_min}) | {new_status} | {home_score}-{away_score}")
        else:
            print(f"Błąd API Event: {response_ev.status_code}")

    except Exception as e:
        print(f"Wyjątek przy pobieraniu stanu meczu: {e}")

    # ==========================================
    # 1. POBIERANIE ZDARZEŃ (Incidents)
    # ==========================================
    incidents_url = f"https://sportapi7.p.rapidapi.com/api/v1/event/{api_match_id}/incidents"
    print(f"Pobieram zdarzenia dla meczu API ID: {api_match_id}...")

    try:
        response_inc = requests.get(incidents_url, headers=headers, timeout=10)

        if response_inc.status_code == 200:
            data = response_inc.json()
            incidents = data.get('incidents', [])
            created_count = 0

            for item in incidents:
                mapped = _map_incident(item)

                # Unikanie duplikatów po event_id
                event_id = mapped.pop('event_id', None)
                if event_id:
                    _, created = MatchEvent.objects.update_or_create(
                        match=match,
                        event_id=event_id,
                        defaults=mapped
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

    # ==========================================
    # 2. POBIERANIE SKŁADÓW (Lineups)
    # ==========================================
    lineups_url = f"https://sportapi7.p.rapidapi.com/api/v1/event/{api_match_id}/lineups"

    try:
        response_lin = requests.get(lineups_url, headers=headers, timeout=10)

        if response_lin.status_code == 200:
            data = response_lin.json()

            # Zapisz formacje
            home_formation = data.get('home', {}).get('formation')
            away_formation = data.get('away', {}).get('formation')
            if home_formation or away_formation:
                if home_formation:
                    match.home_formation = home_formation
                if away_formation:
                    match.away_formation = away_formation
                match.save()
                print(f"Formacje: {home_formation} vs {away_formation}")

            def _save_players(players_list, is_home):
                count = 0
                for p in players_list:
                    player_info = p.get('player', {})
                    statistics = p.get('statistics', {})

                    # Sprawdź flagę substitute lub pozycję "S" (Substitute)
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

            def _save_missing_players(missing_list, is_home):
                count = 0
                if not missing_list:
                    return 0

                for item in missing_list:
                    player_info = item.get('player', {})
                    if not player_info:
                        continue

                    MissingPlayer.objects.get_or_create(
                        match=match,
                        player_name=player_info.get('name', 'Nieznany'),
                        is_home_team=is_home,
                        defaults={
                            'type': item.get('type', 'missing'),
                            'reason': str(item.get('reason', '')),
                        }
                    )
                    count += 1
                return count

            # --- GOSPODARZE ---
            home_data = data.get('home', {})
            home_players = home_data.get('players', [])
            home_missing = home_data.get('missingPlayers', [])

            home_count = _save_players(home_players, is_home=True)
            home_missing_count = _save_missing_players(home_missing, is_home=True)

            # --- GOŚCIE ---
            away_data = data.get('away', {})
            away_players = away_data.get('players', [])
            away_missing = away_data.get('missingPlayers', [])

            away_count = _save_players(away_players, is_home=False)
            away_missing_count = _save_missing_players(away_missing, is_home=False)

            print(f"Zapisano składy (Home: {home_count}, Away: {away_count})")
            print(f"Zapisano brakujących graczy (Home: {home_missing_count}, Away: {away_missing_count})")

    except Exception as e:
        print(f"Wyjątek przy pobieraniu składów: {e}")

    # ==========================================
    # 3. POBIERANIE STATYSTYK
    # ==========================================
    url_stats = f"https://sportapi7.p.rapidapi.com/api/v1/event/{api_match_id}/statistics"

    try:
        response_stats = requests.get(url_stats, headers=headers, timeout=10)

        if response_stats.status_code == 200:
            stats_data = response_stats.json().get('statistics', [])
            match.stats_json = stats_data
            match.save()
            print("Zapisano statystyki meczowe.")
        else:
            print(f"Błąd API Statistics: {response_stats.status_code}")

    except Exception as e:
        print(f"Wyjątek przy pobieraniu statystyk: {e}")

    return True


# =============================================================================
#  MECHANIZM 2 – ZWIADOWCA
#  Pobiera ostatnie n meczów drużyny (tylko podstawowe dane, BEZ detali)
# =============================================================================

def fetch_last_matches_for_team(team_api_id: int, n: int = 3) -> list:
    """
    Zwiadowca: Pobiera ostatnie n meczów drużyny z API i zapisuje TYLKO
    podstawowe informacje (kto z kim, wynik, api_id, data, liga).
    NIE pobiera: zdarzeń, składów, statystyk – to jest zadanie Wydobywcy.

    Zwraca listę obiektów LiveMatch (zapisanych/zaktualizowanych).
    """
    url = f"https://sportapi7.p.rapidapi.com/api/v1/team/{team_api_id}/events/last/0"

    headers = {
        "x-rapidapi-key": os.getenv("SPORT_API_KEY"),
        "x-rapidapi-host": os.getenv("SPORT_API_HOST", "sportapi7.p.rapidapi.com"),
    }

    try:
        response = requests.get(url, headers=headers, timeout=10)
        if response.status_code != 200:
            print(f"Błąd API (team events): {response.status_code}")
            return []
        events = response.json().get('events', [])
    except Exception as e:
        print(f"Błąd połączenia (fetch_last_matches_for_team): {e}")
        return []

    # Bierzemy ostatnie n meczów (API zwraca w kolejności rosnącej)
    last_events = events[-n:] if len(events) >= n else events

    from datetime import datetime
    saved_matches = []

    for event in last_events:
        try:
            # --- Liga ---
            league_data = event.get('tournament', {})
            category = league_data.get('category', {})
            country_name = category.get('name', 'Inne')

            league, _ = League.objects.get_or_create(
                api_id=league_data['id'],
                defaults={
                    'name': league_data.get('name', 'Nieznana Liga'),
                    'country': country_name,
                }
            )

            # --- Drużyny ---
            home_data = event.get('homeTeam', {})
            away_data = event.get('awayTeam', {})

            home_team, _ = Team.objects.get_or_create(
                api_id=home_data['id'],
                defaults={'name': home_data.get('name', 'Nieznana')}
            )
            away_team, _ = Team.objects.get_or_create(
                api_id=away_data['id'],
                defaults={'name': away_data.get('name', 'Nieznana')}
            )

            # --- Data meczu ---
            start_ts = event.get('startTimestamp')
            match_date = (datetime.fromtimestamp(start_ts) + timedelta(hours=1)).date() if start_ts else None

            # --- Status i wynik ---
            status_data = event.get('status', {})
            status_desc = status_data.get('description', '')
            home_score = event.get('homeScore', {}).get('current', 0) or 0
            away_score = event.get('awayScore', {}).get('current', 0) or 0

            # --- Zapisujemy TYLKO podstawowe dane (bez detali!) ---
            match_obj, _ = LiveMatch.objects.update_or_create(
                api_id=event['id'],
                defaults={
                    'league': league,
                    'home_team': home_team,
                    'away_team': away_team,
                    'home_score': home_score,
                    'away_score': away_score,
                    'status': status_desc,
                    'match_date': match_date,
                    'country_name': country_name,
                }
            )
            saved_matches.append(match_obj)
            print(f"Zwiadowca: zapisano {home_team.name} {home_score}-{away_score} {away_team.name}")

        except Exception as e:
            print(f"Zwiadowca: błąd przy meczu ID {event.get('id')}: {e}")
            continue

    return saved_matches


# =============================================================================
#  WYSZUKIWARKA DRUŻYN W API
#  Wywoływana TYLKO gdy brak wyników w lokalnej bazie.
# =============================================================================

def search_teams_from_api(query: str) -> list:
    """
    Szuka drużyn w zewnętrznym API po nazwie (endpoint /api/v1/search/{query}).
    Zapisuje znalezione drużyny do lokalnej tabeli Team (tylko id + name).
    Zwraca listę obiektów Team.

    UWAGA: NIE pobiera meczów – to zrobi Zwiadowca dopiero przy wejściu na stronę drużyny.
    """
    # Próbujemy różne formaty URL – SofaScore zmienia endpointy
    urls_to_try = [
        f"https://sportapi7.p.rapidapi.com/api/v1/search/all?q={query}",
        f"https://sportapi7.p.rapidapi.com/api/v1/search/multi?query={query}",
        f"https://sportapi7.p.rapidapi.com/api/v1/search/{query}",
    ]

    headers = {
        "x-rapidapi-key": os.getenv("SPORT_API_KEY"),
        "x-rapidapi-host": os.getenv("SPORT_API_HOST", "sportapi7.p.rapidapi.com"),
    }

    try:
        results = []
        for url in urls_to_try:
            response = requests.get(url, headers=headers, timeout=8)
            if response.status_code == 200:
                data = response.json()
                results = data.get('results', []) or data.get('teams', []) or []
                if results:
                    print(f"API Search OK: {url}")
                    break
            else:
                print(f"API Search próba {url}: {response.status_code}")
        if not results:
            print(f"API Search: brak wyników dla '{query}'")
            return []
    except Exception as e:
        print(f"API Search wyjątek: {e}")
        return []

    teams = []
    for row in results:
        # Interesują nas tylko encje typu 'team' (nie player, tournament itp.)
        if row.get('type') != 'team':
            continue

        entity = row.get('entity', {})
        api_id = entity.get('id')
        name   = entity.get('name', '').strip()

        if not api_id or not name:
            continue

        # Zapisz do bazy (lub pobierz jeśli już jest)
        team, created = Team.objects.get_or_create(
            api_id=api_id,
            defaults={'name': name}
        )
        if created:
            print(f"API Search: zapisano nową drużynę '{name}' (api_id={api_id})")

        teams.append(team)

    return teams


# # =============================================================================
#  TABELA LIGI
#  Wywoływana TYLKO gdy brak wyników w lokalnej bazie.
# =============================================================================

def fetch_league_standings(tournament_id: int, season_id: str = None, local_league_id: int = None) -> list:
    """
    Pobiera tabelę ligi z API i aktualizuje lub tworzy wpisy w modelu LeagueStandings.
    """
    headers = {
        "x-rapidapi-key": os.getenv("SPORT_API_KEY"),
        "x-rapidapi-host": os.getenv("SPORT_API_HOST", "sportapi7.p.rapidapi.com"),
    }

    try:
        # 1. Automatyczne rozwiązanie ID sezonu, jeśli nie podano w argumencie
        if not season_id:
            season_url = f"https://sportapi7.p.rapidapi.com/api/v1/unique-tournament/{tournament_id}/seasons"
            resp_seasons = requests.get(season_url, headers=headers)
            if resp_seasons.status_code == 200:
                seasons = resp_seasons.json().get('seasons', [])
                if seasons:
                    season_id = seasons[0].get('id')
            
            if not season_id:
                print(f"API API błąd: Nie udało się pobrać aktualnego sezonu dla turnieju {tournament_id}")
                return []

        # 2. Pobieranie tabeli ligowej
        url = f"https://sportapi7.p.rapidapi.com/api/v1/unique-tournament/{tournament_id}/season/{season_id}/standings/total"
        response = requests.get(url, headers=headers, timeout=8)
        if response.status_code != 200:
            print(f"API League Standings błąd: {response.status_code}")
            return []

        data = response.json()
        standings = data.get('standings', [])
        # Próba wyciągnięcia prawdziwej nazwy ligi i kraju z pierwszej tabeli
        league_name = f"Liga {tournament_id}"
        league_country = ""
        
        if standings and 'tournament' in standings[0]:
            tourn_data = standings[0]['tournament']
            league_name = tourn_data.get('name', league_name)
            category_data = tourn_data.get('category', {})
            league_country = category_data.get('name', "")

        # Używamy local_league_id, w przeciwnym razie tournament_id (SportAPI unique ID)
        target_league_id = local_league_id if local_league_id is not None else tournament_id

        league, created = League.objects.update_or_create(
            api_id=target_league_id,
            defaults={
                'name': league_name,
                'country': league_country
            }
        )
        if created:
            print(f"Utworzono ligę: {league.name}")
        else:
            print(f"Zaktualizowano ligę: {league.name} ({league_country})")

        for standing in standings:
            for row in standing.get('rows', []):
                team_id = row['team']['id']
                team_name = row['team']['name']
                position = row.get('position')
                points = row.get('points')
                matches_played = row.get('matches') or 0
                matches_won = row.get('wins') or 0
                matches_drawn = row.get('draws') or 0
                matches_lost = row.get('losses') or 0
                goals_for = row.get('scoresFor') or 0
                goals_against = row.get('scoresAgainst') or 0
                goal_difference = goals_for - goals_against

                team, team_created = Team.objects.get_or_create(
                    api_id=team_id, 
                    defaults={'name': team_name}
                )
                if team_created:
                    print(f"Utworzono drużynę: {team}")

                LeagueStandings.objects.update_or_create(
                    league=league,
                    team=team,
                    defaults={
                        'position': position,
                        'points': points,
                        'matches_played': matches_played,
                        'matches_won': matches_won,
                        'matches_drawn': matches_drawn,
                        'matches_lost': matches_lost,
                        'goals_for': goals_for,
                        'goals_against': goals_against,
                        'goal_difference': goal_difference,
                    }
                )

        print(f"Zaktualizowano tabelę ligi: {league}")
        return LeagueStandings.objects.filter(league=league)

    except Exception as e:
        print(f"API League Standings wyjątek: {e}")
        return []