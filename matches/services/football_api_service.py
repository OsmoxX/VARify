"""
services/football_api_service.py

Low-level helpers and search functions for the SportAPI.
Responsible ONLY for HTTP calls and basic data shaping – no DB writes.
"""
import os

import requests

from matches.models import Team


def _api_headers() -> dict:
    """Returns the common RapidAPI authentication headers."""
    return {
        "x-rapidapi-key": os.getenv("SPORT_API_KEY"),
        "x-rapidapi-host": os.getenv("SPORT_API_HOST", "sportapi7.p.rapidapi.com"),
    }


def search_teams_from_api(query: str) -> list:
    """
    Szuka drużyn w zewnętrznym API po nazwie.
    Zapisuje znalezione drużyny do lokalnej tabeli Team (tylko id + name).
    Zwraca listę obiektów Team.
    """
    urls_to_try = [
        f"https://sportapi7.p.rapidapi.com/api/v1/search/all?q={query}",
        f"https://sportapi7.p.rapidapi.com/api/v1/search/multi?query={query}",
        f"https://sportapi7.p.rapidapi.com/api/v1/search/{query}",
    ]
    headers = _api_headers()

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
        if row.get('type') != 'team':
            continue
        entity = row.get('entity', {})
        api_id = entity.get('id')
        name = entity.get('name', '').strip()
        if not api_id or not name:
            continue
        team, created = Team.objects.get_or_create(
            api_id=api_id,
            defaults={'name': name}
        )
        if created:
            print(f"API Search: zapisano nową drużynę '{name}' (api_id={api_id})")
        teams.append(team)

    return teams
