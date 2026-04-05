package projectstate

import "setta/internal/prompttemplates"

type FrontendSectionType string

const (
	FrontendSectionTypeCallable          FrontendSectionType = "Callable"
	FrontendSectionTypeDict              FrontendSectionType = "Dict"
	FrontendSectionTypeListRoot          FrontendSectionType = "ListRoot"
	FrontendSectionTypeGroup             FrontendSectionType = "Group"
	FrontendSectionTypeStateMachineStart FrontendSectionType = "StateMachineStart"
	FrontendSectionTypeStateMachineGate  FrontendSectionType = "StateMachineGate"
	FrontendSectionTypeStateMachineEnd   FrontendSectionType = "StateMachineEnd"
	FrontendSectionTypeImage             FrontendSectionType = "Image"
	FrontendSectionTypeChart             FrontendSectionType = "Chart"
	FrontendSectionTypeDraw              FrontendSectionType = "Draw"
	FrontendSectionTypePrompt            FrontendSectionType = "Prompt"
	FrontendSectionTypeTextBlock         FrontendSectionType = "TextBlock"
	FrontendSectionTypeMetaControl       FrontendSectionType = "MetaControl"
	FrontendSectionTypeSocial            FrontendSectionType = "Social"
	FrontendSectionTypeGlobalVariables   FrontendSectionType = "GlobalVariables"
	FrontendSectionTypeCode              FrontendSectionType = "Code"
	FrontendSectionTypeGenPythonCode     FrontendSectionType = "GenPythonCode"
	FrontendSectionTypeGenPythonMetadata FrontendSectionType = "GenPythonMetadata"
	FrontendSectionTypeTerminal          FrontendSectionType = "Terminal"
	FrontendSectionTypeIFrame            FrontendSectionType = "IFrame"
	FrontendSectionTypeChat              FrontendSectionType = "Chat"
	FrontendSectionTypeBrowser           FrontendSectionType = "Browser"
	FrontendSectionTypePlugin            FrontendSectionType = "Plugin"
	FrontendSectionTypeTaskBoard         FrontendSectionType = "TaskBoard"
	FrontendSectionTypeSpreadsheet       FrontendSectionType = "Spreadsheet"
)

type FrontendCodeObjType string

const (
	FrontendCodeObjTypeCodeCallable     FrontendCodeObjType = "CodeCallable"
	FrontendCodeObjTypeCodeParam        FrontendCodeObjType = "CodeParam"
	FrontendCodeObjTypeTextParam        FrontendCodeObjType = "TextParam"
	FrontendCodeObjTypeDateParam        FrontendCodeObjType = "DateParam"
	FrontendCodeObjTypeTimeParam        FrontendCodeObjType = "TimeParam"
	FrontendCodeObjTypeButtonParam      FrontendCodeObjType = "ButtonParam"
	FrontendCodeObjTypeSliderParam      FrontendCodeObjType = "SliderParam"
	FrontendCodeObjTypeRotaryParam      FrontendCodeObjType = "RotaryParam"
	FrontendCodeObjTypeSwitchParam      FrontendCodeObjType = "SwitchParam"
	FrontendCodeObjTypeColorPickerParam FrontendCodeObjType = "ColorPickerParam"
	FrontendCodeObjTypeDropdownParam    FrontendCodeObjType = "DropdownParam"
	FrontendCodeObjTypePasswordParam    FrontendCodeObjType = "PasswordParam"
	FrontendCodeObjTypeTextAreaParam    FrontendCodeObjType = "TextAreaParam"
	FrontendCodeObjTypeDropzoneParam    FrontendCodeObjType = "DropzoneParam"
	FrontendCodeObjTypeNestedParam      FrontendCodeObjType = "NestedParam"
)

type FrontendConfigLanguage string

const (
	FrontendConfigLanguagePython FrontendConfigLanguage = "python"
	FrontendConfigLanguageJSON   FrontendConfigLanguage = "json"
)

type FrontendParameterPassingStyle string

