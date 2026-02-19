from django.db import models


class League(models.Model):
    api_id = models.CharField(max_length=100, unique=True)
    name = models.CharField(max_length=255)
    country = models.CharField(max_length=100, blank=True, null=True)

    def __str__(self):
        return self.name


class Team(models.Model):
    api_id = models.IntegerField(unique=True)
    name = models.CharField(max_length=255)
    logo_url = models.URLField(blank=True, null=True)

    def __str__(self):
        return self.name


class LiveMatch(models.Model):
    api_id = models.IntegerField(unique=True)

    league = models.ForeignKey(League, on_delete=models.CASCADE, related_name='matches', null=True, blank=True)
    home_team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name='home_matches', null=True, blank=True)
    away_team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name='away_matches', null=True, blank=True)

    country_name = models.CharField(max_length=100, blank=True, null=True)
    home_score = models.IntegerField(default=0)
    away_score = models.IntegerField(default=0)
    status = models.CharField(max_length=50)
    match_time = models.CharField(max_length=20, blank=True, null=True)
    home_formation = models.CharField(max_length=20, blank=True, null=True, help_text="Formacja gospodarzy, np. '4-3-3'")
    away_formation = models.CharField(max_length=20, blank=True, null=True, help_text="Formacja gości, np. '4-4-2'")

    def __str__(self):
        return f"{self.home_team} vs {self.away_team}"


class MatchEvent(models.Model):
    match = models.ForeignKey(LiveMatch, on_delete=models.CASCADE, related_name='events')

    # Identyfikator z API (unikanie duplikatów)
    event_id = models.CharField(max_length=100, blank=True, null=True, db_index=True)

    # Typ i klasyfikacja zdarzenia
    incident_type = models.CharField(max_length=50)
    incident_class = models.CharField(max_length=50, blank=True, null=True,
                                      help_text="np. regular, ownGoal, penalty, missedPenalty, yellow, yellowRed, red")

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
    injury = models.BooleanField(default=False, help_text="Czy zmiana spowodowana kontuzją")

    # Kartka
    reason = models.CharField(max_length=255, blank=True, null=True, help_text="Powód kartki")
    rescinded = models.BooleanField(default=False, help_text="Kartka anulowana przez VAR")

    # Period (HT/FT)
    text = models.CharField(max_length=20, blank=True, null=True, help_text="np. HT, FT")
    is_live = models.BooleanField(default=False, help_text="Czy marker period oznacza mecz live")

    # Wynik bieżący (gol, period)
    home_score = models.IntegerField(blank=True, null=True)
    away_score = models.IntegerField(blank=True, null=True)

    # injuryTime
    length = models.IntegerField(blank=True, null=True, help_text="Doliczony czas (minuty)")

    # varDecision
    confirmed = models.BooleanField(blank=True, null=True, help_text="VAR: czy decyzja potwierdzona")

    # ========================
    # Właściwości pomocnicze – obsługują zarówno stare dane (gdzie incidentClass
    # był zapisywany jako incident_type), jak i nowe dane (poprawne incidentType)
    # ========================

    # --- Stałe rozpoznawania typów ---
    _GOAL_TYPES = {'goal', 'regular', 'penalty', 'ownGoal', 'penaltyNotAwarded', 'missedPenalty'}
    _CARD_TYPES = {'card', 'yellow', 'yellowRed', 'red'}
    _SUB_TYPES = {'substitution'}
    _PERIOD_TYPES = {'period', 'Unknown'}  # Old data stores periods as 'Unknown'
    _INJURY_TIME_TYPES = {'injuryTime'}

    @property
    def is_goal(self):
        """Czy to gol? Obsługuje stare dane (regular/penalty/ownGoal) i nowe (goal)."""
        if self.incident_type == 'goal':
            return True
        # Stare dane: incident_type = incidentClass
        if self.incident_type in ('regular', 'penalty', 'ownGoal'):
            # Upewnij się, że to nie jest inny typ zdarzenia
            return bool(self.player_name and self.player_name != 'Nieznany')
        return False

    @property
    def is_card(self):
        """Czy to kartka?"""
        if self.incident_type == 'card':
            return True
        # Stare dane: incident_type = 'yellow' / 'red' / 'yellowRed'
        return self.incident_type in ('yellow', 'yellowRed', 'red')

    @property
    def is_substitution(self):
        """Czy to zmiana?"""
        return self.incident_type == 'substitution'

    @property
    def is_period_marker(self):
        """Czy to marker okresu (HT/FT)?"""
        if self.incident_type == 'period':
            return True
        # Stare dane: 'Unknown' z addedTime=999 i player='Nieznany'
        if self.incident_type == 'Unknown' and self.added_time and self.added_time >= 900:
            return True
        return False

    @property
    def is_injury_time_announcement(self):
        return self.incident_type == 'injuryTime'

    @property
    def is_var_decision(self):
        return self.incident_type == 'varDecision'

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
        # Sprawdź incident_class (nowe dane)
        ic = self.incident_class
        # Jeśli brak, użyj incident_type (stare dane)
        if not ic and self.is_goal:
            ic = self.incident_type

        labels = {
            'ownGoal': 'samobój',
            'penalty': 'karny',
            'missedPenalty': 'niestrzelony karny',
            'penaltyNotAwarded': 'karny nie uznany',
            'yellowRed': '2× żółta',
        }
        return labels.get(ic, '')

    @property
    def side(self):
        if self.is_period_marker or self.is_injury_time_announcement:
            return 'neutral'
        return 'home' if self.is_home_team else 'away'

    @property
    def card_color(self):
        """Kolor kartki – obsługa starego i nowego formatu."""
        if not self.is_card:
            return None
        # Nowe dane: incident_type='card', kolor w incident_class
        color_source = self.incident_class or self.incident_type
        mapping = {
            'yellow': 'yellow',
            'yellowRed': 'yellow-red',
            'red': 'red',
            'card': 'yellow',  # fallback
        }
        return mapping.get(color_source, 'yellow')

    @property
    def display_player_in(self):
        """Gracz wchodzący – fallback na player_name dla starych danych."""
        return self.player_in_name or self.player_name or ''

    @property
    def display_player_out(self):
        """Gracz schodzący – fallback na pusty string."""
        return self.player_out_name or ''

    class Meta:
        ordering = ['time', 'added_time', 'id']


