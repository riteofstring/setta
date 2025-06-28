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

    # Section defaults
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
    dictSectionDefault: UserDefaultDictSectionImpl = Field(
        default_factory=UserDefaultDictSectionImpl
    )
    dictRootSectionDefault: UserDefaultDictRootSectionImpl = Field(
        default_factory=UserDefaultDictRootSectionImpl
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

    # Code object defaults
    codeCallableDefault: UserDefaultCodeCallableCodeObjImpl = Field(
        default_factory=UserDefaultCodeCallableCodeObjImpl
    )
    codeParamDefault: UserDefaultCodeParamCodeObjImpl = Field(
        default_factory=UserDefaultCodeParamCodeObjImpl
    )
    colorPickerParamDefault: UserDefaultColorPickerParamCodeObjImpl = Field(
        default_factory=UserDefaultColorPickerParamCodeObjImpl
    )
    dropdownParamDefault: UserDefaultDropdownParamCodeObjImpl = Field(
        default_factory=UserDefaultDropdownParamCodeObjImpl
    )
    nestedParamDefault: UserDefaultNestedParamCodeObjImpl = Field(
        default_factory=UserDefaultNestedParamCodeObjImpl
    )
    passwordParamDefault: UserDefaultPasswordParamCodeObjImpl = Field(
        default_factory=UserDefaultPasswordParamCodeObjImpl
    )
    sliderParamDefault: UserDefaultSliderParamCodeObjImpl = Field(
        default_factory=UserDefaultSliderParamCodeObjImpl
    )
    switchParamDefault: UserDefaultSwitchParamCodeObjImpl = Field(
        default_factory=UserDefaultSwitchParamCodeObjImpl
    )
    textParamDefault: UserDefaultTextParamCodeObjImpl = Field(
        default_factory=UserDefaultTextParamCodeObjImpl
    )
