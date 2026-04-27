"""
views/auth_views.py

Handles user registration and logout.
"""

from django.contrib.auth import logout
from django.contrib.auth.decorators import login_not_required
from django.shortcuts import redirect, render
from allauth.account.models import EmailAddress
from allauth.account.internal.flows.email_verification import send_verification_email_to_address
from ..models.team import Team, FavoriteTeam
from matches.forms import UserRegisterForm
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.http import require_POST
from django.contrib.auth.decorators import login_required

@login_not_required
def register(request):
    """
    Rejestracja nowego użytkownika.

    Sekwencja:
    1. Formularz waliduje unikalność e-maila i zapisuje użytkownika z is_active=False.
    2. Allauth rejestruje e-mail (verified=False) i wysyła link aktywacyjny.
    3. Widok renderuje stronę "Sprawdź skrzynkę" — użytkownik NIE jest logowany.

    Dzięki is_active=False ModelBackend odrzuci login nawet jeśli ktoś
    spróbuje zalogować się przy użyciu poprawnych danych przed aktywacją.
    """
    form = UserRegisterForm(request.POST or None)
    if request.method == "POST" and form.is_valid():
        # form.save() tworzy użytkownika z is_active=False (patrz forms.py)
        user = form.save()

        # Zarejestruj e-mail w allauth (verified=False — czeka na kliknięcie linku)
        email_address = EmailAddress.objects.create(
            user=user,
            email=user.email,
            primary=True,
            verified=False
        )

        # Wysyła oficjalny e-mail weryfikacyjny allauth (szablon signup)
        send_verification_email_to_address(request, email_address, signup=True)

        # Pokaż stronę "Sprawdź skrzynkę" — NIE logujemy użytkownika
        return render(request, "account/verification_sent.html", {"email": user.email})

    return render(request, "matches/register.html", {"form": form})


def logout_view(request):
    """Wylogowuje użytkownika i przekierowuje na stronę główną."""
    logout(request)
    return redirect("home")


@login_required
@require_POST
def toggle_favorite_team(request, team_id):
    # Pobieramy obiekt Team na podstawie ID z Twojej bazy (nie z API)
    team = get_object_or_404(Team, pk=team_id)
    
    # Próbujemy znaleźć istniejący rekord
    favorite, created = FavoriteTeam.objects.get_or_create(user=request.user, team=team)
    
    if not created:
        # Jeśli rekord już istniał, to znaczy, że użytkownik kliknął, aby "odlubić"
        favorite.delete()
        is_favorite = False
    else:
        # Jeśli rekord został właśnie stworzony
        is_favorite = True
        
    return JsonResponse({
        'status': 'success',
        'is_favorite': is_favorite,
        'team_name': team.name
    })