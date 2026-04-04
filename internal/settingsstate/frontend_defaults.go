package settingsstate

import (
	"encoding/json"

	"setta/internal/deployments"
	"setta/internal/projectstate"
)

type FrontendColorPickerChoice struct {
	Color       string `json:"color"`
	Description string `json:"description"`
}

type FrontendSettingsShortcuts struct {
	NewCardShortcut                  string `json:"newCardShortcut"`
	NewGroupShortcut                 string `json:"newGroupShortcut"`
	TypeCheckShortcut                string `json:"typeCheckShortcut"`
	NewProjectConfigShortcut         string `json:"newProjectConfigShortcut"`
	UndoShortcut                     string `json:"undoShortcut"`
	RedoShortcut                     string `json:"redoShortcut"`
	GroupShortcut                    string `json:"groupShortcut"`
	UngroupShortcut                  string `json:"ungroupShortcut"`
	SaveShortcut                     string `json:"saveShortcut"`
	SaveAsShortcut                   string `json:"saveAsShortcut"`
	LoadShortcut                     string `json:"loadShortcut"`
	SearchShortcut                   string `json:"searchShortcut"`
	AdvancedSearchShortcut           string `json:"advancedSearchShortcut"`
	CommandPaletteShortcut           string `json:"commandPaletteShortcut"`
	ResetZoomShortcut                string `json:"resetZoomShortcut"`
	CopyShortcut                     string `json:"copyShortcut"`
	PasteShortcut                    string `json:"pasteShortcut"`
	PasteAsRefShortcut               string `json:"pasteAsRefShortcut"`
	SortingShortcut                  string `json:"sortingShortcut"`
	MovingFreeShortcut               string `json:"movingFreeShortcut"`
	ShowTooltipShortcut              string `json:"showTooltipShortcut"`
	TooltipToPlaintextShortcut       string `json:"tooltipToPlaintextShortcut"`
	TooltipToMarkdownShortcut        string `json:"tooltipToMarkdownShortcut"`
	FreezeTooltipShortcut            string `json:"freezeTooltipShortcut"`
	FrozenTooltipToPlaintextShortcut string `json:"frozenTooltipToPlaintextShortcut"`
	FrozenTooltipToMarkdownShortcut  string `json:"frozenTooltipToMarkdownShortcut"`
	IncrementTooltipPageShortcut     string `json:"incrementTooltipPageShortcut"`
	DecrementTooltipPageShortcut     string `json:"decrementTooltipPageShortcut"`
	CopyTooltipTextShortcut          string `json:"copyTooltipTextShortcut"`
	FrozenTooltipIncrementShortcut   string `json:"frozenTooltipIncrementShortcut"`
	FrozenTooltipDecrementShortcut   string `json:"frozenTooltipDecrementShortcut"`
	FrozenTooltipCopyShortcut        string `json:"frozenTooltipCopyShortcut"`
	NewTerminalShortcut              string `json:"newTerminalShortcut"`
	FitViewShortcut                  string `json:"fitViewShortcut"`
	ZoomToMouseShortcut              string `json:"zoomToMouseShortcut"`
	DeleteSectionShortcut            string `json:"deleteSectionShortcut"`
	SelectAll                        string `json:"selectAll"`
	SelectTopLevelNonGroupSections   string `json:"selectTopLevelNonGroupSections"`
	ShowVersionsTabShortcut          string `json:"showVersionsTabShortcut"`
	ShowParamUITypeTabShortcut       string `json:"showParamUITypeTabShortcut"`
	ShowProjectOverviewTabShortcut   string `json:"showProjectOverviewTabShortcut"`
	FocusHeaderShortcut              string `json:"focusHeaderShortcut"`
	FocusOverviewShortcut            string `json:"focusOverviewShortcut"`
	FocusCanvasShortcut              string `json:"focusCanvasShortcut"`
	FocusUIEditorShortcut            string `json:"focusUiEditorShortcut"`
	NextTopLevelSectionShortcut      string `json:"nextTopLevelSectionShortcut"`
	PrevTopLevelSectionShortcut      string `json:"prevTopLevelSectionShortcut"`
	RunCodeShortcut                  string `json:"runCodeShortcut"`
	RunEntryCodeBlockShortcut        string `json:"runEntryCodeBlockShortcut"`
	ParamSelect                      string `json:"paramSelect"`
	ParamIndentShortcut              string `json:"paramIndentShortcut"`
	ParamUnindentShortcut            string `json:"paramUnindentShortcut"`
	ParamMoveUpShortcut              string `json:"paramMoveUpShortcut"`
	ParamMoveDownShortcut            string `json:"paramMoveDownShortcut"`
	FormatCode                       string `json:"formatCode"`
	SelectionKeyCode                 string `json:"selectionKeyCode"`
	MultiSelectionKeyCode            string `json:"multiSelectionKeyCode"`
	PanActivationKeyCode             string `json:"panActivationKeyCode"`
	ZoomActivationKeyCode            string `json:"zoomActivationKeyCode"`
	ZoomInShortcut                   string `json:"zoomInShortcut"`
	ZoomOutShortcut                  string `json:"zoomOutShortcut"`
	RestartLanguageServerShortcut    string `json:"restartLanguageServerShortcut"`
}

