from django.shortcuts import render
from django.http import HttpResponse

def index(request):
    # Возвращает простую HTML-строку или рендерит шаблон templates/core/index.html
    return HttpResponse("<h1>Привет! Сайт работает на Railway!</h1>")

# def about(request):
#     return render(request, 'core/about.html')
