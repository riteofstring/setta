from typing import Any, Callable, Literal, NotRequired, TypedDict

from setta.types.agentic_edges import AgenticEdge
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
    CodeObjType,
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
from setta.types.edges import Edge, EdgePort
from setta.types.generated.shared_modifier import SharedModifier
from setta.types.id import ID
from setta.types.project_config import (
    ProjectCodegenPluginTarget,
    ProjectCodegenPythonTarget,
    TopLevelSectionLayout,
    ViewModeConfig,
    Viewport,
    WatchCodeFolder,
    WatchCodeRegistryEntry,
)
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
    PromptFormat,
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
from setta.types.state_machine_edges import StateMachineEdge


class CoreArgs(TypedDict):
    id: NotRequired[ID]
    name: NotRequired[str]
    displayName: NotRequired[str]
    variants: NotRequired[list[ID]]
    defaultVariant: NotRequired[ID | None]
    sharedModifier: NotRequired[SharedModifier]
    unsharedKeys: NotRequired[
        list[
            Literal[
                "actionMode",
                "activeBranchId",
                "activeLayerIdx",
                "activeSheet",
                "agentProfileId",
                "aspectRatio",
                "aspectRatioExtraHeight",
                "aspectRatioExtraWidth",
                "attachedTerminalSectionId",
                "autoReloadOnExternalChange",
                "branches",
                "brushColor",
                "brushOpacity",
                "brushShape",
                "brushSize",
                "callable",
                "canvasMode",
                "chartSettings",
                "chatId",
                "children",
                "choices",
                "code",
                "codeFileBinding",
                "codeLanguage",
                "codeObjVariantMap",
                "colorChoices",
                "columnWidth",
                "columns",
                "configLanguage",
                "coreNameEditable",
                "coreNameType",
                "data",
                "dataPath",
                "dateCalendarWeekStart",
                "dateControlMode",
                "dateDisplayFormat",
                "dateIncludesTime",
                "dateSelectionMode",
                "defaultChildSectionType",
                "defaultVal",
                "density",
                "description",
                "diagnosticsIgnoreState",
                "dictationMode",
                "drawThrottleDelay",
                "edgeInputParams",
                "edgeOutputPorts",
                "engineConfigId",
                "eraserBrushSize",
                "filePath",
                "folder",
                "format",
                "gateType",
                "hasSecret",
                "headingAsSectionName",
                "hideColumn",
                "hideParams",
                "hideUnpinnedParams",
                "id",
                "ignoreTypeErrors",
                "imagePath",
                "inputText",
                "inputs",
                "isFrozen",
                "isHorizontalOrientation",
                "isInOtherProjectConfigs",
                "isJsonSource",
                "isMinimized",
                "isPreset",
                "jsonSourceKeys",
                "jsonSourceMissing",
                "kind",
                "label",
                "layers",
                "machineGroupId",
                "managed",
                "masterFontSizePx",
                "max",
                "maxAttachments",
                "messages",
                "metaControlParamId",
                "metaControlStyle",
                "min",
                "missingVariables",
                "mode",
                "name",
                "overflowMode",
                "paramFilter",
                "passingStyle",
                "permissionMode",
                "pinnedParams",
                "placeholder",
                "pluginId",
                "positionAndSizeLocked",
                "readOnly",
                "renderError",
                "renderedImagePath",
                "renderedText",
                "requestBody",
                "requestHeaderKey",
                "requestHeaderValue",
                "requestMethod",
                "requestUrl",
                "savedSearches",
                "schemaVersion",
                "searchEnabled",
                "selectedParams",
                "showRowNumbers",
                "showSectionTitle",
                "size",
                "step",
                "styleColor",
                "tagColor",
                "tasks",
                "template",
                "text",
                "textDisplayMode",
                "thinking",
                "timeControlMode",
                "timeDisplayFont",
                "timeDisplayFormat",
                "timeDisplayScale",
                "timeDisplayTransparent",
                "toolCallArguments",
                "topLevelParamId",
                "transcriptionProfileId",
                "type",
                "typeAnnotation",
                "typesColumnWidth",
                "ui",
                "uiType",
                "url",
                "value",
                "viewMode",
                "waitingForResponse",
            ]
        ]
    ]


class ProjectConfigArgs(TypedDict):
    id: NotRequired[ID]
    name: NotRequired[str]
    showParamDisplayNames: NotRequired[bool]
    allowJsonSourceKeyEdits: NotRequired[bool]
    previewImgColor: NotRequired[str]
    viewport: NotRequired[Viewport | None]
    viewportInitialized: NotRequired[bool]
    viewModes: NotRequired[dict[ID, ViewModeConfig]]
    activeViewModeId: NotRequired[ID | None]
    isEditingViewMode: NotRequired[bool]
    codegenTargets: NotRequired[
        list[ProjectCodegenPythonTarget | ProjectCodegenPluginTarget]
    ]
    entryCodeBlockId: NotRequired[ID | None]
    topLevelSections: NotRequired[dict[ID, TopLevelSectionLayout]]
    sectionVariantMap: NotRequired[dict[ID, ID]]
    activeIds: NotRequired[list[ID]]
    edges: NotRequired[list[Edge]]
    agenticEdges: NotRequired[list[AgenticEdge]]
    stateMachineEdges: NotRequired[list[StateMachineEdge]]
    watchCodeEnabled: NotRequired[bool]
    watchCodeFolders: NotRequired[list[WatchCodeFolder]]
    watchCodeFiles: NotRequired[list[str]]
    watchCodeRegistry: NotRequired[dict[str, WatchCodeRegistryEntry]]
    watchCodeBaselineByPath: NotRequired[dict[str, list[str]]]


class BaseSectionImplArgs(TypedDict):
    type: NotRequired[Any]
    id: NotRequired[ID]
    name: NotRequired[str]
    isFrozen: NotRequired[bool]
    isInOtherProjectConfigs: NotRequired[bool]
    tagColor: NotRequired[str | None]
    styleColor: NotRequired[str | None]
    size: NotRequired[SectionSize]
    aspectRatio: NotRequired[bool | float]
    aspectRatioExtraHeight: NotRequired[int]
    aspectRatioExtraWidth: NotRequired[int]
    isMinimized: NotRequired[bool]
    positionAndSizeLocked: NotRequired[bool]
    isPreset: NotRequired[bool]


