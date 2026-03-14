"""
views/league_views.py

League detail page with standings, upcoming and recent matches.
"""
from django.shortcuts import render

from matches.models import League, LeagueStandings, LiveMatch, UpcomingMatch


def league_detail_view(request, api_id):
    """Strona ligi — tabela, nadchodzące i ostatnie mecze."""
    league = League.objects.filter(api_id=api_id).first()

    if not league:
        return render(request, 'matches/league_detail.html', {
            'league': {'name': 'Nieznana Liga', 'country': ''},
            'upcoming_matches': [],
            'recent_matches': [],
            'standings': [],
            'error': 'Liga nie została jeszcze pobrana przez system.',
        })

    upcoming_matches = (
        UpcomingMatch.objects
        .filter(league=league)
        .select_related('home_team', 'away_team')
        .order_by('start_datetime')[:10]
    )
    recent_matches = (
        LiveMatch.objects
        .filter(league=league, status__in=['ended', 'finished', 'after extra time', 'after penalties'])
        .select_related('home_team', 'away_team')
        .order_by('-match_date')[:10]
    )
    standings = (
        LeagueStandings.objects
        .filter(league=league)
        .select_related('team')
        .order_by('position')
    )

    return render(request, 'matches/league_detail.html', {
        'league': league,
        'upcoming_matches': upcoming_matches,
        'recent_matches': recent_matches,
        'standings': standings,
    })
