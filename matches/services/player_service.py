"""
services/player_service.py

Handles all player data fetching from the external SportAPI.
"""

import os
from datetime import datetime

import requests
from matches.services.api_tracker import api_get

from matches.models import Player, Team


def fetch_player(player_id: int) -> Player | None:
    """Pobiera i zapisuje/aktualizuje dane konkretnego zawodnika z API."""
    url = f"https://sportapi7.p.rapidapi.com/api/v1/player/{player_id}"
    headers = {
        "x-rapidapi-key": os.getenv("SPORT_API_KEY"),
        "x-rapidapi-host": os.getenv("SPORT_API_HOST"),
    }

    try:
        response = api_get(url, headers=headers, timeout=10)
        response.raise_for_status()
        data = response.json().get("player")
        if not data:
            return None

        team_obj = None
        team_data = data.get("team")
        if team_data and team_data.get("id"):
            team_obj, _ = Team.objects.update_or_create(
                api_id=team_data["id"],
                defaults={"name": team_data.get("name", "Nieznany")},
            )

        def parse_ts(timestamp):
            return datetime.fromtimestamp(timestamp).date() if timestamp else None

        defaults = {
            "name": data.get("name", ""),
            "first_name": data.get("firstName"),
            "last_name": data.get("lastName"),
            "position": data.get("position"),
            "jersey_number": data.get("jerseyNumber") or data.get("shirtNumber"),
            "height": data.get("height"),
            "preferred_foot": data.get("preferredFoot"),
            "market_value": data.get("marketValue"),
            "date_of_birth": parse_ts(data.get("dateOfBirthTimestamp")),
            "contract_until": parse_ts(data.get("contractUntilTimestamp")),
            "nationality": data.get("country", {}).get("name"),
            "retired": data.get("retired", False),
            "team": team_obj,
        }

        player_obj, _ = Player.objects.update_or_create(
            api_id=player_id, defaults=defaults
        )
        return player_obj

    except requests.exceptions.RequestException as e:
        print(f"Błąd połączenia API dla zawodnika {player_id}: {e}")
        return None
    except Exception as e:
        print(f"Niespodziewany błąd przy fetch_player {player_id}: {e}")
        return None


def search_players_from_api(query: str) -> list:
    """
    Szuka zawodników w zewnętrznym API po nazwie.
    Zapisuje podstawowe dane do lokalnej tabeli Player.
    """
    headers = {
        "x-rapidapi-key": os.getenv("SPORT_API_KEY"),
        "x-rapidapi-host": os.getenv("SPORT_API_HOST", "sportapi7.p.rapidapi.com"),
    }

    url = f"https://sportapi7.p.rapidapi.com/api/v1/search/players/{query}/more"
    try:
        response = api_get(url, headers=headers, timeout=10)
        if response.status_code != 200:
            url = f"https://sportapi7.p.rapidapi.com/api/v1/search/players/{query}"
            response = api_get(url, headers=headers, timeout=10)

        if response.status_code == 200:
            data = response.json()
            results = data.get("results", []) or data.get("players", []) or []
        else:
            print(f"Błąd wyszukiwania zawodnika API: {response.status_code}")
            return []
    except Exception as e:
        print(f"Wyjątek wyszukiwania zawodnika API: {e}")
        return []

    players = []
    for row in results:
        entity = row.get("entity") if "entity" in row else row
        api_id = entity.get("id")
        name = entity.get("name", "").strip()
        if not api_id or not name:
            continue
        player_obj, _ = Player.objects.get_or_create(
            api_id=api_id,
            defaults={
                "name": name,
                "first_name": entity.get("firstName"),
                "last_name": entity.get("lastName"),
                "position": entity.get("position"),
            },
        )
        players.append(player_obj)

    return players
