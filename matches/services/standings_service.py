"""
services/standings_service.py

Handles fetching and storing league standings from the SportAPI.
"""
import os

import requests

from matches.models import League, LeagueStandings, Team


def fetch_league_standings(
    tournament_id: int,
    season_id: str | None = None,
    local_league_id: int | None = None,
) -> list:
    """
    Pobiera tabelę ligi z API i aktualizuje lub tworzy wpisy w modelu LeagueStandings.

    Args:
        tournament_id:   SportAPI unique-tournament ID (używany do zapytania API).
        season_id:       Opcjonalne – jeśli pominięte, wykrywane automatycznie.
        local_league_id: Lokalny api_id ligi w DB. Jeśli podany, tabela zostanie
                         przypisana do tego obiektu zamiast tworzyć nowy wg tournament_id.
    """
    headers = {
        "x-rapidapi-key": os.getenv("SPORT_API_KEY"),
        "x-rapidapi-host": os.getenv("SPORT_API_HOST", "sportapi7.p.rapidapi.com"),
    }

    try:
        # 1. Automatyczne wykrycie sezonu
        if not season_id:
            season_url = (
                f"https://sportapi7.p.rapidapi.com/api/v1/unique-tournament/{tournament_id}/seasons"
            )
            resp_seasons = requests.get(season_url, headers=headers)
            if resp_seasons.status_code == 200:
                seasons = resp_seasons.json().get('seasons', [])
                if seasons:
                    season_id = seasons[0].get('id')

            if not season_id:
                print(f"API błąd: Nie udało się pobrać sezonu dla turnieju {tournament_id}")
                return []

        # 2. Pobieranie tabeli
        url = (
            f"https://sportapi7.p.rapidapi.com/api/v1/unique-tournament/{tournament_id}"
            f"/season/{season_id}/standings/total"
        )
        response = requests.get(url, headers=headers, timeout=8)
        if response.status_code != 200:
            print(f"API League Standings błąd: {response.status_code}")
            return []

        data = response.json()
        standings = data.get('standings', [])

        # Wyciągamy nazwę ligi i kraj z odpowiedzi API
        league_name = f"Liga {tournament_id}"
        league_country = ""
        if standings and 'tournament' in standings[0]:
            tourn_data = standings[0]['tournament']
            league_name = tourn_data.get('name', league_name)
            league_country = tourn_data.get('category', {}).get('name', "")

        # Używamy local_league_id jeśli podany, w przeciwnym razie tournament_id
        target_league_id = local_league_id if local_league_id is not None else tournament_id

        league, created = League.objects.update_or_create(
            api_id=target_league_id,
            defaults={'name': league_name, 'country': league_country}
        )
        if created:
            print(f"Utworzono ligę: {league.name}")
        else:
            print(f"Zaktualizowano ligę: {league.name} ({league_country})")

        # 3. Zapis wierszy tabeli
        for standing in standings:
            for row in standing.get('rows', []):
                team_id = row['team']['id']
                team_name = row['team']['name']

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
                        'position': row.get('position'),
                        'points': row.get('points'),
                        'matches_played': row.get('matches') or 0,
                        'matches_won': row.get('wins') or 0,
                        'matches_drawn': row.get('draws') or 0,
                        'matches_lost': row.get('losses') or 0,
                        'goals_for': row.get('scoresFor') or 0,
                        'goals_against': row.get('scoresAgainst') or 0,
                        'goal_difference': (row.get('scoresFor') or 0) - (row.get('scoresAgainst') or 0),
                    }
                )

        print(f"Zaktualizowano tabelę ligi: {league}")
        return list(LeagueStandings.objects.filter(league=league))

    except Exception as e:
        print(f"API League Standings wyjątek: {e}")
        return []
