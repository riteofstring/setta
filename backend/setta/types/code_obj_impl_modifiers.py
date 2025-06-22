from typing import TypedDict

from setta.types.code_objs import ParameterPassingStyle, ParamNameType


class CodeObjImplModifier(TypedDict, total=False):
    pass


class CodeCallableCodeObjImplModifier(TypedDict, total=False):
    description: str
    isPreset: bool
    children: list[str]


class CodeParamCodeObjImplModifier(TypedDict, total=False):
    description: str
    isPreset: bool
    coreNameType: ParamNameType
    coreNameEditable: bool
    passingStyle: ParameterPassingStyle
    defaultVal: str
    value: str


class ColorPickerParamCodeObjImplModifier(TypedDict, total=False):
    description: str
    isPreset: bool
    coreNameType: ParamNameType
    coreNameEditable: bool
    passingStyle: ParameterPassingStyle
    defaultVal: str
    value: str


class DropdownParamCodeObjImplModifier(TypedDict, total=False):
    description: str
    isPreset: bool
    coreNameType: ParamNameType
    coreNameEditable: bool
    passingStyle: ParameterPassingStyle
    defaultVal: str
    value: str
    choices: list[str]


class NestedParamCodeObjImplModifier(TypedDict, total=False):
    description: str
    isPreset: bool
    children: list[str]
    coreNameType: ParamNameType
    coreNameEditable: bool
    passingStyle: ParameterPassingStyle


class PasswordParamCodeObjImplModifier(TypedDict, total=False):
    description: str
    isPreset: bool
    coreNameType: ParamNameType
    coreNameEditable: bool
    passingStyle: ParameterPassingStyle
    defaultVal: str
    value: str


class SliderParamCodeObjImplModifier(TypedDict, total=False):
    description: str
    isPreset: bool
    coreNameType: ParamNameType
    coreNameEditable: bool
    passingStyle: ParameterPassingStyle
    defaultVal: str
    value: str
    min: int
    max: int
    step: int


class SwitchParamCodeObjImplModifier(TypedDict, total=False):
    description: str
    isPreset: bool
    coreNameType: ParamNameType
    coreNameEditable: bool
    passingStyle: ParameterPassingStyle
    defaultVal: str
    value: str


class TextParamCodeObjImplModifier(TypedDict, total=False):
    description: str
    isPreset: bool
    coreNameType: ParamNameType
    coreNameEditable: bool
    passingStyle: ParameterPassingStyle
    defaultVal: str
    value: str
