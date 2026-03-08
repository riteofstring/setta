# Auto-generated SettingsState class - DO NOT EDIT MANUALLY
# Generated from SectionType and CodeObjType enums

from pydantic import BaseModel, Field

# Import all UserDefault classes
from setta.types.generated.user_defaults import (
    UserDefaultBrowserSectionImpl,
    UserDefaultButtonParamCodeObjImpl,
    UserDefaultCallableSectionImpl,
    UserDefaultChartSectionImpl,
    UserDefaultChatSectionImpl,
    UserDefaultCodeCallableCodeObjImpl,
    UserDefaultCodeParamCodeObjImpl,
    UserDefaultCodeSectionImpl,
    UserDefaultColorPickerParamCodeObjImpl,
    UserDefaultDateParamCodeObjImpl,
    UserDefaultDictSectionImpl,
    UserDefaultDrawSectionImpl,
    UserDefaultDropdownParamCodeObjImpl,
    UserDefaultDropzoneParamCodeObjImpl,
    UserDefaultGenPythonCodeSectionImpl,
    UserDefaultGenPythonMetadataSectionImpl,
    UserDefaultGlobalVariablesSectionImpl,
    UserDefaultGroupSectionImpl,
    UserDefaultIFrameSectionImpl,
    UserDefaultImageSectionImpl,
    UserDefaultListRootSectionImpl,
    UserDefaultMetaControlSectionImpl,
    UserDefaultNestedParamCodeObjImpl,
    UserDefaultPasswordParamCodeObjImpl,
    UserDefaultPluginSectionImpl,
    UserDefaultPromptSectionImpl,
    UserDefaultRotaryParamCodeObjImpl,
    UserDefaultSliderParamCodeObjImpl,
    UserDefaultSocialSectionImpl,
    UserDefaultSpreadsheetSectionImpl,
    UserDefaultStateMachineEndSectionImpl,
    UserDefaultStateMachineGateSectionImpl,
    UserDefaultStateMachineStartSectionImpl,
    UserDefaultSwitchParamCodeObjImpl,
    UserDefaultTaskBoardSectionImpl,
    UserDefaultTerminalSectionImpl,
    UserDefaultTextAreaParamCodeObjImpl,
    UserDefaultTextBlockSectionImpl,
    UserDefaultTextParamCodeObjImpl,
    UserDefaultTimeParamCodeObjImpl,
)
from setta.types.settings_state import (
    SectionSizingPolicy,
    SettingsBackend,
    SettingsGUI,
    SettingsShortcuts,
    get_default_language_server_settings,
)


