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
    create_code_obj_modifier,
    create_section_modifier,
)
from setta.types.section_impls import SectionType
from setta.utils.generate_memorable_string import generate_memorable_string


class BaseSectionLayering(BaseModel, extra="forbid"):
    id: str = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
    impl: str
    nonPresetImpls: list[str]
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
        default_factory=lambda: create_section_modifier(SectionType.Callable)
    )


class DictSectionLayering(BaseDictSectionLayering):
    type: Literal[SectionType.Dict] = SectionType.Dict
    modifier: DictSectionModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_section_modifier(SectionType.Dict)
    )


class ListRootSectionLayering(BaseParentSectionLayering):
    type: Literal[SectionType.ListRoot] = SectionType.ListRoot
    modifier: ListRootSectionModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_section_modifier(SectionType.ListRoot)
    )


class DictRootSectionLayering(BaseParentSectionLayering):
    type: Literal[SectionType.DictRoot] = SectionType.DictRoot
    modifier: DictRootSectionModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_section_modifier(SectionType.DictRoot)
    )


class GroupSectionLayering(BaseParentSectionLayering):
    type: Literal[SectionType.Group] = SectionType.Group
    modifier: GroupSectionModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_section_modifier(SectionType.Group)
    )


class ImageSectionLayering(BaseArtifactSectionLayering):
    type: Literal[SectionType.Image] = SectionType.Image
    modifier: ImageSectionModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_section_modifier(SectionType.Image)
    )


class ChartSectionLayering(BaseArtifactSectionLayering, BaseCanvasSectionLayering):
    type: Literal[SectionType.Chart] = SectionType.Chart
    modifier: ChartSectionModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_section_modifier(SectionType.Chart)
    )


class DrawSectionLayering(BaseArtifactSectionLayering, BaseCanvasSectionLayering):
    type: Literal[SectionType.Draw] = SectionType.Draw
    modifier: DrawSectionModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_section_modifier(SectionType.Draw)
    )


class TextBlockSectionLayering(BaseSectionLayering):
    type: Literal[SectionType.TextBlock] = SectionType.TextBlock
    modifier: TextBlockSectionModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_section_modifier(SectionType.TextBlock)
    )


class SocialSectionLayering(BaseSectionLayering):
    type: Literal[SectionType.Social] = SectionType.Social
    modifier: SocialSectionModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_section_modifier(SectionType.Social)
    )


class GlobalVariablesSectionLayering(BaseDictSectionLayering):
    type: Literal[SectionType.GlobalVariables] = SectionType.GlobalVariables
    modifier: GlobalVariablesSectionModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_section_modifier(SectionType.GlobalVariables)
    )


class CodeSectionLayering(BaseCodeSectionLayering):
    type: Literal[SectionType.Code] = SectionType.Code
    modifier: CodeSectionModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_section_modifier(SectionType.Code)
    )


class GenPythonCodeSectionLayering(BaseCodeSectionLayering):
    type: Literal[SectionType.GenPythonCode] = SectionType.GenPythonCode
    modifier: GenPythonCodeSectionModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_section_modifier(SectionType.GenPythonCode)
    )


class TerminalSectionLayering(BaseSectionLayering):
    type: Literal[SectionType.Terminal] = SectionType.Terminal
    modifier: TerminalSectionModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_section_modifier(SectionType.Terminal)
    )


class IFrameSectionLayering(BaseSectionLayering):
    type: Literal[SectionType.IFrame] = SectionType.IFrame
    modifier: IFrameSectionModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_section_modifier(SectionType.IFrame)
    )


class ChatSectionLayering(BaseSectionLayering):
    type: Literal[SectionType.Chat] = SectionType.Chat
    modifier: ChatSectionModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_section_modifier(SectionType.Chat)
    )


