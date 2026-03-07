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
from matches.views import match_detail_view, live_matches_view, HomeView, search_api_view, team_detail_view, upcoming_matches_view, player_detail, league_detail_view
from matches import views
from django.contrib.auth import views as auth_views

urlpatterns = [
    path('admin/', admin.site.urls),
    path('live/', live_matches_view, name='live_matches'),
    path('league/<int:api_id>/', league_detail_view, name='league_detail'),
    path('match/<int:match_id>/', match_detail_view, name='match_detail'),
    path('team/<int:team_id>/', team_detail_view, name='team_detail'),
    path('player/<int:api_id>/', player_detail, name='player_detail'),
    path('', HomeView.as_view(), name='home'),
    path('calendar/', upcoming_matches_view, name='calendar'),
    path('search-api/', search_api_view, name='search_api'),
    path('api/image/<str:entity_type>/<int:api_id>/', views.proxy_image_view, name='proxy_image'),
    path('toggle-notifications/', views.toggle_notifications, name='toggle_notifications'),
    path('api/active-match-ids/', views.active_match_ids, name='active_match_ids'),
    path('register/', views.register, name='register'),
    path('login/', auth_views.LoginView.as_view(template_name='matches/login.html', next_page='home'), name='login'),
    path('logout/', views.logout_view, name='logout'),
]
