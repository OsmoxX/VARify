"""
views/calendar_views.py

Calendar (ended matches) and upcoming matches views.
"""
from collections import defaultdict, OrderedDict

from django.contrib.auth.mixins import LoginRequiredMixin
from django.shortcuts import render
from django.views.generic import ListView
from collections import OrderedDict

from matches.models import LiveMatch, UpcomingMatch

from .helpers import TOP_LEAGUES_CONFIG, _build_league_groups, _league_entry


class CalendarView(LoginRequiredMixin, ListView):
    """Kalendarz zakończonych meczów pogrupowanych wg daty, kraju i ligi."""

    model = LiveMatch
    template_name = 'matches/calendar.html'
    context_object_name = 'matches'

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        ended_matches = (
            LiveMatch.objects
            .select_related('league', 'home_team', 'away_team')
            .filter(status='Ended')
            .order_by('-match_date', 'league__name')
        )

        days_data: OrderedDict = OrderedDict()
        for match in ended_matches:
            day = match.match_date or 'Brak daty'
            country = match.country_name or (match.league.country if match.league else None) or 'Inne'
            league_name = match.league.name if match.league else 'Nieznana Liga'
            days_data.setdefault(day, defaultdict(lambda: defaultdict(list)))[country][league_name].append(match)

        structured_days = []
        for day, countries in days_data.items():
            leagues_list = []
            league_names_set = set()
            for country, leagues in countries.items():
                for league_name, matches in leagues.items():
                    leagues_list.append({'name': league_name, 'country': country, 'matches': matches})
                    league_names_set.add(league_name)
            structured_days.append({
                'date': day,
                'leagues': leagues_list,
                'league_names': sorted(league_names_set),
            })

        all_league_names = sorted({
            league['name']
            for day in structured_days
            for league in day['leagues']
        })
        context['structured_days'] = structured_days
        context['all_league_names'] = all_league_names
        return context


def upcoming_matches_view(request):
    """Widok nadchodzących meczów pogrupowanych wg ligi."""
    upcoming = (
        UpcomingMatch.objects
        .select_related('home_team', 'away_team', 'league')
        .order_by('start_datetime', 'id')
    )
    matches_by_api_id = _build_league_groups(upcoming)

    grouped_leagues = []

    for api_id, name, country in TOP_LEAGUES_CONFIG:
        data = matches_by_api_id.pop(api_id, None)
        entry_data = data if data else {'name': name, 'country': country, 'matches': []}
        grouped_leagues.append(_league_entry(entry_data, country=country, is_top=True))

    top_other = sorted(
        [d for d in matches_by_api_id.values() if d.get('is_top')],
        key=lambda x: x['name'],
    )
    for data in top_other:
        grouped_leagues.append(_league_entry(data, is_top=True))

    non_top = sorted(
        [d for d in matches_by_api_id.values() if not d.get('is_top')],
        key=lambda x: x['name'],
    )
    for data in non_top:
        grouped_leagues.append(_league_entry(data, is_top=False))

    return render(request, 'matches/calendar.html', {
        'grouped_leagues': grouped_leagues,
        'all_league_names': [lg['display_name'] for lg in grouped_leagues],
    })