class BrowserSectionLayering(BaseSectionLayering):
    type: Literal[SectionType.Browser] = SectionType.Browser
    modifier: BrowserSectionModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_section_modifier(SectionType.Browser)
    )


class BaseCodeObjLayering(BaseModel, extra="forbid"):
    id: str = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
    impl: str
    nonPresetImpls: list[str]
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
        default_factory=lambda: create_code_obj_modifier(CodeObjType.CodeCallable)
    )


class CodeParamCodeObjLayering(BaseChildlessCodeObjLayering):
    type: Literal[CodeObjType.CodeParam] = CodeObjType.CodeParam
    modifier: CodeParamCodeObjModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_code_obj_modifier(CodeObjType.CodeParam)
    )


class TextParamCodeObjLayering(BaseChildlessCodeObjLayering):
    type: Literal[CodeObjType.TextParam] = CodeObjType.TextParam
    modifier: TextParamCodeObjModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_code_obj_modifier(CodeObjType.TextParam)
    )


class SliderParamCodeObjLayering(BaseChildlessCodeObjLayering):
    type: Literal[CodeObjType.SliderParam] = CodeObjType.SliderParam
    modifier: SliderParamCodeObjModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_code_obj_modifier(CodeObjType.SliderParam)
    )


class SwitchParamCodeObjLayering(BaseChildlessCodeObjLayering):
    type: Literal[CodeObjType.SwitchParam] = CodeObjType.SwitchParam
    modifier: SwitchParamCodeObjModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_code_obj_modifier(CodeObjType.SwitchParam)
    )


class ColorPickerParamCodeObjLayering(BaseChildlessCodeObjLayering):
    type: Literal[CodeObjType.ColorPickerParam] = CodeObjType.ColorPickerParam
    modifier: ColorPickerParamCodeObjModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_code_obj_modifier(CodeObjType.ColorPickerParam)
    )


class DropdownParamCodeObjLayering(BaseChildlessCodeObjLayering):
    type: Literal[CodeObjType.DropdownParam] = CodeObjType.DropdownParam
    modifier: DropdownParamCodeObjModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_code_obj_modifier(CodeObjType.DropdownParam)
    )


class PasswordParamCodeObjLayering(BaseChildlessCodeObjLayering):
    type: Literal[CodeObjType.PasswordParam] = CodeObjType.PasswordParam
    modifier: PasswordParamCodeObjModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_code_obj_modifier(CodeObjType.PasswordParam)
    )


class NestedParamCodeObjLayering(BaseParamCodeObjLayering, BaseParentCodeObjLayering):
    type: Literal[CodeObjType.NestedParam] = CodeObjType.NestedParam
    modifier: NestedParamCodeObjModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_code_obj_modifier(CodeObjType.NestedParam)
    )


@overload
def create_section_layering(
    type: Literal[SectionType.Callable], impl: str, implIsPreset: bool = False
) -> CallableSectionLayering: ...


@overload
def create_section_layering(
    type: Literal[SectionType.Dict], impl: str, implIsPreset: bool = False
) -> DictSectionLayering: ...


@overload
def create_section_layering(
    type: Literal[SectionType.ListRoot], impl: str, implIsPreset: bool = False
) -> ListRootSectionLayering: ...


@overload
def create_section_layering(
    type: Literal[SectionType.DictRoot], impl: str, implIsPreset: bool = False
) -> DictRootSectionLayering: ...


@overload
def create_section_layering(
    type: Literal[SectionType.Group], impl: str, implIsPreset: bool = False
) -> GroupSectionLayering: ...


@overload
def create_section_layering(
    type: Literal[SectionType.Image], impl: str, implIsPreset: bool = False
) -> ImageSectionLayering: ...


@overload
def create_section_layering(
    type: Literal[SectionType.Chart], impl: str, implIsPreset: bool = False
) -> ChartSectionLayering: ...


@overload
def create_section_layering(
    type: Literal[SectionType.Draw], impl: str, implIsPreset: bool = False
) -> DrawSectionLayering: ...


