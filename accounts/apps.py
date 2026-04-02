from django.apps import AppConfig


class AccountsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'accounts'

    def ready(self):
        # Importujemy models żeby sygnały post_save zostały zarejestrowane
        import accounts.models  # noqa: F401
