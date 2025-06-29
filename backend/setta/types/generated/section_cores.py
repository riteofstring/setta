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


class BrowserSectionCore(BaseSectionCore):
    """Core configuration for Browser sections."""

    sharedModifier: BrowserSectionImplModifier
    unsharedKeys: set[
        Literal[
            "aspectRatio",
            "aspectRatioExtraHeight",
            "aspectRatioExtraWidth",
            "hideColumn",
            "id",
            "isFrozen",
            "isInOtherProjectConfigs",
            "isMinimized",
            "isPreset",
            "name",
            "parentId",
            "positionAndSizeLocked",
            "size",
            "type",
            "visibility",
        ]
    ] = Field(default_factory=set)


class CallableSectionCore(BaseSectionCore):
    """Core configuration for Callable sections."""

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
            "id",
            "ignoreTypeErrors",
            "isFrozen",
            "isInOtherProjectConfigs",
            "isMinimized",
            "isPreset",
            "name",
            "paramFilter",
            "parentId",
            "pinnedAreaHeight",
            "pinnedParams",
            "positionAndSizeLocked",
            "selectedParams",
            "size",
            "type",
            "visibility",
        ]
    ] = Field(default_factory=set)


class ChartSectionCore(BaseSectionCore):
    """Core configuration for Chart sections."""

    sharedModifier: ChartSectionImplModifier
    unsharedKeys: set[
        Literal[
            "artifactGroupIds",
            "aspectRatio",
            "aspectRatioExtraHeight",
            "aspectRatioExtraWidth",
            "chartSettings",
            "id",
            "isFrozen",
            "isInOtherProjectConfigs",
            "isMinimized",
            "isPreset",
            "name",
            "parentId",
            "positionAndSizeLocked",
            "renderedValue",
            "size",
            "type",
            "visibility",
        ]
    ] = Field(default_factory=set)


class ChatSectionCore(BaseSectionCore):
    """Core configuration for Chat sections."""

    sharedModifier: ChatSectionImplModifier
    unsharedKeys: set[
        Literal[
            "aspectRatio",
            "aspectRatioExtraHeight",
            "aspectRatioExtraWidth",
            "id",
            "isFrozen",
            "isInOtherProjectConfigs",
            "isMinimized",
            "isPreset",
            "name",
            "parentId",
            "positionAndSizeLocked",
            "size",
            "type",
            "visibility",
        ]
    ] = Field(default_factory=set)


class CodeSectionCore(BaseSectionCore):
    """Core configuration for Code sections."""

    sharedModifier: CodeSectionImplModifier
    unsharedKeys: set[
        Literal[
            "aspectRatio",
            "aspectRatioExtraHeight",
            "aspectRatioExtraWidth",
            "code",
            "codeLanguage",
            "id",
            "isFrozen",
            "isInOtherProjectConfigs",
            "isMinimized",
            "isPreset",
            "name",
            "parentId",
            "positionAndSizeLocked",
            "size",
            "type",
            "visibility",
        ]
    ] = Field(default_factory=set)


class DictSectionCore(BaseSectionCore):
    """Core configuration for Dict sections."""

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
            "id",
            "ignoreTypeErrors",
            "isFrozen",
            "isInOtherProjectConfigs",
            "isJsonSource",
            "isMinimized",
            "isPreset",
            "jsonSourceKeys",
            "jsonSourceMissing",
            "name",
            "paramFilter",
            "parentId",
            "pinnedAreaHeight",
            "pinnedParams",
            "positionAndSizeLocked",
            "selectedParams",
            "size",
            "topLevelParamIds",
            "type",
            "visibility",
        ]
    ] = Field(default_factory=set)


class DictRootSectionCore(BaseSectionCore):
    """Core configuration for DictRoot sections."""

    sharedModifier: DictRootSectionImplModifier
    unsharedKeys: set[
        Literal[
            "aspectRatio",
            "aspectRatioExtraHeight",
            "aspectRatioExtraWidth",
            "children",
            "id",
            "isFrozen",
            "isInOtherProjectConfigs",
            "isMinimized",
            "isPreset",
            "name",
            "parentId",
            "positionAndSizeLocked",
            "size",
            "type",
            "visibility",
        ]
    ] = Field(default_factory=set)


class DrawSectionCore(BaseSectionCore):
    """Core configuration for Draw sections."""

    sharedModifier: DrawSectionImplModifier
    unsharedKeys: set[
        Literal[
            "artifactGroupIds",
            "aspectRatio",
            "aspectRatioExtraHeight",
            "aspectRatioExtraWidth",
            "canvasSettings",
            "id",
            "isFrozen",
            "isInOtherProjectConfigs",
            "isMinimized",
            "isPreset",
            "name",
            "parentId",
            "positionAndSizeLocked",
            "renderedValue",
            "size",
            "type",
            "visibility",
        ]
    ] = Field(default_factory=set)


