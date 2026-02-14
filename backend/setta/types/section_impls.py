from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, Field

from setta.database.utils import create_new_id
from setta.types.artifact import (
    DrawAreaBrushShape,
    DrawAreaLayer,
    DrawAreaMode,
    LineChartSettings,
)
from setta.types.code_obj_impls import ColorPickerChoice
from setta.types.edges import EdgePort
from setta.types.generated.chart_settings_unions import (
    BaseChartSettingsUnionWithDiscriminator,
)
from setta.types.generated.chat_messages import BaseChatMessageUnion
from setta.types.id import ID
from setta.types.prompt import PromptFormat
from setta.utils.generate_memorable_string import generate_memorable_string


class SectionType(str, Enum):
    Callable = "Callable"
    Dict = "Dict"
    ListRoot = "ListRoot"
    Group = "Group"
    Image = "Image"
    Chart = "Chart"
    Draw = "Draw"
    TextBlock = "TextBlock"
    Prompt = "Prompt"
    MetaControl = "MetaControl"
    Social = "Social"
    GlobalVariables = "GlobalVariables"
    Code = "Code"
    GenPythonCode = "GenPythonCode"
    GenPythonMetadata = "GenPythonMetadata"
    Terminal = "Terminal"
    IFrame = "IFrame"
    Chat = "Chat"
    Browser = "Browser"
    Plugin = "Plugin"


class SectionSizeMode(str, Enum):
    auto = "auto"


class SectionSize(BaseModel, extra="forbid"):
    """Explicit width/height constraints that layout-aware tools can override."""

    width: float | Literal[SectionSizeMode.auto] = Field(
        default=SectionSizeMode.auto,
        description="Section width in pixels or 'auto' to defer to layout heuristics.",
    )
    height: float | Literal[SectionSizeMode.auto] = Field(
        default=SectionSizeMode.auto,
        description="Section height in pixels or 'auto' when the layout controls it.",
    )


class CodeLanguage(str, Enum):
    python = "python"
    bash = "bash"
    javascript = "javascript"
    typescript = "typescript"
    json = "json"
    yaml = "yaml"
    markdown = "markdown"
    plaintext = "plaintext"


class ConfigLanguage(str, Enum):
    python = "python"
    json = "json"


class TypeErrorIgnoreState(BaseModel, extra="forbid"):
    callable: bool = False
    params: dict[ID, bool] = Field(default_factory=dict)


class CodeSectionDiagnosticsIgnoreState(BaseModel, extra="forbid"):
    muted: bool = False
    suppressedCodes: list[str | int] = Field(default_factory=list)


class TextBlockDisplayMode(str, Enum):
    Render = "Render"
    Edit = "Edit"


class TextBlockFormat(str, Enum):
    Plaintext = "Plaintext"
    Markdown = "Markdown"


class BrowserAreaViewMode(str, Enum):
    list = "list"
    thumbnail = "thumbnail"
    carousel = "carousel"


class BrowserSearchScope(str, Enum):
    recursive = "recursive"
    local = "local"


class BrowserSavedSearchTypeFilters(BaseModel, extra="forbid"):
    image: bool = True
    video: bool = True
    audio: bool = True
    text: bool = True
    data: bool = True


class BrowserSavedSearch(BaseModel, extra="forbid"):
    id: ID = Field(default_factory=create_new_id)
    name: str = ""
    query: str = ""
    searchScope: BrowserSearchScope = BrowserSearchScope.recursive
    typeFilters: BrowserSavedSearchTypeFilters = Field(
        default_factory=BrowserSavedSearchTypeFilters
    )
    color: str = "#3b82f6"
    quickInfo: str = ""


class BrowserAreaItemType(str, Enum):
    Image = "Image"
    Video = "Video"
    Text = "Text"
    Data = "Data"
    Brushes = "Brushes"
    Other = "Other"


class BrowserAreaItem(BaseModel, extra="forbid"):
    id: str
    type: Any
    lastModified: datetime


class BaseSectionImpl(BaseModel, extra="forbid"):
    type: Any
    id: ID = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
    isFrozen: bool = False
    isInOtherProjectConfigs: bool = False
    tagColor: str | None = None
    styleColor: str | None = None
    size: SectionSize = Field(default_factory=SectionSize)
    aspectRatio: bool | float = False
    aspectRatioExtraHeight: int = 0
    aspectRatioExtraWidth: int = 0
    isMinimized: bool = False
    positionAndSizeLocked: bool = False
    isPreset: bool = False


