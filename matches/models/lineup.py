from django.db import models
from .match import LiveMatch


class MatchLineup(models.Model):
    match = models.ForeignKey(
        LiveMatch, on_delete=models.CASCADE, related_name="lineups"
    )
    player_name = models.CharField(max_length=100)
    player_api_id = models.IntegerField(blank=True, null=True)
    shirt_number = models.IntegerField(blank=True, null=True)
    position = models.CharField(max_length=50, blank=True, null=True)
    is_home_team = models.BooleanField(default=True)
    is_starting_xi = models.BooleanField(default=True)
    is_captain = models.BooleanField(default=False)
    avg_rating = models.CharField(
        max_length=10, blank=True, null=True, help_text="Średnia ocena gracza z API"
    )

    @property
    def position_label(self):
        """Skrócona etykieta pozycji."""
        labels = {
            "G": "GK",
            "D": "DEF",
            "M": "MID",
            "F": "FWD",
        }
        return labels.get(self.position or "", self.position or "")

    @property
    def is_goalkeeper(self):
        return self.position == "G"

    class Meta:
        unique_together = ("match", "player_name", "is_home_team")

    def __str__(self):
        team = "Home" if self.is_home_team else "Away"
        return f"{self.player_name} ({team}) - {self.match}"


class MissingPlayer(models.Model):
    match = models.ForeignKey(
        LiveMatch, on_delete=models.CASCADE, related_name="missing_players"
    )
    player_name = models.CharField(max_length=100)
    type = models.CharField(max_length=50)
    reason = models.CharField(max_length=255, blank=True, null=True)
    is_home_team = models.BooleanField(default=True)

    def __str__(self):
        team = "Home" if self.is_home_team else "Away"
        status = "Missing" if self.type == "missing" else "Doubtful"
        return f"{self.player_name} ({team}) - {status}"
