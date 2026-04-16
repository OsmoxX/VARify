from django.db import models
from .league import League
from .team import Team


class LiveMatch(models.Model):
    api_id = models.IntegerField(unique=True)

    league = models.ForeignKey(
        League, on_delete=models.CASCADE, related_name="matches", null=True, blank=True
    )
    home_team = models.ForeignKey(
        Team,
        on_delete=models.CASCADE,
        related_name="home_matches",
        null=True,
        blank=True,
    )
    away_team = models.ForeignKey(
        Team,
        on_delete=models.CASCADE,
        related_name="away_matches",
        null=True,
        blank=True,
    )

    country_name = models.CharField(max_length=100, blank=True, null=True)
    home_score = models.IntegerField(default=0)
    away_score = models.IntegerField(default=0)
    status = models.CharField(max_length=50)
    minute = models.IntegerField(
        default=0, help_text="Minuta meczu z ostatniej synchronizacji"
    )
    match_time = models.CharField(max_length=20, blank=True, null=True)
    home_formation = models.CharField(
        max_length=20,
        blank=True,
        null=True,
        help_text="Formacja gospodarzy, np. '4-3-3'",
    )
    away_formation = models.CharField(
        max_length=20, blank=True, null=True, help_text="Formacja gości, np. '4-4-2'"
    )
    stats_json = models.JSONField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)
    match_date = models.DateField(
        null=True, blank=True, help_text="Data meczu (z API startTimestamp)"
    )
    is_top = models.BooleanField(
        default=False, help_text="Czy mecz jest top z API lub wg własnej listy"
    )

    @property
    def updated_at_timestamp(self):
        """Unix timestamp (sekundy) dla JS."""
        if self.updated_at:
            return int(self.updated_at.timestamp())
        return 0

    def __str__(self):
        return f"{self.home_team} vs {self.away_team}"


class UpcomingMatch(models.Model):
    api_id = models.IntegerField(unique=True, help_text="ID meczu z RapidAPI")
    home_team = models.ForeignKey(
        Team,
        on_delete=models.CASCADE,
        related_name="upcoming_home_matches",
        null=True,
        blank=True,
    )
    away_team = models.ForeignKey(
        Team,
        on_delete=models.CASCADE,
        related_name="upcoming_away_matches",
        null=True,
        blank=True,
    )
    league = models.ForeignKey(
        League,
        on_delete=models.CASCADE,
        related_name="upcoming_matches",
        null=True,
        blank=True,
    )
    start_datetime = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Dokładna data i czas rozpoczęcia (z startTimestamp)",
    )
    updated_at = models.DateTimeField(auto_now=True)
    is_top = models.BooleanField(
        default=False, help_text="Czy mecz jest w top-competitions (z API eventFilters)"
    )

    @property
    def updated_at_timestamp(self):
        """Unix timestamp (sekundy) dla JS."""
        if self.updated_at:
            return int(self.updated_at.timestamp())
        return 0

    def __str__(self):
        return f"{self.home_team} vs {self.away_team}"


class MatchSubscription(models.Model):
    session_key = models.CharField(max_length=100)
    match = models.ForeignKey(
        LiveMatch, on_delete=models.CASCADE, related_name="subscriptions"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("session_key", "match")

    def __str__(self):
        return f"{self.session_key} - {self.match}"
