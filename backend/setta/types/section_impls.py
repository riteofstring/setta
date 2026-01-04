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
from setta.types.generated.chart_settings_unions import (
    BaseChartSettingsUnionWithDiscriminator,
)
from setta.types.id import ID
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
    MetaControl = "MetaControl"
    Social = "Social"
    GlobalVariables = "GlobalVariables"
    Code = "Code"
    GenPythonCode = "GenPythonCode"
    Terminal = "Terminal"
    IFrame = "IFrame"
    Chat = "Chat"
    Browser = "Browser"


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


class ConfigLanguage(str, Enum):
    python = "python"
    json = "json"


class SectionWithParamsDisplayMode(str, Enum):
    Gui = "Gui"
    Yaml = "Yaml"


class TypeErrorIgnoreState(BaseModel, extra="forbid"):
    callable: bool = False
    params: dict[ID, bool] = Field(default_factory=dict)


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
    pinnedAreaHeight: float | Literal[SectionSizeMode.auto] = SectionSizeMode.auto
    selectedParams: list[ID] = Field(default_factory=list)
    ignoreTypeErrors: TypeErrorIgnoreState = Field(default_factory=TypeErrorIgnoreState)
    displayMode: SectionWithParamsDisplayMode = SectionWithParamsDisplayMode.Gui


class BaseCanvasSectionImpl(BaseSectionImpl):
    renderedValue: str | None = None


class CodeFileAccessMode(str, Enum):
    read_only = "read_only"
    read_write = "read_write"
    write_only = "write_only"


class CodeFileBinding(BaseModel, extra="forbid"):
    canonical_path: Path
    access_mode: CodeFileAccessMode

    @property
    def snapshot_dir(self) -> Path:
        return self.canonical_path.parent


class BaseCodeSectionImpl(BaseSectionImpl):
    code: str = ""
    size: SectionSize = Field(default_factory=lambda: SectionSize(width=500))
    codeFileBinding: CodeFileBinding | None = None


class BaseParentSectionImpl(BaseSectionImpl):
    children: list[ID] = Field(default_factory=list)


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
        default_factory=lambda: SectionSize(width=400, height=400)
    )


class DrawSectionImpl(BaseCanvasSectionImpl):
    type: Literal[SectionType.Draw] = SectionType.Draw
    layers: list[DrawAreaLayer] = Field(default_factory=list)
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
    size: SectionSize = Field(
        default_factory=lambda: SectionSize(width=300, height=150)
    )
    format: TextBlockFormat = TextBlockFormat.Plaintext
    headingAsSectionName: bool = False
    metaControlStyle: bool = False
    textDisplayMode: TextBlockDisplayMode = TextBlockDisplayMode.Render
    text: str = ""


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


class GenPythonCodeSectionImpl(BaseCodeSectionImpl):
    type: Literal[SectionType.GenPythonCode] = SectionType.GenPythonCode


class TerminalSectionImpl(BaseSectionImpl):
    type: Literal[SectionType.Terminal] = SectionType.Terminal
    size: SectionSize = Field(
        default_factory=lambda: SectionSize(width=700, height=300)
    )


class IFrameSectionImpl(BaseSectionImpl):
    type: Literal[SectionType.IFrame] = SectionType.IFrame


class ChatSectionImpl(BaseSectionImpl):
    type: Literal[SectionType.Chat] = SectionType.Chat
    size: SectionSize = Field(
        default_factory=lambda: SectionSize(width=405, height=405)
    )


class BrowserSectionImpl(BaseSectionImpl):
    type: Literal[SectionType.Browser] = SectionType.Browser
    folder: str = ""
    hideColumn: bool = False
    columnWidth: float | None = None
    typesColumnWidth: float | None = None
    viewMode: BrowserAreaViewMode = BrowserAreaViewMode.list
