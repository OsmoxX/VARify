from django.core.management.base import BaseCommand
from matches.services import sync_live_matches

class Command(BaseCommand):
    help = 'Fetches live matches from SportAPI and updates the RDS database'

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('Starting the sync process...'))

        try:
            # Uruchamiamy logikę z services.py
            sync_live_matches()
            self.stdout.write(self.style.SUCCESS('Successfully updated match data!'))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'An error occurred: {e}'))