class BaseSectionImplArgsWithCallable(TypedDict):
    type: NotRequired[Any | Callable[[Any], Any]]
    id: NotRequired[ID | Callable[[ID], ID]]
    name: NotRequired[str | Callable[[str], str]]
    isFrozen: NotRequired[bool | Callable[[bool], bool]]
    isInOtherProjectConfigs: NotRequired[bool | Callable[[bool], bool]]
    tagColor: NotRequired[str | None | Callable[[str | None], str | None]]
    styleColor: NotRequired[str | None | Callable[[str | None], str | None]]
    size: NotRequired[SectionSize | Callable[[SectionSize], SectionSize]]
    aspectRatio: NotRequired[bool | float | Callable[[bool | float], bool | float]]
    aspectRatioExtraHeight: NotRequired[int | Callable[[int], int]]
    aspectRatioExtraWidth: NotRequired[int | Callable[[int], int]]
    isMinimized: NotRequired[bool | Callable[[bool], bool]]
    positionAndSizeLocked: NotRequired[bool | Callable[[bool], bool]]
    isPreset: NotRequired[bool | Callable[[bool], bool]]


class BaseSectionWithParamsImplArgs(BaseSectionImplArgs):
    type: NotRequired[Any]
    codeObjVariantMap: NotRequired[dict[ID, ID]]
    hideUnpinnedParams: NotRequired[bool]
    paramFilter: NotRequired[str]
    columnWidth: NotRequired[float | None]
    configLanguage: NotRequired[ConfigLanguage]
    pinnedParams: NotRequired[list[ID]]
    selectedParams: NotRequired[list[ID]]
    ignoreTypeErrors: NotRequired[TypeErrorIgnoreState]
    edgeInputParams: NotRequired[list[ID]]
    edgeOutputPorts: NotRequired[list[EdgePort]]


class BaseSectionWithParamsImplArgsWithCallable(BaseSectionImplArgsWithCallable):
    type: NotRequired[Any | Callable[[Any], Any]]
    codeObjVariantMap: NotRequired[
        dict[ID, ID] | Callable[[dict[ID, ID]], dict[ID, ID]]
    ]
    hideUnpinnedParams: NotRequired[bool | Callable[[bool], bool]]
    paramFilter: NotRequired[str | Callable[[str], str]]
    columnWidth: NotRequired[float | None | Callable[[float | None], float | None]]
    configLanguage: NotRequired[
        ConfigLanguage | Callable[[ConfigLanguage], ConfigLanguage]
    ]
    pinnedParams: NotRequired[list[ID] | Callable[[list[ID]], list[ID]]]
    selectedParams: NotRequired[list[ID] | Callable[[list[ID]], list[ID]]]
    ignoreTypeErrors: NotRequired[
        TypeErrorIgnoreState | Callable[[TypeErrorIgnoreState], TypeErrorIgnoreState]
    ]
    edgeInputParams: NotRequired[list[ID] | Callable[[list[ID]], list[ID]]]
    edgeOutputPorts: NotRequired[
        list[EdgePort] | Callable[[list[EdgePort]], list[EdgePort]]
    ]


class BaseCanvasSectionImplArgs(BaseSectionImplArgs):
    type: NotRequired[Any]


class BaseCanvasSectionImplArgsWithCallable(BaseSectionImplArgsWithCallable):
    type: NotRequired[Any | Callable[[Any], Any]]


class BaseParentSectionImplArgs(BaseSectionImplArgs):
    type: NotRequired[Any]
    children: NotRequired[list[ID]]


class BaseParentSectionImplArgsWithCallable(BaseSectionImplArgsWithCallable):
    type: NotRequired[Any | Callable[[Any], Any]]
    children: NotRequired[list[ID] | Callable[[list[ID]], list[ID]]]


class BaseCodeSectionImplArgs(BaseParentSectionImplArgs):
    type: NotRequired[Any]
    code: NotRequired[str]
    codeFileBinding: NotRequired[CodeFileBinding | None]
    attachedTerminalSectionId: NotRequired[ID | None]


class BaseCodeSectionImplArgsWithCallable(BaseParentSectionImplArgsWithCallable):
    type: NotRequired[Any | Callable[[Any], Any]]
    code: NotRequired[str | Callable[[str], str]]
    codeFileBinding: NotRequired[
        CodeFileBinding
        | None
        | Callable[[CodeFileBinding | None], CodeFileBinding | None]
    ]
    attachedTerminalSectionId: NotRequired[ID | None | Callable[[ID | None], ID | None]]


class BaseDictSectionImplArgs(BaseSectionWithParamsImplArgs):
    type: NotRequired[Any]
    topLevelParamId: NotRequired[ID | None]
    isJsonSource: NotRequired[bool]
    jsonSourceKeys: NotRequired[list[str]]
    jsonSourceMissing: NotRequired[bool]


class BaseDictSectionImplArgsWithCallable(BaseSectionWithParamsImplArgsWithCallable):
    type: NotRequired[Any | Callable[[Any], Any]]
    topLevelParamId: NotRequired[ID | None | Callable[[ID | None], ID | None]]
    isJsonSource: NotRequired[bool | Callable[[bool], bool]]
    jsonSourceKeys: NotRequired[list[str] | Callable[[list[str]], list[str]]]
    jsonSourceMissing: NotRequired[bool | Callable[[bool], bool]]


class CallableSectionImplArgs(BaseSectionWithParamsImplArgs):
    type: NotRequired[Literal[SectionType.Callable]]
    callable: NotRequired[ID | None]
    hideParams: NotRequired[bool]


