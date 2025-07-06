from typing import Any, Literal, overload

from pydantic import BaseModel, Field
from setta.database.utils import create_new_id
from setta.types.code_obj_impls import CodeObjType
from setta.types.generated.impl_field_literals import (
    BaseArtifactSectionImplFields,
    BaseCanvasSectionImplFields,
    BaseChildlessCodeObjImplFields,
    BaseCodeObjImplFields,
    BaseCodeSectionImplFields,
    BaseDictSectionImplFields,
    BaseParamCodeObjImplFields,
    BaseParentCodeObjImplFields,
    BaseParentSectionImplFields,
    BaseSectionImplFields,
    BaseSectionWithParamsImplFields,
    BrowserSectionImplFields,
    CallableSectionImplFields,
    ChartSectionImplFields,
    ChatSectionImplFields,
    CodeCallableCodeObjImplFields,
    CodeParamCodeObjImplFields,
    CodeSectionImplFields,
    ColorPickerParamCodeObjImplFields,
    DictRootSectionImplFields,
    DictSectionImplFields,
    DrawSectionImplFields,
    DropdownParamCodeObjImplFields,
    GenPythonCodeSectionImplFields,
    GlobalVariablesSectionImplFields,
    GroupSectionImplFields,
    IFrameSectionImplFields,
    ImageSectionImplFields,
    ListRootSectionImplFields,
    NestedParamCodeObjImplFields,
    PasswordParamCodeObjImplFields,
    SliderParamCodeObjImplFields,
    SocialSectionImplFields,
    SwitchParamCodeObjImplFields,
    TerminalSectionImplFields,
    TextBlockSectionImplFields,
    TextParamCodeObjImplFields,
)
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


class BaseSectionCore(BaseModel, extra="forbid"):
    id: str = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
    implLayerings: list[str] = Field(default_factory=list)
    defaultImplLayering: str | None = None
    type: Any
    sharedModifier: BaseSectionModifier
    unsharedKeys: list[BaseSectionImplFields]


class BaseSectionWithParamsCore(BaseSectionCore):
    type: Any
    sharedModifier: BaseSectionWithParamsModifier  # type: ignore[override]
    unsharedKeys: list[BaseSectionWithParamsImplFields]  # type: ignore[override]


class BaseArtifactSectionCore(BaseSectionCore):
    type: Any
    sharedModifier: BaseArtifactSectionModifier  # type: ignore[override]
    unsharedKeys: list[BaseArtifactSectionImplFields]  # type: ignore[override]


class BaseCanvasSectionCore(BaseSectionCore):
    type: Any
    sharedModifier: BaseCanvasSectionModifier  # type: ignore[override]
    unsharedKeys: list[BaseCanvasSectionImplFields]  # type: ignore[override]


class BaseCodeSectionCore(BaseSectionCore):
    type: Any
    sharedModifier: BaseCodeSectionModifier  # type: ignore[override]
    unsharedKeys: list[BaseCodeSectionImplFields]  # type: ignore[override]


class BaseParentSectionCore(BaseSectionCore):
    type: Any
    sharedModifier: BaseParentSectionModifier  # type: ignore[override]
    unsharedKeys: list[BaseParentSectionImplFields]  # type: ignore[override]


class BaseDictSectionCore(BaseSectionWithParamsCore):
    type: Any
    sharedModifier: BaseDictSectionModifier  # type: ignore[override]
    unsharedKeys: list[BaseDictSectionImplFields]  # type: ignore[override]


class CallableSectionCore(BaseSectionWithParamsCore):
    type: Literal[SectionType.Callable] = SectionType.Callable
    sharedModifier: CallableSectionModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_section_modifier(SectionType.Callable)
    )

    unsharedKeys: list[CallableSectionImplFields] = Field(  # type: ignore[override]
        default_factory=lambda: ["callable", "codeObjImplLayeringMap"]
    )


class DictSectionCore(BaseDictSectionCore):
    type: Literal[SectionType.Dict] = SectionType.Dict
    sharedModifier: DictSectionModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_section_modifier(SectionType.Dict)
    )

    unsharedKeys: list[DictSectionImplFields] = Field(  # type: ignore[override]
        default_factory=lambda: ["codeObjImplLayeringMap", "topLevelParamIds"]
    )


