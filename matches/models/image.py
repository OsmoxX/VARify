from django.db import models


class CachedImage(models.Model):
    """
    Trwały cache obrazków (herby drużyn, zdjęcia zawodników) w bazie danych.
    Pobiera z API tylko raz — potem serwuje z bazy (0 zapytań API).
    """

    entity_type = models.CharField(max_length=20)
    api_id = models.IntegerField()
    content = models.BinaryField()
    content_type = models.CharField(max_length=100, default="image/jpeg")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("entity_type", "api_id")

    def __str__(self):
        return f"CachedImage({self.entity_type}, {self.api_id})"
