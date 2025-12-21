# Auto-generated creation functions - DO NOT EDIT MANUALLY
# Generated from section and code obj implementations

from typing import Any, Literal, overload

from setta.types.code_obj_impls import (
    CodeCallableCodeObjImpl,
    CodeObjType,
    CodeParamCodeObjImpl,
    ColorPickerParamCodeObjImpl,
    DropdownParamCodeObjImpl,
    NestedParamCodeObjImpl,
    PasswordParamCodeObjImpl,
    SliderParamCodeObjImpl,
    SwitchParamCodeObjImpl,
    TextParamCodeObjImpl,
)
from setta.types.generated.impl_args_as_typed_dicts import (
    BrowserSectionImplArgs,
    CallableSectionImplArgs,
    ChartSectionImplArgs,
    ChatSectionImplArgs,
    CodeCallableCodeObjImplArgs,
    CodeParamCodeObjImplArgs,
    CodeSectionImplArgs,
    ColorPickerParamCodeObjImplArgs,
    DictSectionImplArgs,
    DrawSectionImplArgs,
    DropdownParamCodeObjImplArgs,
    GenPythonCodeSectionImplArgs,
    GlobalVariablesSectionImplArgs,
    GroupSectionImplArgs,
    IFrameSectionImplArgs,
    ImageSectionImplArgs,
    ListRootSectionImplArgs,
    NestedParamCodeObjImplArgs,
    PasswordParamCodeObjImplArgs,
    SliderParamCodeObjImplArgs,
    SocialSectionImplArgs,
    SwitchParamCodeObjImplArgs,
    TerminalSectionImplArgs,
    TextBlockSectionImplArgs,
    TextParamCodeObjImplArgs,
)

# Import user default classes
from setta.types.generated.user_defaults import (
    UserDefaultBrowserSectionImpl,
    UserDefaultCallableSectionImpl,
    UserDefaultChartSectionImpl,
    UserDefaultChatSectionImpl,
    UserDefaultCodeCallableCodeObjImpl,
    UserDefaultCodeParamCodeObjImpl,
    UserDefaultCodeSectionImpl,
    UserDefaultColorPickerParamCodeObjImpl,
    UserDefaultDictSectionImpl,
    UserDefaultDrawSectionImpl,
    UserDefaultDropdownParamCodeObjImpl,
    UserDefaultGenPythonCodeSectionImpl,
    UserDefaultGlobalVariablesSectionImpl,
    UserDefaultGroupSectionImpl,
    UserDefaultIFrameSectionImpl,
    UserDefaultImageSectionImpl,
    UserDefaultListRootSectionImpl,
    UserDefaultNestedParamCodeObjImpl,
    UserDefaultPasswordParamCodeObjImpl,
    UserDefaultSliderParamCodeObjImpl,
    UserDefaultSocialSectionImpl,
    UserDefaultSwitchParamCodeObjImpl,
    UserDefaultTerminalSectionImpl,
    UserDefaultTextBlockSectionImpl,
    UserDefaultTextParamCodeObjImpl,
)

# Import implementation classes
from setta.types.section_impls import (
    BrowserSectionImpl,
    CallableSectionImpl,
    ChartSectionImpl,
    ChatSectionImpl,
    CodeSectionImpl,
    DictSectionImpl,
    DrawSectionImpl,
    GenPythonCodeSectionImpl,
    GlobalVariablesSectionImpl,
    GroupSectionImpl,
    IFrameSectionImpl,
    ImageSectionImpl,
    ListRootSectionImpl,
    SectionType,
    SocialSectionImpl,
    TerminalSectionImpl,
    TextBlockSectionImpl,
)


@overload
def create_section_impl(
    type: Literal[SectionType.Callable],
    defaults: UserDefaultCallableSectionImpl,
    overrides: CallableSectionImplArgs | None = None,
) -> CallableSectionImpl: ...


@overload
def create_section_impl(
    type: Literal[SectionType.Dict],
    defaults: UserDefaultDictSectionImpl,
    overrides: DictSectionImplArgs | None = None,
) -> DictSectionImpl: ...


@overload
def create_section_impl(
    type: Literal[SectionType.ListRoot],
    defaults: UserDefaultListRootSectionImpl,
    overrides: ListRootSectionImplArgs | None = None,
) -> ListRootSectionImpl: ...


@overload
def create_section_impl(
    type: Literal[SectionType.Group],
    defaults: UserDefaultGroupSectionImpl,
    overrides: GroupSectionImplArgs | None = None,
) -> GroupSectionImpl: ...


@overload
def create_section_impl(
    type: Literal[SectionType.Image],
    defaults: UserDefaultImageSectionImpl,
    overrides: ImageSectionImplArgs | None = None,
) -> ImageSectionImpl: ...


