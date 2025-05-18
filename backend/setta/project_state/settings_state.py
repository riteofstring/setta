from typing import List, Optional

from pydantic import BaseModel


class SettingsShortcuts(BaseModel):
    newCardShortcut: str
    newGroupShortcut: str
    typeCheckShortcut: str
    newProjectConfigShortcut: str
    undoShortcut: str
    redoShortcut: str
    groupShortcut: str
    ungroupShortcut: str
    saveShortcut: str
    saveAsShortcut: str
    loadShortcut: str
    searchShortcut: str
    advancedSearchShortcut: str
    commandPaletteShortcut: str
    resetZoomShortcut: str
    copyShortcut: str
    pasteShortcut: str
    pasteAsRefShortcut: str
    sortingShortcut: str
    movingFreeShortcut: str
    showTooltipShortcut: str
    tooltipToPlaintextShortcut: str
    tooltipToMarkdownShortcut: str
    freezeTooltipShortcut: str
    frozenTooltipToPlaintextShortcut: str
    frozenTooltipToMarkdownShortcut: str
    incrementTooltipPageShortcut: str
    decrementTooltipPageShortcut: str
    copyTooltipTextShortcut: str
    frozenTooltipIncrementShortcut: str
    frozenTooltipDecrementShortcut: str
    frozenTooltipCopyShortcut: str
    newTerminalShortcut: str
    fitViewShortcut: str
    zoomToMouseShortcut: str
    deleteSectionShortcut: str
    selectAll: str
    selectTopLevelNonGroupSections: str
    showVersionsTabShortcut: str
    showParamUITypeTabShortcut: str
    showProjectOverviewTabShortcut: str
    runCodeShortcut: str
    runEntryCodeBlockShortcut: str
    sendProjectToAllInteractiveCode: str
    paramSelect: str
    formatCode: str
    selectionKeyCode: str
    multiSelectionKeyCode: str
    panActivationKeyCode: str
    zoomActivationKeyCode: str
    zoomInShortcut: str
    zoomOutShortcut: str
    restartLanguageServerShortcut: str


class SettingsGUI(BaseModel):
    snapGrid: List[int]
    showGridLines: bool
    gridPattern: str
    gridPatternSize: int
    gridColor: str
    gridColorDarkMode: str
    defaultZoomLevel: float
    minZoom: float
    maxZoom: float
    panOnDrag: bool
    panOnScroll: bool
    panOnScrollSpeed: float
    panOnScrollMode: str
    zoomOnScroll: bool
    zoomOnPinch: bool
    zoomOnDoubleClick: bool
    selectionMode: str
    leftSidePaneShiftsMap: bool
    transitionDuration: int


class SettingsBackend(BaseModel):
    showDefaultConfigOnLoad: bool
    inferImports: bool
    autosave: bool
    autobackup: bool
    autobackupFreq: int
    autobackupKeepLastN: int
    clearTerminalBeforeMarkingAsReady: bool
    defaultTerminalShell: Optional[str]
    exportDbRawOnSave: bool
    exportDbReadableOnSave: bool
    exportDbReadableWithVariantsOnSave: bool
    renameRefactorMode: str
    saveRenderedValues: bool


class SettingsState(BaseModel, extra="forbid"):
    shortcuts: SettingsShortcuts
    gui: SettingsGUI
    backend: SettingsBackend
    languageServer: dict  # TODO make a model for this?
    sections: dict
