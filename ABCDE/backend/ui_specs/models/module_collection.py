from .base_models import (
    get_base_folder_model,
    get_base_model,
    get_base_relationship_model,
    get_base_tag_model,
)


class ModuleCollection(get_base_model("module_collection_unique")):
    pass


class ModuleCollectionRelationship(
    get_base_relationship_model(
        ModuleCollection, "module_collection_relationship_unique", single_parent=True
    )
):
    pass


class ModuleCollectionFolder(
    get_base_folder_model(ModuleCollection, "module_collection_folder_unique")
):
    pass


class ModuleCollectionTag(
    get_base_tag_model(ModuleCollection, "module_collection_tag_unique")
):
    pass
