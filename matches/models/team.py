from django.db import models
from django.contrib.auth import get_user_model

User = get_user_model()

class Team(models.Model):
    api_id = models.IntegerField(unique=True)
    name = models.CharField(max_length=255)
    logo_url = models.URLField(blank=True, null=True)

    def __str__(self):
        return self.name

class FavoriteTeam(models.Model):
    # Relacja do użytkownika
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='favorite_teams')
    
    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name='favorited_by')
    
    created_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        # Jeden użytkownik nie może polubić tej samej drużyny dwa razy
        unique_together = ('user', 'team')
        verbose_name = "Ulubiona drużyna"
        verbose_name_plural = "Ulubione drużyny"

    def __str__(self):
        status = "Aktywna" if self.is_active else "Wyciszona"
        return f"{self.user.username} - {self.team.name} ({status})"