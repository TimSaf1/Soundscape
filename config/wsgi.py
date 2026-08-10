import os

from django.core.wsgi import get_wsgi_application

# ВАЖНО: Название должно совпадать с вашим пакетом настроек (папкой config)
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

application = get_wsgi_application()
