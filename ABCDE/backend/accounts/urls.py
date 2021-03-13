from django.urls import include, path
from knox import views as knox_views

from .api import LoginAPI, RegisterAPI, WebsocketTokenAPI

urlpatterns = [
    path("api/auth/register", RegisterAPI.as_view()),
    path("api/auth/login", LoginAPI.as_view()),
    path("api/auth/logout", knox_views.LogoutView.as_view(), name="knox_logout"),
    path(
        "api/auth/logoutall", knox_views.LogoutAllView.as_view(), name="knox_logoutall"
    ),
    path("api/auth/websocketAuth", WebsocketTokenAPI.as_view()),
]
