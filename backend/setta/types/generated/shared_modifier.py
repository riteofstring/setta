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
from setta.types.code_obj_impls import (
    ColorPickerChoice,
    ParameterPassingStyle,
    ParamNameType,
)
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
)


class SharedModifier(TypedDict):
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
    defaultVal: NotRequired[str]
    description: NotRequired[str]
    displayMode: NotRequired[SectionWithParamsDisplayMode]
    drawThrottleDelay: NotRequired[int]
    eraserBrushSize: NotRequired[int]
    folder: NotRequired[str]
    format: NotRequired[TextBlockFormat]
    headingAsSectionName: NotRequired[bool]
    hideColumn: NotRequired[bool]
    hideParams: NotRequired[bool]
    hideUnpinnedParams: NotRequired[bool]
    id: NotRequired[ID]
    ignoreTypeErrors: NotRequired[dict[ID, bool]]
    imagePath: NotRequired[str]
    isFrozen: NotRequired[bool]
    isHorizontalOrientation: NotRequired[bool]
    isInOtherProjectConfigs: NotRequired[bool]
    isJsonSource: NotRequired[bool]
    isMinimized: NotRequired[bool]
    isPreset: NotRequired[bool]
    jsonSourceKeys: NotRequired[list[str]]
    jsonSourceMissing: NotRequired[bool]
    layers: NotRequired[list[DrawAreaLayer]]
    max: NotRequired[int]
    min: NotRequired[int]
    name: NotRequired[str]
    paramFilter: NotRequired[str]
    passingStyle: NotRequired[ParameterPassingStyle]
    pinnedAreaHeight: NotRequired[Literal[SectionSizeMode.auto] | float]
    pinnedParams: NotRequired[list[ID]]
    positionAndSizeLocked: NotRequired[bool]
    renderedValue: NotRequired[str | None]
    selectedParams: NotRequired[list[ID]]
    size: NotRequired[SectionSize]
    step: NotRequired[int]
    text: NotRequired[str]
    textDisplayMode: NotRequired[TextBlockDisplayMode]
    topLevelParamId: NotRequired[ID | None]
    url: NotRequired[str]
    value: NotRequired[str]
    viewMode: NotRequired[BrowserAreaViewMode]
