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

type CreateChildSectionsRequestInput struct{}

type CreateChildSectionsViaIncrementerRequestInput struct{}

type CreateChildSectionsResponse struct {
	SectionIDs []string `json:"sectionIds"`
}

type DeleteChildSectionsViaDecrementerRequestInput struct{}

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

type PrepareSectionsForCopyRequestInput struct{}

type PasteSectionsRequestInput struct{}

type SectionsClipboardDataResponse struct{}

type CreateEdgeRequestInput struct{}

type UpdateEdgeRequestInput struct{}

type DeleteEdgesRequestInput struct{}

type ReconnectEdgeRequestInput struct{}

type SetEdgesRequestInput struct{}

type CreateAgenticEdgeRequestInput struct{}

type UpdateAgenticEdgeRequestInput struct{}

type DeleteAgenticEdgesRequestInput struct{}

type SetAgenticEdgesRequestInput struct{}

type MoveSectionsRequestInput struct{}

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

type SetSectionSizesRequestInput struct{}

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

type SetSpreadsheetSectionSettingsRequestInput struct{}

type SetTaskBoardSectionStateRequestInput struct{}

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

type AppendDrawAreaLayerItemRequestInput struct{}

type SetChartAreaDataPathRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
	SectionID       string  `json:"sectionId"`
	DataPath        string  `json:"dataPath"`
}

type SetChartTypeRequestInput struct{}

type SetChartSettingsRequestInput struct{}

type SetTextBlockTextRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
	SectionID       string  `json:"sectionId"`
	Text            string  `json:"text"`
}

type SetTextBlockDisplayModeRequestInput struct{}

type SetTextBlockFormatRequestInput struct{}

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

type SetCodeFileBindingRequestInput struct{}

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

const createChildSectionsRequestInputRawTS = `
export type CreateChildSectionsRequestInput = {
  frontendOpId?: string | null;
  projectConfigId: string;
  parentId: string;
  implType: SectionType;
  numChildren: number;
  startIdx?: number | null;
};
`

const createChildSectionsViaIncrementerRequestInputRawTS = `
export type CreateChildSectionsViaIncrementerRequestInput = {
  frontendOpId?: string | null;
  projectConfigId: string;
  calledBy: string;
  implType: SectionType;
  numChildren: number;
};
`

const deleteChildSectionsViaDecrementerRequestInputRawTS = `
export type DeleteChildSectionsViaDecrementerRequestInput = {
  frontendOpId?: string | null;
  projectConfigId: string;
  calledBy: string;
  numChildren: number;
};
`

const prepareSectionsForCopyRequestInputRawTS = `
export type PrepareSectionsForCopyRequestInput = {
  projectConfigId: string;
  sectionIds: Array<string>;
};
`

const pasteSectionsRequestInputRawTS = `
export type PasteSectionsRequestInput = {
  projectConfigId: string;
  data: ClipboardProjectStateCoreWithSectionVariantMap;
  position: Position;
  asRef: boolean;
};
`

const createEdgeRequestInputRawTS = `
export type CreateEdgeRequestInput = {
  frontendOpId?: string | null;
  projectConfigId: string;
  sourceSectionId: string;
  sourceVariantId: string;
  sourcePortId: string;
  targetSectionId: string;
  targetVariantId: string;
  targetPortId: string;
  type?: string;
  label?: string | null;
  style?: Record<string, unknown> | null;
  animated?: boolean;
  hidden?: boolean;
  zIndex?: number;
  data?: Record<string, unknown> | null;
};
`

const updateEdgeRequestInputRawTS = `
export type UpdateEdgeRequestInput = {
  frontendOpId?: string | null;
  projectConfigId: string;
  edge: Edge;
};
`

const deleteEdgesRequestInputRawTS = `
export type DeleteEdgesRequestInput = {
  frontendOpId?: string | null;
  projectConfigId: string;
  edgeIds: Array<string>;
};
`

const reconnectEdgeRequestInputRawTS = `
export type ReconnectEdgeRequestInput = {
  frontendOpId?: string | null;
  projectConfigId: string;
  edgeId: string;
  sourceSectionId: string;
  sourceVariantId: string;
  sourcePortId: string;
  targetSectionId: string;
  targetVariantId: string;
  targetPortId: string;
};
`

const setEdgesRequestInputRawTS = `
export type SetEdgesRequestInput = {
  frontendOpId?: string | null;
  projectConfigId: string;
  edges: Array<Edge>;
};
`

const createAgenticEdgeRequestInputRawTS = `
export type CreateAgenticEdgeRequestInput = {
  frontendOpId?: string | null;
  projectConfigId: string;
  id?: string | null;
  sourceSectionId: string;
  targetSectionId: string;
  kind: AgenticEdgeKind;
  contextMode?: AgenticEdgeContextMode | null;
  style?: Record<string, unknown> | null;
  hidden?: boolean;
  zIndex?: number;
};
`

const updateAgenticEdgeRequestInputRawTS = `
export type UpdateAgenticEdgeRequestInput = {
  frontendOpId?: string | null;
  projectConfigId: string;
  edge: AgenticEdge;
};
`

const deleteAgenticEdgesRequestInputRawTS = `
export type DeleteAgenticEdgesRequestInput = {
  frontendOpId?: string | null;
  projectConfigId: string;
  edgeIds: Array<string>;
};
`

const setAgenticEdgesRequestInputRawTS = `
export type SetAgenticEdgesRequestInput = {
  frontendOpId?: string | null;
  projectConfigId: string;
  edges: Array<AgenticEdge>;
};
`

const moveSectionsRequestInputRawTS = `
export type MoveSectionsRequestInput = {
  frontendOpId?: string | null;
  projectConfigId: string;
  sectionIds: Array<string>;
  newParentId: string | null;
  newIndex: number | null;
  positionsById: Record<string, Position> | null;
};
`

const setSectionSizesRequestInputRawTS = `
export type SetSectionSizesRequestInput = {
  frontendOpId?: string | null;
  projectConfigId: string;
  sectionSizes: Record<string, SectionSize>;
};
`

const setSpreadsheetSectionSettingsRequestInputRawTS = `
export type SetSpreadsheetSectionSettingsRequestInput = {
  frontendOpId?: string | null;
  projectConfigId: string;
  sectionId: string;
  readOnly: boolean;
  showRowNumbers: boolean;
  density: SpreadsheetGridDensity;
  autoReloadOnExternalChange: boolean;
};
`

const setTaskBoardSectionStateRequestInputRawTS = `
export type SetTaskBoardSectionStateRequestInput = {
  frontendOpId?: string | null;
  projectConfigId: string;
  sectionId: string;
  viewMode: TaskBoardViewMode;
  columns: Array<TaskBoardColumn>;
  tasks: Array<TaskBoardTask>;
};
`

const appendDrawAreaLayerItemRequestInputRawTS = `
export type AppendDrawAreaLayerItemRequestInput = {
  frontendOpId?: string | null;
  projectConfigId: string;
  sectionId: string;
  layerIdx: number;
  element: DrawAreaLayerItem;
};
`

const setChartTypeRequestInputRawTS = `
export type SetChartTypeRequestInput = {
  frontendOpId?: string | null;
  projectConfigId: string;
  sectionId: string;
  chartType: ChartType;
};
`

const setChartSettingsRequestInputRawTS = `
export type SetChartSettingsRequestInput = {
  frontendOpId?: string | null;
  projectConfigId: string;
  sectionId: string;
  chartSettings: BaseChartSettingsUnion;
  changedSettings: Array<string>;
};
`

const setTextBlockDisplayModeRequestInputRawTS = `
export type SetTextBlockDisplayModeRequestInput = {
  frontendOpId?: string | null;
  projectConfigId: string;
  sectionId: string;
  textDisplayMode: TextBlockDisplayMode;
};
`

const setTextBlockFormatRequestInputRawTS = `
export type SetTextBlockFormatRequestInput = {
  frontendOpId?: string | null;
  projectConfigId: string;
  sectionId: string;
  format: TextBlockFormat;
};
`

const setCodeFileBindingRequestInputRawTS = `
export type CodeFileBindingUpdate = {
  canonical_path: string;
  access_mode: CodeFileAccessMode;
};

export type SetCodeFileBindingRequestInput = {
  frontendOpId?: string | null;
  projectConfigId: string;
  sectionId: string;
  binding: CodeFileBindingUpdate;
};
`

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

export const ListRootViewModeEnum = {
  default: "default",
  task_list: "task_list",
  kanban: "kanban",
} as const;
export type ListRootViewMode = ObjectValues<typeof ListRootViewModeEnum>;

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

export const TextBlockDisplayModeEnum = {
  Render: "Render",
  Edit: "Edit",
} as const;
export type TextBlockDisplayMode = ObjectValues<
  typeof TextBlockDisplayModeEnum
>;

export const TextBlockFormatEnum = {
  Plaintext: "Plaintext",
  Markdown: "Markdown",
} as const;
export type TextBlockFormat = ObjectValues<typeof TextBlockFormatEnum>;

export const ChatRoleEnum = {
  system: "system",
  user: "user",
  assistant: "assistant",
  tool: "tool",
} as const;
export type ChatRole = ObjectValues<typeof ChatRoleEnum>;

export const ChatPermissionModeEnum = {
  minimal: "minimal",
  yolo: "yolo",
  config_toml_custom: "config_toml_custom",
} as const;
export type ChatPermissionMode = ObjectValues<typeof ChatPermissionModeEnum>;

export const ChatDictationModeEnum = {
  auto: "auto",
  browser: "browser",
  provider: "provider",
} as const;
export type ChatDictationMode = ObjectValues<typeof ChatDictationModeEnum>;

export const BrowserAreaViewModeEnum = {
  list: "list",
  thumbnail: "thumbnail",
  carousel: "carousel",
} as const;
export type BrowserAreaViewMode = ObjectValues<
  typeof BrowserAreaViewModeEnum
>;

export const BrowserSearchScopeEnum = {
  recursive: "recursive",
  local: "local",
} as const;
export type BrowserSearchScope = ObjectValues<typeof BrowserSearchScopeEnum>;

export const ChartTypeEnum = {
  line: "line",
  scatter: "scatter",
} as const;
export type ChartType = ObjectValues<typeof ChartTypeEnum>;

export const TaskBoardViewModeEnum = {
  task_list: "task_list",
  kanban: "kanban",
} as const;
export type TaskBoardViewMode = ObjectValues<typeof TaskBoardViewModeEnum>;

export const TaskBoardTaskRecurrenceEnum = {
  none: "none",
  hourly: "hourly",
  daily: "daily",
  specified_days: "specified_days",
  specified_months: "specified_months",
  specified_years: "specified_years",
} as const;
export type TaskBoardTaskRecurrence = ObjectValues<
  typeof TaskBoardTaskRecurrenceEnum
>;

export const TaskBoardRecurringWeekdayEnum = {
  monday: "monday",
  tuesday: "tuesday",
  wednesday: "wednesday",
  thursday: "thursday",
  friday: "friday",
  saturday: "saturday",
  sunday: "sunday",
} as const;
export type TaskBoardRecurringWeekday = ObjectValues<
  typeof TaskBoardRecurringWeekdayEnum
>;

export const TaskBoardRecurringMonthEnum = {
  january: "january",
  february: "february",
  march: "march",
  april: "april",
  may: "may",
  june: "june",
  july: "july",
  august: "august",
  september: "september",
  october: "october",
  november: "november",
  december: "december",
} as const;
export type TaskBoardRecurringMonth = ObjectValues<
  typeof TaskBoardRecurringMonthEnum
>;

export const SpreadsheetGridDensityEnum = {
  compact: "compact",
  comfortable: "comfortable",
} as const;
export type SpreadsheetGridDensity = ObjectValues<
  typeof SpreadsheetGridDensityEnum
>;

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

export const AgenticEdgeKindEnum = {
  chat_chat: "chat_chat",
  section_chat: "section_chat",
  chat_section: "chat_section",
} as const;
export type AgenticEdgeKind = ObjectValues<typeof AgenticEdgeKindEnum>;

export const AgenticEdgeContextModeEnum = {
  reference_only: "reference_only",
  inline_text: "inline_text",
  summary: "summary",
} as const;
export type AgenticEdgeContextMode = ObjectValues<
  typeof AgenticEdgeContextModeEnum
>;

export const RunSnapshotModeEnum = {
  ephemeral: "ephemeral",
  always: "always",
  never: "never",
} as const;
export type RunSnapshotMode = ObjectValues<typeof RunSnapshotModeEnum>;

export const RenameRefactorModeEnum = {
  ALWAYS_ASK: "ALWAYS_ASK",
  ALWAYS_RENAME: "ALWAYS_RENAME",
  NEVER_RENAME: "NEVER_RENAME",
} as const;
export type RenameRefactorMode = ObjectValues<
  typeof RenameRefactorModeEnum
>;

export const BackgroundVariantEnum = {
  lines: "lines",
  dots: "dots",
  cross: "cross",
} as const;
export type BackgroundVariant = ObjectValues<typeof BackgroundVariantEnum>;

export const SelectionModeEnum = {
  partial: "partial",
  full: "full",
} as const;
export type SelectionMode = ObjectValues<typeof SelectionModeEnum>;

export const PanOnScrollModeEnum = {
  free: "free",
  vertical: "vertical",
  horizontal: "horizontal",
} as const;
export type PanOnScrollMode = ObjectValues<typeof PanOnScrollModeEnum>;

export const MetaControlSizeModeEnum = {
  any: "any",
  auto_only: "auto_only",
  manual_only: "manual_only",
} as const;
export type MetaControlSizeMode = ObjectValues<
  typeof MetaControlSizeModeEnum
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

export const SectionSizeModeEnum = {
  auto: "auto",
} as const;
export type SectionSizeMode = ObjectValues<typeof SectionSizeModeEnum>;

export type SectionSizeValue = number | SectionSizeMode;

export type SectionSize = {
  width: SectionSizeValue;
  height: SectionSizeValue;
};
export function createSectionSize(
  options: Partial<SectionSize> = {},
): SectionSize {
  return mergeGeneratedOptions(
    {
      width: SectionSizeModeEnum.auto,
      height: SectionSizeModeEnum.auto,
    },
    options,
  );
}

export type EdgePort = {
  id: string;
  accessor: string;
};

export type TypeErrorIgnoreState = {
  callable: boolean;
  params: Record<string, boolean>;
};

