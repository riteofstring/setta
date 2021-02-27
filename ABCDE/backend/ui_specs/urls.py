from django.conf.urls import url
from django.urls import include, path
from rest_framework import routers

from .api import (  # SavedVersionNamesAPIView,
    CreateUIAPIView,
    DraftUIAPIView,
    GenerateCodeAPIView,
    SavedUINamesAPIView,
    SavedUIsAPIView,
)

urlpatterns = [
    path("api/generate_code", GenerateCodeAPIView.as_view()),
    path("api/create_ui", CreateUIAPIView.as_view()),
    path("api/saved_uis", SavedUIsAPIView.as_view()),
    path("api/saved_uis/<str:uiName>", SavedUIsAPIView.as_view()),
    path("api/saved_ui_names", SavedUINamesAPIView.as_view()),
    # path("api/saved_version_names", SavedVersionNamesAPIView.as_view()),
    path("api/draft_ui", DraftUIAPIView.as_view()),
]
