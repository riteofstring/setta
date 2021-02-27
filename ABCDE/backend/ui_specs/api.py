import json

from abcde_pip.creation.create_ui import create_ui
from django.conf import settings
from django.contrib.auth.models import User
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from ui_specifier.utils.yaml_parsing import generate_code, load_yaml

from .models import LatestCode, SavedUIs
from .serializers import LatestCodeSerializer, SavedUIsSerializer


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
        ui_selections = request.data["SELECTIONS"]
        factory_specs = request.data["FACTORIES"]
        funcs = request.data["FUNCS"]
        ui_repr = generate_code(ui_selections, factory_specs, funcs)
        serializer = LatestCodeSerializer(
            data={"codeToken": request.data["codeToken"], "code": str(ui_repr)}
        )
        if serializer.is_valid():
            try:
                LC = LatestCode.objects.get(owner=request.user)
                LC.code = serializer.data["code"]
                LC.codeToken = serializer.data["codeToken"]
                LC.save(update_fields=["code", "codeToken"])
            except (LatestCode.DoesNotExist):
                serializer.save(owner=request.user)
            return Response({"result": "success"}, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class CreateUIAPIView(APIView):
    # def get(self, request, format=None):
    #     with open("{}/../ui_specifier/test.json".format(settings.BASE_DIR)) as f:
    #         d = json.load(f)
    #     return Response(d)

    def post(self, request):
        ui_as_json, factories, funcs = create_ui(request.data["enteredText"])
        return Response(
            {"uiAsJson": ui_as_json, "factories": factories, "funcs": funcs},
            status=status.HTTP_201_CREATED,
        )


class SavedUIsAPIView(APIView):
    def get(self, request, **kwargs):
        uiSpecs = SavedUIs.objects.values(
            "uiName", "sections", "selections", "globalCurr"
        ).get(owner=request.user, uiName=kwargs["uiName"])
        serializer = SavedUIsSerializer(data=uiSpecs)
        if serializer.is_valid():
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def post(self, request):
        serializer = SavedUIsSerializer(data=request.data)

        if serializer.is_valid():
            serializer.save(owner=request.user)
            return Response({"result": "success"}, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class SavedUINamesAPIView(APIView):
    def get(self, request):
        uiNames = SavedUIs.objects.filter(owner=request.user).values_list(
            "uiName", flat=True
        )
        return Response({"uiNames": uiNames}, status=status.HTTP_200_OK)
