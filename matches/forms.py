from django import forms
from django.contrib.auth.models import User
from django.contrib.auth.forms import UserCreationForm
from django.utils.translation import gettext_lazy as _


class UserRegisterForm(UserCreationForm):
    """
    Formularz rejestracji nowego użytkownika.

    Gwarancje bezpieczeństwa:
    - clean_email(): blokuje duplikaty adresów e-mail (porównanie case-insensitive).
    - save():        tworzy użytkownika z is_active=False, przez co nie może się
                     zalogować dopóki nie kliknie linku weryfikacyjnego w e-mailu.
    """

    email = forms.EmailField(
        required=True,
        label=_("Adres e-mail"),
        widget=forms.EmailInput(attrs={"autocomplete": "email"}),
    )

    class Meta:
        model = User
        fields = ["username", "email"]

    def clean_email(self):
        """
        Walidacja unikalności adresu e-mail (niezależna od wielkości liter).
        Rzuca ValidationError, jeśli konto z takim e-mailem już istnieje.
        """
        email = self.cleaned_data.get("email", "").strip()
        if User.objects.filter(email__iexact=email).exists():
            raise forms.ValidationError(
                _("Konto z tym adresem e-mail już istnieje.")
            )
        return email.lower()  # Normalizujemy do małych liter dla spójności

    def save(self, commit=True):
        """
        Zapisuje użytkownika z is_active=False.
        Aktywacja następuje wyłącznie po kliknięciu linku weryfikacyjnego.
        """
        user = super().save(commit=False)
        user.email = self.cleaned_data["email"]
        # KRYTYCZNE: konto nieaktywne do czasu weryfikacji e-mail
        user.is_active = False
        if commit:
            user.save()
        return user
