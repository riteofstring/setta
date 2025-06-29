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

# ============== Section Creation Functions ==============


def createCallableSectionImpl(
    defaults: UserDefaultCallableSectionImpl, **overrides
) -> CallableSectionImpl:
    """Create CallableSectionImpl with user defaults."""
    data = defaults.model_copy(update=overrides, deep=True)
    return CallableSectionImpl(**data.model_dump())


def createDictSectionImpl(
    defaults: UserDefaultDictSectionImpl, **overrides
) -> DictSectionImpl:
    """Create DictSectionImpl with user defaults."""
    data = defaults.model_copy(update=overrides, deep=True)
    return DictSectionImpl(**data.model_dump())


def createListRootSectionImpl(
    defaults: UserDefaultListRootSectionImpl, **overrides
) -> ListRootSectionImpl:
    """Create ListRootSectionImpl with user defaults."""
    data = defaults.model_copy(update=overrides, deep=True)
    return ListRootSectionImpl(**data.model_dump())


def createDictRootSectionImpl(
    defaults: UserDefaultDictRootSectionImpl, **overrides
) -> DictRootSectionImpl:
    """Create DictRootSectionImpl with user defaults."""
    data = defaults.model_copy(update=overrides, deep=True)
    return DictRootSectionImpl(**data.model_dump())


def createGroupSectionImpl(
    defaults: UserDefaultGroupSectionImpl, **overrides
) -> GroupSectionImpl:
    """Create GroupSectionImpl with user defaults."""
    data = defaults.model_copy(update=overrides, deep=True)
    return GroupSectionImpl(**data.model_dump())


def createImageSectionImpl(
    defaults: UserDefaultImageSectionImpl, **overrides
) -> ImageSectionImpl:
    """Create ImageSectionImpl with user defaults."""
    data = defaults.model_copy(update=overrides, deep=True)
    return ImageSectionImpl(**data.model_dump())


def createChartSectionImpl(
    defaults: UserDefaultChartSectionImpl, **overrides
) -> ChartSectionImpl:
    """Create ChartSectionImpl with user defaults."""
    data = defaults.model_copy(update=overrides, deep=True)
    return ChartSectionImpl(**data.model_dump())


def createDrawSectionImpl(
    defaults: UserDefaultDrawSectionImpl, **overrides
) -> DrawSectionImpl:
    """Create DrawSectionImpl with user defaults."""
    data = defaults.model_copy(update=overrides, deep=True)
    return DrawSectionImpl(**data.model_dump())


def createTextBlockSectionImpl(
    defaults: UserDefaultTextBlockSectionImpl, **overrides
) -> TextBlockSectionImpl:
    """Create TextBlockSectionImpl with user defaults."""
    data = defaults.model_copy(update=overrides, deep=True)
    return TextBlockSectionImpl(**data.model_dump())


def createSocialSectionImpl(
    defaults: UserDefaultSocialSectionImpl, **overrides
) -> SocialSectionImpl:
    """Create SocialSectionImpl with user defaults."""
    data = defaults.model_copy(update=overrides, deep=True)
    return SocialSectionImpl(**data.model_dump())


def createGlobalVariablesSectionImpl(
    defaults: UserDefaultGlobalVariablesSectionImpl, **overrides
) -> GlobalVariablesSectionImpl:
    """Create GlobalVariablesSectionImpl with user defaults."""
    data = defaults.model_copy(update=overrides, deep=True)
    return GlobalVariablesSectionImpl(**data.model_dump())


def createCodeSectionImpl(
    defaults: UserDefaultCodeSectionImpl, **overrides
) -> CodeSectionImpl:
    """Create CodeSectionImpl with user defaults."""
    data = defaults.model_copy(update=overrides, deep=True)
    return CodeSectionImpl(**data.model_dump())


def createGenPythonCodeSectionImpl(
    defaults: UserDefaultGenPythonCodeSectionImpl, **overrides
) -> GenPythonCodeSectionImpl:
    """Create GenPythonCodeSectionImpl with user defaults."""
    data = defaults.model_copy(update=overrides, deep=True)
    return GenPythonCodeSectionImpl(**data.model_dump())


def createTerminalSectionImpl(
    defaults: UserDefaultTerminalSectionImpl, **overrides
) -> TerminalSectionImpl:
    """Create TerminalSectionImpl with user defaults."""
    data = defaults.model_copy(update=overrides, deep=True)
    return TerminalSectionImpl(**data.model_dump())


