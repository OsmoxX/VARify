import os
import requests
import json
from dotenv import load_dotenv

load_dotenv()

headers = {
    "x-rapidapi-key": os.getenv("SPORT_API_KEY"),
    "x-rapidapi-host": "sportapi7.p.rapidapi.com"
}

url = "https://sportapi7.p.rapidapi.com/api/v1/event/15631363/incidents"
res = requests.get(url, headers=headers)
data = res.json()

subs = [ev for ev in data.get('incidents', []) if ev.get('incidentClass') == 'substitution' or ev.get('incidentType') == 'substitution']
print(json.dumps(subs[:2], indent=2))
