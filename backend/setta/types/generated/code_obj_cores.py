# Auto-generated CodeObjCore classes - DO NOT EDIT MANUALLY
# Generated from code obj implementations

from typing import Literal

from pydantic import Field

from setta.types.code_obj_core import BaseCodeObjCore
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
    """Core configuration for CodeCallable code objects."""

    sharedModifier: CodeCallableCodeObjImplModifier
    unsharedKeys: set[Literal["children", "description"]] = Field(default_factory=set)


class CodeParamCodeObjCore(BaseCodeObjCore):
    """Core configuration for CodeParam code objects."""

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
    ] = Field(default_factory=set)


class ColorPickerParamCodeObjCore(BaseCodeObjCore):
    """Core configuration for ColorPickerParam code objects."""

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
    ] = Field(default_factory=set)


class DropdownParamCodeObjCore(BaseCodeObjCore):
    """Core configuration for DropdownParam code objects."""

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
    ] = Field(default_factory=set)


class NestedParamCodeObjCore(BaseCodeObjCore):
    """Core configuration for NestedParam code objects."""

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
    """Core configuration for PasswordParam code objects."""

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
    ] = Field(default_factory=set)


class SliderParamCodeObjCore(BaseCodeObjCore):
    """Core configuration for SliderParam code objects."""

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
    ] = Field(default_factory=set)


class SwitchParamCodeObjCore(BaseCodeObjCore):
    """Core configuration for SwitchParam code objects."""

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
    ] = Field(default_factory=set)


class TextParamCodeObjCore(BaseCodeObjCore):
    """Core configuration for TextParam code objects."""

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
    ] = Field(default_factory=set)