class ListRootSectionCore(BaseParentSectionCore):
    type: Literal[SectionType.ListRoot] = SectionType.ListRoot
    sharedModifier: ListRootSectionModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_section_modifier(SectionType.ListRoot)
    )

    unsharedKeys: list[ListRootSectionImplFields] = Field(  # type: ignore[override]
        default_factory=lambda: []
    )


class DictRootSectionCore(BaseParentSectionCore):
    type: Literal[SectionType.DictRoot] = SectionType.DictRoot
    sharedModifier: DictRootSectionModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_section_modifier(SectionType.DictRoot)
    )

    unsharedKeys: list[DictRootSectionImplFields] = Field(  # type: ignore[override]
        default_factory=lambda: []
    )


class GroupSectionCore(BaseParentSectionCore):
    type: Literal[SectionType.Group] = SectionType.Group
    sharedModifier: GroupSectionModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_section_modifier(SectionType.Group)
    )

    unsharedKeys: list[GroupSectionImplFields] = Field(  # type: ignore[override]
        default_factory=lambda: []
    )


class ImageSectionCore(BaseArtifactSectionCore):
    type: Literal[SectionType.Image] = SectionType.Image
    sharedModifier: ImageSectionModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_section_modifier(SectionType.Image)
    )

    unsharedKeys: list[ImageSectionImplFields] = Field(  # type: ignore[override]
        default_factory=lambda: []
    )


class ChartSectionCore(BaseArtifactSectionCore, BaseCanvasSectionCore):
    type: Literal[SectionType.Chart] = SectionType.Chart
    sharedModifier: ChartSectionModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_section_modifier(SectionType.Chart)
    )

    unsharedKeys: list[ChartSectionImplFields] = Field(  # type: ignore[override]
        default_factory=lambda: []
    )


class DrawSectionCore(BaseArtifactSectionCore, BaseCanvasSectionCore):
    type: Literal[SectionType.Draw] = SectionType.Draw
    sharedModifier: DrawSectionModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_section_modifier(SectionType.Draw)
    )

    unsharedKeys: list[DrawSectionImplFields] = Field(  # type: ignore[override]
        default_factory=lambda: []
    )


class TextBlockSectionCore(BaseSectionCore):
    type: Literal[SectionType.TextBlock] = SectionType.TextBlock
    sharedModifier: TextBlockSectionModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_section_modifier(SectionType.TextBlock)
    )

    unsharedKeys: list[TextBlockSectionImplFields] = Field(  # type: ignore[override]
        default_factory=lambda: []
    )


class SocialSectionCore(BaseSectionCore):
    type: Literal[SectionType.Social] = SectionType.Social
    sharedModifier: SocialSectionModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_section_modifier(SectionType.Social)
    )

    unsharedKeys: list[SocialSectionImplFields] = Field(  # type: ignore[override]
        default_factory=lambda: []
    )


class GlobalVariablesSectionCore(BaseDictSectionCore):
    type: Literal[SectionType.GlobalVariables] = SectionType.GlobalVariables
    sharedModifier: GlobalVariablesSectionModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_section_modifier(SectionType.GlobalVariables)
    )

    unsharedKeys: list[GlobalVariablesSectionImplFields] = Field(  # type: ignore[override]
        default_factory=lambda: []
    )


class CodeSectionCore(BaseCodeSectionCore):
    type: Literal[SectionType.Code] = SectionType.Code
    sharedModifier: CodeSectionModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_section_modifier(SectionType.Code)
    )

    unsharedKeys: list[CodeSectionImplFields] = Field(  # type: ignore[override]
        default_factory=lambda: []
    )


class GenPythonCodeSectionCore(BaseCodeSectionCore):
    type: Literal[SectionType.GenPythonCode] = SectionType.GenPythonCode
    sharedModifier: GenPythonCodeSectionModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_section_modifier(SectionType.GenPythonCode)
    )

    unsharedKeys: list[GenPythonCodeSectionImplFields] = Field(  # type: ignore[override]
        default_factory=lambda: []
    )


