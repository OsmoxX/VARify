import django, os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'my_football_app.settings')
django.setup()

from matches.models import MatchEvent, LiveMatch
from matches.services import fetch_match_details

matches = LiveMatch.objects.filter(status__in=['1st half', '2nd half', 'Halftime', 'Ended', 'Extra time'])

fixed_count = 0
for m in matches:
    # Pobierz zepsute zmiany 
    bad_subs = MatchEvent.objects.filter(
        match=m, 
        incident_type='substitution',
        player_in_name=''
    )
    
    if bad_subs.exists():
        count = bad_subs.count()
        print(f"[{m.api_id} / {m.home_team.name}] Usunięto {count} uszkodzonych zmian.")
        bad_subs.delete()
        fixed_count += 1
        # Wymuś odświeżenie zdarzeń
        fetch_match_details(m.id, m.api_id)

print(f"\nNaprawiono {fixed_count} meczów.")
