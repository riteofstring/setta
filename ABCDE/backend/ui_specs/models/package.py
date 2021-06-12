from .base_models import get_base_model, get_base_relationship_model
from .labels import get_base_folder_model, get_base_tag_model
from .package_collection import PackageCollection

Package = get_base_model("Package", "package_unique")


PackageRelationship = get_base_relationship_model(
    "PackageRelationship", Package, "package_relationship_unique", single_parent=True
)


PackageFolder = get_base_folder_model("PackageFolder", Package, "package_folder_unique")

PackageTag = get_base_folder_model("PackageTag", Package, "package_tag_unique")


PackageToPackageCollectionRelationship = get_base_relationship_model(
    "PackageToPackageCollectionRelationship",
    Package,
    "package_to_package_collection_relationship_unique",
    parent_table=PackageCollection,
    single_parent=False,
)