class CallableSectionImplArgsWithCallable(BaseSectionWithParamsImplArgsWithCallable):
    type: NotRequired[
        Literal[SectionType.Callable]
        | Callable[[Literal[SectionType.Callable]], Literal[SectionType.Callable]]
    ]
    callable: NotRequired[ID | None | Callable[[ID | None], ID | None]]
    hideParams: NotRequired[bool | Callable[[bool], bool]]


class DictSectionImplArgs(BaseDictSectionImplArgs):
    type: NotRequired[Literal[SectionType.Dict]]


class DictSectionImplArgsWithCallable(BaseDictSectionImplArgsWithCallable):
    type: NotRequired[
        Literal[SectionType.Dict]
        | Callable[[Literal[SectionType.Dict]], Literal[SectionType.Dict]]
    ]


class ListRootSectionImplArgs(BaseParentSectionImplArgs):
    type: NotRequired[Literal[SectionType.ListRoot]]
    defaultChildSectionType: NotRequired[SectionType]
    viewMode: NotRequired[ListRootViewMode]


class ListRootSectionImplArgsWithCallable(BaseParentSectionImplArgsWithCallable):
    type: NotRequired[
        Literal[SectionType.ListRoot]
        | Callable[[Literal[SectionType.ListRoot]], Literal[SectionType.ListRoot]]
    ]
    defaultChildSectionType: NotRequired[
        SectionType | Callable[[SectionType], SectionType]
    ]
    viewMode: NotRequired[
        ListRootViewMode | Callable[[ListRootViewMode], ListRootViewMode]
    ]


class GroupSectionImplArgs(BaseParentSectionImplArgs):
    type: NotRequired[Literal[SectionType.Group]]
    isHorizontalOrientation: NotRequired[bool]
    overflowMode: NotRequired[bool]
    defaultChildSectionType: NotRequired[SectionType]


class GroupSectionImplArgsWithCallable(BaseParentSectionImplArgsWithCallable):
    type: NotRequired[
        Literal[SectionType.Group]
        | Callable[[Literal[SectionType.Group]], Literal[SectionType.Group]]
    ]
    isHorizontalOrientation: NotRequired[bool | Callable[[bool], bool]]
    overflowMode: NotRequired[bool | Callable[[bool], bool]]
    defaultChildSectionType: NotRequired[
        SectionType | Callable[[SectionType], SectionType]
    ]


class StateMachineStartSectionImplArgs(BaseSectionImplArgs):
    type: NotRequired[Literal[SectionType.StateMachineStart]]
    machineGroupId: NotRequired[str]
    label: NotRequired[str]


class StateMachineStartSectionImplArgsWithCallable(BaseSectionImplArgsWithCallable):
    type: NotRequired[
        Literal[SectionType.StateMachineStart]
        | Callable[
            [Literal[SectionType.StateMachineStart]],
            Literal[SectionType.StateMachineStart],
        ]
    ]
    machineGroupId: NotRequired[str | Callable[[str], str]]
    label: NotRequired[str | Callable[[str], str]]


class StateMachineGateSectionImplArgs(BaseSectionImplArgs):
    type: NotRequired[Literal[SectionType.StateMachineGate]]
    machineGroupId: NotRequired[str]
    gateType: NotRequired[StateMachineGateType]
    label: NotRequired[str]
    ui: NotRequired[StateMachineGateUiState]


class StateMachineGateSectionImplArgsWithCallable(BaseSectionImplArgsWithCallable):
    type: NotRequired[
        Literal[SectionType.StateMachineGate]
        | Callable[
            [Literal[SectionType.StateMachineGate]],
            Literal[SectionType.StateMachineGate],
        ]
    ]
    machineGroupId: NotRequired[str | Callable[[str], str]]
    gateType: NotRequired[
        StateMachineGateType | Callable[[StateMachineGateType], StateMachineGateType]
    ]
    label: NotRequired[str | Callable[[str], str]]
    ui: NotRequired[
        StateMachineGateUiState
        | Callable[[StateMachineGateUiState], StateMachineGateUiState]
    ]


class StateMachineEndSectionImplArgs(BaseSectionImplArgs):
    type: NotRequired[Literal[SectionType.StateMachineEnd]]
    machineGroupId: NotRequired[str]
    label: NotRequired[str]


class StateMachineEndSectionImplArgsWithCallable(BaseSectionImplArgsWithCallable):
    type: NotRequired[
        Literal[SectionType.StateMachineEnd]
        | Callable[
            [Literal[SectionType.StateMachineEnd]], Literal[SectionType.StateMachineEnd]
        ]
    ]
    machineGroupId: NotRequired[str | Callable[[str], str]]
    label: NotRequired[str | Callable[[str], str]]


class ImageSectionImplArgs(BaseSectionImplArgs):
    type: NotRequired[Literal[SectionType.Image]]
    imagePath: NotRequired[str]


class ImageSectionImplArgsWithCallable(BaseSectionImplArgsWithCallable):
    type: NotRequired[
        Literal[SectionType.Image]
        | Callable[[Literal[SectionType.Image]], Literal[SectionType.Image]]
    ]
    imagePath: NotRequired[str | Callable[[str], str]]


class ChartSectionImplArgs(BaseCanvasSectionImplArgs):
    type: NotRequired[Literal[SectionType.Chart]]
    dataPath: NotRequired[str]
    chartSettings: NotRequired[LineChartSettings | ScatterChartSettings]


class ChartSectionImplArgsWithCallable(BaseCanvasSectionImplArgsWithCallable):
    type: NotRequired[
        Literal[SectionType.Chart]
        | Callable[[Literal[SectionType.Chart]], Literal[SectionType.Chart]]
    ]
    dataPath: NotRequired[str | Callable[[str], str]]
    chartSettings: NotRequired[
        LineChartSettings
        | ScatterChartSettings
        | Callable[
            [LineChartSettings | ScatterChartSettings],
            LineChartSettings | ScatterChartSettings,
        ]
    ]


