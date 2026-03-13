import django, os, json
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'my_football_app.settings')
django.setup()
import requests

headers = {
    "x-rapidapi-key": os.environ.get("SPORT_API_KEY"),
    "x-rapidapi-host": "sportapi7.p.rapidapi.com"
}

res = requests.get("https://sportapi7.p.rapidapi.com/api/v1/event/15631329/incidents", headers=headers)
data = res.json()

for ev in data.get('incidents', []):
    t = ev.get('incidentType')
    if t in ('substitution', 'inGamePenalty'):
        print(json.dumps(ev, indent=2, ensure_ascii=False))
        print('---')
