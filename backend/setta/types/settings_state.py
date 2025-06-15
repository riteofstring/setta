from pydantic import BaseModel, Field

from setta.types.base_ui_types import UITypeName
from setta.types.project_state import SectionSize
from setta.types.utils import AsIsStrEnum

RenameRefactorMode = AsIsStrEnum(
    "RenameRefactorMode", ["ALWAYS_ASK", "ALWAYS_RENAME", "NEVER_RENAME"]
)


class SettingsShortcuts(BaseModel):
    newCardShortcut: str = "N"
    newGroupShortcut: str = "G"
    typeCheckShortcut: str = ""
    newProjectConfigShortcut: str = ""
    undoShortcut: str = "Mod + Z"
    redoShortcut: str = "Mod + Shift + Z"
    groupShortcut: str = "Mod + G"
    ungroupShortcut: str = "Shift + Mod + G"
    saveShortcut: str = "Mod + S"
    saveAsShortcut: str = "Mod + Shift + S"
    loadShortcut: str = "Mod + L"
    searchShortcut: str = "Mod + K"
    advancedSearchShortcut: str = "Mod + P"
    commandPaletteShortcut: str = "Mod + Shift + P"
    resetZoomShortcut: str = "Mod + Comma"
    copyShortcut: str = "Mod + C"
    pasteShortcut: str = "Mod + V"
    pasteAsRefShortcut: str = "Mod + Shift + V"
    sortingShortcut: str = "Mod + Alt"
    movingFreeShortcut: str = "Alt"
    showTooltipShortcut: str = "Q"
    tooltipToPlaintextShortcut: str = "Q + S"
    tooltipToMarkdownShortcut: str = "Q + W"
    freezeTooltipShortcut: str = "Q + F"
    frozenTooltipToPlaintextShortcut: str = "S"
    frozenTooltipToMarkdownShortcut: str = "W"
    incrementTooltipPageShortcut: str = "Q + ArrowRight"
    decrementTooltipPageShortcut: str = "Q + ArrowLeft"
    copyTooltipTextShortcut: str = "Q + C"
    frozenTooltipIncrementShortcut: str = "ArrowRight"
    frozenTooltipDecrementShortcut: str = "ArrowLeft"
    frozenTooltipCopyShortcut: str = "C"
    newTerminalShortcut: str = "Ctrl + `"
    fitViewShortcut: str = "F"
    zoomToMouseShortcut: str = "Z"
    deleteSectionShortcut: str = "Backspace"
    selectAll: str = "Mod + A"
    selectTopLevelNonGroupSections: str = "Mod + Shift + A"
    showVersionsTabShortcut: str = "V"
    showParamUITypeTabShortcut: str = "P"
    showProjectOverviewTabShortcut: str = "O"
    runCodeShortcut: str = "Mod + Enter"
    runEntryCodeBlockShortcut: str = "Mod + Shift + Enter"
    sendProjectToAllInteractiveCode: str = "Alt + I"
    paramSelect: str = "Mod + Shift"
    formatCode: str = "Shift + Alt + F"
    selectionKeyCode: str = "Shift"
    multiSelectionKeyCode: str = "Mod"
    panActivationKeyCode: str = "Space"
    zoomActivationKeyCode: str = "Mod"
    zoomInShortcut: str = "Equal"
    zoomOutShortcut: str = "Minus"
    restartLanguageServerShortcut: str = "Alt + Shift + R"


class SettingsGUI(BaseModel):
    snapGrid: list[int] = [15, 15]
    showGridLines: bool = True
    gridPattern: str = "Dots"
    gridPatternSize: int = 2
    gridColor: str = "#afbacf"
    gridColorDarkMode: str = "#2b364a"
    defaultZoomLevel: float = 1.0
    minZoom: float = 0.1
    maxZoom: float = 10.0
    panOnDrag: bool = True
    panOnScroll: bool = True
    panOnScrollSpeed: float = 1.0
    panOnScrollMode: str = "free"
    zoomOnScroll: bool = True
    zoomOnPinch: bool = True
    zoomOnDoubleClick: bool = False
    selectionMode: str = "partial"
    leftSidePaneShiftsMap: bool = True
    transitionDuration: int = 50


class SettingsBackend(BaseModel):
    showDefaultConfigOnLoad: bool = True
    autosave: bool = False
    autobackup: bool = False
    autobackupFreq: int = 300
    autobackupKeepLastN: int = 10
    clearTerminalBeforeMarkingAsReady: bool = True
    defaultTerminalShell: str | None = None
    exportDbRawOnSave: bool = False
    exportDbReadableOnSave: bool = False
    exportDbReadableWithVariantsOnSave: bool = False
    renameRefactorMode: RenameRefactorMode = RenameRefactorMode.ALWAYS_ASK
    saveRenderedValues: bool = False


class SettingsSectionDefaults(BaseModel):
    name: str | None = None
    size: SectionSize = Field(default_factory=SectionSize)
    displayMode: str | None = None


class SettingsState(BaseModel, extra="forbid"):
    shortcuts: SettingsShortcuts = Field(default_factory=SettingsShortcuts)
    gui: SettingsGUI = Field(default_factory=SettingsGUI)
    backend: SettingsBackend = Field(default_factory=SettingsBackend)
    languageServer: dict = {}  # TODO make a model for this?
    sections: dict[UITypeName, SettingsSectionDefaults] = Field(
        default={
            UITypeName.CODE: SettingsSectionDefaults(size=SectionSize(width=500)),
            UITypeName.TERMINAL: SettingsSectionDefaults(
                size=SectionSize(width=700, height=300)
            ),
            UITypeName.CHART: SettingsSectionDefaults(
                size=SectionSize(width=400, height=400)
            ),
            UITypeName.GLOBAL_VARIABLES: SettingsSectionDefaults(
                name="Global Variables"
            ),
            UITypeName.GEN_PYTHON_CODE: SettingsSectionDefaults(
                name="Generated Python Code"
            ),
            UITypeName.TEXT_BLOCK: SettingsSectionDefaults(displayMode="RENDER"),
            UITypeName.CHAT: SettingsSectionDefaults(
                size=SectionSize(width=405, height=405)
            ),
        },
    )
