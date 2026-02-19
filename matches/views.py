from collections import defaultdict
from django.db import models
from django.shortcuts import render, get_object_or_404
from django.http import JsonResponse
from django.views.generic import ListView
from .models import LiveMatch, MatchEvent, MatchLineup, Team
from .services import fetch_match_details

# Create your views here.

def live_matches_view(request):
    live_matches = LiveMatch.objects.filter(status__icontains='half').select_related('home_team', 'away_team', 'league')
    return render(request, 'matches/live_match_list.html', {'matches': live_matches})


def match_detail_view(request, match_id):
    # 1. Pobieramy mecz
    match = get_object_or_404(LiveMatch, id=match_id)
    events = MatchEvent.objects.filter(match=match).order_by('time', 'added_time', 'id')

    # 2. Pobieramy składy – podział na XI i rezerwę
    lineups_query = MatchLineup.objects.filter(match=match)
    lineups = {
        'home_xi': lineups_query.filter(is_home_team=True, is_starting_xi=True).order_by('shirt_number'),
        'home_subs': lineups_query.filter(is_home_team=True, is_starting_xi=False).order_by('shirt_number'),
        'away_xi': lineups_query.filter(is_home_team=False, is_starting_xi=True).order_by('shirt_number'),
        'away_subs': lineups_query.filter(is_home_team=False, is_starting_xi=False).order_by('shirt_number'),
    }

    return render(request, 'matches/match_detail.html', {
        'match': match,
        'events': events,
        'lineups': lineups
    })



# matches/views.py

class HomeView(ListView):
    model = LiveMatch
    template_name = 'matches/live_match_list.html'
    context_object_name = 'matches'

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        
        # Pobieramy mecze z "dociągnięciem" relacji (select_related), żeby nie zamulić bazy
        all_matches = LiveMatch.objects.select_related('league', 'home_team', 'away_team').all()
        
        raw_data = defaultdict(lambda: defaultdict(list))
        
        for match in all_matches:
            country = match.country_name or (match.league.country if match.league else None) or 'Inne'
            
            # --- POPRAWKA TUTAJ ---
            # Stare: league = match.league_name
            # Nowe: Pobieramy nazwę z obiektu League (jeśli istnieje)
            if match.league:
                league = match.league.name
            else:
                league = "Nieznana Liga"
            # ----------------------

            raw_data[country][league].append(match)

        structured_data = []
        for country, leagues in raw_data.items():
            league_list = []
            for league_name, matches in leagues.items():
                league_list.append({
                    'name': league_name,
                    'matches': matches
                })
            structured_data.append({
                'country': country,
                'leagues': league_list
            })

        context['structured_data'] = structured_data

        # Flat list of unique league names for the filter search
        all_league_names = sorted(set(
            ln for item in structured_data for league in item['leagues'] for ln in [league['name']]
        ))
        context['all_league_names'] = all_league_names

        return context


def search_api_view(request):
    """Wyszukiwanie drużyn w lokalnej bazie (bez API)."""
    query = request.GET.get('q', '').strip()

    if len(query) < 2:
        return JsonResponse({'results': []})

    from .models import Team
    teams = Team.objects.filter(name__icontains=query)[:10]

    results = [
        {'id': t.id, 'name': t.name, 'logo_url': t.logo_url or ''}
        for t in teams
    ]

    return JsonResponse({'results': results})


def team_detail_view(request, team_id):
    """Strona drużyny: ostatnie mecze + skład."""
    from .models import Team, LiveMatch, MatchLineup

    team = get_object_or_404(Team, id=team_id)

    # Ostatnie mecze (max 20)
    recent_matches = LiveMatch.objects.filter(
        models.Q(home_team=team) | models.Q(away_team=team)
    ).select_related('home_team', 'away_team', 'league').order_by('-id')[:20]

    # Skład – unikalni gracze z najnowszego meczu
    latest_match = recent_matches.first() if recent_matches.exists() else None
    squad = []
    if latest_match:
        squad = MatchLineup.objects.filter(
            match=latest_match,
            is_home_team=(latest_match.home_team == team)
        ).order_by('-is_starting_xi', 'shirt_number')

    return render(request, 'matches/team_detail.html', {
        'team': team,
        'recent_matches': recent_matches,
        'squad': squad,
        'latest_match': latest_match,
    })