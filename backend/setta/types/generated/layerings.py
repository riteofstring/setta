from typing import Any, Literal, overload

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
    create_modifier,
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
    modifier: BaseSectionWithParamsModifier  # type: ignore[override]


class BaseArtifactSectionLayering(BaseSectionLayering):
    type: Any
    modifier: BaseArtifactSectionModifier  # type: ignore[override]


class BaseCanvasSectionLayering(BaseSectionLayering):
    type: Any
    modifier: BaseCanvasSectionModifier  # type: ignore[override]


class BaseCodeSectionLayering(BaseSectionLayering):
    type: Any
    modifier: BaseCodeSectionModifier  # type: ignore[override]


class BaseParentSectionLayering(BaseSectionLayering):
    type: Any
    modifier: BaseParentSectionModifier  # type: ignore[override]


class BaseDictSectionLayering(BaseSectionWithParamsLayering):
    type: Any
    modifier: BaseDictSectionModifier  # type: ignore[override]


class CallableSectionLayering(BaseSectionWithParamsLayering):
    type: Literal[SectionType.Callable] = SectionType.Callable
    modifier: CallableSectionModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_modifier(SectionType.Callable)
    )


class DictSectionLayering(BaseDictSectionLayering):
    type: Literal[SectionType.Dict] = SectionType.Dict
    modifier: DictSectionModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_modifier(SectionType.Dict)
    )


class ListRootSectionLayering(BaseParentSectionLayering):
    type: Literal[SectionType.ListRoot] = SectionType.ListRoot
    modifier: ListRootSectionModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_modifier(SectionType.ListRoot)
    )


class DictRootSectionLayering(BaseParentSectionLayering):
    type: Literal[SectionType.DictRoot] = SectionType.DictRoot
    modifier: DictRootSectionModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_modifier(SectionType.DictRoot)
    )


class GroupSectionLayering(BaseParentSectionLayering):
    type: Literal[SectionType.Group] = SectionType.Group
    modifier: GroupSectionModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_modifier(SectionType.Group)
    )


class ImageSectionLayering(BaseArtifactSectionLayering):
    type: Literal[SectionType.Image] = SectionType.Image
    modifier: ImageSectionModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_modifier(SectionType.Image)
    )


class ChartSectionLayering(BaseArtifactSectionLayering, BaseCanvasSectionLayering):
    type: Literal[SectionType.Chart] = SectionType.Chart
    modifier: ChartSectionModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_modifier(SectionType.Chart)
    )


class DrawSectionLayering(BaseArtifactSectionLayering, BaseCanvasSectionLayering):
    type: Literal[SectionType.Draw] = SectionType.Draw
    modifier: DrawSectionModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_modifier(SectionType.Draw)
    )


class TextBlockSectionLayering(BaseSectionLayering):
    type: Literal[SectionType.TextBlock] = SectionType.TextBlock
    modifier: TextBlockSectionModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_modifier(SectionType.TextBlock)
    )


class SocialSectionLayering(BaseSectionLayering):
    type: Literal[SectionType.Social] = SectionType.Social
    modifier: SocialSectionModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_modifier(SectionType.Social)
    )


class GlobalVariablesSectionLayering(BaseDictSectionLayering):
    type: Literal[SectionType.GlobalVariables] = SectionType.GlobalVariables
    modifier: GlobalVariablesSectionModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_modifier(SectionType.GlobalVariables)
    )


class CodeSectionLayering(BaseCodeSectionLayering):
    type: Literal[SectionType.Code] = SectionType.Code
    modifier: CodeSectionModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_modifier(SectionType.Code)
    )


class GenPythonCodeSectionLayering(BaseCodeSectionLayering):
    type: Literal[SectionType.GenPythonCode] = SectionType.GenPythonCode
    modifier: GenPythonCodeSectionModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_modifier(SectionType.GenPythonCode)
    )


class TerminalSectionLayering(BaseSectionLayering):
    type: Literal[SectionType.Terminal] = SectionType.Terminal
    modifier: TerminalSectionModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_modifier(SectionType.Terminal)
    )


class IFrameSectionLayering(BaseSectionLayering):
    type: Literal[SectionType.IFrame] = SectionType.IFrame
    modifier: IFrameSectionModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_modifier(SectionType.IFrame)
    )


class ChatSectionLayering(BaseSectionLayering):
    type: Literal[SectionType.Chat] = SectionType.Chat
    modifier: ChatSectionModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_modifier(SectionType.Chat)
    )


class BrowserSectionLayering(BaseSectionLayering):
    type: Literal[SectionType.Browser] = SectionType.Browser
    modifier: BrowserSectionModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_modifier(SectionType.Browser)
    )