export type Viewport = {
  x: number;
  y: number;
  zoom: number;
};

export type TopLevelSectionLayout = {
  x: number;
  y: number;
  zIndex?: number;
  w?: number | null;
  h?: number | null;
};
export function createTopLevelSectionLayout(
  options: Partial<TopLevelSectionLayout> = {},
): TopLevelSectionLayout {
  return mergeGeneratedOptions(
    {
      x: 0,
      y: 0,
      zIndex: 0,
      w: null,
      h: null,
    },
    options,
  );
}

export type ViewMode = {
  id: string;
  name: string;
  sortIndex?: number;
  isUserFacing?: boolean;
  isTab?: boolean;
  visibilityBySectionId?: Record<string, boolean>;
  viewport?: Viewport | null;
  viewportInitialized?: boolean;
  topLevelSections?: Record<string, TopLevelSectionLayout>;
};
export type ViewModeConfig = ViewMode;
export function createViewMode(options: Partial<ViewMode> = {}): ViewMode {
  return mergeGeneratedOptions(
    {
      id: "",
      name: "",
      sortIndex: 0,
      isUserFacing: false,
      isTab: false,
      visibilityBySectionId: {},
      viewport: null,
      viewportInitialized: false,
      topLevelSections: {},
    },
    options,
  );
}
export function createViewModeConfig(
  options: Partial<ViewModeConfig> = {},
): ViewModeConfig {
  return createViewMode(options);
}

export type Edge = {
  id: string;
  sourceSectionId: string;
  sourceVariantId: string;
  sourcePortId: string;
  targetSectionId: string;
  targetVariantId: string;
  targetPortId: string;
  type?: string;
  label?: string | null;
  style?: Record<string, unknown>;
  animated?: boolean;
  hidden?: boolean;
  zIndex?: number;
  data?: Record<string, unknown>;
  selected?: boolean;
};

export type AgenticEdge = {
  id: string;
  sourceSectionId: string;
  targetSectionId: string;
  kind: AgenticEdgeKind;
  contextMode?: AgenticEdgeContextMode | null;
  style?: Record<string, unknown>;
  hidden?: boolean;
  zIndex?: number;
  selected?: boolean;
};
export function createAgenticEdge(
  options: Partial<AgenticEdge> = {},
): AgenticEdge {
  return mergeGeneratedOptions(
    {
      id: "",
      sourceSectionId: "",
      targetSectionId: "",
      kind: AgenticEdgeKindEnum.section_chat,
      contextMode: null,
      style: {},
      hidden: false,
      zIndex: 0,
      selected: false,
    },
    options,
  );
}

export type WatchCodeFolder = {
  path: string;
  recursive: boolean;
};

export type WatchCodeRegistryEntry = {
  callableName: string;
  kind: string;
  signatureHash: string;
  bodyHash: string;
  sourcePath: string;
  sectionIds?: Array<string>;
  sectionsCount?: number;
};

export const CodeFileAccessModeEnum = {
  read_write: "read_write",
  read_only: "read_only",
  write_only: "write_only",
} as const;
export type CodeFileAccessMode = ObjectValues<typeof CodeFileAccessModeEnum>;

export type CodeFileBinding = {
  canonical_path: string;
  access_mode: CodeFileAccessMode;
  autoBinding: boolean;
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

export const ProjectCodegenLanguageEnum = {
  python: "python",
} as const;
export type ProjectCodegenLanguage = ObjectValues<
  typeof ProjectCodegenLanguageEnum
>;

export const SectionCodegenModeEnum = {
  inherit: "inherit",
  include: "include",
  exclude: "exclude",
} as const;
export type SectionCodegenMode = ObjectValues<typeof SectionCodegenModeEnum>;

export const SectionRepresentationModeEnum = {
  expression: "expression",
  file_path: "file_path",
  file_read: "file_read",
} as const;
export type SectionRepresentationMode = ObjectValues<
  typeof SectionRepresentationModeEnum
>;

export type SectionTypeCodegenPolicy = {
  mode: SectionCodegenMode;
  representation: SectionRepresentationMode;
};
export function createSectionTypeCodegenPolicy(
  options: Partial<SectionTypeCodegenPolicy> = {},
): SectionTypeCodegenPolicy {
  return mergeGeneratedOptions(
    {
      mode: SectionCodegenModeEnum.inherit,
      representation: SectionRepresentationModeEnum.expression,
    },
    options,
  );
}

export type SectionCodegenOverride = {
  mode: SectionCodegenMode;
  representation: SectionRepresentationMode;
};
export function createSectionCodegenOverride(
  options: Partial<SectionCodegenOverride> = {},
): SectionCodegenOverride {
  return mergeGeneratedOptions(
    {
      mode: SectionCodegenModeEnum.inherit,
      representation: SectionRepresentationModeEnum.expression,
    },
    options,
  );
}

const defaultSectionCodegenAllowlist: Array<SectionType> = [
  SectionTypeEnum.Callable,
  SectionTypeEnum.Dict,
  SectionTypeEnum.ListRoot,
  SectionTypeEnum.Group,
  SectionTypeEnum.GlobalVariables,
  SectionTypeEnum.TextBlock,
  SectionTypeEnum.Draw,
  SectionTypeEnum.MetaControl,
  SectionTypeEnum.TaskBoard,
  SectionTypeEnum.Spreadsheet,
];

const defaultMetaControlCodegenAllowlist: Array<CodeObjType> = [
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
  CodeObjTypeEnum.ButtonParam,
  CodeObjTypeEnum.DropzoneParam,
];

function defaultSectionRepresentation(
  sectionType: SectionType,
): SectionRepresentationMode {
  switch (sectionType) {
    case SectionTypeEnum.Chat:
    case SectionTypeEnum.Draw:
    case SectionTypeEnum.Image:
      return SectionRepresentationModeEnum.file_read;
    default:
      return SectionRepresentationModeEnum.expression;
  }
}

function createDefaultSectionTypePolicies(): Record<
  SectionType,
  SectionTypeCodegenPolicy
> {
  return Object.fromEntries(
    (Object.values(SectionTypeEnum) as Array<SectionType>).map(
      (sectionType) => [
        sectionType,
        createSectionTypeCodegenPolicy({
          representation: defaultSectionRepresentation(sectionType),
        }),
      ],
    ),
  ) as Record<SectionType, SectionTypeCodegenPolicy>;
}

export type SectionCodegenPolicy = {
  allowlist?: Array<SectionType> | null;
  metaControlAllowlist?: Array<CodeObjType> | null;
  exclude: Array<string>;
  typePolicies: Record<SectionType, SectionTypeCodegenPolicy>;
  sectionOverrides: Record<string, SectionCodegenOverride>;
};
export function createSectionCodegenPolicy(
  options: Partial<SectionCodegenPolicy> = {},
): SectionCodegenPolicy {
  const typePolicies = createDefaultSectionTypePolicies();
  for (const [sectionType, policy] of Object.entries(
    options.typePolicies ?? {},
  ) as Array<[SectionType, SectionTypeCodegenPolicy]>) {
    typePolicies[sectionType] = createSectionTypeCodegenPolicy(policy);
  }
  const sectionOverrides = Object.fromEntries(
    Object.entries(options.sectionOverrides ?? {}).map(([sectionId, override]) => [
      sectionId,
      createSectionCodegenOverride(override),
    ]),
  ) as Record<string, SectionCodegenOverride>;
  return {
    ...mergeGeneratedOptions(
      {
        allowlist: defaultSectionCodegenAllowlist,
        metaControlAllowlist: defaultMetaControlCodegenAllowlist,
        exclude: [],
        typePolicies,
        sectionOverrides,
      },
      options,
    ),
    allowlist:
      options.allowlist === null
        ? null
        : [...(options.allowlist ?? defaultSectionCodegenAllowlist)],
    metaControlAllowlist:
      options.metaControlAllowlist === null
        ? null
        : [
            ...(options.metaControlAllowlist ??
              defaultMetaControlCodegenAllowlist),
          ],
    exclude: [...(options.exclude ?? [])],
    typePolicies,
    sectionOverrides,
  };
}

export const CodeObjValueRepresentationModeEnum = {
  expression: "expression",
  json_parsed: "json_parsed",
  string: "string",
  file_path: "file_path",
  file_read: "file_read",
} as const;
export type CodeObjValueRepresentationMode = ObjectValues<
  typeof CodeObjValueRepresentationModeEnum
>;

export type CodeObjTypeValuePolicy = {
  representation: CodeObjValueRepresentationMode;
};
export function createCodeObjTypeValuePolicy(
  options: Partial<CodeObjTypeValuePolicy> = {},
): CodeObjTypeValuePolicy {
  return mergeGeneratedOptions(
    {
      representation: CodeObjValueRepresentationModeEnum.expression,
    },
    options,
  );
}

export type CodeObjValueOverride = {
  representation: CodeObjValueRepresentationMode;
};
export function createCodeObjValueOverride(
  options: Partial<CodeObjValueOverride> = {},
): CodeObjValueOverride {
  return mergeGeneratedOptions(
    {
      representation: CodeObjValueRepresentationModeEnum.expression,
    },
    options,
  );
}

function defaultCodeObjValueRepresentation(
  codeObjType: CodeObjType,
): CodeObjValueRepresentationMode {
  switch (codeObjType) {
    case CodeObjTypeEnum.TextParam:
    case CodeObjTypeEnum.DateParam:
    case CodeObjTypeEnum.TimeParam:
    case CodeObjTypeEnum.TextAreaParam:
    case CodeObjTypeEnum.PasswordParam:
    case CodeObjTypeEnum.ColorPickerParam:
      return CodeObjValueRepresentationModeEnum.string;
    case CodeObjTypeEnum.DropzoneParam:
      return CodeObjValueRepresentationModeEnum.file_path;
    default:
      return CodeObjValueRepresentationModeEnum.expression;
  }
}

function createDefaultCodeObjTypePolicies(): Record<
  CodeObjType,
  CodeObjTypeValuePolicy
> {
  return Object.fromEntries(
    (Object.values(CodeObjTypeEnum) as Array<CodeObjType>).map((codeObjType) => [
      codeObjType,
      createCodeObjTypeValuePolicy({
        representation: defaultCodeObjValueRepresentation(codeObjType),
      }),
    ]),
  ) as Record<CodeObjType, CodeObjTypeValuePolicy>;
}

export type CodeObjValuePolicy = {
  typePolicies: Record<CodeObjType, CodeObjTypeValuePolicy>;
  codeObjOverrides: Record<string, CodeObjValueOverride>;
};
export function createCodeObjValuePolicy(
  options: Partial<CodeObjValuePolicy> = {},
): CodeObjValuePolicy {
  const typePolicies = createDefaultCodeObjTypePolicies();
  for (const [codeObjType, policy] of Object.entries(
    options.typePolicies ?? {},
  ) as Array<[CodeObjType, CodeObjTypeValuePolicy]>) {
    typePolicies[codeObjType] = createCodeObjTypeValuePolicy(policy);
  }
  const codeObjOverrides = Object.fromEntries(
    Object.entries(options.codeObjOverrides ?? {}).map(([codeObjId, override]) => [
      codeObjId,
      createCodeObjValueOverride(override),
    ]),
  ) as Record<string, CodeObjValueOverride>;
  return {
    ...mergeGeneratedOptions(
      {
        typePolicies,
        codeObjOverrides,
      },
      options,
    ),
    typePolicies,
    codeObjOverrides,
  };
}

export type ProjectCodegenPythonTarget = {
  language: typeof ProjectCodegenLanguageEnum.python;
  genCodePrefix: string;
  genCodeSuffix: string;
  generateMetadata: boolean;
  sectionPolicy: SectionCodegenPolicy;
  codeObjValuePolicy: CodeObjValuePolicy;
};
export function createProjectCodegenPythonTarget(
  options: Partial<ProjectCodegenPythonTarget> = {},
): ProjectCodegenPythonTarget {
  const sectionPolicy = createSectionCodegenPolicy(options.sectionPolicy ?? {});
  const codeObjValuePolicy = createCodeObjValuePolicy(
    options.codeObjValuePolicy ?? {},
  );
  return {
    ...mergeGeneratedOptions(
      {
        language: ProjectCodegenLanguageEnum.python,
        genCodePrefix: "",
        genCodeSuffix: "state = SettaState()",
        generateMetadata: false,
        sectionPolicy,
        codeObjValuePolicy,
      },
      options,
    ),
    language: ProjectCodegenLanguageEnum.python,
    sectionPolicy,
    codeObjValuePolicy,
  };
}

export type ProjectCodegenPluginTarget = {
  language: string;
  options: Record<string, unknown>;
};
export function createProjectCodegenPluginTarget(
  options: Partial<ProjectCodegenPluginTarget> = {},
): ProjectCodegenPluginTarget {
  return mergeGeneratedOptions(
    {
      language: "",
      options: {},
    },
    options,
  );
}

export type ProjectCodegenTarget =
  | ProjectCodegenPythonTarget
  | ProjectCodegenPluginTarget;

export type ProjectConfig = {
  id: string;
  name: string;
  showParamDisplayNames: boolean;
  allowJsonSourceKeyEdits: boolean;
  previewImgColor?: string;
  viewport?: Viewport | null;
  viewportInitialized: boolean;
  viewModes: Record<string, ViewMode>;
  activeViewModeId?: string | null;
  isEditingViewMode: boolean;
  codegenTargets: Array<ProjectCodegenTarget>;
  watchCodeEnabled: boolean;
  watchCodeFolders: Array<WatchCodeFolder>;
  watchCodeFiles: Array<string>;
  watchCodeRegistry: Record<string, WatchCodeRegistryEntry>;
  watchCodeBaselineByPath: Record<string, Array<string>>;
  entryCodeBlockId?: string | null;
  topLevelSections: Record<string, TopLevelSectionLayout>;
  sectionVariantMap: Record<string, string>;
  activeIds: Array<string>;
  edges: Array<Edge>;
  agenticEdges: Array<AgenticEdge>;
};
export function createProjectConfig(
  options: Partial<ProjectConfig> = {},
): ProjectConfig {
  return mergeGeneratedOptions(
    {
      id: "",
      name: "",
      showParamDisplayNames: false,
      allowJsonSourceKeyEdits: false,
      previewImgColor: "",
      viewport: null,
      viewportInitialized: false,
      viewModes: {},
      activeViewModeId: null,
      isEditingViewMode: false,
      codegenTargets: [],
      watchCodeEnabled: false,
      watchCodeFolders: [],
      watchCodeFiles: [],
      watchCodeRegistry: {},
      watchCodeBaselineByPath: {},
      entryCodeBlockId: null,
      topLevelSections: {},
      sectionVariantMap: {},
      activeIds: [],
      edges: [],
      agenticEdges: [],
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

type JSONValue =
  | null
  | boolean
  | number
  | string
  | Array<JSONValue>
  | { [key: string]: JSONValue | undefined };

export type ChatFileAttachment = {
  id: string;
  name: string;
  mimeType?: string | null;
  size?: number | null;
};

export type MessageTextContent = {
  type: "text";
  text: string;
};
export function createMessageTextContent(
  options: Partial<MessageTextContent> = {},
): MessageTextContent {
  return mergeGeneratedOptions(
    {
      type: "text",
      text: "",
    },
    options,
  );
}

export type MessageImageUrl = {
  url: string;
  detail?: "auto" | "low" | "high" | null;
};

export type MessageImageUrlContent = {
  type: "image_url";
  image_url: MessageImageUrl;
};

export type MessageThinkingContent = {
  type: "thinking";
  thinking: string;
  summary?: string | null;
  signature?: string | null;
};
export function createMessageThinkingContent(
  options: Partial<MessageThinkingContent> = {},
): MessageThinkingContent {
  return mergeGeneratedOptions(
    {
      type: "thinking",
      thinking: "",
      summary: "",
      signature: "",
    },
    options,
  );
}

export type MessageContent =
  | MessageTextContent
  | MessageImageUrlContent
  | MessageThinkingContent;

export type ToolReferenceContent = {
  type: "tool_reference";
  tool_name: string;
};

export type ToolCallFunction = {
  name: string;
  arguments: { [key: string]: JSONValue | undefined };
};
export function createToolCallFunction(
  options: Partial<ToolCallFunction> = {},
): ToolCallFunction {
  return mergeGeneratedOptions(
    {
      name: "",
      arguments: {},
    },
    options,
  );
}

export type ToolCall = {
  id: string;
  type: "function";
  function: ToolCallFunction;
};
export function createToolCall(options: Partial<ToolCall> = {}): ToolCall {
  return mergeGeneratedOptions(
    {
      id: "",
      type: "function",
      function: createToolCallFunction(),
    },
    options,
  );
}

type ContentChatMessageBase = {
  id: string;
  content: Array<MessageContent>;
  attachments: Array<ChatFileAttachment>;
};

export type SystemChatMessage = ContentChatMessageBase & {
  role: typeof ChatRoleEnum.system;
};

export type AssistantChatMessage = ContentChatMessageBase & {
  role: typeof ChatRoleEnum.assistant;
  tool_calls?: Array<ToolCall> | null;
};

export type UserChatMessage = ContentChatMessageBase & {
  role: typeof ChatRoleEnum.user;
};

export type ToolChatMessage = {
  id: string;
  role: typeof ChatRoleEnum.tool;
  tool_call_id: string;
  tool_name?: string | null;
  arguments: JSONValue;
  result: JSONValue;
  content: Array<ToolReferenceContent | Record<string, unknown>>;
  is_error: boolean;
  started_at: string;
  completed_at?: string | null;
};

export type BaseChatMessageUnion =
  | SystemChatMessage
  | AssistantChatMessage
  | UserChatMessage
  | ToolChatMessage;

export function createSystemChatMessage(
  options: Partial<SystemChatMessage> = {},
): SystemChatMessage {
  return mergeGeneratedOptions(
    {
      id: "",
      role: ChatRoleEnum.system,
      content: [],
      attachments: [],
    },
    options,
  );
}

export function createAssistantChatMessage(
  options: Partial<AssistantChatMessage> = {},
): AssistantChatMessage {
  return mergeGeneratedOptions(
    {
      id: "",
      role: ChatRoleEnum.assistant,
      content: [],
      attachments: [],
      tool_calls: null,
    },
    options,
  );
}

export function createUserChatMessage(
  options: Partial<UserChatMessage> = {},
): UserChatMessage {
  return mergeGeneratedOptions(
    {
      id: "",
      role: ChatRoleEnum.user,
      content: [],
      attachments: [],
    },
    options,
  );
}

export function createToolChatMessage(
  options: Partial<ToolChatMessage> = {},
): ToolChatMessage {
  return mergeGeneratedOptions(
    {
      id: "",
      role: ChatRoleEnum.tool,
      tool_call_id: "",
      tool_name: null,
      arguments: {},
      result: null,
      content: [],
      is_error: false,
      started_at: "",
      completed_at: null,
    },
    options,
  );
}

export type ChatSectionBranch = {
  messages: Array<BaseChatMessageUnion>;
  createdAt: number;
  parentBranchId?: string | null;
  branchFromMessageId?: string | null;
};

export type ChatSectionState = {
  messages: Array<BaseChatMessageUnion>;
  inputText: string;
  waitingForResponse: boolean;
  toolCallArguments: Record<string, string>;
  activeBranchId?: string | null;
  branches: Record<string, ChatSectionBranch>;
};

export type CodeSectionDiagnosticsIgnoreState = {
  muted: boolean;
  suppressedCodes: Array<string | number>;
};

export type BaseCodeObjImpl = {
  type: CodeObjType;
  id: string;
  name: string;
  description: string;
  isPreset: boolean;
  children?: Array<string>;
  coreNameType?: ParamNameType;
  coreNameEditable?: boolean;
  passingStyle?: ParameterPassingStyle;
  typeAnnotation?: string;
  defaultVal?: string;
  value?: string;
  [key: string]: unknown;
};
export type CodeParamCodeObjImpl = BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.CodeParam;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
  defaultVal: string;
  value: string;
};

export type ColorPickerChoice = {
  color: string;
  description: string;
};

export type CodeCallableCodeObjImpl = BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.CodeCallable;
  children: Array<string>;
};

export type TextParamCodeObjImpl = BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.TextParam;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
  defaultVal: string;
  value: string;
  uiType: TextParamInputUIType;
};

export type DateParamCodeObjImpl = BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.DateParam;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
  defaultVal: string;
  value: string;
  dateDisplayFormat: DateDisplayFormat;
  dateControlMode: DateControlMode;
  dateSelectionMode: DateSelectionMode;
  dateCalendarWeekStart: DateCalendarWeekStart;
  dateIncludesTime: boolean;
};