@overload
def create_section_layering(
    type: Literal[SectionType.TextBlock], impl: str, implIsPreset: bool = False
) -> TextBlockSectionLayering: ...


@overload
def create_section_layering(
    type: Literal[SectionType.Social], impl: str, implIsPreset: bool = False
) -> SocialSectionLayering: ...


@overload
def create_section_layering(
    type: Literal[SectionType.GlobalVariables], impl: str, implIsPreset: bool = False
) -> GlobalVariablesSectionLayering: ...


@overload
def create_section_layering(
    type: Literal[SectionType.Code], impl: str, implIsPreset: bool = False
) -> CodeSectionLayering: ...


@overload
def create_section_layering(
    type: Literal[SectionType.GenPythonCode], impl: str, implIsPreset: bool = False
) -> GenPythonCodeSectionLayering: ...


@overload
def create_section_layering(
    type: Literal[SectionType.Terminal], impl: str, implIsPreset: bool = False
) -> TerminalSectionLayering: ...


@overload
def create_section_layering(
    type: Literal[SectionType.IFrame], impl: str, implIsPreset: bool = False
) -> IFrameSectionLayering: ...


@overload
def create_section_layering(
    type: Literal[SectionType.Chat], impl: str, implIsPreset: bool = False
) -> ChatSectionLayering: ...


@overload
def create_section_layering(
    type: Literal[SectionType.Browser], impl: str, implIsPreset: bool = False
) -> BrowserSectionLayering: ...


@overload
def create_code_obj_layering(
    type: Literal[CodeObjType.CodeCallable], impl: str, implIsPreset: bool = False
) -> CodeCallableCodeObjLayering: ...


@overload
def create_code_obj_layering(
    type: Literal[CodeObjType.CodeParam], impl: str, implIsPreset: bool = False
) -> CodeParamCodeObjLayering: ...


@overload
def create_code_obj_layering(
    type: Literal[CodeObjType.TextParam], impl: str, implIsPreset: bool = False
) -> TextParamCodeObjLayering: ...


@overload
def create_code_obj_layering(
    type: Literal[CodeObjType.SliderParam], impl: str, implIsPreset: bool = False
) -> SliderParamCodeObjLayering: ...


@overload
def create_code_obj_layering(
    type: Literal[CodeObjType.SwitchParam], impl: str, implIsPreset: bool = False
) -> SwitchParamCodeObjLayering: ...


@overload
def create_code_obj_layering(
    type: Literal[CodeObjType.ColorPickerParam], impl: str, implIsPreset: bool = False
) -> ColorPickerParamCodeObjLayering: ...


@overload
def create_code_obj_layering(
    type: Literal[CodeObjType.DropdownParam], impl: str, implIsPreset: bool = False
) -> DropdownParamCodeObjLayering: ...


@overload
def create_code_obj_layering(
    type: Literal[CodeObjType.PasswordParam], impl: str, implIsPreset: bool = False
) -> PasswordParamCodeObjLayering: ...


@overload
def create_code_obj_layering(
    type: Literal[CodeObjType.NestedParam], impl: str, implIsPreset: bool = False
) -> NestedParamCodeObjLayering: ...


