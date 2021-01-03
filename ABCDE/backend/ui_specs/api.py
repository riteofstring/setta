from rest_framework.views import APIView
from rest_framework import permissions
import json
from django.conf import settings
from rest_framework.response import Response
from knox.auth import TokenAuthentication
from .serializers import SavedUIsSerializer
from django.contrib.auth.models import User


class UISpecsAPIView(APIView):
    def get(self, request, format=None):
        with open("{}/../ui_specifier/test.json".format(settings.BASE_DIR)) as f:
            d = json.load(f)
        return Response(d)


class SavedUIsAPIView(APIView):
    authentication_classes = [TokenAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, format=None):
        print("request.user.id", request.user.id)
        # user = User.objects.filter(owner=request.user)
        serializer = SavedUIsSerializer(data=request.data)
        if serializer.is_valid():
            print("is valid")
            serializer.save(owner=request.user)
        # return Response(serializer.data, status=status.HTTP_201_CREATED)
        # return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)