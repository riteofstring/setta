import json
from collections import defaultdict

from abcde_pip.creation.create_ui import create_ui
from django.conf import settings
from django.contrib.auth.models import User
from django.db.models import F
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from ui_specifier.utils.yaml_parsing import generate_code, load_yaml

from .models import DraftUI, LatestCode, SavedUIs, SavedVersions
from .routing import broadcast_newUI
from .serializers import (
    DraftUISerializer,
    LatestCodeSerializer,
    SavedUIAndVersionSerializer,
)


class GenerateCodeAPIView(APIView):
    def get(self, request):
        latest_code = LatestCode.objects.values("code", "codeToken").get(
            owner=request.user
        )
        serializer = LatestCodeSerializer(data=latest_code)
        if serializer.is_valid():
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def post(self, request):
        ui_selections = request.data["SELECTED"]
        factory_specs = request.data["FACTORIES"]
        funcs = request.data["FUNCS"]
        ui_repr = generate_code(ui_selections, factory_specs, funcs)
        serializer = LatestCodeSerializer(
            data={"codeToken": request.data["codeToken"], "code": str(ui_repr)}
        )
        if serializer.is_valid():
            obj, created = LatestCode.objects.update_or_create(
                defaults=serializer.data, owner=request.user
            )
            return Response({"result": "success"}, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class CreateUIAPIView(APIView):
    def post(self, request):
        broadcast_newUI("WEBSOCKET BROS!!!!!!!!!!!")
        ui_as_json, factories, funcs = create_ui(request.data["enteredText"])
        return Response(
            {"uiAsJson": ui_as_json, "factories": factories, "funcs": funcs},
            status=status.HTTP_201_CREATED,
        )


class SavedUIAndVersionsAPIView(APIView):
    serializer = SavedUIAndVersionSerializer

    def get_ui_specs(self, request, uiName, versionName):
        ui = SavedUIs.objects.get(owner=request.user, uiName=uiName)
        version = SavedVersions.objects.get(ui=ui, versionName=versionName)
        return {
            "ui": {"uiName": uiName, "rootSections": ui.rootSections},
            "version": {
                "versionName": versionName,
                "completeState": version.completeState,
            },
        }

    def actual_post_operation(self, serializer, request):
        serializer.save(owner=request.user)
        return Response({"result": "success"}, status=status.HTTP_201_CREATED)

    def get(self, request, **kwargs):
        uiSpecs = self.get_ui_specs(request, **kwargs)
        if uiSpecs is None:
            return Response(None, status=status.HTTP_200_OK)
        serializer = self.serializer(data=uiSpecs)
        if serializer.is_valid():
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def post(self, request):
        serializer = self.serializer(data=request.data)
        if serializer.is_valid():
            return self.actual_post_operation(serializer, request)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class SavedUIAndVersionNamesAPIView(APIView):
    def get(self, request):
        uiAndVersionNames = SavedVersions.objects.filter(ui__owner=request.user).values(
            "versionName",
            uiName=F("ui__uiName"),
        )
        output = defaultdict(list)
        for x in uiAndVersionNames:
            output[x["uiName"]].append(x["versionName"])

        return Response({"uiAndVersionNames": output}, status=status.HTTP_200_OK)


# class SavedUINamesAPIView(APIView):
#     def get(self, request):
#         uiNames = SavedUIs.objects.filter(owner=request.user).values_list(
#             "uiName", flat=True
#         )
#         return Response({"uiNames": uiNames}, status=status.HTTP_200_OK)


# class SavedVersionsAPIView(SavedUIsAPIView):
#     serializer = SavedVersionsSerializer

#     def get_ui_specs(self, request, uiName, versionName, **kwargs):
#         ui = SavedUI(owner=request.user, uiName=uiName)
#         return SavedVersions.objects.values(
#             "completeState"
#         ).get(ui=ui, versionName=versionName)

#     def actual_post_operation(self, serializer, request):
#         serializer.save(owner=request.user)
#         return Response({"result": "success"}, status=status.HTTP_201_CREATED)


# class SavedVersionNamesAPIView(APIView):
#     def get(self, request, uiName):
#         ui = SavedVersions(owner=request.user, uiName=uiName)
#         versionNames = SavedVersions.objects.filter(ui=ui).values_list(
#             "versionName", flat=True
#         )
#         return Response({"versionNames": versionNames}, status=status.HTTP_200_OK)


class DraftUIAPIView(SavedUIAndVersionsAPIView):
    serializer = DraftUISerializer

    def get_ui_specs(self, request):
        return (
            DraftUI.objects.values("completeState").filter(owner=request.user).first()
        )

    def actual_post_operation(self, serializer, request):
        obj, created = DraftUI.objects.update_or_create(
            defaults=serializer.data, owner=request.user
        )
        return Response({"result": "success"}, status=status.HTTP_201_CREATED)
