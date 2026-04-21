from allauth.account.adapter import DefaultAccountAdapter
from allauth.socialaccount.adapter import DefaultSocialAccountAdapter
from django.contrib import messages
from django.utils.translation import gettext_lazy as _
import logging

logger = logging.getLogger(__name__)


class CustomAccountAdapter(DefaultAccountAdapter):
    """
    Adapter nadpisujący domyślne wiadomości pakietu allauth.
    Służy do personalizacji frontendu (usuwa zbędne komunikaty i zmienia treść ważnych).
    """

    def add_message(self, request, level, message_template, message_context=None, extra_tags=""):
        # Ignoruj zaległy komunikat o wysłaniu maila weryfikacyjnego (pokazujemy to już natywnie w HTML)
        if message_template == "account/messages/email_confirmation_sent.txt":
            return

        # Podmień treść powiadomienia o udanej weryfikacji maila
        if message_template == "account/messages/email_confirmed.txt":
            messages.add_message(
                request,
                messages.SUCCESS,
                _("Konto zostało pomyślnie aktywowane. Możesz się teraz zalogować! ⚽")
            )
            return

        # Pozwól innym wiadomościom działać jak dotychczas
        super().add_message(request, level, message_template, message_context, extra_tags)


class CustomSocialAccountAdapter(DefaultSocialAccountAdapter):
    """
    Adapter dla logowania przez konta społecznościowe (Google, Facebook, GitHub).

    Rozwiązuje dwa problemy:
      1. Google OAuth wyzwalał e-mail weryfikacyjny — teraz e-mail z Google jest
         automatycznie oznaczany jako zweryfikowany (Google sam go potwierdza).
      2. Jeśli użytkownik ma już konto zarejestrowane tym samym e-mailem,
         social login łączy się z istniejącym kontem zamiast tworzyć duplikat.
    """

    def pre_social_login(self, request, sociallogin):
        """
        Wywoływane tuż przed zakończeniem logowania przez konto społecznościowe.
        Oznacza e-mail jako zweryfikowany i próbuje połączyć z istniejącym kontem.
        """
        # Nic nie rób jeśli konto social już istnieje w bazie
        if sociallogin.is_existing:
            return

        # Pobierz adres e-mail z danych Google
        if not sociallogin.email_addresses:
            return

        # Oznacz e-mail jako zweryfikowany (Google gwarantuje weryfikację po swojej stronie)
        for email_obj in sociallogin.email_addresses:
            email_obj.verified = True
            email_obj.primary = True

        # Próba powiązania z istniejącym kontem o tym samym e-mailu
        try:
            from allauth.account.models import EmailAddress

            primary_email = sociallogin.email_addresses[0].email
            existing = EmailAddress.objects.filter(
                email__iexact=primary_email
            ).select_related("user").first()

            if existing:
                # Połącz social login z istniejącym kontem (np. zarejestrowanym przez e-mail)
                sociallogin.connect(request, existing.user)
                logger.info(
                    "SocialLogin: połączono konto Google '%s' z istniejącym userem '%s'.",
                    primary_email, existing.user.username,
                )
        except Exception as exc:
            # Błąd łączenia nie powinien blokować logowania — logujemy i idziemy dalej
            logger.warning("SocialLogin pre_social_login: błąd łączenia kont: %s", exc)