export type TimeParamCodeObjImpl = BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.TimeParam;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
  defaultVal: string;
  value: string;
  timeControlMode: TimeControlMode;
  timeDisplayFormat: TimeDisplayFormat;
  timeDisplayTransparent: boolean;
  timeDisplayScale: number;
  timeDisplayFont: TimeDisplayFont;
};

export type ButtonParamCodeObjImpl = BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.ButtonParam;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
  label: string;
  actionMode: ButtonActionMode;
  requestMethod: HttpRequestMethod;
  requestUrl: string;
  requestHeaderKey: string;
  requestHeaderValue: string;
  requestBody: string;
};

export type SliderParamCodeObjImpl = BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.SliderParam;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
  defaultVal: string;
  value: string;
  min: number;
  max: number;
  step: number;
};

export type RotaryParamCodeObjImpl = BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.RotaryParam;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
  defaultVal: string;
  value: string;
  min: number;
  max: number;
  step: number;
};

export type SwitchParamCodeObjImpl = BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.SwitchParam;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
  defaultVal: string;
  value: string;
};

export type ColorPickerParamCodeObjImpl = BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.ColorPickerParam;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
  defaultVal: string;
  value: string;
  colorChoices: Array<ColorPickerChoice>;
};

export type DropdownParamCodeObjImpl = BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.DropdownParam;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
  defaultVal: string;
  value: string;
  choices: Array<string>;
};

export type PasswordParamCodeObjImpl = BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.PasswordParam;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
  defaultVal: string;
  value: string;
  hasSecret: boolean;
};

export type TextAreaParamCodeObjImpl = BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.TextAreaParam;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
  defaultVal: string;
  value: string;
};

export type DropzoneParamCodeObjImpl = BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.DropzoneParam;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
  defaultVal: string;
  value: string;
  mode: DropzoneMode;
  maxAttachments?: number | null;
  placeholder: string;
};

export type NestedParamCodeObjImpl = BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.NestedParam;
  children: Array<string>;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
};

export type BaseCodeObjImplUnion =
  | BaseCodeObjImpl
  | CodeCallableCodeObjImpl
  | CodeParamCodeObjImpl
  | TextParamCodeObjImpl
  | DateParamCodeObjImpl
  | TimeParamCodeObjImpl
  | ButtonParamCodeObjImpl
  | SliderParamCodeObjImpl
  | RotaryParamCodeObjImpl
  | SwitchParamCodeObjImpl
  | ColorPickerParamCodeObjImpl
  | DropdownParamCodeObjImpl
  | PasswordParamCodeObjImpl
  | TextAreaParamCodeObjImpl
  | DropzoneParamCodeObjImpl
  | NestedParamCodeObjImpl;
export type BaseChildlessCodeObjImplUnion =
  | BaseCodeObjImpl
  | CodeParamCodeObjImpl
  | TextParamCodeObjImpl
  | DateParamCodeObjImpl
  | TimeParamCodeObjImpl
  | SliderParamCodeObjImpl
  | RotaryParamCodeObjImpl
  | SwitchParamCodeObjImpl
  | ColorPickerParamCodeObjImpl
  | DropdownParamCodeObjImpl
  | PasswordParamCodeObjImpl
  | TextAreaParamCodeObjImpl
  | DropzoneParamCodeObjImpl;
export type BaseParamCodeObjImplUnion =
  | BaseCodeObjImpl
  | CodeParamCodeObjImpl
  | TextParamCodeObjImpl
  | DateParamCodeObjImpl
  | TimeParamCodeObjImpl
  | ButtonParamCodeObjImpl
  | SliderParamCodeObjImpl
  | RotaryParamCodeObjImpl
  | SwitchParamCodeObjImpl
  | ColorPickerParamCodeObjImpl
  | DropdownParamCodeObjImpl
  | PasswordParamCodeObjImpl
  | TextAreaParamCodeObjImpl
  | DropzoneParamCodeObjImpl
  | NestedParamCodeObjImpl;
export type BaseParentCodeObjImplUnion =
  | CodeCallableCodeObjImpl
  | NestedParamCodeObjImpl;

export type UserDefaultCodeParamCodeObjImpl = {
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  typeAnnotation: string;
  defaultVal: string;
  value: string;
};
export function createUserDefaultCodeParamCodeObjImpl(
  options: Partial<UserDefaultCodeParamCodeObjImpl> = {},
): UserDefaultCodeParamCodeObjImpl {
  return mergeGeneratedOptions(
    {
      coreNameType: ParamNameTypeEnum.TEXT,
      coreNameEditable: false,
      typeAnnotation: "",
      defaultVal: "",
      value: "",
    },
    options,
  );
}

export function createCodeParamCodeObjImpl(
  defaultsOrOverrides:
    | Partial<UserDefaultCodeParamCodeObjImpl>
    | Partial<CodeParamCodeObjImpl> = {},
  overrides?: Partial<CodeParamCodeObjImpl>,
): CodeParamCodeObjImpl {
  const resolved = resolveGeneratedFactoryInputs<
    UserDefaultCodeParamCodeObjImpl,
    CodeParamCodeObjImpl
  >(createUserDefaultCodeParamCodeObjImpl(), defaultsOrOverrides, overrides);
  return mergeGeneratedOptions(
    {
      type: CodeObjTypeEnum.CodeParam,
      id: "",
      name: "",
      description: "",
      isPreset: false,
      coreNameType: resolved.defaults.coreNameType,
      coreNameEditable: resolved.defaults.coreNameEditable,
      passingStyle: ParameterPassingStyleEnum.DEFAULT,
      typeAnnotation: resolved.defaults.typeAnnotation,
      defaultVal: resolved.defaults.defaultVal,
      value: resolved.defaults.value,
    },
    resolved.overrides,
  );
}

export type BaseSectionImpl = {
  type: SectionType;
  id: string;
  name: string;
  isFrozen: boolean;
  isInOtherProjectConfigs: boolean;
  tagColor: string | null;
  styleColor: string | null;
  size: SectionSize;
  aspectRatio: boolean | number;
  aspectRatioExtraHeight: number;
  aspectRatioExtraWidth: number;
  isMinimized: boolean;
  positionAndSizeLocked: boolean;
  isPreset: boolean;
  children?: Array<string>;
  codeObjVariantMap?: Record<string, string>;
  hideUnpinnedParams?: boolean;
  paramFilter?: string;
  columnWidth?: number | null;
  configLanguage?: string;
  pinnedParams?: Array<string>;
  selectedParams?: Array<string>;
  ignoreTypeErrors?: TypeErrorIgnoreState;
  edgeInputParams?: Array<string>;
  edgeOutputPorts?: Array<EdgePort>;
  topLevelParamId?: string | null;
  isJsonSource?: boolean;
  jsonSourceKeys?: Array<string>;
  jsonSourceMissing?: boolean;
  metaControlParamId?: string | null;
  showSectionTitle?: boolean;
  attachedTerminalSectionId?: string | null;
  code?: string;
  codeLanguage?: string;
  codeFileBinding?: CodeFileBinding | null;
  messages?: Array<BaseChatMessageUnion>;
  inputText?: string;
  waitingForResponse?: boolean;
  toolCallArguments?: Record<string, string>;
  pluginId?: string;
  kind?: string;
  data?: Record<string, unknown>;
  schemaVersion?: number | null;
  viewMode?: ListRootViewMode;
  defaultChildSectionType?: SectionType;
  isHorizontalOrientation?: boolean;
  overflowMode?: boolean;
  hideColumn?: boolean;
  folder?: string;
  filePath?: string;
  activeSheet?: string | null;
  readOnly?: boolean;
  showRowNumbers?: boolean;
  density?: string;
  autoReloadOnExternalChange?: boolean;
  text?: string;
  metaControlStyle?: boolean;
  imagePath?: string;
  dataPath?: string;
  chartSettings?: BaseChartSettingsUnion;
  [key: string]: unknown;
};
export type ChartData = ChartDataValue;

export type ChartDataType = ChartDataValue;

