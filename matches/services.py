import os
import requests
from dotenv import load_dotenv
from .models import Match, Team, League # Importujemy Twoje modele

# Ładujemy klucze z pliku .env
load_dotenv()

def fetch_live_matches():
    """KROK 1: Pobiera surowe dane (JSON) z internetu"""
    url = "https://sportapi7.p.rapidapi.com/api/v1/sport/football/events/live"

    headers = {
        "x-rapidapi-key": os.getenv("SPORT_API_KEY"),
        "x-rapidapi-host": os.getenv("SPORT_API_HOST")
    }

    try:
        response = requests.get(url, headers=headers)
        if response.status_code == 200:
            return response.json()
        print(f"Błąd API: {response.status_code}")
        return None
    except Exception as e:
        print(f"Błąd połączenia: {e}")
        return None

def sync_live_matches():
    """KROK 2: Przetwarza JSON i zapisuje/aktualizuje bazę danych"""
    data = fetch_live_matches()

    if not data or 'events' not in data:
        print("Brak danych do zsynchronizowania.")
        return

    count = 0
    for event in data['events']:
        # 1. Obsługa Ligi
        league_data = event['tournament']
        league, _ = League.objects.get_or_create(
            api_id=league_data['id'],
            defaults={'name': league_data['name']}
        )

        # 2. Obsługa Drużyn
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

        # 3. Zapis lub aktualizacja meczu (update_or_create)
        Match.objects.update_or_create(
            api_id=event['id'],
            defaults={
                'league': league,
                'home_team': home_team,
                'away_team': away_team,
                'home_score': event['homeScore'].get('current', 0),
                'away_score': event['awayScore'].get('current', 0),
                'status': event['status']['description'],
            }
        )
        count += 1

    print(f"Zakończono! Zsynchronizowano {count} meczów.")