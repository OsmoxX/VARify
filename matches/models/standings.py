from django.db import models
from .league import League
from .team import Team


class LeagueStandings(models.Model):
    league = models.ForeignKey(League, on_delete=models.CASCADE, related_name='standings')
    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name='standings')
    position = models.IntegerField()
    points = models.IntegerField()
    matches_played = models.IntegerField()
    matches_won = models.IntegerField()
    matches_drawn = models.IntegerField()
    matches_lost = models.IntegerField()
    goals_for = models.IntegerField()
    goals_against = models.IntegerField()
    goal_difference = models.IntegerField()
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.team} - {self.league}"
