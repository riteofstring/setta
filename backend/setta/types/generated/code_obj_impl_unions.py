from typing import Annotated, Union

from pydantic import Field, TypeAdapter
from setta.types.code_obj_impls import (
    CodeCallableCodeObjImpl,
    CodeParamCodeObjImpl,
    ColorPickerParamCodeObjImpl,
    DropdownParamCodeObjImpl,
    NestedParamCodeObjImpl,
    PasswordParamCodeObjImpl,
    SliderParamCodeObjImpl,
    SwitchParamCodeObjImpl,
    TextParamCodeObjImpl,
)

BaseCodeObjImplUnion = Union[
    CodeCallableCodeObjImpl,
    CodeParamCodeObjImpl,
    TextParamCodeObjImpl,
    SliderParamCodeObjImpl,
    SwitchParamCodeObjImpl,
    ColorPickerParamCodeObjImpl,
    DropdownParamCodeObjImpl,
    PasswordParamCodeObjImpl,
    NestedParamCodeObjImpl,
]

BaseCodeObjImplUnionWithDiscriminator = Annotated[
    BaseCodeObjImplUnion, Field(discriminator="type")
]

BaseCodeObjImplUnionTypeAdapter = TypeAdapter(BaseCodeObjImplUnionWithDiscriminator)

BaseCodeObjImplUnionTypeSet = set(
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


BaseParamCodeObjImplUnion = Union[
    CodeParamCodeObjImpl,
    TextParamCodeObjImpl,
    SliderParamCodeObjImpl,
    SwitchParamCodeObjImpl,
    ColorPickerParamCodeObjImpl,
    DropdownParamCodeObjImpl,
    PasswordParamCodeObjImpl,
    NestedParamCodeObjImpl,
]

BaseParamCodeObjImplUnionWithDiscriminator = Annotated[
    BaseParamCodeObjImplUnion, Field(discriminator="type")
]

BaseParamCodeObjImplUnionTypeAdapter = TypeAdapter(
    BaseParamCodeObjImplUnionWithDiscriminator
)

BaseParamCodeObjImplUnionTypeSet = set(
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


BaseChildlessCodeObjImplUnion = Union[
    CodeParamCodeObjImpl,
    TextParamCodeObjImpl,
    SliderParamCodeObjImpl,
    SwitchParamCodeObjImpl,
    ColorPickerParamCodeObjImpl,
    DropdownParamCodeObjImpl,
    PasswordParamCodeObjImpl,
]

BaseChildlessCodeObjImplUnionWithDiscriminator = Annotated[
    BaseChildlessCodeObjImplUnion, Field(discriminator="type")
]

BaseChildlessCodeObjImplUnionTypeAdapter = TypeAdapter(
    BaseChildlessCodeObjImplUnionWithDiscriminator
)

BaseChildlessCodeObjImplUnionTypeSet = set(
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


BaseParentCodeObjImplUnion = Union[CodeCallableCodeObjImpl, NestedParamCodeObjImpl]

BaseParentCodeObjImplUnionWithDiscriminator = Annotated[
    BaseParentCodeObjImplUnion, Field(discriminator="type")
]

BaseParentCodeObjImplUnionTypeAdapter = TypeAdapter(
    BaseParentCodeObjImplUnionWithDiscriminator
)

BaseParentCodeObjImplUnionTypeSet = set(["CodeCallable", "NestedParam"])
