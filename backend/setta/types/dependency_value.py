from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Literal


class DependencyValueType(str, Enum):
    """Enumerates supported dependency payload encodings."""

    Literal = "Literal"
    Base64 = "Base64"
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
class Base64DependencyValue(BaseDependencyValue):
    payload: str
    type: Literal[DependencyValueType.Base64] = field(
        default=DependencyValueType.Base64, init=False
    )


@dataclass(frozen=True, slots=True)
class FileReadDependencyValue(BaseDependencyValue):
    payload: str
    type: Literal[DependencyValueType.FileRead] = field(
        default=DependencyValueType.FileRead, init=False
    )
