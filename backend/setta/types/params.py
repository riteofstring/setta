from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field

from setta.database.utils import create_new_id
from setta.types.utils import AsIsStrEnum
from setta.utils.generate_memorable_string import generate_memorable_string

UITypePresetType = AsIsStrEnum("UITypePresetType", ["BASE", "USER"])

ParameterPassingStyle = AsIsStrEnum(
    "ParameterPassingStyle",
    ["DEFAULT", "ARGS", "KWARGS", "POSITIONAL_ONLY", "KEYWORD_ONLY"],
)


class ParamTypeName(Enum):
    TEXT = "TEXT"
    SLIDER = "SLIDER"
    SWITCH = "SWITCH"
    COLOR_PICKER = "COLOR_PICKER"
    DROPDOWN = "DROPDOWN"
    PASSWORD = "PASSWORD"


class BaseParamCore(BaseModel):
    id: str = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
    editable: bool = False
    defaultVal: str = ""
    description: str = ""
    passingStyle: ParameterPassingStyle = ParameterPassingStyle.DEFAULT


class BaseParamValueImpl(BaseModel):
    value: str


class BaseParamUIImpl(BaseModel):
    type: Any
    id: str = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)


class TextParamUIImpl(BaseParamUIImpl):
    type: Literal[ParamTypeName.TEXT] = ParamTypeName.TEXT


class SliderParamUIImpl(BaseParamUIImpl):
    type: Literal[ParamTypeName.SLIDER] = ParamTypeName.SLIDER
    min: int = 0
    max: int = 100
    step: int = 1


class SwitchParamUIImpl(BaseParamUIImpl):
    type: Literal[ParamTypeName.SWITCH] = ParamTypeName.SWITCH


class ColorPickerParamUIImpl(BaseParamUIImpl):
    type: Literal[ParamTypeName.COLOR_PICKER] = ParamTypeName.COLOR_PICKER


class DropdownParamUIImpl(BaseParamUIImpl):
    type: Literal[ParamTypeName.DROPDOWN] = ParamTypeName.DROPDOWN


class PasswordParamUIImpl(BaseParamUIImpl):
    type: Literal[ParamTypeName.PASSWORD] = ParamTypeName.PASSWORD


# class CodeInfo(BaseModel, extra="forbid"):
#     rcType: CodeInfoType = CodeInfoType.PARAMETER
#     isPinned: bool = False
#     isFrozen: bool = False
#     isSelected: bool = False
#     ignoreTypeErrors: bool = False
