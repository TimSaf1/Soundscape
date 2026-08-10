from django.urls import path
from . import views

app_name = 'core' # Пространство имен, чтобы не путать имена ссылок

urlpatterns = [
    # Путь "" означает главную страницу (например, https://my-site.up.railway.app/)
    path('', views.index, name='index'),
    
    # Пример другой страницы
    # path('about/', views.about, name='about'),
]
