from typing import Any, Literal, TypedDict

from setta.types.sections import (
    ChartSettings,
    CodeLanguage,
    ConfigLanguage,
    DrawAreaCanvasSettings,
    SectionSize,
    Visibility,
)


class SectionImplModifier(TypedDict, total=False):
    pass


class BrowserSectionImplModifier(TypedDict, total=False):
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
    hideColumn: bool


class CallableSectionImplModifier(TypedDict, total=False):
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


class ChartSectionImplModifier(TypedDict, total=False):
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
    renderedValue: Any
    artifactGroupIds: list[str]
    chartSettings: ChartSettings


class ChatSectionImplModifier(TypedDict, total=False):
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


class CodeSectionImplModifier(TypedDict, total=False):
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
    code: str
    codeLanguage: CodeLanguage


class DictRootSectionImplModifier(TypedDict, total=False):
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
    children: list[str]


class DictSectionImplModifier(TypedDict, total=False):
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


class DrawSectionImplModifier(TypedDict, total=False):
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
    renderedValue: Any
    artifactGroupIds: list[str]
    canvasSettings: DrawAreaCanvasSettings


class GenPythonCodeSectionImplModifier(TypedDict, total=False):
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
    code: str


class GlobalVariablesSectionImplModifier(TypedDict, total=False):
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


class GroupSectionImplModifier(TypedDict, total=False):
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
    children: list[str]
    isHorizontalOrientation: bool


class IFrameSectionImplModifier(TypedDict, total=False):
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


class ImageSectionImplModifier(TypedDict, total=False):
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
    artifactGroupIds: list[str]


class ListRootSectionImplModifier(TypedDict, total=False):
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
    children: list[str]


class SocialSectionImplModifier(TypedDict, total=False):
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
    social: str


class TerminalSectionImplModifier(TypedDict, total=False):
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


class TextBlockSectionImplModifier(TypedDict, total=False):
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
    renderMarkdown: bool
    headingAsSectionName: bool
    displayMode: str
    description: str
