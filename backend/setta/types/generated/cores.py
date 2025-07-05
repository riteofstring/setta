from typing import Any, Literal

from pydantic import BaseModel, Field

from setta.database.utils import create_new_id
from setta.types.code_obj_impls import CodeObjType
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
from setta.types.section_impls import SectionType
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
    type: Any
    sharedModifier: BaseSectionWithParamsModifier  # type: ignore


class BaseArtifactSectionCore(BaseSectionCore):
    type: Any
    sharedModifier: BaseArtifactSectionModifier  # type: ignore


class BaseCanvasSectionCore(BaseSectionCore):
    type: Any
    sharedModifier: BaseCanvasSectionModifier  # type: ignore


class BaseCodeSectionCore(BaseSectionCore):
    type: Any
    sharedModifier: BaseCodeSectionModifier  # type: ignore


class BaseParentSectionCore(BaseSectionCore):
    type: Any
    sharedModifier: BaseParentSectionModifier  # type: ignore


class BaseDictSectionCore(BaseSectionWithParamsCore):
    type: Any
    sharedModifier: BaseDictSectionModifier  # type: ignore


class CallableSectionCore(BaseSectionWithParamsCore):
    type: Literal[SectionType.Callable] = SectionType.Callable
    sharedModifier: CallableSectionModifier  # type: ignore


class DictSectionCore(BaseDictSectionCore):
    type: Literal[SectionType.Dict] = SectionType.Dict
    sharedModifier: DictSectionModifier  # type: ignore


class ListRootSectionCore(BaseParentSectionCore):
    type: Literal[SectionType.ListRoot] = SectionType.ListRoot
    sharedModifier: ListRootSectionModifier  # type: ignore


class DictRootSectionCore(BaseParentSectionCore):
    type: Literal[SectionType.DictRoot] = SectionType.DictRoot
    sharedModifier: DictRootSectionModifier  # type: ignore


class GroupSectionCore(BaseParentSectionCore):
    type: Literal[SectionType.Group] = SectionType.Group
    sharedModifier: GroupSectionModifier  # type: ignore


class ImageSectionCore(BaseArtifactSectionCore):
    type: Literal[SectionType.Image] = SectionType.Image
    sharedModifier: ImageSectionModifier  # type: ignore


class ChartSectionCore(BaseArtifactSectionCore, BaseCanvasSectionCore):
    type: Literal[SectionType.Chart] = SectionType.Chart
    sharedModifier: ChartSectionModifier  # type: ignore


class DrawSectionCore(BaseArtifactSectionCore, BaseCanvasSectionCore):
    type: Literal[SectionType.Draw] = SectionType.Draw
    sharedModifier: DrawSectionModifier  # type: ignore


class TextBlockSectionCore(BaseSectionCore):
    type: Literal[SectionType.TextBlock] = SectionType.TextBlock
    sharedModifier: TextBlockSectionModifier  # type: ignore


class SocialSectionCore(BaseSectionCore):
    type: Literal[SectionType.Social] = SectionType.Social
    sharedModifier: SocialSectionModifier  # type: ignore


class GlobalVariablesSectionCore(BaseDictSectionCore):
    type: Literal[SectionType.GlobalVariables] = SectionType.GlobalVariables
    sharedModifier: GlobalVariablesSectionModifier  # type: ignore


class CodeSectionCore(BaseCodeSectionCore):
    type: Literal[SectionType.Code] = SectionType.Code
    sharedModifier: CodeSectionModifier  # type: ignore


class GenPythonCodeSectionCore(BaseCodeSectionCore):
    type: Literal[SectionType.GenPythonCode] = SectionType.GenPythonCode
    sharedModifier: GenPythonCodeSectionModifier  # type: ignore


class TerminalSectionCore(BaseSectionCore):
    type: Literal[SectionType.Terminal] = SectionType.Terminal
    sharedModifier: TerminalSectionModifier  # type: ignore


class IFrameSectionCore(BaseSectionCore):
    type: Literal[SectionType.IFrame] = SectionType.IFrame
    sharedModifier: IFrameSectionModifier  # type: ignore


class ChatSectionCore(BaseSectionCore):
    type: Literal[SectionType.Chat] = SectionType.Chat
    sharedModifier: ChatSectionModifier  # type: ignore


class BrowserSectionCore(BaseSectionCore):
    type: Literal[SectionType.Browser] = SectionType.Browser
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
    type: Any
    sharedModifier: BaseParamCodeObjModifier  # type: ignore


class BaseChildlessCodeObjCore(BaseParamCodeObjCore):
    type: Any
    sharedModifier: BaseChildlessCodeObjModifier  # type: ignore


class BaseParentCodeObjCore(BaseCodeObjCore):
    type: Any
    sharedModifier: BaseParentCodeObjModifier  # type: ignore


class CodeCallableCodeObjCore(BaseParentCodeObjCore):
    type: Literal[CodeObjType.CodeCallable] = CodeObjType.CodeCallable
    sharedModifier: CodeCallableCodeObjModifier  # type: ignore


class CodeParamCodeObjCore(BaseChildlessCodeObjCore):
    type: Literal[CodeObjType.CodeParam] = CodeObjType.CodeParam
    sharedModifier: CodeParamCodeObjModifier  # type: ignore


class TextParamCodeObjCore(BaseChildlessCodeObjCore):
    type: Literal[CodeObjType.TextParam] = CodeObjType.TextParam
    sharedModifier: TextParamCodeObjModifier  # type: ignore


class SliderParamCodeObjCore(BaseChildlessCodeObjCore):
    type: Literal[CodeObjType.SliderParam] = CodeObjType.SliderParam
    sharedModifier: SliderParamCodeObjModifier  # type: ignore


class SwitchParamCodeObjCore(BaseChildlessCodeObjCore):
    type: Literal[CodeObjType.SwitchParam] = CodeObjType.SwitchParam
    sharedModifier: SwitchParamCodeObjModifier  # type: ignore


class ColorPickerParamCodeObjCore(BaseChildlessCodeObjCore):
    type: Literal[CodeObjType.ColorPickerParam] = CodeObjType.ColorPickerParam
    sharedModifier: ColorPickerParamCodeObjModifier  # type: ignore


class DropdownParamCodeObjCore(BaseChildlessCodeObjCore):
    type: Literal[CodeObjType.DropdownParam] = CodeObjType.DropdownParam
    sharedModifier: DropdownParamCodeObjModifier  # type: ignore


class PasswordParamCodeObjCore(BaseChildlessCodeObjCore):
    type: Literal[CodeObjType.PasswordParam] = CodeObjType.PasswordParam
    sharedModifier: PasswordParamCodeObjModifier  # type: ignore


class NestedParamCodeObjCore(BaseParamCodeObjCore, BaseParentCodeObjCore):
    type: Literal[CodeObjType.NestedParam] = CodeObjType.NestedParam
    sharedModifier: NestedParamCodeObjModifier  # type: ignore
