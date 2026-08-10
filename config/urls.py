from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    # Админ панель будет доступна по адресу /admin/
    path('admin/', admin.site.urls),
    
    # Все остальные адреса (главная страница, контакты и т.д.) 
# будут обрабатываться файлом urls.py внутри папки core
    path('', include('core.urls')),
]

# Для раздачи медиа-файлов (картинок из базы) при отладке
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