class DrawSectionImplArgs(BaseCanvasSectionImplArgs):
    type: NotRequired[Literal[SectionType.Draw]]
    layers: NotRequired[list[DrawAreaLayer]]
    renderedImagePath: NotRequired[str | None]
    activeLayerIdx: NotRequired[int]
    brushColor: NotRequired[str]
    brushSize: NotRequired[int]
    brushShape: NotRequired[DrawAreaBrushShape]
    brushOpacity: NotRequired[float]
    eraserBrushSize: NotRequired[int]
    drawThrottleDelay: NotRequired[int]
    canvasMode: NotRequired[DrawAreaMode]
    colorChoices: NotRequired[list[ColorPickerChoice]]


class DrawSectionImplArgsWithCallable(BaseCanvasSectionImplArgsWithCallable):
    type: NotRequired[
        Literal[SectionType.Draw]
        | Callable[[Literal[SectionType.Draw]], Literal[SectionType.Draw]]
    ]
    layers: NotRequired[
        list[DrawAreaLayer] | Callable[[list[DrawAreaLayer]], list[DrawAreaLayer]]
    ]
    renderedImagePath: NotRequired[str | None | Callable[[str | None], str | None]]
    activeLayerIdx: NotRequired[int | Callable[[int], int]]
    brushColor: NotRequired[str | Callable[[str], str]]
    brushSize: NotRequired[int | Callable[[int], int]]
    brushShape: NotRequired[
        DrawAreaBrushShape | Callable[[DrawAreaBrushShape], DrawAreaBrushShape]
    ]
    brushOpacity: NotRequired[float | Callable[[float], float]]
    eraserBrushSize: NotRequired[int | Callable[[int], int]]
    drawThrottleDelay: NotRequired[int | Callable[[int], int]]
    canvasMode: NotRequired[DrawAreaMode | Callable[[DrawAreaMode], DrawAreaMode]]
    colorChoices: NotRequired[
        list[ColorPickerChoice]
        | Callable[[list[ColorPickerChoice]], list[ColorPickerChoice]]
    ]


class TextBlockSectionImplArgs(BaseSectionImplArgs):
    type: NotRequired[Literal[SectionType.TextBlock]]
    format: NotRequired[TextBlockFormat]
    masterFontSizePx: NotRequired[float]
    headingAsSectionName: NotRequired[bool]
    metaControlStyle: NotRequired[bool]
    textDisplayMode: NotRequired[TextBlockDisplayMode]
    text: NotRequired[str]


class TextBlockSectionImplArgsWithCallable(BaseSectionImplArgsWithCallable):
    type: NotRequired[
        Literal[SectionType.TextBlock]
        | Callable[[Literal[SectionType.TextBlock]], Literal[SectionType.TextBlock]]
    ]
    format: NotRequired[TextBlockFormat | Callable[[TextBlockFormat], TextBlockFormat]]
    masterFontSizePx: NotRequired[float | Callable[[float], float]]
    headingAsSectionName: NotRequired[bool | Callable[[bool], bool]]
    metaControlStyle: NotRequired[bool | Callable[[bool], bool]]
    textDisplayMode: NotRequired[
        TextBlockDisplayMode | Callable[[TextBlockDisplayMode], TextBlockDisplayMode]
    ]
    text: NotRequired[str | Callable[[str], str]]


class PromptSectionImplArgs(BaseSectionImplArgs):
    type: NotRequired[Literal[SectionType.Prompt]]
    template: NotRequired[str]
    format: NotRequired[PromptFormat]
    inputs: NotRequired[dict[str, str]]
    renderedText: NotRequired[str]
    missingVariables: NotRequired[list[str]]
    renderError: NotRequired[str | None]


class PromptSectionImplArgsWithCallable(BaseSectionImplArgsWithCallable):
    type: NotRequired[
        Literal[SectionType.Prompt]
        | Callable[[Literal[SectionType.Prompt]], Literal[SectionType.Prompt]]
    ]
    template: NotRequired[str | Callable[[str], str]]
    format: NotRequired[PromptFormat | Callable[[PromptFormat], PromptFormat]]
    inputs: NotRequired[dict[str, str] | Callable[[dict[str, str]], dict[str, str]]]
    renderedText: NotRequired[str | Callable[[str], str]]
    missingVariables: NotRequired[list[str] | Callable[[list[str]], list[str]]]
    renderError: NotRequired[str | None | Callable[[str | None], str | None]]


class MetaControlSectionImplArgs(BaseSectionImplArgs):
    type: NotRequired[Literal[SectionType.MetaControl]]
    metaControlParamId: NotRequired[ID | None]
    codeObjVariantMap: NotRequired[dict[ID, ID]]
    showSectionTitle: NotRequired[bool]


class MetaControlSectionImplArgsWithCallable(BaseSectionImplArgsWithCallable):
    type: NotRequired[
        Literal[SectionType.MetaControl]
        | Callable[[Literal[SectionType.MetaControl]], Literal[SectionType.MetaControl]]
    ]
    metaControlParamId: NotRequired[ID | None | Callable[[ID | None], ID | None]]
    codeObjVariantMap: NotRequired[
        dict[ID, ID] | Callable[[dict[ID, ID]], dict[ID, ID]]
    ]
    showSectionTitle: NotRequired[bool | Callable[[bool], bool]]


class SocialSectionImplArgs(BaseSectionImplArgs):
    type: NotRequired[Literal[SectionType.Social]]
    url: NotRequired[str]


class SocialSectionImplArgsWithCallable(BaseSectionImplArgsWithCallable):
    type: NotRequired[
        Literal[SectionType.Social]
        | Callable[[Literal[SectionType.Social]], Literal[SectionType.Social]]
    ]
    url: NotRequired[str | Callable[[str], str]]


class GlobalVariablesSectionImplArgs(BaseDictSectionImplArgs):
    type: NotRequired[Literal[SectionType.GlobalVariables]]


class GlobalVariablesSectionImplArgsWithCallable(BaseDictSectionImplArgsWithCallable):
    type: NotRequired[
        Literal[SectionType.GlobalVariables]
        | Callable[
            [Literal[SectionType.GlobalVariables]], Literal[SectionType.GlobalVariables]
        ]
    ]


