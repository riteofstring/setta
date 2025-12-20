from enum import Enum

from pydantic import BaseModel


class RenameRefactorMode(str, Enum):
    ALWAYS_ASK = "ALWAYS_ASK"
    ALWAYS_RENAME = "ALWAYS_RENAME"
    NEVER_RENAME = "NEVER_RENAME"


class BackgroundVariant(str, Enum):
    lines = "lines"
    dots = "dots"
    cross = "cross"


class SelectionMode(str, Enum):
    partial = "partial"
    full = "full"


class PanOnScrollMode(str, Enum):
    free = "free"
    vertical = "vertical"
    horizontal = "horizontal"


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
    snapGrid: tuple[int, int] = (15, 15)
    showGridLines: bool = True
    gridPattern: BackgroundVariant = BackgroundVariant.dots
    gridPatternSize: int = 2
    gridColor: str = "#afbacf"
    gridColorDarkMode: str = "#2b364a"
    defaultZoomLevel: float = 1.0
    minZoom: float = 0.1
    maxZoom: float = 10.0
    panOnDrag: bool = True
    panOnScroll: bool = True
    panOnScrollSpeed: float = 1.0
    panOnScrollMode: PanOnScrollMode = PanOnScrollMode.free
    zoomOnScroll: bool = True
    zoomOnPinch: bool = True
    zoomOnDoubleClick: bool = False
    selectionMode: SelectionMode = SelectionMode.partial
    leftSidePaneShiftsMap: bool = True
    transitionDuration: int = 50


class SettingsBackend(BaseModel):
    showDefaultConfigOnLoad: bool = True
    autosave: bool = True
    autobackup: bool = False
    autobackupFreq: int = 300
    autobackupKeepLastN: int = 10
    clearTerminalBeforeMarkingAsReady: bool = True
    defaultTerminalShell: str | None = None
    exportDbReadableOnSave: bool = False
    exportDbReadableWithVariantsOnSave: bool = False
    renameRefactorMode: RenameRefactorMode = RenameRefactorMode.ALWAYS_ASK
    saveRenderedValues: bool = False
