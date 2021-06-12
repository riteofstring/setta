from .base_models import (
    get_base_folder_model,
    get_base_model,
    get_base_relationship_model,
    get_base_tag_model,
)


class SectionCollection(get_base_model("section_collection_unique")):
    pass


class SectionCollectionRelationship(
    get_base_relationship_model(
        SectionCollection, "section_collection_relationship_unique", single_parent=True
    )
):
    pass


class SectionCollectionFolder(
    get_base_folder_model(SectionCollection, "section_collection_folder_unique")
):
    pass


class SectionCollectionTag(
    get_base_tag_model(SectionCollection, "section_collection_tag_unique")
):
    pass
