package frontendbindings

type ProjectStateSingleConfig struct{}

type ProjectMetadataEntry struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type AllProjectMetadata struct {
	DefaultProjectConfigID *string                `json:"defaultProjectConfigId"`
	ProjectMetadata        []ProjectMetadataEntry `json:"projectMetadata"`
}

type LoadProjectConfigRequestInput struct {
	ProjectConfigName string `json:"projectConfigName"`
}

type CreateProjectConfigRequestInput struct {
	PreviewImgColor string `json:"previewImgColor"`
}

type CreateProjectConfigResponse string

type CreateNewSectionVariantRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
	SectionID       string  `json:"sectionId"`
}

type CreateNewSectionVariantResponse struct {
	VariantID string `json:"variantId"`
}

type SetSectionVariantRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
	SectionID       string  `json:"sectionId"`
	VariantID       string  `json:"variantId"`
}

type SetDefaultSectionVariantRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
	SectionID       string  `json:"sectionId"`
	VariantID       string  `json:"variantId"`
}

type SetSectionVariantSortOrderRequestInput struct {
	FrontendOpID      *string  `json:"frontendOpId,omitempty"`
	ProjectConfigID   string   `json:"projectConfigId"`
	SectionID         string   `json:"sectionId"`
	OrderedVariantIDs []string `json:"orderedVariantIds"`
}

type ToggleVariantFrozenRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
	VariantID       string  `json:"variantId"`
}

type ToggleVariantJSONSourceRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
	SectionID       string  `json:"sectionId"`
	VariantID       string  `json:"variantId"`
}

type SetVariantJSONSourceKeysRequestInput struct {
	FrontendOpID    *string  `json:"frontendOpId,omitempty"`
	ProjectConfigID string   `json:"projectConfigId"`
	SectionID       string   `json:"sectionId"`
	VariantID       string   `json:"variantId"`
	JSONSourceKeys  []string `json:"jsonSourceKeys"`
}

type SetSectionVariantNameRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
	VariantID       string  `json:"variantId"`
	Name            string  `json:"name"`
}

type CreateChildSectionsRequestInput struct {
	FrontendOpID    *string     `json:"frontendOpId,omitempty"`
	ProjectConfigID string      `json:"projectConfigId"`
	ParentID        string      `json:"parentId"`
	ImplType        SectionType `json:"implType"`
	NumChildren     int         `json:"numChildren"`
	StartIdx        *int        `json:"startIdx,omitempty"`
}

type CreateChildSectionsViaIncrementerRequestInput struct {
	FrontendOpID    *string     `json:"frontendOpId,omitempty"`
	ProjectConfigID string      `json:"projectConfigId"`
	CalledBy        string      `json:"calledBy"`
	ImplType        SectionType `json:"implType"`
	NumChildren     int         `json:"numChildren"`
}

type CreateChildSectionsResponse struct {
	SectionIDs []string `json:"sectionIds"`
}

type DeleteChildSectionsViaDecrementerRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
	CalledBy        string  `json:"calledBy"`
	NumChildren     int     `json:"numChildren"`
}

type DeleteChildSectionsViaDecrementerResponse struct {
	SectionIDs []string `json:"sectionIds"`
}

type DeleteSectionsRequestInput struct {
	FrontendOpID    *string  `json:"frontendOpId,omitempty"`
	ProjectConfigID string   `json:"projectConfigId"`
	SectionIDs      []string `json:"sectionIds"`
}

type DeleteSelectedParamsRequestInput struct {
	FrontendOpID    *string  `json:"frontendOpId,omitempty"`
	ProjectConfigID string   `json:"projectConfigId"`
	SectionID       string   `json:"sectionId"`
	ParamInfoIDs    []string `json:"paramInfoIds"`
}

type PrepareSectionsForCopyRequestInput struct {
	ProjectConfigID string   `json:"projectConfigId"`
	SectionIDs      []string `json:"sectionIds"`
}

type PasteSectionsRequestInput struct {
	ProjectConfigID string                                         `json:"projectConfigId"`
	Data            ClipboardProjectStateCoreWithSectionVariantMap `json:"data"`
	Position        Position                                       `json:"position"`
	AsRef           bool                                           `json:"asRef"`
}

type SectionsClipboardDataResponse struct{}

type CreateEdgeRequestInput struct {
	FrontendOpID    *string        `json:"frontendOpId,omitempty"`
	ProjectConfigID string         `json:"projectConfigId"`
	SourceSectionID string         `json:"sourceSectionId"`
	SourceVariantID string         `json:"sourceVariantId"`
	SourcePortID    string         `json:"sourcePortId"`
	TargetSectionID string         `json:"targetSectionId"`
	TargetVariantID string         `json:"targetVariantId"`
	TargetPortID    string         `json:"targetPortId"`
	Type            *string        `json:"type,omitempty"`
	Label           *string        `json:"label,omitempty"`
	Style           map[string]any `json:"style,omitempty"`
	Animated        *bool          `json:"animated,omitempty"`
	Hidden          *bool          `json:"hidden,omitempty"`
	ZIndex          *int           `json:"zIndex,omitempty"`
	Data            map[string]any `json:"data,omitempty"`
}

type UpdateEdgeRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
	Edge            Edge    `json:"edge"`
}

type DeleteEdgesRequestInput struct {
	FrontendOpID    *string  `json:"frontendOpId,omitempty"`
	ProjectConfigID string   `json:"projectConfigId"`
	EdgeIDs         []string `json:"edgeIds"`
}

type ReconnectEdgeRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
	EdgeID          string  `json:"edgeId"`
	SourceSectionID string  `json:"sourceSectionId"`
	SourceVariantID string  `json:"sourceVariantId"`
	SourcePortID    string  `json:"sourcePortId"`
	TargetSectionID string  `json:"targetSectionId"`
	TargetVariantID string  `json:"targetVariantId"`
	TargetPortID    string  `json:"targetPortId"`
}

type SetEdgesRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
	Edges           []Edge  `json:"edges"`
}

type CreateAgenticEdgeRequestInput struct {
	FrontendOpID    *string                 `json:"frontendOpId,omitempty"`
	ProjectConfigID string                  `json:"projectConfigId"`
	ID              *string                 `json:"id,omitempty"`
	SourceSectionID string                  `json:"sourceSectionId"`
	TargetSectionID string                  `json:"targetSectionId"`
	Kind            AgenticEdgeKind         `json:"kind"`
	ContextMode     *AgenticEdgeContextMode `json:"contextMode,omitempty"`
	Style           map[string]any          `json:"style,omitempty"`
	Hidden          *bool                   `json:"hidden,omitempty"`
	ZIndex          *int                    `json:"zIndex,omitempty"`
}

