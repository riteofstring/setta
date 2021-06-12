from .base_models import (
    get_base_folder_model,
    get_base_model,
    get_base_relationship_model,
    get_base_tag_model,
)
from .module import Module
from .object_collection import ObjectCollection


class Object(get_base_model("object_unique", parent_table=Module)):
    pass


class ObjectRelationship(
    get_base_relationship_model(
        Object, "object_relationship_unique", single_parent=True
    )
):
    pass


class ObjectFolder(get_base_folder_model(Object, "object_folder_unique")):
    pass


class ObjectTag(get_base_tag_model(Object, "object_tag_unique")):
    pass


class ObjectToObjectCollectionRelationship(
    get_base_relationship_model(
        Object,
        "object_to_object_collection_relationship_unique",
        parent_table=ObjectCollection,
        single_parent=False,
    )
):
    pass
