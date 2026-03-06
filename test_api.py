import os
import requests
import json
from dotenv import load_dotenv

load_dotenv()

headers = {
    "x-rapidapi-key": os.environ.get("SPORT_API_KEY"),
    "x-rapidapi-host": os.environ.get("SPORT_API_HOST")
}

# Real Madrid match from screenshot - let's check incidents
match_id = "12613133" # Using typical LaLiga ID format, but we'll try a generic match to check structure

url = f"https://sportapi7.p.rapidapi.com/api/v1/event/{match_id}/incidents"
resp = requests.get(url, headers=headers)
if resp.status_code == 200:
    data = resp.json().get('incidents', [])
    subs = [i for i in data if i.get('incidentType') == 'substitution']
    if subs:
        print("--- SUBSTITUTION JSON ---")
        print(json.dumps(subs[0], indent=2))
else:
    print(f"Failed incidents: {resp.status_code}")

url2 = f"https://sportapi7.p.rapidapi.com/api/v1/event/{match_id}/lineups"
resp2 = requests.get(url2, headers=headers)
if resp2.status_code == 200:
    data = resp2.json()
    if data.get('home', {}).get('players'):
        print("\n--- LINEUP JSON ---")
        print(json.dumps(data['home']['players'][0], indent=2))
        print(json.dumps(data['home']['players'][-1], indent=2))
else:
    print(f"Failed lineups: {resp2.status_code}")