type UpdateAgenticEdgeRequestInput struct {
	FrontendOpID    *string     `json:"frontendOpId,omitempty"`
	ProjectConfigID string      `json:"projectConfigId"`
	Edge            AgenticEdge `json:"edge"`
}

type DeleteAgenticEdgesRequestInput struct {
	FrontendOpID    *string  `json:"frontendOpId,omitempty"`
	ProjectConfigID string   `json:"projectConfigId"`
	EdgeIDs         []string `json:"edgeIds"`
}

type SetAgenticEdgesRequestInput struct {
	FrontendOpID    *string       `json:"frontendOpId,omitempty"`
	ProjectConfigID string        `json:"projectConfigId"`
	Edges           []AgenticEdge `json:"edges"`
}

type MoveSectionsRequestInput struct {
	FrontendOpID    *string             `json:"frontendOpId,omitempty"`
	ProjectConfigID string              `json:"projectConfigId"`
	SectionIDs      []string            `json:"sectionIds"`
	NewParentID     *string             `json:"newParentId"`
	NewIndex        *int                `json:"newIndex"`
	PositionsByID   map[string]Position `json:"positionsById"`
}

type MoveParamGroup struct {
	ParamIDs    []string `json:"paramIds"`
	NewParentID string   `json:"newParentId"`
	NewIndex    int      `json:"newIndex"`
}

type MoveParamsRequestInput struct {
	FrontendOpID    *string  `json:"frontendOpId,omitempty"`
	ProjectConfigID string   `json:"projectConfigId"`
	SectionID       string   `json:"sectionId"`
	ParamIDs        []string `json:"paramIds"`
	NewParentID     string   `json:"newParentId"`
	NewIndex        int      `json:"newIndex"`
}

type MoveParamGroupsRequestInput struct {
	FrontendOpID    *string          `json:"frontendOpId,omitempty"`
	ProjectConfigID string           `json:"projectConfigId"`
	SectionID       string           `json:"sectionId"`
	Moves           []MoveParamGroup `json:"moves"`
}

type IndentParamsRequestInput struct {
	FrontendOpID    *string  `json:"frontendOpId,omitempty"`
	ProjectConfigID string   `json:"projectConfigId"`
	SectionID       string   `json:"sectionId"`
	ParamIDs        []string `json:"paramIds"`
}

type UnindentParamsRequestInput struct {
	FrontendOpID    *string  `json:"frontendOpId,omitempty"`
	ProjectConfigID string   `json:"projectConfigId"`
	SectionID       string   `json:"sectionId"`
	ParamIDs        []string `json:"paramIds"`
}

type AddKwargRequestInput struct {
	ProjectConfigID string `json:"projectConfigId"`
	SectionID       string `json:"sectionId"`
}

type DeleteKwargRequestInput struct {
	ProjectConfigID string `json:"projectConfigId"`
	SectionID       string `json:"sectionId"`
}

type SetParamEnteredValueRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
	SectionID       string  `json:"sectionId"`
	ParamInfoID     string  `json:"paramInfoId"`
	Value           string  `json:"value"`
}

type UpdateParamImplConfigRequestInput struct {
	FrontendOpID    *string        `json:"frontendOpId,omitempty"`
	ProjectConfigID string         `json:"projectConfigId"`
	SectionID       string         `json:"sectionId"`
	ParamInfoID     string         `json:"paramInfoId"`
	NewConfig       map[string]any `json:"newConfig"`
}

type SetCodeSectionAttachedTerminalRequestInput struct {
	FrontendOpID      *string `json:"frontendOpId,omitempty"`
	ProjectConfigID   string  `json:"projectConfigId"`
	SectionID         string  `json:"sectionId"`
	TerminalSectionID *string `json:"terminalSectionId,omitempty"`
}

type SetGenCodePrefixRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
	GenCodePrefix   string  `json:"genCodePrefix"`
}

type SetGenCodeSuffixRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
	GenCodeSuffix   string  `json:"genCodeSuffix"`
}

type SetCodeObjNameRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
	CodeObjID       string  `json:"codeObjId"`
	Name            string  `json:"name"`
}

type SetCodeObjDisplayNameRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
	CodeObjID       string  `json:"codeObjId"`
	DisplayName     string  `json:"displayName"`
}

type Position struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

type RunSnapshotMode string

type RenameRefactorMode string

type BackgroundVariant string

type SelectionMode string

type PanOnScrollMode string

type MetaControlSizeMode string

type SectionSizeMode string

type ProjectCodegenLanguage string

type SectionCodegenMode string

type SectionRepresentationMode string

type CodeObjValueRepresentationMode string

type SectionSizeValue struct{}

type SectionSize struct{}

type SectionSizingPolicyTypeEntry struct{}

type SectionSizingPolicyCallableTypeEntry struct{}

type MetaControlSizingPolicyTypeEntry struct{}

type MetaControlSizingPolicyByType struct{}

type SectionSizingPolicyGlobals struct{}

type SectionSizingPolicyByType struct{}

type SectionSizingPolicy struct{}

type SharePolicy struct{}

type SettingsShortcuts struct{}

type SettingsGUI struct{}

type SettingsBackend struct{}

type SettingsState struct{}

type SectionTypeCodegenPolicy struct{}

type SectionCodegenOverride struct{}

type SectionCodegenPolicy struct{}

type CodeObjTypeValuePolicy struct{}

type CodeObjValueOverride struct{}

type CodeObjValuePolicy struct{}

type ProjectCodegenPythonTarget struct{}

type ProjectCodegenPluginTarget struct{}

type ProjectCodegenTarget struct{}

type ProjectConfig struct{}

type ClipboardProjectStateCoreWithSectionVariantMap struct{}

type CreateTopLevelSectionRequestInput struct {
	FrontendOpID       *string         `json:"frontendOpId,omitempty"`
	ProjectConfigID    string          `json:"projectConfigId"`
	ImplType           string          `json:"implType"`
	ControlCodeObjType *string         `json:"controlCodeObjType,omitempty"`
	ImplOverrides      *map[string]any `json:"implOverrides,omitempty"`
	Position           *Position       `json:"position,omitempty"`
}