class SettingsState(BaseModel, extra="forbid"):
    """Application settings state including all user defaults."""

    # Core settings
    shortcuts: SettingsShortcuts = Field(default_factory=SettingsShortcuts)
    gui: SettingsGUI = Field(default_factory=SettingsGUI)
    backend: SettingsBackend = Field(default_factory=SettingsBackend)
    sectionSizingPolicy: SectionSizingPolicy = Field(
        default_factory=SectionSizingPolicy
    )
    languageServer: dict = Field(default_factory=get_default_language_server_settings)

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
    drawSectionDefault: UserDefaultDrawSectionImpl = Field(
        default_factory=UserDefaultDrawSectionImpl
    )
    genPythonCodeSectionDefault: UserDefaultGenPythonCodeSectionImpl = Field(
        default_factory=UserDefaultGenPythonCodeSectionImpl
    )
    genPythonMetadataSectionDefault: UserDefaultGenPythonMetadataSectionImpl = Field(
        default_factory=UserDefaultGenPythonMetadataSectionImpl
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
    metaControlSectionDefault: UserDefaultMetaControlSectionImpl = Field(
        default_factory=UserDefaultMetaControlSectionImpl
    )
    pluginSectionDefault: UserDefaultPluginSectionImpl = Field(
        default_factory=UserDefaultPluginSectionImpl
    )
    promptSectionDefault: UserDefaultPromptSectionImpl = Field(
        default_factory=UserDefaultPromptSectionImpl
    )
    socialSectionDefault: UserDefaultSocialSectionImpl = Field(
        default_factory=UserDefaultSocialSectionImpl
    )
    spreadsheetSectionDefault: UserDefaultSpreadsheetSectionImpl = Field(
        default_factory=UserDefaultSpreadsheetSectionImpl
    )
    stateMachineEndSectionDefault: UserDefaultStateMachineEndSectionImpl = Field(
        default_factory=UserDefaultStateMachineEndSectionImpl
    )
    stateMachineGateSectionDefault: UserDefaultStateMachineGateSectionImpl = Field(
        default_factory=UserDefaultStateMachineGateSectionImpl
    )
    stateMachineStartSectionDefault: UserDefaultStateMachineStartSectionImpl = Field(
        default_factory=UserDefaultStateMachineStartSectionImpl
    )
    taskBoardSectionDefault: UserDefaultTaskBoardSectionImpl = Field(
        default_factory=UserDefaultTaskBoardSectionImpl
    )
    terminalSectionDefault: UserDefaultTerminalSectionImpl = Field(
        default_factory=UserDefaultTerminalSectionImpl
    )
    textBlockSectionDefault: UserDefaultTextBlockSectionImpl = Field(
        default_factory=UserDefaultTextBlockSectionImpl
    )
    buttonParamCodeObjDefault: UserDefaultButtonParamCodeObjImpl = Field(
        default_factory=UserDefaultButtonParamCodeObjImpl
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
    dateParamCodeObjDefault: UserDefaultDateParamCodeObjImpl = Field(
        default_factory=UserDefaultDateParamCodeObjImpl
    )
    dropdownParamCodeObjDefault: UserDefaultDropdownParamCodeObjImpl = Field(
        default_factory=UserDefaultDropdownParamCodeObjImpl
    )
    dropzoneParamCodeObjDefault: UserDefaultDropzoneParamCodeObjImpl = Field(
        default_factory=UserDefaultDropzoneParamCodeObjImpl
    )
    nestedParamCodeObjDefault: UserDefaultNestedParamCodeObjImpl = Field(
        default_factory=UserDefaultNestedParamCodeObjImpl
    )
    passwordParamCodeObjDefault: UserDefaultPasswordParamCodeObjImpl = Field(
        default_factory=UserDefaultPasswordParamCodeObjImpl
    )
    rotaryParamCodeObjDefault: UserDefaultRotaryParamCodeObjImpl = Field(
        default_factory=UserDefaultRotaryParamCodeObjImpl
    )
    sliderParamCodeObjDefault: UserDefaultSliderParamCodeObjImpl = Field(
        default_factory=UserDefaultSliderParamCodeObjImpl
    )
    switchParamCodeObjDefault: UserDefaultSwitchParamCodeObjImpl = Field(
        default_factory=UserDefaultSwitchParamCodeObjImpl
    )
    textAreaParamCodeObjDefault: UserDefaultTextAreaParamCodeObjImpl = Field(
        default_factory=UserDefaultTextAreaParamCodeObjImpl
    )
    textParamCodeObjDefault: UserDefaultTextParamCodeObjImpl = Field(
        default_factory=UserDefaultTextParamCodeObjImpl
    )
    timeParamCodeObjDefault: UserDefaultTimeParamCodeObjImpl = Field(
        default_factory=UserDefaultTimeParamCodeObjImpl
    )


from setta.types.code_obj_impls import CodeObjType
from setta.types.section_impls import SectionType


def get_user_default_section_from_settings(settings: SettingsState, type: SectionType):
    match type:
        case SectionType.Callable:
            return settings.callableSectionDefault

        case SectionType.Dict:
            return settings.dictSectionDefault

        case SectionType.ListRoot:
            return settings.listRootSectionDefault

        case SectionType.Group:
            return settings.groupSectionDefault

        case SectionType.StateMachineStart:
            return settings.stateMachineStartSectionDefault

        case SectionType.StateMachineGate:
            return settings.stateMachineGateSectionDefault

        case SectionType.StateMachineEnd:
            return settings.stateMachineEndSectionDefault

        case SectionType.Image:
            return settings.imageSectionDefault

        case SectionType.Chart:
            return settings.chartSectionDefault

        case SectionType.Draw:
            return settings.drawSectionDefault

        case SectionType.TextBlock:
            return settings.textBlockSectionDefault

        case SectionType.Prompt:
            return settings.promptSectionDefault

        case SectionType.MetaControl:
            return settings.metaControlSectionDefault

        case SectionType.Social:
            return settings.socialSectionDefault

        case SectionType.GlobalVariables:
            return settings.globalVariablesSectionDefault

        case SectionType.Code:
            return settings.codeSectionDefault

        case SectionType.GenPythonCode:
            return settings.genPythonCodeSectionDefault

        case SectionType.GenPythonMetadata:
            return settings.genPythonMetadataSectionDefault

        case SectionType.Terminal:
            return settings.terminalSectionDefault

        case SectionType.IFrame:
            return settings.iFrameSectionDefault

        case SectionType.Chat:
            return settings.chatSectionDefault

        case SectionType.Browser:
            return settings.browserSectionDefault

        case SectionType.Plugin:
            return settings.pluginSectionDefault

        case SectionType.TaskBoard:
            return settings.taskBoardSectionDefault

        case SectionType.Spreadsheet:
            return settings.spreadsheetSectionDefault


def get_user_default_code_obj_from_settings(settings: SettingsState, type: CodeObjType):
    match type:
        case CodeObjType.CodeCallable:
            return settings.codeCallableCodeObjDefault

        case CodeObjType.CodeParam:
            return settings.codeParamCodeObjDefault

        case CodeObjType.TextParam:
            return settings.textParamCodeObjDefault

        case CodeObjType.DateParam:
            return settings.dateParamCodeObjDefault

        case CodeObjType.TimeParam:
            return settings.timeParamCodeObjDefault

        case CodeObjType.ButtonParam:
            return settings.buttonParamCodeObjDefault

        case CodeObjType.SliderParam:
            return settings.sliderParamCodeObjDefault

        case CodeObjType.RotaryParam:
            return settings.rotaryParamCodeObjDefault

        case CodeObjType.SwitchParam:
            return settings.switchParamCodeObjDefault

        case CodeObjType.ColorPickerParam:
            return settings.colorPickerParamCodeObjDefault

        case CodeObjType.DropdownParam:
            return settings.dropdownParamCodeObjDefault

        case CodeObjType.PasswordParam:
            return settings.passwordParamCodeObjDefault

        case CodeObjType.TextAreaParam:
            return settings.textAreaParamCodeObjDefault

        case CodeObjType.DropzoneParam:
            return settings.dropzoneParamCodeObjDefault

        case CodeObjType.NestedParam:
            return settings.nestedParamCodeObjDefault