type FrontendSettingsGUI struct {
	SnapGrid               [2]float64                  `json:"snapGrid"`
	ShowGridLines          bool                        `json:"showGridLines"`
	GridPattern            string                      `json:"gridPattern"`
	GridPatternSize        float64                     `json:"gridPatternSize"`
	GridColor              string                      `json:"gridColor"`
	GridColorDarkMode      string                      `json:"gridColorDarkMode"`
	WireColor              string                      `json:"wireColor"`
	WireColorDarkMode      string                      `json:"wireColorDarkMode"`
	DefaultZoomLevel       float64                     `json:"defaultZoomLevel"`
	MinZoom                float64                     `json:"minZoom"`
	MaxZoom                float64                     `json:"maxZoom"`
	PanOnDrag              bool                        `json:"panOnDrag"`
	PanOnScroll            bool                        `json:"panOnScroll"`
	PanOnScrollSpeed       float64                     `json:"panOnScrollSpeed"`
	PanOnScrollMode        string                      `json:"panOnScrollMode"`
	ZoomOnScroll           bool                        `json:"zoomOnScroll"`
	ZoomOnPinch            bool                        `json:"zoomOnPinch"`
	ZoomOnDoubleClick      bool                        `json:"zoomOnDoubleClick"`
	SelectionMode          string                      `json:"selectionMode"`
	LeftSidePaneShiftsMap  bool                        `json:"leftSidePaneShiftsMap"`
	TransitionDuration     float64                     `json:"transitionDuration"`
	SectionTagColorChoices []FrontendColorPickerChoice `json:"sectionTagColorChoices"`
}

type FrontendSettingsBackend struct {
	ShowDefaultConfigOnLoad                bool                            `json:"showDefaultConfigOnLoad"`
	Autosave                               bool                            `json:"autosave"`
	Autobackup                             bool                            `json:"autobackup"`
	AutobackupFreq                         float64                         `json:"autobackupFreq"`
	AutobackupKeepLastN                    float64                         `json:"autobackupKeepLastN"`
	ClearTerminalBeforeMarkingAsReady      bool                            `json:"clearTerminalBeforeMarkingAsReady"`
	DefaultTerminalShell                   *string                         `json:"defaultTerminalShell,omitempty"`
	ExportDbReadableOnSave                 bool                            `json:"exportDbReadableOnSave"`
	ExportDbReadableWithVariantsOnSave     bool                            `json:"exportDbReadableWithVariantsOnSave"`
	AutoRefetchCallableParamsOnLspMismatch bool                            `json:"autoRefetchCallableParamsOnLspMismatch"`
	RenameRefactorMode                     projectstate.RenameRefactorMode `json:"renameRefactorMode"`
	SaveRenderedValues                     bool                            `json:"saveRenderedValues"`
	RunSnapshotMode                        deployments.RunSnapshotMode     `json:"runSnapshotMode"`
	CompletionGuardEnabled                 bool                            `json:"completionGuardEnabled"`
}

type FrontendSettingsState struct {
	Shortcuts           FrontendSettingsShortcuts `json:"shortcuts"`
	GUI                 FrontendSettingsGUI       `json:"gui"`
	Backend             FrontendSettingsBackend   `json:"backend"`
	SectionSizingPolicy map[string]any            `json:"sectionSizingPolicy"`
	LanguageServer      map[string]any            `json:"languageServer"`
}

func FrontendDefaultSettingsShortcuts() FrontendSettingsShortcuts {
	return frontendDefaultSettingsSection[FrontendSettingsShortcuts]("shortcuts")
}

func FrontendDefaultSettingsGUI() FrontendSettingsGUI {
	return frontendDefaultSettingsSection[FrontendSettingsGUI]("gui")
}

func FrontendDefaultSettingsBackend() FrontendSettingsBackend {
	return frontendDefaultSettingsSection[FrontendSettingsBackend]("backend")
}

func FrontendDefaultSettingsState() FrontendSettingsState {
	defaults, err := DefaultDocument()
	if err != nil {
		panic("load frontend settings state defaults: " + err.Error())
	}
	return frontendDefaultSettingsValue[FrontendSettingsState](
		"frontend settings state defaults",
		defaults,
	)
}

func frontendDefaultSettingsSection[T any](key string) T {
	defaults, err := DefaultDocument()
	if err != nil {
		panic("load frontend settings defaults: " + err.Error())
	}
	raw, ok := defaults[key]
	if !ok {
		panic("frontend settings defaults missing section: " + key)
	}
	return frontendDefaultSettingsValue[T](
		"frontend settings defaults "+key,
		raw,
	)
}

func frontendDefaultSettingsValue[T any](context string, value any) T {
	payload, err := json.Marshal(value)
	if err != nil {
		panic(context + ": marshal defaults: " + err.Error())
	}
	var decoded T
	if err := json.Unmarshal(payload, &decoded); err != nil {
		panic(context + ": decode defaults: " + err.Error())
	}
	return decoded
}
