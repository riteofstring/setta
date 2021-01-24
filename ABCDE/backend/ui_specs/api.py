import json

from django.conf import settings
from django.contrib.auth.models import User
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from ui_specifier.creation.create_ui import create_ui
from ui_specifier.utils.yaml_parsing import generate_code, load_yaml

from .models import SavedUIs
from .serializers import SavedUIsSerializer


class GenerateCodeAPIView(APIView):
    def post(self, request):
        ## hard-coded for now
        factory_specs = load_yaml(
            "D:\\Documents\\App Development\\ABCDE\\ui_specifier\\integration_tests\\reading_specs\\simple_train_test_factory_specs.yaml"
        )
        funcs = load_yaml(
            "D:\\Documents\\App Development\\ABCDE\\ui_specifier\\integration_tests\\reading_specs\\simple_train_test_functions.yaml"
        )
        ui_repr = generate_code(request.data["uiSelections"], factory_specs, funcs)
        return Response({"generatedCode": str(ui_repr)}, status=status.HTTP_201_CREATED)


class CreateUIAPIView(APIView):
    # def get(self, request, format=None):
    #     with open("{}/../ui_specifier/test.json".format(settings.BASE_DIR)) as f:
    #         d = json.load(f)
    #     return Response(d)

    def post(self, request):
        ui_as_json = create_ui(request.data["uiSpecs"])
        return Response({"uiAsJson": ui_as_json}, status=status.HTTP_201_CREATED)


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
