# Auto-generated shared modifier model - DO NOT EDIT MANUALLY
# Generated from section and code obj implementations

from typing import Any, Literal, NotRequired, TypedDict

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
    Visibility,
)


class SharedModifier(TypedDict):
    # Field 'aspectRatio' present with multiple annotations: bool, float
    # Field 'chartSettings' present with multiple annotations: LineChartSettings, ScatterChartSettings
    # Field 'choices' present with multiple annotations: list[ColorPickerChoice], list[str]
    # Field 'displayMode' present with multiple annotations: SectionWithParamsDisplayMode, TextBlockDisplayMode
    # Field 'pinnedAreaHeight' present with multiple annotations: Literal[SectionSizeMode.auto], float
    activeLayerIdx: NotRequired[int | None]
    aspectRatio: NotRequired[bool | float | None]
    aspectRatioExtraHeight: NotRequired[int | None]
    aspectRatioExtraWidth: NotRequired[int | None]
    brushColor: NotRequired[str | None]
    brushOpacity: NotRequired[float | None]
    brushShape: NotRequired[DrawAreaBrushShape | None]
    brushSize: NotRequired[int | None]
    callable: NotRequired[str | None]
    canvasMode: NotRequired[DrawAreaMode | None]
    chartSettings: NotRequired[LineChartSettings | ScatterChartSettings | None]
    children: NotRequired[list[str] | None]
    choices: NotRequired[list[ColorPickerChoice] | list[str] | None]
    code: NotRequired[str | None]
    codeFileBinding: NotRequired[CodeFileBinding | None]
    codeLanguage: NotRequired[CodeLanguage | None]
    codeObjVariantMap: NotRequired[dict[str, str] | None]
    colorChoices: NotRequired[list[ColorPickerChoice] | None]
    columnWidth: NotRequired[float | None]
    configLanguage: NotRequired[ConfigLanguage | None]
    coreNameEditable: NotRequired[bool | None]
    coreNameType: NotRequired[ParamNameType | None]
    dataPath: NotRequired[str | None]
    defaultVal: NotRequired[str | None]
    description: NotRequired[str | None]
    displayMode: NotRequired[SectionWithParamsDisplayMode | TextBlockDisplayMode | None]
    drawThrottleDelay: NotRequired[int | None]
    eraserBrushSize: NotRequired[int | None]
    folder: NotRequired[str | None]
    format: NotRequired[TextBlockFormat | None]
    headingAsSectionName: NotRequired[bool | None]
    hideColumn: NotRequired[bool | None]
    hideParams: NotRequired[bool | None]
    hideUnpinnedParams: NotRequired[bool | None]
    id: NotRequired[str | None]
    ignoreTypeErrors: NotRequired[dict[str, bool] | None]
    imagePath: NotRequired[str | None]
    isFrozen: NotRequired[bool | None]
    isHorizontalOrientation: NotRequired[bool | None]
    isInOtherProjectConfigs: NotRequired[bool | None]
    isJsonSource: NotRequired[bool | None]
    isMinimized: NotRequired[bool | None]
    isPreset: NotRequired[bool | None]
    jsonSourceKeys: NotRequired[list[str] | None]
    jsonSourceMissing: NotRequired[bool | None]
    layers: NotRequired[list[DrawAreaLayer] | None]
    max: NotRequired[int | None]
    min: NotRequired[int | None]
    name: NotRequired[str | None]
    paramFilter: NotRequired[str | None]
    passingStyle: NotRequired[ParameterPassingStyle | None]
    pinnedAreaHeight: NotRequired[Literal[SectionSizeMode.auto] | float | None]
    pinnedParams: NotRequired[list[str] | None]
    positionAndSizeLocked: NotRequired[bool | None]
    renderedValue: NotRequired[Any | None]
    selectedParams: NotRequired[list[str] | None]
    size: NotRequired[SectionSize | None]
    step: NotRequired[int | None]
    text: NotRequired[str | None]
    topLevelParamId: NotRequired[str | None]
    url: NotRequired[str | None]
    value: NotRequired[str | None]
    viewMode: NotRequired[BrowserAreaViewMode | None]
    visibility: NotRequired[Visibility | None]
