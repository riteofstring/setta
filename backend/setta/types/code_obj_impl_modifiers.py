from typing import Any, Literal, NotRequired, TypedDict

from setta.types.code_objs import ParameterPassingStyle, ParamNameType


class BaseCodeObjImplModifier(TypedDict):
    type: Any
    description: NotRequired[str]
    isPreset: NotRequired[bool]


class BaseParamCodeObjImplModifier(BaseCodeObjImplModifier):
    type: Any
    coreNameType: NotRequired[ParamNameType]
    coreNameEditable: NotRequired[bool]
    passingStyle: NotRequired[ParameterPassingStyle]


class BaseChildlessCodeObjImplModifier(BaseParamCodeObjImplModifier):
    type: Any
    defaultVal: NotRequired[str]
    value: NotRequired[str]


class BaseParentCodeObjImplModifier(BaseCodeObjImplModifier):
    type: Any
    children: NotRequired[list[str]]


class CodeCallableCodeObjImplModifier(BaseParentCodeObjImplModifier):
    type: Literal["CodeCallable"]


class CodeParamCodeObjImplModifier(BaseChildlessCodeObjImplModifier):
    type: Literal["CodeParam"]


class TextParamCodeObjImplModifier(BaseChildlessCodeObjImplModifier):
    type: Literal["TextParam"]


class SliderParamCodeObjImplModifier(BaseChildlessCodeObjImplModifier):
    type: Literal["SliderParam"]
    min: NotRequired[int]
    max: NotRequired[int]
    step: NotRequired[int]


class SwitchParamCodeObjImplModifier(BaseChildlessCodeObjImplModifier):
    type: Literal["SwitchParam"]


class ColorPickerParamCodeObjImplModifier(BaseChildlessCodeObjImplModifier):
    type: Literal["ColorPickerParam"]


class DropdownParamCodeObjImplModifier(BaseChildlessCodeObjImplModifier):
    type: Literal["DropdownParam"]
    choices: NotRequired[list[str]]


class PasswordParamCodeObjImplModifier(BaseChildlessCodeObjImplModifier):
    type: Literal["PasswordParam"]


class NestedParamCodeObjImplModifier(BaseParamCodeObjImplModifier):
    type: Literal["NestedParam"]
    children: NotRequired[list[str]]
