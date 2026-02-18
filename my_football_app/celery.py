from __future__ import absolute_import, unicode_literals
import os
from celery import Celery

# 1. Informujemy Celery, gdzie są ustawienia naszego projektu Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'my_football_app.settings')

# 2. Tworzymy aplikację Celery i nazywamy ją tak jak nasz projekt
app = Celery('my_football_app')

# 3. Ładujemy ustawienia z pliku settings.py (będą miały przedrostek CELERY_)
app.config_from_object('django.conf:settings', namespace='CELERY')

# 4. Celery automatycznie przeszuka wszystkie Twoje apki w poszukiwaniu pliku tasks.py
app.autodiscover_tasks()