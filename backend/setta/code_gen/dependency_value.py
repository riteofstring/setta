from dataclasses import dataclass
from enum import Enum


class DependencyValueKind(str, Enum):
    """Enumerates supported dependency payload encodings."""

    LITERAL = "literal"
    DRAW_LAYER = "draw_layer"
    ARTIFACT_REF = "artifact_ref"


@dataclass(slots=True)
class DependencyValue:
    """Wraps dependency payloads with a kind tag and optional metadata."""

    kind: DependencyValueKind
    payload: str
    metadata: dict[str, str] | None = None

    @classmethod
    def literal(cls, payload: str) -> "DependencyValue":
        return cls(kind=DependencyValueKind.LITERAL, payload=payload)
