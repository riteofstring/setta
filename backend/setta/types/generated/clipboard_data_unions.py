from typing import Annotated, Union

from pydantic import Field, TypeAdapter

from setta.types.clipboard import SectionsClipboardData

BaseClipboardDataUnion = Union[SectionsClipboardData]

BaseClipboardDataUnionWithDiscriminator = Annotated[
    BaseClipboardDataUnion, Field(discriminator="type")
]

BaseClipboardDataTypeAdapter = TypeAdapter(BaseClipboardDataUnionWithDiscriminator)

BaseClipboardDataTypeSet = set(["Sections"])
