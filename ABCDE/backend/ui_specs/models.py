from django.contrib.auth.models import User
from django.db import models

# Create your models here.


class Folders(models.Model):
    name = models.TextField()
    owner = models.ForeignKey(User, on_delete=models.CASCADE)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["owner", "name"], name="unique_name")
        ]


class UIs(models.Model):
    name = models.TextField()
    folder = models.ForeignKey(Folders, on_delete=models.CASCADE)
    sections = models.ForeignKey(SectionCollections, on_delete=models.CASCADE)
    availableModules = models.ForeignKey(ModuleCollections, on_delete=models.CASCADE)
    availableParameters = models.ForeignKey(
        ParameterCollections, on_delete=models.CASCADE
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["name", "folder"], name="unique_name")
        ]


class SectionCollections(models.Model):
    name = models.TextField()
    folder = models.ForeignKey(Folders, on_delete=models.CASCADE)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["name", "folder"], name="unique_name")
        ]


class ModuleCollections(models.Model):
    name = models.TextField()
    folder = models.ForeignKey(Folders, on_delete=models.CASCADE)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["name", "folder"], name="unique_name")
        ]


class ParameterCollections(models.Model):
    name = models.TextField()
    folder = models.ForeignKey(Folders, on_delete=models.CASCADE)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["name", "folder"], name="unique_name")
        ]


class Selections(models.Model):
    selectedModule = models.ForeignKey(Modules, on_delete=models.CASCADE)
    selectedObject = models.ForeignKey(Objects, on_delete=models.CASCADE)
    section = models.ForeignKey(Sections, on_delete=models.CASCADE)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["section"], name="unique_section")
        ]


class Sections(models.Model):
    name = models.TextField()
    variableName = models.TextField()
    sectionId = models.TextField()
    belongsTo = models.ForeignKey(SectionCollections, on_delete=models.CASCADE)
    children = models.ForeignKey(SectionCollections, on_delete=models.CASCADE)
    parent = models.ForeignKey("self", on_delete=models.CASCADE)
    availableModules = models.ForeignKey(ModuleCollections, on_delete=models.CASCADE)
    availableParameters = models.ForeignKey(
        ParameterCollections, on_delete=models.CASCADE
    )
    selection = models.ForeignKey(Selections, on_delete=models.CASCADE)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["name", "belongsTo"], name="unique_name")
        ]


class Modules(models.Model):
    name = models.TextField()
    belongsTo = models.ForeignKey(ModuleCollections, on_delete=models.CASCADE)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["name", "belongsTo"], name="unique_name")
        ]


class Objects(models.Model):
    name = models.TextField()
    belongsTo = models.ForeignKey(Modules, on_delete=models.CASCADE)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["name", "belongsTo"], name="unique_name")
        ]


class Parameters(models.Model):
    name = models.TextField()
    belongsToObject = models.ForeignKey(Objects, on_delete=models.CASCADE)
    belongsToCollection = models.ForeignKey(
        ParameterCollections, on_delete=models.CASCADE
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["name", "belongsToObject", "belongsToCollection"],
                name="unique_name",
            )
        ]


class EnteredValues(models.Model):
    parameter = models.ForeignKey(Parameters, on_delete=models.CASCADE)
    value = models.TextField()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["parameter"],
                name="unique_parameter",
            )
        ]
