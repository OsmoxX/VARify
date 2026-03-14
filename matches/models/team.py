from django.db import models


class Team(models.Model):
    api_id = models.IntegerField(unique=True)
    name = models.CharField(max_length=255)
    logo_url = models.URLField(blank=True, null=True)

    def __str__(self):
        return self.name
