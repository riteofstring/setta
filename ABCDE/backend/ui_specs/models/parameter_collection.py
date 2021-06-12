from .base_models import (
    get_base_folder_model,
    get_base_model,
    get_base_relationship_model,
    get_base_tag_model,
)


class ParameterCollection(get_base_model("parameter_collection_unique")):
    pass


class ParameterCollectionRelationship(
    get_base_relationship_model(
        ParameterCollection,
        "parameter_collection_relationship_unique",
        single_parent=True,
    )
):
    pass


class ParameterCollectionFolder(
    get_base_folder_model(ParameterCollection, "parameter_collection_folder_unique")
):
    pass


class ParameterCollectionTag(
    get_base_tag_model(ParameterCollection, "parameter_collection_tag_unique")
):
    pass
