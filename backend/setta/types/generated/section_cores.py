# Auto-generated SectionCore classes - DO NOT EDIT MANUALLY
# Generated from section implementations

from typing import Literal

from pydantic import Field

from setta.types.generated.impl_modifiers import (
    BrowserSectionImplModifier,
    CallableSectionImplModifier,
    ChartSectionImplModifier,
    ChatSectionImplModifier,
    CodeSectionImplModifier,
    DictRootSectionImplModifier,
    DictSectionImplModifier,
    DrawSectionImplModifier,
    GenPythonCodeSectionImplModifier,
    GlobalVariablesSectionImplModifier,
    GroupSectionImplModifier,
    IFrameSectionImplModifier,
    ImageSectionImplModifier,
    ListRootSectionImplModifier,
    SocialSectionImplModifier,
    TerminalSectionImplModifier,
    TextBlockSectionImplModifier,
)
from setta.types.section_core import BaseSectionCore
from setta.types.section_impls import SectionType


class BrowserSectionCore(BaseSectionCore):
    type: Literal[SectionType.Browser] = SectionType.Browser
    sharedModifier: BrowserSectionImplModifier
    unsharedKeys: set[
        Literal[
            "aspectRatio",
            "aspectRatioExtraHeight",
            "aspectRatioExtraWidth",
            "hideColumn",
            "isFrozen",
            "isInOtherProjectConfigs",
            "isMinimized",
            "parentId",
            "positionAndSizeLocked",
            "size",
            "visibility",
        ]
    ] = Field(default_factory=set)


class CallableSectionCore(BaseSectionCore):
    type: Literal[SectionType.Callable] = SectionType.Callable
    sharedModifier: CallableSectionImplModifier
    unsharedKeys: set[
        Literal[
            "aspectRatio",
            "aspectRatioExtraHeight",
            "aspectRatioExtraWidth",
            "callable",
            "codeObjImplLayeringMap",
            "columnWidth",
            "configLanguage",
            "hideParams",
            "hideUnpinnedParams",
            "ignoreTypeErrors",
            "isFrozen",
            "isInOtherProjectConfigs",
            "isMinimized",
            "paramFilter",
            "parentId",
            "pinnedAreaHeight",
            "pinnedParams",
            "positionAndSizeLocked",
            "selectedParams",
            "size",
            "visibility",
        ]
    ] = Field(default_factory=lambda: {"callable", "codeObjImplLayeringMap"})


class ChartSectionCore(BaseSectionCore):
    type: Literal[SectionType.Chart] = SectionType.Chart
    sharedModifier: ChartSectionImplModifier
    unsharedKeys: set[
        Literal[
            "artifactGroupIds",
            "aspectRatio",
            "aspectRatioExtraHeight",
            "aspectRatioExtraWidth",
            "chartSettings",
            "isFrozen",
            "isInOtherProjectConfigs",
            "isMinimized",
            "parentId",
            "positionAndSizeLocked",
            "renderedValue",
            "size",
            "visibility",
        ]
    ] = Field(default_factory=set)


class ChatSectionCore(BaseSectionCore):
    type: Literal[SectionType.Chat] = SectionType.Chat
    sharedModifier: ChatSectionImplModifier
    unsharedKeys: set[
        Literal[
            "aspectRatio",
            "aspectRatioExtraHeight",
            "aspectRatioExtraWidth",
            "isFrozen",
            "isInOtherProjectConfigs",
            "isMinimized",
            "parentId",
            "positionAndSizeLocked",
            "size",
            "visibility",
        ]
    ] = Field(default_factory=set)


class CodeSectionCore(BaseSectionCore):
    type: Literal[SectionType.Code] = SectionType.Code
    sharedModifier: CodeSectionImplModifier
    unsharedKeys: set[
        Literal[
            "aspectRatio",
            "aspectRatioExtraHeight",
            "aspectRatioExtraWidth",
            "code",
            "codeLanguage",
            "isFrozen",
            "isInOtherProjectConfigs",
            "isMinimized",
            "parentId",
            "positionAndSizeLocked",
            "size",
            "visibility",
        ]
    ] = Field(default_factory=set)


