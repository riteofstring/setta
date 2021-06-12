from .base_models import (
    get_base_folder_model,
    get_base_model,
    get_base_relationship_model,
    get_base_tag_model,
)
from .package_collection import PackageCollection


class Package(get_base_model("package_unique")):
    pass


class PackageRelationship(
    get_base_relationship_model(
        Package, "package_relationship_unique", single_parent=True
    )
):
    pass


class PackageFolder(get_base_folder_model(Package, "package_folder_unique")):
    pass


class PackageTag(get_base_tag_model(Package, "package_tag_unique")):
    pass


class PackageToPackageCollectionRelationship(
    get_base_relationship_model(
        Package,
        "package_to_package_collection_relationship_unique",
        parent_table=PackageCollection,
        single_parent=False,
    )
):
    pass