class CodeSectionImplArgs(BaseCodeSectionImplArgs):
    type: NotRequired[Literal[SectionType.Code]]
    codeLanguage: NotRequired[CodeLanguage | str]
    diagnosticsIgnoreState: NotRequired[CodeSectionDiagnosticsIgnoreState]


class CodeSectionImplArgsWithCallable(BaseCodeSectionImplArgsWithCallable):
    type: NotRequired[
        Literal[SectionType.Code]
        | Callable[[Literal[SectionType.Code]], Literal[SectionType.Code]]
    ]
    codeLanguage: NotRequired[
        CodeLanguage | str | Callable[[CodeLanguage | str], CodeLanguage | str]
    ]
    diagnosticsIgnoreState: NotRequired[
        CodeSectionDiagnosticsIgnoreState
        | Callable[
            [CodeSectionDiagnosticsIgnoreState], CodeSectionDiagnosticsIgnoreState
        ]
    ]


class GenPythonCodeSectionImplArgs(BaseCodeSectionImplArgs):
    type: NotRequired[Literal[SectionType.GenPythonCode]]


class GenPythonCodeSectionImplArgsWithCallable(BaseCodeSectionImplArgsWithCallable):
    type: NotRequired[
        Literal[SectionType.GenPythonCode]
        | Callable[
            [Literal[SectionType.GenPythonCode]], Literal[SectionType.GenPythonCode]
        ]
    ]


class GenPythonMetadataSectionImplArgs(BaseCodeSectionImplArgs):
    type: NotRequired[Literal[SectionType.GenPythonMetadata]]


class GenPythonMetadataSectionImplArgsWithCallable(BaseCodeSectionImplArgsWithCallable):
    type: NotRequired[
        Literal[SectionType.GenPythonMetadata]
        | Callable[
            [Literal[SectionType.GenPythonMetadata]],
            Literal[SectionType.GenPythonMetadata],
        ]
    ]


class TerminalSectionImplArgs(BaseSectionImplArgs):
    type: NotRequired[Literal[SectionType.Terminal]]


class TerminalSectionImplArgsWithCallable(BaseSectionImplArgsWithCallable):
    type: NotRequired[
        Literal[SectionType.Terminal]
        | Callable[[Literal[SectionType.Terminal]], Literal[SectionType.Terminal]]
    ]


class IFrameSectionImplArgs(BaseSectionImplArgs):
    type: NotRequired[Literal[SectionType.IFrame]]


class IFrameSectionImplArgsWithCallable(BaseSectionImplArgsWithCallable):
    type: NotRequired[
        Literal[SectionType.IFrame]
        | Callable[[Literal[SectionType.IFrame]], Literal[SectionType.IFrame]]
    ]


class ChatSectionImplArgs(BaseSectionImplArgs):
    type: NotRequired[Literal[SectionType.Chat]]
    managed: NotRequired[bool]
    engineConfigId: NotRequired[ID | None]
    transcriptionProfileId: NotRequired[ID | None]
    agentProfileId: NotRequired[ID | None]
    chatId: NotRequired[ID | None]
    thinking: NotRequired[bool]
    permissionMode: NotRequired[ChatPermissionMode]
    searchEnabled: NotRequired[bool]
    dictationMode: NotRequired[ChatDictationMode]
    messages: NotRequired[
        list[
            SystemChatMessage | AssistantChatMessage | UserChatMessage | ToolChatMessage
        ]
    ]
    inputText: NotRequired[str]
    waitingForResponse: NotRequired[bool]
    toolCallArguments: NotRequired[dict[str, str]]
    activeBranchId: NotRequired[ID | None]
    branches: NotRequired[dict[ID, ChatSectionBranch]]


class ChatSectionImplArgsWithCallable(BaseSectionImplArgsWithCallable):
    type: NotRequired[
        Literal[SectionType.Chat]
        | Callable[[Literal[SectionType.Chat]], Literal[SectionType.Chat]]
    ]
    managed: NotRequired[bool | Callable[[bool], bool]]
    engineConfigId: NotRequired[ID | None | Callable[[ID | None], ID | None]]
    transcriptionProfileId: NotRequired[ID | None | Callable[[ID | None], ID | None]]
    agentProfileId: NotRequired[ID | None | Callable[[ID | None], ID | None]]
    chatId: NotRequired[ID | None | Callable[[ID | None], ID | None]]
    thinking: NotRequired[bool | Callable[[bool], bool]]
    permissionMode: NotRequired[
        ChatPermissionMode | Callable[[ChatPermissionMode], ChatPermissionMode]
    ]
    searchEnabled: NotRequired[bool | Callable[[bool], bool]]
    dictationMode: NotRequired[
        ChatDictationMode | Callable[[ChatDictationMode], ChatDictationMode]
    ]
    messages: NotRequired[
        list[
            SystemChatMessage | AssistantChatMessage | UserChatMessage | ToolChatMessage
        ]
        | Callable[
            [
                list[
                    SystemChatMessage
                    | AssistantChatMessage
                    | UserChatMessage
                    | ToolChatMessage
                ]
            ],
            list[
                SystemChatMessage
                | AssistantChatMessage
                | UserChatMessage
                | ToolChatMessage
            ],
        ]
    ]
    inputText: NotRequired[str | Callable[[str], str]]
    waitingForResponse: NotRequired[bool | Callable[[bool], bool]]
    toolCallArguments: NotRequired[
        dict[str, str] | Callable[[dict[str, str]], dict[str, str]]
    ]
    activeBranchId: NotRequired[ID | None | Callable[[ID | None], ID | None]]
    branches: NotRequired[
        dict[ID, ChatSectionBranch]
        | Callable[[dict[ID, ChatSectionBranch]], dict[ID, ChatSectionBranch]]
    ]


class BrowserSectionImplArgs(BaseSectionImplArgs):
    type: NotRequired[Literal[SectionType.Browser]]
    folder: NotRequired[str]
    hideColumn: NotRequired[bool]
    columnWidth: NotRequired[float | None]
    typesColumnWidth: NotRequired[float | None]
    viewMode: NotRequired[BrowserAreaViewMode]
    savedSearches: NotRequired[list[BrowserSavedSearch]]


