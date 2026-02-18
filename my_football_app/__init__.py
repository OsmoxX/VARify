# To sprawia, że Celery uruchamia się zawsze, gdy uruchamiasz Django
from .celery import app as celery_app

__all__ = ('celery_app',)