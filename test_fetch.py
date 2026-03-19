import os
import requests
import json

api_key = os.environ.get('SPORT_API_KEY')
host = os.environ.get('SPORT_API_HOST', 'sportapi7.p.rapidapi.com')

headers = {
    "x-rapidapi-key": api_key,
    "x-rapidapi-host": host,
}

url = "https://sportapi7.p.rapidapi.com/api/v1/sport/football/events/live"

try:
    response = requests.get(url, headers=headers)
    data = response.json()
    bodo_matches = [
        e for e in data.get('events', []) 
        if 'Bodo' in e.get('homeTeam', {}).get('name', '') or 'Bodo' in e.get('awayTeam', {}).get('name', '') or 'Bod' in e.get('homeTeam', {}).get('name', '')
    ]
    print(f"Bodo matches in live API: {json.dumps(bodo_matches, indent=2)}")
except Exception as e:
    print(f"Error: {e}")
