"""
services/match_service.py

Handles all live-match syncing, match detail fetching, incident parsing,
lineup saving, and retrieving historical match data for a team.
"""

import os
import time as _time
from datetime import datetime, timedelta

from matches.services.api_tracker import api_get
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.utils.timezone import make_aware

from matches.models import (
    League,
    LiveMatch,
    MatchEvent,
    MatchLineup,
    MissingPlayer,
    Team,
    UpcomingMatch,
)

# ─── Top leagues whitelist (SportAPI/Sofascore unique-tournament IDs) ──────────
# UWAGA: W modelu League api_id to CharField, więc używamy stringów!
PREMIUM_LEAGUE_IDS = {
    # Europejskie puchary
    "7", "679", "1703",
    # Top 5 lig
    "17", "8", "23", "35", "34",
    # Kolejne ligi europejskie
    "37", "238", "18", "52", "53", "44", "36", "54", "24", "40",
    "60", "329", "547", "67", "200", "210",
    # Puchary krajowe
    "3", "336", "137", "98", "89", "570", "345", "90",
    # Puchary kontynentalne poza Europą
    "384", "480",
    # Ligi poza Europą
    "1346", "955",  # Saudi Pro League (dwa znane ID z API)
    "242",          # MLS
    "325",          # Brasileirao
    "230",          # Liga MX
    # Polska
    "202",          # Ekstraklasa
}


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
        "player_name": _safe_nested(item, "player", "name")
        or item.get("playerName", ""),
        "assist_player_name": _safe_nested(item, "assist1", "name")
        or item.get("assist1Name"),
        "assist2_player_name": _safe_nested(item, "assist2", "name")
        or item.get("assist2Name"),
        "home_score": item.get("homeScore"),
        "away_score": item.get("awayScore"),
        "incident_class": item.get("incidentClass"),
    }


def _map_card(item):
    return {
        "player_name": _safe_nested(item, "player", "name")
        or item.get("playerName", ""),
        "incident_class": item.get("incidentClass"),
        "reason": item.get("reason"),
        "rescinded": item.get("rescinded", False),
    }


def _map_substitution(item):
    player_in = item.get("playerIn", {}) or {}
    player_out = item.get("playerOut", {}) or {}
    in_name = player_in.get("name") or item.get("playerNameIn", "")
    out_name = player_out.get("name") or item.get("playerNameOut", "")
    return {
        "player_in_name": in_name,
        "player_out_name": out_name,
        "player_name": in_name,
        "injury": item.get("injury", False) or False,
    }


def _map_period(item):
    return {
        "text": item.get("text"),
        "home_score": item.get("homeScore"),
        "away_score": item.get("awayScore"),
        "is_live": item.get("isLive", False),
    }


def _map_injury_time(item):
    return {"length": item.get("length")}


def _map_var_decision(item):
    return {
        "player_name": _safe_nested(item, "player", "name")
        or item.get("playerName", ""),
        "incident_class": item.get("incidentClass"),
        "confirmed": item.get("confirmed"),
    }


def _map_in_game_penalty(item):
    return {
        "player_name": _safe_nested(item, "player", "name")
        or item.get("playerName", ""),
        "incident_class": item.get("incidentClass"),
        "reason": item.get("reason"),
    }


_INCIDENT_MAPPERS = {
    "goal": _map_goal,
    "card": _map_card,
    "substitution": _map_substitution,
    "period": _map_period,
    "injuryTime": _map_injury_time,
    "varDecision": _map_var_decision,
    "inGamePenalty": _map_in_game_penalty,
}


