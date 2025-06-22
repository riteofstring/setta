from pydantic import Field

from setta.types.impl_layering import ImplLayering
from setta.types.section_impl_modifiers import (
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


class CallableSectionImplLayering(ImplLayering):
    modifier: CallableSectionImplModifier = Field(
        default_factory=CallableSectionImplModifier
    )


class DictSectionImplLayering(ImplLayering):
    modifier: DictSectionImplModifier = Field(default_factory=DictSectionImplModifier)


class ListRootSectionImplLayering(ImplLayering):
    modifier: ListRootSectionImplModifier = Field(
        default_factory=ListRootSectionImplModifier
    )


class DictRootSectionImplLayering(ImplLayering):
    modifier: DictRootSectionImplModifier = Field(
        default_factory=DictRootSectionImplModifier
    )


class GroupSectionImplLayering(ImplLayering):
    modifier: GroupSectionImplModifier = Field(default_factory=GroupSectionImplModifier)


class ImageSectionImplLayering(ImplLayering):
    modifier: ImageSectionImplModifier = Field(default_factory=ImageSectionImplModifier)


class ChartSectionImplLayering(ImplLayering):
    modifier: ChartSectionImplModifier = Field(default_factory=ChartSectionImplModifier)


class DrawSectionImplLayering(ImplLayering):
    modifier: DrawSectionImplModifier = Field(default_factory=DrawSectionImplModifier)


class TextBlockSectionImplLayering(ImplLayering):
    modifier: TextBlockSectionImplModifier = Field(
        default_factory=TextBlockSectionImplModifier
    )


class SocialSectionImplLayering(ImplLayering):
    modifier: SocialSectionImplModifier = Field(
        default_factory=SocialSectionImplModifier
    )


class GlobalVariablesSectionImplLayering(ImplLayering):
    modifier: GlobalVariablesSectionImplModifier = Field(
        default_factory=GlobalVariablesSectionImplModifier
    )


class CodeSectionImplLayering(ImplLayering):
    modifier: CodeSectionImplModifier = Field(default_factory=CodeSectionImplModifier)


class GenPythonCodeSectionImplLayering(ImplLayering):
    modifier: GenPythonCodeSectionImplModifier = Field(
        default_factory=GenPythonCodeSectionImplModifier
    )


class TerminalSectionImplLayering(ImplLayering):
    modifier: TerminalSectionImplModifier = Field(
        default_factory=TerminalSectionImplModifier
    )


class IFrameSectionImplLayering(ImplLayering):
    modifier: IFrameSectionImplModifier = Field(
        default_factory=IFrameSectionImplModifier
    )


class ChatSectionImplLayering(ImplLayering):
    modifier: ChatSectionImplModifier = Field(default_factory=ChatSectionImplModifier)


class BrowserSectionImplLayering(ImplLayering):
    modifier: BrowserSectionImplModifier = Field(
        default_factory=BrowserSectionImplModifier
    )