export type LineChartSettings = {
  type: typeof ChartTypeEnum.line;
  xAxisColumn?: string | null;
  secondYAxisColumns: Array<string>;
  xAxisLog: boolean;
  y1AxisLog: boolean;
  y2AxisLog: boolean;
};
export function createLineChartSettings(
  options: Partial<LineChartSettings> = {},
): LineChartSettings {
  return mergeGeneratedOptions(
    {
      type: ChartTypeEnum.line,
      xAxisColumn: null,
      secondYAxisColumns: [],
      xAxisLog: false,
      y1AxisLog: false,
      y2AxisLog: false,
    },
    options,
  );
}

export type ScatterChartSettings = {
  type: typeof ChartTypeEnum.scatter;
  xAxisColumn?: string | null;
  categoryColumn?: string | null;
  xAxisLog: boolean;
  yAxisLog: boolean;
};
export function createScatterChartSettings(
  options: Partial<ScatterChartSettings> = {},
): ScatterChartSettings {
  return mergeGeneratedOptions(
    {
      type: ChartTypeEnum.scatter,
      xAxisColumn: null,
      categoryColumn: null,
      xAxisLog: false,
      yAxisLog: false,
    },
    options,
  );
}

export type BaseChartSettingsUnion =
  | LineChartSettings
  | ScatterChartSettings;

export function createBaseChartSettingsUnionWithDiscriminator(
  options:
    | ({ type: typeof ChartTypeEnum.line } & Partial<LineChartSettings>)
    | ({ type: typeof ChartTypeEnum.scatter } & Partial<ScatterChartSettings>),
): BaseChartSettingsUnion {
  switch (options.type) {
    case ChartTypeEnum.line:
      return createLineChartSettings(options);
    case ChartTypeEnum.scatter:
      return createScatterChartSettings(options);
    default:
      throw new Error("Unsupported chart type.");
  }
}

export type CallableSectionImpl = BaseSectionImpl & {
  type: typeof SectionTypeEnum.Callable;
  codeObjVariantMap: Record<string, string>;
  hideUnpinnedParams: boolean;
  paramFilter: string;
  columnWidth: number | null;
  configLanguage: ConfigLanguage;
  pinnedParams: Array<string>;
  selectedParams: Array<string>;
  ignoreTypeErrors: TypeErrorIgnoreState;
  edgeInputParams: Array<string>;
  edgeOutputPorts: Array<EdgePort>;
  callable?: string | null;
  hideParams: boolean;
};
export type BaseParentSectionImplUnion = BaseSectionImpl & {
  children: Array<string>;
};
export type BaseSectionWithParamsImplUnion = BaseSectionImpl & {
  codeObjVariantMap: Record<string, string>;
};
export type DictSectionImpl = BaseSectionImpl & {
  type: typeof SectionTypeEnum.Dict;
  codeObjVariantMap: Record<string, string>;
  hideUnpinnedParams: boolean;
  paramFilter: string;
  columnWidth: number | null;
  configLanguage: string;
  pinnedParams: Array<string>;
  selectedParams: Array<string>;
  ignoreTypeErrors: TypeErrorIgnoreState;
  edgeInputParams: Array<string>;
  edgeOutputPorts: Array<EdgePort>;
  topLevelParamId: string | null;
  isJsonSource: boolean;
  jsonSourceKeys: Array<string>;
  jsonSourceMissing: boolean;
};

export type UserDefaultCallableSectionImpl = {
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
  hideParams: boolean;
};

export type ListRootSectionImpl = BaseSectionImpl & {
  type: typeof SectionTypeEnum.ListRoot;
  children: Array<string>;
  defaultChildSectionType: SectionType;
  viewMode: ListRootViewMode;
};

export type UserDefaultListRootSectionImpl = {
  isFrozen: boolean;
  tagColor: string | null;
  styleColor: string | null;
  size: SectionSize;
  aspectRatio: boolean | number;
  isMinimized: boolean;
  positionAndSizeLocked: boolean;
  defaultChildSectionType: SectionType;
  viewMode: ListRootViewMode;
};

export type TextBlockSectionImpl = BaseSectionImpl & {
  type: typeof SectionTypeEnum.TextBlock;
  format: TextBlockFormat;
  masterFontSizePx: number;
  headingAsSectionName: boolean;
  metaControlStyle: boolean;
  textDisplayMode: TextBlockDisplayMode;
  text: string;
};

export type UserDefaultTextBlockSectionImpl = {
  isFrozen: boolean;
  tagColor: string | null;
  styleColor: string | null;
  size: SectionSize;
  aspectRatio: boolean | number;
  isMinimized: boolean;
  positionAndSizeLocked: boolean;
  format: TextBlockFormat;
  masterFontSizePx: number;
  headingAsSectionName: boolean;
  metaControlStyle: boolean;
  textDisplayMode: TextBlockDisplayMode;
  text: string;
};

export type CodeSectionImpl = BaseSectionImpl & {
  type: typeof SectionTypeEnum.Code;
  children: Array<string>;
  code: string;
  codeLanguage: string;
  codeFileBinding?: CodeFileBinding | null;
  attachedTerminalSectionId?: string | null;
  diagnosticsIgnoreState: CodeSectionDiagnosticsIgnoreState;
};

export type UserDefaultCodeSectionImpl = {
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
  codeLanguage: string;
  diagnosticsIgnoreState: CodeSectionDiagnosticsIgnoreState;
};

export type TerminalSectionImpl = BaseSectionImpl & {
  type: typeof SectionTypeEnum.Terminal;
};

export type UserDefaultTerminalSectionImpl = {
  isFrozen: boolean;
  tagColor: string | null;
  styleColor: string | null;
  size: SectionSize;
  aspectRatio: boolean | number;
  isMinimized: boolean;
  positionAndSizeLocked: boolean;
};

export type ChatSectionImpl = BaseSectionImpl &
  ChatSectionState & {
    type: typeof SectionTypeEnum.Chat;
    managed: boolean;
    engineConfigId?: string | null;
    transcriptionProfileId?: string | null;
    agentProfileId?: string | null;
    chatId?: string | null;
    thinking: boolean;
    permissionMode: ChatPermissionMode;
    searchEnabled: boolean;
    dictationMode: ChatDictationMode;
  };

export type UserDefaultChatSectionImpl = {
  isFrozen: boolean;
  tagColor: string | null;
  styleColor: string | null;
  size: SectionSize;
  aspectRatio: boolean | number;
  isMinimized: boolean;
  positionAndSizeLocked: boolean;
  managed: boolean;
  engineConfigId: string | null;
  transcriptionProfileId: string | null;
  agentProfileId: string | null;
  chatId: string | null;
  thinking: boolean;
  permissionMode: ChatPermissionMode;
  searchEnabled: boolean;
  dictationMode: ChatDictationMode;
  messages: Array<BaseChatMessageUnion>;
  inputText: string;
  waitingForResponse: boolean;
  toolCallArguments: Record<string, string>;
  activeBranchId: string | null;
  branches: Record<string, ChatSectionBranch>;
};

export type BrowserSavedSearchTypeFilters = {
  image: boolean;
  video: boolean;
  audio: boolean;
  text: boolean;
  data: boolean;
};
export function createBrowserSavedSearchTypeFilters(
  options: Partial<BrowserSavedSearchTypeFilters> = {},
): BrowserSavedSearchTypeFilters {
  return mergeGeneratedOptions(
    {
      image: true,
      video: true,
      audio: true,
      text: true,
      data: true,
    },
    options,
  );
}

export type BrowserSavedSearch = {
  id: string;
  name: string;
  query: string;
  searchScope: BrowserSearchScope;
  typeFilters: BrowserSavedSearchTypeFilters;
  color: string;
  quickInfo: string;
};
export function createBrowserSavedSearch(
  options: Partial<BrowserSavedSearch> = {},
): BrowserSavedSearch {
  return mergeGeneratedOptions(
    {
      id: "",
      name: "",
      query: "",
      searchScope: BrowserSearchScopeEnum.recursive,
      typeFilters: createBrowserSavedSearchTypeFilters(),
      color: "#3b82f6",
      quickInfo: "",
    },
    options,
  );
}

export type BrowserSectionImpl = Omit<BaseSectionImpl, "viewMode"> & {
  type: typeof SectionTypeEnum.Browser;
  folder: string;
  hideColumn: boolean;
  columnWidth?: number | null;
  typesColumnWidth?: number | null;
  viewMode: BrowserAreaViewMode;
  savedSearches: Array<BrowserSavedSearch>;
};

export type UserDefaultBrowserSectionImpl = {
  isFrozen: boolean;
  tagColor: string | null;
  styleColor: string | null;
  size: SectionSize;
  aspectRatio: boolean | number;
  isMinimized: boolean;
  positionAndSizeLocked: boolean;
  folder: string;
  hideColumn: boolean;
  columnWidth: number | null;
  typesColumnWidth: number | null;
  viewMode: BrowserAreaViewMode;
  savedSearches: Array<BrowserSavedSearch>;
};

export type TaskBoardColumn = {
  id: string;
  name: string;
  color: string;
  sortIndex: number;
};
export function createTaskBoardColumn(
  options: Partial<TaskBoardColumn> = {},
): TaskBoardColumn {
  return mergeGeneratedOptions(
    {
      id: "",
      name: "",
      color: "#3b82f6",
      sortIndex: 0,
    },
    options,
  );
}

export type TaskBoardTask = {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  columnId?: string | null;
  dueDateIso: string;
  recurrence: TaskBoardTaskRecurrence;
  recurrenceDays: Array<TaskBoardRecurringWeekday>;
  recurrenceMonths: Array<TaskBoardRecurringMonth>;
  recurrenceYears: Array<number>;
  sortIndex: number;
};
export function createTaskBoardTask(
  options: Partial<TaskBoardTask> = {},
): TaskBoardTask {
  return mergeGeneratedOptions(
    {
      id: "",
      title: "",
      description: "",
      completed: false,
      columnId: null,
      dueDateIso: "",
      recurrence: TaskBoardTaskRecurrenceEnum.none,
      recurrenceDays: [],
      recurrenceMonths: [],
      recurrenceYears: [],
      sortIndex: 0,
    },
    options,
  );
}

export type TaskBoardSectionImpl = Omit<BaseSectionImpl, "viewMode"> & {
  type: typeof SectionTypeEnum.TaskBoard;
  viewMode: TaskBoardViewMode;
  columns: Array<TaskBoardColumn>;
  tasks: Array<TaskBoardTask>;
};

export type ChartSectionImpl = BaseSectionImpl & {
  type: typeof SectionTypeEnum.Chart;
  dataPath: string;
  chartSettings: BaseChartSettingsUnion;
};

export type UserDefaultChartSectionImpl = {
  isFrozen: boolean;
  tagColor: string | null;
  styleColor: string | null;
  size: SectionSize;
  aspectRatio: boolean | number;
  isMinimized: boolean;
  positionAndSizeLocked: boolean;
  dataPath: string;
  chartSettings: BaseChartSettingsUnion;
};

export type UserDefaultTaskBoardSectionImpl = {
  isFrozen: boolean;
  tagColor: string | null;
  styleColor: string | null;
  size: SectionSize;
  aspectRatio: boolean | number;
  isMinimized: boolean;
  positionAndSizeLocked: boolean;
  viewMode: TaskBoardViewMode;
  columns: Array<TaskBoardColumn> | null;
  tasks: Array<TaskBoardTask>;
};

export type SpreadsheetSectionImpl = BaseSectionImpl & {
  type: typeof SectionTypeEnum.Spreadsheet;
  filePath: string;
  activeSheet?: string | null;
  readOnly: boolean;
  showRowNumbers: boolean;
  density: SpreadsheetGridDensity;
  autoReloadOnExternalChange: boolean;
};

export type UserDefaultSpreadsheetSectionImpl = {
  isFrozen: boolean;
  tagColor: string | null;
  styleColor: string | null;
  size: SectionSize;
  aspectRatio: boolean | number;
  isMinimized: boolean;
  positionAndSizeLocked: boolean;
  filePath: string;
  activeSheet: string | null;
  readOnly: boolean;
  showRowNumbers: boolean;
  density: SpreadsheetGridDensity;
  autoReloadOnExternalChange: boolean;
};

export type BaseSectionImplUnion =
  | CallableSectionImpl
  | DictSectionImpl
  | ListRootSectionImpl
  | TextBlockSectionImpl
  | CodeSectionImpl
  | TerminalSectionImpl
  | ChatSectionImpl
  | BrowserSectionImpl
  | ChartSectionImpl
  | TaskBoardSectionImpl
  | SpreadsheetSectionImpl
  | BaseSectionImpl;

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

export type UserDefaultDictSectionImpl = {
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
  configLanguage: string;
  edgeInputParams: Array<string>;
  edgeOutputPorts: Array<EdgePort>;
  isJsonSource: boolean;
  jsonSourceKeys: Array<string>;
};
export function createUserDefaultDictSectionImpl(
  options: Partial<UserDefaultDictSectionImpl> = {},
): UserDefaultDictSectionImpl {
  return mergeGeneratedOptions(
    {
      ...createGeneratedBaseSectionWithParamsDefaults(),
      isJsonSource: false,
      jsonSourceKeys: [],
    },
    options,
  );
}

export function createDictSectionImpl(
  defaults: UserDefaultDictSectionImpl,
  overrides: Partial<DictSectionImpl> = {},
): DictSectionImpl {
  return mergeGeneratedOptions(
    {
      type: SectionTypeEnum.Dict,
      id: "",
      name: "",
      isFrozen: defaults.isFrozen,
      isInOtherProjectConfigs: false,
      tagColor: defaults.tagColor,
      styleColor: defaults.styleColor,
      size: defaults.size,
      aspectRatio: defaults.aspectRatio,
      aspectRatioExtraHeight: 0,
      aspectRatioExtraWidth: 0,
      isMinimized: defaults.isMinimized,
      positionAndSizeLocked: defaults.positionAndSizeLocked,
      isPreset: false,
      codeObjVariantMap: {},
      hideUnpinnedParams: defaults.hideUnpinnedParams,
      paramFilter: defaults.paramFilter,
      columnWidth: defaults.columnWidth,
      configLanguage: defaults.configLanguage,
      pinnedParams: [],
      selectedParams: [],
      ignoreTypeErrors: {
        callable: false,
        params: {},
      },
      edgeInputParams: defaults.edgeInputParams,
      edgeOutputPorts: defaults.edgeOutputPorts,
      topLevelParamId: null,
      isJsonSource: defaults.isJsonSource,
      jsonSourceKeys: defaults.jsonSourceKeys,
      jsonSourceMissing: false,
    },
    overrides,
  );
}

