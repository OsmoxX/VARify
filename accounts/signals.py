from allauth.account.signals import user_signed_up
from django.dispatch import receiver
from django.core.mail import send_mail
from django.conf import settings

@receiver(user_signed_up)
def send_welcome_email(request, user, **kwargs):
    # Sprawdzamy, czy to rejestracja przez Social Media (Google)
    if user.socialaccount_set.exists():
        subject = "Witamy w VARify! ⚽"
        message = f"Cześć {user.username},\n\nDziękujemy za dołączenie do VARify przez Google! Cieszymy się, że jesteś z nami.\n\nPozdrawiamy,\nZespół VARify"

        # Wysłanie maila (w tle, bez blokowania strony)
        send_mail(
            subject,
            message,
            settings.DEFAULT_FROM_EMAIL,
            [user.email],
            fail_silently=True,
        )