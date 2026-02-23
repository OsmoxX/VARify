"""
Test: Pobierz ostatni mecz Realu Madryt i załaduj wszystkie dane.
Uruchom: python3 manage.py shell < test.py
"""
import os
import requests
from dotenv import load_dotenv
load_dotenv()

from matches.models import LiveMatch, Team, League
from matches.services import fetch_match_details

HEADERS = {
    "x-rapidapi-key": os.getenv("SPORT_API_KEY"),
    "x-rapidapi-host": "sportapi7.p.rapidapi.com",
}

REAL_MADRID_API_ID = 2829  # SofaScore ID Realu Madryt

# 1. Pobierz ostatnie mecze Realu Madryt z API
print("=" * 60)
print("Szukam ostatnich meczów Realu Madryt...")
url = f"https://sportapi7.p.rapidapi.com/api/v1/team/{REAL_MADRID_API_ID}/events/last/0"
resp = requests.get(url, headers=HEADERS, timeout=10)

if resp.status_code != 200:
    print(f"Błąd API: {resp.status_code}")
    exit()

events = resp.json().get('events', [])
if not events:
    print("Brak meczów!")
    exit()

# Ostatni mecz to ostatni element listy
last_match = events[-1]
api_match_id = last_match['id']
home_name = last_match['homeTeam']['name']
away_name = last_match['awayTeam']['name']
home_score = last_match['homeScore'].get('current', 0)
away_score = last_match['awayScore'].get('current', 0)
status = last_match['status']['description']

print(f"Znaleziono: {home_name} {home_score}-{away_score} {away_name} (API ID: {api_match_id})")
print(f"Status: {status}")
print("=" * 60)

# 2. Zapisz mecz do bazy
league_data = last_match['tournament']
category = league_data.get('category', {})

league, _ = League.objects.get_or_create(
    api_id=league_data['id'],
    defaults={
        'name': league_data['name'],
        'country': category.get('name', 'Inne'),
    }
)

home_team, _ = Team.objects.get_or_create(
    api_id=last_match['homeTeam']['id'],
    defaults={'name': home_name}
)
away_team, _ = Team.objects.get_or_create(
    api_id=last_match['awayTeam']['id'],
    defaults={'name': away_name}
)

match_obj, created = LiveMatch.objects.update_or_create(
    api_id=api_match_id,
    defaults={
        'league': league,
        'home_team': home_team,
        'away_team': away_team,
        'home_score': home_score,
        'away_score': away_score,
        'status': status,
        'country_name': category.get('name', 'Inne'),
    }
)

print(f"Mecz {'utworzony' if created else 'zaktualizowany'} w bazie (ID: {match_obj.id})")

# 3. Wyczyść stare dane i pobierz nowe
match_obj.events.all().delete()
match_obj.lineups.all().delete()
match_obj.missing_players.all().delete()
match_obj.stats_json = None
match_obj.home_formation = None
match_obj.away_formation = None
match_obj.save()
print("Stare dane wyczyszczone. Pobieram świeże dane...")

# 4. Pobierz zdarzenia, składy i statystyki
fetch_match_details(local_match_id=match_obj.id, api_match_id=api_match_id)

# 5. Podsumowanie
match_obj.refresh_from_db()
print("\n" + "=" * 60)
print("PODSUMOWANIE:")
print(f"  Mecz: {home_name} {home_score}-{away_score} {away_name}")
print(f"  Zdarzenia: {match_obj.events.count()}")
print(f"  Składy: {match_obj.lineups.count()}")
print(f"  Formacje: {match_obj.home_formation} vs {match_obj.away_formation}")
print(f"  Statystyki: {'TAK' if match_obj.stats_json else 'BRAK'}")
if match_obj.stats_json:
    for period in match_obj.stats_json:
        items_count = sum(len(g.get('statisticsItems', [])) for g in period.get('groups', []))
        print(f"    → {period.get('period', '?')}: {items_count} statystyk")
print(f"\n  Otwórz: http://localhost:8000/match/{match_obj.id}/")
print("=" * 60)