def createIFrameSectionImpl(
    defaults: UserDefaultIFrameSectionImpl, **overrides
) -> IFrameSectionImpl:
    """Create IFrameSectionImpl with user defaults."""
    data = defaults.model_copy(update=overrides, deep=True)
    return IFrameSectionImpl(**data.model_dump())


def createChatSectionImpl(
    defaults: UserDefaultChatSectionImpl, **overrides
) -> ChatSectionImpl:
    """Create ChatSectionImpl with user defaults."""
    data = defaults.model_copy(update=overrides, deep=True)
    return ChatSectionImpl(**data.model_dump())


def createBrowserSectionImpl(
    defaults: UserDefaultBrowserSectionImpl, **overrides
) -> BrowserSectionImpl:
    """Create BrowserSectionImpl with user defaults."""
    data = defaults.model_copy(update=overrides, deep=True)
    return BrowserSectionImpl(**data.model_dump())


# ============== Code Object Creation Functions ==============


def createCodeCallableCodeObjImpl(
    defaults: UserDefaultCodeCallableCodeObjImpl, **overrides
) -> CodeCallableCodeObjImpl:
    """Create CodeCallableCodeObjImpl with user defaults."""
    data = defaults.model_copy(update=overrides, deep=True)
    return CodeCallableCodeObjImpl(**data.model_dump())


def createCodeParamCodeObjImpl(
    defaults: UserDefaultCodeParamCodeObjImpl, **overrides
) -> CodeParamCodeObjImpl:
    """Create CodeParamCodeObjImpl with user defaults."""
    data = defaults.model_copy(update=overrides, deep=True)
    return CodeParamCodeObjImpl(**data.model_dump())


def createTextParamCodeObjImpl(
    defaults: UserDefaultTextParamCodeObjImpl, **overrides
) -> TextParamCodeObjImpl:
    """Create TextParamCodeObjImpl with user defaults."""
    data = defaults.model_copy(update=overrides, deep=True)
    return TextParamCodeObjImpl(**data.model_dump())


def createSliderParamCodeObjImpl(
    defaults: UserDefaultSliderParamCodeObjImpl, **overrides
) -> SliderParamCodeObjImpl:
    """Create SliderParamCodeObjImpl with user defaults."""
    data = defaults.model_copy(update=overrides, deep=True)
    return SliderParamCodeObjImpl(**data.model_dump())


def createSwitchParamCodeObjImpl(
    defaults: UserDefaultSwitchParamCodeObjImpl, **overrides
) -> SwitchParamCodeObjImpl:
    """Create SwitchParamCodeObjImpl with user defaults."""
    data = defaults.model_copy(update=overrides, deep=True)
    return SwitchParamCodeObjImpl(**data.model_dump())


def createColorPickerParamCodeObjImpl(
    defaults: UserDefaultColorPickerParamCodeObjImpl, **overrides
) -> ColorPickerParamCodeObjImpl:
    """Create ColorPickerParamCodeObjImpl with user defaults."""
    data = defaults.model_copy(update=overrides, deep=True)
    return ColorPickerParamCodeObjImpl(**data.model_dump())


def createDropdownParamCodeObjImpl(
    defaults: UserDefaultDropdownParamCodeObjImpl, **overrides
) -> DropdownParamCodeObjImpl:
    """Create DropdownParamCodeObjImpl with user defaults."""
    data = defaults.model_copy(update=overrides, deep=True)
    return DropdownParamCodeObjImpl(**data.model_dump())


def createPasswordParamCodeObjImpl(
    defaults: UserDefaultPasswordParamCodeObjImpl, **overrides
) -> PasswordParamCodeObjImpl:
    """Create PasswordParamCodeObjImpl with user defaults."""
    data = defaults.model_copy(update=overrides, deep=True)
    return PasswordParamCodeObjImpl(**data.model_dump())


def createNestedParamCodeObjImpl(
    defaults: UserDefaultNestedParamCodeObjImpl, **overrides
) -> NestedParamCodeObjImpl:
    """Create NestedParamCodeObjImpl with user defaults."""
    data = defaults.model_copy(update=overrides, deep=True)
    return NestedParamCodeObjImpl(**data.model_dump())
