from .base_models import get_base_model, get_base_relationship_model
from .labels import get_base_folder_model, get_base_tag_model

UI = get_base_model("UI", "ui_unique")


UIRelationship = get_base_relationship_model(
    "UIRelationship",
    UI,
    "ui_relationship_unique",
    single_parent=True,
)


UIFolder = get_base_folder_model(
    "UIFolder",
    UI,
    "ui_folder_unique",
)

UITag = get_base_folder_model("UITag", UI, "ui_tag_unique")
