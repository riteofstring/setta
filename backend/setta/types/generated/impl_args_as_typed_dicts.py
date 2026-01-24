from typing import Any, Callable, Literal, NotRequired, TypedDict

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
    HttpRequestMethod,
    ParameterPassingStyle,
    ParamNameType,
)
from setta.types.edges import Edge, EdgePort
from setta.types.generated.shared_modifier import SharedModifier
from setta.types.id import ID
from setta.types.project_config import (
    TopLevelSectionLayout,
    ViewModeConfig,
    Viewport,
)
from setta.types.section_impls import (
    BrowserAreaViewMode,
    CodeFileBinding,
    CodeLanguage,
    ConfigLanguage,
    PromptFormat,
    SectionSize,
    SectionSizeMode,
    SectionType,
    SectionWithParamsDisplayMode,
    TextBlockDisplayMode,
    TextBlockFormat,
    TypeErrorIgnoreState,
)


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
                "activeLayerIdx",
                "agentProfileId",
                "aspectRatio",
                "aspectRatioExtraHeight",
                "aspectRatioExtraWidth",
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
                "configLanguage",
                "coreNameEditable",
                "coreNameType",
                "dataPath",
                "deepThink",
                "defaultVal",
                "description",
                "displayMode",
                "drawThrottleDelay",
                "edgeInputParams",
                "edgeOutputPorts",
                "engineConfigId",
                "eraserBrushSize",
                "folder",
                "format",
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
                "label",
                "layers",
                "managed",
                "max",
                "messages",
                "metaControlParamId",
                "metaControlStyle",
                "min",
                "missingVariables",
                "name",
                "overflowMode",
                "paramFilter",
                "passingStyle",
                "pinnedAreaHeight",
                "pinnedParams",
                "positionAndSizeLocked",
                "renderError",
                "renderedText",
                "renderedValue",
                "requestBody",
                "requestHeaderKey",
                "requestHeaderValue",
                "requestMethod",
                "requestUrl",
                "selectedParams",
                "showSectionTitle",
                "size",
                "step",
                "template",
                "text",
                "textDisplayMode",
                "toolCallArguments",
                "topLevelParamId",
                "type",
                "typesColumnWidth",
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
    previewImgColor: NotRequired[str]
    viewport: NotRequired[Viewport | None]
    viewModes: NotRequired[dict[ID, ViewModeConfig]]
    activeViewModeId: NotRequired[ID | None]
    isEditingViewMode: NotRequired[bool]
    genCodePrefix: NotRequired[str]
    genCodeSuffix: NotRequired[str]
    entryCodeBlockId: NotRequired[ID | None]
    topLevelSections: NotRequired[dict[ID, TopLevelSectionLayout]]
    sectionVariantMap: NotRequired[dict[ID, ID]]
    activeIds: NotRequired[list[ID]]
    edges: NotRequired[list[Edge]]


class BaseSectionImplArgs(TypedDict):
    type: NotRequired[Any]
    id: NotRequired[ID]
    name: NotRequired[str]
    isFrozen: NotRequired[bool]
    isInOtherProjectConfigs: NotRequired[bool]
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
    pinnedAreaHeight: NotRequired[float | Literal[SectionSizeMode.auto]]
    selectedParams: NotRequired[list[ID]]
    ignoreTypeErrors: NotRequired[TypeErrorIgnoreState]
    displayMode: NotRequired[SectionWithParamsDisplayMode]
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
    pinnedAreaHeight: NotRequired[
        float
        | Literal[SectionSizeMode.auto]
        | Callable[
            [float | Literal[SectionSizeMode.auto]],
            float | Literal[SectionSizeMode.auto],
        ]
    ]
    selectedParams: NotRequired[list[ID] | Callable[[list[ID]], list[ID]]]
    ignoreTypeErrors: NotRequired[
        TypeErrorIgnoreState | Callable[[TypeErrorIgnoreState], TypeErrorIgnoreState]
    ]
    displayMode: NotRequired[
        SectionWithParamsDisplayMode
        | Callable[[SectionWithParamsDisplayMode], SectionWithParamsDisplayMode]
    ]
    edgeInputParams: NotRequired[list[ID] | Callable[[list[ID]], list[ID]]]
    edgeOutputPorts: NotRequired[
        list[EdgePort] | Callable[[list[EdgePort]], list[EdgePort]]
    ]


class BaseCanvasSectionImplArgs(BaseSectionImplArgs):
    type: NotRequired[Any]
    renderedValue: NotRequired[str | None]


class BaseCanvasSectionImplArgsWithCallable(BaseSectionImplArgsWithCallable):
    type: NotRequired[Any | Callable[[Any], Any]]
    renderedValue: NotRequired[str | None | Callable[[str | None], str | None]]


class BaseCodeSectionImplArgs(BaseSectionImplArgs):
    type: NotRequired[Any]
    code: NotRequired[str]
    codeFileBinding: NotRequired[CodeFileBinding | None]


class BaseCodeSectionImplArgsWithCallable(BaseSectionImplArgsWithCallable):
    type: NotRequired[Any | Callable[[Any], Any]]
    code: NotRequired[str | Callable[[str], str]]
    codeFileBinding: NotRequired[
        CodeFileBinding
        | None
        | Callable[[CodeFileBinding | None], CodeFileBinding | None]
    ]


class BaseParentSectionImplArgs(BaseSectionImplArgs):
    type: NotRequired[Any]
    children: NotRequired[list[ID]]