const (
	FrontendParameterPassingStyleDefault        FrontendParameterPassingStyle = "DEFAULT"
	FrontendParameterPassingStyleArgs           FrontendParameterPassingStyle = "ARGS"
	FrontendParameterPassingStyleKwargs         FrontendParameterPassingStyle = "KWARGS"
	FrontendParameterPassingStylePositionalOnly FrontendParameterPassingStyle = "POSITIONAL_ONLY"
	FrontendParameterPassingStyleKeywordOnly    FrontendParameterPassingStyle = "KEYWORD_ONLY"
)

type FrontendParamNameType string

const (
	FrontendParamNameTypeCode FrontendParamNameType = "CODE"
	FrontendParamNameTypeText FrontendParamNameType = "TEXT"
)

type FrontendButtonActionMode string

const (
	FrontendButtonActionModeWebsocketListener FrontendButtonActionMode = "WEBSOCKET_LISTENER"
	FrontendButtonActionModeHTTPRequest       FrontendButtonActionMode = "HTTP_REQUEST"
	FrontendButtonActionModeSettaAPI          FrontendButtonActionMode = "SETTA_API"
)

type FrontendHTTPRequestMethod string

const (
	FrontendHTTPRequestMethodGet     FrontendHTTPRequestMethod = "GET"
	FrontendHTTPRequestMethodPost    FrontendHTTPRequestMethod = "POST"
	FrontendHTTPRequestMethodPut     FrontendHTTPRequestMethod = "PUT"
	FrontendHTTPRequestMethodPatch   FrontendHTTPRequestMethod = "PATCH"
	FrontendHTTPRequestMethodDelete  FrontendHTTPRequestMethod = "DELETE"
	FrontendHTTPRequestMethodHead    FrontendHTTPRequestMethod = "HEAD"
	FrontendHTTPRequestMethodOptions FrontendHTTPRequestMethod = "OPTIONS"
)

type FrontendDropzoneMode string

const (
	FrontendDropzoneModeStateful  FrontendDropzoneMode = "STATEFUL"
	FrontendDropzoneModeStateless FrontendDropzoneMode = "STATELESS"
)

type FrontendTextParamInputUIType string

const (
	FrontendTextParamInputUITypePlain FrontendTextParamInputUIType = "plain"
	FrontendTextParamInputUITypeTime  FrontendTextParamInputUIType = "time"
	FrontendTextParamInputUITypeDate  FrontendTextParamInputUIType = "date"
)

type FrontendTimeDisplayFormat string

const (
	FrontendTimeDisplayFormatTwentyFourHour FrontendTimeDisplayFormat = "twenty_four_hour"
	FrontendTimeDisplayFormatTwelveHour     FrontendTimeDisplayFormat = "twelve_hour"
)

type FrontendTimeControlMode string

const (
	FrontendTimeControlModeInput   FrontendTimeControlMode = "input"
	FrontendTimeControlModeDisplay FrontendTimeControlMode = "display"
)

type FrontendTimeDisplayFont string

const (
	FrontendTimeDisplayFontClock     FrontendTimeDisplayFont = "clock"
	FrontendTimeDisplayFontMonospace FrontendTimeDisplayFont = "monospace"
	FrontendTimeDisplayFontSystem    FrontendTimeDisplayFont = "system"
)

type FrontendDateDisplayFormat string

const (
	FrontendDateDisplayFormatISO  FrontendDateDisplayFormat = "iso"
	FrontendDateDisplayFormatUS   FrontendDateDisplayFormat = "us"
	FrontendDateDisplayFormatEU   FrontendDateDisplayFormat = "eu"
	FrontendDateDisplayFormatLong FrontendDateDisplayFormat = "long"
)

type FrontendDateControlMode string

const (
	FrontendDateControlModeInput    FrontendDateControlMode = "input"
	FrontendDateControlModeCalendar FrontendDateControlMode = "calendar"
)

type FrontendDateSelectionMode string

const (
	FrontendDateSelectionModeSingle   FrontendDateSelectionMode = "single"
	FrontendDateSelectionModeMultiple FrontendDateSelectionMode = "multiple"
)

type FrontendDateCalendarWeekStart string

