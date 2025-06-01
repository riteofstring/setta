from enum import StrEnum
from pydantic import BaseModel


class ArtifactType(StrEnum):
    IMG = "img"
    BRUSH_STROKES = "brushStrokes"
    LIST = "list"
    CHAT_HISTORY = "chatHistory"


class Artifact(BaseModel, extra="forbid"):
    name: str
    path: str
    value: str | None = None
    type: ArtifactType