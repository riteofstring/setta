from rest_framework import serializers

from .models import LatestCode, SavedUIs


class LatestCodeSerializer(serializers.ModelSerializer):
    class Meta:
        model = LatestCode
        fields = ("code", "codeToken")


class SavedUIsSerializer(serializers.ModelSerializer):
    class Meta:
        model = SavedUIs
        fields = ("uiName", "sections", "selections", "globalCurr")
