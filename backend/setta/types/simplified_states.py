from pydantic import BaseModel, Field

from setta.types.base_ui_types import UITypeName
from setta.types.project_state import Position, SectionSize


class SimplifiedSection(BaseModel):
    name: str


class SimplifiedSectionCreation(BaseModel):
    name: str
    position: Position = Field(default_factory=Position)
    size: SectionSize = Field(default_factory=SectionSize)
    type: UITypeName = Field(default=UITypeName.SECTION)


class SimplifiedCodeInfo(BaseModel):
    name: str
    editable: bool
    defaultVal: str = ""
    description: str = ""
