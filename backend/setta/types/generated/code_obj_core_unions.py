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
    ColorPickerParamCodeObjCore,
    DropdownParamCodeObjCore,
    NestedParamCodeObjCore,
    PasswordParamCodeObjCore,
    SliderParamCodeObjCore,
    SwitchParamCodeObjCore,
    TextParamCodeObjCore,
]

BaseCodeObjCoreUnionWithDiscriminator = Annotated[
    BaseCodeObjCoreUnion, Field(discriminator="type")
]

BaseCodeObjCoreTypeAdapter = TypeAdapter(BaseCodeObjCoreUnionWithDiscriminator)

BaseCodeObjCoreTypeSet = set(
    [
        "CodeCallable",
        "CodeParam",
        "ColorPickerParam",
        "DropdownParam",
        "NestedParam",
        "PasswordParam",
        "SliderParam",
        "SwitchParam",
        "TextParam",
    ]
)

BaseParamCodeObjCoreUnion = Union[
    CodeParamCodeObjCore,
    ColorPickerParamCodeObjCore,
    DropdownParamCodeObjCore,
    NestedParamCodeObjCore,
    PasswordParamCodeObjCore,
    SliderParamCodeObjCore,
    SwitchParamCodeObjCore,
    TextParamCodeObjCore,
]

BaseParamCodeObjCoreUnionWithDiscriminator = Annotated[
    BaseParamCodeObjCoreUnion, Field(discriminator="type")
]

BaseParamCodeObjCoreTypeAdapter = TypeAdapter(
    BaseParamCodeObjCoreUnionWithDiscriminator
)

BaseParamCodeObjCoreTypeSet = set(
    [
        "CodeParam",
        "ColorPickerParam",
        "DropdownParam",
        "NestedParam",
        "PasswordParam",
        "SliderParam",
        "SwitchParam",
        "TextParam",
    ]
)

BaseChildlessCodeObjCoreUnion = Union[
    CodeParamCodeObjCore,
    ColorPickerParamCodeObjCore,
    DropdownParamCodeObjCore,
    PasswordParamCodeObjCore,
    SliderParamCodeObjCore,
    SwitchParamCodeObjCore,
    TextParamCodeObjCore,
]

BaseChildlessCodeObjCoreUnionWithDiscriminator = Annotated[
    BaseChildlessCodeObjCoreUnion, Field(discriminator="type")
]

BaseChildlessCodeObjCoreTypeAdapter = TypeAdapter(
    BaseChildlessCodeObjCoreUnionWithDiscriminator
)

BaseChildlessCodeObjCoreTypeSet = set(
    [
        "CodeParam",
        "ColorPickerParam",
        "DropdownParam",
        "PasswordParam",
        "SliderParam",
        "SwitchParam",
        "TextParam",
    ]
)

BaseParentCodeObjCoreUnion = Union[CodeCallableCodeObjCore, NestedParamCodeObjCore]

BaseParentCodeObjCoreUnionWithDiscriminator = Annotated[
    BaseParentCodeObjCoreUnion, Field(discriminator="type")
]

BaseParentCodeObjCoreTypeAdapter = TypeAdapter(
    BaseParentCodeObjCoreUnionWithDiscriminator
)

BaseParentCodeObjCoreTypeSet = set(["CodeCallable", "NestedParam"])