class BrowserSectionImplArgsWithCallable(BaseSectionImplArgsWithCallable):
    type: NotRequired[
        Literal[SectionType.Browser]
        | Callable[[Literal[SectionType.Browser]], Literal[SectionType.Browser]]
    ]
    folder: NotRequired[str | Callable[[str], str]]
    hideColumn: NotRequired[bool | Callable[[bool], bool]]
    columnWidth: NotRequired[float | None | Callable[[float | None], float | None]]
    typesColumnWidth: NotRequired[float | None | Callable[[float | None], float | None]]
    viewMode: NotRequired[
        BrowserAreaViewMode | Callable[[BrowserAreaViewMode], BrowserAreaViewMode]
    ]
    savedSearches: NotRequired[
        list[BrowserSavedSearch]
        | Callable[[list[BrowserSavedSearch]], list[BrowserSavedSearch]]
    ]


class PluginSectionImplArgs(BaseSectionImplArgs):
    type: NotRequired[Literal[SectionType.Plugin]]
    pluginId: NotRequired[str]
    kind: NotRequired[str]
    data: NotRequired[dict[str, Any]]
    schemaVersion: NotRequired[int | None]


class PluginSectionImplArgsWithCallable(BaseSectionImplArgsWithCallable):
    type: NotRequired[
        Literal[SectionType.Plugin]
        | Callable[[Literal[SectionType.Plugin]], Literal[SectionType.Plugin]]
    ]
    pluginId: NotRequired[str | Callable[[str], str]]
    kind: NotRequired[str | Callable[[str], str]]
    data: NotRequired[dict[str, Any] | Callable[[dict[str, Any]], dict[str, Any]]]
    schemaVersion: NotRequired[int | None | Callable[[int | None], int | None]]


class TaskBoardSectionImplArgs(BaseSectionImplArgs):
    type: NotRequired[Literal[SectionType.TaskBoard]]
    viewMode: NotRequired[TaskBoardViewMode]
    columns: NotRequired[list[TaskBoardColumn]]
    tasks: NotRequired[list[TaskBoardTask]]


class TaskBoardSectionImplArgsWithCallable(BaseSectionImplArgsWithCallable):
    type: NotRequired[
        Literal[SectionType.TaskBoard]
        | Callable[[Literal[SectionType.TaskBoard]], Literal[SectionType.TaskBoard]]
    ]
    viewMode: NotRequired[
        TaskBoardViewMode | Callable[[TaskBoardViewMode], TaskBoardViewMode]
    ]
    columns: NotRequired[
        list[TaskBoardColumn] | Callable[[list[TaskBoardColumn]], list[TaskBoardColumn]]
    ]
    tasks: NotRequired[
        list[TaskBoardTask] | Callable[[list[TaskBoardTask]], list[TaskBoardTask]]
    ]


class SpreadsheetSectionImplArgs(BaseSectionImplArgs):
    type: NotRequired[Literal[SectionType.Spreadsheet]]
    filePath: NotRequired[str]
    activeSheet: NotRequired[str | None]
    readOnly: NotRequired[bool]
    showRowNumbers: NotRequired[bool]
    density: NotRequired[SpreadsheetGridDensity]
    autoReloadOnExternalChange: NotRequired[bool]


class SpreadsheetSectionImplArgsWithCallable(BaseSectionImplArgsWithCallable):
    type: NotRequired[
        Literal[SectionType.Spreadsheet]
        | Callable[[Literal[SectionType.Spreadsheet]], Literal[SectionType.Spreadsheet]]
    ]
    filePath: NotRequired[str | Callable[[str], str]]
    activeSheet: NotRequired[str | None | Callable[[str | None], str | None]]
    readOnly: NotRequired[bool | Callable[[bool], bool]]
    showRowNumbers: NotRequired[bool | Callable[[bool], bool]]
    density: NotRequired[
        SpreadsheetGridDensity
        | Callable[[SpreadsheetGridDensity], SpreadsheetGridDensity]
    ]
    autoReloadOnExternalChange: NotRequired[bool | Callable[[bool], bool]]


class BaseCodeObjImplArgs(TypedDict):
    type: NotRequired[Any]
    id: NotRequired[ID]
    name: NotRequired[str]
    description: NotRequired[str]
    isPreset: NotRequired[bool]


class BaseCodeObjImplArgsWithCallable(TypedDict):
    type: NotRequired[Any | Callable[[Any], Any]]
    id: NotRequired[ID | Callable[[ID], ID]]
    name: NotRequired[str | Callable[[str], str]]
    description: NotRequired[str | Callable[[str], str]]
    isPreset: NotRequired[bool | Callable[[bool], bool]]


class BaseParamCodeObjImplArgs(BaseCodeObjImplArgs):
    type: NotRequired[Any]
    coreNameType: NotRequired[ParamNameType]
    coreNameEditable: NotRequired[bool]
    passingStyle: NotRequired[ParameterPassingStyle]
    typeAnnotation: NotRequired[str]


class BaseParamCodeObjImplArgsWithCallable(BaseCodeObjImplArgsWithCallable):
    type: NotRequired[Any | Callable[[Any], Any]]
    coreNameType: NotRequired[ParamNameType | Callable[[ParamNameType], ParamNameType]]
    coreNameEditable: NotRequired[bool | Callable[[bool], bool]]
    passingStyle: NotRequired[
        ParameterPassingStyle | Callable[[ParameterPassingStyle], ParameterPassingStyle]
    ]
    typeAnnotation: NotRequired[str | Callable[[str], str]]


class BaseChildlessCodeObjImplArgs(BaseParamCodeObjImplArgs):
    type: NotRequired[Any]
    defaultVal: NotRequired[str]
    value: NotRequired[str]


class BaseChildlessCodeObjImplArgsWithCallable(BaseParamCodeObjImplArgsWithCallable):
    type: NotRequired[Any | Callable[[Any], Any]]
    defaultVal: NotRequired[str | Callable[[str], str]]
    value: NotRequired[str | Callable[[str], str]]


