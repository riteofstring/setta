from rest_framework import serializers

from .models import DraftUI, LatestCode, SavedUIs, SavedVersions


class LatestCodeSerializer(serializers.ModelSerializer):
    class Meta:
        model = LatestCode
        fields = ("code", "codeToken")


class SavedUIsSerializer(serializers.ModelSerializer):
    class Meta:
        model = SavedUIs
        fields = ("uiName", "rootSections")


class SavedVersionsSerializer(serializers.ModelSerializer):
    class Meta:
        model = SavedVersions
        fields = ("versionName", "completeState")


class SavedUIAndVersionSerializer(serializers.Serializer):
    ui = SavedUIsSerializer()
    version = SavedVersionsSerializer()

    def create(self, validated_data):
        new_ui = SavedUIs.objects.create(
            owner=validated_data["owner"], **validated_data["ui"]
        )
        new_version = SavedVersions.objects.create(
            ui=new_ui, **validated_data["version"]
        )
        return new_ui, new_version


class DraftUISerializer(serializers.ModelSerializer):
    class Meta:
        model = DraftUI
        fields = ("completeState",)
