import os
import requests
import time

def _api_headers() -> dict:
    return {
        "x-rapidapi-key": os.getenv("SPORT_API_KEY"),
        "x-rapidapi-host": os.getenv("SPORT_API_HOST", "sportapi7.p.rapidapi.com"),
    }

queries = {
    "Champions League": "UEFA Champions League", 
    "Europa League": "UEFA Europa League", 
    "Conference League": "UEFA Conference League",
    "Premier League": "Premier League", 
    "LaLiga": "LaLiga", 
    "Serie A": "Serie A", 
    "Bundesliga": "Bundesliga", 
    "Ligue 1": "Ligue 1",
    "Eredivisie": "Eredivisie", 
    "Liga Portugal": "Liga Portugal", 
    "Championship": "Championship", 
    "Super Lig": "Trendyol Süper Lig",
    "Jupiler Pro League": "Pro League", 
    "Scottish Premiership": "Premiership", 
    "2. Bundesliga": "2. Bundesliga",
    "LaLiga 2": "LaLiga 2", 
    "Serie B": "Serie B", 
    "Ligue 2": "Ligue 2", 
    "Czech First League": "1. Liga", 
    "Fortuna Liga": "Superliga",
    "Austrian Bundesliga": "Bundesliga", 
    "Swiss Super League": "Super League", 
    "Allsvenskan": "Allsvenskan", 
    "Eliteserien": "Eliteserien",
    "Superliga": "Superliga", 
    "FA Cup": "FA Cup", 
    "Copa del Rey": "Copa del Rey", 
    "Coppa Italia": "Coppa Italia", 
    "DFB Pokal": "DFB Pokal",
    "Coupe de France": "Coupe de France", 
    "Puchar Polski": "Puchar Polski", 
    "KNVB Beker": "KNVB Beker", 
    "Taca de Portugal": "Taça de Portugal",
    "Copa Libertadores": "Copa Libertadores", 
    "Copa Sudamericana": "Copa Sudamericana", 
    "Saudi Pro League": "Saudi Pro League", 
    "MLS": "MLS",
    "Brasileirao": "Brasileirão", 
    "Liga MX": "Liga MX", 
    "Ekstraklasa": "Ekstraklasa"
}

results = {}
for q, expected in queries.items():
    url = f"https://sportapi7.p.rapidapi.com/api/v1/search/all?q={q.replace(' ', '%20')}"
    try:
        resp = requests.get(url, headers=_api_headers())
        if resp.status_code == 200:
            data = resp.json()
            tournaments = data.get('results', [])
            found = False
            for item in tournaments:
                if item.get('type') == 'uniqueTournament':
                    ent = item.get('entity', {})
                    name = ent.get('name', '')
                    if expected.lower() in name.lower() or name.lower() in expected.lower():
                        results[q] = ent.get('id')
                        found = True
                        break
            if not found:
                for item in tournaments:
                    if item.get('type') == 'uniqueTournament':
                        results[q] = item.get('entity', {}).get('id')
                        break
    except Exception as e:
        results[q] = f"Error: {e}"
    time.sleep(0.3)

with open('scratch_output.txt', 'w') as f:
    f.write("PREMIUM_LEAGUE_IDS = {\n")
    for q, val in results.items():
        f.write(f"    {val}, # {q}\n")
    f.write("}\n")
