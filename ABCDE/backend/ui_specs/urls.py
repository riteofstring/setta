from django.conf.urls import url
from django.urls import include, path
from rest_framework import routers

from .api import SavedUINamesAPIView, SavedUIsAPIView, UISpecsAPIView

urlpatterns = [
    path("api/ui_specs", UISpecsAPIView.as_view()),
    path("api/saved_uis", SavedUIsAPIView.as_view()),
    path("api/saved_uis/<str:uiName>", SavedUIsAPIView.as_view()),
    path("api/saved_ui_names", SavedUINamesAPIView.as_view()),
]
