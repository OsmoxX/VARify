import os
import requests
from dotenv import load_dotenv
from .models import LiveMatch, Team, League, MatchEvent, MatchLineup

# Ładujemy klucze z pliku .env
load_dotenv()


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

            # 3. Mecz
            LiveMatch.objects.update_or_create(
                api_id=event['id'],
                defaults={
                    'league': league,
                    'home_team': home_team,
                    'away_team': away_team,
                    'home_score': event['homeScore'].get('current', 0),
                    'away_score': event['awayScore'].get('current', 0),
                    'status': event['status']['description'],
                    'country_name': country_name,
                }
            )
            count += 1
        except Exception as e:
            print(f"Błąd przy zapisie meczu ID {event.get('id')}: {e}")
            continue

    print(f"Zakończono! Zsynchronizowano {count} meczów.")


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
    return {
        'player_in_name': _safe_nested(item, 'playerIn', 'name') or item.get('playerNameIn', ''),
        'player_out_name': _safe_nested(item, 'playerOut', 'name') or item.get('playerNameOut', ''),
        'player_name': _safe_nested(item, 'playerIn', 'name') or item.get('playerNameIn', ''),
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

    # Ochrona limitu API: Jeśli mamy dane, nie pobieramy ponownie
    if match.events.exists() or match.lineups.exists():
        print(f"Mecz {match} ma już dane. Pomijam.")
        return True

    headers = {
        "x-rapidapi-key": os.getenv("SPORT_API_KEY"),
        "x-rapidapi-host": "sportapi7.p.rapidapi.com"
    }

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
                    _, created = MatchEvent.objects.get_or_create(
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

            def _save_players(players_list, is_home):
                count = 0
                for p in players_list:
                    player_info = p.get('player', {})
                    statistics = p.get('statistics', {})

                    MatchLineup.objects.get_or_create(
                        match=match,
                        player_name=player_info.get('name', 'Nieznany'),
                        is_home_team=is_home,
                        defaults={
                            'player_api_id': player_info.get('id'),
                            'shirt_number': player_info.get('jerseyNumber') or p.get('shirtNumber'),
                            'position': player_info.get('position'),
                            'is_starting_xi': not p.get('substitute', False),
                            'is_captain': p.get('captain', False) or False,
                            'avg_rating': statistics.get('rating'),
                        }
                    )
                    count += 1
                return count

            # --- GOSPODARZE ---
            home_players = data.get('home', {}).get('players', [])
            home_count = _save_players(home_players, is_home=True)

            # --- GOŚCIE ---
            away_players = data.get('away', {}).get('players', [])
            away_count = _save_players(away_players, is_home=False)

            print(f"Zapisano składy (Home: {home_count}, Away: {away_count})")

    except Exception as e:
        print(f"Wyjątek przy pobieraniu składów: {e}")

    return True