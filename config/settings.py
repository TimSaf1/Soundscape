import os
from pathlib import Path
import dj_database_url
from dotenv import load_dotenv

load_dotenv()

# Теперь BASE_DIR указывает на корень репозитория, где лежит manage.py
BASE_DIR = Path(__file__).resolve().parent.parent 

SECRET_KEY = os.getenv("SECRET_KEY")
DEBUG = os.getenv("DEBUG") == "True"

ALLOWED_HOSTS = ["https://soundscape2.up.railway.app/"] # Для теста. Позже смените на ['ваш-домен.up.railway.app']

DATABASES = {
    'default': dj_database_url.config(
        default=os.getenv("DATABASE_URL"),
        conn_max_age=600,
        ssl_require=True
    )
}

# Статика: обратите внимание, что папки staticfiles и media создадутся В КОРНЕ
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles' 
STATICFILES_DIRS = [BASE_DIR / "static"] 
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'
