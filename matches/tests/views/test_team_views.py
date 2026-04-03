import pytest
from django.test import Client
from django.contrib.auth.models import User
from matches.models import Team


@pytest.mark.django_db
def test_team_detail_view_success():
    # 1. ARRANGE: create a team and an authenticated user
    team = Team.objects.create(api_id=555, name="Test Team")
    user = User.objects.create_user(username="testuser", password="pass")

    client = Client()
    client.force_login(user)

    # 2. ACT
    response = client.get(f'/team/{team.id}/')

    # 3. ASSERT
    assert response.status_code == 200