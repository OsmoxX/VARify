from django.apps import AppConfig

class MatchesConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'matches'

    def ready(self):
        from django.contrib import admin
        from webpush.models import PushInformation
        
        # Definiujemy klasę admina tutaj, wewnątrz funkcji
        class VarifyPushAdmin(admin.ModelAdmin):
            list_display = ('user', 'get_browser', 'get_endpoint_preview')
            list_filter = ('user',)
            
            def get_browser(self, obj):
                return obj.subscription.browser if obj.subscription else "Brak"
            get_browser.short_description = 'Przeglądarka'

            def get_endpoint_preview(self, obj):
                endpoint = obj.subscription.endpoint if obj.subscription else ""
                return f"{endpoint[:50]}..." if len(endpoint) > 50 else endpoint
            get_endpoint_preview.short_description = 'Adres'

        # Kluczowy moment: Wyrejestruj i Zarejestruj ponownie
        try:
            if admin.site.is_registered(PushInformation):
                admin.site.unregister(PushInformation)
            admin.site.register(PushInformation, VarifyPushAdmin)
        except Exception:
            pass
