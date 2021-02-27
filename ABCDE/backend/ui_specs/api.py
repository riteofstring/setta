import json

from abcde_pip.creation.create_ui import create_ui
from django.conf import settings
from django.contrib.auth.models import User
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from ui_specifier.utils.yaml_parsing import generate_code, load_yaml

from .models import DraftUI, LatestCode, SavedUIs
from .serializers import DraftUISerializer, LatestCodeSerializer, SavedUIsSerializer


class GenerateCodeAPIView(APIView):
    def get(self, request, **kwargs):
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
        ui_as_json, factories, funcs = create_ui(request.data["enteredText"])
        return Response(
            {"uiAsJson": ui_as_json, "factories": factories, "funcs": funcs},
            status=status.HTTP_201_CREATED,
        )


class SavedUIsAPIView(APIView):
    serializer = SavedUIsSerializer

    def get_ui_specs(self, request, **kwargs):
        return SavedUIs.objects.values(
            "uiName", "sections", "selected", "globalCurr", "yamlText"
        ).get(owner=request.user, uiName=kwargs["uiName"])

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


class SavedUINamesAPIView(APIView):
    def get(self, request):
        uiNames = SavedUIs.objects.filter(owner=request.user).values_list(
            "uiName", flat=True
        )
        return Response({"uiNames": uiNames}, status=status.HTTP_200_OK)


class DraftUIAPIView(SavedUIsAPIView):
    serializer = DraftUISerializer

    def get_ui_specs(self, request, **kwargs):
        return (
            DraftUI.objects.values("sections", "selected", "globalCurr", "yamlText")
            .filter(owner=request.user)
            .first()
        )

    def actual_post_operation(self, serializer, request):
        obj, created = DraftUI.objects.update_or_create(
            defaults=serializer.data, owner=request.user
        )
        return Response({"result": "success"}, status=status.HTTP_201_CREATED)
