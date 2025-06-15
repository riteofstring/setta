from enum import Enum
from typing import Any, Literal, Union

from pydantic import (
    BaseModel,
    Field,
)

from setta.database.utils import create_new_id
from setta.utils.generate_memorable_string import generate_memorable_string


class SectionType(Enum):
    CALLABLE = "CALLABLE"
    DICT = "DICT"
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


class Size(Enum):
    auto = "auto"


class CodeLanguage(Enum):
    python = "python"
    bash = "bash"


class ConfigLanguage(Enum):
    python = "python"
    json = "json"


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


class SectionCore(BaseModel, extra="forbid"):
    id: str = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
    impls: list[str] = Field(default_factory=list)
    default_impl: str | None = None


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


class BaseSectionWithParamsImpl(BaseSectionImpl):
    codeObjImplMap: dict[str, str] = Field(default_factory=dict)
    hideParams: bool = False
    hideUnpinnedParams: bool = False
    paramFilter: str = ""
    columnWidth: float | None = None
    configLanguage: ConfigLanguage = ConfigLanguage.python
    pinnedParams: list[str] = Field(default_factory=list)
    pinnedAreaHeight: Union[float, Literal[Size.auto]] = Size.auto
    selectedParams: list[str] = Field(default_factory=list)
    ignoreTypeErrors: dict[str, bool] = Field(default_factory=dict)


class BaseArtifactSectionImpl(BaseSectionImpl):
    artifactGroupIds: list[str] = Field(default_factory=list)


class BaseCanvasSectionImpl(BaseSectionImpl):
    renderedValue: Any = None


class BaseCodeSectionImpl(BaseSectionImpl):
    code: str = ""


class BaseParentSectionImpl(BaseSectionImpl):
    children: list[str] = Field(default_factory=list)


class BaseDictSectionImpl(BaseSectionWithParamsImpl):
    paramIds: list[str] = Field(default_factory=list)


class CallableSectionImpl(BaseSectionWithParamsImpl):
    type: Literal[SectionType.CALLABLE] = SectionType.CALLABLE
    callable: str | None = None


class DictSectionImpl(BaseDictSectionImpl):
    type: Literal[SectionType.DICT] = SectionType.DICT
    isJsonSource: bool = False
    jsonSourceKeys: list[str] = Field(default_factory=list)
    jsonSourceMissing: bool = False


class ListRootSectionImpl(BaseParentSectionImpl):
    type: Literal[SectionType.LIST_ROOT] = SectionType.LIST_ROOT


class DictRootSectionImpl(BaseParentSectionImpl):
    type: Literal[SectionType.DICT_ROOT] = SectionType.DICT_ROOT


class GroupSectionImpl(BaseParentSectionImpl):
    type: Literal[SectionType.GROUP] = SectionType.GROUP
    isHorizontalOrientation: bool = False


class ImageSectionImpl(BaseArtifactSectionImpl):
    type: Literal[SectionType.IMAGE] = SectionType.IMAGE


class ChartSectionImpl(BaseArtifactSectionImpl, BaseCanvasSectionImpl):
    type: Literal[SectionType.CHART] = SectionType.CHART
    chartSettings: ChartSettings = Field(default_factory=ChartSettings)


class DrawSectionImpl(BaseArtifactSectionImpl, BaseCanvasSectionImpl):
    type: Literal[SectionType.DRAW] = SectionType.DRAW
    canvasSettings: DrawAreaCanvasSettings = Field(
        default_factory=DrawAreaCanvasSettings
    )


class TextBlockSectionImpl(BaseSectionImpl):
    type: Literal[SectionType.TEXT_BLOCK] = SectionType.TEXT_BLOCK
    renderMarkdown: bool = False
    headingAsSectionName: bool = False
    displayMode: str = "GUI"
    description: str = ""


class SocialSectionImpl(BaseSectionImpl):
    type: Literal[SectionType.SOCIAL] = SectionType.SOCIAL
    social: str = ""


class GlobalVariablesSectionImpl(BaseDictSectionImpl):
    type: Literal[SectionType.GLOBAL_VARIABLES] = SectionType.GLOBAL_VARIABLES
    name: str = "Global Variables"


class CodeSectionImpl(BaseCodeSectionImpl):
    type: Literal[SectionType.CODE] = SectionType.CODE
    codeLanguage: CodeLanguage = CodeLanguage.python


class GenPythonCodeSectionImpl(BaseCodeSectionImpl):
    type: Literal[SectionType.GEN_PYTHON_CODE] = SectionType.GEN_PYTHON_CODE
    name: str = "Generated Python Code"


class TerminalSectionImpl(BaseSectionImpl):
    type: Literal[SectionType.TERMINAL] = SectionType.TERMINAL


class IFrameSectionImpl(BaseSectionImpl):
    type: Literal[SectionType.IFRAME] = SectionType.IFRAME


class ChatSectionImpl(BaseSectionImpl):
    type: Literal[SectionType.CHAT] = SectionType.CHAT


class BrowserSectionImpl(BaseSectionImpl):
    type: Literal[SectionType.BROWSER] = SectionType.BROWSER
    hideColumn: bool = False
