from typing import Any, Dict, List, Literal, Optional, Union

from pydantic import BaseModel, Field

# Change this to use Literal for proper validation
ViewingEditingMode = Literal["DEV", "USER", "USER_EDIT"]


class Viewport(BaseModel):
    x: float
    y: float
    zoom: float


class SectionSize(BaseModel):
    width: Union[float, Literal["auto"]] = "auto"
    height: Union[float, Literal["auto"]] = "auto"


class Visibility(BaseModel):
    DEV: bool = True
    USER: bool = True


class CanvasSettings(BaseModel):
    activeLayerId: Optional[str] = None
    color: str = "#ff0000"
    brushSize: int = 16
    brushShape: str = "butt"
    eraserBrushSize: int = 16
    drawThrottleDelay: int = 0
    canvasTransferQueueLength: int = 50
    mode: str = "draw"


class ChartSettings(BaseModel):
    type: str = "line"
    xAxisColumn: str = ""
    secondYAxisColumns: List[str] = Field(default_factory=list)
    xAxisLog: bool = False
    y1AxisLog: bool = False
    y2AxisLog: bool = False


class Section(BaseModel):
    id: str
    name: str
    size: SectionSize = Field(default_factory=lambda: SectionSize())
    parentId: Optional[str] = None
    variantId: Optional[str] = None
    uiTypeId: Optional[str] = None
    uiTypeColId: Optional[str] = None
    social: str = ""
    artifactGroupIds: List[str] = Field(default_factory=list)
    defaultVariantId: Optional[str] = None
    variantIds: List[str] = Field(default_factory=list)
    paramSweepSectionId: Optional[str] = None
    nonPresetUITypeIds: List[str] = Field(default_factory=list)
    codeLanguage: str = "python"
    isEntryCodeBlock: bool = False
    isFrozen: bool = False
    isHorizontalOrientation: bool = False
    hideParams: bool = False
    hideSearch: bool = False
    hideUnpinnedParams: bool = False
    hideColumn: bool = False
    displayMode: str = "GUI"
    visibility: Visibility = Field(default_factory=Visibility)
    pinnedAreaHeight: Union[float, Literal["auto"]] = "auto"
    isMinimized: bool = False
    canvasSettings: CanvasSettings = Field(default_factory=CanvasSettings)
    chartSettings: ChartSettings = Field(default_factory=ChartSettings)
    isTemporary: bool = False
    renderMarkdown: bool = False
    positionAndSizeLocked: bool = False
    selectedVariantIds: Dict[str, Any] = Field(default_factory=dict)
    paramFilter: str = ""
    isInOtherProjectConfigs: bool = False
    aspectRatio: bool = False
    aspectRatioExtraHeight: int = 0
    aspectRatioExtraWidth: int = 0
    columnWidth: Optional[float] = None
    renderedValue: Optional[Any] = None
    headingAsSectionName: bool = False


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
