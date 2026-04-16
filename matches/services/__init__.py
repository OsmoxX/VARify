"""
services/__init__.py

Re-exports the public API of the services package so that all existing
imports like `from matches.services import fetch_match_details` continue
to work without any changes to views.py, tasks.py, or api_views.py.
"""

from .player_service import fetch_player, search_players_from_api
from .football_api_service import search_teams_from_api
from .match_service import (
    sync_live_matches,
    fetch_live_matches,
    fetch_match_details,
    fetch_upcoming_matches,
    fetch_last_matches_for_team,
)
from .standings_service import fetch_league_standings

__all__ = [
    "fetch_player",
    "search_players_from_api",
    "search_teams_from_api",
    "sync_live_matches",
    "fetch_live_matches",
    "fetch_match_details",
    "fetch_upcoming_matches",
    "fetch_last_matches_for_team",
    "fetch_league_standings",
]
