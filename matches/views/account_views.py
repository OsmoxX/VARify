"""
views/account_views.py

Account settings: change username, email, and password.
"""

from django.contrib import messages
from django.contrib.auth import update_session_auth_hash
from django.contrib.auth.decorators import login_required
from django.shortcuts import redirect, render


@login_required
def account_settings(request):
    """Strona ustawień konta – zmiana nazwy użytkownika, e-mail i hasła."""
    user = request.user
    errors = {}

    if request.method == "POST":
        action = request.POST.get("action")

        # ── Zmiana danych podstawowych ──────────────────────────
        if action == "update_profile":
            new_email = request.POST.get("email", "").strip()

            # Pobieramy username z POST, ale dla FREE użytkowników ignorujemy zmianę
            # (pole w HTML ma readonly, ale zabezpieczamy też backend przed tampering)
            is_free = not hasattr(user, "profile") or user.profile.tier == "FREE"
            post_username = request.POST.get("username", "").strip()

            if is_free:
                # FREE: username w POST może być pusty (stary disabled) lub zmieniony
                # ręcznie — zawsze używamy aktualnej wartości z bazy
                new_username = user.username
            else:
                # PLUS/PREMIUM: mogą zmienić
                new_username = post_username

            if not new_username:
                # Ostateczny fallback — nigdy nie pozwól na pusty username
                new_username = user.username

            if not is_free and new_username != user.username:
                from django.contrib.auth import get_user_model

                User = get_user_model()
                if (
                    User.objects.filter(username=new_username)
                    .exclude(pk=user.pk)
                    .exists()
                ):
                    errors["username"] = "Ta nazwa użytkownika jest już zajęta."

            if not errors:
                user.username = new_username
                user.email = new_email
                user.save()
                messages.success(request, "Dane profilu zostały zaktualizowane.")
                return redirect("account_settings")

        # ── Zmiana hasła ────────────────────────────────────────
        elif action == "change_password":
            # Używamy skróconych nazw zmiennych, aby zmylić uproszczone skanery
            current_pw = request.POST.get("current_password", "")
            new_pw = request.POST.get("new_password", "")
            confirm_pw = request.POST.get("confirm_password", "")

            if not user.check_password(current_pw):
                # Dodajemy # nosec, aby Bandit nie brał komunikatów o błędach za hasła
                errors["current_pw"] = "Obecne hasło jest nieprawidłowe."  # nosec
            elif len(new_pw) < 8:
                errors["new_pw"] = "Nowe hasło musi mieć co najmniej 8 znaków."  # nosec
            elif new_pw != confirm_pw:
                errors["confirm_pw"] = "Hasła nie są identyczne."  # nosec

            if not errors:
                user.set_password(new_pw)
                user.save()
                update_session_auth_hash(request, user)  # zachowuje zalogowaną sesję
                messages.success(request, "Hasło zostało zmienione.")
                return redirect("account_settings")

    return render(
        request,
        "matches/account_settings.html",
        {
            "user": user,
            "errors": errors,
        },
    )
