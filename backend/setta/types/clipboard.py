from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel

from setta.types.project_state import ProjectStateCore


class ClipboardDataType(str, Enum):
    Sections = "Sections"


class BaseClipboardData(BaseModel):
    type: Any
    data: Any


class SectionsClipboardData(BaseClipboardData):
    type: Literal[ClipboardDataType.Sections] = ClipboardDataType.Sections
    data: ProjectStateCore