class BaseCodeObjLayering(BaseModel, extra="forbid"):
    id: str = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
    impl: str
    type: Any
    modifier: BaseCodeObjModifier


class BaseParamCodeObjLayering(BaseCodeObjLayering):
    type: Any
    modifier: BaseParamCodeObjModifier  # type: ignore[override]


class BaseChildlessCodeObjLayering(BaseParamCodeObjLayering):
    type: Any
    modifier: BaseChildlessCodeObjModifier  # type: ignore[override]


class BaseParentCodeObjLayering(BaseCodeObjLayering):
    type: Any
    modifier: BaseParentCodeObjModifier  # type: ignore[override]


class CodeCallableCodeObjLayering(BaseParentCodeObjLayering):
    type: Literal[CodeObjType.CodeCallable] = CodeObjType.CodeCallable
    modifier: CodeCallableCodeObjModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_modifier(CodeObjType.CodeCallable)
    )


class CodeParamCodeObjLayering(BaseChildlessCodeObjLayering):
    type: Literal[CodeObjType.CodeParam] = CodeObjType.CodeParam
    modifier: CodeParamCodeObjModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_modifier(CodeObjType.CodeParam)
    )


class TextParamCodeObjLayering(BaseChildlessCodeObjLayering):
    type: Literal[CodeObjType.TextParam] = CodeObjType.TextParam
    modifier: TextParamCodeObjModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_modifier(CodeObjType.TextParam)
    )


class SliderParamCodeObjLayering(BaseChildlessCodeObjLayering):
    type: Literal[CodeObjType.SliderParam] = CodeObjType.SliderParam
    modifier: SliderParamCodeObjModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_modifier(CodeObjType.SliderParam)
    )


class SwitchParamCodeObjLayering(BaseChildlessCodeObjLayering):
    type: Literal[CodeObjType.SwitchParam] = CodeObjType.SwitchParam
    modifier: SwitchParamCodeObjModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_modifier(CodeObjType.SwitchParam)
    )


class ColorPickerParamCodeObjLayering(BaseChildlessCodeObjLayering):
    type: Literal[CodeObjType.ColorPickerParam] = CodeObjType.ColorPickerParam
    modifier: ColorPickerParamCodeObjModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_modifier(CodeObjType.ColorPickerParam)
    )


class DropdownParamCodeObjLayering(BaseChildlessCodeObjLayering):
    type: Literal[CodeObjType.DropdownParam] = CodeObjType.DropdownParam
    modifier: DropdownParamCodeObjModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_modifier(CodeObjType.DropdownParam)
    )


class PasswordParamCodeObjLayering(BaseChildlessCodeObjLayering):
    type: Literal[CodeObjType.PasswordParam] = CodeObjType.PasswordParam
    modifier: PasswordParamCodeObjModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_modifier(CodeObjType.PasswordParam)
    )


class NestedParamCodeObjLayering(BaseParamCodeObjLayering, BaseParentCodeObjLayering):
    type: Literal[CodeObjType.NestedParam] = CodeObjType.NestedParam
    modifier: NestedParamCodeObjModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_modifier(CodeObjType.NestedParam)
    )


@overload
def create_layering(
    type_: Literal[SectionType.Callable], impl: str
) -> CallableSectionLayering: ...


@overload
def create_layering(
    type_: Literal[SectionType.Dict], impl: str
) -> DictSectionLayering: ...


@overload
def create_layering(
    type_: Literal[SectionType.ListRoot], impl: str
) -> ListRootSectionLayering: ...


@overload
def create_layering(
    type_: Literal[SectionType.DictRoot], impl: str
) -> DictRootSectionLayering: ...


@overload
def create_layering(
    type_: Literal[SectionType.Group], impl: str
) -> GroupSectionLayering: ...


@overload
def create_layering(
    type_: Literal[SectionType.Image], impl: str
) -> ImageSectionLayering: ...


@overload
def create_layering(
    type_: Literal[SectionType.Chart], impl: str
) -> ChartSectionLayering: ...


@overload
def create_layering(
    type_: Literal[SectionType.Draw], impl: str
) -> DrawSectionLayering: ...


@overload
def create_layering(
    type_: Literal[SectionType.TextBlock], impl: str
) -> TextBlockSectionLayering: ...


@overload
def create_layering(
    type_: Literal[SectionType.Social], impl: str
) -> SocialSectionLayering: ...


@overload
def create_layering(
    type_: Literal[SectionType.GlobalVariables], impl: str
) -> GlobalVariablesSectionLayering: ...


@overload
def create_layering(
    type_: Literal[SectionType.Code], impl: str
) -> CodeSectionLayering: ...