const (
	FrontendDateCalendarWeekStartSunday FrontendDateCalendarWeekStart = "sunday"
	FrontendDateCalendarWeekStartMonday FrontendDateCalendarWeekStart = "monday"
)

type FrontendTaskBoardTaskRecurrence string

const (
	FrontendTaskBoardTaskRecurrenceNone            FrontendTaskBoardTaskRecurrence = "none"
	FrontendTaskBoardTaskRecurrenceHourly          FrontendTaskBoardTaskRecurrence = "hourly"
	FrontendTaskBoardTaskRecurrenceDaily           FrontendTaskBoardTaskRecurrence = "daily"
	FrontendTaskBoardTaskRecurrenceSpecifiedDays   FrontendTaskBoardTaskRecurrence = "specified_days"
	FrontendTaskBoardTaskRecurrenceSpecifiedMonths FrontendTaskBoardTaskRecurrence = "specified_months"
	FrontendTaskBoardTaskRecurrenceSpecifiedYears  FrontendTaskBoardTaskRecurrence = "specified_years"
)

type FrontendTaskBoardRecurringWeekday string

const (
	FrontendTaskBoardRecurringWeekdayMonday    FrontendTaskBoardRecurringWeekday = "monday"
	FrontendTaskBoardRecurringWeekdayTuesday   FrontendTaskBoardRecurringWeekday = "tuesday"
	FrontendTaskBoardRecurringWeekdayWednesday FrontendTaskBoardRecurringWeekday = "wednesday"
	FrontendTaskBoardRecurringWeekdayThursday  FrontendTaskBoardRecurringWeekday = "thursday"
	FrontendTaskBoardRecurringWeekdayFriday    FrontendTaskBoardRecurringWeekday = "friday"
	FrontendTaskBoardRecurringWeekdaySaturday  FrontendTaskBoardRecurringWeekday = "saturday"
	FrontendTaskBoardRecurringWeekdaySunday    FrontendTaskBoardRecurringWeekday = "sunday"
)

type FrontendTaskBoardRecurringMonth string

const (
	FrontendTaskBoardRecurringMonthJanuary   FrontendTaskBoardRecurringMonth = "january"
	FrontendTaskBoardRecurringMonthFebruary  FrontendTaskBoardRecurringMonth = "february"
	FrontendTaskBoardRecurringMonthMarch     FrontendTaskBoardRecurringMonth = "march"
	FrontendTaskBoardRecurringMonthApril     FrontendTaskBoardRecurringMonth = "april"
	FrontendTaskBoardRecurringMonthMay       FrontendTaskBoardRecurringMonth = "may"
	FrontendTaskBoardRecurringMonthJune      FrontendTaskBoardRecurringMonth = "june"
	FrontendTaskBoardRecurringMonthJuly      FrontendTaskBoardRecurringMonth = "july"
	FrontendTaskBoardRecurringMonthAugust    FrontendTaskBoardRecurringMonth = "august"
	FrontendTaskBoardRecurringMonthSeptember FrontendTaskBoardRecurringMonth = "september"
	FrontendTaskBoardRecurringMonthOctober   FrontendTaskBoardRecurringMonth = "october"
	FrontendTaskBoardRecurringMonthNovember  FrontendTaskBoardRecurringMonth = "november"
	FrontendTaskBoardRecurringMonthDecember  FrontendTaskBoardRecurringMonth = "december"
)

type FrontendCodeFileBinding struct {
	CanonicalPath string             `json:"canonical_path"`
	AccessMode    CodeFileAccessMode `json:"access_mode" ts_type:"CodeFileAccessMode"`
	AutoBinding   bool               `json:"autoBinding"`
}

type FrontendBaseSectionImpl struct {
	Type                    FrontendSectionType `json:"type"`
	ID                      string              `json:"id"`
	Name                    string              `json:"name"`
	IsFrozen                bool                `json:"isFrozen"`
	IsInOtherProjectConfigs bool                `json:"isInOtherProjectConfigs"`
	TagColor                *string             `json:"tagColor"`
	StyleColor              *string             `json:"styleColor"`
	Size                    SectionSize         `json:"size"`
	AspectRatio             any                 `json:"aspectRatio"`
	AspectRatioExtraHeight  float64             `json:"aspectRatioExtraHeight"`
	AspectRatioExtraWidth   float64             `json:"aspectRatioExtraWidth"`
	IsMinimized             bool                `json:"isMinimized"`
	PositionAndSizeLocked   bool                `json:"positionAndSizeLocked"`
	IsPreset                bool                `json:"isPreset"`
}

