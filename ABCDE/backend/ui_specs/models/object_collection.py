from .base_models import get_base_model, get_base_relationship_model
from .labels import get_base_folder_model, get_base_tag_model

ObjectCollection = get_base_model("ObjectCollection", "object_collection_unique")


ObjectCollectionRelationship = get_base_relationship_model(
    "ObjectCollectionRelationship",
    ObjectCollection,
    "object_collection_relationship_unique",
    single_parent=True,
)


ObjectCollectionFolder = get_base_folder_model(
    "ObjectCollectionFolder", ObjectCollection, "object_collection_folder_unique"
)

ObjectCollectionTag = get_base_folder_model(
    "ObjectCollectionTag", ObjectCollection, "object_collection_tag_unique"
)
