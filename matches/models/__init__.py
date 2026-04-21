"""
models/__init__.py

Re-exports all model classes so that the rest of the codebase
(and Django itself) can continue to use:
    from matches.models import League, Team, LiveMatch, ...
"""

from .league import League
from .team import Team, FavoriteTeam
from .player import Player
from .match import LiveMatch, UpcomingMatch, MatchSubscription
from .event import MatchEvent
from .lineup import MatchLineup, MissingPlayer
from .image import CachedImage
from .standings import LeagueStandings


__all__ = [
    "League",
    "Team",
    "Player",
    "LiveMatch",
    "UpcomingMatch",
    "MatchSubscription",
    "MatchEvent",
    "MatchLineup",
    "MissingPlayer",
    "CachedImage",
    "LeagueStandings",
    "FavoriteTeam",
]
