"""
views/__init__.py

Re-exports all view functions and classes so that:
  from matches.views import HomeView, match_detail_view, ...
  from matches import views; views.proxy_image_view, ...

...continue to work in urls.py without any changes.
"""

# Helpers & constants (also importable from here if needed)
from .helpers import TOP_LEAGUES_CONFIG, ENDED_STATUSES

# Match views
from .match_views import (
    live_matches_view,
    match_detail_view,
    HomeView,
    toggle_notifications,
    active_match_ids,
)

# Calendar / upcoming
from .calendar_views import CalendarView, upcoming_matches_view

# Domain detail pages
from .league_views import league_detail_view
from .team_views import team_detail_view
from .player_views import player_detail

# Auth
from .auth_views import register, logout_view

# Account settings
from .account_views import account_settings


# Utilities
from .utility_views import search_api_view, proxy_image_view

__all__ = [
    # Constants
    'TOP_LEAGUES_CONFIG',
    'ENDED_STATUSES',
    # Match
    'live_matches_view',
    'match_detail_view',
    'HomeView',
    'toggle_notifications',
    'active_match_ids',
    # Calendar
    'CalendarView',
    'upcoming_matches_view',
    # Domain details
    'league_detail_view',
    'team_detail_view',
    'player_detail',
    # Auth
    'register',
    'logout_view',
    # Utilities
    'search_api_view',
    'proxy_image_view',
]
