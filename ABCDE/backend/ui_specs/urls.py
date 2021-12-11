from django.urls import path

from .api import FoldersAndUIsAPIView, FoldersAPIView

urlpatterns = [
    path("api/folders", FoldersAPIView.as_view()),
    path("api/foldersAndUIs", FoldersAndUIsAPIView.as_view()),
    # path(
    #     "api/saved_folder_and_ui/<str:folderName>:<str:uiName>",
    #     SavedFolderAndUIAPIView.as_view(),
    # ),
    #
    # path("api/draft_ui", DraftUIAPIView.as_view()),
]