class TerminalSectionCore(BaseSectionCore):
    type: Literal[SectionType.Terminal] = SectionType.Terminal
    sharedModifier: TerminalSectionModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_section_modifier(SectionType.Terminal)
    )

    unsharedKeys: list[TerminalSectionImplFields] = Field(  # type: ignore[override]
        default_factory=lambda: []
    )


class IFrameSectionCore(BaseSectionCore):
    type: Literal[SectionType.IFrame] = SectionType.IFrame
    sharedModifier: IFrameSectionModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_section_modifier(SectionType.IFrame)
    )

    unsharedKeys: list[IFrameSectionImplFields] = Field(  # type: ignore[override]
        default_factory=lambda: []
    )


class ChatSectionCore(BaseSectionCore):
    type: Literal[SectionType.Chat] = SectionType.Chat
    sharedModifier: ChatSectionModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_section_modifier(SectionType.Chat)
    )

    unsharedKeys: list[ChatSectionImplFields] = Field(  # type: ignore[override]
        default_factory=lambda: []
    )


class BrowserSectionCore(BaseSectionCore):
    type: Literal[SectionType.Browser] = SectionType.Browser
    sharedModifier: BrowserSectionModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_section_modifier(SectionType.Browser)
    )

    unsharedKeys: list[BrowserSectionImplFields] = Field(  # type: ignore[override]
        default_factory=lambda: []
    )


class BaseCodeObjCore(BaseModel, extra="forbid"):
    id: str = Field(default_factory=create_new_id)
    name: str = Field(default_factory=generate_memorable_string)
    implLayerings: list[str] = Field(default_factory=list)
    defaultImplLayering: str | None = None
    type: Any
    sharedModifier: BaseCodeObjModifier
    unsharedKeys: list[BaseCodeObjImplFields]


class BaseParamCodeObjCore(BaseCodeObjCore):
    type: Any
    sharedModifier: BaseParamCodeObjModifier  # type: ignore[override]
    unsharedKeys: list[BaseParamCodeObjImplFields]  # type: ignore[override]


class BaseChildlessCodeObjCore(BaseParamCodeObjCore):
    type: Any
    sharedModifier: BaseChildlessCodeObjModifier  # type: ignore[override]
    unsharedKeys: list[BaseChildlessCodeObjImplFields]  # type: ignore[override]


class BaseParentCodeObjCore(BaseCodeObjCore):
    type: Any
    sharedModifier: BaseParentCodeObjModifier  # type: ignore[override]
    unsharedKeys: list[BaseParentCodeObjImplFields]  # type: ignore[override]


class CodeCallableCodeObjCore(BaseParentCodeObjCore):
    type: Literal[CodeObjType.CodeCallable] = CodeObjType.CodeCallable
    sharedModifier: CodeCallableCodeObjModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_code_obj_modifier(CodeObjType.CodeCallable)
    )

    unsharedKeys: list[CodeCallableCodeObjImplFields] = Field(  # type: ignore[override]
        default_factory=lambda: []
    )


class CodeParamCodeObjCore(BaseChildlessCodeObjCore):
    type: Literal[CodeObjType.CodeParam] = CodeObjType.CodeParam
    sharedModifier: CodeParamCodeObjModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_code_obj_modifier(CodeObjType.CodeParam)
    )

    unsharedKeys: list[CodeParamCodeObjImplFields] = Field(  # type: ignore[override]
        default_factory=lambda: ["value"]
    )


class TextParamCodeObjCore(BaseChildlessCodeObjCore):
    type: Literal[CodeObjType.TextParam] = CodeObjType.TextParam
    sharedModifier: TextParamCodeObjModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_code_obj_modifier(CodeObjType.TextParam)
    )

    unsharedKeys: list[TextParamCodeObjImplFields] = Field(  # type: ignore[override]
        default_factory=lambda: ["value"]
    )


class SliderParamCodeObjCore(BaseChildlessCodeObjCore):
    type: Literal[CodeObjType.SliderParam] = CodeObjType.SliderParam
    sharedModifier: SliderParamCodeObjModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_code_obj_modifier(CodeObjType.SliderParam)
    )

    unsharedKeys: list[SliderParamCodeObjImplFields] = Field(  # type: ignore[override]
        default_factory=lambda: ["value"]
    )


