from typing import Annotated, Union

from pydantic import Field, TypeAdapter
from setta.types.generated.code_obj_cores import (
    CodeCallableCodeObjCore,
    CodeParamCodeObjCore,
    ColorPickerParamCodeObjCore,
    DropdownParamCodeObjCore,
    NestedParamCodeObjCore,
    PasswordParamCodeObjCore,
    SliderParamCodeObjCore,
    SwitchParamCodeObjCore,
    TextParamCodeObjCore,
)

BaseCodeObjCoreUnion = Union[
    CodeCallableCodeObjCore,
    CodeParamCodeObjCore,
    TextParamCodeObjCore,
    SliderParamCodeObjCore,
    SwitchParamCodeObjCore,
    ColorPickerParamCodeObjCore,
    DropdownParamCodeObjCore,
    PasswordParamCodeObjCore,
    NestedParamCodeObjCore,
]

BaseCodeObjCoreUnionWithDiscriminator = Annotated[
    BaseCodeObjCoreUnion, Field(discriminator="type")
]

BaseCodeObjCoreUnionTypeAdapter = TypeAdapter(BaseCodeObjCoreUnionWithDiscriminator)

BaseCodeObjCoreUnionTypeSet = set(
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


BaseParamCodeObjCoreUnion = Union[
    CodeParamCodeObjCore,
    TextParamCodeObjCore,
    SliderParamCodeObjCore,
    SwitchParamCodeObjCore,
    ColorPickerParamCodeObjCore,
    DropdownParamCodeObjCore,
    PasswordParamCodeObjCore,
    NestedParamCodeObjCore,
]

BaseParamCodeObjCoreUnionWithDiscriminator = Annotated[
    BaseParamCodeObjCoreUnion, Field(discriminator="type")
]

BaseParamCodeObjCoreUnionTypeAdapter = TypeAdapter(
    BaseParamCodeObjCoreUnionWithDiscriminator
)

BaseParamCodeObjCoreUnionTypeSet = set(
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


BaseChildlessCodeObjCoreUnion = Union[
    CodeParamCodeObjCore,
    TextParamCodeObjCore,
    SliderParamCodeObjCore,
    SwitchParamCodeObjCore,
    ColorPickerParamCodeObjCore,
    DropdownParamCodeObjCore,
    PasswordParamCodeObjCore,
]

BaseChildlessCodeObjCoreUnionWithDiscriminator = Annotated[
    BaseChildlessCodeObjCoreUnion, Field(discriminator="type")
]

BaseChildlessCodeObjCoreUnionTypeAdapter = TypeAdapter(
    BaseChildlessCodeObjCoreUnionWithDiscriminator
)

BaseChildlessCodeObjCoreUnionTypeSet = set(
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


BaseParentCodeObjCoreUnion = Union[CodeCallableCodeObjCore, NestedParamCodeObjCore]

BaseParentCodeObjCoreUnionWithDiscriminator = Annotated[
    BaseParentCodeObjCoreUnion, Field(discriminator="type")
]

BaseParentCodeObjCoreUnionTypeAdapter = TypeAdapter(
    BaseParentCodeObjCoreUnionWithDiscriminator
)

BaseParentCodeObjCoreUnionTypeSet = set(["CodeCallable", "NestedParam"])