type CreateTopLevelSectionResponse struct {
	SectionID          string    `json:"sectionId"`
	MetaControlParamID *string   `json:"metaControlParamId,omitempty"`
	PanTo              *Position `json:"panTo,omitempty"`
}

type CreateViewModeRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
}

type CreateViewModeResponse string

type SetActiveViewModeRequestInput struct {
	FrontendOpID     *string `json:"frontendOpId,omitempty"`
	ProjectConfigID  string  `json:"projectConfigId"`
	ActiveViewModeID string  `json:"activeViewModeId"`
}

type ToggleIsEditingViewModeRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
}

type ToggleViewModeUserFacingRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
	ViewModeID      string  `json:"viewModeId"`
}

type ToggleViewModeTabRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
	ViewModeID      string  `json:"viewModeId"`
}

type SetViewModeNameRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
	ViewModeID      string  `json:"viewModeId"`
	Name            string  `json:"name"`
}

type SetViewModeSortOrderRequestInput struct {
	FrontendOpID       *string  `json:"frontendOpId,omitempty"`
	ProjectConfigID    string   `json:"projectConfigId"`
	OrderedViewModeIDs []string `json:"orderedViewModeIds"`
}

type DeleteViewModeRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
	ViewModeID      string  `json:"viewModeId"`
}

type SetSectionNameRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
	SectionID       string  `json:"sectionId"`
	Name            string  `json:"name"`
}

type GroupSectionsRequestInput struct {
	FrontendOpID    *string  `json:"frontendOpId,omitempty"`
	ProjectConfigID string   `json:"projectConfigId"`
	SectionIDs      []string `json:"sectionIds"`
}

type UngroupGroupsRequestInput struct {
	FrontendOpID    *string  `json:"frontendOpId,omitempty"`
	ProjectConfigID string   `json:"projectConfigId"`
	GroupIDs        []string `json:"groupIds"`
}

type SetSectionSizesRequestInput struct {
	FrontendOpID    *string                `json:"frontendOpId,omitempty"`
	ProjectConfigID string                 `json:"projectConfigId"`
	SectionSizes    map[string]SectionSize `json:"sectionSizes"`
}

type ToggleParamSelectedRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
	SectionID       string  `json:"sectionId"`
	ParamInfoID     string  `json:"paramInfoId"`
}

type UnselectAllParamsRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
}

type SectionType string

type ListRootViewMode string

type BrowserAreaViewMode string

type BrowserSearchScope string

type SpreadsheetGridDensity string

type ChartType string

type LineChartSettings struct{}

type ScatterChartSettings struct{}

type BaseChartSettingsUnion struct{}

type TextBlockDisplayMode string

type TextBlockFormat string

type CodeFileAccessMode string

type TaskBoardViewMode string

type TaskBoardTaskRecurrence string

type TaskBoardRecurringWeekday string

type TaskBoardRecurringMonth string

type AgenticEdgeKind string

type AgenticEdgeContextMode string

type EdgePort struct {
	ID       string `json:"id"`
	Accessor string `json:"accessor"`
}

type BrowserSavedSearchTypeFilters struct {
	Image bool `json:"image"`
	Video bool `json:"video"`
	Audio bool `json:"audio"`
	Text  bool `json:"text"`
	Data  bool `json:"data"`
}

type BrowserSavedSearch struct {
	ID          string                        `json:"id"`
	Name        string                        `json:"name"`
	Query       string                        `json:"query"`
	SearchScope BrowserSearchScope            `json:"searchScope"`
	TypeFilters BrowserSavedSearchTypeFilters `json:"typeFilters"`
	Color       string                        `json:"color"`
	QuickInfo   string                        `json:"quickInfo"`
}

type CodeFileBindingUpdate struct {
	CanonicalPath string             `json:"canonical_path"`
	AccessMode    CodeFileAccessMode `json:"access_mode"`
}

type TaskBoardColumn struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Color     string `json:"color"`
	SortIndex int    `json:"sortIndex"`
}

type TaskBoardTask struct {
	ID               string                      `json:"id"`
	Title            string                      `json:"title"`
	Description      string                      `json:"description"`
	Completed        bool                        `json:"completed"`
	ColumnID         *string                     `json:"columnId,omitempty"`
	DueDateISO       string                      `json:"dueDateIso"`
	Recurrence       TaskBoardTaskRecurrence     `json:"recurrence"`
	RecurrenceDays   []TaskBoardRecurringWeekday `json:"recurrenceDays"`
	RecurrenceMonths []TaskBoardRecurringMonth   `json:"recurrenceMonths"`
	RecurrenceYears  []int                       `json:"recurrenceYears"`
	SortIndex        int                         `json:"sortIndex"`
}

type Edge struct{}

type AgenticEdge struct{}

type Viewport struct{}

type TopLevelSectionLayout struct{}

type ViewMode struct{}

type ViewModeConfig struct{}

type WatchCodeFolder struct{}

type WatchCodeRegistryEntry struct{}

type CodeFileBinding struct{}

type ChatRole string

const (
	ChatRoleSystem    ChatRole = "system"
	ChatRoleUser      ChatRole = "user"
	ChatRoleAssistant ChatRole = "assistant"
	ChatRoleTool      ChatRole = "tool"
)

type ChatPermissionMode string

type ChatDictationMode string

type JSONValue struct{}

type ChatFileAttachment struct{}

type MessageTextContent struct{}

type MessageImageURL struct{}

type MessageImageURLContent struct{}

type MessageThinkingContent struct{}

type MessageContent struct{}

type ToolReferenceContent struct{}

type ToolCallFunction struct{}

type ToolCall struct{}

type SystemChatMessage struct{}

type AssistantChatMessage struct{}

type UserChatMessage struct{}

type ToolChatMessage struct{}

type BaseChatMessageUnion struct{}

type ChatSectionBranch struct{}

type ChatSectionState struct{}

type UserDefaultChatSectionImpl struct{}

type ChatSectionImpl struct{}

type UserDefaultBrowserSectionImpl struct{}

type BrowserSectionImpl struct{}

type BaseSectionImpl struct{}

type UserDefaultListRootSectionImpl struct{}

type ListRootSectionImpl struct{}

type UserDefaultTextBlockSectionImpl struct{}

type TextBlockSectionImpl struct{}

type CodeSectionDiagnosticsIgnoreState struct{}