class GenPythonCodeSectionCore(BaseSectionCore):
    """Core configuration for GenPythonCode sections."""

    sharedModifier: GenPythonCodeSectionImplModifier
    unsharedKeys: set[
        Literal[
            "aspectRatio",
            "aspectRatioExtraHeight",
            "aspectRatioExtraWidth",
            "code",
            "id",
            "isFrozen",
            "isInOtherProjectConfigs",
            "isMinimized",
            "isPreset",
            "name",
            "parentId",
            "positionAndSizeLocked",
            "size",
            "type",
            "visibility",
        ]
    ] = Field(default_factory=set)


class GlobalVariablesSectionCore(BaseSectionCore):
    """Core configuration for GlobalVariables sections."""

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
            "id",
            "ignoreTypeErrors",
            "isFrozen",
            "isInOtherProjectConfigs",
            "isJsonSource",
            "isMinimized",
            "isPreset",
            "jsonSourceKeys",
            "jsonSourceMissing",
            "name",
            "paramFilter",
            "parentId",
            "pinnedAreaHeight",
            "pinnedParams",
            "positionAndSizeLocked",
            "selectedParams",
            "size",
            "topLevelParamIds",
            "type",
            "visibility",
        ]
    ] = Field(default_factory=set)


class GroupSectionCore(BaseSectionCore):
    """Core configuration for Group sections."""

    sharedModifier: GroupSectionImplModifier
    unsharedKeys: set[
        Literal[
            "aspectRatio",
            "aspectRatioExtraHeight",
            "aspectRatioExtraWidth",
            "children",
            "id",
            "isFrozen",
            "isHorizontalOrientation",
            "isInOtherProjectConfigs",
            "isMinimized",
            "isPreset",
            "name",
            "parentId",
            "positionAndSizeLocked",
            "size",
            "type",
            "visibility",
        ]
    ] = Field(default_factory=set)


class IFrameSectionCore(BaseSectionCore):
    """Core configuration for IFrame sections."""

    sharedModifier: IFrameSectionImplModifier
    unsharedKeys: set[
        Literal[
            "aspectRatio",
            "aspectRatioExtraHeight",
            "aspectRatioExtraWidth",
            "id",
            "isFrozen",
            "isInOtherProjectConfigs",
            "isMinimized",
            "isPreset",
            "name",
            "parentId",
            "positionAndSizeLocked",
            "size",
            "type",
            "visibility",
        ]
    ] = Field(default_factory=set)


class ImageSectionCore(BaseSectionCore):
    """Core configuration for Image sections."""

    sharedModifier: ImageSectionImplModifier
    unsharedKeys: set[
        Literal[
            "artifactGroupIds",
            "aspectRatio",
            "aspectRatioExtraHeight",
            "aspectRatioExtraWidth",
            "id",
            "isFrozen",
            "isInOtherProjectConfigs",
            "isMinimized",
            "isPreset",
            "name",
            "parentId",
            "positionAndSizeLocked",
            "size",
            "type",
            "visibility",
        ]
    ] = Field(default_factory=set)


class ListRootSectionCore(BaseSectionCore):
    """Core configuration for ListRoot sections."""

    sharedModifier: ListRootSectionImplModifier
    unsharedKeys: set[
        Literal[
            "aspectRatio",
            "aspectRatioExtraHeight",
            "aspectRatioExtraWidth",
            "children",
            "id",
            "isFrozen",
            "isInOtherProjectConfigs",
            "isMinimized",
            "isPreset",
            "name",
            "parentId",
            "positionAndSizeLocked",
            "size",
            "type",
            "visibility",
        ]
    ] = Field(default_factory=set)


class SocialSectionCore(BaseSectionCore):
    """Core configuration for Social sections."""

    sharedModifier: SocialSectionImplModifier
    unsharedKeys: set[
        Literal[
            "aspectRatio",
            "aspectRatioExtraHeight",
            "aspectRatioExtraWidth",
            "id",
            "isFrozen",
            "isInOtherProjectConfigs",
            "isMinimized",
            "isPreset",
            "name",
            "parentId",
            "positionAndSizeLocked",
            "size",
            "social",
            "type",
            "visibility",
        ]
    ] = Field(default_factory=set)


class TerminalSectionCore(BaseSectionCore):
    """Core configuration for Terminal sections."""

    sharedModifier: TerminalSectionImplModifier
    unsharedKeys: set[
        Literal[
            "aspectRatio",
            "aspectRatioExtraHeight",
            "aspectRatioExtraWidth",
            "id",
            "isFrozen",
            "isInOtherProjectConfigs",
            "isMinimized",
            "isPreset",
            "name",
            "parentId",
            "positionAndSizeLocked",
            "size",
            "type",
            "visibility",
        ]
    ] = Field(default_factory=set)


class TextBlockSectionCore(BaseSectionCore):
    """Core configuration for TextBlock sections."""

    sharedModifier: TextBlockSectionImplModifier
    unsharedKeys: set[
        Literal[
            "aspectRatio",
            "aspectRatioExtraHeight",
            "aspectRatioExtraWidth",
            "displayMode",
            "format",
            "headingAsSectionName",
            "id",
            "isFrozen",
            "isInOtherProjectConfigs",
            "isMinimized",
            "isPreset",
            "name",
            "parentId",
            "positionAndSizeLocked",
            "size",
            "text",
            "type",
            "visibility",
        ]
    ] = Field(default_factory=set)
