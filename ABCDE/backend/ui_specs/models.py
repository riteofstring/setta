from django.contrib.auth.models import User
from django.db import models

# Create your models here.


class SavedUIs(models.Model):
    owner = models.ForeignKey(User, on_delete=models.CASCADE)
    uiName = models.TextField()
    sections = models.TextField()
    selections = models.TextField()
    globalCurr = models.TextField()

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["owner", "uiName"], name="unique_uiName")
        ]


class LatestCode(models.Model):
    owner = models.OneToOneField(User, on_delete=models.CASCADE, primary_key=True)
    codeToken = models.TextField(default="")
    code = models.TextField(default="")
