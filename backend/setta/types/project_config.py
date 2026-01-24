from pydantic import BaseModel, Field

from setta.code_gen.utils import GEN_CODE_CLASS_NAME, GEN_CODE_INSTANCE_NAME
from setta.database.utils import create_new_id
from setta.types.edges import Edge
from setta.types.id import ID
from setta.utils.generate_memorable_string import generate_memorable_string


class Position(BaseModel):
    x: float = 0
    y: float = 0


class Viewport(BaseModel, extra="forbid"):
    """Camera settings describing the canvas offset and zoom level."""

    x: float = Field(
        default=0.0,
        description="Horizontal offset applied to the viewport origin.",
    )
    y: float = Field(
        default=0.0,
        description="Vertical offset applied to the viewport origin.",
    )
    zoom: float = Field(
        default=1.0,
        description="Scalar zoom level; greater than 1 zooms in, less than 1 zooms out.",
    )


class ViewportBounds(BaseModel, extra="forbid"):
    """Visible canvas bounds in flow coordinates."""

    x: float = 0
    y: float = 0
    w: float = 0
    h: float = 0


class TopLevelSectionLayout(Position, extra="forbid"):
    zIndex: int = 0
    w: float | None = None
    h: float | None = None


class ViewModeConfig(BaseModel, extra="forbid"):
    id: ID = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
    isUserFacing: bool = False
    visibilityBySectionId: dict[ID, bool] = Field(default_factory=dict)


class ProjectConfig(BaseModel, extra="forbid"):
    id: ID = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
    showParamDisplayNames: bool = False
    previewImgColor: str = "bg-blue-500/60 dark:bg-blue-600/30"
    viewport: Viewport | None = Field(default_factory=Viewport)
    viewModes: dict[ID, ViewModeConfig] = Field(default_factory=dict)
    activeViewModeId: ID | None = None
    isEditingViewMode: bool = False
    genCodePrefix: str = ""
    genCodeSuffix: str = f"{GEN_CODE_INSTANCE_NAME} = {GEN_CODE_CLASS_NAME}()"
    entryCodeBlockId: ID | None = None
    topLevelSections: dict[ID, TopLevelSectionLayout] = Field(default_factory=dict)
    sectionVariantMap: dict[ID, ID] = Field(default_factory=dict)
    activeIds: list[ID] = Field(default_factory=list)
    edges: list[Edge] = Field(default_factory=list)