@overload
def create_layering(
    type_: Literal[SectionType.GenPythonCode], impl: str
) -> GenPythonCodeSectionLayering: ...


@overload
def create_layering(
    type_: Literal[SectionType.Terminal], impl: str
) -> TerminalSectionLayering: ...


@overload
def create_layering(
    type_: Literal[SectionType.IFrame], impl: str
) -> IFrameSectionLayering: ...


@overload
def create_layering(
    type_: Literal[SectionType.Chat], impl: str
) -> ChatSectionLayering: ...


@overload
def create_layering(
    type_: Literal[SectionType.Browser], impl: str
) -> BrowserSectionLayering: ...


@overload
def create_layering(
    type_: Literal[CodeObjType.CodeCallable], impl: str
) -> CodeCallableCodeObjLayering: ...


@overload
def create_layering(
    type_: Literal[CodeObjType.CodeParam], impl: str
) -> CodeParamCodeObjLayering: ...


@overload
def create_layering(
    type_: Literal[CodeObjType.TextParam], impl: str
) -> TextParamCodeObjLayering: ...


@overload
def create_layering(
    type_: Literal[CodeObjType.SliderParam], impl: str
) -> SliderParamCodeObjLayering: ...


@overload
def create_layering(
    type_: Literal[CodeObjType.SwitchParam], impl: str
) -> SwitchParamCodeObjLayering: ...


@overload
def create_layering(
    type_: Literal[CodeObjType.ColorPickerParam], impl: str
) -> ColorPickerParamCodeObjLayering: ...


@overload
def create_layering(
    type_: Literal[CodeObjType.DropdownParam], impl: str
) -> DropdownParamCodeObjLayering: ...


@overload
def create_layering(
    type_: Literal[CodeObjType.PasswordParam], impl: str
) -> PasswordParamCodeObjLayering: ...


@overload
def create_layering(
    type_: Literal[CodeObjType.NestedParam], impl: str
) -> NestedParamCodeObjLayering: ...


def create_layering(type_: SectionType | CodeObjType, impl: str):
    match type_:
        case SectionType.Callable:
            return CallableSectionLayering(type=type_, impl=impl)

        case SectionType.Dict:
            return DictSectionLayering(type=type_, impl=impl)

        case SectionType.ListRoot:
            return ListRootSectionLayering(type=type_, impl=impl)

        case SectionType.DictRoot:
            return DictRootSectionLayering(type=type_, impl=impl)

        case SectionType.Group:
            return GroupSectionLayering(type=type_, impl=impl)

        case SectionType.Image:
            return ImageSectionLayering(type=type_, impl=impl)

        case SectionType.Chart:
            return ChartSectionLayering(type=type_, impl=impl)

        case SectionType.Draw:
            return DrawSectionLayering(type=type_, impl=impl)

        case SectionType.TextBlock:
            return TextBlockSectionLayering(type=type_, impl=impl)

        case SectionType.Social:
            return SocialSectionLayering(type=type_, impl=impl)

        case SectionType.GlobalVariables:
            return GlobalVariablesSectionLayering(type=type_, impl=impl)

        case SectionType.Code:
            return CodeSectionLayering(type=type_, impl=impl)

        case SectionType.GenPythonCode:
            return GenPythonCodeSectionLayering(type=type_, impl=impl)

        case SectionType.Terminal:
            return TerminalSectionLayering(type=type_, impl=impl)

        case SectionType.IFrame:
            return IFrameSectionLayering(type=type_, impl=impl)

        case SectionType.Chat:
            return ChatSectionLayering(type=type_, impl=impl)

        case SectionType.Browser:
            return BrowserSectionLayering(type=type_, impl=impl)

        case CodeObjType.CodeCallable:
            return CodeCallableCodeObjLayering(type=type_, impl=impl)

        case CodeObjType.CodeParam:
            return CodeParamCodeObjLayering(type=type_, impl=impl)

        case CodeObjType.TextParam:
            return TextParamCodeObjLayering(type=type_, impl=impl)

        case CodeObjType.SliderParam:
            return SliderParamCodeObjLayering(type=type_, impl=impl)

        case CodeObjType.SwitchParam:
            return SwitchParamCodeObjLayering(type=type_, impl=impl)

        case CodeObjType.ColorPickerParam:
            return ColorPickerParamCodeObjLayering(type=type_, impl=impl)

        case CodeObjType.DropdownParam:
            return DropdownParamCodeObjLayering(type=type_, impl=impl)

        case CodeObjType.PasswordParam:
            return PasswordParamCodeObjLayering(type=type_, impl=impl)

        case CodeObjType.NestedParam:
            return NestedParamCodeObjLayering(type=type_, impl=impl)
