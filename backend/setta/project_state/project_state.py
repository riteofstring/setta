from enum import StrEnum
from typing import Any, Dict, List, Literal, Optional, Union

from pydantic import BaseModel, Field, model_serializer, model_validator

from setta.database.utils import create_new_id
from setta.utils.generate_memorable_string import generate_memorable_string


class Size(StrEnum):
    AUTO = "auto"


class CodeLanguage(StrEnum):
    PYTHON = "python"
    BASH = "bash"


class ConfigLanguage(StrEnum):
    PYTHON = "python"
    JSON = "json"


class ParameterPassingStyle(StrEnum):
    DEFAULT = "DEFAULT"
    ARGS = "ARGS"
    KWARGS = "KWARGS"
    POSITIONAL_ONLY = "POSITIONAL_ONLY"
    KEYWORD_ONLY = "KEYWORD_ONLY"


class CodeInfoType(StrEnum):
    PARAMETER = "parameter"
    CALLABLE = "callable"
    COLLECTION = "collection"


class ViewingEditingMode(StrEnum):
    DEV = "DEV"
    USER = "USER"
    USER_EDIT = "USER_EDIT"


class Viewport(BaseModel):
    x: float
    y: float
    zoom: float


class SectionSize(BaseModel):
    width: Union[float, Literal[Size.AUTO]] = Size.AUTO
    height: Union[float, Literal[Size.AUTO]] = Size.AUTO


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
    id: str = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
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
    codeLanguage: CodeLanguage = CodeLanguage.PYTHON
    isEntryCodeBlock: bool = False
    isFrozen: bool = False
    isHorizontalOrientation: bool = False
    hideParams: bool = False
    hideSearch: bool = False
    hideUnpinnedParams: bool = False
    hideColumn: bool = False
    displayMode: str = "GUI"
    visibility: Visibility = Field(default_factory=Visibility)
    pinnedAreaHeight: Union[float, Literal[Size.AUTO]] = Size.AUTO
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


class EVEntry(BaseModel):
    value: str = ""


class SectionVariant(BaseModel):
    name: str = Field(default_factory=generate_memorable_string)
    values: Dict[str, EVEntry] = Field(default_factory=dict)
    children: List[str] = Field(default_factory=list)
    selectedItem: Optional[str] = None
    code: str = ""
    codeInfoColId: Optional[str] = None
    description: str = ""
    isFrozen: bool = False
    sweep: List[Any] = Field(default_factory=list)
    runGroup: Dict[str, Any] = Field(default_factory=dict)
    configLanguage: ConfigLanguage = ConfigLanguage.PYTHON
    isJsonSource: bool = False
    jsonSourceKeys: List[str] = Field(default_factory=list)
    jsonSourceMissing: bool = False


class CodeInfo(BaseModel):
    id: str = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
    editable: bool = False
    rcType: CodeInfoType = CodeInfoType.PARAMETER
    defaultVal: str = ""
    description: str = ""
    passingStyle: ParameterPassingStyle = ParameterPassingStyle.DEFAULT
    isPinned: bool = False
    isFrozen: bool = False
    isSelected: bool = False
    ignoreTypeErrors: bool = False


class CodeInfoCol(BaseModel):
    children: Dict[Optional[str], List[Any]] = Field(default_factory=dict)

    @model_validator(mode="after")
    def convert_null_key(self):
        c = self.children.pop("null", [])
        self.children[None] = c
        return self

    @model_serializer
    def convert_none_key(self):
        new_dict = {}
        for key, value in self.children.items():
            if key == None:
                new_dict["null"] = value
            else:
                new_dict[key] = value
        return {"children": new_dict}


class UIType(BaseModel):
    id: str = Field(default_factory=create_new_id)
    type: str = "TEXT"
    name: str = Field(default_factory=generate_memorable_string)
    presetType: str = "BASE"
    config: Dict[str, Any] = Field(default_factory=dict)


class UITypeColEntry(BaseModel):
    uiTypeId: str = "3fdaeb6a-e989-4888-b844-17a76f0b0192"
    nonPresetUITypeIds: List[str] = Field(default_factory=list)


class Artifact(BaseModel):
    name: str
    path: str
    value: Optional[str] = None
    type: str


class ProjectConfig(BaseModel):
    id: str = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
    previewImgColor: str = "bg-blue-500/60 dark:bg-blue-600/30"
    viewport: Optional[Viewport] = None
    children: Dict[str, Section] = Field(default_factory=dict)
    viewingEditingMode: ViewingEditingMode = ViewingEditingMode.DEV
    genCodePrefix: str = ""
    genCodeSuffix: str = ""


class ProjectState(BaseModel):
    projectConfig: ProjectConfig
    sections: Dict[str, Section] = Field(default_factory=dict)
    variants: Dict[str, SectionVariant] = Field(default_factory=dict)
    codeInfo: Dict[str, CodeInfo] = Field(default_factory=dict)
    codeInfoCol: Dict[str, CodeInfoCol] = Field(default_factory=dict)
    uiTypes: Dict[str, UIType] = Field(default_factory=dict)
    uiTypeCols: Dict[str, Dict[str, UITypeColEntry]] = Field(default_factory=dict)


class AllProjectStates(BaseModel):
    projects: Dict[str, ProjectState] = Field(default_factory=dict)
    defaultProjectId: str
