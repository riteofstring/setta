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


# Base layering class
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
    modifier: BaseSectionImplModifier  # type: ignore[assignment]


class BaseSectionWithParamsImplLayering(BaseSectionImplLayering):
    """Base class for SectionWithParamsImplLayering types."""

    type: Any
    modifier: BaseSectionWithParamsImplModifier  # type: ignore[assignment]


class BaseArtifactSectionImplLayering(BaseSectionImplLayering):
    """Base class for ArtifactSectionImplLayering types."""

    type: Any
    modifier: BaseArtifactSectionImplModifier  # type: ignore[assignment]


class BaseCanvasSectionImplLayering(BaseSectionImplLayering):
    """Base class for CanvasSectionImplLayering types."""

    type: Any
    modifier: BaseCanvasSectionImplModifier  # type: ignore[assignment]


class BaseCodeSectionImplLayering(BaseSectionImplLayering):
    """Base class for CodeSectionImplLayering types."""

    type: Any
    modifier: BaseCodeSectionImplModifier  # type: ignore[assignment]


class BaseParentSectionImplLayering(BaseSectionImplLayering):
    """Base class for ParentSectionImplLayering types."""

    type: Any
    modifier: BaseParentSectionImplModifier  # type: ignore[assignment]


class BaseDictSectionImplLayering(BaseSectionWithParamsImplLayering):
    """Base class for DictSectionImplLayering types."""

    type: Any
    modifier: BaseDictSectionImplModifier  # type: ignore[assignment]


class BrowserSectionImplLayering(BaseSectionImplLayering):
    type: Literal[SectionType.Browser] = SectionType.Browser
    modifier: BrowserSectionImplModifier  # type: ignore[assignment]


class CallableSectionImplLayering(BaseSectionWithParamsImplLayering):
    type: Literal[SectionType.Callable] = SectionType.Callable
    modifier: CallableSectionImplModifier  # type: ignore[assignment]


class ChartSectionImplLayering(
    BaseArtifactSectionImplLayering, BaseCanvasSectionImplLayering
):
    type: Literal[SectionType.Chart] = SectionType.Chart
    modifier: ChartSectionImplModifier  # type: ignore[assignment]


class ChatSectionImplLayering(BaseSectionImplLayering):
    type: Literal[SectionType.Chat] = SectionType.Chat
    modifier: ChatSectionImplModifier  # type: ignore[assignment]


class CodeSectionImplLayering(BaseCodeSectionImplLayering):
    type: Literal[SectionType.Code] = SectionType.Code
    modifier: CodeSectionImplModifier  # type: ignore[assignment]


class DictSectionImplLayering(BaseDictSectionImplLayering):
    type: Literal[SectionType.Dict] = SectionType.Dict
    modifier: DictSectionImplModifier  # type: ignore[assignment]


class DictRootSectionImplLayering(BaseParentSectionImplLayering):
    type: Literal[SectionType.DictRoot] = SectionType.DictRoot
    modifier: DictRootSectionImplModifier  # type: ignore[assignment]


class DrawSectionImplLayering(
    BaseArtifactSectionImplLayering, BaseCanvasSectionImplLayering
):
    type: Literal[SectionType.Draw] = SectionType.Draw
    modifier: DrawSectionImplModifier  # type: ignore[assignment]


class GenPythonCodeSectionImplLayering(BaseCodeSectionImplLayering):
    type: Literal[SectionType.GenPythonCode] = SectionType.GenPythonCode
    modifier: GenPythonCodeSectionImplModifier  # type: ignore[assignment]


class GlobalVariablesSectionImplLayering(BaseDictSectionImplLayering):
    type: Literal[SectionType.GlobalVariables] = SectionType.GlobalVariables
    modifier: GlobalVariablesSectionImplModifier  # type: ignore[assignment]


class GroupSectionImplLayering(BaseParentSectionImplLayering):
    type: Literal[SectionType.Group] = SectionType.Group
    modifier: GroupSectionImplModifier  # type: ignore[assignment]


class IFrameSectionImplLayering(BaseSectionImplLayering):
    type: Literal[SectionType.IFrame] = SectionType.IFrame
    modifier: IFrameSectionImplModifier  # type: ignore[assignment]


class ImageSectionImplLayering(BaseArtifactSectionImplLayering):
    type: Literal[SectionType.Image] = SectionType.Image
    modifier: ImageSectionImplModifier  # type: ignore[assignment]


