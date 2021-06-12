from .base_models import (
    get_base_folder_model,
    get_base_model,
    get_base_relationship_model,
    get_base_tag_model,
)
from .module_collection import ModuleCollection
from .package import Package


class Module(get_base_model("module_unique", parent_table=Package)):
    pass


class ModuleRelationship(
    get_base_relationship_model(
        Module, "module_relationship_unique", single_parent=True
    )
):
    pass


class ModuleFolder(get_base_folder_model(Module, "module_folder_unique")):
    pass


class ModuleTag(get_base_tag_model(Module, "module_tag_unique")):
    pass


class ModuleToModuleCollectionRelationship(
    get_base_relationship_model(
        Module,
        "module_to_module_collection_relationship_unique",
        parent_table=ModuleCollection,
        single_parent=False,
    )
):
    pass
