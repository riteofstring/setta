from typing import Any

from pydantic import BaseModel, Field

from setta.database.utils import create_new_id
from setta.types.generated.impl_modifiers import (
    BaseArtifactSectionModifier,
    BaseCanvasSectionModifier,
    BaseCodeSectionModifier,
    BaseDictSectionModifier,
    BaseParentSectionModifier,
    BaseSectionWithParamsModifier,
    BrowserSectionModifier,
    CallableSectionModifier,
    ChartSectionModifier,
    ChatSectionModifier,
    CodeSectionModifier,
    DictRootSectionModifier,
    DictSectionModifier,
    DrawSectionModifier,
    GenPythonCodeSectionModifier,
    GlobalVariablesSectionModifier,
    GroupSectionModifier,
    IFrameSectionModifier,
    ImageSectionModifier,
    ListRootSectionModifier,
    SocialSectionModifier,
    TerminalSectionModifier,
    TextBlockSectionModifier,
)
from setta.utils.generate_memorable_string import generate_memorable_string


class BaseSectionCore(BaseModel, extra="forbid"):
    id: str = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
    implLayerings: list[str] = Field(default_factory=list)
    defaultImplLayering: str | None = None
    type: Any
    sharedModifier: Any
    unsharedKeys: Any


class BaseSectionWithParamsCore(BaseSectionCore):
    sharedModifier: BaseSectionWithParamsModifier


class BaseArtifactSectionCore(BaseSectionCore):
    sharedModifier: BaseArtifactSectionModifier


class BaseCanvasSectionCore(BaseSectionCore):
    sharedModifier: BaseCanvasSectionModifier


class BaseCodeSectionCore(BaseSectionCore):
    sharedModifier: BaseCodeSectionModifier


class BaseParentSectionCore(BaseSectionCore):
    sharedModifier: BaseParentSectionModifier


class BaseDictSectionCore(BaseSectionWithParamsCore):
    sharedModifier: BaseDictSectionModifier


class CallableSectionCore(BaseSectionWithParamsCore):
    sharedModifier: CallableSectionModifier


class DictSectionCore(BaseDictSectionCore):
    sharedModifier: DictSectionModifier


class ListRootSectionCore(BaseParentSectionCore):
    sharedModifier: ListRootSectionModifier


class DictRootSectionCore(BaseParentSectionCore):
    sharedModifier: DictRootSectionModifier


class GroupSectionCore(BaseParentSectionCore):
    sharedModifier: GroupSectionModifier


class ImageSectionCore(BaseArtifactSectionCore):
    sharedModifier: ImageSectionModifier


class ChartSectionCore(BaseArtifactSectionCore, BaseCanvasSectionCore):
    sharedModifier: ChartSectionModifier


class DrawSectionCore(BaseArtifactSectionCore, BaseCanvasSectionCore):
    sharedModifier: DrawSectionModifier


class TextBlockSectionCore(BaseSectionCore):
    sharedModifier: TextBlockSectionModifier


class SocialSectionCore(BaseSectionCore):
    sharedModifier: SocialSectionModifier


class GlobalVariablesSectionCore(BaseDictSectionCore):
    sharedModifier: GlobalVariablesSectionModifier


class CodeSectionCore(BaseCodeSectionCore):
    sharedModifier: CodeSectionModifier


class GenPythonCodeSectionCore(BaseCodeSectionCore):
    sharedModifier: GenPythonCodeSectionModifier


class TerminalSectionCore(BaseSectionCore):
    sharedModifier: TerminalSectionModifier


class IFrameSectionCore(BaseSectionCore):
    sharedModifier: IFrameSectionModifier


class ChatSectionCore(BaseSectionCore):
    sharedModifier: ChatSectionModifier


class BrowserSectionCore(BaseSectionCore):
    sharedModifier: BrowserSectionModifier
