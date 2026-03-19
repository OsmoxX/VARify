"""
views/player_views.py

Player profile page – data is fetched by JS from the DRF API.
"""
from django.shortcuts import render


def player_detail(request, api_id):
    """Profil zawodnika — dane pobierane przez JS z DRF API (/api/players/<api_id>/)."""
    return render(request, 'matches/player_detail.html', {'api_id': api_id})
