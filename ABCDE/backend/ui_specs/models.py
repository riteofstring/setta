from django.contrib.auth.models import User
from django.db import models

# Create your models here.


class Folder(models.Model):
    name = models.TextField()
    owner = models.ForeignKey(User, on_delete=models.CASCADE)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["owner", "name"], name="folder_unique_name")
        ]


class UI(models.Model):
    name = models.TextField()
    folder = models.ForeignKey(Folder, on_delete=models.CASCADE)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["name", "folder"], name="ui_unique_name")
        ]


class SectionCollection(models.Model):
    name = models.TextField()
    folder = models.ForeignKey(Folder, on_delete=models.CASCADE)
    originUI = models.ForeignKey(UI, on_delete=models.SET_NULL, null=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["name", "folder"], name="section_collection_unique_name"
            )
        ]


class ModuleCollection(models.Model):
    name = models.TextField()
    folder = models.ForeignKey(Folder, on_delete=models.CASCADE)
    originUI = models.ForeignKey(UI, on_delete=models.SET_NULL, null=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["name", "folder"], name="module_collection_unique_name"
            )
        ]


class ParameterCollection(models.Model):
    name = models.TextField()
    folder = models.ForeignKey(Folder, on_delete=models.CASCADE)
    originUI = models.ForeignKey(UI, on_delete=models.SET_NULL, null=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["name", "folder"], name="parameter_collection_unique_name"
            )
        ]


class Module(models.Model):
    name = models.TextField()
    folder = models.ForeignKey(Folder, on_delete=models.CASCADE)
    originCollection = models.ForeignKey(
        ModuleCollection, on_delete=models.SET_NULL, null=True
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["name", "originCollection"], name="module_unique_name"
            )
        ]


class Object(models.Model):
    name = models.TextField()
    belongsTo = models.ForeignKey(Module, on_delete=models.CASCADE)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["name", "belongsTo"], name="object_unique_name"
            )
        ]


class Section(models.Model):
    name = models.TextField()
    originCollection = models.ForeignKey(
        SectionCollection,
        on_delete=models.SET_NULL,
        null=True,
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["name", "originCollection"], name="section_unique_name"
            )
        ]


class SectionContent(models.Model):
    name = models.TextField()
    originSection = models.ForeignKey(Section, on_delete=models.SET_NULL, null=True)
    availableModules = models.ForeignKey(
        ModuleCollection, on_delete=models.SET_NULL, null=True
    )
    availableParameters = models.ForeignKey(
        ParameterCollection, on_delete=models.SET_NULL, null=True
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["name", "originSection"], name="section_content_unique_name"
            )
        ]


class ModuleObjectSelection(models.Model):
    name = models.TextField()
    selectedModule = models.ForeignKey(Module, on_delete=models.CASCADE)
    selectedObject = models.ForeignKey(Object, on_delete=models.CASCADE)
    originSectionContent = models.ForeignKey(SectionContent, on_delete=models.CASCADE)
    children = models.ForeignKey(
        SectionCollection,
        on_delete=models.SET_NULL,
        null=True,
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["name", "originSectionContent"], name="selection_unique_name"
            )
        ]


class UIContent(models.Model):
    originUI = models.ForeignKey(UI, on_delete=models.CASCADE)
    sections = models.ForeignKey(
        SectionCollection, on_delete=models.SET_NULL, null=True
    )
    availableModules = models.ForeignKey(
        ModuleCollection, on_delete=models.SET_NULL, null=True
    )
    availableParameters = models.ForeignKey(
        ParameterCollection, on_delete=models.SET_NULL, null=True
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["originUI"], name="ui_content_unique_origin"
            )
        ]


class ObjectParameter(models.Model):
    name = models.TextField()
    belongsTo = models.ForeignKey(Object, on_delete=models.CASCADE, null=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["name", "belongsTo"],
                name="object_parameter_unique_name",
            )
        ]


class ParameterCollectionParameter(models.Model):
    name = models.TextField()
    belongsTo = models.ForeignKey(
        ParameterCollection, on_delete=models.CASCADE, null=True
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["name", "belongsTo"],
                name="parameter_collection_parameter_unique_name",
            )
        ]


class ObjectParameterEnteredValue(models.Model):
    parameter = models.ForeignKey(ObjectParameter, on_delete=models.CASCADE)
    value = models.TextField()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["parameter"],
                name="object_parameter_entered_value_unique_parameter",
            )
        ]


class ParameterCollectionParameterEnteredValue(models.Model):
    parameter = models.ForeignKey(
        ParameterCollectionParameter, on_delete=models.CASCADE
    )
    value = models.TextField()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["parameter"],
                name="parameter_collection_parameter_entered_value_unique_parameter",
            )
        ]
