from rest_framework import serializers
from .models import (
    League,
    LeagueStandings,
    LiveMatch,
    UpcomingMatch,
    Team,
    Player,
    MatchEvent,
    MatchLineup,
    MissingPlayer,
)


# ─────────────────────────────────────────────
# LEAGUE
# ─────────────────────────────────────────────
class LeagueSerializer(serializers.ModelSerializer):
    class Meta:
        model = League
        fields = ["id", "api_id", "name", "country"]


# ─────────────────────────────────────────────
# TEAM
# ─────────────────────────────────────────────
class TeamSerializer(serializers.ModelSerializer):
    class Meta:
        model = Team
        fields = ["id", "api_id", "name", "logo_url"]


# ─────────────────────────────────────────────
# PLAYER
# ─────────────────────────────────────────────
class PlayerSerializer(serializers.ModelSerializer):
    team_name = serializers.SerializerMethodField()

    class Meta:
        model = Player
        fields = [
            "id",
            "api_id",
            "name",
            "first_name",
            "last_name",
            "team_name",
            "position",
            "jersey_number",
            "nationality",
            "date_of_birth",
            "height",
            "weight",
            "image_url",
            "preferred_foot",
            "market_value",
            "contract_until",
            "retired",
        ]

    def get_team_name(self, obj):
        return obj.team.name if obj.team else None


# ─────────────────────────────────────────────
# LEAGUE STANDINGS
# ─────────────────────────────────────────────
class LeagueStandingsSerializer(serializers.ModelSerializer):
    team = serializers.CharField(source="team.name", read_only=True)
    team_id = serializers.IntegerField(source="team.id", read_only=True)
    team_api_id = serializers.IntegerField(source="team.api_id", read_only=True)
    league = serializers.CharField(source="league.name", read_only=True)
    league_api_id = serializers.CharField(source="league.api_id", read_only=True)

    class Meta:
        model = LeagueStandings
        fields = [
            "position",
            "team",
            "team_id",
            "team_api_id",
            "league",
            "league_api_id",
            "points",
            "matches_played",
            "matches_won",
            "matches_drawn",
            "matches_lost",
            "goals_for",
            "goals_against",
            "goal_difference",
        ]


# ─────────────────────────────────────────────
# MATCH EVENT
# ─────────────────────────────────────────────
class MatchEventSerializer(serializers.ModelSerializer):
    formatted_time = serializers.ReadOnlyField()
    running_score = serializers.ReadOnlyField()
    incident_class_label = serializers.ReadOnlyField()
    is_goal = serializers.ReadOnlyField()
    is_card = serializers.ReadOnlyField()
    is_substitution = serializers.ReadOnlyField()
    is_period_marker = serializers.ReadOnlyField()
    is_in_game_penalty = serializers.ReadOnlyField()
    card_color = serializers.ReadOnlyField()
    side = serializers.ReadOnlyField()

    class Meta:
        model = MatchEvent
        fields = [
            "id",
            "incident_type",
            "incident_class",
            "incident_class_label",
            "time",
            "added_time",
            "formatted_time",
            "is_home_team",
            "side",
            "player_name",
            "assist_player_name",
            "assist2_player_name",
            "player_in_name",
            "player_out_name",
            "injury",
            "reason",
            "rescinded",
            "text",
            "is_live",
            "home_score",
            "away_score",
            "running_score",
            "length",
            "confirmed",
            "is_goal",
            "is_card",
            "is_substitution",
            "is_period_marker",
            "is_in_game_penalty",
            "card_color",
        ]


# ─────────────────────────────────────────────
# MATCH LINEUP
# ─────────────────────────────────────────────
class MatchLineupSerializer(serializers.ModelSerializer):
    position_label = serializers.ReadOnlyField()

    class Meta:
        model = MatchLineup
        fields = [
            "id",
            "player_name",
            "player_api_id",
            "shirt_number",
            "position",
            "position_label",
            "is_home_team",
            "is_starting_xi",
            "is_captain",
            "avg_rating",
        ]


# ─────────────────────────────────────────────
# MISSING PLAYER
# ─────────────────────────────────────────────
class MissingPlayerSerializer(serializers.ModelSerializer):
    class Meta:
        model = MissingPlayer
        fields = ["id", "player_name", "type", "reason", "is_home_team"]


