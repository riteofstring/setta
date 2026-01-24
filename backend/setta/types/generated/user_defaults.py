# Auto-generated UserDefault classes - DO NOT EDIT MANUALLY
# Generated from section and code obj implementations

from typing import Literal

from pydantic import BaseModel, Field

# Section type imports
from setta.types.artifact import DrawAreaBrushShape, DrawAreaLayer, DrawAreaMode

# Code object type imports
from setta.types.code_obj_impls import (
    ButtonActionMode,
    ColorPickerChoice,
    HttpRequestMethod,
    ParamNameType,
)
from setta.types.edges import EdgePort
from setta.types.generated.chat_messages import BaseChatMessageUnion
from setta.types.id import ID
from setta.types.section_impls import (
    BrowserAreaViewMode,
    CodeFileBinding,
    CodeLanguage,
    ConfigLanguage,
    SectionSize,
    SectionSizeMode,
    TextBlockDisplayMode,
    TextBlockFormat,
)


class UserDefaultBaseSectionImpl(BaseModel, extra="forbid"):
    isFrozen: bool = False
    size: SectionSize = Field(default_factory=SectionSize)
    aspectRatio: bool | float = False
    isMinimized: bool = False
    positionAndSizeLocked: bool = False


class UserDefaultBaseSectionWithParamsImpl(UserDefaultBaseSectionImpl, extra="forbid"):
    hideUnpinnedParams: bool = False
    paramFilter: str = ""
    columnWidth: float | None = None
    configLanguage: ConfigLanguage = ConfigLanguage.python
    pinnedAreaHeight: float | Literal[SectionSizeMode.auto] = SectionSizeMode.auto
    edgeInputParams: list[ID] = Field(default_factory=list)
    edgeOutputPorts: list[EdgePort] = Field(default_factory=list)


class UserDefaultBaseCanvasSectionImpl(UserDefaultBaseSectionImpl, extra="forbid"):
    pass


class UserDefaultBaseCodeSectionImpl(UserDefaultBaseSectionImpl, extra="forbid"):
    code: str = ""
    size: SectionSize = Field(default_factory=lambda: SectionSize(width=500))
    codeFileBinding: CodeFileBinding | None = None


class UserDefaultBaseParentSectionImpl(UserDefaultBaseSectionImpl, extra="forbid"):
    pass


class UserDefaultBaseDictSectionImpl(
    UserDefaultBaseSectionWithParamsImpl, extra="forbid"
):
    isJsonSource: bool = False
    jsonSourceKeys: list[str] = Field(default_factory=list)


class UserDefaultCallableSectionImpl(
    UserDefaultBaseSectionWithParamsImpl, extra="forbid"
):
    hideParams: bool = False


class UserDefaultDictSectionImpl(UserDefaultBaseDictSectionImpl, extra="forbid"):
    pass


class UserDefaultListRootSectionImpl(UserDefaultBaseParentSectionImpl, extra="forbid"):
    pass


class UserDefaultGroupSectionImpl(UserDefaultBaseParentSectionImpl, extra="forbid"):
    isHorizontalOrientation: bool = False
    overflowMode: bool = False


class UserDefaultImageSectionImpl(UserDefaultBaseSectionImpl, extra="forbid"):
    imagePath: str = ""


class UserDefaultChartSectionImpl(UserDefaultBaseCanvasSectionImpl, extra="forbid"):
    dataPath: str = ""
    size: SectionSize = Field(
        default_factory=lambda: SectionSize(width=400, height=400)
    )


class UserDefaultDrawSectionImpl(UserDefaultBaseCanvasSectionImpl, extra="forbid"):
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


class UserDefaultTextBlockSectionImpl(UserDefaultBaseSectionImpl, extra="forbid"):
    size: SectionSize = Field(
        default_factory=lambda: SectionSize(width=300, height=150)
    )
    format: TextBlockFormat = TextBlockFormat.Plaintext
    headingAsSectionName: bool = False
    metaControlStyle: bool = False
    textDisplayMode: TextBlockDisplayMode = TextBlockDisplayMode.Render
    text: str = ""


class UserDefaultMetaControlSectionImpl(UserDefaultBaseSectionImpl, extra="forbid"):
    showSectionTitle: bool = False


class UserDefaultSocialSectionImpl(UserDefaultBaseSectionImpl, extra="forbid"):
    url: str = ""


class UserDefaultGlobalVariablesSectionImpl(
    UserDefaultBaseDictSectionImpl, extra="forbid"
):
    pass


class UserDefaultCodeSectionImpl(UserDefaultBaseCodeSectionImpl, extra="forbid"):
    codeLanguage: CodeLanguage = CodeLanguage.python


