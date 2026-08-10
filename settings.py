from pathlib import Path
import os
import dj_database_url
from dotenv import load_dotenv

load_dotenv()

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'whitenoise.runserver_nostatic', # Добавьте эту строку для корректной работы whitenoise локально
    'core', # Ваше приложение
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware', # Критически важно: вставить сюда
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

# Замените весь блок DATABASES на этот:
DATABASES = {
    'default': dj_database_url.config(
        default=os.getenv("DATABASE_URL"),
        conn_max_age=600,
        ssl_require=True
    )
}

# Статические файлы (CSS, JS, Images)
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles' # Куда собирать файлы командой collectstatic
STATICFILES_DIRS = [BASE_DIR / "static"] # Где искать ваши кастомные стили

# Медиа-файлы (загрузки пользователей)
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

# Ключевые настройки безопасности
SECRET_KEY = os.getenv("SECRET_KEY")

ALLOWED_HOSTS = ["*"] # Для теста. В будущем смените на ['.railway.app']

DEBUG = os.getenv("DEBUG") == "True"