class BaseParentCodeObjImplArgs(BaseCodeObjImplArgs):
    type: NotRequired[Any]
    children: NotRequired[list[ID]]


class BaseParentCodeObjImplArgsWithCallable(BaseCodeObjImplArgsWithCallable):
    type: NotRequired[Any | Callable[[Any], Any]]
    children: NotRequired[list[ID] | Callable[[list[ID]], list[ID]]]


class CodeCallableCodeObjImplArgs(BaseParentCodeObjImplArgs):
    type: NotRequired[Literal[CodeObjType.CodeCallable]]


class CodeCallableCodeObjImplArgsWithCallable(BaseParentCodeObjImplArgsWithCallable):
    type: NotRequired[
        Literal[CodeObjType.CodeCallable]
        | Callable[
            [Literal[CodeObjType.CodeCallable]], Literal[CodeObjType.CodeCallable]
        ]
    ]


class CodeParamCodeObjImplArgs(BaseChildlessCodeObjImplArgs):
    type: NotRequired[Literal[CodeObjType.CodeParam]]


class CodeParamCodeObjImplArgsWithCallable(BaseChildlessCodeObjImplArgsWithCallable):
    type: NotRequired[
        Literal[CodeObjType.CodeParam]
        | Callable[[Literal[CodeObjType.CodeParam]], Literal[CodeObjType.CodeParam]]
    ]


class TextParamCodeObjImplArgs(BaseChildlessCodeObjImplArgs):
    type: NotRequired[Literal[CodeObjType.TextParam]]
    uiType: NotRequired[TextParamInputUIType]


class TextParamCodeObjImplArgsWithCallable(BaseChildlessCodeObjImplArgsWithCallable):
    type: NotRequired[
        Literal[CodeObjType.TextParam]
        | Callable[[Literal[CodeObjType.TextParam]], Literal[CodeObjType.TextParam]]
    ]
    uiType: NotRequired[
        TextParamInputUIType | Callable[[TextParamInputUIType], TextParamInputUIType]
    ]


class DateParamCodeObjImplArgs(BaseChildlessCodeObjImplArgs):
    type: NotRequired[Literal[CodeObjType.DateParam]]
    dateDisplayFormat: NotRequired[DateDisplayFormat]
    dateControlMode: NotRequired[DateControlMode]
    dateSelectionMode: NotRequired[DateSelectionMode]
    dateCalendarWeekStart: NotRequired[DateCalendarWeekStart]
    dateIncludesTime: NotRequired[bool]


class DateParamCodeObjImplArgsWithCallable(BaseChildlessCodeObjImplArgsWithCallable):
    type: NotRequired[
        Literal[CodeObjType.DateParam]
        | Callable[[Literal[CodeObjType.DateParam]], Literal[CodeObjType.DateParam]]
    ]
    dateDisplayFormat: NotRequired[
        DateDisplayFormat | Callable[[DateDisplayFormat], DateDisplayFormat]
    ]
    dateControlMode: NotRequired[
        DateControlMode | Callable[[DateControlMode], DateControlMode]
    ]
    dateSelectionMode: NotRequired[
        DateSelectionMode | Callable[[DateSelectionMode], DateSelectionMode]
    ]
    dateCalendarWeekStart: NotRequired[
        DateCalendarWeekStart | Callable[[DateCalendarWeekStart], DateCalendarWeekStart]
    ]
    dateIncludesTime: NotRequired[bool | Callable[[bool], bool]]


class TimeParamCodeObjImplArgs(BaseChildlessCodeObjImplArgs):
    type: NotRequired[Literal[CodeObjType.TimeParam]]
    timeControlMode: NotRequired[TimeControlMode]
    timeDisplayFormat: NotRequired[TimeDisplayFormat]
    timeDisplayTransparent: NotRequired[bool]
    timeDisplayScale: NotRequired[float]
    timeDisplayFont: NotRequired[TimeDisplayFont]


class TimeParamCodeObjImplArgsWithCallable(BaseChildlessCodeObjImplArgsWithCallable):
    type: NotRequired[
        Literal[CodeObjType.TimeParam]
        | Callable[[Literal[CodeObjType.TimeParam]], Literal[CodeObjType.TimeParam]]
    ]
    timeControlMode: NotRequired[
        TimeControlMode | Callable[[TimeControlMode], TimeControlMode]
    ]
    timeDisplayFormat: NotRequired[
        TimeDisplayFormat | Callable[[TimeDisplayFormat], TimeDisplayFormat]
    ]
    timeDisplayTransparent: NotRequired[bool | Callable[[bool], bool]]
    timeDisplayScale: NotRequired[float | Callable[[float], float]]
    timeDisplayFont: NotRequired[
        TimeDisplayFont | Callable[[TimeDisplayFont], TimeDisplayFont]
    ]


class ButtonParamCodeObjImplArgs(BaseParamCodeObjImplArgs):
    type: NotRequired[Literal[CodeObjType.ButtonParam]]
    label: NotRequired[str]
    actionMode: NotRequired[ButtonActionMode]
    requestMethod: NotRequired[HttpRequestMethod]
    requestUrl: NotRequired[str]
    requestHeaderKey: NotRequired[str]
    requestHeaderValue: NotRequired[str]
    requestBody: NotRequired[str]


class ButtonParamCodeObjImplArgsWithCallable(BaseParamCodeObjImplArgsWithCallable):
    type: NotRequired[
        Literal[CodeObjType.ButtonParam]
        | Callable[[Literal[CodeObjType.ButtonParam]], Literal[CodeObjType.ButtonParam]]
    ]
    label: NotRequired[str | Callable[[str], str]]
    actionMode: NotRequired[
        ButtonActionMode | Callable[[ButtonActionMode], ButtonActionMode]
    ]
    requestMethod: NotRequired[
        HttpRequestMethod | Callable[[HttpRequestMethod], HttpRequestMethod]
    ]
    requestUrl: NotRequired[str | Callable[[str], str]]
    requestHeaderKey: NotRequired[str | Callable[[str], str]]
    requestHeaderValue: NotRequired[str | Callable[[str], str]]
    requestBody: NotRequired[str | Callable[[str], str]]


