# Auto-generated ImplLayering classes - DO NOT EDIT MANUALLY
# Generated from impl modifier classes

from typing import Any, Literal

from pydantic import BaseModel, Field

from setta.database.utils import create_new_id
from setta.types.code_obj_impls import CodeObjType
from setta.types.generated.impl_modifiers import (
    BaseArtifactSectionImplModifier,
    BaseCanvasSectionImplModifier,
    BaseChildlessCodeObjImplModifier,
    BaseCodeObjImplModifier,
    BaseCodeSectionImplModifier,
    BaseDictSectionImplModifier,
    BaseParamCodeObjImplModifier,
    BaseParentCodeObjImplModifier,
    BaseParentSectionImplModifier,
    BaseSectionImplModifier,
    BaseSectionWithParamsImplModifier,
    BrowserSectionImplModifier,
    CallableSectionImplModifier,
    ChartSectionImplModifier,
    ChatSectionImplModifier,
    CodeCallableCodeObjImplModifier,
    CodeParamCodeObjImplModifier,
    CodeSectionImplModifier,
    ColorPickerParamCodeObjImplModifier,
    DictRootSectionImplModifier,
    DictSectionImplModifier,
    DrawSectionImplModifier,
    DropdownParamCodeObjImplModifier,
    GenPythonCodeSectionImplModifier,
    GlobalVariablesSectionImplModifier,
    GroupSectionImplModifier,
    IFrameSectionImplModifier,
    ImageSectionImplModifier,
    ListRootSectionImplModifier,
    NestedParamCodeObjImplModifier,
    PasswordParamCodeObjImplModifier,
    SliderParamCodeObjImplModifier,
    SocialSectionImplModifier,
    SwitchParamCodeObjImplModifier,
    TerminalSectionImplModifier,
    TextBlockSectionImplModifier,
    TextParamCodeObjImplModifier,
)
from setta.types.section_impls import SectionType
from setta.utils.generate_memorable_string import generate_memorable_string


class BaseImplLayering(BaseModel):
    """Base class for all ImplLayering types."""

    id: str = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
    impl: str
    type: Any
    modifier: Any


# ============== Section Layering Classes ==============
class BaseSectionImplLayering(BaseImplLayering):
    """Base class for SectionImplLayering types."""

    type: Any
    modifier: BaseSectionImplModifier


class BaseSectionWithParamsImplLayering(BaseSectionImplLayering):
    """Base class for SectionWithParamsImplLayering types."""

    type: Any
    modifier: BaseSectionWithParamsImplModifier


class BaseArtifactSectionImplLayering(BaseSectionImplLayering):
    """Base class for ArtifactSectionImplLayering types."""

    type: Any
    modifier: BaseArtifactSectionImplModifier


class BaseCanvasSectionImplLayering(BaseSectionImplLayering):
    """Base class for CanvasSectionImplLayering types."""

    type: Any
    modifier: BaseCanvasSectionImplModifier


class BaseCodeSectionImplLayering(BaseSectionImplLayering):
    """Base class for CodeSectionImplLayering types."""

    type: Any
    modifier: BaseCodeSectionImplModifier


class BaseParentSectionImplLayering(BaseSectionImplLayering):
    """Base class for ParentSectionImplLayering types."""

    type: Any
    modifier: BaseParentSectionImplModifier


class BaseDictSectionImplLayering(BaseSectionWithParamsImplLayering):
    """Base class for DictSectionImplLayering types."""

    type: Any
    modifier: BaseDictSectionImplModifier


class CallableSectionImplLayering(BaseSectionWithParamsImplLayering):
    type: Literal[SectionType.Callable] = SectionType.Callable
    modifier: CallableSectionImplModifier


class DictSectionImplLayering(BaseDictSectionImplLayering):
    type: Literal[SectionType.Dict] = SectionType.Dict
    modifier: DictSectionImplModifier


class ListRootSectionImplLayering(BaseParentSectionImplLayering):
    type: Literal[SectionType.ListRoot] = SectionType.ListRoot
    modifier: ListRootSectionImplModifier


class DictRootSectionImplLayering(BaseParentSectionImplLayering):
    type: Literal[SectionType.DictRoot] = SectionType.DictRoot
    modifier: DictRootSectionImplModifier


class GroupSectionImplLayering(BaseParentSectionImplLayering):
    type: Literal[SectionType.Group] = SectionType.Group
    modifier: GroupSectionImplModifier


class ImageSectionImplLayering(BaseArtifactSectionImplLayering):
    type: Literal[SectionType.Image] = SectionType.Image
    modifier: ImageSectionImplModifier


class ChartSectionImplLayering(BaseArtifactSectionImplLayering):
    type: Literal[SectionType.Chart] = SectionType.Chart
    modifier: ChartSectionImplModifier


