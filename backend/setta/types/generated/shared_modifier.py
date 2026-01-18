# Auto-generated shared modifier model - DO NOT EDIT MANUALLY
# Generated from section and code obj implementations

from typing import Literal, NotRequired, TypedDict

from setta.types.artifact import (
    DrawAreaBrushShape,
    DrawAreaLayer,
    DrawAreaMode,
    LineChartSettings,
    ScatterChartSettings,
)
from setta.types.chat_messages import (
    AssistantChatMessage,
    SystemChatMessage,
    ToolChatMessage,
    UserChatMessage,
)
from setta.types.code_obj_impls import (
    ButtonActionMode,
    ColorPickerChoice,
    HttpRequestMethod,
    ParameterPassingStyle,
    ParamNameType,
)
from setta.types.edges import EdgePort
from setta.types.id import ID
from setta.types.section_impls import (
    BrowserAreaViewMode,
    CodeFileBinding,
    CodeLanguage,
    ConfigLanguage,
    SectionSize,
    SectionSizeMode,
    SectionWithParamsDisplayMode,
    TextBlockDisplayMode,
    TextBlockFormat,
    TypeErrorIgnoreState,
)


class SharedModifier(TypedDict):
    # Field 'max' present with conflicting annotations: float (RotaryParamCodeObjImpl), int (SliderParamCodeObjImpl)
    # Field 'min' present with conflicting annotations: float (RotaryParamCodeObjImpl), int (SliderParamCodeObjImpl)
    # Field 'step' present with conflicting annotations: float (RotaryParamCodeObjImpl), int (SliderParamCodeObjImpl)
    actionMode: NotRequired[ButtonActionMode]
    activeLayerIdx: NotRequired[int]
    aspectRatio: NotRequired[bool | float]
    aspectRatioExtraHeight: NotRequired[int]
    aspectRatioExtraWidth: NotRequired[int]
    brushColor: NotRequired[str]
    brushOpacity: NotRequired[float]
    brushShape: NotRequired[DrawAreaBrushShape]
    brushSize: NotRequired[int]
    callable: NotRequired[ID | None]
    canvasMode: NotRequired[DrawAreaMode]
    chartSettings: NotRequired[LineChartSettings | ScatterChartSettings]
    chatId: NotRequired[ID | None]
    children: NotRequired[list[ID]]
    choices: NotRequired[list[str]]
    code: NotRequired[str]
    codeFileBinding: NotRequired[CodeFileBinding | None]
    codeLanguage: NotRequired[CodeLanguage]
    codeObjVariantMap: NotRequired[dict[ID, ID]]
    colorChoices: NotRequired[list[ColorPickerChoice]]
    columnWidth: NotRequired[float | None]
    configLanguage: NotRequired[ConfigLanguage]
    coreNameEditable: NotRequired[bool]
    coreNameType: NotRequired[ParamNameType]
    dataPath: NotRequired[str]
    deepThink: NotRequired[bool]
    defaultVal: NotRequired[str]
    description: NotRequired[str]
    displayMode: NotRequired[SectionWithParamsDisplayMode]
    drawThrottleDelay: NotRequired[int]
    edgeInputParams: NotRequired[list[ID]]
    edgeOutputPorts: NotRequired[list[EdgePort]]
    eraserBrushSize: NotRequired[int]
    folder: NotRequired[str]
    format: NotRequired[TextBlockFormat]
    headingAsSectionName: NotRequired[bool]
    hideColumn: NotRequired[bool]
    hideParams: NotRequired[bool]
    hideUnpinnedParams: NotRequired[bool]
    id: NotRequired[ID]
    ignoreTypeErrors: NotRequired[TypeErrorIgnoreState]
    imagePath: NotRequired[str]
    inputText: NotRequired[str]
    isFrozen: NotRequired[bool]
    isHorizontalOrientation: NotRequired[bool]
    isInOtherProjectConfigs: NotRequired[bool]
    isJsonSource: NotRequired[bool]
    isMinimized: NotRequired[bool]
    isPreset: NotRequired[bool]
    jsonSourceKeys: NotRequired[list[str]]
    jsonSourceMissing: NotRequired[bool]
    label: NotRequired[str]
    layers: NotRequired[list[DrawAreaLayer]]
    llmConfigId: NotRequired[str | None]
    managed: NotRequired[bool]
    max: NotRequired[float | int]
    messages: NotRequired[
        list[
            SystemChatMessage | AssistantChatMessage | UserChatMessage | ToolChatMessage
        ]
    ]
    metaControlParamId: NotRequired[ID | None]
    metaControlStyle: NotRequired[bool]
    min: NotRequired[float | int]
    name: NotRequired[str]
    overflowMode: NotRequired[bool]
    paramFilter: NotRequired[str]
    passingStyle: NotRequired[ParameterPassingStyle]
    pinnedAreaHeight: NotRequired[Literal[SectionSizeMode.auto] | float]
    pinnedParams: NotRequired[list[ID]]
    positionAndSizeLocked: NotRequired[bool]
    renderedImagePath: NotRequired[str | None]
    requestBody: NotRequired[str]
    requestHeaderKey: NotRequired[str]
    requestHeaderValue: NotRequired[str]
    requestMethod: NotRequired[HttpRequestMethod]
    requestUrl: NotRequired[str]
    selectedParams: NotRequired[list[ID]]
    showSectionTitle: NotRequired[bool]
    size: NotRequired[SectionSize]
    step: NotRequired[float | int]
    text: NotRequired[str]
    textDisplayMode: NotRequired[TextBlockDisplayMode]
    toolCallArguments: NotRequired[dict[str, str]]
    topLevelParamId: NotRequired[ID | None]
    typesColumnWidth: NotRequired[float | None]
    url: NotRequired[str]
    value: NotRequired[str]
    viewMode: NotRequired[BrowserAreaViewMode]
    waitingForResponse: NotRequired[bool]
