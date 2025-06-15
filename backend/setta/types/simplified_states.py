from pydantic import BaseModel, Field

from setta.types.section_enums import SectionType
from setta.types.sections import SectionSize


class Position(BaseModel):
    x: float = 0
    y: float = 0


class SimplifiedSection(BaseModel):
    name: str


class SimplifiedSectionCreation(BaseModel):
    name: str
    position: Position = Field(default_factory=Position)
    size: SectionSize = Field(default_factory=SectionSize)
    type: SectionType = Field(default=SectionType.CALLABLE)


class SimplifiedCodeInfo(BaseModel):
    name: str
    defaultVal: str = ""
    description: str = ""
