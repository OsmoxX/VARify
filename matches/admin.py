from django.contrib import admin
from .models import League, Team, Match

class LeagueAdmin(admin.ModelAdmin):
    list_display = ('name', 'api_id')
    search_fields = ('name',)


class TeamAdmin(admin.ModelAdmin):
    list_display = ('name', 'api_id')
    search_fields = ('name',)


class MatchAdmin(admin.ModelAdmin):
    list_display = ('home_team', 'away_team', 'status')
    search_fields = ('home_team__name', 'away_team__name', 'status')


admin.site.register(League, LeagueAdmin)
admin.site.register(Team, TeamAdmin)
admin.site.register(Match, MatchAdmin)
