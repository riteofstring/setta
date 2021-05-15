from rest_framework import serializers

from .models import Folders


class FoldersSerializer(serializers.ModelSerializer):
    class Meta:
        model = Folders
        fields = ("name",)
