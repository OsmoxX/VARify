import pytest
from io import StringIO
from unittest.mock import patch
from django.core.management import call_command

# ==========================================
# TESTY: KOMENDY (sync_matches)
# ==========================================


@pytest.mark.django_db
@patch("matches.management.commands.sync_matches.sync_live_matches")
def test_sync_matches_command_success(mock_sync):
    # 1. ARRANGE: Przygotowujemy "wirtualny terminal", żeby złapać teksty drukowane przez komendę
    out = StringIO()

    # 2. ACT: Odpalamy komendę
    call_command("sync_matches", stdout=out)
    output = out.getvalue()

    # 3. ASSERT: Sprawdzamy, czy funkcja pod spodem została w ogóle uruchomiona
    mock_sync.assert_called_once()

    # Sprawdzamy komunikaty w konsoli
    assert "Starting the sync process..." in output
    assert "Successfully updated match data!" in output


@pytest.mark.django_db
@patch("matches.management.commands.sync_matches.sync_live_matches")
def test_sync_matches_command_error_handling(mock_sync):
    # 1. ARRANGE: Udajemy, że główny serwis nagle padł z wielkim hukiem
    mock_sync.side_effect = Exception("Gigantyczna awaria serwerów!")
    out = StringIO()

    # 2. ACT: Odpalamy komendę
    call_command("sync_matches", stdout=out)
    output = out.getvalue()

    # 3. ASSERT: Komenda ma nie wybuchnąć (apka działa dalej), tylko ładnie wypisać błąd
    mock_sync.assert_called_once()
    assert "Starting the sync process..." in output
    assert "An error occurred: Gigantyczna awaria serwerów!" in output