type FrontendSectionWithParamsLeadingFields struct {
	CodeObjVariantMap  map[string]string `json:"codeObjVariantMap"`
	HideUnpinnedParams bool              `json:"hideUnpinnedParams"`
	ParamFilter        string            `json:"paramFilter"`
	ColumnWidth        *float64          `json:"columnWidth"`
}

type FrontendSectionWithParamsTrailingFields struct {
	PinnedParams     []string             `json:"pinnedParams"`
	SelectedParams   []string             `json:"selectedParams"`
	IgnoreTypeErrors TypeErrorIgnoreState `json:"ignoreTypeErrors"`
	EdgeInputParams  []string             `json:"edgeInputParams"`
	EdgeOutputPorts  []EdgePort           `json:"edgeOutputPorts"`
}

type FrontendSectionWithParamsCommon struct {
	FrontendSectionWithParamsLeadingFields
	FrontendSectionWithParamsTrailingFields
}

type FrontendChatSectionBranch = ChatSectionBranch

type FrontendChatSectionState = ChatSectionState

type FrontendChatSectionImpl struct {
	FrontendBaseSectionImpl
	Managed                bool               `json:"managed"`
	EngineConfigID         *string            `json:"engineConfigId,omitempty"`
	TranscriptionProfileID *string            `json:"transcriptionProfileId,omitempty"`
	AgentProfileID         *string            `json:"agentProfileId,omitempty"`
	ChatID                 *string            `json:"chatId,omitempty"`
	Thinking               bool               `json:"thinking"`
	PermissionMode         ChatPermissionMode `json:"permissionMode"`
	SearchEnabled          bool               `json:"searchEnabled"`
	DictationMode          ChatDictationMode  `json:"dictationMode"`
	FrontendChatSectionState
}

type FrontendBrowserSectionImpl struct {
	FrontendBaseSectionImpl
	Folder           string               `json:"folder"`
	HideColumn       bool                 `json:"hideColumn"`
	ColumnWidth      *float64             `json:"columnWidth,omitempty"`
	TypesColumnWidth *float64             `json:"typesColumnWidth,omitempty"`
	ViewMode         BrowserAreaViewMode  `json:"viewMode"`
	SavedSearches    []BrowserSavedSearch `json:"savedSearches"`
}

type FrontendListRootSectionImpl struct {
	FrontendBaseSectionImpl
	Children                []string            `json:"children"`
	DefaultChildSectionType FrontendSectionType `json:"defaultChildSectionType"`
	ViewMode                ListRootViewMode    `json:"viewMode"`
}

type FrontendGroupSectionImpl struct {
	FrontendBaseSectionImpl
	Children                []string            `json:"children"`
	IsHorizontalOrientation bool                `json:"isHorizontalOrientation"`
	OverflowMode            bool                `json:"overflowMode"`
	DefaultChildSectionType FrontendSectionType `json:"defaultChildSectionType"`
}

type FrontendStateMachineStartSectionImpl struct {
	FrontendBaseSectionImpl
	MachineGroupID string `json:"machineGroupId"`
	Label          string `json:"label"`
	MaxIterations  *int   `json:"maxIterations,omitempty"`
}

type FrontendStateMachineGateSectionImpl struct {
	FrontendBaseSectionImpl
	MachineGroupID string                  `json:"machineGroupId"`
	GateType       StateMachineGateType    `json:"gateType"`
	Label          string                  `json:"label"`
	UI             StateMachineGateUIState `json:"ui"`
}

type FrontendStateMachineEndSectionImpl struct {
	FrontendBaseSectionImpl
	MachineGroupID string `json:"machineGroupId"`
	Label          string `json:"label"`
}