def create_section_layering(type: SectionType, impl: str, implIsPreset: bool = False):
    match type:
        case SectionType.Callable:
            return CallableSectionLayering(
                type=type, impl=impl, nonPresetImpls=[] if implIsPreset else [impl]
            )

        case SectionType.Dict:
            return DictSectionLayering(
                type=type, impl=impl, nonPresetImpls=[] if implIsPreset else [impl]
            )

        case SectionType.ListRoot:
            return ListRootSectionLayering(
                type=type, impl=impl, nonPresetImpls=[] if implIsPreset else [impl]
            )

        case SectionType.DictRoot:
            return DictRootSectionLayering(
                type=type, impl=impl, nonPresetImpls=[] if implIsPreset else [impl]
            )

        case SectionType.Group:
            return GroupSectionLayering(
                type=type, impl=impl, nonPresetImpls=[] if implIsPreset else [impl]
            )

        case SectionType.Image:
            return ImageSectionLayering(
                type=type, impl=impl, nonPresetImpls=[] if implIsPreset else [impl]
            )

        case SectionType.Chart:
            return ChartSectionLayering(
                type=type, impl=impl, nonPresetImpls=[] if implIsPreset else [impl]
            )

        case SectionType.Draw:
            return DrawSectionLayering(
                type=type, impl=impl, nonPresetImpls=[] if implIsPreset else [impl]
            )

        case SectionType.TextBlock:
            return TextBlockSectionLayering(
                type=type, impl=impl, nonPresetImpls=[] if implIsPreset else [impl]
            )

        case SectionType.Social:
            return SocialSectionLayering(
                type=type, impl=impl, nonPresetImpls=[] if implIsPreset else [impl]
            )

        case SectionType.GlobalVariables:
            return GlobalVariablesSectionLayering(
                type=type, impl=impl, nonPresetImpls=[] if implIsPreset else [impl]
            )

        case SectionType.Code:
            return CodeSectionLayering(
                type=type, impl=impl, nonPresetImpls=[] if implIsPreset else [impl]
            )

        case SectionType.GenPythonCode:
            return GenPythonCodeSectionLayering(
                type=type, impl=impl, nonPresetImpls=[] if implIsPreset else [impl]
            )

        case SectionType.Terminal:
            return TerminalSectionLayering(
                type=type, impl=impl, nonPresetImpls=[] if implIsPreset else [impl]
            )

        case SectionType.IFrame:
            return IFrameSectionLayering(
                type=type, impl=impl, nonPresetImpls=[] if implIsPreset else [impl]
            )

        case SectionType.Chat:
            return ChatSectionLayering(
                type=type, impl=impl, nonPresetImpls=[] if implIsPreset else [impl]
            )

        case SectionType.Browser:
            return BrowserSectionLayering(
                type=type, impl=impl, nonPresetImpls=[] if implIsPreset else [impl]
            )


def create_code_obj_layering(type: CodeObjType, impl: str, implIsPreset: bool = False):
    match type:
        case CodeObjType.CodeCallable:
            return CodeCallableCodeObjLayering(
                type=type, impl=impl, nonPresetImpls=[] if implIsPreset else [impl]
            )

        case CodeObjType.CodeParam:
            return CodeParamCodeObjLayering(
                type=type, impl=impl, nonPresetImpls=[] if implIsPreset else [impl]
            )

        case CodeObjType.TextParam:
            return TextParamCodeObjLayering(
                type=type, impl=impl, nonPresetImpls=[] if implIsPreset else [impl]
            )

        case CodeObjType.SliderParam:
            return SliderParamCodeObjLayering(
                type=type, impl=impl, nonPresetImpls=[] if implIsPreset else [impl]
            )

        case CodeObjType.SwitchParam:
            return SwitchParamCodeObjLayering(
                type=type, impl=impl, nonPresetImpls=[] if implIsPreset else [impl]
            )

        case CodeObjType.ColorPickerParam:
            return ColorPickerParamCodeObjLayering(
                type=type, impl=impl, nonPresetImpls=[] if implIsPreset else [impl]
            )

        case CodeObjType.DropdownParam:
            return DropdownParamCodeObjLayering(
                type=type, impl=impl, nonPresetImpls=[] if implIsPreset else [impl]
            )

        case CodeObjType.PasswordParam:
            return PasswordParamCodeObjLayering(
                type=type, impl=impl, nonPresetImpls=[] if implIsPreset else [impl]
            )

        case CodeObjType.NestedParam:
            return NestedParamCodeObjLayering(
                type=type, impl=impl, nonPresetImpls=[] if implIsPreset else [impl]
            )