class BaseSectionWithParamsImpl(BaseSectionImpl):
    codeObjVariantMap: dict[ID, ID] = Field(default_factory=dict)
    hideUnpinnedParams: bool = False
    paramFilter: str = ""
    columnWidth: float | None = None
    configLanguage: ConfigLanguage = ConfigLanguage.python
    pinnedParams: list[ID] = Field(default_factory=list)
    selectedParams: list[ID] = Field(default_factory=list)
    ignoreTypeErrors: TypeErrorIgnoreState = Field(default_factory=TypeErrorIgnoreState)
    edgeInputParams: list[ID] = Field(default_factory=list)
    edgeOutputPorts: list[EdgePort] = Field(default_factory=list)


class BaseCanvasSectionImpl(BaseSectionImpl):
    pass


class BaseParentSectionImpl(BaseSectionImpl):
    children: list[ID] = Field(default_factory=list)


class CodeFileAccessMode(str, Enum):
    read_only = "read_only"
    read_write = "read_write"
    write_only = "write_only"


class CodeFileBinding(BaseModel, extra="forbid"):
    canonical_path: Path
    access_mode: CodeFileAccessMode
    autoBinding: bool = False

    @property
    def snapshot_dir(self) -> Path:
        return self.canonical_path.parent


class BaseCodeSectionImpl(BaseParentSectionImpl):
    code: str = ""
    size: SectionSize = Field(default_factory=lambda: SectionSize(width=500.0))
    codeFileBinding: CodeFileBinding | None = None
    attachedTerminalSectionId: ID | None = None


class BaseDictSectionImpl(BaseSectionWithParamsImpl):
    topLevelParamId: ID | None = None
    isJsonSource: bool = False
    jsonSourceKeys: list[str] = Field(default_factory=list)
    jsonSourceMissing: bool = False


class CallableSectionImpl(BaseSectionWithParamsImpl):
    type: Literal[SectionType.Callable] = SectionType.Callable
    callable: ID | None = None
    hideParams: bool = False


class DictSectionImpl(BaseDictSectionImpl):
    type: Literal[SectionType.Dict] = SectionType.Dict


class ListRootSectionImpl(BaseParentSectionImpl):
    type: Literal[SectionType.ListRoot] = SectionType.ListRoot


class GroupSectionImpl(BaseParentSectionImpl):
    type: Literal[SectionType.Group] = SectionType.Group
    isHorizontalOrientation: bool = False
    overflowMode: bool = False


class ImageSectionImpl(BaseSectionImpl):
    type: Literal[SectionType.Image] = SectionType.Image
    imagePath: str = ""


class ChartSectionImpl(BaseCanvasSectionImpl):
    type: Literal[SectionType.Chart] = SectionType.Chart
    dataPath: str = ""
    chartSettings: BaseChartSettingsUnionWithDiscriminator = Field(
        default_factory=LineChartSettings
    )
    size: SectionSize = Field(
        default_factory=lambda: SectionSize(width=300.0, height=300.0)
    )


class DrawSectionImpl(BaseCanvasSectionImpl):
    type: Literal[SectionType.Draw] = SectionType.Draw
    size: SectionSize = Field(
        default_factory=lambda: SectionSize(width=402.0, height=100.0)
    )
    layers: list[DrawAreaLayer] = Field(default_factory=list)
    renderedImagePath: str | None = None
    activeLayerIdx: int = 0
    brushColor: str = "#ff0000"
    brushSize: int = 16
    brushShape: DrawAreaBrushShape = DrawAreaBrushShape.butt
    brushOpacity: float = 1
    eraserBrushSize: int = 16
    drawThrottleDelay: int = 0
    canvasMode: DrawAreaMode = DrawAreaMode.draw
    colorChoices: list[ColorPickerChoice] = Field(default_factory=list)


class TextBlockSectionImpl(BaseSectionImpl):
    type: Literal[SectionType.TextBlock] = SectionType.TextBlock
    size: SectionSize = Field(default_factory=lambda: SectionSize(width=500.0))
    format: TextBlockFormat = TextBlockFormat.Plaintext
    headingAsSectionName: bool = False
    metaControlStyle: bool = False
    textDisplayMode: TextBlockDisplayMode = TextBlockDisplayMode.Render
    text: str = ""


