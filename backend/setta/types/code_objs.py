from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field

from setta.database.utils import create_new_id
from setta.types.code_obj_impl_modifiers import CodeObjImplModifier
from setta.utils.generate_memorable_string import generate_memorable_string


class ParameterPassingStyle(Enum):
    DEFAULT = "DEFAULT"
    ARGS = "ARGS"
    KWARGS = "KWARGS"
    POSITIONAL_ONLY = "POSITIONAL_ONLY"
    KEYWORD_ONLY = "KEYWORD_ONLY"


class CodeObjType(str, Enum):
    CodeCallable = "CodeCallable"
    CodeParam = "CodeParam"
    TextParam = "TextParam"
    SliderParam = "SliderParam"
    SwitchParam = "SwitchParam"
    ColorPickerParam = "ColorPickerParam"
    DropdownParam = "DropdownParam"
    PasswordParam = "PasswordParam"
    NestedParam = "NestedParam"


class ParamNameType(Enum):
    CODE = "CODE"
    TEXT = "TEXT"


class CodeObjCore(BaseModel):
    id: str = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
    implLayerings: list[str] = Field(default_factory=list)
    defaultImplLayering: str | None = None


class CodeObjImplLayering(BaseModel):
    id: str = Field(default_factory=create_new_id)
    impl: str
    modifiers: list[CodeObjImplModifier] = Field(default_factory=list)


class BaseCodeObjImpl(BaseModel):
    type: Any
    id: str = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
    description: str = ""
    isPreset: bool = False


class BaseParamCodeObjImpl(BaseCodeObjImpl):
    coreNameType: ParamNameType = ParamNameType.TEXT
    coreNameEditable: bool = False
    passingStyle: ParameterPassingStyle = ParameterPassingStyle.DEFAULT


class BaseChildlessCodeObjImpl(BaseParamCodeObjImpl):
    defaultVal: str = ""
    value: str = ""


class BaseParentCodeObjImpl(BaseCodeObjImpl):
    children: list[str] = Field(default_factory=list)


class CodeCallableCodeObjImpl(BaseParentCodeObjImpl):
    type: Literal[CodeObjType.CodeCallable] = CodeObjType.CodeCallable


class CodeParamCodeObjImpl(BaseChildlessCodeObjImpl):
    type: Literal[CodeObjType.CodeParam] = CodeObjType.CodeParam


class TextParamCodeObjImpl(BaseChildlessCodeObjImpl):
    type: Literal[CodeObjType.TextParam] = CodeObjType.TextParam


class SliderParamCodeObjImpl(BaseChildlessCodeObjImpl):
    type: Literal[CodeObjType.SliderParam] = CodeObjType.SliderParam
    min: int = 0
    max: int = 100
    step: int = 1


class SwitchParamCodeObjImpl(BaseChildlessCodeObjImpl):
    type: Literal[CodeObjType.SwitchParam] = CodeObjType.SwitchParam


class ColorPickerParamCodeObjImpl(BaseChildlessCodeObjImpl):
    type: Literal[CodeObjType.ColorPickerParam] = CodeObjType.ColorPickerParam


class DropdownParamCodeObjImpl(BaseChildlessCodeObjImpl):
    type: Literal[CodeObjType.DropdownParam] = CodeObjType.DropdownParam
    choices: list[str]


class PasswordParamCodeObjImpl(BaseChildlessCodeObjImpl):
    type: Literal[CodeObjType.PasswordParam] = CodeObjType.PasswordParam


class NestedParamCodeObjImpl(BaseParamCodeObjImpl, BaseParentCodeObjImpl):
    type: Literal[CodeObjType.NestedParam] = CodeObjType.NestedParam
