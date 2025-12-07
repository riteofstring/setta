from enum import Enum

from pydantic import BaseModel, Field

from setta.code_gen.utils import GEN_CODE_CLASS_NAME
from setta.database.utils import create_new_id
from setta.types.id import ID
from setta.utils.generate_memorable_string import generate_memorable_string


class Position(BaseModel):
    x: float = 0
    y: float = 0


class ViewingEditingMode(str, Enum):
    DEV = "DEV"
    USER = "USER"
    USER_EDIT = "USER_EDIT"


class Viewport(BaseModel, extra="forbid"):
    x: float = 0
    y: float = 0
    zoom: float = 1


class TopLevelSectionLayout(Position, extra="forbid"):
    zIndex: int = 0
    w: float | None = None
    h: float | None = None


class ProjectConfig(BaseModel, extra="forbid"):
    id: ID = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
    previewImgColor: str = "bg-blue-500/60 dark:bg-blue-600/30"
    viewport: Viewport | None = Field(default_factory=Viewport)
    viewingEditingMode: ViewingEditingMode = ViewingEditingMode.DEV
    genCodePrefix: str = ""
    genCodeSuffix: str = f"s = {GEN_CODE_CLASS_NAME}()"
    entryCodeBlockId: ID | None = None
    topLevelSections: dict[ID, TopLevelSectionLayout] = Field(default_factory=dict)
    sectionVariantMap: dict[ID, ID] = Field(default_factory=dict)
    activeIds: list[ID] = Field(default_factory=list)
