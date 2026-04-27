from allauth.account.adapter import DefaultAccountAdapter
from allauth.socialaccount.adapter import DefaultSocialAccountAdapter
from django.contrib import messages
from django.utils.translation import gettext_lazy as _
import logging

logger = logging.getLogger(__name__)


class CustomAccountAdapter(DefaultAccountAdapter):
    """
    Adapter nadpisujący domyślne zachowanie pakietu allauth.

    Odpowiada za:
    1. Personalizację komunikatów frontendu (tuszowanie, podmiana treści).
    2. Aktywację konta (is_active=True) po kliknięciu linku weryfikacyjnego.
       Bez tego hooka użytkownik z is_active=False nigdy nie mógłby się
       zalogować nawet po potwierdzeniu e-maila.
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

    def confirm_email(self, request, email_address):
        """
        Wywoływane przez allauth w momencie potwierdzenia e-maila (kliknięcie linku).

        Aktywuje konto użytkownika (is_active=True), które było ustawione na False
        podczas rejestracji. Bez tej metody użytkownik nigdy nie mógłby się zalogować.
        """
        super().confirm_email(request, email_address)

        user = email_address.user
        if not user.is_active:
            user.is_active = True
            user.save(update_fields=["is_active"])
            logger.info(
                "AccountAdapter: aktywowano konto użytkownika '%s' po weryfikacji e-maila '%s'.",
                user.username,
                email_address.email,
            )


class CustomSocialAccountAdapter(DefaultSocialAccountAdapter):
    """
    Adapter dla logowania przez konta społecznościowe (Google, Facebook, GitHub).

    Polityka bezpieczeństwa (pre_social_login):
    - Blokuje logowanie przez Google, jeśli e-mail należy do konta TRADYCYJNEGO
      (stworzonego przez formularz). Zapobiega przejęciu konta przez OAuth.
    - Blokuje mieszanie dostawców (np. Google + GitHub na ten sam e-mail).
    - E-maile z Google są oznaczane jako zweryfikowane (Google to gwarantuje).
    """

    def pre_social_login(self, request, sociallogin):
        """
        Wywoływane tuż przed zakończeniem logowania przez konto społecznościowe.

        Polityka bezpieczeństwa:
        - Jeśli social-konto już istnieje w bazie (powrót) — przepuszczamy.
        - Jeśli adres e-mail z Google \u017c pokrywa się z istniejącym kontem
          TRADYCYJNYM (formularz, brak powiązanego SocialAccount) — BLOKUJEMY
          i wyświetlamy komunikat błędu.
        - Jeśli e-mail należy do konta posiadającego już powiązanie social
          (np. inny dostawca) — blokujemy duplikaty między dostawcami.
        - Jeśli e-mail jest nowy — tworzymy konto normalnie.

        Zapobiega to scenariuszowi "przejęcia konta" przez OAuth.
        """
        from allauth.socialaccount.models import SocialAccount
        from allauth.account.models import EmailAddress
        from allauth.core.exceptions import ImmediateHttpResponse
        from django.contrib import messages
        from django.shortcuts import redirect

        # 1. Konto social już istnieje w bazie (powrót zalogowanego użytkownika) — OK
        if sociallogin.is_existing:
            return

        # 2. Brak adresu e-mail w danych z Google — kontynuujemy bez blokowania
        if not sociallogin.email_addresses:
            return

        # 3. Oznacz e-mail jako zweryfikowany (Google gwarantuje weryfikację)
        primary_email = None
        for email_obj in sociallogin.email_addresses:
            email_obj.verified = True
            email_obj.primary = True
            if primary_email is None:
                primary_email = email_obj.email

        if not primary_email:
            return

        # 4. Sprawdź, czy istnieje rekord EmailAddress z tym e-mailem
        existing_email = (
            EmailAddress.objects.filter(email__iexact=primary_email)
            .select_related("user")
            .first()
        )

        if existing_email is None:
            # Zupełnie nowy e-mail — tworzenie konta możliwe
            return

        existing_user = existing_email.user

        # 5. Sprawdź, czy ten użytkownik MA już powiązane konto social
        has_social_account = SocialAccount.objects.filter(user=existing_user).exists()

        if has_social_account:
            # Użytkownik ma inne konto social z tym e-mailem (np. GitHub)
            # — blokujemy, by uniknąć zawiłości między dostawcami
            logger.warning(
                "SocialLogin: e-mail '%s' powiązany z innym dostawcą social. Blokowanie.",
                primary_email,
            )
            messages.error(
                request,
                _(
                    "Ten adres e-mail jest już powiązany z innym kontem społecznościowym. "
                    "Zaloguj się tym samym dostawcą, którego użyłeś podczas rejestracji."
                ),
            )
            raise ImmediateHttpResponse(
                redirect("login")  # nasz ostylowany widok, nie surowy allauth
            )
        else:
            # Użytkownik MA konto TRADYCYJNE (z formularza) — BLOKUJEMY przejęcie konta
            logger.warning(
                "SocialLogin: próba logowania przez Google na e-mail '%s', "
                "który należy do konta tradycyjnego. Blokowanie.",
                primary_email,
            )
            messages.error(
                request,
                _(
                    "Ten adres e-mail jest już powiązany ze standardowym kontem. "
                    "Zaloguj się za pomocą hasła."
                ),
            )
            raise ImmediateHttpResponse(
                redirect("login")  # nasz ostylowany widok, nie surowy allauth
            )

    def populate_user(self, request, sociallogin, data):
        """
        Wywoływane przez allauth przy tworzeniu/aktualizacji użytkownika z danych social.
        Jawnie kopiuje e-mail z danych Google do pola user.email.

        Bez tej metody allauth może pozostawić user.email pustym przy niektórych
        konfiguracjach (zależy od SOCIALACCOUNT_EMAIL_REQUIRED i kolejności hooków).
        """
        user = super().populate_user(request, sociallogin, data)

        # Jawne przypisanie e-maila z danych Google → user.email
        email = data.get("email") or ""
        if email and not user.email:
            user.email = email
            logger.info(
                "SocialLogin populate_user: przypisano e-mail '%s' z Google do user.email.",
                email,
            )

        return user