type FrontendTextBlockSectionImpl struct {
	FrontendBaseSectionImpl
	Format               TextBlockFormat      `json:"format"`
	MasterFontSizePx     float64              `json:"masterFontSizePx"`
	HeadingAsSectionName bool                 `json:"headingAsSectionName"`
	MetaControlStyle     bool                 `json:"metaControlStyle"`
	TextDisplayMode      TextBlockDisplayMode `json:"textDisplayMode"`
	Text                 string               `json:"text"`
}

type FrontendPromptSectionImpl struct {
	FrontendBaseSectionImpl
	PromptTemplateID *string                `json:"promptTemplateId,omitempty"`
	Template         string                 `json:"template"`
	Format           prompttemplates.Format `json:"format"`
	Inputs           map[string]string      `json:"inputs"`
	RenderedText     string                 `json:"renderedText"`
	MissingVariables []string               `json:"missingVariables"`
	RenderError      *string                `json:"renderError,omitempty"`
}

type FrontendCodeSectionImpl struct {
	FrontendBaseSectionImpl
	Children                  []string                          `json:"children"`
	Code                      string                            `json:"code"`
	CodeFileBinding           *FrontendCodeFileBinding          `json:"codeFileBinding,omitempty"`
	AttachedTerminalSectionID *string                           `json:"attachedTerminalSectionId,omitempty"`
	CodeLanguage              string                            `json:"codeLanguage"`
	DiagnosticsIgnoreState    CodeSectionDiagnosticsIgnoreState `json:"diagnosticsIgnoreState"`
}

type FrontendTerminalSectionImpl struct {
	FrontendBaseSectionImpl
}

type FrontendCallableSectionImpl struct {
	FrontendBaseSectionImpl
	FrontendSectionWithParamsLeadingFields
	ConfigLanguage FrontendConfigLanguage `json:"configLanguage"`
	FrontendSectionWithParamsTrailingFields
	Callable   *string `json:"callable,omitempty"`
	HideParams bool    `json:"hideParams"`
}

type FrontendDictSectionImpl struct {
	FrontendBaseSectionImpl
	FrontendSectionWithParamsLeadingFields
	ConfigLanguage string `json:"configLanguage"`
	FrontendSectionWithParamsTrailingFields
	TopLevelParamID   *string  `json:"topLevelParamId"`
	IsJSONSource      bool     `json:"isJsonSource"`
	JSONSourceKeys    []string `json:"jsonSourceKeys"`
	JSONSourceMissing bool     `json:"jsonSourceMissing"`
}

type FrontendTaskBoardTask = TaskBoardTask

type FrontendTaskBoardSectionImpl struct {
	FrontendBaseSectionImpl
	ViewMode TaskBoardViewMode       `json:"viewMode"`
	Columns  []TaskBoardColumn       `json:"columns"`
	Tasks    []FrontendTaskBoardTask `json:"tasks"`
}

type FrontendChartSectionImpl struct {
	FrontendBaseSectionImpl
	DataPath      string `json:"dataPath"`
	ChartSettings any    `json:"chartSettings"`
}

type FrontendSpreadsheetSectionImpl struct {
	FrontendBaseSectionImpl
	FilePath                   string                 `json:"filePath"`
	ActiveSheet                *string                `json:"activeSheet,omitempty"`
	ReadOnly                   bool                   `json:"readOnly"`
	ShowRowNumbers             bool                   `json:"showRowNumbers"`
	Density                    SpreadsheetGridDensity `json:"density"`
	AutoReloadOnExternalChange bool                   `json:"autoReloadOnExternalChange"`
}

type FrontendBaseCodeObjImpl struct {
	Type        FrontendCodeObjType `json:"type"`
	ID          string              `json:"id"`
	Name        string              `json:"name"`
	Description string              `json:"description"`
	IsPreset    bool                `json:"isPreset"`
}

type FrontendBaseParamCodeObjImpl struct {
	FrontendBaseCodeObjImpl
	FrontendParamCodeObjFields
}

type FrontendParamCodeObjFields struct {
	CoreNameType     FrontendParamNameType         `json:"coreNameType"`
	CoreNameEditable bool                          `json:"coreNameEditable"`
	PassingStyle     FrontendParameterPassingStyle `json:"passingStyle"`
	TypeAnnotation   string                        `json:"typeAnnotation"`
}