type UserDefaultCodeSectionImpl struct{}

type CodeSectionImpl struct{}

type UserDefaultTerminalSectionImpl struct{}

type TerminalSectionImpl struct{}

type BaseSectionImplUnion struct{}

type CallableSectionImpl struct{}

type BaseParentSectionImplUnion struct{}

type BaseSectionWithParamsImplUnion struct{}

type DictSectionImpl struct{}

type UserDefaultCallableSectionImpl struct{}

type UserDefaultDictSectionImpl struct{}

type BaseDictSectionImplUnion struct{}

type BaseCodeObjImpl struct{}

type CodeParamCodeObjImpl struct{}

type CodeCallableCodeObjImpl struct{}

type NestedParamCodeObjImpl struct{}

type BaseCodeObjImplUnion struct{}

type BaseChildlessCodeObjImplUnion struct{}

type BaseParamCodeObjImplUnion struct{}

type BaseParentCodeObjImplUnion struct{}

type UserDefaultCodeParamCodeObjImpl struct{}

type ColorPickerChoice struct{}

type TextParamCodeObjImpl struct{}

type DateParamCodeObjImpl struct{}

type TimeParamCodeObjImpl struct{}

type ButtonParamCodeObjImpl struct{}

type SliderParamCodeObjImpl struct{}

type RotaryParamCodeObjImpl struct{}

type SwitchParamCodeObjImpl struct{}

type ColorPickerParamCodeObjImpl struct{}

type DropdownParamCodeObjImpl struct{}

type PasswordParamCodeObjImpl struct{}

type TextAreaParamCodeObjImpl struct{}

type DropzoneParamCodeObjImpl struct{}

type UserDefaultTaskBoardSectionImpl struct{}

type TaskBoardSectionImpl struct{}

type UserDefaultChartSectionImpl struct{}

type ChartSectionImpl struct{}

type UserDefaultSpreadsheetSectionImpl struct{}

type SpreadsheetSectionImpl struct{}

type SetSectionParamFilterRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
	SectionID       string  `json:"sectionId"`
	Value           string  `json:"value"`
}

type SetMetaControlShowSectionTitleRequestInput struct {
	FrontendOpID     *string `json:"frontendOpId,omitempty"`
	ProjectConfigID  string  `json:"projectConfigId"`
	SectionID        string  `json:"sectionId"`
	ShowSectionTitle bool    `json:"showSectionTitle"`
}

type SetSectionColumnWidthRequestInput struct {
	FrontendOpID    *string  `json:"frontendOpId,omitempty"`
	ProjectConfigID string   `json:"projectConfigId"`
	SectionID       string   `json:"sectionId"`
	ColumnWidth     *float64 `json:"columnWidth"`
}

type SetSectionEdgeInputsRequestInput struct {
	FrontendOpID    *string  `json:"frontendOpId,omitempty"`
	ProjectConfigID string   `json:"projectConfigId"`
	SectionID       string   `json:"sectionId"`
	EdgeInputParams []string `json:"edgeInputParams"`
}

type SetSectionEdgeOutputsRequestInput struct {
	FrontendOpID    *string    `json:"frontendOpId,omitempty"`
	ProjectConfigID string     `json:"projectConfigId"`
	SectionID       string     `json:"sectionId"`
	EdgeOutputPorts []EdgePort `json:"edgeOutputPorts"`
}

type SetParentDefaultChildSectionTypeRequestInput struct {
	FrontendOpID            *string     `json:"frontendOpId,omitempty"`
	ProjectConfigID         string      `json:"projectConfigId"`
	SectionID               string      `json:"sectionId"`
	DefaultChildSectionType SectionType `json:"defaultChildSectionType"`
}

type SetListRootViewModeRequestInput struct {
	FrontendOpID    *string          `json:"frontendOpId,omitempty"`
	ProjectConfigID string           `json:"projectConfigId"`
	SectionID       string           `json:"sectionId"`
	ViewMode        ListRootViewMode `json:"viewMode"`
}

type ToggleGroupOrientationRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
	SectionID       string  `json:"sectionId"`
}

type SetGroupOverflowModeRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
	SectionID       string  `json:"sectionId"`
	OverflowMode    bool    `json:"overflowMode"`
}

type SetBrowserColumnWidthsRequestInput struct {
	FrontendOpID     *string  `json:"frontendOpId,omitempty"`
	ProjectConfigID  string   `json:"projectConfigId"`
	SectionID        string   `json:"sectionId"`
	ColumnWidth      *float64 `json:"columnWidth"`
	TypesColumnWidth *float64 `json:"typesColumnWidth"`
}

type SetBrowserAreaViewModeRequestInput struct {
	FrontendOpID    *string             `json:"frontendOpId,omitempty"`
	ProjectConfigID string              `json:"projectConfigId"`
	SectionID       string              `json:"sectionId"`
	ViewMode        BrowserAreaViewMode `json:"viewMode"`
}

type SetBrowserHideColumnRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
	SectionID       string  `json:"sectionId"`
	HideColumn      bool    `json:"hideColumn"`
}

type SetBrowserSavedSearchesRequestInput struct {
	FrontendOpID    *string              `json:"frontendOpId,omitempty"`
	ProjectConfigID string               `json:"projectConfigId"`
	SectionID       string               `json:"sectionId"`
	SavedSearches   []BrowserSavedSearch `json:"savedSearches"`
}

type SetSpreadsheetFilePathRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
	SectionID       string  `json:"sectionId"`
	FilePath        string  `json:"filePath"`
	ActiveSheet     *string `json:"activeSheet"`
}

type SetSpreadsheetSectionSettingsRequestInput struct {
	FrontendOpID               *string                `json:"frontendOpId,omitempty"`
	ProjectConfigID            string                 `json:"projectConfigId"`
	SectionID                  string                 `json:"sectionId"`
	ReadOnly                   bool                   `json:"readOnly"`
	ShowRowNumbers             bool                   `json:"showRowNumbers"`
	Density                    SpreadsheetGridDensity `json:"density"`
	AutoReloadOnExternalChange bool                   `json:"autoReloadOnExternalChange"`
}

type SetTaskBoardSectionStateRequestInput struct {
	FrontendOpID    *string           `json:"frontendOpId,omitempty"`
	ProjectConfigID string            `json:"projectConfigId"`
	SectionID       string            `json:"sectionId"`
	ViewMode        TaskBoardViewMode `json:"viewMode"`
	Columns         []TaskBoardColumn `json:"columns"`
	Tasks           []TaskBoardTask   `json:"tasks"`
}

type SetImageAreaImagePathRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
	SectionID       string  `json:"sectionId"`
	ImagePath       string  `json:"imagePath"`
}

type SetSocialURLRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
	SectionID       string  `json:"sectionId"`
	URL             string  `json:"url"`
}

type AppendDrawAreaLayerItemRequestInput struct {
	FrontendOpID    *string           `json:"frontendOpId,omitempty"`
	ProjectConfigID string            `json:"projectConfigId"`
	SectionID       string            `json:"sectionId"`
	LayerIdx        int               `json:"layerIdx"`
	Element         DrawAreaLayerItem `json:"element"`
}

type SetChartAreaDataPathRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
	SectionID       string  `json:"sectionId"`
	DataPath        string  `json:"dataPath"`
}

type SetChartTypeRequestInput struct {
	FrontendOpID    *string   `json:"frontendOpId,omitempty"`
	ProjectConfigID string    `json:"projectConfigId"`
	SectionID       string    `json:"sectionId"`
	ChartType       ChartType `json:"chartType"`
}

type SetChartSettingsRequestInput struct {
	FrontendOpID    *string                `json:"frontendOpId,omitempty"`
	ProjectConfigID string                 `json:"projectConfigId"`
	SectionID       string                 `json:"sectionId"`
	ChartSettings   BaseChartSettingsUnion `json:"chartSettings"`
	ChangedSettings []string               `json:"changedSettings"`
}

type SetTextBlockTextRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
	SectionID       string  `json:"sectionId"`
	Text            string  `json:"text"`
}

type SetTextBlockDisplayModeRequestInput struct {
	FrontendOpID    *string              `json:"frontendOpId,omitempty"`
	ProjectConfigID string               `json:"projectConfigId"`
	SectionID       string               `json:"sectionId"`
	TextDisplayMode TextBlockDisplayMode `json:"textDisplayMode"`
}

type SetTextBlockFormatRequestInput struct {
	FrontendOpID    *string         `json:"frontendOpId,omitempty"`
	ProjectConfigID string          `json:"projectConfigId"`
	SectionID       string          `json:"sectionId"`
	Format          TextBlockFormat `json:"format"`
}

type SetTextBlockHeadingAsSectionNameRequestInput struct {
	FrontendOpID         *string `json:"frontendOpId,omitempty"`
	ProjectConfigID      string  `json:"projectConfigId"`
	SectionID            string  `json:"sectionId"`
	HeadingAsSectionName bool    `json:"headingAsSectionName"`
}

type SetTextBlockMetaControlStyleRequestInput struct {
	FrontendOpID     *string `json:"frontendOpId,omitempty"`
	ProjectConfigID  string  `json:"projectConfigId"`
	SectionID        string  `json:"sectionId"`
	MetaControlStyle bool    `json:"metaControlStyle"`
}

type SetTextBlockMasterFontSizeRequestInput struct {
	FrontendOpID     *string `json:"frontendOpId,omitempty"`
	ProjectConfigID  string  `json:"projectConfigId"`
	SectionID        string  `json:"sectionId"`
	MasterFontSizePx float64 `json:"masterFontSizePx"`
}

type SetCodeFileBindingRequestInput struct {
	FrontendOpID    *string               `json:"frontendOpId,omitempty"`
	ProjectConfigID string                `json:"projectConfigId"`
	SectionID       string                `json:"sectionId"`
	Binding         CodeFileBindingUpdate `json:"binding"`
}

type ViewportInput struct {
	X    float64 `json:"x"`
	Y    float64 `json:"y"`
	Zoom float64 `json:"zoom"`
}

type TopLevelSectionLayoutInput struct {
	X      float64  `json:"x"`
	Y      float64  `json:"y"`
	ZIndex int      `json:"zIndex,omitempty"`
	W      *float64 `json:"w,omitempty"`
	H      *float64 `json:"h,omitempty"`
}

type SetTopLevelSectionLayoutRequestInput struct {
	FrontendOpID     *string                               `json:"frontendOpId,omitempty"`
	ProjectConfigID  string                                `json:"projectConfigId"`
	TopLevelSections map[string]TopLevelSectionLayoutInput `json:"topLevelSections"`
}

type SetViewportRequestInput struct {
	FrontendOpID    *string        `json:"frontendOpId,omitempty"`
	ProjectConfigID string         `json:"projectConfigId"`
	Viewport        *ViewportInput `json:"viewport"`
}

type SetActiveIDsRequestInput struct {
	FrontendOpID    *string  `json:"frontendOpId,omitempty"`
	ProjectConfigID string   `json:"projectConfigId"`
	ActiveIDs       []string `json:"activeIds"`
}

