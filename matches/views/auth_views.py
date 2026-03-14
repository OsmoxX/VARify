"""
views/auth_views.py

Handles user registration and logout.
"""
from django.contrib import messages
from django.contrib.auth import logout
from django.contrib.auth.decorators import login_not_required
from django.shortcuts import redirect, render

from matches.forms import UserRegisterForm


@login_not_required
def register(request):
    """Rejestracja nowego użytkownika."""
    form = UserRegisterForm(request.POST or None)
    if request.method == 'POST' and form.is_valid():
        form.save()
        username = form.cleaned_data.get('username')
        messages.success(request, f'Konto dla {username} zostało utworzone! Możesz się zalogować.')
        return redirect('login')
    return render(request, 'matches/register.html', {'form': form})


def logout_view(request):
    """Wylogowuje użytkownika i przekierowuje na stronę główną."""
    logout(request)
    return redirect('home')
