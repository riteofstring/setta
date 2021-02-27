from django.conf.urls import url
from django.urls import include, path
from rest_framework import routers

from .api import (  # SavedVersionNamesAPIView,
    CreateUIAPIView,
    DraftUIAPIView,
    GenerateCodeAPIView,
    SavedUIAndVersionNamesAPIView,
    SavedUIAndVersionsAPIView,
)

urlpatterns = [
    path("api/generate_code", GenerateCodeAPIView.as_view()),
    path("api/create_ui", CreateUIAPIView.as_view()),
    path("api/saved_uis", SavedUIAndVersionsAPIView.as_view()),
    path(
        "api/saved_uis/<str:uiName>:<str:versionName>",
        SavedUIAndVersionsAPIView.as_view(),
    ),
    path("api/saved_ui_and_version_names", SavedUIAndVersionNamesAPIView.as_view()),
    # path("api/saved_version_names", SavedVersionNamesAPIView.as_view()),
    path("api/draft_ui", DraftUIAPIView.as_view()),
]
