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
                fields=["name", "folder", "originUI"], name="section_collection_unique"
            )
        ]


class ModuleCollection(models.Model):
    name = models.TextField()
    folder = models.ForeignKey(Folder, on_delete=models.CASCADE)
    originUI = models.ForeignKey(UI, on_delete=models.SET_NULL, null=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["name", "folder", "originUI"], name="module_collection_unique"
            )
        ]


class ParameterCollection(models.Model):
    name = models.TextField()
    folder = models.ForeignKey(Folder, on_delete=models.CASCADE)
    originUI = models.ForeignKey(UI, on_delete=models.SET_NULL, null=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["name", "folder", "originUI"],
                name="parameter_collection_unique",
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


class SectionModuleCollection(models.Model):
    originSection = models.ForeignKey(Section, on_delete=models.CASCADE)
    availableModules = models.ForeignKey(ModuleCollection, on_delete=models.CASCADE)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["originSection", "availableModules"],
                name="section_module_collection_unique",
            )
        ]


class SectionParameterCollection(models.Model):
    originSection = models.ForeignKey(Section, on_delete=models.CASCADE)
    availableParameters = models.ForeignKey(
        ParameterCollection, on_delete=models.CASCADE
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["originSection", "availableParameters"],
                name="section_parameter_collection_unique",
            )
        ]


class ModuleObjectSelection(models.Model):
    name = models.TextField()
    selectedModule = models.ForeignKey(Module, on_delete=models.CASCADE)
    selectedObject = models.ForeignKey(Object, on_delete=models.CASCADE)
    originSection = models.ForeignKey(Section, on_delete=models.CASCADE)
    children = models.ForeignKey(
        SectionCollection,
        on_delete=models.SET_NULL,
        null=True,
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["name", "originSection"], name="selection_unique_name"
            )
        ]


class UISectionCollection(models.Model):
    originUI = models.ForeignKey(UI, on_delete=models.CASCADE)
    sections = models.ForeignKey(SectionCollection, on_delete=models.CASCADE)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["originUI", "sections"], name="ui_section_collection_unique"
            )
        ]


class UIModuleCollection(models.Model):
    originUI = models.ForeignKey(UI, on_delete=models.CASCADE)
    availableModules = models.ForeignKey(ModuleCollection, on_delete=models.CASCADE)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["originUI", "availableModules"],
                name="ui_module_collection_unique",
            )
        ]


class UIParameterCollection(models.Model):
    originUI = models.ForeignKey(UI, on_delete=models.CASCADE)
    availableParameters = models.ForeignKey(
        ParameterCollection, on_delete=models.CASCADE
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["originUI", "availableParameters"],
                name="ui_parameter_collection_unique",
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
