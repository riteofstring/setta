from pydantic import Field
from setta.types.impl_layering import BaseImplLayering
from setta.types.section_impl_modifiers import (
    BaseArtifactSectionImplModifier,
    BaseCanvasSectionImplModifier,
    BaseCodeSectionImplModifier,
    BaseDictSectionImplModifier,
    BaseParentSectionImplModifier,
    BaseSectionImplModifier,
    BaseSectionWithParamsImplModifier,
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
    modifier: BaseSectionImplModifier = Field(  # type: ignore
        default_factory=BaseSectionImplModifier
    )


class BaseSectionWithParamsImplLayering(BaseSectionImplLayering):
    modifier: BaseSectionWithParamsImplModifier = Field(  # type: ignore
        default_factory=BaseSectionWithParamsImplModifier
    )


class BaseArtifactSectionImplLayering(BaseSectionImplLayering):
    modifier: BaseArtifactSectionImplModifier = Field(  # type: ignore
        default_factory=BaseArtifactSectionImplModifier
    )


class BaseCanvasSectionImplLayering(BaseSectionImplLayering):
    modifier: BaseCanvasSectionImplModifier = Field(  # type: ignore
        default_factory=BaseCanvasSectionImplModifier
    )


class BaseCodeSectionImplLayering(BaseSectionImplLayering):
    modifier: BaseCodeSectionImplModifier = Field(  # type: ignore
        default_factory=BaseCodeSectionImplModifier
    )


class BaseParentSectionImplLayering(BaseSectionImplLayering):
    modifier: BaseParentSectionImplModifier = Field(  # type: ignore
        default_factory=BaseParentSectionImplModifier
    )


class BaseDictSectionImplLayering(BaseSectionWithParamsImplLayering):
    modifier: BaseDictSectionImplModifier = Field(  # type: ignore
        default_factory=BaseDictSectionImplModifier
    )


class CallableSectionImplLayering(BaseSectionWithParamsImplLayering):
    modifier: CallableSectionImplModifier = Field(  # type: ignore
        default_factory=CallableSectionImplModifier
    )


class DictSectionImplLayering(BaseDictSectionImplLayering):
    modifier: DictSectionImplModifier = Field(  # type: ignore
        default_factory=DictSectionImplModifier
    )


class ListRootSectionImplLayering(BaseParentSectionImplLayering):
    modifier: ListRootSectionImplModifier = Field(  # type: ignore
        default_factory=ListRootSectionImplModifier
    )


class DictRootSectionImplLayering(BaseParentSectionImplLayering):
    modifier: DictRootSectionImplModifier = Field(  # type: ignore
        default_factory=DictRootSectionImplModifier
    )


class GroupSectionImplLayering(BaseParentSectionImplLayering):
    modifier: GroupSectionImplModifier = Field(  # type: ignore
        default_factory=GroupSectionImplModifier
    )


class ImageSectionImplLayering(BaseArtifactSectionImplLayering):
    modifier: ImageSectionImplModifier = Field(  # type: ignore
        default_factory=ImageSectionImplModifier
    )


class ChartSectionImplLayering(BaseArtifactSectionImplLayering):
    modifier: ChartSectionImplModifier = Field(  # type: ignore
        default_factory=ChartSectionImplModifier
    )


class DrawSectionImplLayering(BaseArtifactSectionImplLayering):
    modifier: DrawSectionImplModifier = Field(  # type: ignore
        default_factory=DrawSectionImplModifier
    )


class TextBlockSectionImplLayering(BaseSectionImplLayering):
    modifier: TextBlockSectionImplModifier = Field(  # type: ignore
        default_factory=TextBlockSectionImplModifier
    )


class SocialSectionImplLayering(BaseSectionImplLayering):
    modifier: SocialSectionImplModifier = Field(  # type: ignore
        default_factory=SocialSectionImplModifier
    )


class GlobalVariablesSectionImplLayering(BaseDictSectionImplLayering):
    modifier: GlobalVariablesSectionImplModifier = Field(  # type: ignore
        default_factory=GlobalVariablesSectionImplModifier
    )


class CodeSectionImplLayering(BaseCodeSectionImplLayering):
    modifier: CodeSectionImplModifier = Field(  # type: ignore
        default_factory=CodeSectionImplModifier
    )


class GenPythonCodeSectionImplLayering(BaseCodeSectionImplLayering):
    modifier: GenPythonCodeSectionImplModifier = Field(  # type: ignore
        default_factory=GenPythonCodeSectionImplModifier
    )


class TerminalSectionImplLayering(BaseSectionImplLayering):
    modifier: TerminalSectionImplModifier = Field(  # type: ignore
        default_factory=TerminalSectionImplModifier
    )


class IFrameSectionImplLayering(BaseSectionImplLayering):
    modifier: IFrameSectionImplModifier = Field(  # type: ignore
        default_factory=IFrameSectionImplModifier
    )


class ChatSectionImplLayering(BaseSectionImplLayering):
    modifier: ChatSectionImplModifier = Field(  # type: ignore
        default_factory=ChatSectionImplModifier
    )


class BrowserSectionImplLayering(BaseSectionImplLayering):
    modifier: BrowserSectionImplModifier = Field(  # type: ignore
        default_factory=BrowserSectionImplModifier
    )
