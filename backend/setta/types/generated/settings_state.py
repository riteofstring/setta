# Auto-generated SettingsState class - DO NOT EDIT MANUALLY
# Generated from SectionType and CodeObjType enums

from pydantic import BaseModel, Field

# Import all UserDefault classes
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
from setta.types.settings_state import SettingsBackend, SettingsGUI, SettingsShortcuts


class SettingsState(BaseModel, extra="forbid"):
    """Application settings state including all user defaults."""

    # Core settings
    shortcuts: SettingsShortcuts = Field(default_factory=SettingsShortcuts)
    gui: SettingsGUI = Field(default_factory=SettingsGUI)
    backend: SettingsBackend = Field(default_factory=SettingsBackend)
    languageServer: dict = Field(default_factory=dict)  # TODO: make a model for this?

    browserSectionDefault: UserDefaultBrowserSectionImpl = Field(
        default_factory=UserDefaultBrowserSectionImpl
    )
    callableSectionDefault: UserDefaultCallableSectionImpl = Field(
        default_factory=UserDefaultCallableSectionImpl
    )
    chartSectionDefault: UserDefaultChartSectionImpl = Field(
        default_factory=UserDefaultChartSectionImpl
    )
    chatSectionDefault: UserDefaultChatSectionImpl = Field(
        default_factory=UserDefaultChatSectionImpl
    )
    codeSectionDefault: UserDefaultCodeSectionImpl = Field(
        default_factory=UserDefaultCodeSectionImpl
    )
    dictRootSectionDefault: UserDefaultDictRootSectionImpl = Field(
        default_factory=UserDefaultDictRootSectionImpl
    )
    dictSectionDefault: UserDefaultDictSectionImpl = Field(
        default_factory=UserDefaultDictSectionImpl
    )
    drawSectionDefault: UserDefaultDrawSectionImpl = Field(
        default_factory=UserDefaultDrawSectionImpl
    )
    genPythonCodeSectionDefault: UserDefaultGenPythonCodeSectionImpl = Field(
        default_factory=UserDefaultGenPythonCodeSectionImpl
    )
    globalVariablesSectionDefault: UserDefaultGlobalVariablesSectionImpl = Field(
        default_factory=UserDefaultGlobalVariablesSectionImpl
    )
    groupSectionDefault: UserDefaultGroupSectionImpl = Field(
        default_factory=UserDefaultGroupSectionImpl
    )
    iFrameSectionDefault: UserDefaultIFrameSectionImpl = Field(
        default_factory=UserDefaultIFrameSectionImpl
    )
    imageSectionDefault: UserDefaultImageSectionImpl = Field(
        default_factory=UserDefaultImageSectionImpl
    )
    listRootSectionDefault: UserDefaultListRootSectionImpl = Field(
        default_factory=UserDefaultListRootSectionImpl
    )
    socialSectionDefault: UserDefaultSocialSectionImpl = Field(
        default_factory=UserDefaultSocialSectionImpl
    )
    terminalSectionDefault: UserDefaultTerminalSectionImpl = Field(
        default_factory=UserDefaultTerminalSectionImpl
    )
    textBlockSectionDefault: UserDefaultTextBlockSectionImpl = Field(
        default_factory=UserDefaultTextBlockSectionImpl
    )
    codeCallableCodeObjDefault: UserDefaultCodeCallableCodeObjImpl = Field(
        default_factory=UserDefaultCodeCallableCodeObjImpl
    )
    codeParamCodeObjDefault: UserDefaultCodeParamCodeObjImpl = Field(
        default_factory=UserDefaultCodeParamCodeObjImpl
    )
    colorPickerParamCodeObjDefault: UserDefaultColorPickerParamCodeObjImpl = Field(
        default_factory=UserDefaultColorPickerParamCodeObjImpl
    )
    dropdownParamCodeObjDefault: UserDefaultDropdownParamCodeObjImpl = Field(
        default_factory=UserDefaultDropdownParamCodeObjImpl
    )
    nestedParamCodeObjDefault: UserDefaultNestedParamCodeObjImpl = Field(
        default_factory=UserDefaultNestedParamCodeObjImpl
    )
    passwordParamCodeObjDefault: UserDefaultPasswordParamCodeObjImpl = Field(
        default_factory=UserDefaultPasswordParamCodeObjImpl
    )
    sliderParamCodeObjDefault: UserDefaultSliderParamCodeObjImpl = Field(
        default_factory=UserDefaultSliderParamCodeObjImpl
    )
    switchParamCodeObjDefault: UserDefaultSwitchParamCodeObjImpl = Field(
        default_factory=UserDefaultSwitchParamCodeObjImpl
    )
    textParamCodeObjDefault: UserDefaultTextParamCodeObjImpl = Field(
        default_factory=UserDefaultTextParamCodeObjImpl
    )
