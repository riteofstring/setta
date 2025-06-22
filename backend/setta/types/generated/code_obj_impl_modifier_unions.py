from typing import Annotated, TypeGuard, Union

from pydantic import Field, TypeAdapter
from setta.types.generated.code_obj_impl_modifiers import (
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

BaseCodeObjImplModifierUnion = Union[
    CodeCallableCodeObjImplModifier,
    CodeParamCodeObjImplModifier,
    TextParamCodeObjImplModifier,
    SliderParamCodeObjImplModifier,
    SwitchParamCodeObjImplModifier,
    ColorPickerParamCodeObjImplModifier,
    DropdownParamCodeObjImplModifier,
    PasswordParamCodeObjImplModifier,
    NestedParamCodeObjImplModifier,
]

BaseCodeObjImplModifierUnionWithDiscriminator = Annotated[
    BaseCodeObjImplModifierUnion, Field(discriminator="type")
]

BaseCodeObjImplModifierTypeAdapter = TypeAdapter(
    BaseCodeObjImplModifierUnionWithDiscriminator
)

BaseCodeObjImplModifierTypeSet = set(
    [
        "CodeCallable",
        "CodeParam",
        "TextParam",
        "SliderParam",
        "SwitchParam",
        "ColorPickerParam",
        "DropdownParam",
        "PasswordParam",
        "NestedParam",
    ]
)

BaseParamCodeObjImplModifierUnion = Union[
    CodeParamCodeObjImplModifier,
    TextParamCodeObjImplModifier,
    SliderParamCodeObjImplModifier,
    SwitchParamCodeObjImplModifier,
    ColorPickerParamCodeObjImplModifier,
    DropdownParamCodeObjImplModifier,
    PasswordParamCodeObjImplModifier,
    NestedParamCodeObjImplModifier,
]

BaseParamCodeObjImplModifierUnionWithDiscriminator = Annotated[
    BaseParamCodeObjImplModifierUnion, Field(discriminator="type")
]

BaseParamCodeObjImplModifierTypeAdapter = TypeAdapter(
    BaseParamCodeObjImplModifierUnionWithDiscriminator
)

BaseParamCodeObjImplModifierTypeSet = set(
    [
        "CodeParam",
        "TextParam",
        "SliderParam",
        "SwitchParam",
        "ColorPickerParam",
        "DropdownParam",
        "PasswordParam",
        "NestedParam",
    ]
)

BaseChildlessCodeObjImplModifierUnion = Union[
    CodeParamCodeObjImplModifier,
    TextParamCodeObjImplModifier,
    SliderParamCodeObjImplModifier,
    SwitchParamCodeObjImplModifier,
    ColorPickerParamCodeObjImplModifier,
    DropdownParamCodeObjImplModifier,
    PasswordParamCodeObjImplModifier,
]

BaseChildlessCodeObjImplModifierUnionWithDiscriminator = Annotated[
    BaseChildlessCodeObjImplModifierUnion, Field(discriminator="type")
]

BaseChildlessCodeObjImplModifierTypeAdapter = TypeAdapter(
    BaseChildlessCodeObjImplModifierUnionWithDiscriminator
)

BaseChildlessCodeObjImplModifierTypeSet = set(
    [
        "CodeParam",
        "TextParam",
        "SliderParam",
        "SwitchParam",
        "ColorPickerParam",
        "DropdownParam",
        "PasswordParam",
    ]
)

BaseParentCodeObjImplModifierUnion = Union[
    CodeCallableCodeObjImplModifier, NestedParamCodeObjImplModifier
]

BaseParentCodeObjImplModifierUnionWithDiscriminator = Annotated[
    BaseParentCodeObjImplModifierUnion, Field(discriminator="type")
]

BaseParentCodeObjImplModifierTypeAdapter = TypeAdapter(
    BaseParentCodeObjImplModifierUnionWithDiscriminator
)

BaseParentCodeObjImplModifierTypeSet = set(["CodeCallable", "NestedParam"])

from setta.types.generated.section_impl_modifiers import BaseSectionImplModifier


def isBaseCodeObjImplModifier(
    x: BaseSectionImplModifier | BaseCodeObjImplModifier,
) -> TypeGuard[BaseCodeObjImplModifier]:
    return x["type"] in BaseCodeObjImplModifierTypeSet


def isBaseParamCodeObjImplModifier(
    x: BaseSectionImplModifier | BaseCodeObjImplModifier,
) -> TypeGuard[BaseParamCodeObjImplModifier]:
    return x["type"] in BaseParamCodeObjImplModifierTypeSet


def isBaseChildlessCodeObjImplModifier(
    x: BaseSectionImplModifier | BaseCodeObjImplModifier,
) -> TypeGuard[BaseChildlessCodeObjImplModifier]:
    return x["type"] in BaseChildlessCodeObjImplModifierTypeSet


def isBaseParentCodeObjImplModifier(
    x: BaseSectionImplModifier | BaseCodeObjImplModifier,
) -> TypeGuard[BaseParentCodeObjImplModifier]:
    return x["type"] in BaseParentCodeObjImplModifierTypeSet
