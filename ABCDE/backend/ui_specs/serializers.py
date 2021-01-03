from rest_framework import serializers
from .models import SavedUIs

class SavedUIsSerializer(serializers.ModelSerializer):
	class Meta:
		model = SavedUIs
		fields = ('uiName', 'sections', 'selections', 'globalCurr')