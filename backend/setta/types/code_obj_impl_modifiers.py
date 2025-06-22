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
    coreNameType: ParamNameType
    coreNameEditable: bool
    passingStyle: ParameterPassingStyle
    defaultVal: str
    value: str


class BaseParentCodeObjImplModifier(BaseCodeObjImplModifier, total=False):
    type: Any
    children: list[str]


class CodeCallableCodeObjImplModifier(BaseParentCodeObjImplModifier, total=False):
    type: Literal["CodeCallable"]
    children: list[str]


class CodeParamCodeObjImplModifier(BaseChildlessCodeObjImplModifier, total=False):
    type: Literal["CodeParam"]
    coreNameType: ParamNameType
    coreNameEditable: bool
    passingStyle: ParameterPassingStyle
    defaultVal: str
    value: str


class TextParamCodeObjImplModifier(BaseChildlessCodeObjImplModifier, total=False):
    type: Literal["TextParam"]
    coreNameType: ParamNameType
    coreNameEditable: bool
    passingStyle: ParameterPassingStyle
    defaultVal: str
    value: str


class SliderParamCodeObjImplModifier(BaseChildlessCodeObjImplModifier, total=False):
    type: Literal["SliderParam"]
    coreNameType: ParamNameType
    coreNameEditable: bool
    passingStyle: ParameterPassingStyle
    defaultVal: str
    value: str
    min: int
    max: int
    step: int


class SwitchParamCodeObjImplModifier(BaseChildlessCodeObjImplModifier, total=False):
    type: Literal["SwitchParam"]
    coreNameType: ParamNameType
    coreNameEditable: bool
    passingStyle: ParameterPassingStyle
    defaultVal: str
    value: str


class ColorPickerParamCodeObjImplModifier(
    BaseChildlessCodeObjImplModifier, total=False
):
    type: Literal["ColorPickerParam"]
    coreNameType: ParamNameType
    coreNameEditable: bool
    passingStyle: ParameterPassingStyle
    defaultVal: str
    value: str


class DropdownParamCodeObjImplModifier(BaseChildlessCodeObjImplModifier, total=False):
    type: Literal["DropdownParam"]
    coreNameType: ParamNameType
    coreNameEditable: bool
    passingStyle: ParameterPassingStyle
    defaultVal: str
    value: str
    choices: list[str]


class PasswordParamCodeObjImplModifier(BaseChildlessCodeObjImplModifier, total=False):
    type: Literal["PasswordParam"]
    coreNameType: ParamNameType
    coreNameEditable: bool
    passingStyle: ParameterPassingStyle
    defaultVal: str
    value: str


class NestedParamCodeObjImplModifier(BaseParamCodeObjImplModifier, total=False):
    type: Literal["NestedParam"]
    children: list[str]
    coreNameType: ParamNameType
    coreNameEditable: bool
    passingStyle: ParameterPassingStyle