def _map_incident(item: dict) -> dict:
    """Mapuje pojedyncze zdarzenie z JSON-a na słownik pól modelu MatchEvent."""
    i_type = item.get("incidentType", "")
    base = {
        "incident_type": i_type,
        "event_id": str(item.get("id", "")),
        "time": item.get("time", 0) or 0,
        "added_time": item.get("addedTime") or 0,
    }
    is_home = item.get("isHome")
    base["is_home_team"] = is_home if is_home is not None else True

    mapper = _INCIDENT_MAPPERS.get(i_type)
    if mapper:
        base.update(mapper(item))
    else:
        base["player_name"] = _safe_nested(item, "player", "name") or ""
        base["text"] = item.get("text")
        base["incident_class"] = item.get("incidentClass")
    return base


# =============================================================================
#  FETCH LIVE MATCHES (KROK 1 – dane surowe z API)
# =============================================================================


def fetch_live_matches() -> dict | None:
    """Pobiera listę meczów na żywo z API."""
    url = "https://sportapi7.p.rapidapi.com/api/v1/sport/football/events/live"
    try:
        response = api_get(url, headers=_api_headers(), timeout=10)
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


def sync_live_matches() -> list[int]:
    """
    Pobiera mecze live z API, zapisuje je do bazy danych i wykrywa istotne zmiany.

    Zwraca listę api_id meczów, w których nastąpiła zmiana wyniku lub statusu.
    Ta lista jest przekazywana przez zadanie Celery do triggerowania
    process_match_incidents_and_notify dla każdego zmienionego meczu.
    """
    data = fetch_live_matches()
    if not data or "events" not in data:
        print("Brak danych do zsynchronizowania.")
        return []

    count = 0
    changed_api_ids: list[int] = []  # Mecze ze zmianą wyniku lub statusu
    for event in data["events"]:
        try:
            league_data = event["tournament"]
            unique_tournament = league_data.get("uniqueTournament", {})
            league_id = unique_tournament.get("id") or league_data["id"]
            league_name = unique_tournament.get("name") or league_data["name"]
            category = league_data.get("category", {})
            country_name = category.get("name", "Inne")

            league, created = League.objects.get_or_create(
                api_id=league_id,
                defaults={"name": league_name, "country": country_name},
            )
            if not created:
                updated = False
                if not league.country and country_name:
                    league.country = country_name
                    updated = True
                if league.name != league_data["name"]:
                    league.name = league_data["name"]
                    updated = True
                if updated:
                    league.save()

            home_data = event["homeTeam"]
            away_data = event["awayTeam"]
            home_team, _ = Team.objects.get_or_create(
                api_id=home_data["id"], defaults={"name": home_data["name"]}
            )
            away_team, _ = Team.objects.get_or_create(
                api_id=away_data["id"], defaults={"name": away_data["name"]}
            )

            status_data = event.get("status", {})
            status_desc = status_data.get("description", "")
            start_ts = event.get("startTimestamp")
            match_date = (
                (datetime.fromtimestamp(start_ts) + timedelta(hours=2)).date()
                if start_ts
                else None
            )

            time_data = event.get("time", {})
            if not isinstance(time_data, dict):
                time_data = {}
            period_start_ts = time_data.get("currentPeriodStartTimestamp")
            initial_min = (time_data.get("initial", 0) or 0) // 60

            if period_start_ts:
                minute_to_save = initial_min
                match_time_to_save = str(int(period_start_ts))
            else:
                minute_to_save = 0
                match_time_to_save = ""

            home_score = event["homeScore"].get("current", 0)
            away_score = event["awayScore"].get("current", 0)
            is_top = str(league_id) in PREMIUM_LEAGUE_IDS

            defaults = {
                "league": league,
                "home_team": home_team,
                "away_team": away_team,
                "home_score": home_score,
                "away_score": away_score,
                "status": status_desc,
                "minute": minute_to_save,
                "match_time": match_time_to_save,
                "match_date": match_date,
                "country_name": country_name,
                "is_top": is_top,
            }

            try:
                old_match = LiveMatch.objects.get(api_id=event["id"])
                channel_layer = get_channel_layer()
                room_group_name = f'match_{event["id"]}'

                score_changed = (
                    old_match.home_score < home_score
                    or old_match.away_score < away_score
                )
                status_changed = old_match.status != status_desc and status_desc

                # ── Web Socket: bramka ───────────────────────────────────────
                if score_changed:
                    print(
                        f"🔔 BRAMKA! {home_team.name} {old_match.home_score}→{home_score} - {old_match.away_score}→{away_score} {away_team.name}"
                    )
                    try:
                        async_to_sync(channel_layer.group_send)(
                            room_group_name,
                            {
                                "type": "match_event",
                                "event_type": "goal",
                                "icon": "⚽",
                                "message": f"GOOOOL! {home_team.name} {home_score} - {away_score} {away_team.name}",
                                "home_score": home_score,
                                "away_score": away_score,
                                "status": status_desc,
                            },
                        )
                        print(f"  ✅ Wysłano WS do grupy {room_group_name}")
                    except Exception as ws_err:
                        print(f"  ❌ Błąd wysyłki WS: {ws_err}")

                # ── Web Socket: zmiana okresu ────────────────────────────────
                if status_changed:
                    period_icons = {
                        "Halftime": "⏸️",
                        "Ended": "🏁",
                        "2nd Half": "▶️",
                        "Extra Time 1st Half": "⏱️",
                        "Penalties": "🎯",
                    }
                    icon = period_icons.get(status_desc, "⏱️")
                    try:
                        async_to_sync(channel_layer.group_send)(
                            room_group_name,
                            {
                                "type": "match_event",
                                "event_type": "period",
                                "icon": icon,
                                "message": f"{home_team.name} vs {away_team.name} — {status_desc}",
                                "home_score": home_score,
                                "away_score": away_score,
                                "status": status_desc,
                                "is_ended": status_desc == "Ended",
                            },
                        )
                    except Exception as ws_err:
                        print(f"  ❌ Błąd wysyłki WS status: {ws_err}")

                # ── ZABLOKOWANE: _check_new_incidents ────────────────────────────────
                # Celowo usunięto ukryte odpytywanie incidents po API z głównej pętli sync_live_matches.
                # Wszelkie zdarzenia typu kartki na ten moment aktualizowane asynchronicznie przez Push.

                # ── Trigger Push Notifications (event-driven) ────────────────
                # Tylko gdy wynik lub status się zmienił — ZERO zbędnych zapytań API
                # dla meczów bez żadnej aktywności.
                if score_changed or status_changed:
                    changed_api_ids.append(event["id"])

            except LiveMatch.DoesNotExist:
                pass

            LiveMatch.objects.update_or_create(api_id=event["id"], defaults=defaults)
            count += 1
        except Exception as e:
            print(f"Błąd przy zapisie meczu ID {event.get('id')}: {e}")
            continue

    print(
        f"Zakończono! Zsynchronizowano {count} meczów. "
        f"Istotne zmiany w {len(changed_api_ids)} meczach → trigger Push."
    )

    live_api_ids = {event["id"] for event in data["events"]}
    stale_matches = LiveMatch.objects.filter(
        status__iregex=r"(half|halftime|extra|awaiting|penalties|break|live|progress|period)"
    ).exclude(api_id__in=live_api_ids)
    ended_count = stale_matches.update(status="Ended")
    if ended_count:
        print(f"Auto-zakończono {ended_count} meczów.")

    return changed_api_ids


