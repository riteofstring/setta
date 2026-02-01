from typing import Annotated

from pydantic import Field

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
