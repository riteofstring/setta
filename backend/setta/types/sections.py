from enum import Enum
from typing import Any, Literal, Union

from pydantic import (
    BaseModel,
    Field,
)

from setta.database.utils import create_new_id
from setta.types.section_impl_modifiers import SectionImplModifier
from setta.utils.generate_memorable_string import generate_memorable_string


class SectionType(str, Enum):
    Callable = "Callable"
    Dict = "Dict"
    ListRoot = "ListRoot"
    DictRoot = "DictRoot"
    Group = "Group"
    Image = "Image"
    Chart = "Chart"
    Draw = "Draw"
    TextBlock = "TextBlock"
    Social = "Social"
    GlobalVariables = "GlobalVariables"
    Code = "Code"
    GenPythonCode = "GenPythonCode"
    Terminal = "Terminal"
    IFrame = "IFrame"
    Chat = "Chat"
    Browser = "Browser"


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
    implLayerings: list[str] = Field(default_factory=list)
    defaultImplLayering: str | None = None


class SectionImplLayering(BaseModel):
    id: str = Field(default_factory=create_new_id)
    impl: str
    modifiers: list[SectionImplModifier] = Field(default_factory=list)


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
    codeObjImplLayeringMap: dict[str, str] = Field(default_factory=dict)
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
    topLevelParamIds: list[str] = Field(default_factory=list)


class CallableSectionImpl(BaseSectionWithParamsImpl):
    type: Literal[SectionType.Callable] = SectionType.Callable
    callable: str | None = None


class DictSectionImpl(BaseDictSectionImpl):
    type: Literal[SectionType.Dict] = SectionType.Dict
    isJsonSource: bool = False
    jsonSourceKeys: list[str] = Field(default_factory=list)
    jsonSourceMissing: bool = False


class ListRootSectionImpl(BaseParentSectionImpl):
    type: Literal[SectionType.ListRoot] = SectionType.ListRoot


class DictRootSectionImpl(BaseParentSectionImpl):
    type: Literal[SectionType.DictRoot] = SectionType.DictRoot


class GroupSectionImpl(BaseParentSectionImpl):
    type: Literal[SectionType.Group] = SectionType.Group
    isHorizontalOrientation: bool = False


class ImageSectionImpl(BaseArtifactSectionImpl):
    type: Literal[SectionType.Image] = SectionType.Image


class ChartSectionImpl(BaseArtifactSectionImpl, BaseCanvasSectionImpl):
    type: Literal[SectionType.Chart] = SectionType.Chart
    chartSettings: ChartSettings = Field(default_factory=ChartSettings)


class DrawSectionImpl(BaseArtifactSectionImpl, BaseCanvasSectionImpl):
    type: Literal[SectionType.Draw] = SectionType.Draw
    canvasSettings: DrawAreaCanvasSettings = Field(
        default_factory=DrawAreaCanvasSettings
    )


class TextBlockSectionImpl(BaseSectionImpl):
    type: Literal[SectionType.TextBlock] = SectionType.TextBlock
    renderMarkdown: bool = False
    headingAsSectionName: bool = False
    displayMode: str = "GUI"
    description: str = ""


class SocialSectionImpl(BaseSectionImpl):
    type: Literal[SectionType.Social] = SectionType.Social
    social: str = ""


class GlobalVariablesSectionImpl(BaseDictSectionImpl):
    type: Literal[SectionType.GlobalVariables] = SectionType.GlobalVariables
    name: str = "Global Variables"


class CodeSectionImpl(BaseCodeSectionImpl):
    type: Literal[SectionType.Code] = SectionType.Code
    codeLanguage: CodeLanguage = CodeLanguage.python


class GenPythonCodeSectionImpl(BaseCodeSectionImpl):
    type: Literal[SectionType.GenPythonCode] = SectionType.GenPythonCode
    name: str = "Generated Python Code"


class TerminalSectionImpl(BaseSectionImpl):
    type: Literal[SectionType.Terminal] = SectionType.Terminal


class IFrameSectionImpl(BaseSectionImpl):
    type: Literal[SectionType.IFrame] = SectionType.IFrame


class ChatSectionImpl(BaseSectionImpl):
    type: Literal[SectionType.Chat] = SectionType.Chat


class BrowserSectionImpl(BaseSectionImpl):
    type: Literal[SectionType.Browser] = SectionType.Browser
    hideColumn: bool = False
