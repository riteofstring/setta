from .base_models import get_base_model, get_base_relationship_model
from .labels import get_base_folder_model, get_base_tag_model

SectionCollection = get_base_model("SectionCollection", "section_collection_unique")


SectionCollectionRelationship = get_base_relationship_model(
    "SectionCollectionRelationship",
    SectionCollection,
    "section_collection_relationship_unique",
    single_parent=True,
)


SectionCollectionFolder = get_base_folder_model(
    "SectionCollectionFolder",
    SectionCollection,
    "section_collection_folder_unique",
)

SectionCollectionTag = get_base_folder_model(
    "SectionCollectionTag", SectionCollection, "section_collection_tag_unique"
)
