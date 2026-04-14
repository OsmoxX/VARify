from django.apps import AppConfig
import logging

logger = logging.getLogger(__name__)

class MatchesConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'matches'

    def ready(self) -> None:
        from django.contrib import admin
        from webpush.models import PushInformation

        class VarifyPushAdmin(admin.ModelAdmin):
            list_display = ('user', 'get_browser', 'get_endpoint_preview')
            list_filter = ('user',)

            @admin.display(description='Przeglądarka')
            def get_browser(self, obj: PushInformation) -> str:
                return obj.subscription.browser if obj.subscription else "Brak"

            @admin.display(description='Adres')
            def get_endpoint_preview(self, obj: PushInformation) -> str:
                endpoint = obj.subscription.endpoint if obj.subscription else ""
                return f"{endpoint[:50]}..." if len(endpoint) > 50 else endpoint

        try:
            if admin.site.is_registered(PushInformation):
                admin.site.unregister(PushInformation)
            admin.site.register(PushInformation, VarifyPushAdmin)
        except Exception as e:
            logger.error("Błąd podczas rejestracji panelu WebPush: %s", e)


