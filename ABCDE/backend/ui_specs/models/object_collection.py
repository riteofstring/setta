from .base_models import (
    get_base_folder_model,
    get_base_model,
    get_base_relationship_model,
    get_base_tag_model,
)


class ObjectCollection(get_base_model("object_collection_unique")):
    pass


class ObjectCollectionRelationship(
    get_base_relationship_model(
        ObjectCollection, "object_collection_relationship_unique", single_parent=True
    )
):
    pass


class ObjectCollectionFolder(
    get_base_folder_model(ObjectCollection, "object_collection_folder_unique")
):
    pass


class ObjectCollectionTag(
    get_base_tag_model(ObjectCollection, "object_collection_tag_unique")
):
    pass
