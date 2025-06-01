from enum import StrEnum
from pathlib import Path

from pydantic import BaseModel

JSONValueType = dict | list | str | int | float | bool | None


class ArtifactType(StrEnum):
    IMG = "img"
    BRUSH_STROKES = "brushStrokes"
    LIST = "list"
    CHAT_HISTORY = "chatHistory"


class ArtifactWithoutValue(BaseModel, extra="forbid"):
    name: str
    path: Path
    type: ArtifactType


class Artifact(ArtifactWithoutValue, extra="forbid"):
    value: JSONValueType = None


class ArtifactWithId(Artifact, extra="forbid"):
    id: str | None
