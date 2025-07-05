# Auto-generated CodeObjCore classes - DO NOT EDIT MANUALLY
# Generated from code obj implementations

from typing import Any, Literal

from pydantic import BaseModel, Field
from setta.database.utils import create_new_id
from setta.types.code_obj_impls import CodeObjType
from setta.types.generated.impl_field_literals import (
    BaseChildlessCodeObjImplFields,
    BaseCodeObjImplFields,
    BaseParamCodeObjImplFields,
    BaseParentCodeObjImplFields,
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
from setta.utils.generate_memorable_string import generate_memorable_string

# ============== Base Code Object Core Classes ==============


class BaseCodeObjCore(BaseModel):
    id: str = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
    impl: str
    implLayerings: list[str] = Field(default_factory=list)
    defaultImplLayering: str = ""
    type: Any
    sharedModifier: BaseCodeObjImplModifier
    unsharedKeys: list[BaseCodeObjImplFields] = Field(default_factory=list)


class BaseParamCodeObjCore(BaseCodeObjCore):
    type: Any
    sharedModifier: BaseParamCodeObjImplModifier
    unsharedKeys: list[BaseParamCodeObjImplFields] = Field(default_factory=list)


class BaseChildlessCodeObjCore(BaseParamCodeObjCore):
    type: Any
    sharedModifier: BaseChildlessCodeObjImplModifier
    unsharedKeys: list[BaseChildlessCodeObjImplFields] = Field(default_factory=list)


class BaseParentCodeObjCore(BaseCodeObjCore):
    type: Any
    sharedModifier: BaseParentCodeObjImplModifier
    unsharedKeys: list[BaseParentCodeObjImplFields] = Field(default_factory=list)


# ============== Concrete Code Object Core Classes ==============


class CodeCallableCodeObjCore(BaseParentCodeObjCore):
    type: Literal[CodeObjType.CodeCallable] = CodeObjType.CodeCallable
    sharedModifier: CodeCallableCodeObjImplModifier = Field(
        default_factory=lambda: CodeCallableCodeObjImplModifier(
            type=CodeObjType.CodeCallable
        )
    )
    unsharedKeys: list[CodeCallableCodeObjImplFields] = Field(default_factory=list)


class CodeParamCodeObjCore(BaseChildlessCodeObjCore):
    type: Literal[CodeObjType.CodeParam] = CodeObjType.CodeParam
    sharedModifier: CodeParamCodeObjImplModifier = Field(
        default_factory=lambda: CodeParamCodeObjImplModifier(type=CodeObjType.CodeParam)
    )
    unsharedKeys: list[CodeParamCodeObjImplFields] = Field(
        default_factory=lambda: ["value"]
    )


class TextParamCodeObjCore(BaseChildlessCodeObjCore):
    type: Literal[CodeObjType.TextParam] = CodeObjType.TextParam
    sharedModifier: TextParamCodeObjImplModifier = Field(
        default_factory=lambda: TextParamCodeObjImplModifier(type=CodeObjType.TextParam)
    )
    unsharedKeys: list[TextParamCodeObjImplFields] = Field(
        default_factory=lambda: ["value"]
    )


class SliderParamCodeObjCore(BaseChildlessCodeObjCore):
    type: Literal[CodeObjType.SliderParam] = CodeObjType.SliderParam
    sharedModifier: SliderParamCodeObjImplModifier = Field(
        default_factory=lambda: SliderParamCodeObjImplModifier(
            type=CodeObjType.SliderParam
        )
    )
    unsharedKeys: list[SliderParamCodeObjImplFields] = Field(
        default_factory=lambda: ["value"]
    )


class SwitchParamCodeObjCore(BaseChildlessCodeObjCore):
    type: Literal[CodeObjType.SwitchParam] = CodeObjType.SwitchParam
    sharedModifier: SwitchParamCodeObjImplModifier = Field(
        default_factory=lambda: SwitchParamCodeObjImplModifier(
            type=CodeObjType.SwitchParam
        )
    )
    unsharedKeys: list[SwitchParamCodeObjImplFields] = Field(
        default_factory=lambda: ["value"]
    )


class ColorPickerParamCodeObjCore(BaseChildlessCodeObjCore):
    type: Literal[CodeObjType.ColorPickerParam] = CodeObjType.ColorPickerParam
    sharedModifier: ColorPickerParamCodeObjImplModifier = Field(
        default_factory=lambda: ColorPickerParamCodeObjImplModifier(
            type=CodeObjType.ColorPickerParam
        )
    )
    unsharedKeys: list[ColorPickerParamCodeObjImplFields] = Field(
        default_factory=lambda: ["value"]
    )


class DropdownParamCodeObjCore(BaseChildlessCodeObjCore):
    type: Literal[CodeObjType.DropdownParam] = CodeObjType.DropdownParam
    sharedModifier: DropdownParamCodeObjImplModifier = Field(
        default_factory=lambda: DropdownParamCodeObjImplModifier(
            type=CodeObjType.DropdownParam
        )
    )
    unsharedKeys: list[DropdownParamCodeObjImplFields] = Field(
        default_factory=lambda: ["value"]
    )


class PasswordParamCodeObjCore(BaseChildlessCodeObjCore):
    type: Literal[CodeObjType.PasswordParam] = CodeObjType.PasswordParam
    sharedModifier: PasswordParamCodeObjImplModifier = Field(
        default_factory=lambda: PasswordParamCodeObjImplModifier(
            type=CodeObjType.PasswordParam
        )
    )
    unsharedKeys: list[PasswordParamCodeObjImplFields] = Field(
        default_factory=lambda: ["value"]
    )


class NestedParamCodeObjCore(BaseParamCodeObjCore, BaseParentCodeObjCore):
    type: Literal[CodeObjType.NestedParam] = CodeObjType.NestedParam
    sharedModifier: NestedParamCodeObjImplModifier = Field(
        default_factory=lambda: NestedParamCodeObjImplModifier(
            type=CodeObjType.NestedParam
        )
    )
    unsharedKeys: list[NestedParamCodeObjImplFields] = Field(default_factory=list)
