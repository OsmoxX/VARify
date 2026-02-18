from django.db import models

# Create your models here.
class League(models.Model):
    api_id = models.CharField(max_length=100, unique=True)
    name = models.CharField(max_length=255)

    def __str__(self):
        return self.name

class Team(models.Model):
    api_id = models.CharField(max_length=100, unique=True)
    name = models.CharField(max_length=255)

    def __str__(self):
        return self.name

class Match(models.Model):
    api_id = models.CharField(max_length=100, unique=True)
    league = models.ForeignKey(League, on_delete=models.CASCADE)
    home_team = models.ForeignKey(Team, related_name='home_matches', on_delete=models.CASCADE)
    away_team = models.ForeignKey(Team, related_name='away_matches', on_delete=models.CASCADE)
    home_score = models.IntegerField(default=0)
    away_score = models.IntegerField(default=0)
    status = models.CharField(max_length=50)

    def __str__(self):
        return f"{self.home_team} vs {self.away_team} ({self.status})"