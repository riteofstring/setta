from dataclasses import dataclass, field
from typing import Annotated, Any, Literal

from pydantic import Field
from setta.types.binary_content import BinaryContentRef
from setta.types.generated.go_shared_types import DependencyValueType


@dataclass(frozen=True, slots=True)
class BaseDependencyValue:
    payload: Any
    type: DependencyValueType


@dataclass(frozen=True, slots=True)
class LiteralDependencyValue(BaseDependencyValue):
    payload: str
    type: Literal[DependencyValueType.Literal] = field(
        default=DependencyValueType.Literal, init=False
    )


@dataclass(frozen=True, slots=True)
class FileReadDependencyValue(BaseDependencyValue):
    payload: str
    type: Literal[DependencyValueType.FileRead] = field(
        default=DependencyValueType.FileRead, init=False
    )


@dataclass(frozen=True, slots=True)
class BinaryDependencyValue(BaseDependencyValue):
    payload: BinaryContentRef
    type: Literal[DependencyValueType.Binary] = field(
        default=DependencyValueType.Binary, init=False
    )


BaseDependencyValueUnion = (
    LiteralDependencyValue | FileReadDependencyValue | BinaryDependencyValue
)

BaseDependencyValueUnionWithDiscriminator = Annotated[
    BaseDependencyValueUnion, Field(discriminator="type")
]
