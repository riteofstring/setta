from enum import Enum
from pathlib import Path

from pydantic import BaseModel

JSONValueType = dict | list | str | int | float | bool | None


class ArtifactType(str, Enum):
    IMG = "IMG"
    BRUSH_STROKES = "BRUSH_STROKES"
    LIST = "LIST"
    CHAT_HISTORY = "CHAT_HISTORY"


class ArtifactWithoutValue(BaseModel, extra="forbid"):
    name: str
    path: Path
    type: ArtifactType


class Artifact(ArtifactWithoutValue, extra="forbid"):
    value: JSONValueType = None


class ArtifactWithId(Artifact, extra="forbid"):
    id: str | None
