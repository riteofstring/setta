# Auto-generated shared modifier model - DO NOT EDIT MANUALLY
# Generated from section and code obj implementations

from typing import Any, NotRequired, TypedDict

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
    DateCalendarWeekStart,
    DateControlMode,
    DateDisplayFormat,
    DateSelectionMode,
    DropzoneMode,
    HttpRequestMethod,
    ParameterPassingStyle,
    ParamNameType,
    TextParamInputUIType,
    TimeControlMode,
    TimeDisplayFont,
    TimeDisplayFormat,
)
from setta.types.edges import EdgePort
from setta.types.id import ID
from setta.types.prompt import PromptFormat
from setta.types.section_impls import (
    BrowserAreaViewMode,
    BrowserSavedSearch,
    ChatDictationMode,
    ChatPermissionMode,
    ChatSectionBranch,
    CodeFileBinding,
    CodeLanguage,
    CodeSectionDiagnosticsIgnoreState,
    ConfigLanguage,
    ListRootViewMode,
    SectionSize,
    SectionType,
    SpreadsheetGridDensity,
    StateMachineGateType,
    StateMachineGateUiState,
    TaskBoardColumn,
    TaskBoardTask,
    TaskBoardViewMode,
    TextBlockDisplayMode,
    TextBlockFormat,
    TypeErrorIgnoreState,
)


