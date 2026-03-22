from enum import Enum

from pydantic import BaseModel, Field

from setta.types.code_obj_impls import ColorPickerChoice
from setta.types.settings_state import RunSnapshotMode

# Test helper copy of the former backend settings models.

INFINITE_MAX_HEIGHT = 100000
INFINITE_MAX_WIDTH = 100000
DEFAULT_MIN_WIDTH = 200
ROOT_SECTION_HEIGHT = 50
MINIMIZED_SECTION_HEIGHT = 32
PINNED_PARAMS_AREA_MIN_HEIGHT = 64
AUTO_SECTION_MAX_HEIGHT = 350.0
META_CONTROL_DEFAULT_MIN_HEIGHT = 32
META_CONTROL_TEXTAREA_MIN_HEIGHT = 80
META_CONTROL_DROPZONE_MIN_HEIGHT = 120
META_CONTROL_DEFAULT_MIN_WIDTH = DEFAULT_MIN_WIDTH
META_CONTROL_DROPZONE_MIN_WIDTH = 240
UNPINNED_PARAMS_AREA_MIN_HEIGHT = 36


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


class RenameRefactorMode(str, Enum):
    ALWAYS_ASK = "ALWAYS_ASK"
    ALWAYS_RENAME = "ALWAYS_RENAME"
    NEVER_RENAME = "NEVER_RENAME"


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
    focusHeaderShortcut: str = "Ctrl + Shift + 1"
    focusOverviewShortcut: str = "Ctrl + Shift + 2"
    focusCanvasShortcut: str = "Ctrl + Shift + 3"
    focusUiEditorShortcut: str = "Ctrl + Shift + 4"
    nextTopLevelSectionShortcut: str = "Alt + J"
    prevTopLevelSectionShortcut: str = "Alt + K"
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


class ChatWindowingShortcuts(BaseModel):
    canvasToggle: str = "Shift + Esc"
    maximizeFocused: str = "Mod + Shift + Enter"
    minimizeFocused: str = "Mod + Shift + M"
    snapLeft: str = "Mod + Alt + ArrowLeft"
    snapRight: str = "Mod + Alt + ArrowRight"
    snapTop: str = "Mod + Alt + ArrowUp"
    snapBottom: str = "Mod + Alt + ArrowDown"


class ChatWindowingSettings(BaseModel):
    autoCreateInitialChat: bool = True
    restorePriorStateOnUnmaximize: bool = True
    shortcuts: ChatWindowingShortcuts = Field(default_factory=ChatWindowingShortcuts)


class SettingsGUI(BaseModel):
    snapGrid: tuple[int, int] = (15, 15)
    showGridLines: bool = True
    gridPattern: BackgroundVariant = BackgroundVariant.dots
    gridPatternSize: int = 2
    gridColor: str = "#afbacf"
    gridColorDarkMode: str = "#2b364a"
    wireColor: str = "#41506c"
    wireColorDarkMode: str = "#bac2d3"
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
    sectionTagColorChoices: list[ColorPickerChoice] = Field(
        default_factory=lambda: [
            ColorPickerChoice(color="#ef4444", description="Red"),
            ColorPickerChoice(color="#f97316", description="Orange"),
            ColorPickerChoice(color="#eab308", description="Yellow"),
            ColorPickerChoice(color="#22c55e", description="Green"),
            ColorPickerChoice(color="#06b6d4", description="Cyan"),
            ColorPickerChoice(color="#3b82f6", description="Blue"),
            ColorPickerChoice(color="#a855f7", description="Purple"),
            ColorPickerChoice(color="#64748b", description="Slate"),
        ]
    )