class MatchLineup(models.Model):
    match = models.ForeignKey(LiveMatch, on_delete=models.CASCADE, related_name='lineups')
    player_name = models.CharField(max_length=100)
    player_api_id = models.IntegerField(blank=True, null=True)
    shirt_number = models.IntegerField(blank=True, null=True)
    position = models.CharField(max_length=50, blank=True, null=True)
    is_home_team = models.BooleanField(default=True)
    is_starting_xi = models.BooleanField(default=True)
    is_captain = models.BooleanField(default=False)
    avg_rating = models.CharField(max_length=10, blank=True, null=True, help_text="Średnia ocena gracza z API")

    @property
    def position_label(self):
        """Skrócona etykieta pozycji."""
        labels = {
            'G': 'GK',
            'D': 'DEF',
            'M': 'MID',
            'F': 'FWD',
        }
        return labels.get(self.position, self.position or '')

    @property
    def is_goalkeeper(self):
        return self.position == 'G'

    class Meta:
        unique_together = ('match', 'player_name', 'is_home_team')

    def __str__(self):
        team = "Home" if self.is_home_team else "Away"
        return f"{self.player_name} ({team}) - {self.match}"


class MissingPlayer(models.Model):
    match = models.ForeignKey(LiveMatch, on_delete=models.CASCADE, related_name='missing_players')
    player_name = models.CharField(max_length=100)
    
    # "missing" or "doubtful"
    type = models.CharField(max_length=50)
    
    # Reason code from API (e.g. 1) or description if available
    reason = models.CharField(max_length=255, blank=True, null=True)
    
    is_home_team = models.BooleanField(default=True)

    def __str__(self):
        team = "Home" if self.is_home_team else "Away"
        status = "Missing" if self.type == 'missing' else "Doubtful"
        return f"{self.player_name} ({team}) - {status}"
