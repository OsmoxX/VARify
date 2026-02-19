from django.contrib import admin
from .models import League, Team, LiveMatch, MatchEvent, MatchLineup


class LeagueAdmin(admin.ModelAdmin):
    list_display = ('name', 'api_id')
    search_fields = ('name',)


class TeamAdmin(admin.ModelAdmin):
    list_display = ('name', 'api_id')
    search_fields = ('name',)


class MatchEventAdmin(admin.ModelAdmin):
    list_display = (
        'match', 'incident_type', 'incident_class', 'time', 'added_time',
        'player_name', 'is_home_team', 'assist_player_name',
        'rescinded', 'event_id',
    )
    list_filter = ('incident_type', 'incident_class', 'rescinded', 'is_home_team')
    search_fields = (
        'match__home_team__name', 'match__away_team__name',
        'incident_type', 'player_name', 'event_id',
    )


class LiveMatchAdmin(admin.ModelAdmin):
    list_display = ('home_team', 'away_team', 'home_score', 'away_score', 'status')
    search_fields = ('home_team__name', 'away_team__name', 'status')


class MatchLineupAdmin(admin.ModelAdmin):
    list_display = (
        'match', 'player_name', 'shirt_number', 'position',
        'is_home_team', 'is_starting_xi', 'is_captain', 'avg_rating',
    )
    list_filter = ('is_home_team', 'is_starting_xi', 'is_captain', 'position')
    search_fields = ('player_name', 'match__home_team__name', 'match__away_team__name')


admin.site.register(League, LeagueAdmin)
admin.site.register(Team, TeamAdmin)
admin.site.register(LiveMatch, LiveMatchAdmin)
admin.site.register(MatchEvent, MatchEventAdmin)
admin.site.register(MatchLineup, MatchLineupAdmin)
