import pytest
from django.urls import reverse
from django.contrib.auth.models import User
from unittest.mock import patch, MagicMock


# ==========================================
# TESTY: REJESTRACJA (register)
# ==========================================
@pytest.mark.django_db
def test_register_view_get(client):
    # ACT: Wchodzimy na stronę rejestracji (żądanie GET)
    url = reverse("register")
    response = client.get(url)

    # ASSERT: Formularz powinien zostać wyświetlony w szablonie
    assert response.status_code == 200
    assert "matches/register.html" in [t.name for t in response.templates]
    assert "form" in response.context


@pytest.mark.django_db
def test_register_view_post_invalid(client):
    # ACT: Wysyłamy pusty formularz (błędne dane)
    url = reverse("register")
    response = client.post(url, {})

    # ASSERT: Brak przekierowania - strona ładuje się ponownie, żeby pokazać błędy
    assert response.status_code == 200
    assert "matches/register.html" in [t.name for t in response.templates]


@pytest.mark.django_db
@patch("matches.views.auth_views.UserRegisterForm")
def test_register_view_post_valid(MockFormClass, client):
    from django.contrib.auth import get_user_model
    User = get_user_model()

    # ARRANGE: Tworzymy faktycznego usera w testowej bazie, żeby 
    # EmailAddress.objects.create w widoku nie wyrzuciło błędu braku klucza obcego.
    mock_user = User.objects.create_user(username="nowy_kacper", email="nowy_kacper@wp.pl", password="testpass")

    # Przygotowujemy atrapę i symulujemy jej zachowanie
    mock_form_instance = MagicMock()
    mock_form_instance.is_valid.return_value = True
    mock_form_instance.cleaned_data = {"username": "nowy_kacper"}
    mock_form_instance.save.return_value = mock_user
    MockFormClass.return_value = mock_form_instance

    # ACT: Wysyłamy "poprawne" dane
    url = reverse("register")
    response = client.post(url, {"username": "nowy_kacper", "password": "password123"})

    # ASSERT:
    # 1. Formularz musiał wywołać funkcję .save(), żeby zapisać usera do bazy
    mock_form_instance.save.assert_called_once()

    # 2. Widok register po udanej weryfikacji renderuje specjalny szablon (200 OK)
    assert response.status_code == 200
    assert "account/verification_sent.html" in [t.name for t in response.templates]


# ==========================================
# TESTY: WYLOGOWANIE (logout_view)
# ==========================================
@pytest.mark.django_db
def test_logout_view(client):
    # 1. ARRANGE: Tworzymy i logujemy użytkownika
    User.objects.create_user(username="tester", password="123")
    client.login(username="tester", password="123")

    # 2. ACT: Wchodzimy na link wylogowania
    url = reverse(
        "logout"
    )  # podmień, jeśli w urls.py nazwałeś to inaczej (np. 'logout_view')
    response = client.get(url)

    # 3. ASSERT: Widok wylogowuje nas i odsyła (redirect) na stronę główną ('home')
    assert response.status_code == 302
    assert response.url == reverse("home")
