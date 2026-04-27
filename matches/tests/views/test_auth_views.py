"""
tests/views/test_auth_views.py

Kompleksowe testy bezpieczeństwa systemu uwierzytelniania.

Pokryte scenariusze:
  1. Rejestracja — poprawna sekwencja (is_active=False po rejestracji)
  2. Duplikaty e-mail — blokada przez clean_email()
  3. Logowanie nieaktywnego konta — blokada przez ModelBackend
  4. Aktywacja konta — confirm_email ustawia is_active=True
  5. Social Auth vs tradycyjne konto — blokada przejęcia konta przez OAuth
"""

import pytest
from django.urls import reverse
from django.contrib.auth.models import User
from unittest.mock import patch, MagicMock
from allauth.account.models import EmailAddress


# =====================================================================
# TESTY: REJESTRACJA (register)
# =====================================================================

@pytest.mark.django_db
def test_register_view_get(client):
    """GET na /register/ renderuje formularz rejestracji."""
    url = reverse("register")
    response = client.get(url)

    assert response.status_code == 200
    assert "matches/register.html" in [t.name for t in response.templates]
    assert "form" in response.context


@pytest.mark.django_db
def test_register_view_post_invalid(client):
    """Pusty POST zwraca formularz z błędami (brak przekierowania)."""
    url = reverse("register")
    response = client.post(url, {})

    assert response.status_code == 200
    assert "matches/register.html" in [t.name for t in response.templates]


@pytest.mark.django_db
@patch("matches.views.auth_views.send_verification_email_to_address")
def test_register_creates_inactive_user(mock_send_email, client):
    """
    Po poprawnej rejestracji użytkownik ma is_active=False.
    Musi kliknąć link w e-mailu, żeby móc się zalogować.
    """
    url = reverse("register")
    response = client.post(url, {
        "username": "nowy_user",
        "email": "nowy@example.com",
        "password1": "Silne!Haslo123",
        "password2": "Silne!Haslo123",
    })

    # Widok pokazuje stronę "Sprawdź skrzynkę"
    assert response.status_code == 200
    assert "account/verification_sent.html" in [t.name for t in response.templates]

    # KLUCZOWE: konto MUSI być nieaktywne
    user = User.objects.get(username="nowy_user")
    assert user.is_active is False, (
        "BŁĄD BEZPIECZEŃSTWA: nowy użytkownik powinien mieć is_active=False "
        "przed weryfikacją e-maila!"
    )

    # E-mail weryfikacyjny musi być wysłany
    mock_send_email.assert_called_once()


@pytest.mark.django_db
@patch("matches.views.auth_views.send_verification_email_to_address")
def test_register_view_post_valid(mock_send_email, client):
    """
    Kompatybilność wsteczna: po rejestracji renderowany jest
    szablon verification_sent.html i wywoływane jest form.save().
    """
    from django.contrib.auth import get_user_model
    User = get_user_model()

    url = reverse("register")
    response = client.post(url, {
        "username": "nowy_kacper",
        "email": "nowy_kacper@wp.pl",
        "password1": "Silne!Haslo123",
        "password2": "Silne!Haslo123",
    })

    assert response.status_code == 200
    assert "account/verification_sent.html" in [t.name for t in response.templates]
    assert User.objects.filter(username="nowy_kacper").exists()


# =====================================================================
# TESTY: BLOKADA DUPLIKATÓW E-MAIL
# =====================================================================

@pytest.mark.django_db
def test_register_duplicate_email_blocked(client):
    """
    Formularz rejestracji musi odrzucić próbę rejestracji
    z e-mailem, który już istnieje w bazie (case-insensitive).
    """
    # Istniejący użytkownik z tym e-mailem
    User.objects.create_user(
        username="stary_user",
        email="zajety@example.com",
        password="haslo123",
    )

    url = reverse("register")
    response = client.post(url, {
        "username": "nowy_user",
        "email": "ZAJETY@example.com",  # inna wielkość liter
        "password1": "Silne!Haslo123",
        "password2": "Silne!Haslo123",
    })

    # Formularz nie przeszedł — strona rejestracji renderuje się ponownie
    assert response.status_code == 200
    assert "matches/register.html" in [t.name for t in response.templates]

    # Nowy user NIE mógł zostać stworzony
    assert not User.objects.filter(username="nowy_user").exists()

    # Błąd musi być widoczny w formularzu
    form = response.context["form"]
    assert form.errors.get("email"), "Formularz powinien zawierać błąd dla pola 'email'"


@pytest.mark.django_db
def test_register_duplicate_email_case_insensitive(client):
    """
    Blokada duplikatów musi działać niezależnie od wielkości liter
    (np. Test@Email.com == test@email.com).
    """
    User.objects.create_user(
        username="istniejacy",
        email="test@email.com",
        password="haslo123",
    )

    url = reverse("register")
    response = client.post(url, {
        "username": "nowy",
        "email": "TEST@EMAIL.COM",
        "password1": "Silne!Haslo123",
        "password2": "Silne!Haslo123",
    })

    assert response.status_code == 200
    form = response.context["form"]
    assert "email" in form.errors