class BaseParentSectionImplArgsWithCallable(BaseSectionImplArgsWithCallable):
    type: NotRequired[Any | Callable[[Any], Any]]
    children: NotRequired[list[ID] | Callable[[list[ID]], list[ID]]]


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


class ListRootSectionImplArgsWithCallable(BaseParentSectionImplArgsWithCallable):
    type: NotRequired[
        Literal[SectionType.ListRoot]
        | Callable[[Literal[SectionType.ListRoot]], Literal[SectionType.ListRoot]]
    ]


class GroupSectionImplArgs(BaseParentSectionImplArgs):
    type: NotRequired[Literal[SectionType.Group]]
    isHorizontalOrientation: NotRequired[bool]
    overflowMode: NotRequired[bool]


class GroupSectionImplArgsWithCallable(BaseParentSectionImplArgsWithCallable):
    type: NotRequired[
        Literal[SectionType.Group]
        | Callable[[Literal[SectionType.Group]], Literal[SectionType.Group]]
    ]
    isHorizontalOrientation: NotRequired[bool | Callable[[bool], bool]]
    overflowMode: NotRequired[bool | Callable[[bool], bool]]


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
    codeLanguage: NotRequired[CodeLanguage]


class CodeSectionImplArgsWithCallable(BaseCodeSectionImplArgsWithCallable):
    type: NotRequired[
        Literal[SectionType.Code]
        | Callable[[Literal[SectionType.Code]], Literal[SectionType.Code]]
    ]
    codeLanguage: NotRequired[CodeLanguage | Callable[[CodeLanguage], CodeLanguage]]


class GenPythonCodeSectionImplArgs(BaseCodeSectionImplArgs):
    type: NotRequired[Literal[SectionType.GenPythonCode]]


class GenPythonCodeSectionImplArgsWithCallable(BaseCodeSectionImplArgsWithCallable):
    type: NotRequired[
        Literal[SectionType.GenPythonCode]
        | Callable[
            [Literal[SectionType.GenPythonCode]], Literal[SectionType.GenPythonCode]
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
    agentProfileId: NotRequired[ID | None]
    chatId: NotRequired[ID | None]
    deepThink: NotRequired[bool]
    messages: NotRequired[
        list[
            SystemChatMessage | AssistantChatMessage | UserChatMessage | ToolChatMessage
        ]
    ]
    inputText: NotRequired[str]
    waitingForResponse: NotRequired[bool]
    toolCallArguments: NotRequired[dict[str, str]]


class ChatSectionImplArgsWithCallable(BaseSectionImplArgsWithCallable):
    type: NotRequired[
        Literal[SectionType.Chat]
        | Callable[[Literal[SectionType.Chat]], Literal[SectionType.Chat]]
    ]
    managed: NotRequired[bool | Callable[[bool], bool]]
    engineConfigId: NotRequired[ID | None | Callable[[ID | None], ID | None]]
    agentProfileId: NotRequired[ID | None | Callable[[ID | None], ID | None]]
    chatId: NotRequired[ID | None | Callable[[ID | None], ID | None]]
    deepThink: NotRequired[bool | Callable[[bool], bool]]
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


class BrowserSectionImplArgs(BaseSectionImplArgs):
    type: NotRequired[Literal[SectionType.Browser]]
    folder: NotRequired[str]
    hideColumn: NotRequired[bool]
    columnWidth: NotRequired[float | None]
    typesColumnWidth: NotRequired[float | None]
    viewMode: NotRequired[BrowserAreaViewMode]


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


class BaseParamCodeObjImplArgsWithCallable(BaseCodeObjImplArgsWithCallable):
    type: NotRequired[Any | Callable[[Any], Any]]
    coreNameType: NotRequired[ParamNameType | Callable[[ParamNameType], ParamNameType]]
    coreNameEditable: NotRequired[bool | Callable[[bool], bool]]
    passingStyle: NotRequired[
        ParameterPassingStyle | Callable[[ParameterPassingStyle], ParameterPassingStyle]
    ]


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


class TextParamCodeObjImplArgsWithCallable(BaseChildlessCodeObjImplArgsWithCallable):
    type: NotRequired[
        Literal[CodeObjType.TextParam]
        | Callable[[Literal[CodeObjType.TextParam]], Literal[CodeObjType.TextParam]]
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


class PasswordParamCodeObjImplArgsWithCallable(
    BaseChildlessCodeObjImplArgsWithCallable
):
    type: NotRequired[
        Literal[CodeObjType.PasswordParam]
        | Callable[
            [Literal[CodeObjType.PasswordParam]], Literal[CodeObjType.PasswordParam]
        ]
    ]


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


class DropzoneParamCodeObjImplArgsWithCallable(
    BaseChildlessCodeObjImplArgsWithCallable
):
    type: NotRequired[
        Literal[CodeObjType.DropzoneParam]
        | Callable[
            [Literal[CodeObjType.DropzoneParam]], Literal[CodeObjType.DropzoneParam]
        ]
    ]


class NestedParamCodeObjImplArgs(BaseParamCodeObjImplArgs, BaseParentCodeObjImplArgs):
    type: NotRequired[Literal[CodeObjType.NestedParam]]


class NestedParamCodeObjImplArgsWithCallable(
    BaseParamCodeObjImplArgsWithCallable, BaseParentCodeObjImplArgsWithCallable
):
    type: NotRequired[
        Literal[CodeObjType.NestedParam]
        | Callable[[Literal[CodeObjType.NestedParam]], Literal[CodeObjType.NestedParam]]
    ]
