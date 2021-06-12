from .base_models import get_base_model, get_base_relationship_model
from .labels import get_base_folder_model, get_base_tag_model

ModuleCollection = get_base_model("ModuleCollection", "module_collection_unique")


ModuleCollectionRelationship = get_base_relationship_model(
    "ModuleCollectionRelationship",
    ModuleCollection,
    "module_collection_relationship_unique",
    single_parent=True,
)


ModuleCollectionFolder = get_base_folder_model(
    "ModuleCollectionFolder", ModuleCollection, "module_collection_folder_unique"
)

ModuleCollectionTag = get_base_folder_model(
    "ModuleCollectionTag", ModuleCollection, "module_collection_tag_unique"
)
