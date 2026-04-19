from allauth.account.adapter import DefaultAccountAdapter
from django.contrib import messages
from django.utils.translation import gettext_lazy as _

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
