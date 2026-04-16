"""
URL configuration for my_football_app project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based viewsx
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""

from django.contrib import admin
from django.urls import path, include
from matches.views import (
    match_detail_view,
    live_matches_view,
    HomeView,
    search_api_view,
    team_detail_view,
    upcoming_matches_view,
    player_detail,
    league_detail_view,
)
from matches import views
from django.contrib.auth import views as auth_views
from matches import api_views
from matches.views.ai_views import ai_chat_endpoint
from django.views.generic.base import RedirectView
from django.conf.urls.i18n import i18n_patterns
from typing import Any, cast
from django.views.generic import TemplateView

urlpatterns = [
    path("i18n/", include("django.conf.urls.i18n")),
    path("rosetta/", include("rosetta.urls")),
    # ── REST API ────────────────────────────────────────────────────────────────
    # Leagues
    path("api/leagues/", api_views.get_leagues, name="api_leagues"),
    path(
        "api/leagues/<str:api_id>/",
        api_views.get_league_detail,
        name="api_league_detail",
    ),
    path(
        "api/leagues/<str:api_id>/standings/",
        api_views.get_league_standings,
        name="api_league_standings",
    ),
    # Teams
    path("api/teams/", api_views.get_teams, name="api_teams"),
    path("api/teams/<int:api_id>/", api_views.get_team_detail, name="api_team_detail"),
    path(
        "api/teams/<int:api_id>/standings/",
        api_views.get_team_standings,
        name="api_team_standings",
    ),
    path(
        "api/teams/<int:api_id>/matches/",
        api_views.get_team_matches,
        name="api_team_matches",
    ),
    # Players
    path("api/players/", api_views.get_players, name="api_players"),
    path(
        "api/players/<int:api_id>/",
        api_views.get_player_detail,
        name="api_player_detail",
    ),
    # Live matches
    path("api/live-matches/", api_views.get_live_matches, name="api_live_matches"),
    path(
        "api/live-matches/<int:match_id>/",
        api_views.get_live_match_detail,
        name="api_live_match_detail",
    ),
    path(
        "api/live-matches/<int:match_id>/events/",
        api_views.get_match_events,
        name="api_match_events",
    ),
    path(
        "api/live-matches/<int:match_id>/lineups/",
        api_views.get_match_lineups,
        name="api_match_lineups",
    ),
    # Upcoming matches
    path(
        "api/upcoming-matches/",
        api_views.get_upcoming_matches,
        name="api_upcoming_matches",
    ),
    # Search
    path("api/search/", api_views.search, name="api_search"),
    # PWA
    path(
        "sw.js",
        TemplateView.as_view(
            template_name="matches/sw.js", content_type="application/javascript"
        ),
        name="sw.js",
    ),
    # WebPush
    path("webpush/", include("webpush.urls")),
]

urlpatterns.extend(
    cast(
        Any,
        i18n_patterns(
            path("admin/", admin.site.urls),
            path("live/", live_matches_view, name="live_matches"),
            path("league/<int:api_id>/", league_detail_view, name="league_detail"),
            path("match/<int:match_id>/", match_detail_view, name="match_detail"),
            path("team/<int:team_id>/", team_detail_view, name="team_detail"),
            path("player/<int:api_id>/", player_detail, name="player_detail"),
            path("", HomeView.as_view(), name="home"),
            path(
                "favicon.ico",
                RedirectView.as_view(url="/static/matches/favicon.ico", permanent=True),
            ),
            path("calendar/", upcoming_matches_view, name="calendar"),
            path("search-api/", search_api_view, name="search_api"),
            path(
                "api/image/<str:entity_type>/<int:api_id>/",
                views.proxy_image_view,
                name="proxy_image",
            ),
            path(
                "toggle-notifications/",
                views.toggle_notifications,
                name="toggle_notifications",
            ),
            path(
                "api/active-match-ids/", views.active_match_ids, name="active_match_ids"
            ),
            path("register/", views.register, name="register"),
            path(
                "login/",
                auth_views.LoginView.as_view(
                    template_name="matches/login.html", next_page="home"
                ),
                name="login",
            ),
            path("logout/", views.logout_view, name="logout"),
            path("account/", views.account_settings, name="account_settings"),
            path("", include("accounts.urls")),
            # ── ALLAUTH ────────────────────────────────────────────────────────────────
            # Włączamy wszystkie domyślne ścieżki z Allauth
            # To daje nam gotowe endpointy: /accounts/login/, /accounts/register/, /accounts/logout/ itd.
            path("accounts/", include("allauth.urls")),
            # ── AI AGENT ────────────────────────────────────────────────────────────────
            path("api/ai-chat/", ai_chat_endpoint, name="ai_chat_api"),
        ),
    )
)
