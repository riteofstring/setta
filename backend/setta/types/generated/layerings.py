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


@overload
def create_layering(
    type_: Literal[SectionType.Callable],
) -> CallableSectionLayering: ...


@overload
def create_layering(type_: Literal[SectionType.Dict]) -> DictSectionLayering: ...


@overload
def create_layering(
    type_: Literal[SectionType.ListRoot],
) -> ListRootSectionLayering: ...


@overload
def create_layering(
    type_: Literal[SectionType.DictRoot],
) -> DictRootSectionLayering: ...


@overload
def create_layering(type_: Literal[SectionType.Group]) -> GroupSectionLayering: ...


@overload
def create_layering(type_: Literal[SectionType.Image]) -> ImageSectionLayering: ...


@overload
def create_layering(type_: Literal[SectionType.Chart]) -> ChartSectionLayering: ...


@overload
def create_layering(type_: Literal[SectionType.Draw]) -> DrawSectionLayering: ...


@overload
def create_layering(
    type_: Literal[SectionType.TextBlock],
) -> TextBlockSectionLayering: ...


@overload
def create_layering(type_: Literal[SectionType.Social]) -> SocialSectionLayering: ...


@overload
def create_layering(
    type_: Literal[SectionType.GlobalVariables],
) -> GlobalVariablesSectionLayering: ...


@overload
def create_layering(type_: Literal[SectionType.Code]) -> CodeSectionLayering: ...


@overload
def create_layering(
    type_: Literal[SectionType.GenPythonCode],
) -> GenPythonCodeSectionLayering: ...


@overload
def create_layering(
    type_: Literal[SectionType.Terminal],
) -> TerminalSectionLayering: ...


@overload
def create_layering(type_: Literal[SectionType.IFrame]) -> IFrameSectionLayering: ...


@overload
def create_layering(type_: Literal[SectionType.Chat]) -> ChatSectionLayering: ...


@overload
def create_layering(type_: Literal[SectionType.Browser]) -> BrowserSectionLayering: ...


@overload
def create_layering(
    type_: Literal[CodeObjType.CodeCallable],
) -> CodeCallableCodeObjLayering: ...


@overload
def create_layering(
    type_: Literal[CodeObjType.CodeParam],
) -> CodeParamCodeObjLayering: ...


@overload
def create_layering(
    type_: Literal[CodeObjType.TextParam],
) -> TextParamCodeObjLayering: ...


@overload
def create_layering(
    type_: Literal[CodeObjType.SliderParam],
) -> SliderParamCodeObjLayering: ...


@overload
def create_layering(
    type_: Literal[CodeObjType.SwitchParam],
) -> SwitchParamCodeObjLayering: ...


@overload
def create_layering(
    type_: Literal[CodeObjType.ColorPickerParam],
) -> ColorPickerParamCodeObjLayering: ...


@overload
def create_layering(
    type_: Literal[CodeObjType.DropdownParam],
) -> DropdownParamCodeObjLayering: ...


@overload
def create_layering(
    type_: Literal[CodeObjType.PasswordParam],
) -> PasswordParamCodeObjLayering: ...


@overload
def create_layering(
    type_: Literal[CodeObjType.NestedParam],
) -> NestedParamCodeObjLayering: ...


def create_layering(type_: SectionType | CodeObjType):
    match type_:
        case SectionType.Callable:
            return CallableSectionLayering(type=type_)

        case SectionType.Dict:
            return DictSectionLayering(type=type_)

        case SectionType.ListRoot:
            return ListRootSectionLayering(type=type_)

        case SectionType.DictRoot:
            return DictRootSectionLayering(type=type_)

        case SectionType.Group:
            return GroupSectionLayering(type=type_)

        case SectionType.Image:
            return ImageSectionLayering(type=type_)

        case SectionType.Chart:
            return ChartSectionLayering(type=type_)

        case SectionType.Draw:
            return DrawSectionLayering(type=type_)

        case SectionType.TextBlock:
            return TextBlockSectionLayering(type=type_)

        case SectionType.Social:
            return SocialSectionLayering(type=type_)

        case SectionType.GlobalVariables:
            return GlobalVariablesSectionLayering(type=type_)

        case SectionType.Code:
            return CodeSectionLayering(type=type_)

        case SectionType.GenPythonCode:
            return GenPythonCodeSectionLayering(type=type_)

        case SectionType.Terminal:
            return TerminalSectionLayering(type=type_)

        case SectionType.IFrame:
            return IFrameSectionLayering(type=type_)

        case SectionType.Chat:
            return ChatSectionLayering(type=type_)

        case SectionType.Browser:
            return BrowserSectionLayering(type=type_)

        case CodeObjType.CodeCallable:
            return CodeCallableCodeObjLayering(type=type_)

        case CodeObjType.CodeParam:
            return CodeParamCodeObjLayering(type=type_)

        case CodeObjType.TextParam:
            return TextParamCodeObjLayering(type=type_)

        case CodeObjType.SliderParam:
            return SliderParamCodeObjLayering(type=type_)

        case CodeObjType.SwitchParam:
            return SwitchParamCodeObjLayering(type=type_)

        case CodeObjType.ColorPickerParam:
            return ColorPickerParamCodeObjLayering(type=type_)

        case CodeObjType.DropdownParam:
            return DropdownParamCodeObjLayering(type=type_)

        case CodeObjType.PasswordParam:
            return PasswordParamCodeObjLayering(type=type_)

        case CodeObjType.NestedParam:
            return NestedParamCodeObjLayering(type=type_)
