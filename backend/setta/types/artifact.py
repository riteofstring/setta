from enum import StrEnum
from pathlib import Path

from pydantic import BaseModel


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
    value: str | None = None