class SwitchParamCodeObjCore(BaseChildlessCodeObjCore):
    type: Literal[CodeObjType.SwitchParam] = CodeObjType.SwitchParam
    sharedModifier: SwitchParamCodeObjModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_code_obj_modifier(CodeObjType.SwitchParam)
    )

    unsharedKeys: list[SwitchParamCodeObjImplFields] = Field(  # type: ignore[override]
        default_factory=lambda: ["value"]
    )


class ColorPickerParamCodeObjCore(BaseChildlessCodeObjCore):
    type: Literal[CodeObjType.ColorPickerParam] = CodeObjType.ColorPickerParam
    sharedModifier: ColorPickerParamCodeObjModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_code_obj_modifier(CodeObjType.ColorPickerParam)
    )

    unsharedKeys: list[ColorPickerParamCodeObjImplFields] = Field(  # type: ignore[override]
        default_factory=lambda: ["value"]
    )


class DropdownParamCodeObjCore(BaseChildlessCodeObjCore):
    type: Literal[CodeObjType.DropdownParam] = CodeObjType.DropdownParam
    sharedModifier: DropdownParamCodeObjModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_code_obj_modifier(CodeObjType.DropdownParam)
    )

    unsharedKeys: list[DropdownParamCodeObjImplFields] = Field(  # type: ignore[override]
        default_factory=lambda: ["value"]
    )


class PasswordParamCodeObjCore(BaseChildlessCodeObjCore):
    type: Literal[CodeObjType.PasswordParam] = CodeObjType.PasswordParam
    sharedModifier: PasswordParamCodeObjModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_code_obj_modifier(CodeObjType.PasswordParam)
    )

    unsharedKeys: list[PasswordParamCodeObjImplFields] = Field(  # type: ignore[override]
        default_factory=lambda: ["value"]
    )


class NestedParamCodeObjCore(BaseParamCodeObjCore, BaseParentCodeObjCore):
    type: Literal[CodeObjType.NestedParam] = CodeObjType.NestedParam
    sharedModifier: NestedParamCodeObjModifier = Field(  # type: ignore[override]
        default_factory=lambda: create_code_obj_modifier(CodeObjType.NestedParam)
    )

    unsharedKeys: list[NestedParamCodeObjImplFields] = Field(  # type: ignore[override]
        default_factory=lambda: []
    )


@overload
def create_section_core(
    type: Literal[SectionType.Callable],
) -> CallableSectionCore: ...


@overload
def create_section_core(
    type: Literal[SectionType.Dict],
) -> DictSectionCore: ...


@overload
def create_section_core(
    type: Literal[SectionType.ListRoot],
) -> ListRootSectionCore: ...


@overload
def create_section_core(
    type: Literal[SectionType.DictRoot],
) -> DictRootSectionCore: ...


@overload
def create_section_core(
    type: Literal[SectionType.Group],
) -> GroupSectionCore: ...


@overload
def create_section_core(
    type: Literal[SectionType.Image],
) -> ImageSectionCore: ...


@overload
def create_section_core(
    type: Literal[SectionType.Chart],
) -> ChartSectionCore: ...


@overload
def create_section_core(
    type: Literal[SectionType.Draw],
) -> DrawSectionCore: ...


@overload
def create_section_core(
    type: Literal[SectionType.TextBlock],
) -> TextBlockSectionCore: ...


@overload
def create_section_core(
    type: Literal[SectionType.Social],
) -> SocialSectionCore: ...


@overload
def create_section_core(
    type: Literal[SectionType.GlobalVariables],
) -> GlobalVariablesSectionCore: ...


@overload
def create_section_core(
    type: Literal[SectionType.Code],
) -> CodeSectionCore: ...


@overload
def create_section_core(
    type: Literal[SectionType.GenPythonCode],
) -> GenPythonCodeSectionCore: ...


@overload
def create_section_core(
    type: Literal[SectionType.Terminal],
) -> TerminalSectionCore: ...


