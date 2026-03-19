import pytest
from django.test import RequestFactory
from matches.models import Team
from matches.views.team_views import team_detail_view

@pytest.mark.django_db
def test_team_detail_view_success():
    # 1. ARRANGE: Musimy mieć drużynę w bazie, inaczej dostaniemy 404
    team = Team.objects.create(api_id=555, name="Test Team")
    factory = RequestFactory()
    request = factory.get(f'/team/{team.id}/')
    
    # 2. ACT
    response = team_detail_view(request, team_id=team.id)
    
    # 3. ASSERT
    assert response.status_code == 200
    assert b'555' in response.content