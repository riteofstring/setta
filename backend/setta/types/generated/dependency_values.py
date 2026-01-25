from typing import Annotated

from pydantic import Field, TypeAdapter
from setta.types.dependency_value import (
    Base64DependencyValue,
    FileReadDependencyValue,
    LiteralDependencyValue,
)

BaseDependencyValueUnion = (
    LiteralDependencyValue | Base64DependencyValue | FileReadDependencyValue
)

BaseDependencyValueUnionWithDiscriminator = Annotated[
    BaseDependencyValueUnion, Field(discriminator="type")
]

BaseDependencyValueTypeAdapter = TypeAdapter(BaseDependencyValueUnionWithDiscriminator)

BaseDependencyValueTypeSet = set(["Literal", "Base64", "FileRead"])