type FrontendBaseValueParamCodeObjImpl struct {
	FrontendBaseParamCodeObjImpl
	DefaultVal string `json:"defaultVal"`
	Value      string `json:"value"`
}

type FrontendCodeParamCodeObjImpl struct {
	FrontendBaseValueParamCodeObjImpl
}

type FrontendCodeCallableCodeObjImpl struct {
	FrontendBaseCodeObjImpl
	Children []string `json:"children"`
}

type FrontendNestedParamCodeObjImpl struct {
	FrontendBaseCodeObjImpl
	Children []string `json:"children"`
	FrontendParamCodeObjFields
}

type FrontendTextParamCodeObjImpl struct {
	FrontendBaseValueParamCodeObjImpl
	UIType FrontendTextParamInputUIType `json:"uiType"`
}

type FrontendDateParamCodeObjImpl struct {
	FrontendBaseValueParamCodeObjImpl
	DateDisplayFormat     FrontendDateDisplayFormat     `json:"dateDisplayFormat"`
	DateControlMode       FrontendDateControlMode       `json:"dateControlMode"`
	DateSelectionMode     FrontendDateSelectionMode     `json:"dateSelectionMode"`
	DateCalendarWeekStart FrontendDateCalendarWeekStart `json:"dateCalendarWeekStart"`
	DateIncludesTime      bool                          `json:"dateIncludesTime"`
}

type FrontendTimeParamCodeObjImpl struct {
	FrontendBaseValueParamCodeObjImpl
	TimeControlMode        FrontendTimeControlMode   `json:"timeControlMode"`
	TimeDisplayFormat      FrontendTimeDisplayFormat `json:"timeDisplayFormat"`
	TimeDisplayTransparent bool                      `json:"timeDisplayTransparent"`
	TimeDisplayScale       float64                   `json:"timeDisplayScale"`
	TimeDisplayFont        FrontendTimeDisplayFont   `json:"timeDisplayFont"`
}

type FrontendButtonParamCodeObjImpl struct {
	FrontendBaseParamCodeObjImpl
	Label              string                    `json:"label"`
	ActionMode         FrontendButtonActionMode  `json:"actionMode"`
	RequestMethod      FrontendHTTPRequestMethod `json:"requestMethod"`
	RequestURL         string                    `json:"requestUrl"`
	RequestHeaderKey   string                    `json:"requestHeaderKey"`
	RequestHeaderValue string                    `json:"requestHeaderValue"`
	RequestBody        string                    `json:"requestBody"`
}

type FrontendSliderParamCodeObjImpl struct {
	FrontendBaseValueParamCodeObjImpl
	Min  float64 `json:"min"`
	Max  float64 `json:"max"`
	Step float64 `json:"step"`
}

type FrontendRotaryParamCodeObjImpl struct {
	FrontendBaseValueParamCodeObjImpl
	Min  float64 `json:"min"`
	Max  float64 `json:"max"`
	Step float64 `json:"step"`
}

type FrontendSwitchParamCodeObjImpl struct {
	FrontendBaseValueParamCodeObjImpl
}

type FrontendColorPickerParamCodeObjImpl struct {
	FrontendBaseValueParamCodeObjImpl
	ColorChoices []map[string]string `json:"colorChoices"`
}

type FrontendDropdownParamCodeObjImpl struct {
	FrontendBaseValueParamCodeObjImpl
	Choices []string `json:"choices"`
}

type FrontendPasswordParamCodeObjImpl struct {
	FrontendBaseValueParamCodeObjImpl
	HasSecret bool `json:"hasSecret"`
}

type FrontendTextAreaParamCodeObjImpl struct {
	FrontendBaseValueParamCodeObjImpl
}

type FrontendDropzoneParamCodeObjImpl struct {
	FrontendBaseValueParamCodeObjImpl
	Mode           FrontendDropzoneMode `json:"mode"`
	MaxAttachments *int                 `json:"maxAttachments,omitempty"`
	Placeholder    string               `json:"placeholder"`
}
