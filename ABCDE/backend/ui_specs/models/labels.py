from django.contrib.auth.models import User
from django.db import models


class Folder(models.Model):
    name = models.TextField()
    owner = models.ForeignKey(User, on_delete=models.CASCADE)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["owner", "name"], name="folder_unique_name")
        ]


class Tag(models.Model):
    name = models.TextField()
    owner = models.ForeignKey(User, on_delete=models.CASCADE)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["owner", "name"], name="tag_unique_name")
        ]
