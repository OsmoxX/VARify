import pytest
from django.urls import reverse
from django.contrib.auth.models import User

# ==========================================
# FABRYKA DANYCH I WIRTUALNY KLIENT
# ==========================================
@pytest.fixture
def test_user(db):
    """Tworzy użytkownika testowego z konkretnym hasłem."""
    return User.objects.create_user(username='kacper', email='kacper@test.com', password='old_password123')

@pytest.fixture
def other_user(db):
    """Tworzy drugiego użytkownika, żeby sprawdzić, czy blokuje zajęty login."""
    return User.objects.create_user(username='zajety_login', email='taken@test.com', password='password123')

@pytest.fixture
def logged_client(client, test_user):
    """Loguje użytkownika do wirtualnej przeglądarki (client)."""
    client.login(username='kacper', password='old_password123')
    return client

# ==========================================
# TESTY: DOSTĘP I WYŚWIETLANIE STRONY
# ==========================================
@pytest.mark.django_db
def test_account_settings_requires_login(client):
    # ACT: Niezalogowany klient wchodzi na stronę
    url = reverse('account_settings')
    response = client.get(url)
    
    # ASSERT: Otrzymuje przekierowanie (kod 302) do strony logowania
    assert response.status_code == 302
    assert 'login' in response.url

@pytest.mark.django_db
def test_account_settings_get_success(logged_client):
    # ACT: Zalogowany wchodzi na stronę
    url = reverse('account_settings')
    response = logged_client.get(url)
    
    # ASSERT: Strona ładuje się poprawnie (kod 200) z właściwym szablonem
    assert response.status_code == 200
    assert 'matches/account_settings.html' in [t.name for t in response.templates]
    assert 'errors' in response.context

# ==========================================
# TESTY: ZMIANA PROFILU (update_profile)
# ==========================================
@pytest.mark.django_db
def test_update_profile_success(logged_client, test_user):
    url = reverse('account_settings')
    response = logged_client.post(url, {
        'action': 'update_profile',
        'username': 'kacper_pro',
        'email': 'nowy@test.com'
    })
    
    # Przekierowanie po sukcesie (redirect)
    assert response.status_code == 302
    
    # Sprawdzamy, czy w bazie zapisano nowe dane
    test_user.refresh_from_db()
    assert test_user.username == 'kacper_pro'
    assert test_user.email == 'nowy@test.com'

@pytest.mark.django_db
def test_update_profile_empty_username(logged_client, test_user):
    url = reverse('account_settings')
    response = logged_client.post(url, {
        'action': 'update_profile',
        'username': '',  # <- PUSTY
        'email': 'nowy@test.com'
    })
    
    # Brak przekierowania, strona renderuje się ponownie z błędem
    assert response.status_code == 200
    assert response.context['errors']['username'] == 'Nazwa użytkownika nie może być pusta.'

@pytest.mark.django_db
def test_update_profile_username_taken(logged_client, test_user, other_user):
    url = reverse('account_settings')
    response = logged_client.post(url, {
        'action': 'update_profile',
        'username': 'zajety_login', # <- TEN SAM CO MA `other_user`
        'email': 'nowy@test.com'
    })
    
    assert response.status_code == 200
    assert response.context['errors']['username'] == 'Ta nazwa użytkownika jest już zajęta.'

# ==========================================
# TESTY: ZMIANA HASŁA (change_password)
# ==========================================
@pytest.mark.django_db
def test_change_password_success(logged_client, test_user):
    url = reverse('account_settings')
    response = logged_client.post(url, {
        'action': 'change_password',
        'current_password': 'old_password123',
        'new_password': 'new_secure_password',
        'confirm_password': 'new_secure_password'
    })
    
    assert response.status_code == 302
    
    # Sprawdzamy czy nowe hasło działa!
    test_user.refresh_from_db()
    assert test_user.check_password('new_secure_password') is True

@pytest.mark.django_db
def test_change_password_wrong_current(logged_client):
    url = reverse('account_settings')
    response = logged_client.post(url, {
        'action': 'change_password',
        'current_password': 'zle_stare_haslo',
        'new_password': 'new_secure_password',
        'confirm_password': 'new_secure_password'
    })
    
    assert response.status_code == 200
    assert response.context['errors']['current_password'] == 'Obecne hasło jest nieprawidłowe.'

@pytest.mark.django_db
def test_change_password_too_short(logged_client):
    url = reverse('account_settings')
    response = logged_client.post(url, {
        'action': 'change_password',
        'current_password': 'old_password123',
        'new_password': '123', # <- ZBYT KRÓTKIE
        'confirm_password': '123'
    })
    
    assert response.status_code == 200
    assert response.context['errors']['new_password'] == 'Nowe hasło musi mieć co najmniej 8 znaków.'

@pytest.mark.django_db
def test_change_password_mismatch(logged_client):
    url = reverse('account_settings')
    response = logged_client.post(url, {
        'action': 'change_password',
        'current_password': 'old_password123',
        'new_password': 'new_secure_password',
        'confirm_password': 'zupelnie_inne_haslo' # <- LITERÓWKA
    })
    
    assert response.status_code == 200
    assert response.context['errors']['confirm_password'] == 'Hasła nie są identyczne.'