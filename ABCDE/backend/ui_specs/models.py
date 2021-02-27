from django.contrib.auth.models import User
from django.db import models

# Create your models here.


class DraftUI(models.Model):
    owner = models.ForeignKey(User, on_delete=models.CASCADE)
    completeState = models.TextField()

    class Meta:
        constraints = [models.UniqueConstraint(fields=["owner"], name="unique_owner")]


class SavedUIs(models.Model):
    owner = models.ForeignKey(User, on_delete=models.CASCADE)
    uiName = models.TextField()
    rootSections = models.TextField()

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["owner", "uiName"], name="unique_uiName")
        ]


class SavedVersions(models.Model):
    ui = models.ForeignKey(SavedUIs, on_delete=models.CASCADE)
    versionName = models.TextField()
    completeState = models.TextField()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["ui", "versionName"], name="unique_versionName"
            )
        ]


class LatestCode(models.Model):
    owner = models.OneToOneField(User, on_delete=models.CASCADE, primary_key=True)
    codeToken = models.TextField(default="")
    code = models.TextField(default="")
