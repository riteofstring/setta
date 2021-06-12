from django.contrib.auth.models import User
from django.db import models

from .labels import Folder, Tag


def get_base_model(constraint_name, parent_table=None):
    fields = ["name", "owner"]
    if parent_table is not None:
        fields += ["parent"]

    class BaseModel(models.Model):
        name = models.TextField()
        owner = models.ForeignKey(User, on_delete=models.CASCADE)
        if parent_table is not None:
            parent = models.ForeignKey(parent_table, on_delete=models.CASCADE)

        class Meta:
            constraints = [models.UniqueConstraint(fields=fields, name=constraint_name)]

    return BaseModel


def get_base_relationship_model(
    table, constraint_name, parent_table=None, single_parent=False
):
    parent_table = table if parent_table is None else parent_table
    fields = ["entity"]
    if not single_parent:
        fields += ["parent"]

    class BaseRelationshipModel(models.Model):
        entity = models.ForeignKey(table, on_delete=models.CASCADE)
        parent = models.ForeignKey(
            parent_table, on_delete=models.CASCADE, related_name="parent"
        )

        class Meta:
            constraints = [models.UniqueConstraint(fields=fields, name=constraint_name)]

    return BaseRelationshipModel


def get_base_folder_model(table, constraint_name):
    class BaseFolderModel(models.Model):
        entity = models.ForeignKey(table, on_delete=models.CASCADE)
        folder = models.ForeignKey(Folder, on_delete=models.CASCADE)

        class Meta:
            constraints = [
                models.UniqueConstraint(
                    fields=["entity", "folder"], name=constraint_name
                )
            ]

    return BaseFolderModel


def get_base_tag_model(table, constraint_name):
    class BaseTagModel(models.Model):
        entity = models.ForeignKey(table, on_delete=models.CASCADE)
        tag = models.ForeignKey(Tag, on_delete=models.CASCADE)

        class Meta:
            constraints = [
                models.UniqueConstraint(fields=["entity", "tag"], name=constraint_name)
            ]

    return BaseTagModel
