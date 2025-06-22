from typing import Any, Literal, TypedDict

from setta.types.sections import (
    ChartSettings,
    CodeLanguage,
    ConfigLanguage,
    DrawAreaCanvasSettings,
    SectionSize,
    Visibility,
)


class BaseSectionImplModifier(TypedDict, total=False):
    type: Any
    parentId: str | None
    isFrozen: bool
    visibility: Visibility
    isInOtherProjectConfigs: bool
    size: SectionSize
    aspectRatio: bool
    aspectRatioExtraHeight: int
    aspectRatioExtraWidth: int
    isMinimized: bool
    positionAndSizeLocked: bool


class BaseSectionWithParamsImplModifier(BaseSectionImplModifier, total=False):
    type: Any
    codeObjImplLayeringMap: dict[str, str]
    hideUnpinnedParams: bool
    paramFilter: str
    columnWidth: float | None
    configLanguage: ConfigLanguage
    pinnedParams: list[str]
    pinnedAreaHeight: float | Literal["auto"]
    selectedParams: list[str]
    ignoreTypeErrors: dict[str, bool]


class BaseArtifactSectionImplModifier(BaseSectionImplModifier, total=False):
    type: Any
    artifactGroupIds: list[str]


class BaseCanvasSectionImplModifier(BaseSectionImplModifier, total=False):
    type: Any
    renderedValue: Any


class BaseCodeSectionImplModifier(BaseSectionImplModifier, total=False):
    type: Any
    code: str


class BaseParentSectionImplModifier(BaseSectionImplModifier, total=False):
    type: Any
    children: list[str]


class BaseDictSectionImplModifier(BaseSectionWithParamsImplModifier, total=False):
    type: Any
    codeObjImplLayeringMap: dict[str, str]
    hideUnpinnedParams: bool
    paramFilter: str
    columnWidth: float | None
    configLanguage: ConfigLanguage
    pinnedParams: list[str]
    pinnedAreaHeight: float | Literal["auto"]
    selectedParams: list[str]
    ignoreTypeErrors: dict[str, bool]
    topLevelParamIds: list[str]


class CallableSectionImplModifier(BaseSectionWithParamsImplModifier, total=False):
    type: Literal["Callable"]
    codeObjImplLayeringMap: dict[str, str]
    hideUnpinnedParams: bool
    paramFilter: str
    columnWidth: float | None
    configLanguage: ConfigLanguage
    pinnedParams: list[str]
    pinnedAreaHeight: float | Literal["auto"]
    selectedParams: list[str]
    ignoreTypeErrors: dict[str, bool]
    callable: str | None
    hideParams: bool


class DictSectionImplModifier(BaseDictSectionImplModifier, total=False):
    type: Literal["Dict"]
    codeObjImplLayeringMap: dict[str, str]
    hideUnpinnedParams: bool
    paramFilter: str
    columnWidth: float | None
    configLanguage: ConfigLanguage
    pinnedParams: list[str]
    pinnedAreaHeight: float | Literal["auto"]
    selectedParams: list[str]
    ignoreTypeErrors: dict[str, bool]
    topLevelParamIds: list[str]
    isJsonSource: bool
    jsonSourceKeys: list[str]
    jsonSourceMissing: bool


class ListRootSectionImplModifier(BaseParentSectionImplModifier, total=False):
    type: Literal["ListRoot"]
    children: list[str]


class DictRootSectionImplModifier(BaseParentSectionImplModifier, total=False):
    type: Literal["DictRoot"]
    children: list[str]


class GroupSectionImplModifier(BaseParentSectionImplModifier, total=False):
    type: Literal["Group"]
    children: list[str]
    isHorizontalOrientation: bool


class ImageSectionImplModifier(BaseArtifactSectionImplModifier, total=False):
    type: Literal["Image"]
    artifactGroupIds: list[str]


class ChartSectionImplModifier(BaseArtifactSectionImplModifier, total=False):
    type: Literal["Chart"]
    renderedValue: Any
    artifactGroupIds: list[str]
    chartSettings: ChartSettings


class DrawSectionImplModifier(BaseArtifactSectionImplModifier, total=False):
    type: Literal["Draw"]
    renderedValue: Any
    artifactGroupIds: list[str]
    canvasSettings: DrawAreaCanvasSettings


class TextBlockSectionImplModifier(BaseSectionImplModifier, total=False):
    type: Literal["TextBlock"]
    renderMarkdown: bool
    headingAsSectionName: bool
    displayMode: str
    description: str


class SocialSectionImplModifier(BaseSectionImplModifier, total=False):
    type: Literal["Social"]
    social: str


class GlobalVariablesSectionImplModifier(BaseDictSectionImplModifier, total=False):
    type: Literal["GlobalVariables"]
    codeObjImplLayeringMap: dict[str, str]
    hideUnpinnedParams: bool
    paramFilter: str
    columnWidth: float | None
    configLanguage: ConfigLanguage
    pinnedParams: list[str]
    pinnedAreaHeight: float | Literal["auto"]
    selectedParams: list[str]
    ignoreTypeErrors: dict[str, bool]
    topLevelParamIds: list[str]


class CodeSectionImplModifier(BaseCodeSectionImplModifier, total=False):
    type: Literal["Code"]
    code: str
    codeLanguage: CodeLanguage


class GenPythonCodeSectionImplModifier(BaseCodeSectionImplModifier, total=False):
    type: Literal["GenPythonCode"]
    code: str


class TerminalSectionImplModifier(BaseSectionImplModifier, total=False):
    type: Literal["Terminal"]


class IFrameSectionImplModifier(BaseSectionImplModifier, total=False):
    type: Literal["IFrame"]


class ChatSectionImplModifier(BaseSectionImplModifier, total=False):
    type: Literal["Chat"]


class BrowserSectionImplModifier(BaseSectionImplModifier, total=False):
    type: Literal["Browser"]
    hideColumn: bool
