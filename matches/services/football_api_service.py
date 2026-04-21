"""
services/football_api_service.py

Low-level helpers and search functions for the SportAPI.
"""

import os

from matches.services.api_tracker import api_get

from matches.models import Team

# ── ID sportu "Football" w SportAPI (sportapi7.p.rapidapi.com) ──
# sport.id == 1 odpowiada piłce nożnej — wszystkie inne to inne dyscypliny.
FOOTBALL_SPORT_ID = 1
FOOTBALL_SPORT_SLUGS = {"football", "soccer"}


def _api_headers() -> dict:
    """Returns the common RapidAPI authentication headers."""
    return {
        "x-rapidapi-key": os.getenv("SPORT_API_KEY"),
        "x-rapidapi-host": os.getenv("SPORT_API_HOST", "sportapi7.p.rapidapi.com"),
    }


def _is_football_entity(entity: dict) -> bool:
    """
    Sprawdza czy encja z API dotyczy piłki nożnej.

    SportAPI zwraca pole 'sport' w entity z id i slug.
    Jeśli sport jest nieznany/nieobecny — przepuszczamy (konserwatywne podejście).
    """
    sport = entity.get("sport")
    if sport is None:
        # Brak pola sport — może być drużyna piłkarska bez tagu, przepuszczamy
        return True
    sport_id = sport.get("id")
    sport_slug = str(sport.get("slug", "")).lower()
    if sport_id == FOOTBALL_SPORT_ID:
        return True
    if sport_slug in FOOTBALL_SPORT_SLUGS:
        return True
    return False


def search_teams_from_api(query: str) -> list:
    """
    Szuka piłkarskich drużyn w zewnętrznym API po nazwie.
    Zapisuje znalezione drużyny do lokalnej tabeli Team (tylko id + name).
    Zwraca listę obiektów Team.

    TYLKO PIŁKA NOŻNA: encje z innym sportem są odrzucane.
    """
    urls_to_try = [
        # Dedykowany endpoint dla piłki nożnej — jako pierwszy
        f"https://sportapi7.p.rapidapi.com/api/v1/sport/football/search/{query}",
        # Ogólne endpointy jako fallback
        f"https://sportapi7.p.rapidapi.com/api/v1/search/all?q={query}",
        f"https://sportapi7.p.rapidapi.com/api/v1/search/multi?query={query}",
        f"https://sportapi7.p.rapidapi.com/api/v1/search/{query}",
    ]
    headers = _api_headers()

    try:
        results: list[dict] = []
        for url in urls_to_try:
            response = api_get(url, headers=headers, timeout=8)
            if response.status_code == 200:
                data = response.json()
                results = data.get("results", []) or data.get("teams", []) or []
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
    skipped = 0
    for row in results:
        if row.get("type") != "team":
            continue
        entity = row.get("entity", {})
        api_id = entity.get("id")
        name = entity.get("name", "").strip()
        if not api_id or not name:
            continue

        # ── Filtr piłkarski — odrzuć inne dyscypliny sportu ──
        if not _is_football_entity(entity):
            skipped += 1
            print(f"API Search: odrzucono '{name}' (sport: {entity.get('sport')})")
            continue

        team, created = Team.objects.get_or_create(
            api_id=api_id, defaults={"name": name}
        )
        if created:
            print(f"API Search: zapisano nową drużynę '{name}' (api_id={api_id})")
        teams.append(team)

    if skipped:
        print(f"API Search: odrzucono {skipped} encji z innych dyscyplin")
    return teams

