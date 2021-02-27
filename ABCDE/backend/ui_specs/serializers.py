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
        new_ui, ui_was_created = SavedUIs.objects.get_or_create(
            owner=validated_data["owner"], **validated_data["ui"]
        )
        new_version, version_was_created = SavedVersions.objects.update_or_create(
            ui=new_ui, **validated_data["version"]
        )
        return new_ui, new_version


class DraftUISerializer(serializers.ModelSerializer):
    class Meta:
        model = DraftUI
        fields = ("completeState",)