export function createUserDefaultCallableSectionImpl(
  options: Partial<UserDefaultCallableSectionImpl> = {},
): UserDefaultCallableSectionImpl {
  return mergeGeneratedOptions(
    {
      ...createGeneratedBaseSectionWithParamsDefaults(),
      hideParams: false,
    },
    options,
  );
}

export function createCallableSectionImpl(
  defaultsOrOverrides:
    | Partial<UserDefaultCallableSectionImpl>
    | Partial<CallableSectionImpl> = {},
  overrides?: Partial<CallableSectionImpl>,
): CallableSectionImpl {
  const resolved = resolveGeneratedFactoryInputs<
    UserDefaultCallableSectionImpl,
    CallableSectionImpl
  >(createUserDefaultCallableSectionImpl(), defaultsOrOverrides, overrides);
  return mergeGeneratedOptions(
    {
      type: SectionTypeEnum.Callable,
      id: "",
      name: "",
      isFrozen: resolved.defaults.isFrozen,
      isInOtherProjectConfigs: false,
      tagColor: resolved.defaults.tagColor,
      styleColor: resolved.defaults.styleColor,
      size: resolved.defaults.size,
      aspectRatio: resolved.defaults.aspectRatio,
      aspectRatioExtraHeight: 0,
      aspectRatioExtraWidth: 0,
      isMinimized: resolved.defaults.isMinimized,
      positionAndSizeLocked: resolved.defaults.positionAndSizeLocked,
      isPreset: false,
      codeObjVariantMap: {},
      hideUnpinnedParams: resolved.defaults.hideUnpinnedParams,
      paramFilter: resolved.defaults.paramFilter,
      columnWidth: resolved.defaults.columnWidth,
      configLanguage: resolved.defaults.configLanguage,
      pinnedParams: [],
      selectedParams: [],
      ignoreTypeErrors: {
        callable: false,
        params: {},
      },
      edgeInputParams: resolved.defaults.edgeInputParams,
      edgeOutputPorts: resolved.defaults.edgeOutputPorts,
      callable: null,
      hideParams: resolved.defaults.hideParams,
    },
    resolved.overrides,
  );
}

export function createUserDefaultListRootSectionImpl(
  options: Partial<UserDefaultListRootSectionImpl> = {},
): UserDefaultListRootSectionImpl {
  return mergeGeneratedOptions(
    {
      ...createGeneratedBaseSectionDefaults(),
      defaultChildSectionType: SectionTypeEnum.Callable,
      viewMode: ListRootViewModeEnum.default,
    },
    options,
  );
}

export function createListRootSectionImpl(
  defaultsOrOverrides:
    | Partial<UserDefaultListRootSectionImpl>
    | Partial<ListRootSectionImpl> = {},
  overrides?: Partial<ListRootSectionImpl>,
): ListRootSectionImpl {
  const resolved = resolveGeneratedFactoryInputs<
    UserDefaultListRootSectionImpl,
    ListRootSectionImpl
  >(createUserDefaultListRootSectionImpl(), defaultsOrOverrides, overrides);
  return mergeGeneratedOptions(
    {
      type: SectionTypeEnum.ListRoot,
      id: "",
      name: "",
      isFrozen: resolved.defaults.isFrozen,
      isInOtherProjectConfigs: false,
      tagColor: resolved.defaults.tagColor,
      styleColor: resolved.defaults.styleColor,
      size: resolved.defaults.size,
      aspectRatio: resolved.defaults.aspectRatio,
      aspectRatioExtraHeight: 0,
      aspectRatioExtraWidth: 0,
      isMinimized: resolved.defaults.isMinimized,
      positionAndSizeLocked: resolved.defaults.positionAndSizeLocked,
      isPreset: false,
      children: [],
      defaultChildSectionType: resolved.defaults.defaultChildSectionType,
      viewMode: resolved.defaults.viewMode,
    },
    resolved.overrides,
  );
}

export function createUserDefaultTextBlockSectionImpl(
  options: Partial<UserDefaultTextBlockSectionImpl> = {},
): UserDefaultTextBlockSectionImpl {
  return mergeGeneratedOptions(
    {
      ...createGeneratedBaseSectionDefaults(),
      size: {
        width: 500,
        height: 150,
      },
      format: TextBlockFormatEnum.Plaintext,
      masterFontSizePx: 14,
      headingAsSectionName: false,
      metaControlStyle: false,
      textDisplayMode: TextBlockDisplayModeEnum.Render,
      text: "",
    },
    options,
  );
}

export function createTextBlockSectionImpl(
  defaultsOrOverrides:
    | Partial<UserDefaultTextBlockSectionImpl>
    | Partial<TextBlockSectionImpl> = {},
  overrides?: Partial<TextBlockSectionImpl>,
): TextBlockSectionImpl {
  const resolved = resolveGeneratedFactoryInputs<
    UserDefaultTextBlockSectionImpl,
    TextBlockSectionImpl
  >(createUserDefaultTextBlockSectionImpl(), defaultsOrOverrides, overrides);
  return mergeGeneratedOptions(
    {
      type: SectionTypeEnum.TextBlock,
      id: "",
      name: "",
      isFrozen: resolved.defaults.isFrozen,
      isInOtherProjectConfigs: false,
      tagColor: resolved.defaults.tagColor,
      styleColor: resolved.defaults.styleColor,
      size: resolved.defaults.size,
      aspectRatio: resolved.defaults.aspectRatio,
      aspectRatioExtraHeight: 0,
      aspectRatioExtraWidth: 0,
      isMinimized: resolved.defaults.isMinimized,
      positionAndSizeLocked: resolved.defaults.positionAndSizeLocked,
      isPreset: false,
      format: resolved.defaults.format,
      masterFontSizePx: resolved.defaults.masterFontSizePx,
      headingAsSectionName: resolved.defaults.headingAsSectionName,
      metaControlStyle: resolved.defaults.metaControlStyle,
      textDisplayMode: resolved.defaults.textDisplayMode,
      text: resolved.defaults.text,
    },
    resolved.overrides,
  );
}

export function createUserDefaultCodeSectionImpl(
  options: Partial<UserDefaultCodeSectionImpl> = {},
): UserDefaultCodeSectionImpl {
  return mergeGeneratedOptions(
    {
      ...createGeneratedBaseCodeSectionDefaults(),
      codeLanguage: CodeLanguageEnum.python,
      diagnosticsIgnoreState: {
        muted: false,
        suppressedCodes: [],
      },
    },
    options,
  );
}

export function createCodeSectionImpl(
  defaultsOrOverrides:
    | Partial<UserDefaultCodeSectionImpl>
    | Partial<CodeSectionImpl> = {},
  overrides?: Partial<CodeSectionImpl>,
): CodeSectionImpl {
  const resolved = resolveGeneratedFactoryInputs<
    UserDefaultCodeSectionImpl,
    CodeSectionImpl
  >(createUserDefaultCodeSectionImpl(), defaultsOrOverrides, overrides);
  return mergeGeneratedOptions(
    {
      type: SectionTypeEnum.Code,
      id: "",
      name: "",
      isFrozen: resolved.defaults.isFrozen,
      isInOtherProjectConfigs: false,
      tagColor: resolved.defaults.tagColor,
      styleColor: resolved.defaults.styleColor,
      size: resolved.defaults.size,
      aspectRatio: resolved.defaults.aspectRatio,
      aspectRatioExtraHeight: 0,
      aspectRatioExtraWidth: 0,
      isMinimized: resolved.defaults.isMinimized,
      positionAndSizeLocked: resolved.defaults.positionAndSizeLocked,
      isPreset: false,
      children: [],
      code: resolved.defaults.code,
      codeLanguage: resolved.defaults.codeLanguage,
      codeFileBinding: resolved.defaults.codeFileBinding,
      attachedTerminalSectionId: resolved.defaults.attachedTerminalSectionId,
      diagnosticsIgnoreState: resolved.defaults.diagnosticsIgnoreState,
    },
    resolved.overrides,
  );
}

export function createUserDefaultTerminalSectionImpl(
  options: Partial<UserDefaultTerminalSectionImpl> = {},
): UserDefaultTerminalSectionImpl {
  return mergeGeneratedOptions(
    {
      ...createGeneratedBaseSectionDefaults(),
    },
    options,
  );
}

export function createTerminalSectionImpl(
  defaultsOrOverrides:
    | Partial<UserDefaultTerminalSectionImpl>
    | Partial<TerminalSectionImpl> = {},
  overrides?: Partial<TerminalSectionImpl>,
): TerminalSectionImpl {
  const resolved = resolveGeneratedFactoryInputs<
    UserDefaultTerminalSectionImpl,
    TerminalSectionImpl
  >(createUserDefaultTerminalSectionImpl(), defaultsOrOverrides, overrides);
  return mergeGeneratedOptions(
    {
      type: SectionTypeEnum.Terminal,
      id: "",
      name: "",
      isFrozen: resolved.defaults.isFrozen,
      isInOtherProjectConfigs: false,
      tagColor: resolved.defaults.tagColor,
      styleColor: resolved.defaults.styleColor,
      size: resolved.defaults.size,
      aspectRatio: resolved.defaults.aspectRatio,
      aspectRatioExtraHeight: 0,
      aspectRatioExtraWidth: 0,
      isMinimized: resolved.defaults.isMinimized,
      positionAndSizeLocked: resolved.defaults.positionAndSizeLocked,
      isPreset: false,
    },
    resolved.overrides,
  );
}

export function createUserDefaultChatSectionImpl(
  options: Partial<UserDefaultChatSectionImpl> = {},
): UserDefaultChatSectionImpl {
  return mergeGeneratedOptions(
    {
      ...createGeneratedBaseSectionDefaults(),
      size: {
        width: 400,
        height: 200,
      },
      managed: false,
      engineConfigId: null,
      transcriptionProfileId: null,
      agentProfileId: null,
      chatId: null,
      thinking: true,
      permissionMode: ChatPermissionModeEnum.minimal,
      searchEnabled: true,
      dictationMode: ChatDictationModeEnum.auto,
      messages: [],
      inputText: "",
      waitingForResponse: false,
      toolCallArguments: {},
      activeBranchId: null,
      branches: {},
    },
    options,
  );
}

export function createChatSectionImpl(
  defaultsOrOverrides:
    | Partial<UserDefaultChatSectionImpl>
    | Partial<ChatSectionImpl> = {},
  overrides?: Partial<ChatSectionImpl>,
): ChatSectionImpl {
  const resolved = resolveGeneratedFactoryInputs<
    UserDefaultChatSectionImpl,
    ChatSectionImpl
  >(createUserDefaultChatSectionImpl(), defaultsOrOverrides, overrides);
  return mergeGeneratedOptions(
    {
      type: SectionTypeEnum.Chat,
      id: "",
      name: "",
      isFrozen: resolved.defaults.isFrozen,
      isInOtherProjectConfigs: false,
      tagColor: resolved.defaults.tagColor,
      styleColor: resolved.defaults.styleColor,
      size: resolved.defaults.size,
      aspectRatio: resolved.defaults.aspectRatio,
      aspectRatioExtraHeight: 0,
      aspectRatioExtraWidth: 0,
      isMinimized: resolved.defaults.isMinimized,
      positionAndSizeLocked: resolved.defaults.positionAndSizeLocked,
      isPreset: false,
      managed: resolved.defaults.managed,
      engineConfigId: resolved.defaults.engineConfigId,
      transcriptionProfileId: resolved.defaults.transcriptionProfileId,
      agentProfileId: resolved.defaults.agentProfileId,
      chatId: resolved.defaults.chatId,
      thinking: resolved.defaults.thinking,
      permissionMode: resolved.defaults.permissionMode,
      searchEnabled: resolved.defaults.searchEnabled,
      dictationMode: resolved.defaults.dictationMode,
      messages: resolved.defaults.messages,
      inputText: resolved.defaults.inputText,
      waitingForResponse: resolved.defaults.waitingForResponse,
      toolCallArguments: resolved.defaults.toolCallArguments,
      activeBranchId: resolved.defaults.activeBranchId,
      branches: resolved.defaults.branches,
    },
    resolved.overrides,
  );
}

export function createUserDefaultBrowserSectionImpl(
  options: Partial<UserDefaultBrowserSectionImpl> = {},
): UserDefaultBrowserSectionImpl {
  return mergeGeneratedOptions(
    {
      ...createGeneratedBaseSectionDefaults(),
      size: {
        width: 720,
        height: 460,
      },
      folder: "",
      hideColumn: false,
      columnWidth: null,
      typesColumnWidth: null,
      viewMode: BrowserAreaViewModeEnum.list,
      savedSearches: [],
    },
    options,
  );
}

export function createBrowserSectionImpl(
  defaultsOrOverrides:
    | Partial<UserDefaultBrowserSectionImpl>
    | Partial<BrowserSectionImpl> = {},
  overrides?: Partial<BrowserSectionImpl>,
): BrowserSectionImpl {
  const resolved = resolveGeneratedFactoryInputs<
    UserDefaultBrowserSectionImpl,
    BrowserSectionImpl
  >(createUserDefaultBrowserSectionImpl(), defaultsOrOverrides, overrides);
  return mergeGeneratedOptions(
    {
      type: SectionTypeEnum.Browser,
      id: "",
      name: "",
      isFrozen: resolved.defaults.isFrozen,
      isInOtherProjectConfigs: false,
      tagColor: resolved.defaults.tagColor,
      styleColor: resolved.defaults.styleColor,
      size: resolved.defaults.size,
      aspectRatio: resolved.defaults.aspectRatio,
      aspectRatioExtraHeight: 0,
      aspectRatioExtraWidth: 0,
      isMinimized: resolved.defaults.isMinimized,
      positionAndSizeLocked: resolved.defaults.positionAndSizeLocked,
      isPreset: false,
      folder: resolved.defaults.folder,
      hideColumn: resolved.defaults.hideColumn,
      columnWidth: resolved.defaults.columnWidth,
      typesColumnWidth: resolved.defaults.typesColumnWidth,
      viewMode: resolved.defaults.viewMode,
      savedSearches: resolved.defaults.savedSearches,
    },
    resolved.overrides,
  );
}

