"""
api_views/__init__.py

Re-exports all DRF API view functions so that:
  from matches import api_views
  api_views.get_leagues, api_views.get_teams, ...

...continue to work in urls.py without any changes.
"""
from rest_framework.pagination import PageNumberPagination
from .league_api import get_leagues, get_league_detail, get_league_standings
from .team_api import get_teams, get_team_detail, get_team_standings, get_team_matches
from .player_api import get_players, get_player_detail
from .match_api import (
    get_live_matches,
    get_live_match_detail,
    get_match_events,
    get_match_lineups,
    get_upcoming_matches,
)
from .search_api import search

__all__ = [
    # Leagues
    'get_leagues',
    'get_league_detail',
    'get_league_standings',
    # Teams
    'get_teams',
    'get_team_detail',
    'get_team_standings',
    'get_team_matches',
    # Players
    'get_players',
    'get_player_detail',
    # Matches
    'get_live_matches',
    'get_live_match_detail',
    'get_match_events',
    'get_match_lineups',
    'get_upcoming_matches',
    # Search
    'search',
]
