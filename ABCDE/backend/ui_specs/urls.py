from django.conf.urls import url
from django.urls import include, path
from rest_framework import routers

from .api import (  # SavedVersionNamesAPIView,; SavedUINamesAPIView,
    DraftUIAPIView,
    SavedFolderAndUIAPIView,
    SavedFolderAndUINamesAPIView,
)

urlpatterns = [
    path("api/saved_folder_and_ui", SavedFolderAndUIAPIView.as_view()),
    path(
        "api/saved_folder_and_ui/<str:folderName>:<str:uiName>",
        SavedFolderAndUIAPIView.as_view(),
    ),
    path("api/saved_folder_and_ui_names", SavedFolderAndUINamesAPIView.as_view()),
    path("api/draft_ui", DraftUIAPIView.as_view()),
]
