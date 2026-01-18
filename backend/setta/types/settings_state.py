from enum import Enum

from pydantic import BaseModel, Field

INFINITE_MAX_HEIGHT = 100000
INFINITE_MAX_WIDTH = 100000
DEFAULT_MIN_WIDTH = 200
ROOT_SECTION_HEIGHT = 50
MINIMIZED_SECTION_HEIGHT = 32
PINNED_PARAMS_AREA_MIN_HEIGHT = 64


class RenameRefactorMode(str, Enum):
    ALWAYS_ASK = "ALWAYS_ASK"
    ALWAYS_RENAME = "ALWAYS_RENAME"
    NEVER_RENAME = "NEVER_RENAME"


class RunSnapshotMode(str, Enum):
    always = "always"
    ephemeral = "ephemeral"
    never = "never"


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
    paramIndentShortcut: str = "Tab"
    paramUnindentShortcut: str = "Shift + Tab"
    paramMoveUpShortcut: str = "Alt + ArrowUp"
    paramMoveDownShortcut: str = "Alt + ArrowDown"
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
    runSnapshotMode: RunSnapshotMode = RunSnapshotMode.ephemeral


class SectionSizingPolicyTypeEntry(BaseModel):
    minHeight: float
    maxHeight: float
    minWidth: float
    maxWidth: float


class SectionSizingPolicyCallableTypeEntry(SectionSizingPolicyTypeEntry):
    hideSearchMinHeight: float
    hideParamsMinHeight: float


class SectionSizingPolicyGlobals(BaseModel):
    pinnedParamsAreaMinHeight: float = PINNED_PARAMS_AREA_MIN_HEIGHT
    minimizedHeight: float = MINIMIZED_SECTION_HEIGHT
    infiniteMaxHeight: float = INFINITE_MAX_HEIGHT
    infiniteMaxWidth: float = INFINITE_MAX_WIDTH


