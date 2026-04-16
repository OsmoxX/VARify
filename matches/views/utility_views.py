"""
views/utility_views.py

Search results page and image proxy view.
"""

import logging
import os

import requests
from django.contrib.auth.decorators import login_not_required
from django.http import Http404, HttpResponse
from django.shortcuts import render

from matches.models import CachedImage

logger = logging.getLogger(__name__)


def search_api_view(request):
    """Renderuje stronę wyników wyszukiwania (dane pobierane przez JS z /api/search/)."""
    return render(request, "matches/search_results.html")


@login_not_required
def proxy_image_view(request, entity_type, api_id):
    """
    Serwuje herb drużyny / zdjęcie zawodnika.
    Priorytet: baza danych (CachedImage) → zewnętrzne API.
    """
    if entity_type not in ("player", "team"):
        raise Http404("Nieznany typ obrazka")

    try:
        cached = CachedImage.objects.get(entity_type=entity_type, api_id=api_id)
        logger.info("DB CACHE HIT: %s %s (0 zapytań API)", entity_type, api_id)
        return HttpResponse(bytes(cached.content), content_type=cached.content_type)
    except CachedImage.DoesNotExist:
        pass

    logger.warning(
        "API HIT: pobieram %s %s z RapidAPI (-1 z limitu)", entity_type, api_id
    )
    url = f"https://sportapi7.p.rapidapi.com/api/v1/{entity_type}/{api_id}/image"
    headers = {
        "x-rapidapi-key": os.getenv("SPORT_API_KEY"),
        "x-rapidapi-host": os.getenv("SPORT_API_HOST", "sportapi7.p.rapidapi.com"),
    }

    try:
        response = requests.get(url, headers=headers, timeout=5)
        if response.status_code != 200:
            return HttpResponse(status=404)
        content_type = response.headers.get("Content-Type", "image/jpeg")
        CachedImage.objects.create(
            entity_type=entity_type,
            api_id=api_id,
            content=response.content,
            content_type=content_type,
        )
        logger.info("Zapisano %s %s do bazy danych", entity_type, api_id)
        return HttpResponse(response.content, content_type=content_type)
    except Exception:
        return HttpResponse(status=404)
