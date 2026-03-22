from typing import Annotated, Literal

from pydantic import Field
from setta.types.generated.go_shared_types import (
    BinaryContentRef,
    BinaryDependencyValue as GoBinaryDependencyValue,
    DependencyValueType,
    FileReadDependencyValue as GoFileReadDependencyValue,
    LiteralDependencyValue as GoLiteralDependencyValue,
)


class LiteralDependencyValue(GoLiteralDependencyValue):
    type: Literal[DependencyValueType.Literal] = DependencyValueType.Literal
    payload: str


class FileReadDependencyValue(GoFileReadDependencyValue):
    type: Literal[DependencyValueType.FileRead] = DependencyValueType.FileRead
    payload: str


class BinaryDependencyValue(GoBinaryDependencyValue):
    type: Literal[DependencyValueType.Binary] = DependencyValueType.Binary
    payload: BinaryContentRef


BaseDependencyValueUnion = (
    LiteralDependencyValue | FileReadDependencyValue | BinaryDependencyValue
)

BaseDependencyValueUnionWithDiscriminator = Annotated[
    BaseDependencyValueUnion, Field(discriminator="type")
]
