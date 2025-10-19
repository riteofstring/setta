# Auto-generated shared modifier model - DO NOT EDIT MANUALLY
# Generated from section and code obj implementations

from typing import Any, Literal

from pydantic import BaseModel
from setta.types.artifact import (
    DrawAreaBrushShape,
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


class SharedModifier(BaseModel, extra="forbid"):
    # Field 'aspectRatio' present with multiple annotations: bool, float
    # Field 'chartSettings' present with multiple annotations: LineChartSettings, ScatterChartSettings
    # Field 'choices' present with multiple annotations: list[ColorPickerChoice], list[str]
    # Field 'displayMode' present with multiple annotations: SectionWithParamsDisplayMode, TextBlockDisplayMode
    # Field 'pinnedAreaHeight' present with multiple annotations: Literal[SectionSizeMode.auto], float
    activeLayerIdx: int | None = None
    aspectRatio: bool | float | None = None
    aspectRatioExtraHeight: int | None = None
    aspectRatioExtraWidth: int | None = None
    brushColor: str | None = None
    brushOpacity: float | None = None
    brushShape: DrawAreaBrushShape | None = None
    brushSize: int | None = None
    canvasMode: DrawAreaMode | None = None
    chartSettings: LineChartSettings | ScatterChartSettings | None = None
    children: list[str] | None = None
    choices: list[ColorPickerChoice] | list[str] | None = None
    code: str | None = None
    codeFileBinding: CodeFileBinding | None = None
    codeLanguage: CodeLanguage | None = None
    colorChoices: list[ColorPickerChoice] | None = None
    columnWidth: float | None = None
    configLanguage: ConfigLanguage | None = None
    coreNameEditable: bool | None = None
    coreNameType: ParamNameType | None = None
    dataPath: str | None = None
    defaultVal: str | None = None
    description: str | None = None
    displayMode: SectionWithParamsDisplayMode | TextBlockDisplayMode | None = None
    drawThrottleDelay: int | None = None
    eraserBrushSize: int | None = None
    folder: str | None = None
    format: TextBlockFormat | None = None
    headingAsSectionName: bool | None = None
    hideColumn: bool | None = None
    hideParams: bool | None = None
    hideUnpinnedParams: bool | None = None
    id: str | None = None
    ignoreTypeErrors: dict[str, bool] | None = None
    imagePath: str | None = None
    isFrozen: bool | None = None
    isHorizontalOrientation: bool | None = None
    isInOtherProjectConfigs: bool | None = None
    isJsonSource: bool | None = None
    isMinimized: bool | None = None
    isPreset: bool | None = None
    jsonSourceKeys: list[str] | None = None
    jsonSourceMissing: bool | None = None
    max: int | None = None
    min: int | None = None
    name: str | None = None
    paramFilter: str | None = None
    passingStyle: ParameterPassingStyle | None = None
    pinnedAreaHeight: Literal[SectionSizeMode.auto] | float | None = None
    pinnedParams: list[str] | None = None
    positionAndSizeLocked: bool | None = None
    renderedValue: Any | None = None
    selectedParams: list[str] | None = None
    size: SectionSize | None = None
    step: int | None = None
    text: str | None = None
    url: str | None = None
    viewMode: BrowserAreaViewMode | None = None
    visibility: Visibility | None = None

    def as_dict(self) -> dict[str, Any]:
        """Return a dict view excluding unset values."""
        return self.model_dump(exclude_none=True)

    def __getitem__(self, key: str) -> Any:
        return getattr(self, key)

    def __setitem__(self, key: str, value: Any) -> None:
        setattr(self, key, value)

    def __contains__(self, key: object) -> bool:
        return isinstance(key, str) and getattr(self, key, None) is not None

    def get(self, key: str, default: Any = None) -> Any:
        if key not in self:
            return default
        return getattr(self, key)

    def items(self):
        return self.as_dict().items()

    def __iter__(self):
        return iter(self.as_dict())