class SettingsBackend(BaseModel):
    showDefaultConfigOnLoad: bool = True
    autosave: bool = True
    autobackup: bool = True
    autobackupFreq: int = 300
    autobackupKeepLastN: int = 10
    clearTerminalBeforeMarkingAsReady: bool = True
    defaultTerminalShell: str | None = None
    exportDbReadableOnSave: bool = False
    exportDbReadableWithVariantsOnSave: bool = False
    autoRefetchCallableParamsOnLspMismatch: bool = True
    renameRefactorMode: RenameRefactorMode = RenameRefactorMode.ALWAYS_ASK
    saveRenderedValues: bool = False
    runSnapshotMode: RunSnapshotMode = RunSnapshotMode.ephemeral
    completionGuardEnabled: bool = False


def get_default_language_server_settings() -> dict:
    return {
        "basedpyright": {
            "analysis": {
                "diagnosticSeverityOverrides": {
                    "reportUnknownVariableType": "none",
                    "reportUnknownMemberType": "none",
                    "reportUnannotatedClassAttribute": "none",
                    "reportSelfClsParameterName": "none",
                }
            }
        }
    }


class SectionSizingPolicyTypeEntry(BaseModel):
    minHeight: float
    maxHeight: float
    minWidth: float
    maxWidth: float


class SectionSizingPolicyCallableTypeEntry(SectionSizingPolicyTypeEntry):
    hideSearchMinHeight: float
    hideParamsMinHeight: float


class MetaControlSizeMode(str, Enum):
    any = "any"
    auto_only = "auto_only"
    manual_only = "manual_only"


class MetaControlSizingPolicyTypeEntry(BaseModel):
    minHeight: float
    minWidth: float
    sizeModeHeight: MetaControlSizeMode = MetaControlSizeMode.any
    sizeModeWidth: MetaControlSizeMode = MetaControlSizeMode.any


