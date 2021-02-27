from rest_framework import serializers

from .models import DraftUI, LatestCode, SavedUIs


class LatestCodeSerializer(serializers.ModelSerializer):
    class Meta:
        model = LatestCode
        fields = ("code", "codeToken")


class SavedUIsSerializer(serializers.ModelSerializer):
    class Meta:
        model = SavedUIs
        fields = ("uiName", "sections", "selected", "globalCurr")


class DraftUISerializer(serializers.ModelSerializer):
    class Meta:
        model = DraftUI
        fields = ("sections", "selected", "globalCurr")
