from enum import Enum
from typing import Any, Literal, Union

from pydantic import (
    BaseModel,
    Field,
)

from setta.database.utils import create_new_id
from setta.types.utils import AsIsStrEnum
from setta.utils.generate_memorable_string import generate_memorable_string


class SectionTypeName(Enum):
    SECTION = "SECTION"
    LIST_ROOT = "LIST_ROOT"
    DICT_ROOT = "DICT_ROOT"
    GROUP = "GROUP"
    IMAGE = "IMAGE"
    CHART = "CHART"
    DRAW = "DRAW"
    TEXT_BLOCK = "TEXT_BLOCK"
    SOCIAL = "SOCIAL"
    GLOBAL_VARIABLES = "GLOBAL_VARIABLES"
    CODE = "CODE"
    GEN_PYTHON_CODE = "GEN_PYTHON_CODE"
    TERMINAL = "TERMINAL"
    IFRAME = "IFRAME"
    CHAT = "CHAT"
    BROWSER = "BROWSER"


Size = AsIsStrEnum("Size", ["auto"])

CodeLanguage = AsIsStrEnum("CodeLanguage", ["python", "bash"])

ConfigLanguage = AsIsStrEnum("ConfigLanguage", ["python", "json"])


class SectionSize(BaseModel, extra="forbid"):
    width: Union[float, Literal[Size.auto]] = Size.auto
    height: Union[float, Literal[Size.auto]] = Size.auto


class Visibility(BaseModel, extra="forbid"):
    DEV: bool = True
    USER: bool = True


class DrawAreaCanvasSettings(BaseModel, extra="forbid"):
    activeLayerId: str | None = None
    color: str = "#ff0000"
    brushSize: int = 16
    brushShape: str = "butt"
    eraserBrushSize: int = 16
    drawThrottleDelay: int = 0
    canvasTransferQueueLength: int = 50
    mode: str = "draw"


class ChartSettings(BaseModel, extra="forbid"):
    type: str = "line"
    xAxisColumn: str = ""
    secondYAxisColumns: list[str] = Field(default_factory=list)
    xAxisLog: bool = False
    y1AxisLog: bool = False
    y2AxisLog: bool = False


class BaseSectionCore(BaseModel, extra="forbid"):
    id: str = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)


class BaseSectionImpl(BaseModel, extra="forbid"):
    type: Any
    id: str = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
    parentId: str | None = None
    isFrozen: bool = False
    visibility: Visibility = Field(default_factory=Visibility)
    isInOtherProjectConfigs: bool = False
    size: SectionSize = Field(default_factory=SectionSize)
    aspectRatio: bool = False
    aspectRatioExtraHeight: int = 0
    aspectRatioExtraWidth: int = 0
    isMinimized: bool = False
    positionAndSizeLocked: bool = False
    children: list[str] = Field(default_factory=list)
    codeInfoColId: str | None = None


class BaseSectionWithParams(BaseSectionImpl):
    values: dict[str, EVEntry] = Field(default_factory=dict)
    hideParams: bool = False
    hideUnpinnedParams: bool = False
    paramFilter: str = ""
    columnWidth: float | None = None
    configLanguage: ConfigLanguage = ConfigLanguage.python
    pinnedAreaHeight: Union[float, Literal[Size.auto]] = Size.auto
    isJsonSource: bool = False
    jsonSourceKeys: list[str] = Field(default_factory=list)
    jsonSourceMissing: bool = False


class BaseArtifactSection(BaseSectionImpl):
    artifactGroupIds: list[str] = Field(default_factory=list)


class BaseCanvasSection(BaseSectionImpl):
    renderedValue: Any = None


class BaseCodeSection(BaseSectionImpl):
    code: str = ""


class BaseParentSection(BaseSectionImpl):
    children: list[str] = Field(default_factory=list)


class Section(BaseSectionWithParams):
    type: Literal[SectionTypeName.SECTION] = SectionTypeName.SECTION
    selectedItem: str | None = None
    hideSearch: bool = False


class ListRootSection(BaseParentSection):
    type: Literal[SectionTypeName.LIST_ROOT] = SectionTypeName.LIST_ROOT


class DictRootSection(BaseParentSection):
    type: Literal[SectionTypeName.DICT_ROOT] = SectionTypeName.DICT_ROOT


class GroupSection(BaseParentSection):
    type: Literal[SectionTypeName.GROUP] = SectionTypeName.GROUP
    isHorizontalOrientation: bool = False


class ImageSection(BaseArtifactSection):
    type: Literal[SectionTypeName.IMAGE] = SectionTypeName.IMAGE


class ChartSection(BaseArtifactSection, BaseCanvasSection):
    type: Literal[SectionTypeName.CHART] = SectionTypeName.CHART
    chartSettings: ChartSettings = Field(default_factory=ChartSettings)


class DrawSection(BaseArtifactSection, BaseCanvasSection):
    type: Literal[SectionTypeName.DRAW] = SectionTypeName.DRAW
    canvasSettings: DrawAreaCanvasSettings = Field(
        default_factory=DrawAreaCanvasSettings
    )


class TextBlockSection(BaseSectionImpl):
    type: Literal[SectionTypeName.TEXT_BLOCK] = SectionTypeName.TEXT_BLOCK
    renderMarkdown: bool = False
    headingAsSectionName: bool = False
    displayMode: str = "GUI"
    description: str = ""


class SocialSection(BaseSectionImpl):
    type: Literal[SectionTypeName.SOCIAL] = SectionTypeName.SOCIAL
    social = ""


class GlobalVariablesSection(BaseSectionWithParams):
    type: Literal[SectionTypeName.GLOBAL_VARIABLES] = SectionTypeName.GLOBAL_VARIABLES
    name: str = "Global Variables"


class CodeSection(BaseCodeSection):
    type: Literal[SectionTypeName.CODE] = SectionTypeName.CODE
    codeLanguage: CodeLanguage = CodeLanguage.python


class GenPythonCodeSection(BaseCodeSection):
    type: Literal[SectionTypeName.GEN_PYTHON_CODE] = SectionTypeName.GEN_PYTHON_CODE
    name: str = "Generated Python Code"


class TerminalSection(BaseSectionImpl):
    type: Literal[SectionTypeName.TERMINAL] = SectionTypeName.TERMINAL


class IFrameSection(BaseSectionImpl):
    type: Literal[SectionTypeName.IFRAME] = SectionTypeName.IFRAME


class ChatSection(BaseSectionImpl):
    type: Literal[SectionTypeName.CHAT] = SectionTypeName.CHAT


class BrowserSection(BaseSectionImpl):
    type: Literal[SectionTypeName.BROWSER] = SectionTypeName.BROWSER
    hideColumn: bool = False
