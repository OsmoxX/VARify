import requests
try:
    response = requests.get('http://localhost:8000/api/live-matches/')
    data = response.json()
    bodo = [m for m in data if 'Bod' in m.get('home_team','') or 'Bod' in m.get('away_team','')]
    print("API Response for Bodo:")
    import json; print(json.dumps(bodo, indent=2))
except Exception as e:
    print(e)
