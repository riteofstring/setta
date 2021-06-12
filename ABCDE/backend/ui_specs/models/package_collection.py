from .base_models import get_base_model, get_base_relationship_model
from .labels import get_base_folder_model, get_base_tag_model

PackageCollection = get_base_model("PackageCollection", "package_collection_unique")


PackageCollectionRelationship = get_base_relationship_model(
    "PackageCollectionRelationship",
    PackageCollection,
    "package_collection_relationship_unique",
    single_parent=True,
)


PackageCollectionFolder = get_base_folder_model(
    "PackageCollectionFolder", PackageCollection, "package_collection_folder_unique"
)

PackageCollectionTag = get_base_folder_model(
    "PackageCollectionTag", PackageCollection, "package_collection_tag_unique"
)