class DictSectionCore(BaseSectionCore):
    type: Literal[SectionType.Dict] = SectionType.Dict
    sharedModifier: DictSectionImplModifier
    unsharedKeys: set[
        Literal[
            "aspectRatio",
            "aspectRatioExtraHeight",
            "aspectRatioExtraWidth",
            "codeObjImplLayeringMap",
            "columnWidth",
            "configLanguage",
            "hideUnpinnedParams",
            "ignoreTypeErrors",
            "isFrozen",
            "isInOtherProjectConfigs",
            "isJsonSource",
            "isMinimized",
            "jsonSourceKeys",
            "jsonSourceMissing",
            "paramFilter",
            "parentId",
            "pinnedAreaHeight",
            "pinnedParams",
            "positionAndSizeLocked",
            "selectedParams",
            "size",
            "topLevelParamIds",
            "visibility",
        ]
    ] = Field(default_factory=lambda: {"codeObjImplLayeringMap", "topLevelParamIds"})


class DictRootSectionCore(BaseSectionCore):
    type: Literal[SectionType.DictRoot] = SectionType.DictRoot
    sharedModifier: DictRootSectionImplModifier
    unsharedKeys: set[
        Literal[
            "aspectRatio",
            "aspectRatioExtraHeight",
            "aspectRatioExtraWidth",
            "children",
            "isFrozen",
            "isInOtherProjectConfigs",
            "isMinimized",
            "parentId",
            "positionAndSizeLocked",
            "size",
            "visibility",
        ]
    ] = Field(default_factory=set)


class DrawSectionCore(BaseSectionCore):
    type: Literal[SectionType.Draw] = SectionType.Draw
    sharedModifier: DrawSectionImplModifier
    unsharedKeys: set[
        Literal[
            "artifactGroupIds",
            "aspectRatio",
            "aspectRatioExtraHeight",
            "aspectRatioExtraWidth",
            "canvasSettings",
            "isFrozen",
            "isInOtherProjectConfigs",
            "isMinimized",
            "parentId",
            "positionAndSizeLocked",
            "renderedValue",
            "size",
            "visibility",
        ]
    ] = Field(default_factory=set)


class GenPythonCodeSectionCore(BaseSectionCore):
    type: Literal[SectionType.GenPythonCode] = SectionType.GenPythonCode
    sharedModifier: GenPythonCodeSectionImplModifier
    unsharedKeys: set[
        Literal[
            "aspectRatio",
            "aspectRatioExtraHeight",
            "aspectRatioExtraWidth",
            "code",
            "isFrozen",
            "isInOtherProjectConfigs",
            "isMinimized",
            "parentId",
            "positionAndSizeLocked",
            "size",
            "visibility",
        ]
    ] = Field(default_factory=set)


class GlobalVariablesSectionCore(BaseSectionCore):
    type: Literal[SectionType.GlobalVariables] = SectionType.GlobalVariables
    sharedModifier: GlobalVariablesSectionImplModifier
    unsharedKeys: set[
        Literal[
            "aspectRatio",
            "aspectRatioExtraHeight",
            "aspectRatioExtraWidth",
            "codeObjImplLayeringMap",
            "columnWidth",
            "configLanguage",
            "hideUnpinnedParams",
            "ignoreTypeErrors",
            "isFrozen",
            "isInOtherProjectConfigs",
            "isJsonSource",
            "isMinimized",
            "jsonSourceKeys",
            "jsonSourceMissing",
            "paramFilter",
            "parentId",
            "pinnedAreaHeight",
            "pinnedParams",
            "positionAndSizeLocked",
            "selectedParams",
            "size",
            "topLevelParamIds",
            "visibility",
        ]
    ] = Field(default_factory=set)


