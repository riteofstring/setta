from typing import Any, Literal, NotRequired, TypedDict

from setta.types.code_obj_impls import (
    CodeObjType,
    ColorPickerChoice,
    ParameterPassingStyle,
    ParamNameType,
)
from setta.types.section_impls import (
    ChartSettings,
    CodeLanguage,
    ConfigLanguage,
    DrawAreaCanvasSettings,
    SectionSize,
    SectionSizeMode,
    SectionType,
    TextBlockDisplayMode,
    TextBlockFormat,
    Visibility,
)


class BaseSectionImplArgs(TypedDict):
    type: Any
    id: NotRequired[str]
    name: NotRequired[str]
    parentId: NotRequired[str | None]
    isFrozen: NotRequired[bool]
    visibility: NotRequired[Visibility]
    isInOtherProjectConfigs: NotRequired[bool]
    size: NotRequired[SectionSize]
    aspectRatio: NotRequired[bool | float]
    aspectRatioExtraHeight: NotRequired[int]
    aspectRatioExtraWidth: NotRequired[int]
    isMinimized: NotRequired[bool]
    positionAndSizeLocked: NotRequired[bool]
    isPreset: NotRequired[bool]


class BaseSectionWithParamsImplArgs(BaseSectionImplArgs):
    type: Any
    codeObjImplLayeringMap: NotRequired[dict[str, str]]
    hideUnpinnedParams: NotRequired[bool]
    paramFilter: NotRequired[str]
    columnWidth: NotRequired[float | None]
    configLanguage: NotRequired[ConfigLanguage]
    pinnedParams: NotRequired[list[str]]
    pinnedAreaHeight: NotRequired[float | Literal[SectionSizeMode.auto]]
    selectedParams: NotRequired[list[str]]
    ignoreTypeErrors: NotRequired[dict[str, bool]]


class BaseArtifactSectionImplArgs(BaseSectionImplArgs):
    type: Any
    artifactGroupIds: NotRequired[list[str]]


class BaseCanvasSectionImplArgs(BaseSectionImplArgs):
    type: Any
    renderedValue: NotRequired[Any]


class BaseCodeSectionImplArgs(BaseSectionImplArgs):
    type: Any
    code: NotRequired[str]


class BaseParentSectionImplArgs(BaseSectionImplArgs):
    type: Any
    children: NotRequired[list[str]]


class BaseDictSectionImplArgs(BaseSectionWithParamsImplArgs):
    type: Any
    topLevelParamIds: NotRequired[list[str]]
    isJsonSource: NotRequired[bool]
    jsonSourceKeys: NotRequired[list[str]]
    jsonSourceMissing: NotRequired[bool]


class CallableSectionImplArgs(BaseSectionWithParamsImplArgs):
    type: Literal[SectionType.Callable]
    callable: NotRequired[str | None]
    hideParams: NotRequired[bool]


class DictSectionImplArgs(BaseDictSectionImplArgs):
    type: Literal[SectionType.Dict]


class ListRootSectionImplArgs(BaseParentSectionImplArgs):
    type: Literal[SectionType.ListRoot]


class DictRootSectionImplArgs(BaseParentSectionImplArgs):
    type: Literal[SectionType.DictRoot]


class GroupSectionImplArgs(BaseParentSectionImplArgs):
    type: Literal[SectionType.Group]
    isHorizontalOrientation: NotRequired[bool]


class ImageSectionImplArgs(BaseArtifactSectionImplArgs):
    type: Literal[SectionType.Image]


class ChartSectionImplArgs(BaseArtifactSectionImplArgs, BaseCanvasSectionImplArgs):
    type: Literal[SectionType.Chart]
    chartSettings: NotRequired[ChartSettings]


class DrawSectionImplArgs(BaseArtifactSectionImplArgs, BaseCanvasSectionImplArgs):
    type: Literal[SectionType.Draw]
    canvasSettings: NotRequired[DrawAreaCanvasSettings]


class TextBlockSectionImplArgs(BaseSectionImplArgs):
    type: Literal[SectionType.TextBlock]
    format: NotRequired[TextBlockFormat]
    headingAsSectionName: NotRequired[bool]
    displayMode: NotRequired[TextBlockDisplayMode]
    text: NotRequired[str]


class SocialSectionImplArgs(BaseSectionImplArgs):
    type: Literal[SectionType.Social]
    social: NotRequired[str]


class GlobalVariablesSectionImplArgs(BaseDictSectionImplArgs):
    type: Literal[SectionType.GlobalVariables]


class CodeSectionImplArgs(BaseCodeSectionImplArgs):
    type: Literal[SectionType.Code]
    codeLanguage: NotRequired[CodeLanguage]


class GenPythonCodeSectionImplArgs(BaseCodeSectionImplArgs):
    type: Literal[SectionType.GenPythonCode]


class TerminalSectionImplArgs(BaseSectionImplArgs):
    type: Literal[SectionType.Terminal]


class IFrameSectionImplArgs(BaseSectionImplArgs):
    type: Literal[SectionType.IFrame]


class ChatSectionImplArgs(BaseSectionImplArgs):
    type: Literal[SectionType.Chat]


class BrowserSectionImplArgs(BaseSectionImplArgs):
    type: Literal[SectionType.Browser]
    hideColumn: NotRequired[bool]


class BaseCodeObjImplArgs(TypedDict):
    type: Any
    id: NotRequired[str]
    name: NotRequired[str]
    description: NotRequired[str]
    isPreset: NotRequired[bool]


class BaseParamCodeObjImplArgs(BaseCodeObjImplArgs):
    type: Any
    coreNameType: NotRequired[ParamNameType]
    coreNameEditable: NotRequired[bool]
    passingStyle: NotRequired[ParameterPassingStyle]


class BaseChildlessCodeObjImplArgs(BaseParamCodeObjImplArgs):
    type: Any
    defaultVal: NotRequired[str]
    value: NotRequired[str]


class BaseParentCodeObjImplArgs(BaseCodeObjImplArgs):
    type: Any
    children: NotRequired[list[str]]


class CodeCallableCodeObjImplArgs(BaseParentCodeObjImplArgs):
    type: Literal[CodeObjType.CodeCallable]


class CodeParamCodeObjImplArgs(BaseChildlessCodeObjImplArgs):
    type: Literal[CodeObjType.CodeParam]


class TextParamCodeObjImplArgs(BaseChildlessCodeObjImplArgs):
    type: Literal[CodeObjType.TextParam]


class SliderParamCodeObjImplArgs(BaseChildlessCodeObjImplArgs):
    type: Literal[CodeObjType.SliderParam]
    min: NotRequired[int]
    max: NotRequired[int]
    step: NotRequired[int]


class SwitchParamCodeObjImplArgs(BaseChildlessCodeObjImplArgs):
    type: Literal[CodeObjType.SwitchParam]


class ColorPickerParamCodeObjImplArgs(BaseChildlessCodeObjImplArgs):
    type: Literal[CodeObjType.ColorPickerParam]
    choices: NotRequired[list[ColorPickerChoice]]


class DropdownParamCodeObjImplArgs(BaseChildlessCodeObjImplArgs):
    type: Literal[CodeObjType.DropdownParam]
    choices: NotRequired[list[str]]


class PasswordParamCodeObjImplArgs(BaseChildlessCodeObjImplArgs):
    type: Literal[CodeObjType.PasswordParam]


class NestedParamCodeObjImplArgs(BaseParamCodeObjImplArgs, BaseParentCodeObjImplArgs):
    type: Literal[CodeObjType.NestedParam]