class SectionSizingPolicyByType(BaseModel):
    Callable: SectionSizingPolicyCallableTypeEntry = Field(
        default_factory=lambda: SectionSizingPolicyCallableTypeEntry(
            minHeight=104,
            maxHeight=INFINITE_MAX_HEIGHT,
            minWidth=DEFAULT_MIN_WIDTH,
            maxWidth=INFINITE_MAX_WIDTH,
            hideSearchMinHeight=78,
            hideParamsMinHeight=58,
        )
    )
    Dict: SectionSizingPolicyTypeEntry = Field(
        default_factory=lambda: SectionSizingPolicyTypeEntry(
            minHeight=0,
            maxHeight=INFINITE_MAX_HEIGHT,
            minWidth=DEFAULT_MIN_WIDTH,
            maxWidth=INFINITE_MAX_WIDTH,
        )
    )
    ListRoot: SectionSizingPolicyTypeEntry = Field(
        default_factory=lambda: SectionSizingPolicyTypeEntry(
            minHeight=ROOT_SECTION_HEIGHT,
            maxHeight=ROOT_SECTION_HEIGHT,
            minWidth=DEFAULT_MIN_WIDTH,
            maxWidth=INFINITE_MAX_WIDTH,
        )
    )
    Group: SectionSizingPolicyTypeEntry = Field(
        default_factory=lambda: SectionSizingPolicyTypeEntry(
            minHeight=0,
            maxHeight=INFINITE_MAX_HEIGHT,
            minWidth=DEFAULT_MIN_WIDTH,
            maxWidth=INFINITE_MAX_WIDTH,
        )
    )
    Image: SectionSizingPolicyTypeEntry = Field(
        default_factory=lambda: SectionSizingPolicyTypeEntry(
            minHeight=100,
            maxHeight=INFINITE_MAX_HEIGHT,
            minWidth=DEFAULT_MIN_WIDTH,
            maxWidth=INFINITE_MAX_WIDTH,
        )
    )
    Chart: SectionSizingPolicyTypeEntry = Field(
        default_factory=lambda: SectionSizingPolicyTypeEntry(
            minHeight=300,
            maxHeight=INFINITE_MAX_HEIGHT,
            minWidth=300,
            maxWidth=INFINITE_MAX_WIDTH,
        )
    )
    Draw: SectionSizingPolicyTypeEntry = Field(
        default_factory=lambda: SectionSizingPolicyTypeEntry(
            minHeight=100,
            maxHeight=INFINITE_MAX_HEIGHT,
            minWidth=402,
            maxWidth=INFINITE_MAX_WIDTH,
        )
    )
    TextBlock: SectionSizingPolicyTypeEntry = Field(
        default_factory=lambda: SectionSizingPolicyTypeEntry(
            minHeight=98,
            maxHeight=INFINITE_MAX_HEIGHT,
            minWidth=DEFAULT_MIN_WIDTH,
            maxWidth=INFINITE_MAX_WIDTH,
        )
    )
    MetaControl: SectionSizingPolicyTypeEntry = Field(
        default_factory=lambda: SectionSizingPolicyTypeEntry(
            minHeight=20,
            maxHeight=INFINITE_MAX_HEIGHT,
            minWidth=DEFAULT_MIN_WIDTH,
            maxWidth=INFINITE_MAX_WIDTH,
        )
    )
    Social: SectionSizingPolicyTypeEntry = Field(
        default_factory=lambda: SectionSizingPolicyTypeEntry(
            minHeight=50,
            maxHeight=INFINITE_MAX_HEIGHT,
            minWidth=DEFAULT_MIN_WIDTH,
            maxWidth=INFINITE_MAX_WIDTH,
        )
    )
    GlobalVariables: SectionSizingPolicyTypeEntry = Field(
        default_factory=lambda: SectionSizingPolicyTypeEntry(
            minHeight=78,
            maxHeight=INFINITE_MAX_HEIGHT,
            minWidth=DEFAULT_MIN_WIDTH,
            maxWidth=INFINITE_MAX_WIDTH,
        )
    )
    Code: SectionSizingPolicyTypeEntry = Field(
        default_factory=lambda: SectionSizingPolicyTypeEntry(
            minHeight=58.2,
            maxHeight=INFINITE_MAX_HEIGHT,
            minWidth=DEFAULT_MIN_WIDTH,
            maxWidth=INFINITE_MAX_WIDTH,
        )
    )
    GenPythonCode: SectionSizingPolicyTypeEntry = Field(
        default_factory=lambda: SectionSizingPolicyTypeEntry(
            minHeight=0,
            maxHeight=INFINITE_MAX_HEIGHT,
            minWidth=DEFAULT_MIN_WIDTH,
            maxWidth=INFINITE_MAX_WIDTH,
        )
    )
    Terminal: SectionSizingPolicyTypeEntry = Field(
        default_factory=lambda: SectionSizingPolicyTypeEntry(
            minHeight=100,
            maxHeight=INFINITE_MAX_HEIGHT,
            minWidth=DEFAULT_MIN_WIDTH,
            maxWidth=INFINITE_MAX_WIDTH,
        )
    )
    IFrame: SectionSizingPolicyTypeEntry = Field(
        default_factory=lambda: SectionSizingPolicyTypeEntry(
            minHeight=0,
            maxHeight=INFINITE_MAX_HEIGHT,
            minWidth=DEFAULT_MIN_WIDTH,
            maxWidth=INFINITE_MAX_WIDTH,
        )
    )
    Chat: SectionSizingPolicyTypeEntry = Field(
        default_factory=lambda: SectionSizingPolicyTypeEntry(
            minHeight=200,
            maxHeight=INFINITE_MAX_HEIGHT,
            minWidth=400,
            maxWidth=INFINITE_MAX_WIDTH,
        )
    )
    Browser: SectionSizingPolicyTypeEntry = Field(
        default_factory=lambda: SectionSizingPolicyTypeEntry(
            minHeight=250,
            maxHeight=INFINITE_MAX_HEIGHT,
            minWidth=DEFAULT_MIN_WIDTH,
            maxWidth=INFINITE_MAX_WIDTH,
        )
    )


class SectionSizingPolicy(BaseModel):
    byType: SectionSizingPolicyByType = Field(default_factory=SectionSizingPolicyByType)
    globals: SectionSizingPolicyGlobals = Field(
        default_factory=SectionSizingPolicyGlobals
    )
