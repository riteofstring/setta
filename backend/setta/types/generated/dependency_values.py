from typing import Annotated

from pydantic import Field, TypeAdapter

from setta.types.dependency_value import (
    BinaryDependencyValue,
    FileReadDependencyValue,
    LiteralDependencyValue,
)

BaseDependencyValueUnion = (
    LiteralDependencyValue | FileReadDependencyValue | BinaryDependencyValue
)

BaseDependencyValueUnionWithDiscriminator = Annotated[
    BaseDependencyValueUnion, Field(discriminator="type")
]

BaseDependencyValueTypeAdapter = TypeAdapter(BaseDependencyValueUnionWithDiscriminator)

BaseDependencyValueTypeSet = set(["Literal", "FileRead", "Binary"])