class MetaControlSizingPolicyByType(BaseModel):
    CodeCallable: MetaControlSizingPolicyTypeEntry = Field(
        default_factory=lambda: MetaControlSizingPolicyTypeEntry(
            minHeight=META_CONTROL_DEFAULT_MIN_HEIGHT,
            minWidth=META_CONTROL_DEFAULT_MIN_WIDTH,
        )
    )
    CodeParam: MetaControlSizingPolicyTypeEntry = Field(
        default_factory=lambda: MetaControlSizingPolicyTypeEntry(
            minHeight=META_CONTROL_DEFAULT_MIN_HEIGHT,
            minWidth=META_CONTROL_DEFAULT_MIN_WIDTH,
        )
    )
    TextParam: MetaControlSizingPolicyTypeEntry = Field(
        default_factory=lambda: MetaControlSizingPolicyTypeEntry(
            minHeight=META_CONTROL_DEFAULT_MIN_HEIGHT,
            minWidth=META_CONTROL_DEFAULT_MIN_WIDTH,
        )
    )
    DateParam: MetaControlSizingPolicyTypeEntry = Field(
        default_factory=lambda: MetaControlSizingPolicyTypeEntry(
            minHeight=META_CONTROL_DEFAULT_MIN_HEIGHT,
            minWidth=META_CONTROL_DEFAULT_MIN_WIDTH,
        )
    )
    TimeParam: MetaControlSizingPolicyTypeEntry = Field(
        default_factory=lambda: MetaControlSizingPolicyTypeEntry(
            minHeight=META_CONTROL_DEFAULT_MIN_HEIGHT,
            minWidth=META_CONTROL_DEFAULT_MIN_WIDTH,
        )
    )
    ButtonParam: MetaControlSizingPolicyTypeEntry = Field(
        default_factory=lambda: MetaControlSizingPolicyTypeEntry(
            minHeight=META_CONTROL_DEFAULT_MIN_HEIGHT,
            minWidth=META_CONTROL_DEFAULT_MIN_WIDTH,
        )
    )
    SliderParam: MetaControlSizingPolicyTypeEntry = Field(
        default_factory=lambda: MetaControlSizingPolicyTypeEntry(
            minHeight=META_CONTROL_DEFAULT_MIN_HEIGHT,
            minWidth=META_CONTROL_DEFAULT_MIN_WIDTH,
            sizeModeHeight=MetaControlSizeMode.auto_only,
            sizeModeWidth=MetaControlSizeMode.any,
        )
    )
    RotaryParam: MetaControlSizingPolicyTypeEntry = Field(
        default_factory=lambda: MetaControlSizingPolicyTypeEntry(
            minHeight=META_CONTROL_DEFAULT_MIN_HEIGHT,
            minWidth=META_CONTROL_DEFAULT_MIN_WIDTH,
        )
    )
    SwitchParam: MetaControlSizingPolicyTypeEntry = Field(
        default_factory=lambda: MetaControlSizingPolicyTypeEntry(
            minHeight=META_CONTROL_DEFAULT_MIN_HEIGHT,
            minWidth=META_CONTROL_DEFAULT_MIN_WIDTH,
        )
    )
    ColorPickerParam: MetaControlSizingPolicyTypeEntry = Field(
        default_factory=lambda: MetaControlSizingPolicyTypeEntry(
            minHeight=META_CONTROL_DEFAULT_MIN_HEIGHT,
            minWidth=META_CONTROL_DEFAULT_MIN_WIDTH,
        )
    )
    DropdownParam: MetaControlSizingPolicyTypeEntry = Field(
        default_factory=lambda: MetaControlSizingPolicyTypeEntry(
            minHeight=META_CONTROL_DEFAULT_MIN_HEIGHT,
            minWidth=META_CONTROL_DEFAULT_MIN_WIDTH,
            sizeModeHeight=MetaControlSizeMode.auto_only,
            sizeModeWidth=MetaControlSizeMode.any,
        )
    )
    PasswordParam: MetaControlSizingPolicyTypeEntry = Field(
        default_factory=lambda: MetaControlSizingPolicyTypeEntry(
            minHeight=META_CONTROL_DEFAULT_MIN_HEIGHT,
            minWidth=META_CONTROL_DEFAULT_MIN_WIDTH,
            sizeModeHeight=MetaControlSizeMode.auto_only,
            sizeModeWidth=MetaControlSizeMode.any,
        )
    )
    TextAreaParam: MetaControlSizingPolicyTypeEntry = Field(
        default_factory=lambda: MetaControlSizingPolicyTypeEntry(
            minHeight=META_CONTROL_TEXTAREA_MIN_HEIGHT,
            minWidth=META_CONTROL_DEFAULT_MIN_WIDTH,
        )
    )
    DropzoneParam: MetaControlSizingPolicyTypeEntry = Field(
        default_factory=lambda: MetaControlSizingPolicyTypeEntry(
            minHeight=META_CONTROL_DROPZONE_MIN_HEIGHT,
            minWidth=META_CONTROL_DROPZONE_MIN_WIDTH,
        )
    )
    NestedParam: MetaControlSizingPolicyTypeEntry = Field(
        default_factory=lambda: MetaControlSizingPolicyTypeEntry(
            minHeight=META_CONTROL_DEFAULT_MIN_HEIGHT,
            minWidth=META_CONTROL_DEFAULT_MIN_WIDTH,
        )
    )


class SectionSizingPolicyGlobals(BaseModel):
    pinnedParamsAreaMinHeight: float = PINNED_PARAMS_AREA_MIN_HEIGHT
    unpinnedParamsAreaMinHeight: float = UNPINNED_PARAMS_AREA_MIN_HEIGHT
    minimizedHeight: float = MINIMIZED_SECTION_HEIGHT
    infiniteMaxHeight: float = INFINITE_MAX_HEIGHT
    infiniteMaxWidth: float = INFINITE_MAX_WIDTH
    autoMaxHeight: float = AUTO_SECTION_MAX_HEIGHT


