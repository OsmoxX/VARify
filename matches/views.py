from django.shortcuts import render
from .models import Match, Team, League

# Create your views here.

def live_matches_view(request):
    live_matches = Match.objects.filter(status__icontains='half').select_related('home_team', 'away_team', 'league')
    return render(request, 'matches/live_match_list.html', {'matches': live_matches})
