from pydantic import Field

from setta.types.code_obj_impl_modifiers import (
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
from setta.types.impl_layering import ImplLayering


class CodeCallableCodeObjImplLayering(ImplLayering):
    modifier: CodeCallableCodeObjImplModifier = Field(
        default_factory=CodeCallableCodeObjImplModifier
    )


class CodeParamCodeObjImplLayering(ImplLayering):
    modifier: CodeParamCodeObjImplModifier = Field(
        default_factory=CodeParamCodeObjImplModifier
    )


class TextParamCodeObjImplLayering(ImplLayering):
    modifier: TextParamCodeObjImplModifier = Field(
        default_factory=TextParamCodeObjImplModifier
    )


class SliderParamCodeObjImplLayering(ImplLayering):
    modifier: SliderParamCodeObjImplModifier = Field(
        default_factory=SliderParamCodeObjImplModifier
    )


class SwitchParamCodeObjImplLayering(ImplLayering):
    modifier: SwitchParamCodeObjImplModifier = Field(
        default_factory=SwitchParamCodeObjImplModifier
    )


class ColorPickerParamCodeObjImplLayering(ImplLayering):
    modifier: ColorPickerParamCodeObjImplModifier = Field(
        default_factory=ColorPickerParamCodeObjImplModifier
    )


class DropdownParamCodeObjImplLayering(ImplLayering):
    modifier: DropdownParamCodeObjImplModifier = Field(
        default_factory=DropdownParamCodeObjImplModifier
    )


class PasswordParamCodeObjImplLayering(ImplLayering):
    modifier: PasswordParamCodeObjImplModifier = Field(
        default_factory=PasswordParamCodeObjImplModifier
    )


class NestedParamCodeObjImplLayering(ImplLayering):
    modifier: NestedParamCodeObjImplModifier = Field(
        default_factory=NestedParamCodeObjImplModifier
    )