class SectionSizingPolicyByType(BaseModel):
    Callable: SectionSizingPolicyCallableTypeEntry = Field(
        default_factory=lambda: SectionSizingPolicyCallableTypeEntry(
            minHeight=104,
            maxHeight=INFINITE_MAX_HEIGHT,
            minWidth=DEFAULT_MIN_WIDTH,
            maxWidth=INFINITE_MAX_WIDTH,
            hideSearchMinHeight=42,
            hideParamsMinHeight=90,
        )
    )
    Dict: SectionSizingPolicyTypeEntry = Field(
        default_factory=lambda: SectionSizingPolicyTypeEntry(
            minHeight=78,
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
    StateMachineStart: SectionSizingPolicyTypeEntry = Field(
        default_factory=lambda: SectionSizingPolicyTypeEntry(
            minHeight=96,
            maxHeight=INFINITE_MAX_HEIGHT,
            minWidth=240,
            maxWidth=INFINITE_MAX_WIDTH,
        )
    )
    StateMachineGate: SectionSizingPolicyTypeEntry = Field(
        default_factory=lambda: SectionSizingPolicyTypeEntry(
            minHeight=120,
            maxHeight=INFINITE_MAX_HEIGHT,
            minWidth=240,
            maxWidth=INFINITE_MAX_WIDTH,
        )
    )
    StateMachineEnd: SectionSizingPolicyTypeEntry = Field(
        default_factory=lambda: SectionSizingPolicyTypeEntry(
            minHeight=96,
            maxHeight=INFINITE_MAX_HEIGHT,
            minWidth=240,
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
    Prompt: SectionSizingPolicyTypeEntry = Field(
        default_factory=lambda: SectionSizingPolicyTypeEntry(
            minHeight=150,
            maxHeight=INFINITE_MAX_HEIGHT,
            minWidth=300,
            maxWidth=INFINITE_MAX_WIDTH,
        )
    )
    TextBlock: SectionSizingPolicyTypeEntry = Field(
        default_factory=lambda: SectionSizingPolicyTypeEntry(
            minHeight=49,
            maxHeight=INFINITE_MAX_HEIGHT,
            minWidth=100,
            maxWidth=INFINITE_MAX_WIDTH,
        )
    )
    MetaControl: SectionSizingPolicyTypeEntry = Field(
        default_factory=lambda: SectionSizingPolicyTypeEntry(
            minHeight=10,
            maxHeight=INFINITE_MAX_HEIGHT,
            minWidth=100,
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
    GenPythonMetadata: SectionSizingPolicyTypeEntry = Field(
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
    Plugin: SectionSizingPolicyTypeEntry = Field(
        default_factory=lambda: SectionSizingPolicyTypeEntry(
            minHeight=80,
            maxHeight=INFINITE_MAX_HEIGHT,
            minWidth=DEFAULT_MIN_WIDTH,
            maxWidth=INFINITE_MAX_WIDTH,
        )
    )
    TaskBoard: SectionSizingPolicyTypeEntry = Field(
        default_factory=lambda: SectionSizingPolicyTypeEntry(
            minHeight=240,
            maxHeight=INFINITE_MAX_HEIGHT,
            minWidth=360,
            maxWidth=INFINITE_MAX_WIDTH,
        )
    )
    Spreadsheet: SectionSizingPolicyTypeEntry = Field(
        default_factory=lambda: SectionSizingPolicyTypeEntry(
            minHeight=260,
            maxHeight=INFINITE_MAX_HEIGHT,
            minWidth=420,
            maxWidth=INFINITE_MAX_WIDTH,
        )
    )


class SectionSizingPolicy(BaseModel):
    byType: SectionSizingPolicyByType = Field(default_factory=SectionSizingPolicyByType)
    metaControlByType: MetaControlSizingPolicyByType = Field(
        default_factory=MetaControlSizingPolicyByType
    )
    globals: SectionSizingPolicyGlobals = Field(
        default_factory=SectionSizingPolicyGlobals
    )
