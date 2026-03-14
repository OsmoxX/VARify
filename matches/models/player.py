from django.db import models
from .team import Team


class Player(models.Model):
    api_id = models.IntegerField(unique=True)
    name = models.CharField(max_length=255)
    first_name = models.CharField(max_length=100, blank=True, null=True)
    last_name = models.CharField(max_length=100, blank=True, null=True)
    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name='players', null=True, blank=True)
    position = models.CharField(max_length=50, blank=True, null=True)
    jersey_number = models.IntegerField(blank=True, null=True)
    nationality = models.CharField(max_length=50, blank=True, null=True)
    date_of_birth = models.DateField(blank=True, null=True)
    height = models.IntegerField(blank=True, null=True)
    weight = models.IntegerField(blank=True, null=True)
    image_url = models.URLField(blank=True, null=True)
    preferred_foot = models.CharField(max_length=50, blank=True, null=True)
    market_value = models.BigIntegerField(blank=True, null=True)
    contract_until = models.DateField(blank=True, null=True)
    retired = models.BooleanField(default=False, help_text="Czy zawodnik jest emerytowany")

    def __str__(self):
        return self.name
