from matches.models import MatchEvent
from django.db.models import Count

deleted_count = 0

# Deduplikacja dla zdarzeń typu 'period' (HT, FT itp.)
duplicates = MatchEvent.objects.filter(incident_type='period').values('match_id', 'text').annotate(count=Count('id')).filter(count__gt=1)
for dup in duplicates:
    # Pobierz wszystkie duplikaty dla tego samego meczu i tekstu, posortowane od najnowszego
    events = MatchEvent.objects.filter(match_id=dup['match_id'], incident_type='period', text=dup['text']).order_by('-id')
    # Zachowaj najnowszy (indeks 0), zbierz ID reszty do usunięcia
    ids_to_delete = [e.id for e in list(events)[1:]]
    deleted, _ = MatchEvent.objects.filter(id__in=ids_to_delete).delete()
    deleted_count += deleted

# Deduplikacja dla zdarzeń typu 'injuryTime' (doliczony czas gry)
duplicates_inj = MatchEvent.objects.filter(incident_type='injuryTime').values('match_id', 'time').annotate(count=Count('id')).filter(count__gt=1)
for dup in duplicates_inj:
    events = MatchEvent.objects.filter(match_id=dup['match_id'], incident_type='injuryTime', time=dup['time']).order_by('-id')
    ids_to_delete = [e.id for e in list(events)[1:]]
    deleted, _ = MatchEvent.objects.filter(id__in=ids_to_delete).delete()
    deleted_count += deleted

print(f"Deduplikacja zakończona! Usunięto {deleted_count} zduplikowanych rekordów z bazy danych.")
