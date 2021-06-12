from .base_models import get_base_model, get_base_relationship_model
from .labels import get_base_folder_model, get_base_tag_model

ParameterCollection = get_base_model(
    "ParameterCollection", "parameter_collection_unique"
)

ParameterCollectionRelationship = get_base_relationship_model(
    "ParameterCollectionRelationship",
    ParameterCollection,
    "parameter_collection_relationship_unique",
    single_parent=True,
)


ParameterCollectionFolder = get_base_folder_model(
    "ParameterCollectionFolder",
    ParameterCollection,
    "parameter_collection_folder_unique",
)

ParameterCollectionTag = get_base_folder_model(
    "ParameterCollectionTag", ParameterCollection, "parameter_collection_tag_unique"
)