class ListRootSectionImplLayering(BaseParentSectionImplLayering):
    type: Literal[SectionType.ListRoot] = SectionType.ListRoot
    modifier: ListRootSectionImplModifier  # type: ignore[assignment]


class SocialSectionImplLayering(BaseSectionImplLayering):
    type: Literal[SectionType.Social] = SectionType.Social
    modifier: SocialSectionImplModifier  # type: ignore[assignment]


class TerminalSectionImplLayering(BaseSectionImplLayering):
    type: Literal[SectionType.Terminal] = SectionType.Terminal
    modifier: TerminalSectionImplModifier  # type: ignore[assignment]


class TextBlockSectionImplLayering(BaseSectionImplLayering):
    type: Literal[SectionType.TextBlock] = SectionType.TextBlock
    modifier: TextBlockSectionImplModifier  # type: ignore[assignment]


# ============== Code Object Layering Classes ==============


class BaseCodeObjImplLayering(BaseImplLayering):
    """Base class for CodeObjImplLayering types."""

    type: Any
    modifier: BaseCodeObjImplModifier  # type: ignore[assignment]


class BaseParamCodeObjImplLayering(BaseCodeObjImplLayering):
    """Base class for ParamCodeObjImplLayering types."""

    type: Any
    modifier: BaseParamCodeObjImplModifier  # type: ignore[assignment]


class BaseChildlessCodeObjImplLayering(BaseParamCodeObjImplLayering):
    """Base class for ChildlessCodeObjImplLayering types."""

    type: Any
    modifier: BaseChildlessCodeObjImplModifier  # type: ignore[assignment]


class BaseParentCodeObjImplLayering(BaseCodeObjImplLayering):
    """Base class for ParentCodeObjImplLayering types."""

    type: Any
    modifier: BaseParentCodeObjImplModifier  # type: ignore[assignment]


class CodeCallableCodeObjImplLayering(BaseParentCodeObjImplLayering):
    type: Literal[CodeObjType.CodeCallable] = CodeObjType.CodeCallable
    modifier: CodeCallableCodeObjImplModifier  # type: ignore[assignment]


class CodeParamCodeObjImplLayering(BaseChildlessCodeObjImplLayering):
    type: Literal[CodeObjType.CodeParam] = CodeObjType.CodeParam
    modifier: CodeParamCodeObjImplModifier  # type: ignore[assignment]


class ColorPickerParamCodeObjImplLayering(BaseChildlessCodeObjImplLayering):
    type: Literal[CodeObjType.ColorPickerParam] = CodeObjType.ColorPickerParam
    modifier: ColorPickerParamCodeObjImplModifier  # type: ignore[assignment]


class DropdownParamCodeObjImplLayering(BaseChildlessCodeObjImplLayering):
    type: Literal[CodeObjType.DropdownParam] = CodeObjType.DropdownParam
    modifier: DropdownParamCodeObjImplModifier  # type: ignore[assignment]


class NestedParamCodeObjImplLayering(
    BaseParamCodeObjImplLayering, BaseParentCodeObjImplLayering
):
    type: Literal[CodeObjType.NestedParam] = CodeObjType.NestedParam
    modifier: NestedParamCodeObjImplModifier  # type: ignore[assignment]


class PasswordParamCodeObjImplLayering(BaseChildlessCodeObjImplLayering):
    type: Literal[CodeObjType.PasswordParam] = CodeObjType.PasswordParam
    modifier: PasswordParamCodeObjImplModifier  # type: ignore[assignment]


class SliderParamCodeObjImplLayering(BaseChildlessCodeObjImplLayering):
    type: Literal[CodeObjType.SliderParam] = CodeObjType.SliderParam
    modifier: SliderParamCodeObjImplModifier  # type: ignore[assignment]


class SwitchParamCodeObjImplLayering(BaseChildlessCodeObjImplLayering):
    type: Literal[CodeObjType.SwitchParam] = CodeObjType.SwitchParam
    modifier: SwitchParamCodeObjImplModifier  # type: ignore[assignment]


class TextParamCodeObjImplLayering(BaseChildlessCodeObjImplLayering):
    type: Literal[CodeObjType.TextParam] = CodeObjType.TextParam
    modifier: TextParamCodeObjImplModifier  # type: ignore[assignment]
