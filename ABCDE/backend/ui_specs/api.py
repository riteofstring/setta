import json

from django.conf import settings
from django.contrib.auth.models import User
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import SavedUIs
from .serializers import SavedUIsSerializer


class UISpecsAPIView(APIView):
    def get(self, request, format=None):
        with open("{}/../ui_specifier/test.json".format(settings.BASE_DIR)) as f:
            d = json.load(f)
        return Response(d)


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
