# Auto-generated SectionCore classes - DO NOT EDIT MANUALLY
# Generated from section implementations

from typing import Literal

from pydantic import Field

from setta.types.generated.impl_field_literals import (
    BrowserSectionImplFields,
    CallableSectionImplFields,
    ChartSectionImplFields,
    ChatSectionImplFields,
    CodeSectionImplFields,
    DictRootSectionImplFields,
    DictSectionImplFields,
    DrawSectionImplFields,
    GenPythonCodeSectionImplFields,
    GlobalVariablesSectionImplFields,
    GroupSectionImplFields,
    IFrameSectionImplFields,
    ImageSectionImplFields,
    ListRootSectionImplFields,
    SocialSectionImplFields,
    TerminalSectionImplFields,
    TextBlockSectionImplFields,
)
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
from setta.types.generated.type_to_modifier import create_modifier_for_section_type
from setta.types.section_core import BaseSectionCore
from setta.types.section_impls import SectionType


class BrowserSectionCore(BaseSectionCore):
    type: Literal[SectionType.Browser] = SectionType.Browser
    sharedModifier: BrowserSectionImplModifier = Field(
        default_factory=lambda: create_modifier_for_section_type(SectionType.Browser)
    )
    unsharedKeys: set[BrowserSectionImplFields] = Field(default_factory=set)


class CallableSectionCore(BaseSectionCore):
    type: Literal[SectionType.Callable] = SectionType.Callable
    sharedModifier: CallableSectionImplModifier = Field(
        default_factory=lambda: create_modifier_for_section_type(SectionType.Callable)
    )
    unsharedKeys: set[CallableSectionImplFields] = Field(
        default_factory=lambda: {"callable", "codeObjImplLayeringMap"}
    )


class ChartSectionCore(BaseSectionCore):
    type: Literal[SectionType.Chart] = SectionType.Chart
    sharedModifier: ChartSectionImplModifier = Field(
        default_factory=lambda: create_modifier_for_section_type(SectionType.Chart)
    )
    unsharedKeys: set[ChartSectionImplFields] = Field(default_factory=set)


class ChatSectionCore(BaseSectionCore):
    type: Literal[SectionType.Chat] = SectionType.Chat
    sharedModifier: ChatSectionImplModifier = Field(
        default_factory=lambda: create_modifier_for_section_type(SectionType.Chat)
    )
    unsharedKeys: set[ChatSectionImplFields] = Field(default_factory=set)


class CodeSectionCore(BaseSectionCore):
    type: Literal[SectionType.Code] = SectionType.Code
    sharedModifier: CodeSectionImplModifier = Field(
        default_factory=lambda: create_modifier_for_section_type(SectionType.Code)
    )
    unsharedKeys: set[CodeSectionImplFields] = Field(default_factory=set)


class DictSectionCore(BaseSectionCore):
    type: Literal[SectionType.Dict] = SectionType.Dict
    sharedModifier: DictSectionImplModifier = Field(
        default_factory=lambda: create_modifier_for_section_type(SectionType.Dict)
    )
    unsharedKeys: set[DictSectionImplFields] = Field(
        default_factory=lambda: {"codeObjImplLayeringMap", "topLevelParamIds"}
    )


class DictRootSectionCore(BaseSectionCore):
    type: Literal[SectionType.DictRoot] = SectionType.DictRoot
    sharedModifier: DictRootSectionImplModifier = Field(
        default_factory=lambda: create_modifier_for_section_type(SectionType.DictRoot)
    )
    unsharedKeys: set[DictRootSectionImplFields] = Field(default_factory=set)


class DrawSectionCore(BaseSectionCore):
    type: Literal[SectionType.Draw] = SectionType.Draw
    sharedModifier: DrawSectionImplModifier = Field(
        default_factory=lambda: create_modifier_for_section_type(SectionType.Draw)
    )
    unsharedKeys: set[DrawSectionImplFields] = Field(default_factory=set)


class GenPythonCodeSectionCore(BaseSectionCore):
    type: Literal[SectionType.GenPythonCode] = SectionType.GenPythonCode
    sharedModifier: GenPythonCodeSectionImplModifier = Field(
        default_factory=lambda: create_modifier_for_section_type(
            SectionType.GenPythonCode
        )
    )
    unsharedKeys: set[GenPythonCodeSectionImplFields] = Field(default_factory=set)


class GlobalVariablesSectionCore(BaseSectionCore):
    type: Literal[SectionType.GlobalVariables] = SectionType.GlobalVariables
    sharedModifier: GlobalVariablesSectionImplModifier = Field(
        default_factory=lambda: create_modifier_for_section_type(
            SectionType.GlobalVariables
        )
    )
    unsharedKeys: set[GlobalVariablesSectionImplFields] = Field(default_factory=set)


class GroupSectionCore(BaseSectionCore):
    type: Literal[SectionType.Group] = SectionType.Group
    sharedModifier: GroupSectionImplModifier = Field(
        default_factory=lambda: create_modifier_for_section_type(SectionType.Group)
    )
    unsharedKeys: set[GroupSectionImplFields] = Field(default_factory=set)


class IFrameSectionCore(BaseSectionCore):
    type: Literal[SectionType.IFrame] = SectionType.IFrame
    sharedModifier: IFrameSectionImplModifier = Field(
        default_factory=lambda: create_modifier_for_section_type(SectionType.IFrame)
    )
    unsharedKeys: set[IFrameSectionImplFields] = Field(default_factory=set)


class ImageSectionCore(BaseSectionCore):
    type: Literal[SectionType.Image] = SectionType.Image
    sharedModifier: ImageSectionImplModifier = Field(
        default_factory=lambda: create_modifier_for_section_type(SectionType.Image)
    )
    unsharedKeys: set[ImageSectionImplFields] = Field(default_factory=set)


class ListRootSectionCore(BaseSectionCore):
    type: Literal[SectionType.ListRoot] = SectionType.ListRoot
    sharedModifier: ListRootSectionImplModifier = Field(
        default_factory=lambda: create_modifier_for_section_type(SectionType.ListRoot)
    )
    unsharedKeys: set[ListRootSectionImplFields] = Field(default_factory=set)


class SocialSectionCore(BaseSectionCore):
    type: Literal[SectionType.Social] = SectionType.Social
    sharedModifier: SocialSectionImplModifier = Field(
        default_factory=lambda: create_modifier_for_section_type(SectionType.Social)
    )
    unsharedKeys: set[SocialSectionImplFields] = Field(default_factory=set)


class TerminalSectionCore(BaseSectionCore):
    type: Literal[SectionType.Terminal] = SectionType.Terminal
    sharedModifier: TerminalSectionImplModifier = Field(
        default_factory=lambda: create_modifier_for_section_type(SectionType.Terminal)
    )
    unsharedKeys: set[TerminalSectionImplFields] = Field(default_factory=set)


class TextBlockSectionCore(BaseSectionCore):
    type: Literal[SectionType.TextBlock] = SectionType.TextBlock
    sharedModifier: TextBlockSectionImplModifier = Field(
        default_factory=lambda: create_modifier_for_section_type(SectionType.TextBlock)
    )
    unsharedKeys: set[TextBlockSectionImplFields] = Field(default_factory=set)