# =============================================================================
#  FETCH MATCH DETAILS (KROK 3 – zdarzenia, składy, statystyki)
# =============================================================================


def _save_lineup_players(match, players_list: list, is_home: bool) -> int:
    count = 0
    for p in players_list:
        player_info = p.get("player", {})
        statistics = p.get("statistics", {})
        is_substitute = p.get("substitute", False)
        pos = player_info.get("position", "")
        if pos == "S":
            is_substitute = True
        MatchLineup.objects.update_or_create(
            match=match,
            player_name=player_info.get("name", "Nieznany"),
            is_home_team=is_home,
            defaults={
                "player_api_id": player_info.get("id"),
                "shirt_number": player_info.get("jerseyNumber") or p.get("shirtNumber"),
                "position": pos,
                "is_starting_xi": not is_substitute,
                "is_captain": p.get("captain", False) or False,
                "avg_rating": statistics.get("rating"),
            },
        )
        count += 1
    return count


def _save_missing_players(match, missing_list: list, is_home: bool) -> int:
    if not missing_list:
        return 0
    count = 0
    for item in missing_list:
        player_info = item.get("player", {})
        if not player_info:
            continue
        MissingPlayer.objects.get_or_create(
            match=match,
            player_name=player_info.get("name", "Nieznany"),
            is_home_team=is_home,
            defaults={
                "type": item.get("type", "missing"),
                "reason": str(item.get("reason", "")),
            },
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
        response_ev = api_get(event_url, headers=headers, timeout=10)
        if response_ev.status_code == 200:
            ev_data = response_ev.json().get("event", {})
            time_data = ev_data.get("time", {})
            period_start_ts = time_data.get("currentPeriodStartTimestamp")
            initial_min = (time_data.get("initial", 0) or 0) // 60

            if period_start_ts:
                elapsed = int((_time.time() - period_start_ts) / 60)
                exact_minute = initial_min + elapsed
            else:
                exact_minute = time_data.get("current") or time_data.get("played") or 0

            new_status = ev_data.get("status", {}).get("description", "")
            home_score = ev_data.get("homeScore", {}).get("current")
            away_score = ev_data.get("awayScore", {}).get("current")

            update_fields = []
            if period_start_ts:
                match.match_time = str(period_start_ts)
                match.minute = initial_min
                update_fields += ["match_time", "minute"]
            elif exact_minute > 0:
                match.minute = exact_minute
                match.match_time = ""
                update_fields += ["minute", "match_time"]
            if new_status:
                match.status = new_status
                update_fields.append("status")
            if home_score is not None:
                match.home_score = home_score
                update_fields.append("home_score")
            if away_score is not None:
                match.away_score = away_score
                update_fields.append("away_score")
            if update_fields:
                match.save(update_fields=update_fields)
        else:
            print(f"Błąd API Event: {response_ev.status_code}")
    except Exception as e:
        print(f"Wyjątek przy pobieraniu stanu meczu: {e}")

    # GUARD: Pomijamy szczegółowe pobieranie dla niszowych lig (incidents/lineups/stats)
    # Konwertujemy zawsze do stringa — defensywnie, niezależnie od tego co zwróci ORM.
    try:
        league_api_id_str = str(match.league.api_id) if match.league and match.league.api_id is not None else None
    except Exception:
        league_api_id_str = None

    if not league_api_id_str or league_api_id_str not in PREMIUM_LEAGUE_IDS:
        print(f"Pominięto incidents/lineups/stats dla niszowej ligi (api_id={league_api_id_str!r}, typ: {type(match.league.api_id if match.league else None).__name__}).")
        return True

    # 1. Zdarzenia
    incidents_url = (
        f"https://sportapi7.p.rapidapi.com/api/v1/event/{api_match_id}/incidents"
    )
    try:
        response_inc = api_get(incidents_url, headers=headers, timeout=10)
        if response_inc.status_code == 200:
            json_data = response_inc.json()
            if "incidents" in json_data:
                incidents = json_data["incidents"]
            elif "data" in json_data and isinstance(json_data["data"], dict):
                incidents = json_data["data"].get("incidents", [])
            elif "response" in json_data:
                if isinstance(json_data["response"], dict):
                    incidents = json_data["response"].get("incidents", [])
                else:
                    incidents = json_data["response"]
            else:
                incidents = []
            created_count = 0
            for item in incidents:
                mapped = _map_incident(item)
                event_id = mapped.pop("event_id", None)
                if event_id:
                    _, created = MatchEvent.objects.update_or_create(
                        match=match, event_id=event_id, defaults=mapped
                    )
                    if created:
                        created_count += 1
                else:
                    # Deduplikacja dla zdarzeń bez ID z API (np. HT, FT)
                    incident_type = mapped.get("incident_type")
                    if incident_type == "period":
                        _, created = MatchEvent.objects.update_or_create(
                            match=match,
                            incident_type="period",
                            text=mapped.get("text"),
                            defaults=mapped
                        )
                        if created:
                            created_count += 1
                    elif incident_type == "injuryTime":
                        _, created = MatchEvent.objects.update_or_create(
                            match=match,
                            incident_type="injuryTime",
                            time=mapped.get("time"),
                            defaults=mapped
                        )
                        if created:
                            created_count += 1
                    else:
                        MatchEvent.objects.create(match=match, **mapped)
                        created_count += 1
            print(
                f"Zapisano {created_count} nowych zdarzeń (z {len(incidents)} w API)."
            )
        else:
            print(f"Błąd API Incidents: {response_inc.status_code}")
    except Exception as e:
        print(f"Wyjątek przy pobieraniu zdarzeń: {e}")

    # 2. Składy
    lineups_url = (
        f"https://sportapi7.p.rapidapi.com/api/v1/event/{api_match_id}/lineups"
    )
    try:
        response_lin = api_get(lineups_url, headers=headers, timeout=10)
        if response_lin.status_code == 200:
            data = response_lin.json()
            home_formation = data.get("home", {}).get("formation")
            away_formation = data.get("away", {}).get("formation")
            if home_formation or away_formation:
                if home_formation:
                    match.home_formation = home_formation
                if away_formation:
                    match.away_formation = away_formation
                match.save()

            home_data = data.get("home", {})
            away_data = data.get("away", {})
            home_count = _save_lineup_players(
                match, home_data.get("players", []), is_home=True
            )
            home_miss = _save_missing_players(
                match, home_data.get("missingPlayers", []), is_home=True
            )
            away_count = _save_lineup_players(
                match, away_data.get("players", []), is_home=False
            )
            away_miss = _save_missing_players(
                match, away_data.get("missingPlayers", []), is_home=False
            )
            print(
                f"Składy: Home {home_count}, Away {away_count} | Brak: Home {home_miss}, Away {away_miss}"
            )
        else:
            print(f"Błąd API Lineups: {response_lin.status_code}")
    except Exception as e:
        print(f"Wyjątek przy pobieraniu składów: {e}")

    # 3. Statystyki
    url_stats = (
        f"https://sportapi7.p.rapidapi.com/api/v1/event/{api_match_id}/statistics"
    )
    try:
        response_stats = api_get(url_stats, headers=headers, timeout=10)
        if response_stats.status_code == 200:
            match.stats_json = response_stats.json().get("statistics", [])
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
    url_template = (
        "https://sportapi7.p.rapidapi.com/api/v1/sport/football/scheduled-events/{date}"
    )
    today = datetime.now().date()

    # Usuwamy tylko przeszłe mecze – nie kasujemy tych, które wczęśniej pobraliśmy
    UpcomingMatch.objects.filter(start_datetime__date__lt=today).delete()
    print(f"Usunięto stare mecze sprzed {today}.")

    for delta in range(5):  # 0 = dziś, 1 = jutro, ..., 4 = za 4 dni
        fetch_date = today + timedelta(days=delta)
        date_str = fetch_date.strftime("%Y-%m-%d")
        url = url_template.format(date=date_str)
        try:
            response = api_get(url, headers=_api_headers(), timeout=10)
        except Exception as e:
            print(f"Błąd połączenia dla daty {date_str}: {e}")
            continue

        if response.status_code != 200:
            print(f"Błąd API dla daty {date_str}: {response.status_code}")
            continue

        events = response.json().get("events", [])
        print(f"[{date_str}] Znaleziono {len(events)} eventów.")

        for event in events:
            try:
                status_type = event["status"]["type"]
                if status_type != "notstarted":
                    continue

                league_data = event["tournament"]
                unique_tournament = league_data.get("uniqueTournament", {})
                league_id = unique_tournament.get("id") or league_data["id"]
                league_name = unique_tournament.get("name") or league_data["name"]

                is_top = str(league_id) in PREMIUM_LEAGUE_IDS
                api_id = event["id"]
                start_ts = event["startTimestamp"]
                start_datetime = make_aware(
                    datetime.fromtimestamp(start_ts) + timedelta(hours=2)
                )

                league_obj, _ = League.objects.get_or_create(
                    api_id=league_id, defaults={"name": league_name}
                )
                home_team_data = event["homeTeam"]
                away_team_data = event["awayTeam"]
                home_team_obj, _ = Team.objects.get_or_create(
                    api_id=home_team_data["id"],
                    defaults={"name": home_team_data["name"]},
                )
                away_team_obj, _ = Team.objects.get_or_create(
                    api_id=away_team_data["id"],
                    defaults={"name": away_team_data["name"]},
                )

                match, created = UpcomingMatch.objects.update_or_create(
                    api_id=api_id,
                    defaults={
                        "home_team": home_team_obj,
                        "away_team": away_team_obj,
                        "league": league_obj,
                        "start_datetime": start_datetime,
                        "is_top": is_top,
                    },
                )
                action = "DODANO" if created else "ZAKTUALIZOWANO"
                print(
                    f"  {'⭐' if is_top else '  '} {action}: {home_team_obj.name} vs {away_team_obj.name} [{date_str}]"
                )
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
        response = api_get(url, headers=_api_headers(), timeout=10)
        if response.status_code != 200:
            print(f"Błąd API (team events): {response.status_code}")
            return []
        events = response.json().get("events", [])
    except Exception as e:
        print(f"Błąd połączenia (fetch_last_matches_for_team): {e}")
        return []

    last_events = events[-n:] if len(events) >= n else events
    saved_matches = []

    for event in last_events:
        try:
            league_data = event.get("tournament", {})
            unique_tournament = league_data.get("uniqueTournament", {})
            league_id = unique_tournament.get("id") or league_data["id"]
            league_name = unique_tournament.get("name") or league_data.get(
                "name", "Nieznana Liga"
            )
            category = league_data.get("category", {})
            country_name = category.get("name", "Inne")

            league, _ = League.objects.get_or_create(
                api_id=league_id,
                defaults={"name": league_name, "country": country_name},
            )
            home_data = event.get("homeTeam", {})
            away_data = event.get("awayTeam", {})
            home_team, _ = Team.objects.get_or_create(
                api_id=home_data["id"],
                defaults={"name": home_data.get("name", "Nieznana")},
            )
            away_team, _ = Team.objects.get_or_create(
                api_id=away_data["id"],
                defaults={"name": away_data.get("name", "Nieznana")},
            )

            start_ts = event.get("startTimestamp")
            match_date = (
                (datetime.fromtimestamp(start_ts) + timedelta(hours=2)).date()
                if start_ts
                else None
            )

            status_desc = event.get("status", {}).get("description", "")
            home_score = event.get("homeScore", {}).get("current", 0) or 0
            away_score = event.get("awayScore", {}).get("current", 0) or 0

            match_obj, _ = LiveMatch.objects.update_or_create(
                api_id=event["id"],
                defaults={
                    "league": league,
                    "home_team": home_team,
                    "away_team": away_team,
                    "home_score": home_score,
                    "away_score": away_score,
                    "status": status_desc,
                    "match_date": match_date,
                    "country_name": country_name,
                },
            )
            saved_matches.append(match_obj)
            print(
                f"Zwiadowca: {home_team.name} {home_score}-{away_score} {away_team.name}"
            )
        except Exception as e:
            print(f"Zwiadowca: błąd przy meczu ID {event.get('id')}: {e}")
            continue

    return saved_matches
