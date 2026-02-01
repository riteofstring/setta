from typing import Annotated

from pydantic import Field, TypeAdapter
from setta.types.clipboard import SectionsClipboardData

BaseClipboardDataUnion = SectionsClipboardData

BaseClipboardDataUnionWithDiscriminator = Annotated[
    BaseClipboardDataUnion, Field(discriminator="type")
]

BaseClipboardDataTypeAdapter = TypeAdapter(BaseClipboardDataUnionWithDiscriminator)

BaseClipboardDataTypeSet = set(["Sections"])
