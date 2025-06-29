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
    unsharedKeys: list[BrowserSectionImplFields] = Field(default_factory=list)


class CallableSectionCore(BaseSectionCore):
    type: Literal[SectionType.Callable] = SectionType.Callable
    sharedModifier: CallableSectionImplModifier = Field(
        default_factory=lambda: create_modifier_for_section_type(SectionType.Callable)
    )
    unsharedKeys: list[CallableSectionImplFields] = Field(
        default_factory=lambda: ["callable", "codeObjImplLayeringMap"]
    )


class ChartSectionCore(BaseSectionCore):
    type: Literal[SectionType.Chart] = SectionType.Chart
    sharedModifier: ChartSectionImplModifier = Field(
        default_factory=lambda: create_modifier_for_section_type(SectionType.Chart)
    )
    unsharedKeys: list[ChartSectionImplFields] = Field(default_factory=list)


class ChatSectionCore(BaseSectionCore):
    type: Literal[SectionType.Chat] = SectionType.Chat
    sharedModifier: ChatSectionImplModifier = Field(
        default_factory=lambda: create_modifier_for_section_type(SectionType.Chat)
    )
    unsharedKeys: list[ChatSectionImplFields] = Field(default_factory=list)


class CodeSectionCore(BaseSectionCore):
    type: Literal[SectionType.Code] = SectionType.Code
    sharedModifier: CodeSectionImplModifier = Field(
        default_factory=lambda: create_modifier_for_section_type(SectionType.Code)
    )
    unsharedKeys: list[CodeSectionImplFields] = Field(default_factory=list)


class DictSectionCore(BaseSectionCore):
    type: Literal[SectionType.Dict] = SectionType.Dict
    sharedModifier: DictSectionImplModifier = Field(
        default_factory=lambda: create_modifier_for_section_type(SectionType.Dict)
    )
    unsharedKeys: list[DictSectionImplFields] = Field(
        default_factory=lambda: ["codeObjImplLayeringMap", "topLevelParamIds"]
    )


class DictRootSectionCore(BaseSectionCore):
    type: Literal[SectionType.DictRoot] = SectionType.DictRoot
    sharedModifier: DictRootSectionImplModifier = Field(
        default_factory=lambda: create_modifier_for_section_type(SectionType.DictRoot)
    )
    unsharedKeys: list[DictRootSectionImplFields] = Field(default_factory=list)


class DrawSectionCore(BaseSectionCore):
    type: Literal[SectionType.Draw] = SectionType.Draw
    sharedModifier: DrawSectionImplModifier = Field(
        default_factory=lambda: create_modifier_for_section_type(SectionType.Draw)
    )
    unsharedKeys: list[DrawSectionImplFields] = Field(default_factory=list)


class GenPythonCodeSectionCore(BaseSectionCore):
    type: Literal[SectionType.GenPythonCode] = SectionType.GenPythonCode
    sharedModifier: GenPythonCodeSectionImplModifier = Field(
        default_factory=lambda: create_modifier_for_section_type(
            SectionType.GenPythonCode
        )
    )
    unsharedKeys: list[GenPythonCodeSectionImplFields] = Field(default_factory=list)


class GlobalVariablesSectionCore(BaseSectionCore):
    type: Literal[SectionType.GlobalVariables] = SectionType.GlobalVariables
    sharedModifier: GlobalVariablesSectionImplModifier = Field(
        default_factory=lambda: create_modifier_for_section_type(
            SectionType.GlobalVariables
        )
    )
    unsharedKeys: list[GlobalVariablesSectionImplFields] = Field(default_factory=list)


class GroupSectionCore(BaseSectionCore):
    type: Literal[SectionType.Group] = SectionType.Group
    sharedModifier: GroupSectionImplModifier = Field(
        default_factory=lambda: create_modifier_for_section_type(SectionType.Group)
    )
    unsharedKeys: list[GroupSectionImplFields] = Field(default_factory=list)


class IFrameSectionCore(BaseSectionCore):
    type: Literal[SectionType.IFrame] = SectionType.IFrame
    sharedModifier: IFrameSectionImplModifier = Field(
        default_factory=lambda: create_modifier_for_section_type(SectionType.IFrame)
    )
    unsharedKeys: list[IFrameSectionImplFields] = Field(default_factory=list)


class ImageSectionCore(BaseSectionCore):
    type: Literal[SectionType.Image] = SectionType.Image
    sharedModifier: ImageSectionImplModifier = Field(
        default_factory=lambda: create_modifier_for_section_type(SectionType.Image)
    )
    unsharedKeys: list[ImageSectionImplFields] = Field(default_factory=list)


class ListRootSectionCore(BaseSectionCore):
    type: Literal[SectionType.ListRoot] = SectionType.ListRoot
    sharedModifier: ListRootSectionImplModifier = Field(
        default_factory=lambda: create_modifier_for_section_type(SectionType.ListRoot)
    )
    unsharedKeys: list[ListRootSectionImplFields] = Field(default_factory=list)


class SocialSectionCore(BaseSectionCore):
    type: Literal[SectionType.Social] = SectionType.Social
    sharedModifier: SocialSectionImplModifier = Field(
        default_factory=lambda: create_modifier_for_section_type(SectionType.Social)
    )
    unsharedKeys: list[SocialSectionImplFields] = Field(default_factory=list)


class TerminalSectionCore(BaseSectionCore):
    type: Literal[SectionType.Terminal] = SectionType.Terminal
    sharedModifier: TerminalSectionImplModifier = Field(
        default_factory=lambda: create_modifier_for_section_type(SectionType.Terminal)
    )
    unsharedKeys: list[TerminalSectionImplFields] = Field(default_factory=list)


class TextBlockSectionCore(BaseSectionCore):
    type: Literal[SectionType.TextBlock] = SectionType.TextBlock
    sharedModifier: TextBlockSectionImplModifier = Field(
        default_factory=lambda: create_modifier_for_section_type(SectionType.TextBlock)
    )
    unsharedKeys: list[TextBlockSectionImplFields] = Field(default_factory=list)