@overload
def create_section_core(
    type: Literal[SectionType.IFrame],
) -> IFrameSectionCore: ...


@overload
def create_section_core(
    type: Literal[SectionType.Chat],
) -> ChatSectionCore: ...


@overload
def create_section_core(
    type: Literal[SectionType.Browser],
) -> BrowserSectionCore: ...


@overload
def create_code_obj_core(
    type: Literal[CodeObjType.CodeCallable],
) -> CodeCallableCodeObjCore: ...


@overload
def create_code_obj_core(
    type: Literal[CodeObjType.CodeParam],
) -> CodeParamCodeObjCore: ...


@overload
def create_code_obj_core(
    type: Literal[CodeObjType.TextParam],
) -> TextParamCodeObjCore: ...


@overload
def create_code_obj_core(
    type: Literal[CodeObjType.SliderParam],
) -> SliderParamCodeObjCore: ...


@overload
def create_code_obj_core(
    type: Literal[CodeObjType.SwitchParam],
) -> SwitchParamCodeObjCore: ...


@overload
def create_code_obj_core(
    type: Literal[CodeObjType.ColorPickerParam],
) -> ColorPickerParamCodeObjCore: ...


@overload
def create_code_obj_core(
    type: Literal[CodeObjType.DropdownParam],
) -> DropdownParamCodeObjCore: ...


@overload
def create_code_obj_core(
    type: Literal[CodeObjType.PasswordParam],
) -> PasswordParamCodeObjCore: ...


@overload
def create_code_obj_core(
    type: Literal[CodeObjType.NestedParam],
) -> NestedParamCodeObjCore: ...


def create_section_core(
    type: SectionType,
):
    match type:
        case SectionType.Callable:
            return CallableSectionCore(
                type=type,
            )

        case SectionType.Dict:
            return DictSectionCore(
                type=type,
            )

        case SectionType.ListRoot:
            return ListRootSectionCore(
                type=type,
            )

        case SectionType.DictRoot:
            return DictRootSectionCore(
                type=type,
            )

        case SectionType.Group:
            return GroupSectionCore(
                type=type,
            )

        case SectionType.Image:
            return ImageSectionCore(
                type=type,
            )

        case SectionType.Chart:
            return ChartSectionCore(
                type=type,
            )

        case SectionType.Draw:
            return DrawSectionCore(
                type=type,
            )

        case SectionType.TextBlock:
            return TextBlockSectionCore(
                type=type,
            )

        case SectionType.Social:
            return SocialSectionCore(
                type=type,
            )

        case SectionType.GlobalVariables:
            return GlobalVariablesSectionCore(
                type=type,
            )

        case SectionType.Code:
            return CodeSectionCore(
                type=type,
            )

        case SectionType.GenPythonCode:
            return GenPythonCodeSectionCore(
                type=type,
            )

        case SectionType.Terminal:
            return TerminalSectionCore(
                type=type,
            )

        case SectionType.IFrame:
            return IFrameSectionCore(
                type=type,
            )

        case SectionType.Chat:
            return ChatSectionCore(
                type=type,
            )

        case SectionType.Browser:
            return BrowserSectionCore(
                type=type,
            )


def create_code_obj_core(
    type: CodeObjType,
):
    match type:
        case CodeObjType.CodeCallable:
            return CodeCallableCodeObjCore(
                type=type,
            )

        case CodeObjType.CodeParam:
            return CodeParamCodeObjCore(
                type=type,
            )

        case CodeObjType.TextParam:
            return TextParamCodeObjCore(
                type=type,
            )

        case CodeObjType.SliderParam:
            return SliderParamCodeObjCore(
                type=type,
            )

        case CodeObjType.SwitchParam:
            return SwitchParamCodeObjCore(
                type=type,
            )

        case CodeObjType.ColorPickerParam:
            return ColorPickerParamCodeObjCore(
                type=type,
            )

        case CodeObjType.DropdownParam:
            return DropdownParamCodeObjCore(
                type=type,
            )

        case CodeObjType.PasswordParam:
            return PasswordParamCodeObjCore(
                type=type,
            )

        case CodeObjType.NestedParam:
            return NestedParamCodeObjCore(
                type=type,
            )
