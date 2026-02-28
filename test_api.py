import requests
import os

API_KEY = os.environ.get("SPORT_API_KEY")
if not API_KEY:
    # spróbuj pobrać z .env jeśli istnieje
    from dotenv import load_dotenv
    load_dotenv()
    API_KEY = os.environ.get("SPORT_API_KEY")

headers = {
    "x-rapidapi-key": API_KEY,
    "x-rapidapi-host": "sportapi7.p.rapidapi.com"
}

date = "2024-02-28" 
url = f"https://sportapi7.p.rapidapi.com/api/v1/sport/football/scheduled-events/{date}"
print(f"Testing URL: {url}")

response = requests.get(url, headers=headers)
print(f"Status: {response.status_code}")
if response.status_code == 200:
    data = response.json()
    events = data.get('events', [])
    print(f"Znaleziono {len(events)} meczów.")
    if events:
        print("Struktura pierwszego meczu (klucze):", events[0].keys())
        print("Tournament:", events[0].get('tournament', {}).get('name'))
        print("StartTimestamp:", events[0].get('startTimestamp'))
else:
    print(response.text)