class SliderParamCodeObjImplArgs(BaseChildlessCodeObjImplArgs):
    type: NotRequired[Literal[CodeObjType.SliderParam]]
    min: NotRequired[int]
    max: NotRequired[int]
    step: NotRequired[int]


class SliderParamCodeObjImplArgsWithCallable(BaseChildlessCodeObjImplArgsWithCallable):
    type: NotRequired[
        Literal[CodeObjType.SliderParam]
        | Callable[[Literal[CodeObjType.SliderParam]], Literal[CodeObjType.SliderParam]]
    ]
    min: NotRequired[int | Callable[[int], int]]
    max: NotRequired[int | Callable[[int], int]]
    step: NotRequired[int | Callable[[int], int]]


class RotaryParamCodeObjImplArgs(BaseChildlessCodeObjImplArgs):
    type: NotRequired[Literal[CodeObjType.RotaryParam]]
    min: NotRequired[float]
    max: NotRequired[float]
    step: NotRequired[float]


class RotaryParamCodeObjImplArgsWithCallable(BaseChildlessCodeObjImplArgsWithCallable):
    type: NotRequired[
        Literal[CodeObjType.RotaryParam]
        | Callable[[Literal[CodeObjType.RotaryParam]], Literal[CodeObjType.RotaryParam]]
    ]
    min: NotRequired[float | Callable[[float], float]]
    max: NotRequired[float | Callable[[float], float]]
    step: NotRequired[float | Callable[[float], float]]


class SwitchParamCodeObjImplArgs(BaseChildlessCodeObjImplArgs):
    type: NotRequired[Literal[CodeObjType.SwitchParam]]


class SwitchParamCodeObjImplArgsWithCallable(BaseChildlessCodeObjImplArgsWithCallable):
    type: NotRequired[
        Literal[CodeObjType.SwitchParam]
        | Callable[[Literal[CodeObjType.SwitchParam]], Literal[CodeObjType.SwitchParam]]
    ]


class ColorPickerParamCodeObjImplArgs(BaseChildlessCodeObjImplArgs):
    type: NotRequired[Literal[CodeObjType.ColorPickerParam]]
    colorChoices: NotRequired[list[ColorPickerChoice]]


class ColorPickerParamCodeObjImplArgsWithCallable(
    BaseChildlessCodeObjImplArgsWithCallable
):
    type: NotRequired[
        Literal[CodeObjType.ColorPickerParam]
        | Callable[
            [Literal[CodeObjType.ColorPickerParam]],
            Literal[CodeObjType.ColorPickerParam],
        ]
    ]
    colorChoices: NotRequired[
        list[ColorPickerChoice]
        | Callable[[list[ColorPickerChoice]], list[ColorPickerChoice]]
    ]


class DropdownParamCodeObjImplArgs(BaseChildlessCodeObjImplArgs):
    type: NotRequired[Literal[CodeObjType.DropdownParam]]
    choices: NotRequired[list[str]]


class DropdownParamCodeObjImplArgsWithCallable(
    BaseChildlessCodeObjImplArgsWithCallable
):
    type: NotRequired[
        Literal[CodeObjType.DropdownParam]
        | Callable[
            [Literal[CodeObjType.DropdownParam]], Literal[CodeObjType.DropdownParam]
        ]
    ]
    choices: NotRequired[list[str] | Callable[[list[str]], list[str]]]


class PasswordParamCodeObjImplArgs(BaseChildlessCodeObjImplArgs):
    type: NotRequired[Literal[CodeObjType.PasswordParam]]
    hasSecret: NotRequired[bool]


class PasswordParamCodeObjImplArgsWithCallable(
    BaseChildlessCodeObjImplArgsWithCallable
):
    type: NotRequired[
        Literal[CodeObjType.PasswordParam]
        | Callable[
            [Literal[CodeObjType.PasswordParam]], Literal[CodeObjType.PasswordParam]
        ]
    ]
    hasSecret: NotRequired[bool | Callable[[bool], bool]]


class TextAreaParamCodeObjImplArgs(BaseChildlessCodeObjImplArgs):
    type: NotRequired[Literal[CodeObjType.TextAreaParam]]


class TextAreaParamCodeObjImplArgsWithCallable(
    BaseChildlessCodeObjImplArgsWithCallable
):
    type: NotRequired[
        Literal[CodeObjType.TextAreaParam]
        | Callable[
            [Literal[CodeObjType.TextAreaParam]], Literal[CodeObjType.TextAreaParam]
        ]
    ]


class DropzoneParamCodeObjImplArgs(BaseChildlessCodeObjImplArgs):
    type: NotRequired[Literal[CodeObjType.DropzoneParam]]
    mode: NotRequired[DropzoneMode]
    maxAttachments: NotRequired[int | None]
    placeholder: NotRequired[str]


class DropzoneParamCodeObjImplArgsWithCallable(
    BaseChildlessCodeObjImplArgsWithCallable
):
    type: NotRequired[
        Literal[CodeObjType.DropzoneParam]
        | Callable[
            [Literal[CodeObjType.DropzoneParam]], Literal[CodeObjType.DropzoneParam]
        ]
    ]
    mode: NotRequired[DropzoneMode | Callable[[DropzoneMode], DropzoneMode]]
    maxAttachments: NotRequired[int | None | Callable[[int | None], int | None]]
    placeholder: NotRequired[str | Callable[[str], str]]


class NestedParamCodeObjImplArgs(BaseParamCodeObjImplArgs, BaseParentCodeObjImplArgs):
    type: NotRequired[Literal[CodeObjType.NestedParam]]


class NestedParamCodeObjImplArgsWithCallable(
    BaseParamCodeObjImplArgsWithCallable, BaseParentCodeObjImplArgsWithCallable
):
    type: NotRequired[
        Literal[CodeObjType.NestedParam]
        | Callable[[Literal[CodeObjType.NestedParam]], Literal[CodeObjType.NestedParam]]
    ]