class GroupSectionCore(BaseSectionCore):
    type: Literal[SectionType.Group] = SectionType.Group
    sharedModifier: GroupSectionImplModifier
    unsharedKeys: set[
        Literal[
            "aspectRatio",
            "aspectRatioExtraHeight",
            "aspectRatioExtraWidth",
            "children",
            "isFrozen",
            "isHorizontalOrientation",
            "isInOtherProjectConfigs",
            "isMinimized",
            "parentId",
            "positionAndSizeLocked",
            "size",
            "visibility",
        ]
    ] = Field(default_factory=set)


class IFrameSectionCore(BaseSectionCore):
    type: Literal[SectionType.IFrame] = SectionType.IFrame
    sharedModifier: IFrameSectionImplModifier
    unsharedKeys: set[
        Literal[
            "aspectRatio",
            "aspectRatioExtraHeight",
            "aspectRatioExtraWidth",
            "isFrozen",
            "isInOtherProjectConfigs",
            "isMinimized",
            "parentId",
            "positionAndSizeLocked",
            "size",
            "visibility",
        ]
    ] = Field(default_factory=set)


class ImageSectionCore(BaseSectionCore):
    type: Literal[SectionType.Image] = SectionType.Image
    sharedModifier: ImageSectionImplModifier
    unsharedKeys: set[
        Literal[
            "artifactGroupIds",
            "aspectRatio",
            "aspectRatioExtraHeight",
            "aspectRatioExtraWidth",
            "isFrozen",
            "isInOtherProjectConfigs",
            "isMinimized",
            "parentId",
            "positionAndSizeLocked",
            "size",
            "visibility",
        ]
    ] = Field(default_factory=set)


class ListRootSectionCore(BaseSectionCore):
    type: Literal[SectionType.ListRoot] = SectionType.ListRoot
    sharedModifier: ListRootSectionImplModifier
    unsharedKeys: set[
        Literal[
            "aspectRatio",
            "aspectRatioExtraHeight",
            "aspectRatioExtraWidth",
            "children",
            "isFrozen",
            "isInOtherProjectConfigs",
            "isMinimized",
            "parentId",
            "positionAndSizeLocked",
            "size",
            "visibility",
        ]
    ] = Field(default_factory=set)


class SocialSectionCore(BaseSectionCore):
    type: Literal[SectionType.Social] = SectionType.Social
    sharedModifier: SocialSectionImplModifier
    unsharedKeys: set[
        Literal[
            "aspectRatio",
            "aspectRatioExtraHeight",
            "aspectRatioExtraWidth",
            "isFrozen",
            "isInOtherProjectConfigs",
            "isMinimized",
            "parentId",
            "positionAndSizeLocked",
            "size",
            "social",
            "visibility",
        ]
    ] = Field(default_factory=set)


class TerminalSectionCore(BaseSectionCore):
    type: Literal[SectionType.Terminal] = SectionType.Terminal
    sharedModifier: TerminalSectionImplModifier
    unsharedKeys: set[
        Literal[
            "aspectRatio",
            "aspectRatioExtraHeight",
            "aspectRatioExtraWidth",
            "isFrozen",
            "isInOtherProjectConfigs",
            "isMinimized",
            "parentId",
            "positionAndSizeLocked",
            "size",
            "visibility",
        ]
    ] = Field(default_factory=set)


class TextBlockSectionCore(BaseSectionCore):
    type: Literal[SectionType.TextBlock] = SectionType.TextBlock
    sharedModifier: TextBlockSectionImplModifier
    unsharedKeys: set[
        Literal[
            "aspectRatio",
            "aspectRatioExtraHeight",
            "aspectRatioExtraWidth",
            "displayMode",
            "format",
            "headingAsSectionName",
            "isFrozen",
            "isInOtherProjectConfigs",
            "isMinimized",
            "parentId",
            "positionAndSizeLocked",
            "size",
            "text",
            "visibility",
        ]
    ] = Field(default_factory=set)
