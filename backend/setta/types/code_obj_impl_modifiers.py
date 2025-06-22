from typing import Any, Literal, TypedDict

from setta.types.code_objs import ParameterPassingStyle, ParamNameType


class BaseCodeObjImplModifier(TypedDict, total=False):
    type: Any
    description: str
    isPreset: bool


class BaseParamCodeObjImplModifier(BaseCodeObjImplModifier, total=False):
    type: Any
    coreNameType: ParamNameType
    coreNameEditable: bool
    passingStyle: ParameterPassingStyle


class BaseChildlessCodeObjImplModifier(BaseParamCodeObjImplModifier, total=False):
    type: Any
    defaultVal: str
    value: str


class BaseParentCodeObjImplModifier(BaseCodeObjImplModifier, total=False):
    type: Any
    children: list[str]


class CodeCallableCodeObjImplModifier(BaseParentCodeObjImplModifier, total=False):
    type: Literal["CodeCallable"]


class CodeParamCodeObjImplModifier(BaseChildlessCodeObjImplModifier, total=False):
    type: Literal["CodeParam"]


class TextParamCodeObjImplModifier(BaseChildlessCodeObjImplModifier, total=False):
    type: Literal["TextParam"]


class SliderParamCodeObjImplModifier(BaseChildlessCodeObjImplModifier, total=False):
    type: Literal["SliderParam"]
    min: int
    max: int
    step: int


class SwitchParamCodeObjImplModifier(BaseChildlessCodeObjImplModifier, total=False):
    type: Literal["SwitchParam"]


class ColorPickerParamCodeObjImplModifier(
    BaseChildlessCodeObjImplModifier, total=False
):
    type: Literal["ColorPickerParam"]


class DropdownParamCodeObjImplModifier(BaseChildlessCodeObjImplModifier, total=False):
    type: Literal["DropdownParam"]
    choices: list[str]


class PasswordParamCodeObjImplModifier(BaseChildlessCodeObjImplModifier, total=False):
    type: Literal["PasswordParam"]


class NestedParamCodeObjImplModifier(BaseParamCodeObjImplModifier, total=False):
    type: Literal["NestedParam"]
    children: list[str]
