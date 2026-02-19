from django.core.management.base import BaseCommand
from matches.models import LiveMatch, MatchEvent, MatchLineup
from matches.services import fetch_match_details


class Command(BaseCommand):
    help = (
        'Usuwa stare zdarzenia i składy, a następnie ponownie pobiera je z API.\n'
        'Użycie: python manage.py reimport_events [match_id ...]\n'
        'Bez argumentów: reimportuje WSZYSTKIE mecze.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            'match_ids', nargs='*', type=int,
            help='ID meczów do reimportu (lokalne ID). Puste = wszystkie.'
        )

    def handle(self, *args, **options):
        match_ids = options['match_ids']

        if match_ids:
            matches = LiveMatch.objects.filter(id__in=match_ids)
        else:
            matches = LiveMatch.objects.all()

        total = matches.count()
        self.stdout.write(f"Reimport zdarzeń dla {total} meczów...")

        for i, match in enumerate(matches, 1):
            self.stdout.write(f"\n[{i}/{total}] Mecz: {match} (local_id={match.id}, api_id={match.api_id})")

            # Usuwamy stare dane
            deleted_events = MatchEvent.objects.filter(match=match).delete()[0]
            deleted_lineups = MatchLineup.objects.filter(match=match).delete()[0]
            self.stdout.write(f"  Usunięto: {deleted_events} zdarzeń, {deleted_lineups} składów")

            # Pobieramy na nowo
            result = fetch_match_details(match.id, match.api_id)
            if result:
                self.stdout.write(self.style.SUCCESS(f"  ✓ Reimport zakończony."))
            else:
                self.stdout.write(self.style.ERROR(f"  ✗ Błąd importu."))

        self.stdout.write(self.style.SUCCESS(f"\nGotowe! Przetworzono {total} meczów."))
