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
