"""
views/team_views.py

Team detail page – data is fetched by JS from the DRF API.
"""

from django.shortcuts import get_object_or_404, render
from matches.models import Team, FavoriteTeam
from accounts.decorators import require_tier
from accounts.models import SubscriptionTier


@require_tier(SubscriptionTier.PLUS)
def team_detail_view(request, team_id):
    """Strona drużyny — dane pobierane przez JS z DRF API (/api/teams/<api_id>/)."""
    team = get_object_or_404(Team, id=team_id)

    is_favorite = False
    if request.user.is_authenticated:
        is_favorite = FavoriteTeam.objects.filter(
            user=request.user, team=team
        ).exists()

    return render(request, "matches/team_detail.html", {
        "api_id": team.api_id,
        "team_id": team.pk,
        "is_favorite": is_favorite,
    })
