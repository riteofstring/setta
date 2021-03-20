from rest_framework import serializers

from .models import DraftUI, SavedFolders, SavedUIs


class SavedUIsSerializer(serializers.ModelSerializer):
    class Meta:
        model = SavedUIs
        fields = ("uiName", "folder", "completeState")


class SavedFoldersSerializer(serializers.ModelSerializer):
    class Meta:
        model = SavedFolders
        fields = ("folderName",)


class SavedFolderAndUISerializer(serializers.Serializer):
    folder = SavedFoldersSerializer()
    ui = SavedUIsSerializer()

    def create(self, validated_data):

        folderName = validated_data["folder"].pop("folderName")
        new_folder, folder_was_created = SavedFolders.objects.get_or_create(
            owner=validated_data["owner"],
            folderName=folderName,
            defaults=validated_data["folder"],
        )

        uiName = validated_data["ui"].pop("uiName")

        new_ui, ui_was_created = SavedUIs.objects.update_or_create(
            folder=new_folder, uiName=uiName, defaults=validated_data["ui"]
        )
        return new_folder, new_ui


class DraftUISerializer(serializers.ModelSerializer):
    class Meta:
        model = DraftUI
        fields = ("completeState",)
