from typing import Any, Literal, NotRequired, TypedDict

from setta.types.sections import (
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


class BaseSectionImplModifier(TypedDict):
    type: Any
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


class BaseSectionWithParamsImplModifier(BaseSectionImplModifier):
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


class BaseArtifactSectionImplModifier(BaseSectionImplModifier):
    type: Any
    artifactGroupIds: NotRequired[list[str]]


class BaseCanvasSectionImplModifier(BaseSectionImplModifier):
    type: Any
    renderedValue: NotRequired[Any]


class BaseCodeSectionImplModifier(BaseSectionImplModifier):
    type: Any
    code: NotRequired[str]


class BaseParentSectionImplModifier(BaseSectionImplModifier):
    type: Any
    children: NotRequired[list[str]]


class BaseDictSectionImplModifier(BaseSectionWithParamsImplModifier):
    type: Any
    topLevelParamIds: NotRequired[list[str]]
    isJsonSource: NotRequired[bool]
    jsonSourceKeys: NotRequired[list[str]]
    jsonSourceMissing: NotRequired[bool]


class CallableSectionImplModifier(BaseSectionWithParamsImplModifier):
    type: Literal[SectionType.Callable]
    callable: NotRequired[str | None]
    hideParams: NotRequired[bool]


class DictSectionImplModifier(BaseDictSectionImplModifier):
    type: Literal[SectionType.Dict]


class ListRootSectionImplModifier(BaseParentSectionImplModifier):
    type: Literal[SectionType.ListRoot]


class DictRootSectionImplModifier(BaseParentSectionImplModifier):
    type: Literal[SectionType.DictRoot]


class GroupSectionImplModifier(BaseParentSectionImplModifier):
    type: Literal[SectionType.Group]
    isHorizontalOrientation: NotRequired[bool]


class ImageSectionImplModifier(BaseArtifactSectionImplModifier):
    type: Literal[SectionType.Image]


class ChartSectionImplModifier(BaseArtifactSectionImplModifier):
    type: Literal[SectionType.Chart]
    renderedValue: NotRequired[Any]
    chartSettings: NotRequired[ChartSettings]


class DrawSectionImplModifier(BaseArtifactSectionImplModifier):
    type: Literal[SectionType.Draw]
    renderedValue: NotRequired[Any]
    canvasSettings: NotRequired[DrawAreaCanvasSettings]


class TextBlockSectionImplModifier(BaseSectionImplModifier):
    type: Literal[SectionType.TextBlock]
    format: NotRequired[TextBlockFormat]
    headingAsSectionName: NotRequired[bool]
    displayMode: NotRequired[TextBlockDisplayMode]
    text: NotRequired[str]


class SocialSectionImplModifier(BaseSectionImplModifier):
    type: Literal[SectionType.Social]
    social: NotRequired[str]


class GlobalVariablesSectionImplModifier(BaseDictSectionImplModifier):
    type: Literal[SectionType.GlobalVariables]


class CodeSectionImplModifier(BaseCodeSectionImplModifier):
    type: Literal[SectionType.Code]
    codeLanguage: NotRequired[CodeLanguage]


class GenPythonCodeSectionImplModifier(BaseCodeSectionImplModifier):
    type: Literal[SectionType.GenPythonCode]


class TerminalSectionImplModifier(BaseSectionImplModifier):
    type: Literal[SectionType.Terminal]


class IFrameSectionImplModifier(BaseSectionImplModifier):
    type: Literal[SectionType.IFrame]


class ChatSectionImplModifier(BaseSectionImplModifier):
    type: Literal[SectionType.Chat]


class BrowserSectionImplModifier(BaseSectionImplModifier):
    type: Literal[SectionType.Browser]
    hideColumn: NotRequired[bool]


from typing import Any, Literal, NotRequired, TypedDict

from setta.types.code_objs import (
    CodeObjType,
    ColorPickerChoice,
    ParameterPassingStyle,
    ParamNameType,
)


class BaseCodeObjImplModifier(TypedDict):
    type: Any
    description: NotRequired[str]


class BaseParamCodeObjImplModifier(BaseCodeObjImplModifier):
    type: Any
    coreNameType: NotRequired[ParamNameType]
    coreNameEditable: NotRequired[bool]
    passingStyle: NotRequired[ParameterPassingStyle]


class BaseChildlessCodeObjImplModifier(BaseParamCodeObjImplModifier):
    type: Any
    defaultVal: NotRequired[str]
    value: NotRequired[str]


class BaseParentCodeObjImplModifier(BaseCodeObjImplModifier):
    type: Any
    children: NotRequired[list[str]]


class CodeCallableCodeObjImplModifier(BaseParentCodeObjImplModifier):
    type: Literal[CodeObjType.CodeCallable]


class CodeParamCodeObjImplModifier(BaseChildlessCodeObjImplModifier):
    type: Literal[CodeObjType.CodeParam]


class TextParamCodeObjImplModifier(BaseChildlessCodeObjImplModifier):
    type: Literal[CodeObjType.TextParam]


class SliderParamCodeObjImplModifier(BaseChildlessCodeObjImplModifier):
    type: Literal[CodeObjType.SliderParam]
    min: NotRequired[int]
    max: NotRequired[int]
    step: NotRequired[int]


class SwitchParamCodeObjImplModifier(BaseChildlessCodeObjImplModifier):
    type: Literal[CodeObjType.SwitchParam]


class ColorPickerParamCodeObjImplModifier(BaseChildlessCodeObjImplModifier):
    type: Literal[CodeObjType.ColorPickerParam]
    choices: NotRequired[list[ColorPickerChoice]]


class DropdownParamCodeObjImplModifier(BaseChildlessCodeObjImplModifier):
    type: Literal[CodeObjType.DropdownParam]
    choices: NotRequired[list[str]]


class PasswordParamCodeObjImplModifier(BaseChildlessCodeObjImplModifier):
    type: Literal[CodeObjType.PasswordParam]


class NestedParamCodeObjImplModifier(BaseParamCodeObjImplModifier):
    type: Literal[CodeObjType.NestedParam]
    children: NotRequired[list[str]]
