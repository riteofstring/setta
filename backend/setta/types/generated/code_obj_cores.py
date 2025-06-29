# Auto-generated CodeObjCore classes - DO NOT EDIT MANUALLY
# Generated from code obj implementations

from typing import Literal

from pydantic import Field

from setta.types.code_obj_core import BaseCodeObjCore
from setta.types.code_obj_impls import CodeObjType
from setta.types.generated.impl_field_literals import (
    CodeCallableCodeObjImplFields,
    CodeParamCodeObjImplFields,
    ColorPickerParamCodeObjImplFields,
    DropdownParamCodeObjImplFields,
    NestedParamCodeObjImplFields,
    PasswordParamCodeObjImplFields,
    SliderParamCodeObjImplFields,
    SwitchParamCodeObjImplFields,
    TextParamCodeObjImplFields,
)
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
from setta.types.generated.type_to_modifier import create_modifier_for_code_obj_type


class CodeCallableCodeObjCore(BaseCodeObjCore):
    type: Literal[CodeObjType.CodeCallable] = CodeObjType.CodeCallable
    sharedModifier: CodeCallableCodeObjImplModifier = Field(
        default_factory=lambda: create_modifier_for_code_obj_type(
            CodeObjType.CodeCallable
        )
    )
    unsharedKeys: set[CodeCallableCodeObjImplFields] = Field(default_factory=set)


class CodeParamCodeObjCore(BaseCodeObjCore):
    type: Literal[CodeObjType.CodeParam] = CodeObjType.CodeParam
    sharedModifier: CodeParamCodeObjImplModifier = Field(
        default_factory=lambda: create_modifier_for_code_obj_type(CodeObjType.CodeParam)
    )
    unsharedKeys: set[CodeParamCodeObjImplFields] = Field(
        default_factory=lambda: {"value"}
    )


class ColorPickerParamCodeObjCore(BaseCodeObjCore):
    type: Literal[CodeObjType.ColorPickerParam] = CodeObjType.ColorPickerParam
    sharedModifier: ColorPickerParamCodeObjImplModifier = Field(
        default_factory=lambda: create_modifier_for_code_obj_type(
            CodeObjType.ColorPickerParam
        )
    )
    unsharedKeys: set[ColorPickerParamCodeObjImplFields] = Field(
        default_factory=lambda: {"value"}
    )


class DropdownParamCodeObjCore(BaseCodeObjCore):
    type: Literal[CodeObjType.DropdownParam] = CodeObjType.DropdownParam
    sharedModifier: DropdownParamCodeObjImplModifier = Field(
        default_factory=lambda: create_modifier_for_code_obj_type(
            CodeObjType.DropdownParam
        )
    )
    unsharedKeys: set[DropdownParamCodeObjImplFields] = Field(
        default_factory=lambda: {"value"}
    )


class NestedParamCodeObjCore(BaseCodeObjCore):
    type: Literal[CodeObjType.NestedParam] = CodeObjType.NestedParam
    sharedModifier: NestedParamCodeObjImplModifier = Field(
        default_factory=lambda: create_modifier_for_code_obj_type(
            CodeObjType.NestedParam
        )
    )
    unsharedKeys: set[NestedParamCodeObjImplFields] = Field(default_factory=set)


class PasswordParamCodeObjCore(BaseCodeObjCore):
    type: Literal[CodeObjType.PasswordParam] = CodeObjType.PasswordParam
    sharedModifier: PasswordParamCodeObjImplModifier = Field(
        default_factory=lambda: create_modifier_for_code_obj_type(
            CodeObjType.PasswordParam
        )
    )
    unsharedKeys: set[PasswordParamCodeObjImplFields] = Field(
        default_factory=lambda: {"value"}
    )


class SliderParamCodeObjCore(BaseCodeObjCore):
    type: Literal[CodeObjType.SliderParam] = CodeObjType.SliderParam
    sharedModifier: SliderParamCodeObjImplModifier = Field(
        default_factory=lambda: create_modifier_for_code_obj_type(
            CodeObjType.SliderParam
        )
    )
    unsharedKeys: set[SliderParamCodeObjImplFields] = Field(
        default_factory=lambda: {"value"}
    )


class SwitchParamCodeObjCore(BaseCodeObjCore):
    type: Literal[CodeObjType.SwitchParam] = CodeObjType.SwitchParam
    sharedModifier: SwitchParamCodeObjImplModifier = Field(
        default_factory=lambda: create_modifier_for_code_obj_type(
            CodeObjType.SwitchParam
        )
    )
    unsharedKeys: set[SwitchParamCodeObjImplFields] = Field(
        default_factory=lambda: {"value"}
    )


class TextParamCodeObjCore(BaseCodeObjCore):
    type: Literal[CodeObjType.TextParam] = CodeObjType.TextParam
    sharedModifier: TextParamCodeObjImplModifier = Field(
        default_factory=lambda: create_modifier_for_code_obj_type(CodeObjType.TextParam)
    )
    unsharedKeys: set[TextParamCodeObjImplFields] = Field(
        default_factory=lambda: {"value"}
    )
