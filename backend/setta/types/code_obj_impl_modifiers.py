from typing import Any, Literal, TypedDict

from setta.types.code_objs import ParameterPassingStyle, ParamNameType


class BaseCodeObjImplModifier(TypedDict, total=False):
    type: Any
    description: str
    isPreset: bool


class BaseChildlessCodeObjImplModifier(BaseCodeObjImplModifier, total=False):
    type: Any
    coreNameType: ParamNameType
    coreNameEditable: bool
    passingStyle: ParameterPassingStyle
    defaultVal: str
    value: str


class BaseParamCodeObjImplModifier(BaseCodeObjImplModifier, total=False):
    type: Any
    coreNameType: ParamNameType
    coreNameEditable: bool
    passingStyle: ParameterPassingStyle


class BaseParentCodeObjImplModifier(BaseCodeObjImplModifier, total=False):
    type: Any
    children: list[str]


class CodeCallableCodeObjImplModifier(BaseCodeObjImplModifier, total=False):
    type: Literal["CodeCallable"]
    children: list[str]


class CodeParamCodeObjImplModifier(BaseCodeObjImplModifier, total=False):
    type: Literal["CodeParam"]
    coreNameType: ParamNameType
    coreNameEditable: bool
    passingStyle: ParameterPassingStyle
    defaultVal: str
    value: str


class ColorPickerParamCodeObjImplModifier(BaseCodeObjImplModifier, total=False):
    type: Literal["ColorPickerParam"]
    coreNameType: ParamNameType
    coreNameEditable: bool
    passingStyle: ParameterPassingStyle
    defaultVal: str
    value: str


class DropdownParamCodeObjImplModifier(BaseCodeObjImplModifier, total=False):
    type: Literal["DropdownParam"]
    coreNameType: ParamNameType
    coreNameEditable: bool
    passingStyle: ParameterPassingStyle
    defaultVal: str
    value: str
    choices: list[str]


class NestedParamCodeObjImplModifier(BaseCodeObjImplModifier, total=False):
    type: Literal["NestedParam"]
    children: list[str]
    coreNameType: ParamNameType
    coreNameEditable: bool
    passingStyle: ParameterPassingStyle


class PasswordParamCodeObjImplModifier(BaseCodeObjImplModifier, total=False):
    type: Literal["PasswordParam"]
    coreNameType: ParamNameType
    coreNameEditable: bool
    passingStyle: ParameterPassingStyle
    defaultVal: str
    value: str


class SliderParamCodeObjImplModifier(BaseCodeObjImplModifier, total=False):
    type: Literal["SliderParam"]
    coreNameType: ParamNameType
    coreNameEditable: bool
    passingStyle: ParameterPassingStyle
    defaultVal: str
    value: str
    min: int
    max: int
    step: int


class SwitchParamCodeObjImplModifier(BaseCodeObjImplModifier, total=False):
    type: Literal["SwitchParam"]
    coreNameType: ParamNameType
    coreNameEditable: bool
    passingStyle: ParameterPassingStyle
    defaultVal: str
    value: str


class TextParamCodeObjImplModifier(BaseCodeObjImplModifier, total=False):
    type: Literal["TextParam"]
    coreNameType: ParamNameType
    coreNameEditable: bool
    passingStyle: ParameterPassingStyle
    defaultVal: str
    value: str
