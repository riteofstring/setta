from rest_framework import serializers

# class FoldersSerializer(serializers.ModelSerializer):
#     class Meta:
#         model = Folders
#         fields = ("name",)

# class ModuleSerializer(serializers.ModelSerializer):
#     class Meta:
#         model = Modules
#         fields = ("name",)

# # class ModuleSerializer(serializers.ModelSerializer):
# #     class Meta:
# #         model = Modules
# #         fields = ("name",)


# class ModuleCollectionsSerializer(serializers.Serializer):
#     modules = ModuleSerializer()
#     class Meta:
#         model = ModuleCollections
#         fields = ("name",)


# # class ParameterCollectionsSerializer(serializers.Serializer):
# #     class Meta:
# #         model = ParameterCollections
# #         fields = ("name",)


# class UIsSerializer(serializers.Serializer):
#     availableModules = ModuleCollectionsSerializer()
#     # availableParameters = ParameterCollectionsSerializer()

#     def validate(self, data):
#         print("data", data)


# class FoldersAndUIsSerializer(serializers.Serializer):
#     folder = FoldersSerializer()
#     ui = UIsSerializer()

#     def create(self, validated_data):
#         folderName = validated_data["folder"].pop("name")
#         new_folder, folder_was_created = Folders.objects.get_or_create(
#             owner=validated_data["owner"],
#             name=folderName,
#         )

#         uiName = validated_data["ui"].pop("name")
#         availableModules = validated_data["ui"].pop("availableModules", None)
#         if availableModules:
#             print("availableModules", availableModules)

#         new_ui, ui_was_created = UIs.objects.update_or_create(
#             folder=new_folder,
#             name=uiName,
#         )
#         return new_folder, new_ui
