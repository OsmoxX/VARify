"""
views/favorite_teams_view.py

View for the "My Favorite Teams" management page.
"""

from django.contrib.auth.decorators import login_required
from django.db.models import Q
from django.shortcuts import render

from ..models.team import Team


# ── Drużyny piłkarskie — te, które mają co najmniej jeden mecz w bazie
# (LiveMatch lub UpcomingMatch zasilane są wyłącznie z endpointu /sport/football/)
FOOTBALL_TEAMS_Q = (
    Q(home_matches__isnull=False)
    | Q(away_matches__isnull=False)
    | Q(upcoming_home_matches__isnull=False)
    | Q(upcoming_away_matches__isnull=False)
)


@login_required
def favorite_teams_list(request):
    """
    Displays:
      - The user's favorite teams (with unstar buttons).
      - A search form to find other football teams (DB-only, football-filtered).
    """
    # ── Ulubione drużyny zalogowanego użytkownika ──
    favorites = (
        request.user.favorite_teams
        .select_related("team")
        .order_by("team__name")
    )

    # ── Zbiór obiektów Team w ulubionych (do szybkiego sprawdzania w szablonie) ──
    favorite_team_objects = Team.objects.filter(
        favorited_by__user=request.user
    )

    # ── Wyszukiwanie drużyn piłkarskich ──
    query = request.GET.get("q", "").strip()
    search_results = None

    if query:
        search_results = (
            Team.objects
            # Filtruj po nazwie
            .filter(Q(name__icontains=query))
            # Ogranicz do drużyn piłkarskich (mają mecze w naszej bazie)
            .filter(FOOTBALL_TEAMS_Q)
            .distinct()
            .order_by("name")[:30]
        )

    context = {
        "favorites": favorites,
        "favorite_team_objects": favorite_team_objects,
        "search_results": search_results,
        "query": query,
    }
    return render(request, "matches/favorite_teams.html", context)