export function createUserDefaultChartSectionImpl(
  options: Partial<UserDefaultChartSectionImpl> = {},
): UserDefaultChartSectionImpl {
  return mergeGeneratedOptions(
    {
      ...createGeneratedBaseSectionDefaults(),
      size: {
        width: 300,
        height: 300,
      },
      dataPath: "",
      chartSettings: createLineChartSettings(),
    },
    options,
  );
}

export function createChartSectionImpl(
  defaultsOrOverrides:
    | Partial<UserDefaultChartSectionImpl>
    | Partial<ChartSectionImpl> = {},
  overrides?: Partial<ChartSectionImpl>,
): ChartSectionImpl {
  const resolved = resolveGeneratedFactoryInputs<
    UserDefaultChartSectionImpl,
    ChartSectionImpl
  >(createUserDefaultChartSectionImpl(), defaultsOrOverrides, overrides);
  return mergeGeneratedOptions(
    {
      type: SectionTypeEnum.Chart,
      id: "",
      name: "",
      isFrozen: resolved.defaults.isFrozen,
      isInOtherProjectConfigs: false,
      tagColor: resolved.defaults.tagColor,
      styleColor: resolved.defaults.styleColor,
      size: resolved.defaults.size,
      aspectRatio: resolved.defaults.aspectRatio,
      aspectRatioExtraHeight: 0,
      aspectRatioExtraWidth: 0,
      isMinimized: resolved.defaults.isMinimized,
      positionAndSizeLocked: resolved.defaults.positionAndSizeLocked,
      isPreset: false,
      dataPath: resolved.defaults.dataPath,
      chartSettings: cloneGeneratedValue(resolved.defaults.chartSettings),
    },
    resolved.overrides,
  );
}

function resolveGeneratedTaskBoardColumns(
  columns: Array<TaskBoardColumn> | null | undefined,
): Array<TaskBoardColumn> {
  if (columns === null || columns === undefined) {
    return [];
  }
  return cloneGeneratedValue(columns);
}

export function createUserDefaultTaskBoardSectionImpl(
  options: Partial<UserDefaultTaskBoardSectionImpl> = {},
): UserDefaultTaskBoardSectionImpl {
  return mergeGeneratedOptions(
    {
      ...createGeneratedBaseSectionDefaults(),
      size: {
        width: 720,
        height: 430,
      },
      viewMode: TaskBoardViewModeEnum.kanban,
      columns: null,
      tasks: [],
    },
    options,
  );
}

export function createTaskBoardSectionImpl(
  defaultsOrOverrides:
    | Partial<UserDefaultTaskBoardSectionImpl>
    | Partial<TaskBoardSectionImpl> = {},
  overrides?: Partial<TaskBoardSectionImpl>,
): TaskBoardSectionImpl {
  const resolved = resolveGeneratedFactoryInputs<
    UserDefaultTaskBoardSectionImpl,
    TaskBoardSectionImpl
  >(createUserDefaultTaskBoardSectionImpl(), defaultsOrOverrides, overrides);
  const normalizedOverrides: Partial<TaskBoardSectionImpl> = {
    ...resolved.overrides,
  };
  if (normalizedOverrides.columns === undefined) {
    delete normalizedOverrides.columns;
  }
  if (normalizedOverrides.tasks === undefined) {
    delete normalizedOverrides.tasks;
  }
  return mergeGeneratedOptions(
    {
      type: SectionTypeEnum.TaskBoard,
      id: "",
      name: "",
      isFrozen: resolved.defaults.isFrozen,
      isInOtherProjectConfigs: false,
      tagColor: resolved.defaults.tagColor,
      styleColor: resolved.defaults.styleColor,
      size: resolved.defaults.size,
      aspectRatio: resolved.defaults.aspectRatio,
      aspectRatioExtraHeight: 0,
      aspectRatioExtraWidth: 0,
      isMinimized: resolved.defaults.isMinimized,
      positionAndSizeLocked: resolved.defaults.positionAndSizeLocked,
      isPreset: false,
      viewMode: resolved.defaults.viewMode,
      columns: resolveGeneratedTaskBoardColumns(resolved.defaults.columns),
      tasks: resolved.defaults.tasks,
    },
    normalizedOverrides,
  );
}

export function createUserDefaultSpreadsheetSectionImpl(
  options: Partial<UserDefaultSpreadsheetSectionImpl> = {},
): UserDefaultSpreadsheetSectionImpl {
  return mergeGeneratedOptions(
    {
      ...createGeneratedBaseSectionDefaults(),
      size: {
        width: 760,
        height: 500,
      },
      filePath: "",
      activeSheet: null,
      readOnly: false,
      showRowNumbers: true,
      density: SpreadsheetGridDensityEnum.compact,
      autoReloadOnExternalChange: false,
    },
    options,
  );
}

export function createSpreadsheetSectionImpl(
  defaultsOrOverrides:
    | Partial<UserDefaultSpreadsheetSectionImpl>
    | Partial<SpreadsheetSectionImpl> = {},
  overrides?: Partial<SpreadsheetSectionImpl>,
): SpreadsheetSectionImpl {
  const resolved = resolveGeneratedFactoryInputs<
    UserDefaultSpreadsheetSectionImpl,
    SpreadsheetSectionImpl
  >(createUserDefaultSpreadsheetSectionImpl(), defaultsOrOverrides, overrides);
  return mergeGeneratedOptions(
    {
      type: SectionTypeEnum.Spreadsheet,
      id: "",
      name: "",
      isFrozen: resolved.defaults.isFrozen,
      isInOtherProjectConfigs: false,
      tagColor: resolved.defaults.tagColor,
      styleColor: resolved.defaults.styleColor,
      size: resolved.defaults.size,
      aspectRatio: resolved.defaults.aspectRatio,
      aspectRatioExtraHeight: 0,
      aspectRatioExtraWidth: 0,
      isMinimized: resolved.defaults.isMinimized,
      positionAndSizeLocked: resolved.defaults.positionAndSizeLocked,
      isPreset: false,
      filePath: resolved.defaults.filePath,
      activeSheet: resolved.defaults.activeSheet,
      readOnly: resolved.defaults.readOnly,
      showRowNumbers: resolved.defaults.showRowNumbers,
      density: resolved.defaults.density,
      autoReloadOnExternalChange: resolved.defaults.autoReloadOnExternalChange,
    },
    resolved.overrides,
  );
}

export type SharePolicy = {
  allowParamChanges: boolean;
  allowVariantChanges: boolean;
  allowLayoutChanges: boolean;
  allowRun: boolean;
  allowLLM: boolean;
  allowExternalLinks: boolean;
  allowFileDownloads: boolean;
  allowMultipleRuns: boolean;
  runSnapshotMode: RunSnapshotMode;
};
export function createSharePolicy(
  options: Partial<SharePolicy> = {},
): SharePolicy {
  return mergeGeneratedOptions(
    {
      allowParamChanges: true,
      allowVariantChanges: true,
      allowLayoutChanges: true,
      allowRun: false,
      allowLLM: false,
      allowExternalLinks: false,
      allowFileDownloads: false,
      allowMultipleRuns: true,
      runSnapshotMode: RunSnapshotModeEnum.ephemeral,
    },
    options,
  );
}

export type SettingsShortcuts = {
  newCardShortcut: string;
  newGroupShortcut: string;
  typeCheckShortcut: string;
  newProjectConfigShortcut: string;
  undoShortcut: string;
  redoShortcut: string;
  groupShortcut: string;
  ungroupShortcut: string;
  saveShortcut: string;
  saveAsShortcut: string;
  loadShortcut: string;
  searchShortcut: string;
  advancedSearchShortcut: string;
  commandPaletteShortcut: string;
  resetZoomShortcut: string;
  copyShortcut: string;
  pasteShortcut: string;
  pasteAsRefShortcut: string;
  sortingShortcut: string;
  movingFreeShortcut: string;
  showTooltipShortcut: string;
  tooltipToPlaintextShortcut: string;
  tooltipToMarkdownShortcut: string;
  freezeTooltipShortcut: string;
  frozenTooltipToPlaintextShortcut: string;
  frozenTooltipToMarkdownShortcut: string;
  incrementTooltipPageShortcut: string;
  decrementTooltipPageShortcut: string;
  copyTooltipTextShortcut: string;
  frozenTooltipIncrementShortcut: string;
  frozenTooltipDecrementShortcut: string;
  frozenTooltipCopyShortcut: string;
  newTerminalShortcut: string;
  fitViewShortcut: string;
  zoomToMouseShortcut: string;
  deleteSectionShortcut: string;
  selectAll: string;
  selectTopLevelNonGroupSections: string;
  showVersionsTabShortcut: string;
  showParamUITypeTabShortcut: string;
  showProjectOverviewTabShortcut: string;
  focusHeaderShortcut: string;
  focusOverviewShortcut: string;
  focusCanvasShortcut: string;
  focusUiEditorShortcut: string;
  nextTopLevelSectionShortcut: string;
  prevTopLevelSectionShortcut: string;
  runCodeShortcut: string;
  runEntryCodeBlockShortcut: string;
  paramSelect: string;
  paramIndentShortcut: string;
  paramUnindentShortcut: string;
  paramMoveUpShortcut: string;
  paramMoveDownShortcut: string;
  formatCode: string;
  selectionKeyCode: string;
  multiSelectionKeyCode: string;
  panActivationKeyCode: string;
  zoomActivationKeyCode: string;
  zoomInShortcut: string;
  zoomOutShortcut: string;
  restartLanguageServerShortcut: string;
};
export function createSettingsShortcuts(
  options: Partial<SettingsShortcuts> = {},
): SettingsShortcuts {
  return mergeGeneratedOptions(
    {
      newCardShortcut: "N",
      newGroupShortcut: "G",
      typeCheckShortcut: "",
      newProjectConfigShortcut: "",
      undoShortcut: "Mod + Z",
      redoShortcut: "Mod + Shift + Z",
      groupShortcut: "Mod + G",
      ungroupShortcut: "Shift + Mod + G",
      saveShortcut: "Mod + S",
      saveAsShortcut: "Mod + Shift + S",
      loadShortcut: "Mod + L",
      searchShortcut: "Mod + K",
      advancedSearchShortcut: "Mod + P",
      commandPaletteShortcut: "Mod + Shift + P",
      resetZoomShortcut: "Mod + Comma",
      copyShortcut: "Mod + C",
      pasteShortcut: "Mod + V",
      pasteAsRefShortcut: "Mod + Shift + V",
      sortingShortcut: "Mod + Alt",
      movingFreeShortcut: "Alt",
      showTooltipShortcut: "Q",
      tooltipToPlaintextShortcut: "Q + S",
      tooltipToMarkdownShortcut: "Q + W",
      freezeTooltipShortcut: "Q + F",
      frozenTooltipToPlaintextShortcut: "S",
      frozenTooltipToMarkdownShortcut: "W",
      incrementTooltipPageShortcut: "Q + ArrowRight",
      decrementTooltipPageShortcut: "Q + ArrowLeft",
      copyTooltipTextShortcut: "Q + C",
      frozenTooltipIncrementShortcut: "ArrowRight",
      frozenTooltipDecrementShortcut: "ArrowLeft",
      frozenTooltipCopyShortcut: "C",
      newTerminalShortcut: "Ctrl + \u0060",
      fitViewShortcut: "F",
      zoomToMouseShortcut: "Z",
      deleteSectionShortcut: "Backspace",
      selectAll: "Mod + A",
      selectTopLevelNonGroupSections: "Mod + Shift + A",
      showVersionsTabShortcut: "V",
      showParamUITypeTabShortcut: "P",
      showProjectOverviewTabShortcut: "O",
      focusHeaderShortcut: "Ctrl + Shift + 1",
      focusOverviewShortcut: "Ctrl + Shift + 2",
      focusCanvasShortcut: "Ctrl + Shift + 3",
      focusUiEditorShortcut: "Ctrl + Shift + 4",
      nextTopLevelSectionShortcut: "Alt + J",
      prevTopLevelSectionShortcut: "Alt + K",
      runCodeShortcut: "Mod + Enter",
      runEntryCodeBlockShortcut: "Mod + Shift + Enter",
      paramSelect: "Mod + Shift",
      paramIndentShortcut: "Tab",
      paramUnindentShortcut: "Shift + Tab",
      paramMoveUpShortcut: "Alt + ArrowUp",
      paramMoveDownShortcut: "Alt + ArrowDown",
      formatCode: "Shift + Alt + F",
      selectionKeyCode: "Shift",
      multiSelectionKeyCode: "Mod",
      panActivationKeyCode: "Space",
      zoomActivationKeyCode: "Mod",
      zoomInShortcut: "Equal",
      zoomOutShortcut: "Minus",
      restartLanguageServerShortcut: "Alt + Shift + R",
    },
    options,
  );
}

export type SettingsGUI = {
  snapGrid: [number, number];
  showGridLines: boolean;
  gridPattern: BackgroundVariant;
  gridPatternSize: number;
  gridColor: string;
  gridColorDarkMode: string;
  wireColor: string;
  wireColorDarkMode: string;
  defaultZoomLevel: number;
  minZoom: number;
  maxZoom: number;
  panOnDrag: boolean;
  panOnScroll: boolean;
  panOnScrollSpeed: number;
  panOnScrollMode: PanOnScrollMode;
  zoomOnScroll: boolean;
  zoomOnPinch: boolean;
  zoomOnDoubleClick: boolean;
  selectionMode: SelectionMode;
  leftSidePaneShiftsMap: boolean;
  transitionDuration: number;
  sectionTagColorChoices: Array<{
    color: string;
    description: string;
  }>;
};
export function createSettingsGUI(
  options: Partial<SettingsGUI> = {},
): SettingsGUI {
  return mergeGeneratedOptions(
    {
      snapGrid: [15, 15],
      showGridLines: true,
      gridPattern: BackgroundVariantEnum.dots,
      gridPatternSize: 2,
      gridColor: "#afbacf",
      gridColorDarkMode: "#2b364a",
      wireColor: "#41506c",
      wireColorDarkMode: "#bac2d3",
      defaultZoomLevel: 1.0,
      minZoom: 0.1,
      maxZoom: 10.0,
      panOnDrag: true,
      panOnScroll: true,
      panOnScrollSpeed: 1.0,
      panOnScrollMode: PanOnScrollModeEnum.free,
      zoomOnScroll: true,
      zoomOnPinch: true,
      zoomOnDoubleClick: false,
      selectionMode: SelectionModeEnum.partial,
      leftSidePaneShiftsMap: true,
      transitionDuration: 50,
      sectionTagColorChoices: [
        { color: "#ef4444", description: "Red" },
        { color: "#f97316", description: "Orange" },
        { color: "#eab308", description: "Yellow" },
        { color: "#22c55e", description: "Green" },
        { color: "#06b6d4", description: "Cyan" },
        { color: "#3b82f6", description: "Blue" },
        { color: "#a855f7", description: "Purple" },
        { color: "#64748b", description: "Slate" },
      ],
    },
    options,
  );
}