class SharedModifier(TypedDict):
    # Field 'format' present with conflicting annotations: PromptFormat (PromptSectionImpl), TextBlockFormat (TextBlockSectionImpl)
    # Field 'max' present with conflicting annotations: float (RotaryParamCodeObjImpl), int (SliderParamCodeObjImpl)
    # Field 'min' present with conflicting annotations: float (RotaryParamCodeObjImpl), int (SliderParamCodeObjImpl)
    # Field 'step' present with conflicting annotations: float (RotaryParamCodeObjImpl), int (SliderParamCodeObjImpl)
    # Field 'viewMode' present with conflicting annotations: BrowserAreaViewMode (BrowserSectionImpl), ListRootViewMode (ListRootSectionImpl), TaskBoardViewMode (TaskBoardSectionImpl)
    actionMode: NotRequired[ButtonActionMode]
    activeBranchId: NotRequired[ID | None]
    activeLayerIdx: NotRequired[int]
    activeSheet: NotRequired[str | None]
    agentProfileId: NotRequired[ID | None]
    aspectRatio: NotRequired[bool | float]
    aspectRatioExtraHeight: NotRequired[int]
    aspectRatioExtraWidth: NotRequired[int]
    attachedTerminalSectionId: NotRequired[ID | None]
    autoReloadOnExternalChange: NotRequired[bool]
    branches: NotRequired[dict[ID, ChatSectionBranch]]
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
    codeLanguage: NotRequired[CodeLanguage | str]
    codeObjVariantMap: NotRequired[dict[ID, ID]]
    colorChoices: NotRequired[list[ColorPickerChoice]]
    columnWidth: NotRequired[float | None]
    columns: NotRequired[list[TaskBoardColumn]]
    configLanguage: NotRequired[ConfigLanguage]
    coreNameEditable: NotRequired[bool]
    coreNameType: NotRequired[ParamNameType]
    data: NotRequired[dict[str, Any]]
    dataPath: NotRequired[str]
    dateCalendarWeekStart: NotRequired[DateCalendarWeekStart]
    dateControlMode: NotRequired[DateControlMode]
    dateDisplayFormat: NotRequired[DateDisplayFormat]
    dateIncludesTime: NotRequired[bool]
    dateSelectionMode: NotRequired[DateSelectionMode]
    defaultChildSectionType: NotRequired[SectionType]
    defaultVal: NotRequired[str]
    density: NotRequired[SpreadsheetGridDensity]
    description: NotRequired[str]
    diagnosticsIgnoreState: NotRequired[CodeSectionDiagnosticsIgnoreState]
    dictationMode: NotRequired[ChatDictationMode]
    drawThrottleDelay: NotRequired[int]
    edgeInputParams: NotRequired[list[ID]]
    edgeOutputPorts: NotRequired[list[EdgePort]]
    engineConfigId: NotRequired[ID | None]
    eraserBrushSize: NotRequired[int]
    filePath: NotRequired[str]
    folder: NotRequired[str]
    format: NotRequired[PromptFormat | TextBlockFormat]
    gateType: NotRequired[StateMachineGateType]
    hasSecret: NotRequired[bool]
    headingAsSectionName: NotRequired[bool]
    hideColumn: NotRequired[bool]
    hideParams: NotRequired[bool]
    hideUnpinnedParams: NotRequired[bool]
    id: NotRequired[ID]
    ignoreTypeErrors: NotRequired[TypeErrorIgnoreState]
    imagePath: NotRequired[str]
    inputText: NotRequired[str]
    inputs: NotRequired[dict[str, str]]
    isFrozen: NotRequired[bool]
    isHorizontalOrientation: NotRequired[bool]
    isInOtherProjectConfigs: NotRequired[bool]
    isJsonSource: NotRequired[bool]
    isMinimized: NotRequired[bool]
    isPreset: NotRequired[bool]
    jsonSourceKeys: NotRequired[list[str]]
    jsonSourceMissing: NotRequired[bool]
    kind: NotRequired[str]
    label: NotRequired[str]
    layers: NotRequired[list[DrawAreaLayer]]
    machineGroupId: NotRequired[str]
    managed: NotRequired[bool]
    masterFontSizePx: NotRequired[float]
    max: NotRequired[float | int]
    maxAttachments: NotRequired[int | None]
    maxIterations: NotRequired[int | None]
    messages: NotRequired[
        list[
            SystemChatMessage | AssistantChatMessage | UserChatMessage | ToolChatMessage
        ]
    ]
    metaControlParamId: NotRequired[ID | None]
    metaControlStyle: NotRequired[bool]
    min: NotRequired[float | int]
    missingVariables: NotRequired[list[str]]
    mode: NotRequired[DropzoneMode]
    name: NotRequired[str]
    overflowMode: NotRequired[bool]
    paramFilter: NotRequired[str]
    passingStyle: NotRequired[ParameterPassingStyle]
    permissionMode: NotRequired[ChatPermissionMode]
    pinnedParams: NotRequired[list[ID]]
    placeholder: NotRequired[str]
    pluginId: NotRequired[str]
    positionAndSizeLocked: NotRequired[bool]
    readOnly: NotRequired[bool]
    renderError: NotRequired[str | None]
    renderedImagePath: NotRequired[str | None]
    renderedText: NotRequired[str]
    requestBody: NotRequired[str]
    requestHeaderKey: NotRequired[str]
    requestHeaderValue: NotRequired[str]
    requestMethod: NotRequired[HttpRequestMethod]
    requestUrl: NotRequired[str]
    savedSearches: NotRequired[list[BrowserSavedSearch]]
    schemaVersion: NotRequired[int | None]
    searchEnabled: NotRequired[bool]
    selectedParams: NotRequired[list[ID]]
    showRowNumbers: NotRequired[bool]
    showSectionTitle: NotRequired[bool]
    size: NotRequired[SectionSize]
    step: NotRequired[float | int]
    styleColor: NotRequired[str | None]
    tagColor: NotRequired[str | None]
    tasks: NotRequired[list[TaskBoardTask]]
    template: NotRequired[str]
    text: NotRequired[str]
    textDisplayMode: NotRequired[TextBlockDisplayMode]
    thinking: NotRequired[bool]
    timeControlMode: NotRequired[TimeControlMode]
    timeDisplayFont: NotRequired[TimeDisplayFont]
    timeDisplayFormat: NotRequired[TimeDisplayFormat]
    timeDisplayScale: NotRequired[float]
    timeDisplayTransparent: NotRequired[bool]
    toolCallArguments: NotRequired[dict[str, str]]
    topLevelParamId: NotRequired[ID | None]
    transcriptionProfileId: NotRequired[ID | None]
    typeAnnotation: NotRequired[str]
    typesColumnWidth: NotRequired[float | None]
    ui: NotRequired[StateMachineGateUiState]
    uiType: NotRequired[TextParamInputUIType]
    url: NotRequired[str]
    value: NotRequired[str]
    viewMode: NotRequired[BrowserAreaViewMode | ListRootViewMode | TaskBoardViewMode]
    waitingForResponse: NotRequired[bool]
