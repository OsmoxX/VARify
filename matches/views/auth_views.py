"""
views/auth_views.py

Handles user registration and logout.
"""

from django.contrib import messages
from django.contrib.auth import logout
from django.contrib.auth.decorators import login_not_required
from django.shortcuts import redirect, render
from allauth.account.models import EmailAddress
from allauth.account.internal.flows.email_verification import send_verification_email_to_address

from matches.forms import UserRegisterForm


@login_not_required
def register(request):
    """
    Rejestracja nowego użytkownika.
    Renderuje oryginalny szablon matches/register.html (z zachowanym CSS).
    Używa własnego formularza, ale wyzwala proces weryfikacji e-mail przez allauth.
    """
    form = UserRegisterForm(request.POST or None)
    if request.method == "POST" and form.is_valid():
        user = form.save()
        
        # 1. Zarejestruj e-mail w allauth (aby system wiedział o użytkowniku)
        email_address = EmailAddress.objects.create(
            user=user, 
            email=user.email, 
            primary=True, 
            verified=False
        )
        
        # 2. Wyślij oficjalny e-mail weryfikacyjny przez allauth 65.x (z flagą signup=True!)
        # Właśnie flaga signup=True decyduje, że allauth użyje Twoich szablonów email_confirmation_signup...
        send_verification_email_to_address(request, email_address, signup=True)
        
        # 3. Wyświetl informację "Sprawdź skrzynkę"
        return render(request, "account/verification_sent.html", {"email": user.email})
        
    return render(request, "matches/register.html", {"form": form})


def logout_view(request):
    """Wylogowuje użytkownika i przekierowuje na stronę główną."""
    logout(request)
    return redirect("home")
