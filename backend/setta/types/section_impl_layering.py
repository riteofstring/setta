from typing import Any

from pydantic import Field

from setta.types.impl_layering import BaseImplLayering
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


class BaseSectionImplLayering(BaseImplLayering):
    modifier: Any


class BaseSectionWithParamsImplLayering(BaseSectionImplLayering):
    modifier: Any


class BaseArtifactSectionImplLayering(BaseSectionImplLayering):
    modifier: Any


class BaseCanvasSectionImplLayering(BaseSectionImplLayering):
    modifier: Any


class BaseCodeSectionImplLayering(BaseSectionImplLayering):
    modifier: Any


class BaseParentSectionImplLayering(BaseSectionImplLayering):
    modifier: Any


class BaseDictSectionImplLayering(BaseSectionWithParamsImplLayering):
    modifier: Any


class CallableSectionImplLayering(BaseSectionWithParamsImplLayering):
    modifier: CallableSectionImplModifier = Field(
        default_factory=CallableSectionImplModifier
    )


class DictSectionImplLayering(BaseDictSectionImplLayering):
    modifier: DictSectionImplModifier = Field(default_factory=DictSectionImplModifier)


class ListRootSectionImplLayering(BaseParentSectionImplLayering):
    modifier: ListRootSectionImplModifier = Field(
        default_factory=ListRootSectionImplModifier
    )


class DictRootSectionImplLayering(BaseParentSectionImplLayering):
    modifier: DictRootSectionImplModifier = Field(
        default_factory=DictRootSectionImplModifier
    )


class GroupSectionImplLayering(BaseParentSectionImplLayering):
    modifier: GroupSectionImplModifier = Field(default_factory=GroupSectionImplModifier)


class ImageSectionImplLayering(BaseArtifactSectionImplLayering):
    modifier: ImageSectionImplModifier = Field(default_factory=ImageSectionImplModifier)


class ChartSectionImplLayering(BaseArtifactSectionImplLayering):
    modifier: ChartSectionImplModifier = Field(default_factory=ChartSectionImplModifier)


class DrawSectionImplLayering(BaseArtifactSectionImplLayering):
    modifier: DrawSectionImplModifier = Field(default_factory=DrawSectionImplModifier)


class TextBlockSectionImplLayering(BaseSectionImplLayering):
    modifier: TextBlockSectionImplModifier = Field(
        default_factory=TextBlockSectionImplModifier
    )


class SocialSectionImplLayering(BaseSectionImplLayering):
    modifier: SocialSectionImplModifier = Field(
        default_factory=SocialSectionImplModifier
    )


class GlobalVariablesSectionImplLayering(BaseDictSectionImplLayering):
    modifier: GlobalVariablesSectionImplModifier = Field(
        default_factory=GlobalVariablesSectionImplModifier
    )


class CodeSectionImplLayering(BaseCodeSectionImplLayering):
    modifier: CodeSectionImplModifier = Field(default_factory=CodeSectionImplModifier)


class GenPythonCodeSectionImplLayering(BaseCodeSectionImplLayering):
    modifier: GenPythonCodeSectionImplModifier = Field(
        default_factory=GenPythonCodeSectionImplModifier
    )


class TerminalSectionImplLayering(BaseSectionImplLayering):
    modifier: TerminalSectionImplModifier = Field(
        default_factory=TerminalSectionImplModifier
    )


class IFrameSectionImplLayering(BaseSectionImplLayering):
    modifier: IFrameSectionImplModifier = Field(
        default_factory=IFrameSectionImplModifier
    )


class ChatSectionImplLayering(BaseSectionImplLayering):
    modifier: ChatSectionImplModifier = Field(default_factory=ChatSectionImplModifier)


class BrowserSectionImplLayering(BaseSectionImplLayering):
    modifier: BrowserSectionImplModifier = Field(
        default_factory=BrowserSectionImplModifier
    )