# =====================================================================
# TESTY: BLOKADA LOGOWANIA NIEAKTYWNEGO KONTA
# =====================================================================

@pytest.mark.django_db
def test_inactive_user_cannot_login(client):
    """
    Użytkownik z is_active=False nie może się zalogować,
    nawet jeśli poda poprawne hasło.
    ModelBackend odrzuca logowanie nieaktywnych kont.
    """
    User.objects.create_user(
        username="nieaktywny",
        email="nieaktywny@example.com",
        password="Silne!Haslo123",
        is_active=False,  # konto przed weryfikacją e-maila
    )

    # Próba logowania przez allauth
    login_url = reverse("account_login")
    client.post(login_url, {
        "login": "nieaktywny",
        "password": "Silne!Haslo123",
    })

    # Nie może być przekierowania na stronę główną (to oznaczałoby sukces logowania)
    assert not client.session.get("_auth_user_id"), (
        "BŁĄD BEZPIECZEŃSTWA: nieaktywny użytkownik został zalogowany!"
    )


@pytest.mark.django_db
def test_active_user_can_login(client):
    """Użytkownik z is_active=True może się normalnie zalogować."""
    User.objects.create_user(
        username="aktywny",
        email="aktywny@example.com",
        password="Silne!Haslo123",
        is_active=True,
    )
    # Upewniamy się, że allauth też zna ten e-mail
    user = User.objects.get(username="aktywny")
    EmailAddress.objects.create(
        user=user,
        email="aktywny@example.com",
        primary=True,
        verified=True,
    )

    login_url = reverse("account_login")
    client.post(login_url, {
        "login": "aktywny",
        "password": "Silne!Haslo123",
    })

    # Zalogowany użytkownik istnieje w sesji
    assert client.session.get("_auth_user_id") is not None


# =====================================================================
# TESTY: AKTYWACJA KONTA (confirm_email hook)
# =====================================================================

@pytest.mark.django_db
def test_confirm_email_activates_user():
    """
    CustomAccountAdapter.confirm_email() musi ustawić is_active=True,
    żeby użytkownik mógł się zalogować po kliknięciu linku.
    """
    from matches.adapter import CustomAccountAdapter

    # Tworzymy nieaktywnego usera i jego EmailAddress
    user = User.objects.create_user(
        username="do_aktywacji",
        email="aktywuj@example.com",
        password="haslo123",
        is_active=False,
    )
    email_address = EmailAddress.objects.create(
        user=user,
        email="aktywuj@example.com",
        primary=True,
        verified=False,
    )

    adapter = CustomAccountAdapter()
    mock_request = MagicMock()

    # Wywołujemy hook jak allauth — po kliknięciu linku
    adapter.confirm_email(mock_request, email_address)

    # User MUSI być teraz aktywny
    user.refresh_from_db()
    assert user.is_active is True, (
        "confirm_email() powinien ustawić is_active=True po weryfikacji e-maila!"
    )


@pytest.mark.django_db
def test_confirm_email_already_active_user():
    """confirm_email() nie psuje kont, które są już aktywne."""
    from matches.adapter import CustomAccountAdapter

    user = User.objects.create_user(
        username="juz_aktywny",
        email="aktywny2@example.com",
        password="haslo123",
        is_active=True,
    )
    email_address = EmailAddress.objects.create(
        user=user,
        email="aktywny2@example.com",
        primary=True,
        verified=False,
    )

    adapter = CustomAccountAdapter()
    adapter.confirm_email(MagicMock(), email_address)

    user.refresh_from_db()
    assert user.is_active is True  # nadal aktywny, bez zmian


# =====================================================================
# TESTY: SOCIAL AUTH vs TRADYCYJNE KONTO
# =====================================================================

@pytest.mark.django_db
def test_social_login_blocked_for_traditional_account(client, rf):
    """
    Jeśli użytkownik próbuje zalogować się przez Google,
    ale e-mail należy do konta TRADYCYJNEGO (formularz, bez SocialAccount),
    system musi ZABLOKOWAĆ logowanie i pokazać błąd.
    """
    from matches.adapter import CustomSocialAccountAdapter
    from allauth.core.exceptions import ImmediateHttpResponse

    # Tworzymy tradycyjne konto
    user = User.objects.create_user(
        username="tradycyjny",
        email="tradycyjny@example.com",
        password="haslo123",
    )
    EmailAddress.objects.create(
        user=user,
        email="tradycyjny@example.com",
        primary=True,
        verified=True,
    )
    # BRAK SocialAccount — to jest konto tradycyjne

    # Symulujemy sociallogin z Google używający tego samego e-maila
    mock_social_login = MagicMock()
    mock_social_login.is_existing = False

    mock_email_obj = MagicMock()
    mock_email_obj.email = "tradycyjny@example.com"
    mock_social_login.email_addresses = [mock_email_obj]

    adapter = CustomSocialAccountAdapter()
    request = rf.get("/")

    # Musimy dodać session i messages do requestu
    from django.contrib.messages.storage.fallback import FallbackStorage
    from django.contrib.sessions.backends.db import SessionStore
    request.session = SessionStore()
    request.session.save()
    request._messages = FallbackStorage(request)

    # MUSI rzucić ImmediateHttpResponse (blokada OAuth)
    with pytest.raises(ImmediateHttpResponse):
        adapter.pre_social_login(request, mock_social_login)


