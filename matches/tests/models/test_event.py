import pytest
from django.db import IntegrityError
from matches.models import League, Team, LiveMatch, MatchEvent

# ==========================================
# FABRYKA DANYCH
# ==========================================
@pytest.fixture
def match_fixture():
    """Tworzy mecz testowy w bazie."""
    league = League.objects.create(api_id=999, name="Testowa Liga")
    team_a = Team.objects.create(api_id=101, name="Drużyna A")
    team_b = Team.objects.create(api_id=102, name="Drużyna B")
    return LiveMatch.objects.create(
        api_id=5000, 
        league=league, 
        home_team=team_a, 
        away_team=team_b
    )

# ==========================================
# TESTY: WŁAŚCIWOŚCI (PROPERTIES) BAZOWE
# ==========================================
@pytest.mark.django_db
def test_match_event_is_goal(match_fixture):
    # Nowy format API
    goal_new = MatchEvent.objects.create(match=match_fixture, incident_type='goal', time=10)
    assert goal_new.is_goal is True

    # Stary format API (regular)
    goal_old_1 = MatchEvent.objects.create(match=match_fixture, incident_type='regular', player_name='Lewy', time=15)
    assert goal_old_1.is_goal is True

    # Stary format API bez podanego gracza
    goal_old_2 = MatchEvent.objects.create(match=match_fixture, incident_type='penalty', player_name='Nieznany', time=20)
    assert goal_old_2.is_goal is False

@pytest.mark.django_db
def test_match_event_is_card_and_color(match_fixture):
    # Nowy format (żółta)
    card_yellow = MatchEvent.objects.create(match=match_fixture, incident_type='card', incident_class='yellow', time=30)
    assert card_yellow.is_card is True
    assert card_yellow.card_color == 'yellow'

    # Nowy format (druga żółta)
    card_yellow_red = MatchEvent.objects.create(match=match_fixture, incident_type='card', incident_class='yellowRed', time=35)
    assert card_yellow_red.is_card is True
    assert card_yellow_red.card_color == 'yellow-red'

    # Stary format (czerwona)
    card_red_old = MatchEvent.objects.create(match=match_fixture, incident_type='red', time=40)
    assert card_red_old.is_card is True
    assert card_red_old.card_color == 'red'

@pytest.mark.django_db
def test_match_event_is_substitution_and_display_names(match_fixture):
    sub = MatchEvent.objects.create(
        match=match_fixture, 
        incident_type='substitution', 
        player_in_name='Milik', 
        player_out_name='Piątek',
        time=60
    )
    assert sub.is_substitution is True
    assert sub.display_player_in == 'Milik'
    assert sub.display_player_out == 'Piątek'

@pytest.mark.django_db
def test_match_event_is_period_marker_unknown_time(match_fixture):
    # Tworzymy specyficzne zdarzenie: "Unknown" i doliczony czas = 900
    event = MatchEvent.objects.create(match=match_fixture, time=45, incident_type='Unknown', added_time=900)
    
    # Powinno zwrócić True (wyłapuje specyficzny błąd z API jako koniec połowy)
    assert event.is_period_marker is True

@pytest.mark.django_db
def test_match_event_is_var_decision(match_fixture):
    # Tworzymy zdarzenie typu VAR
    event_var = MatchEvent.objects.create(match=match_fixture, time=15, incident_type='varDecision')
    
    # Tworzymy zwykłe zdarzenie (np. faul)
    event_other = MatchEvent.objects.create(match=match_fixture, time=16, incident_type='foul')
    
    # Sprawdzamy boolean
    assert event_var.is_var_decision is True
    assert event_other.is_var_decision is False

# ==========================================
# TESTY: FORMATOWANIE CZASU I ZDARZEŃ
# ==========================================
@pytest.mark.django_db
def test_match_event_formatted_time(match_fixture):
    # Normalny czas
    event_normal = MatchEvent.objects.create(match=match_fixture, incident_type='card', time=25)
    assert event_normal.formatted_time == "25"

    # Doliczony czas
    event_added = MatchEvent.objects.create(match=match_fixture, incident_type='goal', time=90, added_time=4)
    assert event_added.formatted_time == "90+4"

    # Marker okresu (HT/FT) nie powinien wyświetlać czasu
    event_period = MatchEvent.objects.create(match=match_fixture, incident_type='period', time=45)
    assert event_period.formatted_time == ""

@pytest.mark.django_db
def test_match_event_running_score(match_fixture):
    event = MatchEvent.objects.create(match=match_fixture, incident_type='goal', time=10, home_score=2, away_score=1)
    assert event.running_score == "2 - 1"

    event_no_score = MatchEvent.objects.create(match=match_fixture, incident_type='card', time=15)
    assert event_no_score.running_score == ""

@pytest.mark.django_db
def test_match_event_incident_class_label(match_fixture):
    # Nowy format API
    event_own = MatchEvent.objects.create(match=match_fixture, incident_type='goal', incident_class='ownGoal', time=10)
    assert event_own.incident_class_label == 'samobój'

    # Stary format API (fallback na incident_type)
    event_penalty_old = MatchEvent.objects.create(match=match_fixture, incident_type='penalty', player_name="Pazdan", time=20)
    assert event_penalty_old.incident_class_label == 'karny'

@pytest.mark.django_db
def test_match_event_side(match_fixture):
    event_home = MatchEvent.objects.create(match=match_fixture, incident_type='goal', is_home_team=True, time=10)
    assert event_home.side == 'home'

    event_away = MatchEvent.objects.create(match=match_fixture, incident_type='card', is_home_team=False, time=20)
    assert event_away.side == 'away'

    event_neutral = MatchEvent.objects.create(match=match_fixture, incident_type='period', time=45)
    assert event_neutral.side == 'neutral'

# ==========================================
# TESTY: EDGE CASES (SAD PATH)
# ==========================================
@pytest.mark.django_db
def test_match_event_duplicate_event_id_not_enforced_in_db(match_fixture):
    """
    W modelu MatchEvent masz db_index=True dla event_id, ale NIE MASZ unique=True 
    ani unique_together=('match', 'event_id'). Ten test udowadnia, że 
    baza danych przepuści zduplikowane zdarzenia z tym samym ID. 
    (Rozwiązaniem jest poprawienie modelu, ale ten test odzwierciedla obecny stan).
    """
    MatchEvent.objects.create(match=match_fixture, incident_type='goal', event_id='12345', time=10)
    
    # Próbujemy stworzyć duplikat - to nie wyrzuci błędu bazy!
    MatchEvent.objects.create(match=match_fixture, incident_type='card', event_id='12345', time=15)
    
    assert MatchEvent.objects.filter(event_id='12345').count() == 2