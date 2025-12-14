from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field

from setta.types.id import ID
from setta.types.project_state import ProjectStateCore


class ProjectStateCoreWithSectionVariantMap(BaseModel):
    core: ProjectStateCore
    sectionVariantMap: dict[ID, ID] = Field(default_factory=dict)


class ClipboardDataType(str, Enum):
    Sections = "Sections"


class BaseClipboardData(BaseModel):
    type: Any
    data: Any


class SectionsClipboardData(BaseClipboardData):
    type: Literal[ClipboardDataType.Sections] = ClipboardDataType.Sections
    data: ProjectStateCoreWithSectionVariantMap
