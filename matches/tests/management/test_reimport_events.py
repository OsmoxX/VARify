import pytest
from io import StringIO
from unittest.mock import patch
from django.core.management import call_command
from matches.models import League, Team, LiveMatch, MatchEvent, MatchLineup

# ==========================================
# FABRYKA DANYCH
# ==========================================
@pytest.fixture
def setup_command_data():
    l = League.objects.create(api_id=1, name="Test League")
    t1 = Team.objects.create(api_id=1, name="Team A")
    t2 = Team.objects.create(api_id=2, name="Team B")
    
    # Tworzymy dwa mecze
    m1 = LiveMatch.objects.create(api_id=100, league=l, home_team=t1, away_team=t2)
    m2 = LiveMatch.objects.create(api_id=200, league=l, home_team=t2, away_team=t1)
    
    # Tworzymy "stare śmieci", które komenda powinna usunąć
    MatchEvent.objects.create(match=m1, time=10, incident_type="goal")
    MatchLineup.objects.create(match=m2, player_name="Test Player", is_home_team=True)
    
    return m1, m2

# ==========================================
# TESTY: KOMENDY (reimport_events)
# ==========================================
@pytest.mark.django_db
@patch('matches.management.commands.reimport_events.fetch_match_details')
def test_reimport_events_specific_id(mock_fetch, setup_command_data):
    m1, m2 = setup_command_data
    mock_fetch.return_value = True  # Udajemy, że import się udał
    
    out = StringIO()  # Narzędzie do przechwytywania tekstu z konsoli
    
    # ACT: Odpalamy komendę podając jako argument ID pierwszego meczu
    call_command('reimport_events', m1.id, stdout=out)
    
    output = out.getvalue()
    
    # ASSERT: 
    # 1. Sprawdzamy czy funkcja została wywołana TYLKO dla m1
    mock_fetch.assert_called_once_with(m1.id, m1.api_id)
    
    # 2. Sprawdzamy czy stare zdarzenia z m1 zostały usunięte
    assert MatchEvent.objects.filter(match=m1).count() == 0
    
    # 3. Sprawdzamy czy składy z m2 PRZETRWAŁY (bo komenda miała przetworzyć tylko m1)
    assert MatchLineup.objects.filter(match=m2).count() == 1
    
    # 4. Sprawdzamy czy w konsoli wydrukowało się to, co powinno
    assert "✓ Reimport zakończony." in output
    assert "Przetworzono 1 meczów." in output

@pytest.mark.django_db
@patch('matches.management.commands.reimport_events.fetch_match_details')
def test_reimport_events_all_matches_with_errors(mock_fetch, setup_command_data):
    m1, m2 = setup_command_data
    # Udajemy, że import zewnętrzny nawalił (żeby przetestować czerwoną ścieżkę z błędem)
    mock_fetch.return_value = False
    
    out = StringIO()
    
    # ACT: Odpalamy komendę BEZ ARGUMENTÓW (czyli lecimy po całej bazie)
    call_command('reimport_events', stdout=out)
    
    output = out.getvalue()
    
    # ASSERT:
    # 1. Sprawdzamy czy odpaliło się dla obu meczów
    assert mock_fetch.call_count == 2
    
    # 2. Sprawdzamy czy wyczyszczono ABSOLUTNIE wszystkie śmieci z bazy
    assert MatchEvent.objects.count() == 0
    assert MatchLineup.objects.count() == 0
    
    # 3. Sprawdzamy logi w konsoli (czy obsłużono błąd)
    assert "✗ Błąd importu." in output
    assert "Gotowe! Przetworzono 2 meczów." in output