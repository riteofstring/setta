from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from . import utils
from .models import UI, Folder


class FoldersAPIView(APIView):
    def post(self, request):
        utils.create_folder(request.user, request.data["name"])
        return Response({"result": "success"}, status=status.HTTP_201_CREATED)


class FoldersAndUIsAPIView(APIView):
    def post(self, request):
        utils.save_ui(request)
        return Response({"result": "success"}, status=status.HTTP_201_CREATED)


# class SavedFolderAndUIAPIView(APIView):
#     serializer = SavedFolderAndUISerializer

#     def get_ui_specs(self, request, folderName, uiName):
#         folder = SavedFolders.objects.get(owner=request.user, folderName=folderName)
#         ui = SavedUIs.objects.get(folder=folder, uiName=uiName)
#         return {
#             "folder": {"folderName": folderName},
#             "ui": {
#                 "uiName": uiName,
#                 "completeState": ui.completeState,
#             },
#         }

#     def actual_post_operation(self, serializer, request):
#         serializer.save(owner=request.user)
#         return Response({"result": "success"}, status=status.HTTP_201_CREATED)

#     def get(self, request, **kwargs):
#         uiSpecs = self.get_ui_specs(request, **kwargs)
#         if uiSpecs is None:
#             return Response(None, status=status.HTTP_200_OK)
#         serializer = self.serializer(data=uiSpecs)
#         if serializer.is_valid():
#             return Response(serializer.data, status=status.HTTP_200_OK)
#         return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

#     def post(self, request):
#         serializer = self.serializer(data=request.data)
#         if serializer.is_valid():
#             return self.actual_post_operation(serializer, request)
#         print(serializer.errors)
#         return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# class SavedFolderAndUINamesAPIView(APIView):
#     def get(self, request):
#         folderAndUINames = SavedUIs.objects.filter(folder__owner=request.user).values(
#             "uiName",
#             folderName=F("folder__folderName"),
#         )
#         output = defaultdict(list)
#         for x in folderAndUINames:
#             output[x["folderName"]].append(x["uiName"])

#         return Response({"folderAndUINames": output}, status=status.HTTP_200_OK)


# # class SavedUINamesAPIView(APIView):
# #     def get(self, request):
# #         uiNames = SavedUIs.objects.filter(owner=request.user).values_list(
# #             "uiName", flat=True
# #         )
# #         return Response({"uiNames": uiNames}, status=status.HTTP_200_OK)


# # class SavedVersionsAPIView(SavedUIsAPIView):
# #     serializer = SavedVersionsSerializer

# #     def get_ui_specs(self, request, uiName, versionName, **kwargs):
# #         ui = SavedUI(owner=request.user, uiName=uiName)
# #         return SavedVersions.objects.values(
# #             "completeState"
# #         ).get(ui=ui, versionName=versionName)

# #     def actual_post_operation(self, serializer, request):
# #         serializer.save(owner=request.user)
# #         return Response({"result": "success"}, status=status.HTTP_201_CREATED)


# # class SavedVersionNamesAPIView(APIView):
# #     def get(self, request, uiName):
# #         ui = SavedVersions(owner=request.user, uiName=uiName)
# #         versionNames = SavedVersions.objects.filter(ui=ui).values_list(
# #             "versionName", flat=True
# #         )
# #         return Response({"versionNames": versionNames}, status=status.HTTP_200_OK)


# class DraftUIAPIView(SavedFolderAndUIAPIView):
#     serializer = DraftUISerializer

#     def get_ui_specs(self, request):
#         return (
#             DraftUI.objects.values("completeState").filter(owner=request.user).first()
#         )

#     def actual_post_operation(self, serializer, request):
#         obj, created = DraftUI.objects.update_or_create(
#             defaults=serializer.data, owner=request.user
#         )
#         return Response({"result": "success"}, status=status.HTTP_201_CREATED)
