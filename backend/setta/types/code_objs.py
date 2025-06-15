from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field

from setta.database.utils import create_new_id
from setta.utils.generate_memorable_string import generate_memorable_string


class ParameterPassingStyle(Enum):
    DEFAULT = "DEFAULT"
    ARGS = "ARGS"
    KWARGS = "KWARGS"
    POSITIONAL_ONLY = "POSITIONAL_ONLY"
    KEYWORD_ONLY = "KEYWORD_ONLY"


class CodeObjType(Enum):
    CODE_CALLABLE = "CODE_CALLABLE"
    CODE_PARAM = "CODE_PARAM"
    TEXT_PARAM = "TEXT_PARAM"
    SLIDER_PARAM = "SLIDER_PARAM"
    SWITCH_PARAM = "SWITCH_PARAM"
    COLOR_PICKER_PARAM = "COLOR_PICKER_PARAM"
    DROPDOWN_PARAM = "DROPDOWN_PARAM"
    PASSWORD_PARAM = "PASSWORD_PARAM"
    NESTED_PARAM = "NESTED_PARAM"


class ParamNameType(Enum):
    CODE = "CODE"
    TEXT = "TEXT"


class CodeObjCore(BaseModel):
    id: str = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
    impls: list[str] = Field(default_factory=list)
    default_impl: str | None = None


class BaseCodeObjImpl(BaseModel):
    type: Any
    id: str = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
    description: str = ""
    isPreset: bool = False


class ListOfCodeObjImpl(BaseCodeObjImpl):
    impls: list[BaseCodeObjImpl]


class BaseParamCodeObjImpl(BaseCodeObjImpl):
    coreNameType: ParamNameType = ParamNameType.TEXT
    coreNameEditable: bool = False
    defaultVal: str = ""
    passingStyle: ParameterPassingStyle = ParameterPassingStyle.DEFAULT
    value: str = ""


class BaseParentCodeObjImpl(BaseCodeObjImpl):
    children: list[str] = Field(default_factory=list)


class CodeCallableCodeObjImpl(BaseParentCodeObjImpl):
    type: Literal[CodeObjType.CODE_CALLABLE] = CodeObjType.CODE_CALLABLE


class CodeParamCodeObjImpl(BaseParamCodeObjImpl):
    type: Literal[CodeObjType.CODE_PARAM] = CodeObjType.CODE_PARAM


class TextParamCodeObjImpl(BaseParamCodeObjImpl):
    type: Literal[CodeObjType.TEXT_PARAM] = CodeObjType.TEXT_PARAM


class SliderParamCodeObjImpl(BaseParamCodeObjImpl):
    type: Literal[CodeObjType.SLIDER_PARAM] = CodeObjType.SLIDER_PARAM
    min: int = 0
    max: int = 100
    step: int = 1


class SwitchParamCodeObjImpl(BaseParamCodeObjImpl):
    type: Literal[CodeObjType.SWITCH_PARAM] = CodeObjType.SWITCH_PARAM


class ColorPickerParamCodeObjImpl(BaseParamCodeObjImpl):
    type: Literal[CodeObjType.COLOR_PICKER_PARAM] = CodeObjType.COLOR_PICKER_PARAM


class DropdownParamCodeObjImpl(BaseParamCodeObjImpl):
    type: Literal[CodeObjType.DROPDOWN_PARAM] = CodeObjType.DROPDOWN_PARAM
    choices: list[str]


class PasswordParamCodeObjImpl(BaseParamCodeObjImpl):
    type: Literal[CodeObjType.PASSWORD_PARAM] = CodeObjType.PASSWORD_PARAM


class NestedParamCodeObjImpl(BaseParamCodeObjImpl, BaseParentCodeObjImpl):
    type: Literal[CodeObjType.NESTED_PARAM] = CodeObjType.NESTED_PARAM


class ValueModifier(BaseModel):
    value: str