class UserDefaultGenPythonCodeSectionImpl(
    UserDefaultBaseCodeSectionImpl, extra="forbid"
):
    pass


class UserDefaultGenPythonMetadataSectionImpl(
    UserDefaultBaseCodeSectionImpl, extra="forbid"
):
    pass


class UserDefaultTerminalSectionImpl(UserDefaultBaseSectionImpl, extra="forbid"):
    size: SectionSize = Field(
        default_factory=lambda: SectionSize(width=700, height=300)
    )


class UserDefaultIFrameSectionImpl(UserDefaultBaseSectionImpl, extra="forbid"):
    pass


class UserDefaultChatSectionImpl(UserDefaultBaseSectionImpl, extra="forbid"):
    size: SectionSize = Field(
        default_factory=lambda: SectionSize(width=405, height=405)
    )
    managed: bool = False
    llmConfigId: str | None = None
    chatId: ID | None = None
    deepThink: bool = False
    messages: list[BaseChatMessageUnion] = Field(default_factory=list)
    inputText: str = ""
    waitingForResponse: bool = False
    toolCallArguments: dict[str, str] = Field(default_factory=dict)


class UserDefaultBrowserSectionImpl(UserDefaultBaseSectionImpl, extra="forbid"):
    folder: str = ""
    hideColumn: bool = False
    columnWidth: float | None = None
    typesColumnWidth: float | None = None
    viewMode: BrowserAreaViewMode = BrowserAreaViewMode.list


class UserDefaultBaseCodeObjImpl(BaseModel, extra="forbid"):
    pass


class UserDefaultBaseParamCodeObjImpl(UserDefaultBaseCodeObjImpl, extra="forbid"):
    coreNameType: ParamNameType = ParamNameType.TEXT
    coreNameEditable: bool = False


class UserDefaultBaseChildlessCodeObjImpl(
    UserDefaultBaseParamCodeObjImpl, extra="forbid"
):
    defaultVal: str = ""
    value: str = ""


class UserDefaultBaseParentCodeObjImpl(UserDefaultBaseCodeObjImpl, extra="forbid"):
    pass


class UserDefaultCodeCallableCodeObjImpl(
    UserDefaultBaseParentCodeObjImpl, extra="forbid"
):
    pass


class UserDefaultCodeParamCodeObjImpl(
    UserDefaultBaseChildlessCodeObjImpl, extra="forbid"
):
    pass


class UserDefaultTextParamCodeObjImpl(
    UserDefaultBaseChildlessCodeObjImpl, extra="forbid"
):
    pass


class UserDefaultButtonParamCodeObjImpl(
    UserDefaultBaseParamCodeObjImpl, extra="forbid"
):
    label: str = "Trigger"
    actionMode: ButtonActionMode = ButtonActionMode.WEBSOCKET_LISTENER
    requestMethod: HttpRequestMethod = HttpRequestMethod.POST
    requestUrl: str = ""
    requestHeaderKey: str = ""
    requestHeaderValue: str = ""
    requestBody: str = ""


class UserDefaultSliderParamCodeObjImpl(
    UserDefaultBaseChildlessCodeObjImpl, extra="forbid"
):
    min: int = 0
    max: int = 100
    step: int = 1
    value: str = "0"


class UserDefaultRotaryParamCodeObjImpl(
    UserDefaultBaseChildlessCodeObjImpl, extra="forbid"
):
    min: float = 0
    max: float = 1
    step: float = 0.1
    value: str = "0"


class UserDefaultSwitchParamCodeObjImpl(
    UserDefaultBaseChildlessCodeObjImpl, extra="forbid"
):
    value: str = "false"


class UserDefaultColorPickerParamCodeObjImpl(
    UserDefaultBaseChildlessCodeObjImpl, extra="forbid"
):
    colorChoices: list[ColorPickerChoice] = Field(default_factory=list)
    value: str = "#ff0000"


class UserDefaultDropdownParamCodeObjImpl(
    UserDefaultBaseChildlessCodeObjImpl, extra="forbid"
):
    choices: list[str] = Field(default_factory=list)


class UserDefaultPasswordParamCodeObjImpl(
    UserDefaultBaseChildlessCodeObjImpl, extra="forbid"
):
    pass


class UserDefaultTextAreaParamCodeObjImpl(
    UserDefaultBaseChildlessCodeObjImpl, extra="forbid"
):
    pass


class UserDefaultDropzoneParamCodeObjImpl(
    UserDefaultBaseChildlessCodeObjImpl, extra="forbid"
):
    pass


class UserDefaultNestedParamCodeObjImpl(
    UserDefaultBaseParamCodeObjImpl, UserDefaultBaseParentCodeObjImpl, extra="forbid"
):
    pass
