from typing import Dict, Literal, Optional

from pydantic import BaseModel, Field

# Change this to use Literal for proper validation
ViewingEditingMode = Literal["DEV", "USER", "USER_EDIT"]


class Viewport(BaseModel):
    x: float
    y: float
    zoom: float


class SectionSize(BaseModel):
    width: float | Literal["auto"]
    height: float | Literal["auto"]


class Section(BaseModel):
    id: str
    name: str
    # Use Field with default_factory for mutable defaults
    size: SectionSize = Field(
        default_factory=lambda: SectionSize(width="auto", height="auto")
    )
    parentId: Optional[str] = None
    variantId: Optional[str] = None
    uiTypeId: Optional[str] = None
    uiTypeColId: Optional[str] = None


class ProjectConfig(BaseModel):
    id: str
    name: str
    previewImgColor: str = "bg-blue-500/60 dark:bg-blue-600/30"
    viewport: Optional[Viewport] = None
    children: Dict[str, Section] = Field(default_factory=dict)
    # Fix: Use the Literal type alias instead of the class
    viewingEditingMode: ViewingEditingMode = "DEV"
    genCodePrefix: str = ""
    genCodeSuffix: str = ""


class ProjectState(BaseModel):
    projectConfig: ProjectConfig
    sections: Dict[str, Section] = Field(default_factory=dict)
