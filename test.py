from matches.models import LiveMatch
from matches.services import fetch_match_details
# Znajdź mecz PAOK w lokalnej bazie SQLite
mecz_paok = LiveMatch.objects.filter(home_team__name__icontains="PAOK").first()

if mecz_paok:
    print(f"Pobieram detale dla: {mecz_paok.home_team.name} vs {mecz_paok.away_team.name}")
    # Wywołanie Twojej funkcji (zużyje 2 requesty)
    fetch_match_details(local_match_id=mecz_paok.id, api_match_id=mecz_paok.api_id)
else:
    print("Nie znaleziono meczu PAOK w bazie.")