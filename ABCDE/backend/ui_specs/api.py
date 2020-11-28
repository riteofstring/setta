from rest_framework.views import APIView
import json
from django.conf import settings
from rest_framework.response import Response

class UISpecsAPIView(APIView):
    def get(self, request, format=None):
        with open('{}/../ui_specifier/test.json'.format(settings.BASE_DIR)) as f:
            d = json.load(f)
        return Response(d)