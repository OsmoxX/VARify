import pytest
from django.test import Client
from django.urls import reverse
from django.contrib.auth.models import User
from matches.models import Team
from accounts.models import Profile, SubscriptionTier


def _make_user_with_tier(username: str, tier) -> User:
    """Helper: create a user and set their subscription tier."""
    user = User.objects.create_user(username=username, password="pass")
    tier_str = tier.value if hasattr(tier, "value") else str(tier)
    Profile.objects.get_or_create(user=user)
    Profile.objects.filter(user=user).update(tier=tier_str)
    return User.objects.get(id=user.id)


@pytest.mark.django_db
def test_team_detail_view_success():
    """PLUS user can access team detail page (view requires PLUS minimum)."""
    team = Team.objects.create(api_id=555, name="Test Team")
    user = _make_user_with_tier("testuser_plus", SubscriptionTier.PLUS)

    client = Client()
    client.force_login(user)

    url = reverse("team_detail", args=[team.id])
    response = client.get(url)

    assert response.status_code == 200


@pytest.mark.django_db
def test_team_detail_view_free_user_redirected():
    """FREE user is redirected to /subscribe/ — access control working correctly."""
    team = Team.objects.create(api_id=556, name="Test Team 2")
    user = _make_user_with_tier("testuser_free", SubscriptionTier.FREE)

    client = Client()
    client.force_login(user)

    url = reverse("team_detail", args=[team.id])
    response = client.get(url)

    assert response.status_code == 302
    assert "/subscribe/" in response["Location"]
