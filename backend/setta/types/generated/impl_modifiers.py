from typing import Any, Literal, NotRequired, TypedDict

from setta.types.sections import (
    ChartSettings,
    CodeLanguage,
    ConfigLanguage,
    DrawAreaCanvasSettings,
    SectionSize,
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
    pinnedAreaHeight: NotRequired[float | Literal["auto"]]
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
    type: Literal["Callable"]
    callable: NotRequired[str | None]
    hideParams: NotRequired[bool]


class DictSectionImplModifier(BaseDictSectionImplModifier):
    type: Literal["Dict"]


class ListRootSectionImplModifier(BaseParentSectionImplModifier):
    type: Literal["ListRoot"]


class DictRootSectionImplModifier(BaseParentSectionImplModifier):
    type: Literal["DictRoot"]


class GroupSectionImplModifier(BaseParentSectionImplModifier):
    type: Literal["Group"]
    isHorizontalOrientation: NotRequired[bool]


class ImageSectionImplModifier(BaseArtifactSectionImplModifier):
    type: Literal["Image"]


class ChartSectionImplModifier(BaseArtifactSectionImplModifier):
    type: Literal["Chart"]
    renderedValue: NotRequired[Any]
    chartSettings: NotRequired[ChartSettings]


class DrawSectionImplModifier(BaseArtifactSectionImplModifier):
    type: Literal["Draw"]
    renderedValue: NotRequired[Any]
    canvasSettings: NotRequired[DrawAreaCanvasSettings]


class TextBlockSectionImplModifier(BaseSectionImplModifier):
    type: Literal["TextBlock"]
    format: NotRequired[TextBlockFormat]
    headingAsSectionName: NotRequired[bool]
    displayMode: NotRequired[TextBlockDisplayMode]
    text: NotRequired[str]


class SocialSectionImplModifier(BaseSectionImplModifier):
    type: Literal["Social"]
    social: NotRequired[str]


class GlobalVariablesSectionImplModifier(BaseDictSectionImplModifier):
    type: Literal["GlobalVariables"]


class CodeSectionImplModifier(BaseCodeSectionImplModifier):
    type: Literal["Code"]
    codeLanguage: NotRequired[CodeLanguage]


class GenPythonCodeSectionImplModifier(BaseCodeSectionImplModifier):
    type: Literal["GenPythonCode"]


class TerminalSectionImplModifier(BaseSectionImplModifier):
    type: Literal["Terminal"]


class IFrameSectionImplModifier(BaseSectionImplModifier):
    type: Literal["IFrame"]


class ChatSectionImplModifier(BaseSectionImplModifier):
    type: Literal["Chat"]


class BrowserSectionImplModifier(BaseSectionImplModifier):
    type: Literal["Browser"]
    hideColumn: NotRequired[bool]


from typing import Any, Literal, NotRequired, TypedDict

from setta.types.code_objs import (
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
    type: Literal["CodeCallable"]


class CodeParamCodeObjImplModifier(BaseChildlessCodeObjImplModifier):
    type: Literal["CodeParam"]


class TextParamCodeObjImplModifier(BaseChildlessCodeObjImplModifier):
    type: Literal["TextParam"]


class SliderParamCodeObjImplModifier(BaseChildlessCodeObjImplModifier):
    type: Literal["SliderParam"]
    min: NotRequired[int]
    max: NotRequired[int]
    step: NotRequired[int]


class SwitchParamCodeObjImplModifier(BaseChildlessCodeObjImplModifier):
    type: Literal["SwitchParam"]


class ColorPickerParamCodeObjImplModifier(BaseChildlessCodeObjImplModifier):
    type: Literal["ColorPickerParam"]
    choices: NotRequired[list[ColorPickerChoice]]


class DropdownParamCodeObjImplModifier(BaseChildlessCodeObjImplModifier):
    type: Literal["DropdownParam"]
    choices: NotRequired[list[str]]


class PasswordParamCodeObjImplModifier(BaseChildlessCodeObjImplModifier):
    type: Literal["PasswordParam"]


class NestedParamCodeObjImplModifier(BaseParamCodeObjImplModifier):
    type: Literal["NestedParam"]
    children: NotRequired[list[str]]