export type SettingsBackend = {
  showDefaultConfigOnLoad: boolean;
  autosave: boolean;
  autobackup: boolean;
  autobackupFreq: number;
  autobackupKeepLastN: number;
  clearTerminalBeforeMarkingAsReady: boolean;
  defaultTerminalShell?: string | null;
  exportDbReadableOnSave: boolean;
  exportDbReadableWithVariantsOnSave: boolean;
  autoRefetchCallableParamsOnLspMismatch: boolean;
  renameRefactorMode: RenameRefactorMode;
  saveRenderedValues: boolean;
  runSnapshotMode: RunSnapshotMode;
  completionGuardEnabled: boolean;
};
export function createSettingsBackend(
  options: Partial<SettingsBackend> = {},
): SettingsBackend {
  return mergeGeneratedOptions(
    {
      showDefaultConfigOnLoad: true,
      autosave: true,
      autobackup: true,
      autobackupFreq: 300,
      autobackupKeepLastN: 10,
      clearTerminalBeforeMarkingAsReady: true,
      defaultTerminalShell: null,
      exportDbReadableOnSave: false,
      exportDbReadableWithVariantsOnSave: false,
      autoRefetchCallableParamsOnLspMismatch: true,
      renameRefactorMode: RenameRefactorModeEnum.ALWAYS_ASK,
      saveRenderedValues: false,
      runSnapshotMode: RunSnapshotModeEnum.ephemeral,
      completionGuardEnabled: false,
    },
    options,
  );
}

export type SectionSizingPolicyTypeEntry = {
  minHeight: number;
  maxHeight: number;
  minWidth: number;
  maxWidth: number;
};

export type SectionSizingPolicyCallableTypeEntry =
  SectionSizingPolicyTypeEntry & {
    hideSearchMinHeight: number;
    hideParamsMinHeight: number;
  };

export type MetaControlSizingPolicyTypeEntry = {
  minHeight: number;
  minWidth: number;
  sizeModeHeight: MetaControlSizeMode;
  sizeModeWidth: MetaControlSizeMode;
};

export type MetaControlSizingPolicyByType = {
  CodeCallable: MetaControlSizingPolicyTypeEntry;
  CodeParam: MetaControlSizingPolicyTypeEntry;
  TextParam: MetaControlSizingPolicyTypeEntry;
  DateParam: MetaControlSizingPolicyTypeEntry;
  TimeParam: MetaControlSizingPolicyTypeEntry;
  ButtonParam: MetaControlSizingPolicyTypeEntry;
  SliderParam: MetaControlSizingPolicyTypeEntry;
  RotaryParam: MetaControlSizingPolicyTypeEntry;
  SwitchParam: MetaControlSizingPolicyTypeEntry;
  ColorPickerParam: MetaControlSizingPolicyTypeEntry;
  DropdownParam: MetaControlSizingPolicyTypeEntry;
  PasswordParam: MetaControlSizingPolicyTypeEntry;
  TextAreaParam: MetaControlSizingPolicyTypeEntry;
  DropzoneParam: MetaControlSizingPolicyTypeEntry;
  NestedParam: MetaControlSizingPolicyTypeEntry;
};
export function createMetaControlSizingPolicyByType(
  options: Partial<MetaControlSizingPolicyByType> = {},
): MetaControlSizingPolicyByType {
  return {
    ...mergeGeneratedOptions<MetaControlSizingPolicyByType>(
      {
        CodeCallable: {
          minHeight: 32,
          minWidth: 200,
          sizeModeHeight: MetaControlSizeModeEnum.any,
          sizeModeWidth: MetaControlSizeModeEnum.any,
        },
        CodeParam: {
          minHeight: 32,
          minWidth: 200,
          sizeModeHeight: MetaControlSizeModeEnum.any,
          sizeModeWidth: MetaControlSizeModeEnum.any,
        },
        TextParam: {
          minHeight: 32,
          minWidth: 200,
          sizeModeHeight: MetaControlSizeModeEnum.any,
          sizeModeWidth: MetaControlSizeModeEnum.any,
        },
        DateParam: {
          minHeight: 32,
          minWidth: 200,
          sizeModeHeight: MetaControlSizeModeEnum.any,
          sizeModeWidth: MetaControlSizeModeEnum.any,
        },
        TimeParam: {
          minHeight: 32,
          minWidth: 200,
          sizeModeHeight: MetaControlSizeModeEnum.any,
          sizeModeWidth: MetaControlSizeModeEnum.any,
        },
        ButtonParam: {
          minHeight: 32,
          minWidth: 200,
          sizeModeHeight: MetaControlSizeModeEnum.any,
          sizeModeWidth: MetaControlSizeModeEnum.any,
        },
        SliderParam: {
          minHeight: 32,
          minWidth: 200,
          sizeModeHeight: MetaControlSizeModeEnum.auto_only,
          sizeModeWidth: MetaControlSizeModeEnum.any,
        },
        RotaryParam: {
          minHeight: 32,
          minWidth: 200,
          sizeModeHeight: MetaControlSizeModeEnum.any,
          sizeModeWidth: MetaControlSizeModeEnum.any,
        },
        SwitchParam: {
          minHeight: 32,
          minWidth: 200,
          sizeModeHeight: MetaControlSizeModeEnum.any,
          sizeModeWidth: MetaControlSizeModeEnum.any,
        },
        ColorPickerParam: {
          minHeight: 32,
          minWidth: 200,
          sizeModeHeight: MetaControlSizeModeEnum.any,
          sizeModeWidth: MetaControlSizeModeEnum.any,
        },
        DropdownParam: {
          minHeight: 32,
          minWidth: 200,
          sizeModeHeight: MetaControlSizeModeEnum.auto_only,
          sizeModeWidth: MetaControlSizeModeEnum.any,
        },
        PasswordParam: {
          minHeight: 32,
          minWidth: 200,
          sizeModeHeight: MetaControlSizeModeEnum.auto_only,
          sizeModeWidth: MetaControlSizeModeEnum.any,
        },
        TextAreaParam: {
          minHeight: 80,
          minWidth: 200,
          sizeModeHeight: MetaControlSizeModeEnum.any,
          sizeModeWidth: MetaControlSizeModeEnum.any,
        },
        DropzoneParam: {
          minHeight: 120,
          minWidth: 240,
          sizeModeHeight: MetaControlSizeModeEnum.any,
          sizeModeWidth: MetaControlSizeModeEnum.any,
        },
        NestedParam: {
          minHeight: 32,
          minWidth: 200,
          sizeModeHeight: MetaControlSizeModeEnum.any,
          sizeModeWidth: MetaControlSizeModeEnum.any,
        },
      },
      options,
    ),
    CodeCallable: mergeGeneratedOptions<MetaControlSizingPolicyTypeEntry>(
      {
        minHeight: 32,
        minWidth: 200,
        sizeModeHeight: MetaControlSizeModeEnum.any,
        sizeModeWidth: MetaControlSizeModeEnum.any,
      },
      options.CodeCallable ?? {},
    ),
    CodeParam: mergeGeneratedOptions<MetaControlSizingPolicyTypeEntry>(
      {
        minHeight: 32,
        minWidth: 200,
        sizeModeHeight: MetaControlSizeModeEnum.any,
        sizeModeWidth: MetaControlSizeModeEnum.any,
      },
      options.CodeParam ?? {},
    ),
    TextParam: mergeGeneratedOptions<MetaControlSizingPolicyTypeEntry>(
      {
        minHeight: 32,
        minWidth: 200,
        sizeModeHeight: MetaControlSizeModeEnum.any,
        sizeModeWidth: MetaControlSizeModeEnum.any,
      },
      options.TextParam ?? {},
    ),
    DateParam: mergeGeneratedOptions<MetaControlSizingPolicyTypeEntry>(
      {
        minHeight: 32,
        minWidth: 200,
        sizeModeHeight: MetaControlSizeModeEnum.any,
        sizeModeWidth: MetaControlSizeModeEnum.any,
      },
      options.DateParam ?? {},
    ),
    TimeParam: mergeGeneratedOptions<MetaControlSizingPolicyTypeEntry>(
      {
        minHeight: 32,
        minWidth: 200,
        sizeModeHeight: MetaControlSizeModeEnum.any,
        sizeModeWidth: MetaControlSizeModeEnum.any,
      },
      options.TimeParam ?? {},
    ),
    ButtonParam: mergeGeneratedOptions<MetaControlSizingPolicyTypeEntry>(
      {
        minHeight: 32,
        minWidth: 200,
        sizeModeHeight: MetaControlSizeModeEnum.any,
        sizeModeWidth: MetaControlSizeModeEnum.any,
      },
      options.ButtonParam ?? {},
    ),
    SliderParam: mergeGeneratedOptions<MetaControlSizingPolicyTypeEntry>(
      {
        minHeight: 32,
        minWidth: 200,
        sizeModeHeight: MetaControlSizeModeEnum.auto_only,
        sizeModeWidth: MetaControlSizeModeEnum.any,
      },
      options.SliderParam ?? {},
    ),
    RotaryParam: mergeGeneratedOptions<MetaControlSizingPolicyTypeEntry>(
      {
        minHeight: 32,
        minWidth: 200,
        sizeModeHeight: MetaControlSizeModeEnum.any,
        sizeModeWidth: MetaControlSizeModeEnum.any,
      },
      options.RotaryParam ?? {},
    ),
    SwitchParam: mergeGeneratedOptions<MetaControlSizingPolicyTypeEntry>(
      {
        minHeight: 32,
        minWidth: 200,
        sizeModeHeight: MetaControlSizeModeEnum.any,
        sizeModeWidth: MetaControlSizeModeEnum.any,
      },
      options.SwitchParam ?? {},
    ),
    ColorPickerParam: mergeGeneratedOptions<MetaControlSizingPolicyTypeEntry>(
      {
        minHeight: 32,
        minWidth: 200,
        sizeModeHeight: MetaControlSizeModeEnum.any,
        sizeModeWidth: MetaControlSizeModeEnum.any,
      },
      options.ColorPickerParam ?? {},
    ),
    DropdownParam: mergeGeneratedOptions<MetaControlSizingPolicyTypeEntry>(
      {
        minHeight: 32,
        minWidth: 200,
        sizeModeHeight: MetaControlSizeModeEnum.auto_only,
        sizeModeWidth: MetaControlSizeModeEnum.any,
      },
      options.DropdownParam ?? {},
    ),
    PasswordParam: mergeGeneratedOptions<MetaControlSizingPolicyTypeEntry>(
      {
        minHeight: 32,
        minWidth: 200,
        sizeModeHeight: MetaControlSizeModeEnum.auto_only,
        sizeModeWidth: MetaControlSizeModeEnum.any,
      },
      options.PasswordParam ?? {},
    ),
    TextAreaParam: mergeGeneratedOptions<MetaControlSizingPolicyTypeEntry>(
      {
        minHeight: 80,
        minWidth: 200,
        sizeModeHeight: MetaControlSizeModeEnum.any,
        sizeModeWidth: MetaControlSizeModeEnum.any,
      },
      options.TextAreaParam ?? {},
    ),
    DropzoneParam: mergeGeneratedOptions<MetaControlSizingPolicyTypeEntry>(
      {
        minHeight: 120,
        minWidth: 240,
        sizeModeHeight: MetaControlSizeModeEnum.any,
        sizeModeWidth: MetaControlSizeModeEnum.any,
      },
      options.DropzoneParam ?? {},
    ),
    NestedParam: mergeGeneratedOptions<MetaControlSizingPolicyTypeEntry>(
      {
        minHeight: 32,
        minWidth: 200,
        sizeModeHeight: MetaControlSizeModeEnum.any,
        sizeModeWidth: MetaControlSizeModeEnum.any,
      },
      options.NestedParam ?? {},
    ),
  };
}

export type SectionSizingPolicyGlobals = {
  pinnedParamsAreaMinHeight: number;
  unpinnedParamsAreaMinHeight: number;
  minimizedHeight: number;
  infiniteMaxHeight: number;
  infiniteMaxWidth: number;
  autoMaxHeight: number;
};
export function createSectionSizingPolicyGlobals(
  options: Partial<SectionSizingPolicyGlobals> = {},
): SectionSizingPolicyGlobals {
  return mergeGeneratedOptions(
    {
      pinnedParamsAreaMinHeight: 64,
      unpinnedParamsAreaMinHeight: 36,
      minimizedHeight: 32,
      infiniteMaxHeight: 100000,
      infiniteMaxWidth: 100000,
      autoMaxHeight: 350,
    },
    options,
  );
}