class DrawSectionImplLayering(BaseArtifactSectionImplLayering):
    type: Literal[SectionType.Draw] = SectionType.Draw
    modifier: DrawSectionImplModifier


class TextBlockSectionImplLayering(BaseSectionImplLayering):
    type: Literal[SectionType.TextBlock] = SectionType.TextBlock
    modifier: TextBlockSectionImplModifier


class SocialSectionImplLayering(BaseSectionImplLayering):
    type: Literal[SectionType.Social] = SectionType.Social
    modifier: SocialSectionImplModifier


class GlobalVariablesSectionImplLayering(BaseDictSectionImplLayering):
    type: Literal[SectionType.GlobalVariables] = SectionType.GlobalVariables
    modifier: GlobalVariablesSectionImplModifier


class CodeSectionImplLayering(BaseCodeSectionImplLayering):
    type: Literal[SectionType.Code] = SectionType.Code
    modifier: CodeSectionImplModifier


class GenPythonCodeSectionImplLayering(BaseCodeSectionImplLayering):
    type: Literal[SectionType.GenPythonCode] = SectionType.GenPythonCode
    modifier: GenPythonCodeSectionImplModifier


class TerminalSectionImplLayering(BaseSectionImplLayering):
    type: Literal[SectionType.Terminal] = SectionType.Terminal
    modifier: TerminalSectionImplModifier


class IFrameSectionImplLayering(BaseSectionImplLayering):
    type: Literal[SectionType.IFrame] = SectionType.IFrame
    modifier: IFrameSectionImplModifier


class ChatSectionImplLayering(BaseSectionImplLayering):
    type: Literal[SectionType.Chat] = SectionType.Chat
    modifier: ChatSectionImplModifier


class BrowserSectionImplLayering(BaseSectionImplLayering):
    type: Literal[SectionType.Browser] = SectionType.Browser
    modifier: BrowserSectionImplModifier


# ============== Code Object Layering Classes ==============
class BaseCodeObjImplLayering(BaseImplLayering):
    """Base class for CodeObjImplLayering types."""

    type: Any
    modifier: BaseCodeObjImplModifier


class BaseParamCodeObjImplLayering(BaseCodeObjImplLayering):
    """Base class for ParamCodeObjImplLayering types."""

    type: Any
    modifier: BaseParamCodeObjImplModifier


class BaseChildlessCodeObjImplLayering(BaseParamCodeObjImplLayering):
    """Base class for ChildlessCodeObjImplLayering types."""

    type: Any
    modifier: BaseChildlessCodeObjImplModifier


class BaseParentCodeObjImplLayering(BaseCodeObjImplLayering):
    """Base class for ParentCodeObjImplLayering types."""

    type: Any
    modifier: BaseParentCodeObjImplModifier


class CodeCallableCodeObjImplLayering(BaseParentCodeObjImplLayering):
    type: Literal[CodeObjType.CodeCallable] = CodeObjType.CodeCallable
    modifier: CodeCallableCodeObjImplModifier


class CodeParamCodeObjImplLayering(BaseChildlessCodeObjImplLayering):
    type: Literal[CodeObjType.CodeParam] = CodeObjType.CodeParam
    modifier: CodeParamCodeObjImplModifier


class TextParamCodeObjImplLayering(BaseChildlessCodeObjImplLayering):
    type: Literal[CodeObjType.TextParam] = CodeObjType.TextParam
    modifier: TextParamCodeObjImplModifier


class SliderParamCodeObjImplLayering(BaseChildlessCodeObjImplLayering):
    type: Literal[CodeObjType.SliderParam] = CodeObjType.SliderParam
    modifier: SliderParamCodeObjImplModifier


class SwitchParamCodeObjImplLayering(BaseChildlessCodeObjImplLayering):
    type: Literal[CodeObjType.SwitchParam] = CodeObjType.SwitchParam
    modifier: SwitchParamCodeObjImplModifier


class ColorPickerParamCodeObjImplLayering(BaseChildlessCodeObjImplLayering):
    type: Literal[CodeObjType.ColorPickerParam] = CodeObjType.ColorPickerParam
    modifier: ColorPickerParamCodeObjImplModifier


class DropdownParamCodeObjImplLayering(BaseChildlessCodeObjImplLayering):
    type: Literal[CodeObjType.DropdownParam] = CodeObjType.DropdownParam
    modifier: DropdownParamCodeObjImplModifier


class PasswordParamCodeObjImplLayering(BaseChildlessCodeObjImplLayering):
    type: Literal[CodeObjType.PasswordParam] = CodeObjType.PasswordParam
    modifier: PasswordParamCodeObjImplModifier


class NestedParamCodeObjImplLayering(BaseParamCodeObjImplLayering):
    type: Literal[CodeObjType.NestedParam] = CodeObjType.NestedParam
    modifier: NestedParamCodeObjImplModifier
