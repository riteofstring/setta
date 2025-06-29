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