const projectStateFrontendSupportRawTS = `
export const SectionTypeEnum = {
  Callable: "Callable",
  Dict: "Dict",
  ListRoot: "ListRoot",
  Group: "Group",
  Image: "Image",
  Chart: "Chart",
  Draw: "Draw",
  TextBlock: "TextBlock",
  Prompt: "Prompt",
  MetaControl: "MetaControl",
  Social: "Social",
  GlobalVariables: "GlobalVariables",
  Code: "Code",
  GenPythonCode: "GenPythonCode",
  GenPythonMetadata: "GenPythonMetadata",
  Terminal: "Terminal",
  IFrame: "IFrame",
  Chat: "Chat",
  Browser: "Browser",
  Plugin: "Plugin",
  TaskBoard: "TaskBoard",
  Spreadsheet: "Spreadsheet",
} as const;
export type SectionType = ObjectValues<typeof SectionTypeEnum>;

export const CodeObjTypeEnum = {
  CodeCallable: "CodeCallable",
  CodeParam: "CodeParam",
  TextParam: "TextParam",
  DateParam: "DateParam",
  TimeParam: "TimeParam",
  ButtonParam: "ButtonParam",
  SliderParam: "SliderParam",
  RotaryParam: "RotaryParam",
  SwitchParam: "SwitchParam",
  ColorPickerParam: "ColorPickerParam",
  DropdownParam: "DropdownParam",
  PasswordParam: "PasswordParam",
  TextAreaParam: "TextAreaParam",
  DropzoneParam: "DropzoneParam",
  NestedParam: "NestedParam",
} as const;
export type CodeObjType = ObjectValues<typeof CodeObjTypeEnum>;

export const CodeLanguageEnum = {
  python: "python",
  bash: "bash",
  javascript: "javascript",
  typescript: "typescript",
  json: "json",
  yaml: "yaml",
  toml: "toml",
  markdown: "markdown",
  plaintext: "plaintext",
} as const;
export type BuiltinCodeLanguage = ObjectValues<typeof CodeLanguageEnum>;

export const ConfigLanguageEnum = {
  python: "python",
  json: "json",
} as const;
export type ConfigLanguage = ObjectValues<typeof ConfigLanguageEnum>;

export const ParameterPassingStyleEnum = {
  DEFAULT: "DEFAULT",
  ARGS: "ARGS",
  KWARGS: "KWARGS",
  POSITIONAL_ONLY: "POSITIONAL_ONLY",
  KEYWORD_ONLY: "KEYWORD_ONLY",
} as const;
export type ParameterPassingStyle = ObjectValues<
  typeof ParameterPassingStyleEnum
>;

export const ParamNameTypeEnum = {
  CODE: "CODE",
  TEXT: "TEXT",
} as const;
export type ParamNameType = ObjectValues<typeof ParamNameTypeEnum>;

export const ButtonActionModeEnum = {
  WEBSOCKET_LISTENER: "WEBSOCKET_LISTENER",
  HTTP_REQUEST: "HTTP_REQUEST",
  SETTA_API: "SETTA_API",
} as const;
export type ButtonActionMode = ObjectValues<typeof ButtonActionModeEnum>;

export const HttpRequestMethodEnum = {
  GET: "GET",
  POST: "POST",
  PUT: "PUT",
  PATCH: "PATCH",
  DELETE: "DELETE",
  HEAD: "HEAD",
  OPTIONS: "OPTIONS",
} as const;
export type HttpRequestMethod = ObjectValues<typeof HttpRequestMethodEnum>;

export const DropzoneModeEnum = {
  STATEFUL: "STATEFUL",
  STATELESS: "STATELESS",
} as const;
export type DropzoneMode = ObjectValues<typeof DropzoneModeEnum>;

export const TextParamInputUITypeEnum = {
  plain: "plain",
  time: "time",
  date: "date",
} as const;
export type TextParamInputUIType = ObjectValues<
  typeof TextParamInputUITypeEnum
>;

export const TimeDisplayFormatEnum = {
  twenty_four_hour: "twenty_four_hour",
  twelve_hour: "twelve_hour",
} as const;
export type TimeDisplayFormat = ObjectValues<typeof TimeDisplayFormatEnum>;

export const TimeControlModeEnum = {
  input: "input",
  display: "display",
} as const;
export type TimeControlMode = ObjectValues<typeof TimeControlModeEnum>;

export const TimeDisplayFontEnum = {
  clock: "clock",
  monospace: "monospace",
  system: "system",
} as const;
export type TimeDisplayFont = ObjectValues<typeof TimeDisplayFontEnum>;

export const DateDisplayFormatEnum = {
  iso: "iso",
  us: "us",
  eu: "eu",
  long: "long",
} as const;
export type DateDisplayFormat = ObjectValues<typeof DateDisplayFormatEnum>;

export const DateControlModeEnum = {
  input: "input",
  calendar: "calendar",
} as const;
export type DateControlMode = ObjectValues<typeof DateControlModeEnum>;

export const DateSelectionModeEnum = {
  single: "single",
  multiple: "multiple",
} as const;
export type DateSelectionMode = ObjectValues<typeof DateSelectionModeEnum>;

export const DateCalendarWeekStartEnum = {
  sunday: "sunday",
  monday: "monday",
} as const;
export type DateCalendarWeekStart = ObjectValues<
  typeof DateCalendarWeekStartEnum
>;

type GeneratedMutableValue =
  | null
  | boolean
  | number
  | string
  | Array<GeneratedMutableValue>
  | { [key: string]: GeneratedMutableValue | undefined };

function cloneGeneratedValue<T>(value: T): T {
  if (value === null || value === undefined || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => cloneGeneratedValue(entry)) as T;
  }
  const cloned: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(
    value as Record<string, GeneratedMutableValue | undefined>,
  )) {
    cloned[key] = cloneGeneratedValue(entry);
  }
  return cloned as T;
}

function mergeGeneratedOptions<T extends object>(
  defaults: T,
  options: Partial<T> = {},
): T {
  return {
    ...cloneGeneratedValue(defaults),
    ...cloneGeneratedValue(options),
  } as T;
}

export type EdgePort = {
  id: string;
  accessor: string;
};

export type TypeErrorIgnoreState = {
  callable: boolean;
  params: Record<string, boolean>;
};

export const ClipboardDataTypeEnum = {
  Sections: "Sections",
} as const;
export type ClipboardDataType = ObjectValues<typeof ClipboardDataTypeEnum>;

export type ClipboardProjectStateCore = {
  sections: Record<string, Core>;
  sectionImpls: Record<string, BaseSectionImplUnion>;
  sectionVariants: Record<string, Variant>;
  codeObjs: Record<string, Core>;
  codeObjImpls: Record<string, BaseCodeObjImplUnion>;
  codeObjVariants: Record<string, Variant>;
};

export type ClipboardProjectStateCoreWithSectionVariantMap = {
  core: ClipboardProjectStateCore;
  sectionVariantMap: Record<string, string>;
};

export type SectionsClipboardData = {
  type: typeof ClipboardDataTypeEnum.Sections;
  data: ClipboardProjectStateCoreWithSectionVariantMap;
};

export type BaseClipboardDataUnionWithDiscriminator = SectionsClipboardData;

export type Core = {
  id: string;
  name: string;
  displayName: string;
  variants: Array<string>;
  defaultVariant: string | null;
  sharedModifier: Record<string, unknown>;
  unsharedKeys: Array<string>;
};
export function createCore(options: Partial<Core> = {}): Core {
  return mergeGeneratedOptions(
    {
      id: "",
      name: "",
      displayName: "",
      variants: [],
      defaultVariant: null,
      sharedModifier: {},
      unsharedKeys: [],
    },
    options,
  );
}

export type Variant = {
  id: string;
  name: string;
  impl: string;
  nonPresetImpls: Array<string>;
  modifier: Record<string, unknown>;
  isFrozen: boolean;
};
export function createVariant(options: Partial<Variant> = {}): Variant {
  return mergeGeneratedOptions(
    {
      id: "",
      name: "",
      impl: "",
      nonPresetImpls: [],
      modifier: {},
      isFrozen: false,
    },
    options,
  );
}

export type SingletonSections = {
  GlobalVariables: string | null;
  GenPythonCode: string | null;
  GenPythonMetadata: string | null;
};
export function createSingletonSections(
  options: Partial<SingletonSections> = {},
): SingletonSections {
  return mergeGeneratedOptions(
    {
      GlobalVariables: null,
      GenPythonCode: null,
      GenPythonMetadata: null,
    },
    options,
  );
}

export type ShownParamIdDetails = {
  requiredParamIdsToPaths: Record<string, Array<string>>;
  topLevelParamIds: Array<string>;
};

export type ShownParamIds = {
  pinned: ShownParamIdDetails;
  unpinned: ShownParamIdDetails;
};

export type ProjectStateSingleConfig = {
  projectConfig: ProjectConfig;
  sections: Record<string, Core>;
  sectionImpls: Record<string, BaseSectionImplUnion>;
  sectionVariants: Record<string, Variant>;
  codeObjs: Record<string, Core>;
  codeObjImpls: Record<string, BaseCodeObjImplUnion>;
  codeObjVariants: Record<string, Variant>;
  artifactGroups?: Record<string, unknown>;
  singletonSections: SingletonSections;
  parentSectionMap: Record<string, string | null>;
  shownParamIds: Record<string, ShownParamIds>;
  requiredDecodedImages: Array<string>;
  genCodeBinding?: CodeFileBinding | null;
};

export type ProjectStateSingleConfigWithCompletedOpIds = {
  projectState: ProjectStateSingleConfig;
  completedOpIds: Array<string>;
  pendingOpIds: Array<string>;
};

type GeneratedFactoryResolution<TDefaults extends object, TImpl extends object> =
  {
    defaults: TDefaults;
    overrides: Partial<TImpl>;
  };

function isGeneratedImplOverrideCandidate(
  value: unknown,
): value is { id?: unknown; type?: unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    ("id" in value || "type" in value)
  );
}

function resolveGeneratedFactoryInputs<
  TDefaults extends object,
  TImpl extends object,
>(
  baseDefaults: TDefaults,
  defaultsOrOverrides?: Partial<TDefaults> | Partial<TImpl>,
  overrides?: Partial<TImpl>,
): GeneratedFactoryResolution<TDefaults, TImpl> {
  if (overrides !== undefined) {
    return {
      defaults: mergeGeneratedOptions(
        baseDefaults,
        (defaultsOrOverrides ?? {}) as Partial<TDefaults>,
      ),
      overrides,
    };
  }
  if (isGeneratedImplOverrideCandidate(defaultsOrOverrides)) {
    return {
      defaults: cloneGeneratedValue(baseDefaults),
      overrides: defaultsOrOverrides as Partial<TImpl>,
    };
  }
  return {
    defaults: mergeGeneratedOptions(
      baseDefaults,
      (defaultsOrOverrides ?? {}) as Partial<TDefaults>,
    ),
    overrides: {},
  };
}

export type ChartData = ChartDataValue;

export type ChartDataType = ChartDataValue;

function createGeneratedBaseSectionDefaults(): {
  isFrozen: boolean;
  tagColor: string | null;
  styleColor: string | null;
  size: SectionSize;
  aspectRatio: boolean | number;
  isMinimized: boolean;
  positionAndSizeLocked: boolean;
} {
  return {
    isFrozen: false,
    tagColor: null,
    styleColor: null,
    size: {
      width: 250,
      height: 150,
    },
    aspectRatio: false,
    isMinimized: false,
    positionAndSizeLocked: false,
  };
}

function createGeneratedBaseSectionWithParamsDefaults(): {
  isFrozen: boolean;
  tagColor: string | null;
  styleColor: string | null;
  size: SectionSize;
  aspectRatio: boolean | number;
  isMinimized: boolean;
  positionAndSizeLocked: boolean;
  hideUnpinnedParams: boolean;
  paramFilter: string;
  columnWidth: number | null;
  configLanguage: ConfigLanguage;
  edgeInputParams: Array<string>;
  edgeOutputPorts: Array<EdgePort>;
} {
  return {
    ...createGeneratedBaseSectionDefaults(),
    hideUnpinnedParams: false,
    paramFilter: "",
    columnWidth: null,
    configLanguage: ConfigLanguageEnum.python,
    edgeInputParams: [],
    edgeOutputPorts: [],
  };
}

function createGeneratedBaseCodeSectionDefaults(): {
  isFrozen: boolean;
  tagColor: string | null;
  styleColor: string | null;
  size: SectionSize;
  aspectRatio: boolean | number;
  isMinimized: boolean;
  positionAndSizeLocked: boolean;
  code: string;
  codeFileBinding: CodeFileBinding | null;
  attachedTerminalSectionId: string | null;
} {
  return {
    ...createGeneratedBaseSectionDefaults(),
    code: "",
    size: {
      width: 500,
      height: 150,
    },
    codeFileBinding: null,
    attachedTerminalSectionId: null,
  };
}

export const BaseChildlessCodeObjImplTypeSet = new Set<CodeObjType>([
  CodeObjTypeEnum.CodeParam,
  CodeObjTypeEnum.ColorPickerParam,
  CodeObjTypeEnum.DateParam,
  CodeObjTypeEnum.DropdownParam,
  CodeObjTypeEnum.DropzoneParam,
  CodeObjTypeEnum.PasswordParam,
  CodeObjTypeEnum.RotaryParam,
  CodeObjTypeEnum.SliderParam,
  CodeObjTypeEnum.SwitchParam,
  CodeObjTypeEnum.TextAreaParam,
  CodeObjTypeEnum.TextParam,
  CodeObjTypeEnum.TimeParam,
]);

export const BaseParamCodeObjImplTypeSet = new Set<CodeObjType>([
  CodeObjTypeEnum.ButtonParam,
  CodeObjTypeEnum.CodeParam,
  CodeObjTypeEnum.ColorPickerParam,
  CodeObjTypeEnum.DateParam,
  CodeObjTypeEnum.DropdownParam,
  CodeObjTypeEnum.DropzoneParam,
  CodeObjTypeEnum.NestedParam,
  CodeObjTypeEnum.PasswordParam,
  CodeObjTypeEnum.RotaryParam,
  CodeObjTypeEnum.SliderParam,
  CodeObjTypeEnum.SwitchParam,
  CodeObjTypeEnum.TextAreaParam,
  CodeObjTypeEnum.TextParam,
  CodeObjTypeEnum.TimeParam,
]);

const BaseParentCodeObjImplTypeSet = new Set<CodeObjType>([
  CodeObjTypeEnum.CodeCallable,
  CodeObjTypeEnum.NestedParam,
]);

export const ControlCodeObjTypeSet = new Set<CodeObjType>([
  CodeObjTypeEnum.CodeParam,
  CodeObjTypeEnum.TextParam,
  CodeObjTypeEnum.DateParam,
  CodeObjTypeEnum.TimeParam,
  CodeObjTypeEnum.TextAreaParam,
  CodeObjTypeEnum.ButtonParam,
  CodeObjTypeEnum.SliderParam,
  CodeObjTypeEnum.RotaryParam,
  CodeObjTypeEnum.SwitchParam,
  CodeObjTypeEnum.ColorPickerParam,
  CodeObjTypeEnum.DropdownParam,
  CodeObjTypeEnum.PasswordParam,
  CodeObjTypeEnum.DropzoneParam,
]);

export const SectionParamCodeObjTypeSet = new Set<CodeObjType>([
  CodeObjTypeEnum.CodeParam,
  CodeObjTypeEnum.TextParam,
  CodeObjTypeEnum.DateParam,
  CodeObjTypeEnum.TimeParam,
  CodeObjTypeEnum.TextAreaParam,
  CodeObjTypeEnum.SliderParam,
  CodeObjTypeEnum.RotaryParam,
  CodeObjTypeEnum.SwitchParam,
  CodeObjTypeEnum.ColorPickerParam,
  CodeObjTypeEnum.DropdownParam,
  CodeObjTypeEnum.PasswordParam,
  CodeObjTypeEnum.DropzoneParam,
  CodeObjTypeEnum.NestedParam,
]);

const BaseParentSectionImplTypeSet = new Set<SectionType>([
  SectionTypeEnum.Code,
  SectionTypeEnum.GenPythonCode,
  SectionTypeEnum.GenPythonMetadata,
  SectionTypeEnum.Group,
  SectionTypeEnum.ListRoot,
]);

const BaseDictSectionImplTypeSet = new Set<SectionType>([
  SectionTypeEnum.Dict,
  SectionTypeEnum.GlobalVariables,
]);

const BaseSectionWithParamsImplTypeSet = new Set<SectionType>([
  SectionTypeEnum.Callable,
  SectionTypeEnum.Dict,
  SectionTypeEnum.GlobalVariables,
]);

export function isBaseChildlessCodeObjImpl(
  x: BaseCodeObjImplUnion,
): x is BaseChildlessCodeObjImplUnion {
  return BaseChildlessCodeObjImplTypeSet.has(x.type);
}

export function isBaseParamCodeObjImpl(
  x: BaseCodeObjImplUnion,
): x is BaseParamCodeObjImplUnion {
  return BaseParamCodeObjImplTypeSet.has(x.type);
}

export function isBaseParentCodeObjImpl(
  x: BaseCodeObjImplUnion,
): x is BaseParentCodeObjImplUnion {
  return BaseParentCodeObjImplTypeSet.has(x.type);
}

export function isBaseParentSectionImpl(
  x: BaseSectionImplUnion,
): x is BaseParentSectionImplUnion {
  return BaseParentSectionImplTypeSet.has(x.type);
}

export function isBaseDictSectionImpl(
  x: BaseSectionImplUnion,
): x is BaseDictSectionImplUnion {
  return BaseDictSectionImplTypeSet.has(x.type);
}

export function isBaseSectionWithParamsImpl(
  x: BaseSectionImplUnion,
): x is BaseSectionWithParamsImplUnion {
  return BaseSectionWithParamsImplTypeSet.has(x.type);
}

type ImplArgsBundleWithUpdaters<T> = {
  [K in keyof T]?: T[K] | ((prev: T[K]) => T[K]);
};

export type ImplArgsBundleMap = {
  BaseSection: {
    impl: BaseSectionImplUnion;
    args: ImplArgsBundleWithUpdaters<BaseSectionImplUnion>;
  };
  BaseSectionWithParams: {
    impl: BaseSectionWithParamsImplUnion;
    args: ImplArgsBundleWithUpdaters<BaseSectionWithParamsImplUnion>;
  };
  BaseParentSection: {
    impl: BaseParentSectionImplUnion;
    args: ImplArgsBundleWithUpdaters<BaseParentSectionImplUnion>;
  };
  BaseCodeSection: {
    impl: BaseParentSectionImplUnion;
    args: ImplArgsBundleWithUpdaters<BaseParentSectionImplUnion>;
  };
  ChatSection: {
    impl: BaseSectionImplUnion;
    args: ImplArgsBundleWithUpdaters<BaseSectionImplUnion>;
  };
  CodeSection: {
    impl: BaseParentSectionImplUnion;
    args: ImplArgsBundleWithUpdaters<BaseParentSectionImplUnion>;
  };
  GroupSection: {
    impl: BaseParentSectionImplUnion;
    args: ImplArgsBundleWithUpdaters<BaseParentSectionImplUnion>;
  };
  ListRootSection: {
    impl: BaseParentSectionImplUnion;
    args: ImplArgsBundleWithUpdaters<BaseParentSectionImplUnion>;
  };
  BrowserSection: {
    impl: BrowserSectionImpl;
    args: ImplArgsBundleWithUpdaters<BrowserSectionImpl>;
  };
  TextBlockSection: {
    impl: BaseSectionImplUnion;
    args: ImplArgsBundleWithUpdaters<BaseSectionImplUnion>;
  };
  BaseDictSection: {
    impl: BaseDictSectionImplUnion;
    args: ImplArgsBundleWithUpdaters<BaseDictSectionImplUnion>;
  };
  BaseChildlessCodeObj: {
    impl: BaseChildlessCodeObjImplUnion;
    args: ImplArgsBundleWithUpdaters<BaseChildlessCodeObjImplUnion>;
  };
  BaseCodeObj: {
    impl: BaseCodeObjImplUnion;
    args: ImplArgsBundleWithUpdaters<BaseCodeObjImplUnion>;
  };
};
`
