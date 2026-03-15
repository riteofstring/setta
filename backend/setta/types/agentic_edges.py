from enum import Enum

from pydantic import BaseModel, Field
from setta.types.id import ID, create_new_id


class AgenticEdgeKind(str, Enum):
    chat_chat = "chat_chat"
    section_chat = "section_chat"
    chat_section = "chat_section"


class AgenticEdgeContextMode(str, Enum):
    reference_only = "reference_only"
    inline_text = "inline_text"
    summary = "summary"


class AgenticEdge(BaseModel, extra="forbid"):
    id: ID = Field(default_factory=create_new_id)
    sourceSectionId: ID
    targetSectionId: ID
    kind: AgenticEdgeKind
    contextMode: AgenticEdgeContextMode = AgenticEdgeContextMode.reference_only
    style: dict[str, str | int | float] | None = None
    hidden: bool = False
    zIndex: int = 0
    selected: bool = False