class PromptSectionImpl(BaseSectionImpl):
    type: Literal[SectionType.Prompt] = SectionType.Prompt
    size: SectionSize = Field(
        default_factory=lambda: SectionSize(width=300, height=150)
    )
    template: str = ""
    format: PromptFormat = PromptFormat.Jinja
    inputs: dict[str, str] = Field(default_factory=dict)
    renderedText: str = ""
    missingVariables: list[str] = Field(default_factory=list)
    renderError: str | None = None


class MetaControlSectionImpl(BaseSectionImpl):
    type: Literal[SectionType.MetaControl] = SectionType.MetaControl
    metaControlParamId: ID | None = None
    codeObjVariantMap: dict[ID, ID] = Field(default_factory=dict)
    showSectionTitle: bool = False


class SocialSectionImpl(BaseSectionImpl):
    type: Literal[SectionType.Social] = SectionType.Social
    url: str = ""


class GlobalVariablesSectionImpl(BaseDictSectionImpl):
    type: Literal[SectionType.GlobalVariables] = SectionType.GlobalVariables


class CodeSectionImpl(BaseCodeSectionImpl):
    type: Literal[SectionType.Code] = SectionType.Code
    codeLanguage: CodeLanguage = CodeLanguage.python
    diagnosticsIgnoreState: CodeSectionDiagnosticsIgnoreState = Field(
        default_factory=CodeSectionDiagnosticsIgnoreState
    )


class GenPythonCodeSectionImpl(BaseCodeSectionImpl):
    type: Literal[SectionType.GenPythonCode] = SectionType.GenPythonCode


class GenPythonMetadataSectionImpl(BaseCodeSectionImpl):
    type: Literal[SectionType.GenPythonMetadata] = SectionType.GenPythonMetadata


class TerminalSectionImpl(BaseSectionImpl):
    type: Literal[SectionType.Terminal] = SectionType.Terminal
    size: SectionSize = Field(
        default_factory=lambda: SectionSize(width=250.0, height=150.0)
    )


class IFrameSectionImpl(BaseSectionImpl):
    type: Literal[SectionType.IFrame] = SectionType.IFrame


class ChatSectionBranch(BaseModel, extra="forbid"):
    messages: list[BaseChatMessageUnion] = Field(default_factory=list)
    createdAt: int = 0
    parentBranchId: ID | None = None
    branchFromMessageId: ID | None = None


class ChatSectionState(BaseModel, extra="forbid"):
    messages: list[BaseChatMessageUnion] = Field(default_factory=list)
    inputText: str = ""
    waitingForResponse: bool = False
    toolCallArguments: dict[str, str] = Field(default_factory=dict)
    activeBranchId: ID | None = None
    branches: dict[ID, ChatSectionBranch] = Field(default_factory=dict)


class ChatSectionImpl(BaseSectionImpl):
    type: Literal[SectionType.Chat] = SectionType.Chat
    size: SectionSize = Field(
        default_factory=lambda: SectionSize(width=400.0, height=200.0)
    )
    managed: bool = False
    engineConfigId: ID | None = None
    agentProfileId: ID | None = None
    chatId: ID | None = None
    thinking: bool = True
    messages: list[BaseChatMessageUnion] = Field(default_factory=list)
    inputText: str = ""
    waitingForResponse: bool = False
    toolCallArguments: dict[str, str] = Field(default_factory=dict)
    activeBranchId: ID | None = None
    branches: dict[ID, ChatSectionBranch] = Field(default_factory=dict)


class BrowserSectionImpl(BaseSectionImpl):
    type: Literal[SectionType.Browser] = SectionType.Browser
    size: SectionSize = Field(
        default_factory=lambda: SectionSize(width=720.0, height=460.0)
    )
    folder: str = ""
    hideColumn: bool = False
    columnWidth: float | None = None
    typesColumnWidth: float | None = None
    viewMode: BrowserAreaViewMode = BrowserAreaViewMode.list
    savedSearches: list[BrowserSavedSearch] = Field(default_factory=list)


class PluginSectionImpl(BaseSectionImpl):
    type: Literal[SectionType.Plugin] = SectionType.Plugin
    pluginId: str = ""
    kind: str = "default"
    data: dict[str, Any] = Field(default_factory=dict)
    schemaVersion: int | None = None
