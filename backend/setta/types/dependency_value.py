from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Literal

from setta.types.binary_content import BinaryContentRef


class DependencyValueType(str, Enum):
    """Enumerates supported dependency payload encodings."""

    Literal = "Literal"
    Binary = "Binary"
    FileRead = "FileRead"


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