@overload
def create_section_impl(
    type: Literal[SectionType.Chart],
    defaults: UserDefaultChartSectionImpl,
    overrides: ChartSectionImplArgs | None = None,
) -> ChartSectionImpl: ...


@overload
def create_section_impl(
    type: Literal[SectionType.Draw],
    defaults: UserDefaultDrawSectionImpl,
    overrides: DrawSectionImplArgs | None = None,
) -> DrawSectionImpl: ...


@overload
def create_section_impl(
    type: Literal[SectionType.TextBlock],
    defaults: UserDefaultTextBlockSectionImpl,
    overrides: TextBlockSectionImplArgs | None = None,
) -> TextBlockSectionImpl: ...


@overload
def create_section_impl(
    type: Literal[SectionType.Social],
    defaults: UserDefaultSocialSectionImpl,
    overrides: SocialSectionImplArgs | None = None,
) -> SocialSectionImpl: ...


@overload
def create_section_impl(
    type: Literal[SectionType.GlobalVariables],
    defaults: UserDefaultGlobalVariablesSectionImpl,
    overrides: GlobalVariablesSectionImplArgs | None = None,
) -> GlobalVariablesSectionImpl: ...


@overload
def create_section_impl(
    type: Literal[SectionType.Code],
    defaults: UserDefaultCodeSectionImpl,
    overrides: CodeSectionImplArgs | None = None,
) -> CodeSectionImpl: ...


@overload
def create_section_impl(
    type: Literal[SectionType.GenPythonCode],
    defaults: UserDefaultGenPythonCodeSectionImpl,
    overrides: GenPythonCodeSectionImplArgs | None = None,
) -> GenPythonCodeSectionImpl: ...


@overload
def create_section_impl(
    type: Literal[SectionType.Terminal],
    defaults: UserDefaultTerminalSectionImpl,
    overrides: TerminalSectionImplArgs | None = None,
) -> TerminalSectionImpl: ...


@overload
def create_section_impl(
    type: Literal[SectionType.IFrame],
    defaults: UserDefaultIFrameSectionImpl,
    overrides: IFrameSectionImplArgs | None = None,
) -> IFrameSectionImpl: ...


@overload
def create_section_impl(
    type: Literal[SectionType.Chat],
    defaults: UserDefaultChatSectionImpl,
    overrides: ChatSectionImplArgs | None = None,
) -> ChatSectionImpl: ...


@overload
def create_section_impl(
    type: Literal[SectionType.Browser],
    defaults: UserDefaultBrowserSectionImpl,
    overrides: BrowserSectionImplArgs | None = None,
) -> BrowserSectionImpl: ...


@overload
def create_code_obj_impl(
    type: Literal[CodeObjType.CodeCallable],
    defaults: UserDefaultCodeCallableCodeObjImpl,
    overrides: CodeCallableCodeObjImplArgs | None = None,
) -> CodeCallableCodeObjImpl: ...


@overload
def create_code_obj_impl(
    type: Literal[CodeObjType.CodeParam],
    defaults: UserDefaultCodeParamCodeObjImpl,
    overrides: CodeParamCodeObjImplArgs | None = None,
) -> CodeParamCodeObjImpl: ...


@overload
def create_code_obj_impl(
    type: Literal[CodeObjType.TextParam],
    defaults: UserDefaultTextParamCodeObjImpl,
    overrides: TextParamCodeObjImplArgs | None = None,
) -> TextParamCodeObjImpl: ...


@overload
def create_code_obj_impl(
    type: Literal[CodeObjType.SliderParam],
    defaults: UserDefaultSliderParamCodeObjImpl,
    overrides: SliderParamCodeObjImplArgs | None = None,
) -> SliderParamCodeObjImpl: ...


@overload
def create_code_obj_impl(
    type: Literal[CodeObjType.SwitchParam],
    defaults: UserDefaultSwitchParamCodeObjImpl,
    overrides: SwitchParamCodeObjImplArgs | None = None,
) -> SwitchParamCodeObjImpl: ...


@overload
def create_code_obj_impl(
    type: Literal[CodeObjType.ColorPickerParam],
    defaults: UserDefaultColorPickerParamCodeObjImpl,
    overrides: ColorPickerParamCodeObjImplArgs | None = None,
) -> ColorPickerParamCodeObjImpl: ...


@overload
def create_code_obj_impl(
    type: Literal[CodeObjType.DropdownParam],
    defaults: UserDefaultDropdownParamCodeObjImpl,
    overrides: DropdownParamCodeObjImplArgs | None = None,
) -> DropdownParamCodeObjImpl: ...


