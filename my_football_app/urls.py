"""
URL configuration for my_football_app project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import include, path
from matches.views import match_detail_view, live_matches_view, HomeView, search_api_view, team_detail_view

urlpatterns = [
    path('admin/', admin.site.urls),
    path('live/', live_matches_view, name='live_matches'),
    path('match/<int:match_id>/', match_detail_view, name='match_detail'),
    path('team/<int:team_id>/', team_detail_view, name='team_detail'),
    path('', HomeView.as_view(), name='home'),
    path('search-api/', search_api_view, name='search_api'),
]
