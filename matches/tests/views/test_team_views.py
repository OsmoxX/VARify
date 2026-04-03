import pytest
from django.test import Client
from django.contrib.auth.models import User
from matches.models import Team
from accounts.models import Profile, SubscriptionTier


@pytest.mark.django_db
def test_team_detail_view_success():
    # 1. ARRANGE: create a team and a PLUS-tier user (view requires PLUS minimum)
    team = Team.objects.create(api_id=555, name="Test Team")
    user = User.objects.create_user(username="testuser", password="pass")
    profile, _ = Profile.objects.get_or_create(user=user)
    profile.tier = SubscriptionTier.PLUS
    profile.save()

    client = Client()
    client.force_login(user)

    # 2. ACT
    response = client.get(f'/team/{team.id}/')

    # 3. ASSERT
    assert response.status_code == 200