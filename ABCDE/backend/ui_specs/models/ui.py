from .base_models import (
    get_base_folder_model,
    get_base_model,
    get_base_relationship_model,
    get_base_tag_model,
)


class UI(get_base_model("ui_unique")):
    pass


class UIRelationship(
    get_base_relationship_model(UI, "ui_relationship_unique", single_parent=True)
):
    pass


class UIFolder(get_base_folder_model(UI, "ui_folder_unique")):
    pass


class UITag(get_base_tag_model(UI, "ui_tag_unique")):
    pass
