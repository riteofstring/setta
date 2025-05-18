from typing import Any, Dict, List

from pydantic import BaseModel, Field

from setta.database.utils import create_new_id
from setta.utils.generate_memorable_string import generate_memorable_string


class UIType(BaseModel):
    id: str = Field(default_factory=create_new_id)
    type: str = "TEXT"
    name: str = Field(default_factory=generate_memorable_string)
    presetType: str = "BASE"
    config: Dict[str, Any] = Field(default_factory=dict)


# List of all base UI types
BASE_UI_TYPES_LIST: List[UIType] = [
    UIType(
        id="3fdaeb6a-e989-4888-b844-17a76f0b0192",
        type="TEXT",
        name="",
        presetType="BASE",
        config={},
    ),
    UIType(
        id="eab8f446-17cc-4512-bab5-42bff8570f1f",
        type="SLIDER",
        name="",
        presetType="BASE",
        config={"min": 0, "max": 100, "step": 1},
    ),
    UIType(
        id="69cdf4c5-7555-4ef3-93d3-bda03f33c6d5",
        type="SWITCH",
        name="",
        presetType="BASE",
        config={},
    ),
    UIType(
        id="74de30af-accf-44db-9b6b-da4260f0bd60",
        type="COLOR_PICKER",
        name="",
        presetType="BASE",
        config={},
    ),
    UIType(
        id="5b7755f7-8628-4b32-92e4-89eab596e4a3",
        type="DROPDOWN",
        name="",
        presetType="BASE",
        config={},
    ),
    UIType(
        id="2180677d-333f-4ea4-ae37-dbbbb50671d7",
        type="PASSWORD",
        name="",
        presetType="BASE",
        config={},
    ),
    UIType(
        id="0191cde4-3d98-4ba0-972a-fead19b8ac73",
        type="SECTION",
        name="",
        presetType="BASE",
        config={},
    ),
    UIType(
        id="ab68ebd2-7a99-47d6-a7ec-b45857bcd49f",
        type="LIST_ROOT",
        name="",
        presetType="BASE",
        config={},
    ),
    UIType(
        id="623a9242-53e9-4b42-b695-431e9754a836",
        type="DICT_ROOT",
        name="",
        presetType="BASE",
        config={},
    ),
    UIType(
        id="0e050316-06ca-48f4-92c1-9845abdf85f7",
        type="GROUP",
        name="",
        presetType="BASE",
        config={},
    ),
    UIType(
        id="06b511f3-dced-43be-97d7-1ceaddc763d5",
        type="IMAGE",
        name="",
        presetType="BASE",
        config={},
    ),
    UIType(
        id="126547a6-d41e-4891-80f0-a0354f089c7c",
        type="CHART",
        name="",
        presetType="BASE",
        config={},
    ),
    UIType(
        id="4ec2f5eb-3f66-4bce-a9e2-1eb4fdd96d6f",
        type="DRAW",
        name="",
        presetType="BASE",
        config={},
    ),
    UIType(
        id="2b06a83b-b96a-490d-a2d7-3631619e6495",
        type="TEXT_BLOCK",
        name="",
        presetType="BASE",
        config={},
    ),
    UIType(
        id="76cd4b19-cc63-4e2c-8214-5a4246ca637c",
        type="SOCIAL",
        name="",
        presetType="BASE",
        config={},
    ),
    UIType(
        id="b2cda88e-7b77-4dff-8503-3c7e07a3ff0a",
        type="GLOBAL_VARIABLES",
        name="",
        presetType="BASE",
        config={},
    ),
    UIType(
        id="af9f2cfd-8cb6-44fd-9736-eefffae4cd29",
        type="CODE",
        name="",
        presetType="BASE",
        config={},
    ),
    UIType(
        id="2b516ed4-6b82-4445-95bf-6c7dac7f410a",
        type="GEN_PYTHON_CODE",
        name="",
        presetType="BASE",
        config={},
    ),
    UIType(
        id="af0538a7-9667-400e-987e-ae3c844e0fcd",
        type="PARAM_SWEEP",
        name="",
        presetType="BASE",
        config={},
    ),
    UIType(
        id="d6d40533-ee47-42a5-8b55-5455716c71ac",
        type="TERMINAL",
        name="",
        presetType="BASE",
        config={},
    ),
    UIType(
        id="02f5da7b-71ae-4e42-b5b3-286fae1823ee",
        type="GLOBAL_PARAM_SWEEP",
        name="",
        presetType="BASE",
        config={},
    ),
    UIType(
        id="fae9523f-b9ee-4f0f-8785-3ce36c546aba",
        type="IFRAME",
        name="",
        presetType="BASE",
        config={},
    ),
    UIType(
        id="5d7859dd-fd3f-4f5f-9b8c-fe9bede13c33",
        type="CHAT",
        name="",
        presetType="BASE",
        config={},
    ),
    UIType(
        id="d58df269-fe7f-435b-99f4-5c8b351c956e",
        type="BROWSER",
        name="",
        presetType="BASE",
        config={},
    ),
]

# Create dictionary by looping through the list
BASE_UI_TYPES: Dict[str, UIType] = {
    ui_type.id: ui_type for ui_type in BASE_UI_TYPES_LIST
}
