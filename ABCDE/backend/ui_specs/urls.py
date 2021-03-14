from django.conf.urls import url
from django.urls import include, path
from rest_framework import routers

from .api import (  # SavedVersionNamesAPIView,; SavedUINamesAPIView,
    DraftUIAPIView,
    SavedFolderAndUINamesAPIView,
)

urlpatterns = [
    # path("api/saved_uis", SavedUIsAPIView.as_view()),
    # path(
    #     "api/saved_uis/<str:uiName>:<str:versionName>",
    #     SavedUIsAPIView.as_view(),
    # ),
    path("api/saved_folder_and_ui_names", SavedFolderAndUINamesAPIView.as_view()),
    path("api/draft_ui", DraftUIAPIView.as_view()),
]
