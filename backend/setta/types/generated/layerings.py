from typing import Any, Literal

from pydantic import BaseModel, Field

from setta.database.utils import create_new_id
from setta.types.code_obj_impls import CodeObjType
from setta.types.generated.modifiers import (
    BaseArtifactSectionModifier,
    BaseCanvasSectionModifier,
    BaseChildlessCodeObjModifier,
    BaseCodeObjModifier,
    BaseCodeSectionModifier,
    BaseDictSectionModifier,
    BaseParamCodeObjModifier,
    BaseParentCodeObjModifier,
    BaseParentSectionModifier,
    BaseSectionModifier,
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


class BaseSectionLayering(BaseModel, extra="forbid"):
    id: str = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
    impl: str
    type: Any
    modifier: BaseSectionModifier


class BaseSectionWithParamsLayering(BaseSectionLayering):
    type: Any
    modifier: BaseSectionWithParamsModifier  # type: ignore


class BaseArtifactSectionLayering(BaseSectionLayering):
    type: Any
    modifier: BaseArtifactSectionModifier  # type: ignore


class BaseCanvasSectionLayering(BaseSectionLayering):
    type: Any
    modifier: BaseCanvasSectionModifier  # type: ignore


class BaseCodeSectionLayering(BaseSectionLayering):
    type: Any
    modifier: BaseCodeSectionModifier  # type: ignore


class BaseParentSectionLayering(BaseSectionLayering):
    type: Any
    modifier: BaseParentSectionModifier  # type: ignore


class BaseDictSectionLayering(BaseSectionWithParamsLayering):
    type: Any
    modifier: BaseDictSectionModifier  # type: ignore


class CallableSectionLayering(BaseSectionWithParamsLayering):
    type: Literal[SectionType.Callable] = SectionType.Callable
    modifier: CallableSectionModifier  # type: ignore


class DictSectionLayering(BaseDictSectionLayering):
    type: Literal[SectionType.Dict] = SectionType.Dict
    modifier: DictSectionModifier  # type: ignore


class ListRootSectionLayering(BaseParentSectionLayering):
    type: Literal[SectionType.ListRoot] = SectionType.ListRoot
    modifier: ListRootSectionModifier  # type: ignore


class DictRootSectionLayering(BaseParentSectionLayering):
    type: Literal[SectionType.DictRoot] = SectionType.DictRoot
    modifier: DictRootSectionModifier  # type: ignore


class GroupSectionLayering(BaseParentSectionLayering):
    type: Literal[SectionType.Group] = SectionType.Group
    modifier: GroupSectionModifier  # type: ignore


class ImageSectionLayering(BaseArtifactSectionLayering):
    type: Literal[SectionType.Image] = SectionType.Image
    modifier: ImageSectionModifier  # type: ignore


class ChartSectionLayering(BaseArtifactSectionLayering, BaseCanvasSectionLayering):
    type: Literal[SectionType.Chart] = SectionType.Chart
    modifier: ChartSectionModifier  # type: ignore


class DrawSectionLayering(BaseArtifactSectionLayering, BaseCanvasSectionLayering):
    type: Literal[SectionType.Draw] = SectionType.Draw
    modifier: DrawSectionModifier  # type: ignore


class TextBlockSectionLayering(BaseSectionLayering):
    type: Literal[SectionType.TextBlock] = SectionType.TextBlock
    modifier: TextBlockSectionModifier  # type: ignore


class SocialSectionLayering(BaseSectionLayering):
    type: Literal[SectionType.Social] = SectionType.Social
    modifier: SocialSectionModifier  # type: ignore


class GlobalVariablesSectionLayering(BaseDictSectionLayering):
    type: Literal[SectionType.GlobalVariables] = SectionType.GlobalVariables
    modifier: GlobalVariablesSectionModifier  # type: ignore


class CodeSectionLayering(BaseCodeSectionLayering):
    type: Literal[SectionType.Code] = SectionType.Code
    modifier: CodeSectionModifier  # type: ignore


class GenPythonCodeSectionLayering(BaseCodeSectionLayering):
    type: Literal[SectionType.GenPythonCode] = SectionType.GenPythonCode
    modifier: GenPythonCodeSectionModifier  # type: ignore


class TerminalSectionLayering(BaseSectionLayering):
    type: Literal[SectionType.Terminal] = SectionType.Terminal
    modifier: TerminalSectionModifier  # type: ignore


class IFrameSectionLayering(BaseSectionLayering):
    type: Literal[SectionType.IFrame] = SectionType.IFrame
    modifier: IFrameSectionModifier  # type: ignore


class ChatSectionLayering(BaseSectionLayering):
    type: Literal[SectionType.Chat] = SectionType.Chat
    modifier: ChatSectionModifier  # type: ignore


class BrowserSectionLayering(BaseSectionLayering):
    type: Literal[SectionType.Browser] = SectionType.Browser
    modifier: BrowserSectionModifier  # type: ignore


class BaseCodeObjLayering(BaseModel, extra="forbid"):
    id: str = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
    impl: str
    type: Any
    modifier: BaseCodeObjModifier


class BaseParamCodeObjLayering(BaseCodeObjLayering):
    type: Any
    modifier: BaseParamCodeObjModifier  # type: ignore


class BaseChildlessCodeObjLayering(BaseParamCodeObjLayering):
    type: Any
    modifier: BaseChildlessCodeObjModifier  # type: ignore


class BaseParentCodeObjLayering(BaseCodeObjLayering):
    type: Any
    modifier: BaseParentCodeObjModifier  # type: ignore


class CodeCallableCodeObjLayering(BaseParentCodeObjLayering):
    type: Literal[CodeObjType.CodeCallable] = CodeObjType.CodeCallable
    modifier: CodeCallableCodeObjModifier  # type: ignore


class CodeParamCodeObjLayering(BaseChildlessCodeObjLayering):
    type: Literal[CodeObjType.CodeParam] = CodeObjType.CodeParam
    modifier: CodeParamCodeObjModifier  # type: ignore


class TextParamCodeObjLayering(BaseChildlessCodeObjLayering):
    type: Literal[CodeObjType.TextParam] = CodeObjType.TextParam
    modifier: TextParamCodeObjModifier  # type: ignore


class SliderParamCodeObjLayering(BaseChildlessCodeObjLayering):
    type: Literal[CodeObjType.SliderParam] = CodeObjType.SliderParam
    modifier: SliderParamCodeObjModifier  # type: ignore


class SwitchParamCodeObjLayering(BaseChildlessCodeObjLayering):
    type: Literal[CodeObjType.SwitchParam] = CodeObjType.SwitchParam
    modifier: SwitchParamCodeObjModifier  # type: ignore


class ColorPickerParamCodeObjLayering(BaseChildlessCodeObjLayering):
    type: Literal[CodeObjType.ColorPickerParam] = CodeObjType.ColorPickerParam
    modifier: ColorPickerParamCodeObjModifier  # type: ignore


class DropdownParamCodeObjLayering(BaseChildlessCodeObjLayering):
    type: Literal[CodeObjType.DropdownParam] = CodeObjType.DropdownParam
    modifier: DropdownParamCodeObjModifier  # type: ignore


class PasswordParamCodeObjLayering(BaseChildlessCodeObjLayering):
    type: Literal[CodeObjType.PasswordParam] = CodeObjType.PasswordParam
    modifier: PasswordParamCodeObjModifier  # type: ignore


class NestedParamCodeObjLayering(BaseParamCodeObjLayering, BaseParentCodeObjLayering):
    type: Literal[CodeObjType.NestedParam] = CodeObjType.NestedParam
    modifier: NestedParamCodeObjModifier  # type: ignore
