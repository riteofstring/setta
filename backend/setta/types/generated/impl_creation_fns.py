# Auto-generated creation functions - DO NOT EDIT MANUALLY
# Generated from section and code obj implementations

# Import implementation classes
from setta.types.code_obj_impls import (
    CodeCallableCodeObjImpl,
    CodeParamCodeObjImpl,
    ColorPickerParamCodeObjImpl,
    DropdownParamCodeObjImpl,
    NestedParamCodeObjImpl,
    PasswordParamCodeObjImpl,
    SliderParamCodeObjImpl,
    SwitchParamCodeObjImpl,
    TextParamCodeObjImpl,
)
from setta.types.generated.model_args_as_typed_dicts import (
    BrowserSectionImplArgs,
    CallableSectionImplArgs,
    ChartSectionImplArgs,
    ChatSectionImplArgs,
    CodeCallableCodeObjImplArgs,
    CodeParamCodeObjImplArgs,
    CodeSectionImplArgs,
    ColorPickerParamCodeObjImplArgs,
    DictRootSectionImplArgs,
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
    UserDefaultDictRootSectionImpl,
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
from setta.types.section_impls import (
    BrowserSectionImpl,
    CallableSectionImpl,
    ChartSectionImpl,
    ChatSectionImpl,
    CodeSectionImpl,
    DictRootSectionImpl,
    DictSectionImpl,
    DrawSectionImpl,
    GenPythonCodeSectionImpl,
    GlobalVariablesSectionImpl,
    GroupSectionImpl,
    IFrameSectionImpl,
    ImageSectionImpl,
    ListRootSectionImpl,
    SocialSectionImpl,
    TerminalSectionImpl,
    TextBlockSectionImpl,
)


def createCallableSectionImpl(
    defaults: UserDefaultCallableSectionImpl,
    overrides: CallableSectionImplArgs | None = None,
) -> CallableSectionImpl:
    if overrides is None:
        overrides = {}
    return CallableSectionImpl(**{**defaults.model_dump(), **overrides})


def createDictSectionImpl(
    defaults: UserDefaultDictSectionImpl, overrides: DictSectionImplArgs | None = None
) -> DictSectionImpl:
    if overrides is None:
        overrides = {}
    return DictSectionImpl(**{**defaults.model_dump(), **overrides})


def createListRootSectionImpl(
    defaults: UserDefaultListRootSectionImpl,
    overrides: ListRootSectionImplArgs | None = None,
) -> ListRootSectionImpl:
    if overrides is None:
        overrides = {}
    return ListRootSectionImpl(**{**defaults.model_dump(), **overrides})


def createDictRootSectionImpl(
    defaults: UserDefaultDictRootSectionImpl,
    overrides: DictRootSectionImplArgs | None = None,
) -> DictRootSectionImpl:
    if overrides is None:
        overrides = {}
    return DictRootSectionImpl(**{**defaults.model_dump(), **overrides})


def createGroupSectionImpl(
    defaults: UserDefaultGroupSectionImpl, overrides: GroupSectionImplArgs | None = None
) -> GroupSectionImpl:
    if overrides is None:
        overrides = {}
    return GroupSectionImpl(**{**defaults.model_dump(), **overrides})


def createImageSectionImpl(
    defaults: UserDefaultImageSectionImpl, overrides: ImageSectionImplArgs | None = None
) -> ImageSectionImpl:
    if overrides is None:
        overrides = {}
    return ImageSectionImpl(**{**defaults.model_dump(), **overrides})


def createChartSectionImpl(
    defaults: UserDefaultChartSectionImpl, overrides: ChartSectionImplArgs | None = None
) -> ChartSectionImpl:
    if overrides is None:
        overrides = {}
    return ChartSectionImpl(**{**defaults.model_dump(), **overrides})


def createDrawSectionImpl(
    defaults: UserDefaultDrawSectionImpl, overrides: DrawSectionImplArgs | None = None
) -> DrawSectionImpl:
    if overrides is None:
        overrides = {}
    return DrawSectionImpl(**{**defaults.model_dump(), **overrides})


def createTextBlockSectionImpl(
    defaults: UserDefaultTextBlockSectionImpl,
    overrides: TextBlockSectionImplArgs | None = None,
) -> TextBlockSectionImpl:
    if overrides is None:
        overrides = {}
    return TextBlockSectionImpl(**{**defaults.model_dump(), **overrides})


def createSocialSectionImpl(
    defaults: UserDefaultSocialSectionImpl,
    overrides: SocialSectionImplArgs | None = None,
) -> SocialSectionImpl:
    if overrides is None:
        overrides = {}
    return SocialSectionImpl(**{**defaults.model_dump(), **overrides})


def createGlobalVariablesSectionImpl(
    defaults: UserDefaultGlobalVariablesSectionImpl,
    overrides: GlobalVariablesSectionImplArgs | None = None,
) -> GlobalVariablesSectionImpl:
    if overrides is None:
        overrides = {}
    return GlobalVariablesSectionImpl(**{**defaults.model_dump(), **overrides})


def createCodeSectionImpl(
    defaults: UserDefaultCodeSectionImpl, overrides: CodeSectionImplArgs | None = None
) -> CodeSectionImpl:
    if overrides is None:
        overrides = {}
    return CodeSectionImpl(**{**defaults.model_dump(), **overrides})


def createGenPythonCodeSectionImpl(
    defaults: UserDefaultGenPythonCodeSectionImpl,
    overrides: GenPythonCodeSectionImplArgs | None = None,
) -> GenPythonCodeSectionImpl:
    if overrides is None:
        overrides = {}
    return GenPythonCodeSectionImpl(**{**defaults.model_dump(), **overrides})


def createTerminalSectionImpl(
    defaults: UserDefaultTerminalSectionImpl,
    overrides: TerminalSectionImplArgs | None = None,
) -> TerminalSectionImpl:
    if overrides is None:
        overrides = {}
    return TerminalSectionImpl(**{**defaults.model_dump(), **overrides})


def createIFrameSectionImpl(
    defaults: UserDefaultIFrameSectionImpl,
    overrides: IFrameSectionImplArgs | None = None,
) -> IFrameSectionImpl:
    if overrides is None:
        overrides = {}
    return IFrameSectionImpl(**{**defaults.model_dump(), **overrides})


def createChatSectionImpl(
    defaults: UserDefaultChatSectionImpl, overrides: ChatSectionImplArgs | None = None
) -> ChatSectionImpl:
    if overrides is None:
        overrides = {}
    return ChatSectionImpl(**{**defaults.model_dump(), **overrides})


def createBrowserSectionImpl(
    defaults: UserDefaultBrowserSectionImpl,
    overrides: BrowserSectionImplArgs | None = None,
) -> BrowserSectionImpl:
    if overrides is None:
        overrides = {}
    return BrowserSectionImpl(**{**defaults.model_dump(), **overrides})


def createCodeCallableCodeObjImpl(
    defaults: UserDefaultCodeCallableCodeObjImpl,
    overrides: CodeCallableCodeObjImplArgs | None = None,
) -> CodeCallableCodeObjImpl:
    if overrides is None:
        overrides = {}
    return CodeCallableCodeObjImpl(**{**defaults.model_dump(), **overrides})


def createCodeParamCodeObjImpl(
    defaults: UserDefaultCodeParamCodeObjImpl,
    overrides: CodeParamCodeObjImplArgs | None = None,
) -> CodeParamCodeObjImpl:
    if overrides is None:
        overrides = {}
    return CodeParamCodeObjImpl(**{**defaults.model_dump(), **overrides})


def createTextParamCodeObjImpl(
    defaults: UserDefaultTextParamCodeObjImpl,
    overrides: TextParamCodeObjImplArgs | None = None,
) -> TextParamCodeObjImpl:
    if overrides is None:
        overrides = {}
    return TextParamCodeObjImpl(**{**defaults.model_dump(), **overrides})


def createSliderParamCodeObjImpl(
    defaults: UserDefaultSliderParamCodeObjImpl,
    overrides: SliderParamCodeObjImplArgs | None = None,
) -> SliderParamCodeObjImpl:
    if overrides is None:
        overrides = {}
    return SliderParamCodeObjImpl(**{**defaults.model_dump(), **overrides})


def createSwitchParamCodeObjImpl(
    defaults: UserDefaultSwitchParamCodeObjImpl,
    overrides: SwitchParamCodeObjImplArgs | None = None,
) -> SwitchParamCodeObjImpl:
    if overrides is None:
        overrides = {}
    return SwitchParamCodeObjImpl(**{**defaults.model_dump(), **overrides})


def createColorPickerParamCodeObjImpl(
    defaults: UserDefaultColorPickerParamCodeObjImpl,
    overrides: ColorPickerParamCodeObjImplArgs | None = None,
) -> ColorPickerParamCodeObjImpl:
    if overrides is None:
        overrides = {}
    return ColorPickerParamCodeObjImpl(**{**defaults.model_dump(), **overrides})


def createDropdownParamCodeObjImpl(
    defaults: UserDefaultDropdownParamCodeObjImpl,
    overrides: DropdownParamCodeObjImplArgs | None = None,
) -> DropdownParamCodeObjImpl:
    if overrides is None:
        overrides = {}
    return DropdownParamCodeObjImpl(**{**defaults.model_dump(), **overrides})


def createPasswordParamCodeObjImpl(
    defaults: UserDefaultPasswordParamCodeObjImpl,
    overrides: PasswordParamCodeObjImplArgs | None = None,
) -> PasswordParamCodeObjImpl:
    if overrides is None:
        overrides = {}
    return PasswordParamCodeObjImpl(**{**defaults.model_dump(), **overrides})


def createNestedParamCodeObjImpl(
    defaults: UserDefaultNestedParamCodeObjImpl,
    overrides: NestedParamCodeObjImplArgs | None = None,
) -> NestedParamCodeObjImpl:
    if overrides is None:
        overrides = {}
    return NestedParamCodeObjImpl(**{**defaults.model_dump(), **overrides})
