from django.contrib.auth.models import User
from django.db import models

# Create your models here.


class DraftUI(models.Model):
    owner = models.ForeignKey(User, on_delete=models.CASCADE)
    completeState = models.TextField()

    class Meta:
        constraints = [models.UniqueConstraint(fields=["owner"], name="unique_owner")]


class SavedFolders(models.Model):
    owner = models.ForeignKey(User, on_delete=models.CASCADE)
    folderName = models.TextField()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["owner", "folderName"], name="unique_folderName"
            )
        ]


class SavedUIs(models.Model):
    uiName = models.TextField()
    folder = models.ForeignKey(SavedFolders, on_delete=models.CASCADE, default=None)
    completeState = models.TextField(default="")

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["uiName", "folder"], name="unique_uiName")
        ]


class SavedSections(models.Model):
    sectionName = models.TextField()
    ui = models.ForeignKey(SavedUIs, on_delete=models.CASCADE)
    state = models.TextField()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["sectionName", "ui"], name="unique_sectionName"
            )
        ]
