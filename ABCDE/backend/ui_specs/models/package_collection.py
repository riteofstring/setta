from .base_models import (
    get_base_folder_model,
    get_base_model,
    get_base_relationship_model,
    get_base_tag_model,
)


class PackageCollection(get_base_model("package_collection_unique")):
    pass


class PackageCollectionRelationship(
    get_base_relationship_model(
        PackageCollection, "package_collection_relationship_unique", single_parent=True
    )
):
    pass


class PackageCollectionFolder(
    get_base_folder_model(PackageCollection, "package_collection_folder_unique")
):
    pass


class PackageCollectionTag(
    get_base_tag_model(PackageCollection, "package_collection_tag_unique")
):
    pass
