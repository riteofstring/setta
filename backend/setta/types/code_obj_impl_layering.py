from pydantic import Field
from setta.types.code_obj_impl_modifiers import (
    BaseChildlessCodeObjImplModifier,
    BaseCodeObjImplModifier,
    BaseParamCodeObjImplModifier,
    BaseParentCodeObjImplModifier,
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
    modifier: BaseCodeObjImplModifier = Field(  # type: ignore
        default_factory=BaseCodeObjImplModifier
    )


class BaseParamCodeObjImplLayering(BaseCodeObjImplLayering):
    modifier: BaseParamCodeObjImplModifier = Field(  # type: ignore
        default_factory=BaseParamCodeObjImplModifier
    )


class BaseChildlessCodeObjImplLayering(BaseParamCodeObjImplLayering):
    modifier: BaseChildlessCodeObjImplModifier = Field(  # type: ignore
        default_factory=BaseChildlessCodeObjImplModifier
    )


class BaseParentCodeObjImplLayering(BaseCodeObjImplLayering):
    modifier: BaseParentCodeObjImplModifier = Field(  # type: ignore
        default_factory=BaseParentCodeObjImplModifier
    )


class CodeCallableCodeObjImplLayering(BaseParentCodeObjImplLayering):
    modifier: CodeCallableCodeObjImplModifier = Field(  # type: ignore
        default_factory=CodeCallableCodeObjImplModifier
    )


class CodeParamCodeObjImplLayering(BaseChildlessCodeObjImplLayering):
    modifier: CodeParamCodeObjImplModifier = Field(  # type: ignore
        default_factory=CodeParamCodeObjImplModifier
    )


class TextParamCodeObjImplLayering(BaseChildlessCodeObjImplLayering):
    modifier: TextParamCodeObjImplModifier = Field(  # type: ignore
        default_factory=TextParamCodeObjImplModifier
    )


class SliderParamCodeObjImplLayering(BaseChildlessCodeObjImplLayering):
    modifier: SliderParamCodeObjImplModifier = Field(  # type: ignore
        default_factory=SliderParamCodeObjImplModifier
    )


class SwitchParamCodeObjImplLayering(BaseChildlessCodeObjImplLayering):
    modifier: SwitchParamCodeObjImplModifier = Field(  # type: ignore
        default_factory=SwitchParamCodeObjImplModifier
    )


class ColorPickerParamCodeObjImplLayering(BaseChildlessCodeObjImplLayering):
    modifier: ColorPickerParamCodeObjImplModifier = Field(  # type: ignore
        default_factory=ColorPickerParamCodeObjImplModifier
    )


class DropdownParamCodeObjImplLayering(BaseChildlessCodeObjImplLayering):
    modifier: DropdownParamCodeObjImplModifier = Field(  # type: ignore
        default_factory=DropdownParamCodeObjImplModifier
    )


class PasswordParamCodeObjImplLayering(BaseChildlessCodeObjImplLayering):
    modifier: PasswordParamCodeObjImplModifier = Field(  # type: ignore
        default_factory=PasswordParamCodeObjImplModifier
    )


class NestedParamCodeObjImplLayering(BaseParamCodeObjImplLayering):
    modifier: NestedParamCodeObjImplModifier = Field(  # type: ignore
        default_factory=NestedParamCodeObjImplModifier
    )
