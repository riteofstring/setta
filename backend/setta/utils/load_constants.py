import json

from setta.database.db.uiTypes.utils import add_defaults_to_ui_types
from setta.utils.constants import (
    BASE_UI_TYPE_IDS,
    BASE_UI_TYPES,
    CONSTANTS_FOLDER,
    DEFAULT_VALUES,
    set_constants,
)
from setta.utils.utils import get_absolute_path


def load_constants():
    with open(
        get_absolute_path(__file__, CONSTANTS_FOLDER / "constants.json"), "r"
    ) as f:
        set_constants(**json.load(f))

    with open(
        get_absolute_path(__file__, CONSTANTS_FOLDER / "defaultValues.json"), "r"
    ) as f:
        DEFAULT_VALUES.update(json.load(f))

    with open(
        get_absolute_path(__file__, CONSTANTS_FOLDER / "BaseUITypes.json"), "r"
    ) as f:
        ui_types = json.load(f)
        add_defaults_to_ui_types(ui_types)
        BASE_UI_TYPES.update(ui_types)
        for k, v in BASE_UI_TYPES.items():
            BASE_UI_TYPE_IDS[v["type"]] = k
