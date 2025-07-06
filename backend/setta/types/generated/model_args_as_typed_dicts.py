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
    type: NotRequired[Any]
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
    type: NotRequired[Any]
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
    type: NotRequired[Any]
    artifactGroupIds: NotRequired[list[str]]


class BaseCanvasSectionImplArgs(BaseSectionImplArgs):
    type: NotRequired[Any]
    renderedValue: NotRequired[Any]


class BaseCodeSectionImplArgs(BaseSectionImplArgs):
    type: NotRequired[Any]
    code: NotRequired[str]


class BaseParentSectionImplArgs(BaseSectionImplArgs):
    type: NotRequired[Any]
    children: NotRequired[list[str]]


class BaseDictSectionImplArgs(BaseSectionWithParamsImplArgs):
    type: NotRequired[Any]
    topLevelParamIds: NotRequired[list[str]]
    isJsonSource: NotRequired[bool]
    jsonSourceKeys: NotRequired[list[str]]
    jsonSourceMissing: NotRequired[bool]


class CallableSectionImplArgs(BaseSectionWithParamsImplArgs):
    type: NotRequired[Literal[SectionType.Callable]]
    callable: NotRequired[str | None]
    hideParams: NotRequired[bool]


class DictSectionImplArgs(BaseDictSectionImplArgs):
    type: NotRequired[Literal[SectionType.Dict]]


class ListRootSectionImplArgs(BaseParentSectionImplArgs):
    type: NotRequired[Literal[SectionType.ListRoot]]


class DictRootSectionImplArgs(BaseParentSectionImplArgs):
    type: NotRequired[Literal[SectionType.DictRoot]]


class GroupSectionImplArgs(BaseParentSectionImplArgs):
    type: NotRequired[Literal[SectionType.Group]]
    isHorizontalOrientation: NotRequired[bool]


class ImageSectionImplArgs(BaseArtifactSectionImplArgs):
    type: NotRequired[Literal[SectionType.Image]]


class ChartSectionImplArgs(BaseArtifactSectionImplArgs, BaseCanvasSectionImplArgs):
    type: NotRequired[Literal[SectionType.Chart]]
    chartSettings: NotRequired[ChartSettings]


class DrawSectionImplArgs(BaseArtifactSectionImplArgs, BaseCanvasSectionImplArgs):
    type: NotRequired[Literal[SectionType.Draw]]
    canvasSettings: NotRequired[DrawAreaCanvasSettings]


class TextBlockSectionImplArgs(BaseSectionImplArgs):
    type: NotRequired[Literal[SectionType.TextBlock]]
    format: NotRequired[TextBlockFormat]
    headingAsSectionName: NotRequired[bool]
    displayMode: NotRequired[TextBlockDisplayMode]
    text: NotRequired[str]


class SocialSectionImplArgs(BaseSectionImplArgs):
    type: NotRequired[Literal[SectionType.Social]]
    social: NotRequired[str]


class GlobalVariablesSectionImplArgs(BaseDictSectionImplArgs):
    type: NotRequired[Literal[SectionType.GlobalVariables]]


class CodeSectionImplArgs(BaseCodeSectionImplArgs):
    type: NotRequired[Literal[SectionType.Code]]
    codeLanguage: NotRequired[CodeLanguage]


class GenPythonCodeSectionImplArgs(BaseCodeSectionImplArgs):
    type: NotRequired[Literal[SectionType.GenPythonCode]]


class TerminalSectionImplArgs(BaseSectionImplArgs):
    type: NotRequired[Literal[SectionType.Terminal]]


class IFrameSectionImplArgs(BaseSectionImplArgs):
    type: NotRequired[Literal[SectionType.IFrame]]


class ChatSectionImplArgs(BaseSectionImplArgs):
    type: NotRequired[Literal[SectionType.Chat]]


class BrowserSectionImplArgs(BaseSectionImplArgs):
    type: NotRequired[Literal[SectionType.Browser]]
    hideColumn: NotRequired[bool]


class BaseCodeObjImplArgs(TypedDict):
    type: NotRequired[Any]
    id: NotRequired[str]
    name: NotRequired[str]
    description: NotRequired[str]
    isPreset: NotRequired[bool]


class BaseParamCodeObjImplArgs(BaseCodeObjImplArgs):
    type: NotRequired[Any]
    coreNameType: NotRequired[ParamNameType]
    coreNameEditable: NotRequired[bool]
    passingStyle: NotRequired[ParameterPassingStyle]


class BaseChildlessCodeObjImplArgs(BaseParamCodeObjImplArgs):
    type: NotRequired[Any]
    defaultVal: NotRequired[str]
    value: NotRequired[str]


class BaseParentCodeObjImplArgs(BaseCodeObjImplArgs):
    type: NotRequired[Any]
    children: NotRequired[list[str]]


class CodeCallableCodeObjImplArgs(BaseParentCodeObjImplArgs):
    type: NotRequired[Literal[CodeObjType.CodeCallable]]


class CodeParamCodeObjImplArgs(BaseChildlessCodeObjImplArgs):
    type: NotRequired[Literal[CodeObjType.CodeParam]]


class TextParamCodeObjImplArgs(BaseChildlessCodeObjImplArgs):
    type: NotRequired[Literal[CodeObjType.TextParam]]


class SliderParamCodeObjImplArgs(BaseChildlessCodeObjImplArgs):
    type: NotRequired[Literal[CodeObjType.SliderParam]]
    min: NotRequired[int]
    max: NotRequired[int]
    step: NotRequired[int]


class SwitchParamCodeObjImplArgs(BaseChildlessCodeObjImplArgs):
    type: NotRequired[Literal[CodeObjType.SwitchParam]]


class ColorPickerParamCodeObjImplArgs(BaseChildlessCodeObjImplArgs):
    type: NotRequired[Literal[CodeObjType.ColorPickerParam]]
    choices: NotRequired[list[ColorPickerChoice]]


class DropdownParamCodeObjImplArgs(BaseChildlessCodeObjImplArgs):
    type: NotRequired[Literal[CodeObjType.DropdownParam]]
    choices: NotRequired[list[str]]


class PasswordParamCodeObjImplArgs(BaseChildlessCodeObjImplArgs):
    type: NotRequired[Literal[CodeObjType.PasswordParam]]


class NestedParamCodeObjImplArgs(BaseParamCodeObjImplArgs, BaseParentCodeObjImplArgs):
    type: NotRequired[Literal[CodeObjType.NestedParam]]