export type SectionSizingPolicyByType = {
  Callable: SectionSizingPolicyCallableTypeEntry;
  Dict: SectionSizingPolicyTypeEntry;
  ListRoot: SectionSizingPolicyTypeEntry;
  Group: SectionSizingPolicyTypeEntry;
  Image: SectionSizingPolicyTypeEntry;
  Chart: SectionSizingPolicyTypeEntry;
  Draw: SectionSizingPolicyTypeEntry;
  Prompt: SectionSizingPolicyTypeEntry;
  TextBlock: SectionSizingPolicyTypeEntry;
  MetaControl: SectionSizingPolicyTypeEntry;
  Social: SectionSizingPolicyTypeEntry;
  GlobalVariables: SectionSizingPolicyTypeEntry;
  Code: SectionSizingPolicyTypeEntry;
  GenPythonCode: SectionSizingPolicyTypeEntry;
  GenPythonMetadata: SectionSizingPolicyTypeEntry;
  Terminal: SectionSizingPolicyTypeEntry;
  IFrame: SectionSizingPolicyTypeEntry;
  Chat: SectionSizingPolicyTypeEntry;
  Browser: SectionSizingPolicyTypeEntry;
  Plugin: SectionSizingPolicyTypeEntry;
  TaskBoard: SectionSizingPolicyTypeEntry;
  Spreadsheet: SectionSizingPolicyTypeEntry;
};
export function createSectionSizingPolicyByType(
  options: Partial<SectionSizingPolicyByType> = {},
): SectionSizingPolicyByType {
  return {
    ...mergeGeneratedOptions(
      {
        Callable: {
          minHeight: 104,
          maxHeight: 100000,
          minWidth: 200,
          maxWidth: 100000,
          hideSearchMinHeight: 42,
          hideParamsMinHeight: 90,
        },
        Dict: {
          minHeight: 78,
          maxHeight: 100000,
          minWidth: 200,
          maxWidth: 100000,
        },
        ListRoot: {
          minHeight: 50,
          maxHeight: 50,
          minWidth: 200,
          maxWidth: 100000,
        },
        Group: {
          minHeight: 0,
          maxHeight: 100000,
          minWidth: 200,
          maxWidth: 100000,
        },
        Image: {
          minHeight: 100,
          maxHeight: 100000,
          minWidth: 200,
          maxWidth: 100000,
        },
        Chart: {
          minHeight: 300,
          maxHeight: 100000,
          minWidth: 300,
          maxWidth: 100000,
        },
        Draw: {
          minHeight: 100,
          maxHeight: 100000,
          minWidth: 402,
          maxWidth: 100000,
        },
        Prompt: {
          minHeight: 150,
          maxHeight: 100000,
          minWidth: 300,
          maxWidth: 100000,
        },
        TextBlock: {
          minHeight: 49,
          maxHeight: 100000,
          minWidth: 100,
          maxWidth: 100000,
        },
        MetaControl: {
          minHeight: 10,
          maxHeight: 100000,
          minWidth: 100,
          maxWidth: 100000,
        },
        Social: {
          minHeight: 50,
          maxHeight: 100000,
          minWidth: 200,
          maxWidth: 100000,
        },
        GlobalVariables: {
          minHeight: 78,
          maxHeight: 100000,
          minWidth: 200,
          maxWidth: 100000,
        },
        Code: {
          minHeight: 58.2,
          maxHeight: 100000,
          minWidth: 200,
          maxWidth: 100000,
        },
        GenPythonCode: {
          minHeight: 0,
          maxHeight: 100000,
          minWidth: 200,
          maxWidth: 100000,
        },
        GenPythonMetadata: {
          minHeight: 0,
          maxHeight: 100000,
          minWidth: 200,
          maxWidth: 100000,
        },
        Terminal: {
          minHeight: 100,
          maxHeight: 100000,
          minWidth: 200,
          maxWidth: 100000,
        },
        IFrame: {
          minHeight: 0,
          maxHeight: 100000,
          minWidth: 200,
          maxWidth: 100000,
        },
        Chat: {
          minHeight: 200,
          maxHeight: 100000,
          minWidth: 400,
          maxWidth: 100000,
        },
        Browser: {
          minHeight: 250,
          maxHeight: 100000,
          minWidth: 200,
          maxWidth: 100000,
        },
        Plugin: {
          minHeight: 80,
          maxHeight: 100000,
          minWidth: 200,
          maxWidth: 100000,
        },
        TaskBoard: {
          minHeight: 240,
          maxHeight: 100000,
          minWidth: 360,
          maxWidth: 100000,
        },
        Spreadsheet: {
          minHeight: 260,
          maxHeight: 100000,
          minWidth: 420,
          maxWidth: 100000,
        },
      },
      options,
    ),
    Callable: mergeGeneratedOptions(
      {
        minHeight: 104,
        maxHeight: 100000,
        minWidth: 200,
        maxWidth: 100000,
        hideSearchMinHeight: 42,
        hideParamsMinHeight: 90,
      },
      options.Callable ?? {},
    ),
    Dict: mergeGeneratedOptions(
      {
        minHeight: 78,
        maxHeight: 100000,
        minWidth: 200,
        maxWidth: 100000,
      },
      options.Dict ?? {},
    ),
    ListRoot: mergeGeneratedOptions(
      {
        minHeight: 50,
        maxHeight: 50,
        minWidth: 200,
        maxWidth: 100000,
      },
      options.ListRoot ?? {},
    ),
    Group: mergeGeneratedOptions(
      {
        minHeight: 0,
        maxHeight: 100000,
        minWidth: 200,
        maxWidth: 100000,
      },
      options.Group ?? {},
    ),
    Image: mergeGeneratedOptions(
      {
        minHeight: 100,
        maxHeight: 100000,
        minWidth: 200,
        maxWidth: 100000,
      },
      options.Image ?? {},
    ),
    Chart: mergeGeneratedOptions(
      {
        minHeight: 300,
        maxHeight: 100000,
        minWidth: 300,
        maxWidth: 100000,
      },
      options.Chart ?? {},
    ),
    Draw: mergeGeneratedOptions(
      {
        minHeight: 100,
        maxHeight: 100000,
        minWidth: 402,
        maxWidth: 100000,
      },
      options.Draw ?? {},
    ),
    Prompt: mergeGeneratedOptions(
      {
        minHeight: 150,
        maxHeight: 100000,
        minWidth: 300,
        maxWidth: 100000,
      },
      options.Prompt ?? {},
    ),
    TextBlock: mergeGeneratedOptions(
      {
        minHeight: 49,
        maxHeight: 100000,
        minWidth: 100,
        maxWidth: 100000,
      },
      options.TextBlock ?? {},
    ),
    MetaControl: mergeGeneratedOptions(
      {
        minHeight: 10,
        maxHeight: 100000,
        minWidth: 100,
        maxWidth: 100000,
      },
      options.MetaControl ?? {},
    ),
    Social: mergeGeneratedOptions(
      {
        minHeight: 50,
        maxHeight: 100000,
        minWidth: 200,
        maxWidth: 100000,
      },
      options.Social ?? {},
    ),
    GlobalVariables: mergeGeneratedOptions(
      {
        minHeight: 78,
        maxHeight: 100000,
        minWidth: 200,
        maxWidth: 100000,
      },
      options.GlobalVariables ?? {},
    ),
    Code: mergeGeneratedOptions(
      {
        minHeight: 58.2,
        maxHeight: 100000,
        minWidth: 200,
        maxWidth: 100000,
      },
      options.Code ?? {},
    ),
    GenPythonCode: mergeGeneratedOptions(
      {
        minHeight: 0,
        maxHeight: 100000,
        minWidth: 200,
        maxWidth: 100000,
      },
      options.GenPythonCode ?? {},
    ),
    GenPythonMetadata: mergeGeneratedOptions(
      {
        minHeight: 0,
        maxHeight: 100000,
        minWidth: 200,
        maxWidth: 100000,
      },
      options.GenPythonMetadata ?? {},
    ),
    Terminal: mergeGeneratedOptions(
      {
        minHeight: 100,
        maxHeight: 100000,
        minWidth: 200,
        maxWidth: 100000,
      },
      options.Terminal ?? {},
    ),
    IFrame: mergeGeneratedOptions(
      {
        minHeight: 0,
        maxHeight: 100000,
        minWidth: 200,
        maxWidth: 100000,
      },
      options.IFrame ?? {},
    ),
    Chat: mergeGeneratedOptions(
      {
        minHeight: 200,
        maxHeight: 100000,
        minWidth: 400,
        maxWidth: 100000,
      },
      options.Chat ?? {},
    ),
    Browser: mergeGeneratedOptions(
      {
        minHeight: 250,
        maxHeight: 100000,
        minWidth: 200,
        maxWidth: 100000,
      },
      options.Browser ?? {},
    ),
    Plugin: mergeGeneratedOptions(
      {
        minHeight: 80,
        maxHeight: 100000,
        minWidth: 200,
        maxWidth: 100000,
      },
      options.Plugin ?? {},
    ),
    TaskBoard: mergeGeneratedOptions(
      {
        minHeight: 240,
        maxHeight: 100000,
        minWidth: 360,
        maxWidth: 100000,
      },
      options.TaskBoard ?? {},
    ),
    Spreadsheet: mergeGeneratedOptions(
      {
        minHeight: 260,
        maxHeight: 100000,
        minWidth: 420,
        maxWidth: 100000,
      },
      options.Spreadsheet ?? {},
    ),
  };
}

export type SectionSizingPolicy = {
  byType: SectionSizingPolicyByType;
  metaControlByType: MetaControlSizingPolicyByType;
  globals: SectionSizingPolicyGlobals;
};
export function createSectionSizingPolicy(
  options: Partial<SectionSizingPolicy> = {},
): SectionSizingPolicy {
  const byType = createSectionSizingPolicyByType(options.byType ?? {});
  const metaControlByType = createMetaControlSizingPolicyByType(
    options.metaControlByType ?? {},
  );
  const globals = createSectionSizingPolicyGlobals(options.globals ?? {});
  return {
    ...mergeGeneratedOptions(
      {
        byType,
        metaControlByType,
        globals,
      },
      options,
    ),
    byType,
    metaControlByType,
    globals,
  };
}

export type SettingsState = {
  shortcuts: SettingsShortcuts;
  gui: SettingsGUI;
  backend: SettingsBackend;
  sectionSizingPolicy: SectionSizingPolicy;
  languageServer: Record<string, unknown>;
};
export function createSettingsState(
  options: Partial<SettingsState> = {},
): SettingsState {
  const shortcuts = createSettingsShortcuts(options.shortcuts ?? {});
  const gui = createSettingsGUI(options.gui ?? {});
  const backend = createSettingsBackend(options.backend ?? {});
  const sectionSizingPolicy = createSectionSizingPolicy(
    options.sectionSizingPolicy ?? {},
  );
  const defaults: SettingsState = {
    shortcuts,
    gui,
    backend,
    sectionSizingPolicy,
    languageServer: {
      basedpyright: {
        analysis: {
          diagnosticSeverityOverrides: {
            reportUnknownVariableType: "none",
            reportUnknownMemberType: "none",
            reportUnannotatedClassAttribute: "none",
            reportSelfClsParameterName: "none",
          },
        },
      },
    },
  };
  return {
    ...mergeGeneratedOptions(defaults, options),
    shortcuts,
    gui,
    backend,
    sectionSizingPolicy,
    languageServer: cloneGeneratedValue(
      options.languageServer ?? defaults.languageServer,
    ),
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

export type BaseDictSectionImplUnion = BaseSectionImpl & {
  type: typeof SectionTypeEnum.Dict | typeof SectionTypeEnum.GlobalVariables;
  codeObjVariantMap: Record<string, string>;
  hideUnpinnedParams: boolean;
  paramFilter: string;
  columnWidth: number | null;
  configLanguage: string;
  pinnedParams: Array<string>;
  selectedParams: Array<string>;
  ignoreTypeErrors: TypeErrorIgnoreState;
  edgeInputParams: Array<string>;
  edgeOutputPorts: Array<EdgePort>;
  topLevelParamId: string | null;
  isJsonSource: boolean;
  jsonSourceKeys: Array<string>;
  jsonSourceMissing: boolean;
};

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

const pluginListEntryRawTS = `
export type PluginListEntry = {
  pluginId: string;
  name: string;
  version: string;
  sourceScope: PluginScope;
  sourceScopeLabel: string;
  sourceManager: PluginSourceManager;
  sourceManagerHint: string | null;
  canonicalSourceKey: string;
  sourceDigestSha256: string | null;
  frontend: PluginFrontendDescriptor;
  content: PluginContentDescriptor;
  config: PluginConfigDescriptor;
  effectiveCapabilities: Array<string>;
  enablementSource: PluginEnablementSource | null;
  restartRequired: boolean;
};
export function createPluginListEntry(
  options: Partial<PluginListEntry> = {},
): PluginListEntry {
  return {
    pluginId: "",
    name: "",
    version: "",
    sourceScope: "workspace",
    sourceScopeLabel: "",
    sourceManager: "setta",
    sourceManagerHint: null,
    canonicalSourceKey: "",
    sourceDigestSha256: null,
    frontend: {
      entrypointUrl: null,
      styleUrl: null,
    },
    content: {
      hasBlueprints: false,
      hasProjectTemplates: false,
      hasPrompts: false,
    },
    config: {
      hasSchema: false,
      schemaJson: null as unknown as Record<string, unknown>,
      schemaJsonDigestSha256: null,
      currentConfig: null as unknown as Record<string, unknown>,
      currentConfigDigestSha256: null,
    },
    effectiveCapabilities: [],
    enablementSource: null,
    restartRequired: false,
    ...options,
  };
}
`

const pluginStatusEntryRawTS = `
export type PluginStatusEntry = {
  pluginId: string;
  name: string;
  version: string;
  state: PluginRuntimeState;
  sourceScope: PluginScope;
  sourceScopeLabel: string;
  sourceManager: PluginSourceManager;
  sourceManagerHint: string | null;
  sourcePath: string;
  canonicalSourceKey: string;
  sourceDigestSha256: string | null;
  shadowedBySourcePath: string | null;
  requestedCapabilities: Array<string>;
  effectiveCapabilities: Array<string>;
  blockedCapabilities: Array<PluginBlockedCapability>;
  registeredLanguageServers: Array<PluginRegisteredLanguageServer>;
  registeredExternalAgentAdapters: Array<PluginRegisteredExternalAgentAdapter>;
  registeredCodegenTargets: Array<PluginRegisteredCodegenTarget>;
  enablementSource: PluginEnablementSource | null;
  restartRequired: boolean;
  runtimePayloadDigestSha256: string;
  errors: Array<PluginErrorInfo>;
};
export function createPluginStatusEntry(
  options: Partial<PluginStatusEntry> = {},
): PluginStatusEntry {
  return {
    pluginId: "",
    name: "",
    version: "",
    state: PluginRuntimeStateEnum.active,
    sourceScope: "workspace",
    sourceScopeLabel: "",
    sourceManager: "setta",
    sourceManagerHint: null,
    sourcePath: "",
    canonicalSourceKey: "",
    sourceDigestSha256: null,
    shadowedBySourcePath: null,
    requestedCapabilities: [],
    effectiveCapabilities: [],
    blockedCapabilities: [],
    registeredLanguageServers: [],
    registeredExternalAgentAdapters: [],
    registeredCodegenTargets: [],
    enablementSource: null,
    restartRequired: false,
    runtimePayloadDigestSha256: "",
    errors: [],
    ...options,
  };
}
`
