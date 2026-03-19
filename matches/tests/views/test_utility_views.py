import pytest
from django.test import RequestFactory
from django.http import Http404
from unittest.mock import patch, MagicMock
from matches.models import CachedImage
from matches.views.utility_views import search_api_view, proxy_image_view

# ==========================================
# TESTY: UTILITY VIEWS
# ==========================================

@pytest.mark.django_db
def test_search_api_view():
    factory = RequestFactory()
    request = factory.get('/search/')
    # To po prostu renderuje pusty szablon
    response = search_api_view(request)
    assert response.status_code == 200

@pytest.mark.django_db
def test_proxy_image_invalid_type():
    factory = RequestFactory()
    request = factory.get('/proxy/invalid/1/')
    # Sprawdzamy, czy rzuca 404 dla nieznanego typu (linia 31)
    with pytest.raises(Http404):
        proxy_image_view(request, 'invalid', 1)

@pytest.mark.django_db
def test_proxy_image_cache_hit():
    # 1. ARRANGE: Tworzymy obrazek w bazie
    CachedImage.objects.create(
        entity_type='team',
        api_id=123,
        content=b'fake-image-binary',
        content_type='image/png'
    )
    factory = RequestFactory()
    request = factory.get('/proxy/team/123/')
    
    # 2. ACT
    response = proxy_image_view(request, 'team', 123)
    
    # 3. ASSERT: Powinno zwrócić dane z bazy (linia 36)
    assert response.status_code == 200
    assert response.content == b'fake-image-binary'
    assert response['Content-Type'] == 'image/png'

@pytest.mark.django_db
@patch('matches.views.utility_views.requests.get')
def test_proxy_image_api_success(mock_get):
    # 1. ARRANGE: Udajemy odpowiedź z API
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.content = b'new-api-image'
    mock_response.headers = {'Content-Type': 'image/jpeg'}
    mock_get.return_value = mock_response
    
    factory = RequestFactory()
    request = factory.get('/proxy/player/456/')
    
    # 2. ACT
    response = proxy_image_view(request, 'player', 456)
    
    # 3. ASSERT: Sprawdzamy czy zapisało do bazy i zwróciło obrazek
    assert response.status_code == 200
    assert response.content == b'new-api-image'
    assert CachedImage.objects.filter(entity_type='player', api_id=456).exists()

@pytest.mark.django_db
@patch('matches.views.utility_views.requests.get')
def test_proxy_image_api_fail_or_exception(mock_get):
    factory = RequestFactory()
    request = factory.get('/proxy/team/789/')
    
    # Scenariusz A: Status inny niż 200
    mock_get.return_value.status_code = 404
    response = proxy_image_view(request, 'team', 789)
    assert response.status_code == 404
    
    # Scenariusz B: Wyjątek sieciowy (linia 62)
    mock_get.side_effect = Exception("API Timeout")
    response = proxy_image_view(request, 'team', 789)
    assert response.status_code == 404