# ─────────────────────────────────────────────
# LIVE MATCH (list / lightweight)
# ─────────────────────────────────────────────
class LiveMatchSerializer(serializers.ModelSerializer):
    home_team = serializers.SerializerMethodField()
    home_team_api_id = serializers.SerializerMethodField()
    away_team = serializers.SerializerMethodField()
    away_team_api_id = serializers.SerializerMethodField()
    league_name = serializers.SerializerMethodField()
    league_country = serializers.SerializerMethodField()
    league_api_id = serializers.SerializerMethodField()
    match_url = serializers.SerializerMethodField()

    class Meta:
        model = LiveMatch
        fields = [
            "id",
            "api_id",
            "home_team",
            "home_team_api_id",
            "away_team",
            "away_team_api_id",
            "home_score",
            "away_score",
            "status",
            "minute",
            "match_date",
            "is_top",
            "league_name",
            "league_country",
            "league_api_id",
            "country_name",
            "match_url",
        ]

    def get_home_team(self, obj):
        return obj.home_team.name if obj.home_team else ""

    def get_home_team_api_id(self, obj):
        return obj.home_team.api_id if obj.home_team else None

    def get_away_team(self, obj):
        return obj.away_team.name if obj.away_team else ""

    def get_away_team_api_id(self, obj):
        return obj.away_team.api_id if obj.away_team else None

    def get_league_name(self, obj):
        return obj.league.name if obj.league else ""

    def get_league_country(self, obj):
        return (obj.league.country or "") if obj.league else ""

    def get_league_api_id(self, obj):
        return obj.league.api_id if obj.league else None

    def get_match_url(self, obj):
        return f"/match/{obj.id}/"


# ─────────────────────────────────────────────
# LIVE MATCH DETAIL (with events, lineups, stats)
# ─────────────────────────────────────────────
class LiveMatchDetailSerializer(LiveMatchSerializer):
    events = MatchEventSerializer(many=True, read_only=True)
    lineups = MatchLineupSerializer(many=True, read_only=True)
    missing_players = MissingPlayerSerializer(many=True, read_only=True)
    home_formation = serializers.CharField(read_only=True)
    away_formation = serializers.CharField(read_only=True)

    class Meta(LiveMatchSerializer.Meta):
        fields = LiveMatchSerializer.Meta.fields + [
            "home_formation",
            "away_formation",
            "stats_json",
            "events",
            "lineups",
            "missing_players",
        ]


# ─────────────────────────────────────────────
# UPCOMING MATCH
# ─────────────────────────────────────────────
class UpcomingMatchSerializer(serializers.ModelSerializer):
    home_team = serializers.SerializerMethodField()
    home_team_api_id = serializers.SerializerMethodField()
    away_team = serializers.SerializerMethodField()
    away_team_api_id = serializers.SerializerMethodField()
    league_name = serializers.SerializerMethodField()
    league_country = serializers.SerializerMethodField()
    league_api_id = serializers.SerializerMethodField()
    start_time = serializers.SerializerMethodField()

    class Meta:
        model = UpcomingMatch
        fields = [
            "id",
            "api_id",
            "home_team",
            "home_team_api_id",
            "away_team",
            "away_team_api_id",
            "start_datetime",
            "start_time",
            "is_top",
            "league_name",
            "league_country",
            "league_api_id",
        ]

    def get_home_team(self, obj):
        return obj.home_team.name if obj.home_team else ""

    def get_home_team_api_id(self, obj):
        return obj.home_team.api_id if obj.home_team else None

    def get_away_team(self, obj):
        return obj.away_team.name if obj.away_team else ""

    def get_away_team_api_id(self, obj):
        return obj.away_team.api_id if obj.away_team else None

    def get_league_name(self, obj):
        return obj.league.name if obj.league else ""

    def get_league_country(self, obj):
        return (obj.league.country or "") if obj.league else ""

    def get_league_api_id(self, obj):
        return obj.league.api_id if obj.league else None

    def get_start_time(self, obj):
        if obj.start_datetime:
            return obj.start_datetime.strftime("%H:%M")
        return ""
