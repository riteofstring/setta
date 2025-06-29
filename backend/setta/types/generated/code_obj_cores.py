# Auto-generated CodeObjCore classes - DO NOT EDIT MANUALLY
# Generated from code obj implementations

from typing import Literal

from pydantic import Field

from setta.types.code_obj_core import BaseCodeObjCore
from setta.types.code_obj_impls import CodeObjType
from setta.types.generated.impl_modifiers import (
    CodeCallableCodeObjImplModifier,
    CodeParamCodeObjImplModifier,
    ColorPickerParamCodeObjImplModifier,
    DropdownParamCodeObjImplModifier,
    NestedParamCodeObjImplModifier,
    PasswordParamCodeObjImplModifier,
    SliderParamCodeObjImplModifier,
    SwitchParamCodeObjImplModifier,
    TextParamCodeObjImplModifier,
)


class CodeCallableCodeObjCore(BaseCodeObjCore):
    type: Literal[CodeObjType.CodeCallable] = CodeObjType.CodeCallable
    sharedModifier: CodeCallableCodeObjImplModifier
    unsharedKeys: set[Literal["children", "description"]] = Field(default_factory=set)


class CodeParamCodeObjCore(BaseCodeObjCore):
    type: Literal[CodeObjType.CodeParam] = CodeObjType.CodeParam
    sharedModifier: CodeParamCodeObjImplModifier
    unsharedKeys: set[
        Literal[
            "coreNameEditable",
            "coreNameType",
            "defaultVal",
            "description",
            "passingStyle",
            "value",
        ]
    ] = Field(default_factory=lambda: {"value"})


class ColorPickerParamCodeObjCore(BaseCodeObjCore):
    type: Literal[CodeObjType.ColorPickerParam] = CodeObjType.ColorPickerParam
    sharedModifier: ColorPickerParamCodeObjImplModifier
    unsharedKeys: set[
        Literal[
            "choices",
            "coreNameEditable",
            "coreNameType",
            "defaultVal",
            "description",
            "passingStyle",
            "value",
        ]
    ] = Field(default_factory=lambda: {"value"})


class DropdownParamCodeObjCore(BaseCodeObjCore):
    type: Literal[CodeObjType.DropdownParam] = CodeObjType.DropdownParam
    sharedModifier: DropdownParamCodeObjImplModifier
    unsharedKeys: set[
        Literal[
            "choices",
            "coreNameEditable",
            "coreNameType",
            "defaultVal",
            "description",
            "passingStyle",
            "value",
        ]
    ] = Field(default_factory=lambda: {"value"})


class NestedParamCodeObjCore(BaseCodeObjCore):
    type: Literal[CodeObjType.NestedParam] = CodeObjType.NestedParam
    sharedModifier: NestedParamCodeObjImplModifier
    unsharedKeys: set[
        Literal[
            "children",
            "coreNameEditable",
            "coreNameType",
            "description",
            "passingStyle",
        ]
    ] = Field(default_factory=set)


class PasswordParamCodeObjCore(BaseCodeObjCore):
    type: Literal[CodeObjType.PasswordParam] = CodeObjType.PasswordParam
    sharedModifier: PasswordParamCodeObjImplModifier
    unsharedKeys: set[
        Literal[
            "coreNameEditable",
            "coreNameType",
            "defaultVal",
            "description",
            "passingStyle",
            "value",
        ]
    ] = Field(default_factory=lambda: {"value"})


class SliderParamCodeObjCore(BaseCodeObjCore):
    type: Literal[CodeObjType.SliderParam] = CodeObjType.SliderParam
    sharedModifier: SliderParamCodeObjImplModifier
    unsharedKeys: set[
        Literal[
            "coreNameEditable",
            "coreNameType",
            "defaultVal",
            "description",
            "max",
            "min",
            "passingStyle",
            "step",
            "value",
        ]
    ] = Field(default_factory=lambda: {"value"})


class SwitchParamCodeObjCore(BaseCodeObjCore):
    type: Literal[CodeObjType.SwitchParam] = CodeObjType.SwitchParam
    sharedModifier: SwitchParamCodeObjImplModifier
    unsharedKeys: set[
        Literal[
            "coreNameEditable",
            "coreNameType",
            "defaultVal",
            "description",
            "passingStyle",
            "value",
        ]
    ] = Field(default_factory=lambda: {"value"})


class TextParamCodeObjCore(BaseCodeObjCore):
    type: Literal[CodeObjType.TextParam] = CodeObjType.TextParam
    sharedModifier: TextParamCodeObjImplModifier
    unsharedKeys: set[
        Literal[
            "coreNameEditable",
            "coreNameType",
            "defaultVal",
            "description",
            "passingStyle",
            "value",
        ]
    ] = Field(default_factory=lambda: {"value"})
