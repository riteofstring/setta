from typing import Any

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
from setta.types.impl_layering import BaseImplLayering


class BaseCodeObjImplLayering(BaseImplLayering):
    modifier: Any


class BaseParamCodeObjImplLayering(BaseCodeObjImplLayering):
    modifier: Any


class BaseChildlessCodeObjImplLayering(BaseParamCodeObjImplLayering):
    modifier: Any


class BaseParentCodeObjImplLayering(BaseCodeObjImplLayering):
    modifier: Any


class CodeCallableCodeObjImplLayering(BaseParentCodeObjImplLayering):
    modifier: CodeCallableCodeObjImplModifier = Field(
        default_factory=CodeCallableCodeObjImplModifier
    )


class CodeParamCodeObjImplLayering(BaseChildlessCodeObjImplLayering):
    modifier: CodeParamCodeObjImplModifier = Field(
        default_factory=CodeParamCodeObjImplModifier
    )


class TextParamCodeObjImplLayering(BaseChildlessCodeObjImplLayering):
    modifier: TextParamCodeObjImplModifier = Field(
        default_factory=TextParamCodeObjImplModifier
    )


class SliderParamCodeObjImplLayering(BaseChildlessCodeObjImplLayering):
    modifier: SliderParamCodeObjImplModifier = Field(
        default_factory=SliderParamCodeObjImplModifier
    )


class SwitchParamCodeObjImplLayering(BaseChildlessCodeObjImplLayering):
    modifier: SwitchParamCodeObjImplModifier = Field(
        default_factory=SwitchParamCodeObjImplModifier
    )


class ColorPickerParamCodeObjImplLayering(BaseChildlessCodeObjImplLayering):
    modifier: ColorPickerParamCodeObjImplModifier = Field(
        default_factory=ColorPickerParamCodeObjImplModifier
    )


class DropdownParamCodeObjImplLayering(BaseChildlessCodeObjImplLayering):
    modifier: DropdownParamCodeObjImplModifier = Field(
        default_factory=DropdownParamCodeObjImplModifier
    )


class PasswordParamCodeObjImplLayering(BaseChildlessCodeObjImplLayering):
    modifier: PasswordParamCodeObjImplModifier = Field(
        default_factory=PasswordParamCodeObjImplModifier
    )


class NestedParamCodeObjImplLayering(BaseParamCodeObjImplLayering):
    modifier: NestedParamCodeObjImplModifier = Field(
        default_factory=NestedParamCodeObjImplModifier
    )
