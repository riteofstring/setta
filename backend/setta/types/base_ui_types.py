from typing import Any

from pydantic import BaseModel, Field

from setta.database.utils import create_new_id
from setta.types.utils import AsIsStrEnum
from setta.utils.generate_memorable_string import generate_memorable_string

UITypePresetType = AsIsStrEnum("UITypePresetType", ["BASE", "USER"])


class UITypeName(AsIsStrEnum):
    TEXT = "TEXT"
    SLIDER = "SLIDER"
    SWITCH = "SWITCH"
    COLOR_PICKER = "COLOR_PICKER"
    DROPDOWN = "DROPDOWN"
    PASSWORD = "PASSWORD"


class UIType(BaseModel):
    id: str = Field(default_factory=create_new_id)
    type: UITypeName = UITypeName.TEXT
    name: str = Field(default_factory=generate_memorable_string)
    presetType: UITypePresetType | None = None
    config: dict[str, Any] = Field(default_factory=dict)


BASE_UI_TYPES_LIST: list[UIType] = [
    UIType(
        id="3fdaeb6a-e989-4888-b844-17a76f0b0192",
        type=UITypeName.TEXT,
        name="",
        presetType=UITypePresetType.BASE,
        config={},
    ),
    UIType(
        id="eab8f446-17cc-4512-bab5-42bff8570f1f",
        type=UITypeName.SLIDER,
        name="",
        presetType=UITypePresetType.BASE,
        config={"min": 0, "max": 100, "step": 1},
    ),
    UIType(
        id="69cdf4c5-7555-4ef3-93d3-bda03f33c6d5",
        type=UITypeName.SWITCH,
        name="",
        presetType=UITypePresetType.BASE,
        config={},
    ),
    UIType(
        id="74de30af-accf-44db-9b6b-da4260f0bd60",
        type=UITypeName.COLOR_PICKER,
        name="",
        presetType=UITypePresetType.BASE,
        config={},
    ),
    UIType(
        id="5b7755f7-8628-4b32-92e4-89eab596e4a3",
        type=UITypeName.DROPDOWN,
        name="",
        presetType=UITypePresetType.BASE,
        config={},
    ),
    UIType(
        id="2180677d-333f-4ea4-ae37-dbbbb50671d7",
        type=UITypeName.PASSWORD,
        name="",
        presetType=UITypePresetType.BASE,
        config={},
    ),
    UIType(
        id="0191cde4-3d98-4ba0-972a-fead19b8ac73",
        type=UITypeName.SECTION,
        name="",
        presetType=UITypePresetType.BASE,
        config={},
    ),
    UIType(
        id="ab68ebd2-7a99-47d6-a7ec-b45857bcd49f",
        type=UITypeName.LIST_ROOT,
        name="",
        presetType=UITypePresetType.BASE,
        config={},
    ),
    UIType(
        id="623a9242-53e9-4b42-b695-431e9754a836",
        type=UITypeName.DICT_ROOT,
        name="",
        presetType=UITypePresetType.BASE,
        config={},
    ),
    UIType(
        id="0e050316-06ca-48f4-92c1-9845abdf85f7",
        type=UITypeName.GROUP,
        name="",
        presetType=UITypePresetType.BASE,
        config={},
    ),
    UIType(
        id="06b511f3-dced-43be-97d7-1ceaddc763d5",
        type=UITypeName.IMAGE,
        name="",
        presetType=UITypePresetType.BASE,
        config={},
    ),
    UIType(
        id="126547a6-d41e-4891-80f0-a0354f089c7c",
        type=UITypeName.CHART,
        name="",
        presetType=UITypePresetType.BASE,
        config={},
    ),
    UIType(
        id="4ec2f5eb-3f66-4bce-a9e2-1eb4fdd96d6f",
        type=UITypeName.DRAW,
        name="",
        presetType=UITypePresetType.BASE,
        config={},
    ),
    UIType(
        id="2b06a83b-b96a-490d-a2d7-3631619e6495",
        type=UITypeName.TEXT_BLOCK,
        name="",
        presetType=UITypePresetType.BASE,
        config={},
    ),
    UIType(
        id="76cd4b19-cc63-4e2c-8214-5a4246ca637c",
        type=UITypeName.SOCIAL,
        name="",
        presetType=UITypePresetType.BASE,
        config={},
    ),
    UIType(
        id="b2cda88e-7b77-4dff-8503-3c7e07a3ff0a",
        type=UITypeName.GLOBAL_VARIABLES,
        name="",
        presetType=UITypePresetType.BASE,
        config={},
    ),
    UIType(
        id="af9f2cfd-8cb6-44fd-9736-eefffae4cd29",
        type=UITypeName.CODE,
        name="",
        presetType=UITypePresetType.BASE,
        config={},
    ),
    UIType(
        id="2b516ed4-6b82-4445-95bf-6c7dac7f410a",
        type=UITypeName.GEN_PYTHON_CODE,
        name="",
        presetType=UITypePresetType.BASE,
        config={},
    ),
    UIType(
        id="d6d40533-ee47-42a5-8b55-5455716c71ac",
        type=UITypeName.TERMINAL,
        name="",
        presetType=UITypePresetType.BASE,
        config={},
    ),
    UIType(
        id="fae9523f-b9ee-4f0f-8785-3ce36c546aba",
        type=UITypeName.IFRAME,
        name="",
        presetType=UITypePresetType.BASE,
        config={},
    ),
    UIType(
        id="5d7859dd-fd3f-4f5f-9b8c-fe9bede13c33",
        type=UITypeName.CHAT,
        name="",
        presetType=UITypePresetType.BASE,
        config={},
    ),
    UIType(
        id="d58df269-fe7f-435b-99f4-5c8b351c956e",
        type=UITypeName.BROWSER,
        name="",
        presetType=UITypePresetType.BASE,
        config={},
    ),
]

# Create dictionary by looping through the list
BASE_UI_TYPES: dict[str, UIType] = {
    ui_type.id: ui_type for ui_type in BASE_UI_TYPES_LIST
}

BASE_UI_TYPE_IDS: dict[str, str] = {
    ui_type.type: ui_type.id for ui_type in BASE_UI_TYPES_LIST
}
