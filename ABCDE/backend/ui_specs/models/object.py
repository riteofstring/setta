from .base_models import get_base_model, get_base_relationship_model
from .labels import get_base_folder_model, get_base_tag_model
from .module import Module
from .object_collection import ObjectCollection

Object = get_base_model("Object", "object_unique", parent_table=Module)


ObjectRelationship = get_base_relationship_model(
    "ObjectRelationship",
    Object,
    "object_relationship_unique",
    single_parent=True,
)


ObjectFolder = get_base_folder_model("ObjectFolder", Object, "object_folder_unique")

ObjectTag = get_base_folder_model("ObjectTag", Object, "object_tag_unique")


ObjectToObjectCollectionRelationship = get_base_relationship_model(
    "ObjectToObjectCollectionRelationship",
    Object,
    "object_to_object_collection_relationship_unique",
    parent_table=ObjectCollection,
    single_parent=False,
)
