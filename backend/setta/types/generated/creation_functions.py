# Auto-generated creation functions - DO NOT EDIT MANUALLY
# Generated from section and code obj implementations

# Import implementation classes
from setta.types.code_objs import (
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
from setta.types.sections import (
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
    data = defaults.model_dump()
    return CallableSectionImpl(**data, **overrides)


def createDictSectionImpl(
    defaults: UserDefaultDictSectionImpl, **overrides
) -> DictSectionImpl:
    """Create DictSectionImpl with user defaults."""
    data = defaults.model_dump()
    return DictSectionImpl(**data, **overrides)


def createListRootSectionImpl(
    defaults: UserDefaultListRootSectionImpl, **overrides
) -> ListRootSectionImpl:
    """Create ListRootSectionImpl with user defaults."""
    data = defaults.model_dump()
    return ListRootSectionImpl(**data, **overrides)


def createDictRootSectionImpl(
    defaults: UserDefaultDictRootSectionImpl, **overrides
) -> DictRootSectionImpl:
    """Create DictRootSectionImpl with user defaults."""
    data = defaults.model_dump()
    return DictRootSectionImpl(**data, **overrides)


def createGroupSectionImpl(
    defaults: UserDefaultGroupSectionImpl, **overrides
) -> GroupSectionImpl:
    """Create GroupSectionImpl with user defaults."""
    data = defaults.model_dump()
    return GroupSectionImpl(**data, **overrides)


def createImageSectionImpl(
    defaults: UserDefaultImageSectionImpl, **overrides
) -> ImageSectionImpl:
    """Create ImageSectionImpl with user defaults."""
    data = defaults.model_dump()
    return ImageSectionImpl(**data, **overrides)


def createChartSectionImpl(
    defaults: UserDefaultChartSectionImpl, **overrides
) -> ChartSectionImpl:
    """Create ChartSectionImpl with user defaults."""
    data = defaults.model_dump()
    return ChartSectionImpl(**data, **overrides)


def createDrawSectionImpl(
    defaults: UserDefaultDrawSectionImpl, **overrides
) -> DrawSectionImpl:
    """Create DrawSectionImpl with user defaults."""
    data = defaults.model_dump()
    return DrawSectionImpl(**data, **overrides)


def createTextBlockSectionImpl(
    defaults: UserDefaultTextBlockSectionImpl, **overrides
) -> TextBlockSectionImpl:
    """Create TextBlockSectionImpl with user defaults."""
    data = defaults.model_dump()
    return TextBlockSectionImpl(**data, **overrides)


def createSocialSectionImpl(
    defaults: UserDefaultSocialSectionImpl, **overrides
) -> SocialSectionImpl:
    """Create SocialSectionImpl with user defaults."""
    data = defaults.model_dump()
    return SocialSectionImpl(**data, **overrides)


def createGlobalVariablesSectionImpl(
    defaults: UserDefaultGlobalVariablesSectionImpl, **overrides
) -> GlobalVariablesSectionImpl:
    """Create GlobalVariablesSectionImpl with user defaults."""
    data = defaults.model_dump()
    return GlobalVariablesSectionImpl(**data, **overrides)


def createCodeSectionImpl(
    defaults: UserDefaultCodeSectionImpl, **overrides
) -> CodeSectionImpl:
    """Create CodeSectionImpl with user defaults."""
    data = defaults.model_dump()
    return CodeSectionImpl(**data, **overrides)


def createGenPythonCodeSectionImpl(
    defaults: UserDefaultGenPythonCodeSectionImpl, **overrides
) -> GenPythonCodeSectionImpl:
    """Create GenPythonCodeSectionImpl with user defaults."""
    data = defaults.model_dump()
    return GenPythonCodeSectionImpl(**data, **overrides)


def createTerminalSectionImpl(
    defaults: UserDefaultTerminalSectionImpl, **overrides
) -> TerminalSectionImpl:
    """Create TerminalSectionImpl with user defaults."""
    data = defaults.model_dump()
    return TerminalSectionImpl(**data, **overrides)


def createIFrameSectionImpl(
    defaults: UserDefaultIFrameSectionImpl, **overrides
) -> IFrameSectionImpl:
    """Create IFrameSectionImpl with user defaults."""
    data = defaults.model_dump()
    return IFrameSectionImpl(**data, **overrides)


def createChatSectionImpl(
    defaults: UserDefaultChatSectionImpl, **overrides
) -> ChatSectionImpl:
    """Create ChatSectionImpl with user defaults."""
    data = defaults.model_dump()
    return ChatSectionImpl(**data, **overrides)


def createBrowserSectionImpl(
    defaults: UserDefaultBrowserSectionImpl, **overrides
) -> BrowserSectionImpl:
    """Create BrowserSectionImpl with user defaults."""
    data = defaults.model_dump()
    return BrowserSectionImpl(**data, **overrides)


# ============== Code Object Creation Functions ==============


def createCodeCallableCodeObjImpl(
    defaults: UserDefaultCodeCallableCodeObjImpl, **overrides
) -> CodeCallableCodeObjImpl:
    """Create CodeCallableCodeObjImpl with user defaults."""
    data = defaults.model_dump()
    return CodeCallableCodeObjImpl(**data, **overrides)


def createCodeParamCodeObjImpl(
    defaults: UserDefaultCodeParamCodeObjImpl, **overrides
) -> CodeParamCodeObjImpl:
    """Create CodeParamCodeObjImpl with user defaults."""
    data = defaults.model_dump()
    return CodeParamCodeObjImpl(**data, **overrides)


def createTextParamCodeObjImpl(
    defaults: UserDefaultTextParamCodeObjImpl, **overrides
) -> TextParamCodeObjImpl:
    """Create TextParamCodeObjImpl with user defaults."""
    data = defaults.model_dump()
    return TextParamCodeObjImpl(**data, **overrides)


def createSliderParamCodeObjImpl(
    defaults: UserDefaultSliderParamCodeObjImpl, **overrides
) -> SliderParamCodeObjImpl:
    """Create SliderParamCodeObjImpl with user defaults."""
    data = defaults.model_dump()
    return SliderParamCodeObjImpl(**data, **overrides)


def createSwitchParamCodeObjImpl(
    defaults: UserDefaultSwitchParamCodeObjImpl, **overrides
) -> SwitchParamCodeObjImpl:
    """Create SwitchParamCodeObjImpl with user defaults."""
    data = defaults.model_dump()
    return SwitchParamCodeObjImpl(**data, **overrides)


def createColorPickerParamCodeObjImpl(
    defaults: UserDefaultColorPickerParamCodeObjImpl, **overrides
) -> ColorPickerParamCodeObjImpl:
    """Create ColorPickerParamCodeObjImpl with user defaults."""
    data = defaults.model_dump()
    return ColorPickerParamCodeObjImpl(**data, **overrides)


def createDropdownParamCodeObjImpl(
    defaults: UserDefaultDropdownParamCodeObjImpl, **overrides
) -> DropdownParamCodeObjImpl:
    """Create DropdownParamCodeObjImpl with user defaults."""
    data = defaults.model_dump()
    return DropdownParamCodeObjImpl(**data, **overrides)


def createPasswordParamCodeObjImpl(
    defaults: UserDefaultPasswordParamCodeObjImpl, **overrides
) -> PasswordParamCodeObjImpl:
    """Create PasswordParamCodeObjImpl with user defaults."""
    data = defaults.model_dump()
    return PasswordParamCodeObjImpl(**data, **overrides)


def createNestedParamCodeObjImpl(
    defaults: UserDefaultNestedParamCodeObjImpl, **overrides
) -> NestedParamCodeObjImpl:
    """Create NestedParamCodeObjImpl with user defaults."""
    data = defaults.model_dump()
    return NestedParamCodeObjImpl(**data, **overrides)
