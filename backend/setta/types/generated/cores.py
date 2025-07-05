from typing import Any

from pydantic import BaseModel, Field
from setta.database.utils import create_new_id
from setta.types.generated.modifiers import (
    BaseArtifactSectionModifier,
    BaseCanvasSectionModifier,
    BaseChildlessCodeObjModifier,
    BaseCodeSectionModifier,
    BaseDictSectionModifier,
    BaseParamCodeObjModifier,
    BaseParentCodeObjModifier,
    BaseParentSectionModifier,
    BaseSectionWithParamsModifier,
    BrowserSectionModifier,
    CallableSectionModifier,
    ChartSectionModifier,
    ChatSectionModifier,
    CodeCallableCodeObjModifier,
    CodeParamCodeObjModifier,
    CodeSectionModifier,
    ColorPickerParamCodeObjModifier,
    DictRootSectionModifier,
    DictSectionModifier,
    DrawSectionModifier,
    DropdownParamCodeObjModifier,
    GenPythonCodeSectionModifier,
    GlobalVariablesSectionModifier,
    GroupSectionModifier,
    IFrameSectionModifier,
    ImageSectionModifier,
    ListRootSectionModifier,
    NestedParamCodeObjModifier,
    PasswordParamCodeObjModifier,
    SliderParamCodeObjModifier,
    SocialSectionModifier,
    SwitchParamCodeObjModifier,
    TerminalSectionModifier,
    TextBlockSectionModifier,
    TextParamCodeObjModifier,
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
    sharedModifier: BaseSectionWithParamsModifier  # type: ignore


class BaseArtifactSectionCore(BaseSectionCore):
    sharedModifier: BaseArtifactSectionModifier  # type: ignore


class BaseCanvasSectionCore(BaseSectionCore):
    sharedModifier: BaseCanvasSectionModifier  # type: ignore


class BaseCodeSectionCore(BaseSectionCore):
    sharedModifier: BaseCodeSectionModifier  # type: ignore


class BaseParentSectionCore(BaseSectionCore):
    sharedModifier: BaseParentSectionModifier  # type: ignore


class BaseDictSectionCore(BaseSectionWithParamsCore):
    sharedModifier: BaseDictSectionModifier  # type: ignore


class CallableSectionCore(BaseSectionWithParamsCore):
    sharedModifier: CallableSectionModifier  # type: ignore


class DictSectionCore(BaseDictSectionCore):
    sharedModifier: DictSectionModifier  # type: ignore


class ListRootSectionCore(BaseParentSectionCore):
    sharedModifier: ListRootSectionModifier  # type: ignore


class DictRootSectionCore(BaseParentSectionCore):
    sharedModifier: DictRootSectionModifier  # type: ignore


class GroupSectionCore(BaseParentSectionCore):
    sharedModifier: GroupSectionModifier  # type: ignore


class ImageSectionCore(BaseArtifactSectionCore):
    sharedModifier: ImageSectionModifier  # type: ignore


class ChartSectionCore(BaseArtifactSectionCore, BaseCanvasSectionCore):
    sharedModifier: ChartSectionModifier  # type: ignore


class DrawSectionCore(BaseArtifactSectionCore, BaseCanvasSectionCore):
    sharedModifier: DrawSectionModifier  # type: ignore


class TextBlockSectionCore(BaseSectionCore):
    sharedModifier: TextBlockSectionModifier  # type: ignore


class SocialSectionCore(BaseSectionCore):
    sharedModifier: SocialSectionModifier  # type: ignore


class GlobalVariablesSectionCore(BaseDictSectionCore):
    sharedModifier: GlobalVariablesSectionModifier  # type: ignore


class CodeSectionCore(BaseCodeSectionCore):
    sharedModifier: CodeSectionModifier  # type: ignore


class GenPythonCodeSectionCore(BaseCodeSectionCore):
    sharedModifier: GenPythonCodeSectionModifier  # type: ignore


class TerminalSectionCore(BaseSectionCore):
    sharedModifier: TerminalSectionModifier  # type: ignore


class IFrameSectionCore(BaseSectionCore):
    sharedModifier: IFrameSectionModifier  # type: ignore


class ChatSectionCore(BaseSectionCore):
    sharedModifier: ChatSectionModifier  # type: ignore


class BrowserSectionCore(BaseSectionCore):
    sharedModifier: BrowserSectionModifier  # type: ignore


class BaseCodeObjCore(BaseModel, extra="forbid"):
    id: str = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
    implLayerings: list[str] = Field(default_factory=list)
    defaultImplLayering: str | None = None
    type: Any
    sharedModifier: Any
    unsharedKeys: Any


class BaseParamCodeObjCore(BaseCodeObjCore):
    sharedModifier: BaseParamCodeObjModifier  # type: ignore


class BaseChildlessCodeObjCore(BaseParamCodeObjCore):
    sharedModifier: BaseChildlessCodeObjModifier  # type: ignore


class BaseParentCodeObjCore(BaseCodeObjCore):
    sharedModifier: BaseParentCodeObjModifier  # type: ignore


class CodeCallableCodeObjCore(BaseParentCodeObjCore):
    sharedModifier: CodeCallableCodeObjModifier  # type: ignore


class CodeParamCodeObjCore(BaseChildlessCodeObjCore):
    sharedModifier: CodeParamCodeObjModifier  # type: ignore


class TextParamCodeObjCore(BaseChildlessCodeObjCore):
    sharedModifier: TextParamCodeObjModifier  # type: ignore


class SliderParamCodeObjCore(BaseChildlessCodeObjCore):
    sharedModifier: SliderParamCodeObjModifier  # type: ignore


class SwitchParamCodeObjCore(BaseChildlessCodeObjCore):
    sharedModifier: SwitchParamCodeObjModifier  # type: ignore


class ColorPickerParamCodeObjCore(BaseChildlessCodeObjCore):
    sharedModifier: ColorPickerParamCodeObjModifier  # type: ignore


class DropdownParamCodeObjCore(BaseChildlessCodeObjCore):
    sharedModifier: DropdownParamCodeObjModifier  # type: ignore


class PasswordParamCodeObjCore(BaseChildlessCodeObjCore):
    sharedModifier: PasswordParamCodeObjModifier  # type: ignore


class NestedParamCodeObjCore(BaseParamCodeObjCore, BaseParentCodeObjCore):
    sharedModifier: NestedParamCodeObjModifier  # type: ignore