@pytest.mark.django_db
def test_social_login_blocked_for_other_social_provider(rf):
    """
    Jeśli e-mail jest już używany przez konto z innym dostawcą social
    (np. GitHub), blokujemy logowanie przez Google.
    """
    from matches.adapter import CustomSocialAccountAdapter
    from allauth.core.exceptions import ImmediateHttpResponse
    from allauth.socialaccount.models import SocialApp, SocialAccount

    # Tworzymy konto z powiązanym SocialAccount (np. GitHub)
    user = User.objects.create_user(
        username="github_user",
        email="github@example.com",
        password="haslo123",
    )
    EmailAddress.objects.create(
        user=user,
        email="github@example.com",
        primary=True,
        verified=True,
    )
    # Tworzymy SocialAccount dla GitHub
    SocialApp.objects.create(
        provider="github",
        name="GitHub",
        client_id="test-client-id",
        secret="test-secret",
    )
    SocialAccount.objects.create(
        user=user,
        provider="github",
        uid="github-uid-123",
    )

    # Google próbuje zalogować się tym samym e-mailem
    mock_social_login = MagicMock()
    mock_social_login.is_existing = False

    mock_email_obj = MagicMock()
    mock_email_obj.email = "github@example.com"
    mock_social_login.email_addresses = [mock_email_obj]

    adapter = CustomSocialAccountAdapter()
    request = rf.get("/")

    from django.contrib.messages.storage.fallback import FallbackStorage
    from django.contrib.sessions.backends.db import SessionStore
    request.session = SessionStore()
    request.session.save()
    request._messages = FallbackStorage(request)

    with pytest.raises(ImmediateHttpResponse):
        adapter.pre_social_login(request, mock_social_login)


@pytest.mark.django_db
def test_social_login_allowed_for_new_email(rf):
    """
    Jeśli e-mail z Google jest zupełnie nowy (nie ma go w bazie),
    logowanie przez Google MUSI być przepuszczone normalnie.
    """
    from matches.adapter import CustomSocialAccountAdapter
    from allauth.core.exceptions import ImmediateHttpResponse

    mock_social_login = MagicMock()
    mock_social_login.is_existing = False

    mock_email_obj = MagicMock()
    mock_email_obj.email = "nowy_google@example.com"
    mock_social_login.email_addresses = [mock_email_obj]

    adapter = CustomSocialAccountAdapter()
    request = rf.get("/")

    from django.contrib.messages.storage.fallback import FallbackStorage
    from django.contrib.sessions.backends.db import SessionStore
    request.session = SessionStore()
    request.session.save()
    request._messages = FallbackStorage(request)

    # NIE może rzucić ImmediateHttpResponse — nowy e-mail jest OK
    try:
        adapter.pre_social_login(request, mock_social_login)
    except ImmediateHttpResponse:
        pytest.fail(
            "pre_social_login() nie powinien blokować nowych e-maili z Google!"
        )


@pytest.mark.django_db
def test_social_login_existing_social_account_passes(rf):
    """
    Jeśli konto social już istnieje (is_existing=True), adapter
    przepuszcza bez żadnych sprawdzeń — to powrót zalogowanego użytkownika.
    """
    from matches.adapter import CustomSocialAccountAdapter
    from allauth.core.exceptions import ImmediateHttpResponse

    mock_social_login = MagicMock()
    mock_social_login.is_existing = True  # konto social już w bazie

    adapter = CustomSocialAccountAdapter()
    request = rf.get("/")

    from django.contrib.messages.storage.fallback import FallbackStorage
    from django.contrib.sessions.backends.db import SessionStore
    request.session = SessionStore()
    request.session.save()
    request._messages = FallbackStorage(request)

    # Nie może blokować istniejących kont social
    try:
        adapter.pre_social_login(request, mock_social_login)
    except ImmediateHttpResponse:
        pytest.fail(
            "pre_social_login() nie powinien blokować istniejących kont social (powrót usera)!"
        )


# =====================================================================
# TESTY: WYLOGOWANIE (logout_view)
# =====================================================================

@pytest.mark.django_db
def test_logout_view(client):
    """Wylogowanie przekierowuje na stronę główną."""
    User.objects.create_user(username="tester", password="123")
    client.login(username="tester", password="123")

    url = reverse("logout")
    response = client.get(url)

    assert response.status_code == 302
    assert response.url == reverse("home")
