from pydantic import BaseModel, Field

from setta.types.section_impls import SectionSize, SectionType


class Position(BaseModel):
    x: float = 0
    y: float = 0


class SimplifiedSection(BaseModel):
    name: str


class SimplifiedSectionCreation(BaseModel):
    name: str
    position: Position = Field(default_factory=Position)
    size: SectionSize = Field(default_factory=SectionSize)
    type: SectionType = SectionType.Callable


class SimplifiedCodeInfo(BaseModel):
    name: str
    defaultVal: str = ""
    description: str = ""