@overload
def create_code_obj_impl(
    type: Literal[CodeObjType.PasswordParam],
    defaults: UserDefaultPasswordParamCodeObjImpl,
    overrides: PasswordParamCodeObjImplArgs | None = None,
) -> PasswordParamCodeObjImpl: ...


@overload
def create_code_obj_impl(
    type: Literal[CodeObjType.NestedParam],
    defaults: UserDefaultNestedParamCodeObjImpl,
    overrides: NestedParamCodeObjImplArgs | None = None,
) -> NestedParamCodeObjImpl: ...


def create_section_impl(type: SectionType, defaults: Any, overrides: Any = None):
    match type:
        case SectionType.Callable:
            if overrides is None:
                overrides = {}
            return CallableSectionImpl(**{**defaults.model_dump(), **overrides})

        case SectionType.Dict:
            if overrides is None:
                overrides = {}
            return DictSectionImpl(**{**defaults.model_dump(), **overrides})

        case SectionType.ListRoot:
            if overrides is None:
                overrides = {}
            return ListRootSectionImpl(**{**defaults.model_dump(), **overrides})

        case SectionType.Group:
            if overrides is None:
                overrides = {}
            return GroupSectionImpl(**{**defaults.model_dump(), **overrides})

        case SectionType.Image:
            if overrides is None:
                overrides = {}
            return ImageSectionImpl(**{**defaults.model_dump(), **overrides})

        case SectionType.Chart:
            if overrides is None:
                overrides = {}
            return ChartSectionImpl(**{**defaults.model_dump(), **overrides})

        case SectionType.Draw:
            if overrides is None:
                overrides = {}
            return DrawSectionImpl(**{**defaults.model_dump(), **overrides})

        case SectionType.TextBlock:
            if overrides is None:
                overrides = {}
            return TextBlockSectionImpl(**{**defaults.model_dump(), **overrides})

        case SectionType.Social:
            if overrides is None:
                overrides = {}
            return SocialSectionImpl(**{**defaults.model_dump(), **overrides})

        case SectionType.GlobalVariables:
            if overrides is None:
                overrides = {}
            return GlobalVariablesSectionImpl(**{**defaults.model_dump(), **overrides})

        case SectionType.Code:
            if overrides is None:
                overrides = {}
            return CodeSectionImpl(**{**defaults.model_dump(), **overrides})

        case SectionType.GenPythonCode:
            if overrides is None:
                overrides = {}
            return GenPythonCodeSectionImpl(**{**defaults.model_dump(), **overrides})

        case SectionType.Terminal:
            if overrides is None:
                overrides = {}
            return TerminalSectionImpl(**{**defaults.model_dump(), **overrides})

        case SectionType.IFrame:
            if overrides is None:
                overrides = {}
            return IFrameSectionImpl(**{**defaults.model_dump(), **overrides})

        case SectionType.Chat:
            if overrides is None:
                overrides = {}
            return ChatSectionImpl(**{**defaults.model_dump(), **overrides})

        case SectionType.Browser:
            if overrides is None:
                overrides = {}
            return BrowserSectionImpl(**{**defaults.model_dump(), **overrides})


def create_code_obj_impl(type: CodeObjType, defaults: Any, overrides: Any = None):
    match type:
        case CodeObjType.CodeCallable:
            if overrides is None:
                overrides = {}
            return CodeCallableCodeObjImpl(**{**defaults.model_dump(), **overrides})

        case CodeObjType.CodeParam:
            if overrides is None:
                overrides = {}
            return CodeParamCodeObjImpl(**{**defaults.model_dump(), **overrides})

        case CodeObjType.TextParam:
            if overrides is None:
                overrides = {}
            return TextParamCodeObjImpl(**{**defaults.model_dump(), **overrides})

        case CodeObjType.SliderParam:
            if overrides is None:
                overrides = {}
            return SliderParamCodeObjImpl(**{**defaults.model_dump(), **overrides})

        case CodeObjType.SwitchParam:
            if overrides is None:
                overrides = {}
            return SwitchParamCodeObjImpl(**{**defaults.model_dump(), **overrides})

        case CodeObjType.ColorPickerParam:
            if overrides is None:
                overrides = {}
            return ColorPickerParamCodeObjImpl(**{**defaults.model_dump(), **overrides})

        case CodeObjType.DropdownParam:
            if overrides is None:
                overrides = {}
            return DropdownParamCodeObjImpl(**{**defaults.model_dump(), **overrides})

        case CodeObjType.PasswordParam:
            if overrides is None:
                overrides = {}
            return PasswordParamCodeObjImpl(**{**defaults.model_dump(), **overrides})

        case CodeObjType.NestedParam:
            if overrides is None:
                overrides = {}
            return NestedParamCodeObjImpl(**{**defaults.model_dump(), **overrides})
