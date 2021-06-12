from .base_models import get_base_model, get_base_relationship_model
from .labels import get_base_folder_model, get_base_tag_model
from .module_collection import ModuleCollection
from .package import Package

Module = get_base_model("Module", "module_unique", parent_table=Package)

ModuleRelationship = get_base_relationship_model(
    "ModuleRelationship",
    Module,
    "module_relationship_unique",
    single_parent=True,
)


ModuleFolder = get_base_folder_model("ModuleFolder", Module, "module_folder_unique")

ModuleTag = get_base_folder_model("ModuleTag", Module, "module_tag_unique")


ModuleToModuleCollectionRelationship = get_base_relationship_model(
    "ModuleToModuleCollectionRelationship",
    Module,
    "module_to_module_collection_relationship_unique",
    parent_table=ModuleCollection,
    single_parent=False,
)
