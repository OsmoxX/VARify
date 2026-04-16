from django.db import models
from django.utils.translation import gettext_lazy as _
from .match import LiveMatch


class MatchEvent(models.Model):
    match = models.ForeignKey(
        LiveMatch, on_delete=models.CASCADE, related_name="events"
    )

    # Identyfikator z API (unikanie duplikatów)
    event_id = models.CharField(max_length=100, blank=True, null=True, db_index=True)

    # Typ i klasyfikacja zdarzenia
    incident_type = models.CharField(max_length=50)
    incident_class = models.CharField(
        max_length=50,
        blank=True,
        null=True,
        help_text="np. regular, ownGoal, penalty, missedPenalty, yellow, yellowRed, red",
    )

    # Czas
    time = models.IntegerField(help_text="Minuta podstawowa")
    added_time = models.IntegerField(default=0, blank=True, null=True)

    # Strona
    is_home_team = models.BooleanField(default=True)

    # Gracz główny (gol, kartka, varDecision)
    player_name = models.CharField(max_length=100, blank=True, null=True)

    # Asysty (gol)
    assist_player_name = models.CharField(max_length=100, blank=True, null=True)
    assist2_player_name = models.CharField(max_length=100, blank=True, null=True)

    # Zmiana
    player_in_name = models.CharField(max_length=100, blank=True, null=True)
    player_out_name = models.CharField(max_length=100, blank=True, null=True)
    injury = models.BooleanField(
        default=False, help_text="Czy zmiana spowodowana kontuzją"
    )

    # Kartka
    reason = models.CharField(
        max_length=255, blank=True, null=True, help_text="Powód kartki"
    )
    rescinded = models.BooleanField(
        default=False, help_text="Kartka anulowana przez VAR"
    )

    # Period (HT/FT)
    text = models.CharField(
        max_length=20, blank=True, null=True, help_text="np. HT, FT"
    )
    is_live = models.BooleanField(
        default=False, help_text="Czy marker period oznacza mecz live"
    )

    # Wynik bieżący (gol, period)
    home_score = models.IntegerField(blank=True, null=True)
    away_score = models.IntegerField(blank=True, null=True)

    # injuryTime
    length = models.IntegerField(
        blank=True, null=True, help_text="Doliczony czas (minuty)"
    )

    # varDecision
    confirmed = models.BooleanField(
        blank=True, null=True, help_text="VAR: czy decyzja potwierdzona"
    )

    # Stałe rozpoznawania typów
    _GOAL_TYPES = {
        "goal",
        "regular",
        "penalty",
        "ownGoal",
        "penaltyNotAwarded",
        "missedPenalty",
    }
    _CARD_TYPES = {"card", "yellow", "yellowRed", "red"}
    _SUB_TYPES = {"substitution"}
    _PERIOD_TYPES = {"period", "Unknown"}  # Old data stores periods as 'Unknown'
    _INJURY_TIME_TYPES = {"injuryTime"}

    @property
    def is_goal(self):
        """Czy to gol? Obsługuje stare dane (regular/penalty/ownGoal) i nowe (goal)."""
        if self.incident_type == "goal":
            return True
        if self.incident_type in ("regular", "penalty", "ownGoal"):
            return bool(self.player_name and self.player_name != "Nieznany")
        return False

    @property
    def is_card(self):
        """Czy to kartka?"""
        if self.incident_type == "card":
            return True
        return self.incident_type in ("yellow", "yellowRed", "red")

    @property
    def is_substitution(self):
        """Czy to zmiana?"""
        return self.incident_type == "substitution"

    @property
    def is_period_marker(self):
        """Czy to marker okresu (HT/FT)?"""
        if self.incident_type == "period":
            return True
        if (
            self.incident_type == "Unknown"
            and self.added_time
            and self.added_time >= 900
        ):
            return True
        return False

    @property
    def is_injury_time_announcement(self):
        return self.incident_type == "injuryTime"

    @property
    def is_var_decision(self):
        return self.incident_type == "varDecision"

    @property
    def is_in_game_penalty(self):
        """Karny dostawiony w grze przez sędziego (awarded/missed)."""
        return self.incident_type == "inGamePenalty"

    @property
    def formatted_time(self):
        if self.is_period_marker or self.is_injury_time_announcement:
            return ""
        if self.added_time and self.added_time > 0 and self.added_time < 900:
            return f"{self.time}+{self.added_time}"
        return str(self.time)

    @property
    def running_score(self):
        if self.home_score is not None and self.away_score is not None:
            return f"{self.home_score} - {self.away_score}"
        return ""

    @property
    def incident_class_label(self):
        """Zwraca czytelną etykietę dla incidentClass (lub dla starego incident_type)."""
        ic = self.incident_class
        if not ic and self.is_goal:
            ic = self.incident_type

        labels = {
            "ownGoal": _("samobój"),
            "penalty": _("karny"),
            "missedPenalty": _("niestrzelony karny"),
            "penaltyNotAwarded": _("karny nie uznany"),
            "yellowRed": _("2× żółta"),
        }
        return labels.get(ic or "", "")

    @property
    def side(self):
        if self.is_period_marker or self.is_injury_time_announcement:
            return "neutral"
        return "home" if self.is_home_team else "away"

    @property
    def card_color(self):
        """Kolor kartki – obsługa starego i nowego formatu."""
        if not self.is_card:
            return None
        color_source = self.incident_class or self.incident_type
        mapping = {
            "yellow": "yellow",
            "yellowRed": "yellow-red",
            "red": "red",
            "card": "yellow",  # fallback
        }
        return mapping.get(color_source, "yellow")

    @property
    def display_player_in(self):
        """Gracz wchodzący – fallback na player_name dla starych danych."""
        return self.player_in_name or self.player_name or ""

    @property
    def display_player_out(self):
        """Gracz schodzący – fallback na pusty string."""
        return self.player_out_name or ""

    class Meta:
        ordering = ["time", "added_time", "id"]
