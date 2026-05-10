package httpapi

import (
	"context"
	"encoding/json"
	"errors"

	"setta/internal/deployments"
	"setta/internal/modes"
	"setta/internal/projectstate"
	"setta/internal/projectview"
	"setta/internal/prompttemplates"
	"setta/internal/realtime"
	"setta/internal/settingsstate"
)

var errPromptTemplateStoreRequired = errors.New("prompt template store is required")

const (
	RouteGetLatestProjectState             = "/getLatestProjectState"
	RouteUndo                              = "/undo"
	RouteRedo                              = "/redo"
	RouteCreateNewSectionVariant           = "/createNewSectionVariant"
	RouteSetSectionVariant                 = "/setSectionVariant"
	RouteSetDefaultSectionVariant          = "/setDefaultSectionVariant"
	RouteSetSectionVariantSortOrder        = "/setSectionVariantSortOrder"
	RouteToggleVariantFrozen               = "/toggleVariantFrozen"
	RouteToggleVariantJSONSource           = "/toggleVariantJsonSource"
	RouteSetVariantJSONSourceKeys          = "/setVariantJsonSourceKeys"
	RouteSetSectionVariantName             = "/setSectionVariantName"
	RouteCreateChildSections               = "/createChildSections"
	RouteCreateChildSectionsViaIncrementer = "/createChildSectionsViaIncrementer"
	RouteDeleteChildSectionsViaDecrementer = "/deleteChildSectionsViaDecrementer"
	RouteCreateTopLevelSection             = "/createTopLevelSection"
	RouteDeleteSections                    = "/deleteSections"
	RouteDeleteSelectedParams              = "/deleteSelectedParams"
	RoutePrepareSectionsForCopy            = "/prepareSectionsForCopy"
	RoutePasteSections                     = "/pasteSections"
	RouteCreateEdge                        = "/createEdge"
	RouteUpdateEdge                        = "/updateEdge"
	RouteDeleteEdges                       = "/deleteEdges"
	RouteReconnectEdge                     = "/reconnectEdge"
	RouteSetEdges                          = "/setEdges"
	RouteCreateStateMachineEdge            = "/createStateMachineEdge"
	RouteUpdateStateMachineEdge            = "/updateStateMachineEdge"
	RouteDeleteStateMachineEdges           = "/deleteStateMachineEdges"
	RouteSetStateMachineEdges              = "/setStateMachineEdges"
	RouteCreateAgenticEdge                 = "/createAgenticEdge"
	RouteUpdateAgenticEdge                 = "/updateAgenticEdge"
	RouteDeleteAgenticEdges                = "/deleteAgenticEdges"
	RouteSetAgenticEdges                   = "/setAgenticEdges"
	RouteMoveSections                      = "/moveSections"
	RouteMoveParams                        = "/moveParams"
	RouteMoveParamGroups                   = "/moveParamGroups"
	RouteIndentParams                      = "/indentParams"
	RouteUnindentParams                    = "/unindentParams"
	RouteAddKwarg                          = "/addKwarg"
	RouteDeleteKwarg                       = "/deleteKwarg"
	RouteCreateViewMode                    = "/createViewMode"
	RouteSetActiveViewMode                 = "/setActiveViewMode"
	RouteToggleIsEditingViewMode           = "/toggleIsEditingViewMode"
	RouteToggleSectionVisibility           = "/toggleSectionVisibility"
	RouteGroupSections                     = "/groupSections"
	RouteUngroupGroups                     = "/ungroupGroups"
	RouteToggleViewModeUserFacing          = "/toggleViewModeUserFacing"
	RouteToggleViewModeTab                 = "/toggleViewModeTab"
	RouteSetViewModeName                   = "/setViewModeName"
	RouteSetViewModeSortOrder              = "/setViewModeSortOrder"
	RouteDeleteViewMode                    = "/deleteViewMode"
	RouteSetTopLevelSectionLayout          = "/setTopLevelSectionLayout"
	RouteAutoLayoutTopLevelSections        = "/autoLayoutTopLevelSections"
	RouteSetShowParamDisplayNames          = "/setShowParamDisplayNames"
	RouteSetSectionName                    = "/setSectionName"
	RouteAcceptRenameRefactor              = "/acceptRenameRefactor"
	RouteDeclineRenameRefactor             = "/declineRenameRefactor"
	RouteTogglePositionLocks               = "/togglePositionLocks"
	RouteToggleMinimized                   = "/toggleMinimized"
	RouteSetGroupOverflowMode              = "/setGroupOverflowMode"
	RouteSetSectionSizes                   = "/setSectionSizes"
	RouteSetCode                           = "/setCode"
	RouteSetCodeSectionAttachedTerminal    = "/setCodeSectionAttachedTerminal"
	RouteSetCodeFileBinding                = "/setCodeFileBinding"
	RouteFormatCode                        = "/formatCode"
	RouteSetActiveIDs                      = "/setActiveIds"
	RouteSetViewport                       = "/setViewport"
	RouteSetSectionTagColor                = "/setSectionTagColor"
	RouteSetSectionStyleColor              = "/setSectionStyleColor"
	RouteSetSectionParamFilter             = "/setSectionParamFilter"
	RouteSetMetaControlShowSectionTitle    = "/setMetaControlShowSectionTitle"
	RouteSetSectionColumnWidth             = "/setSectionColumnWidth"
	RouteSetSectionEdgeInputs              = "/setSectionEdgeInputs"
	RouteSetSectionEdgeOutputs             = "/setSectionEdgeOutputs"
	RouteSetParentDefaultChildSectionType  = "/setParentDefaultChildSectionType"
	RouteSetListRootViewMode               = "/setListRootViewMode"
	RouteToggleGroupOrientation            = "/toggleGroupOrientation"
	RouteSetCallableHideParams             = "/setCallableHideParams"
	RouteSetSectionHideUnpinnedParams      = "/setSectionHideUnpinnedParams"
	RouteSetSectionPinnedParams            = "/setSectionPinnedParams"
	RouteSetBrowserColumnWidths            = "/setBrowserColumnWidths"
	RouteSetBrowserAreaViewMode            = "/setBrowserAreaViewMode"
	RouteSetBrowserHideColumn              = "/setBrowserHideColumn"
	RouteSetBrowserSavedSearches           = "/setBrowserSavedSearches"
	RouteSetSpreadsheetFilePath            = "/setSpreadsheetFilePath"
	RouteSetSpreadsheetSectionSettings     = "/setSpreadsheetSectionSettings"
	RouteSetTaskBoardSectionState          = "/setTaskBoardSectionState"
	RouteSetImageAreaImagePath             = "/setImageAreaImagePath"
	RouteSetSocialURL                      = "/setSocialUrl"
	RouteAppendDrawAreaLayerItem           = "/appendDrawAreaLayerItem"
	RouteSetChartAreaDataPath              = "/setChartAreaDataPath"
	RouteSetChartType                      = "/setChartType"
	RouteSetChartSettings                  = "/setChartSettings"
	RouteSetTextBlockText                  = "/setTextBlockText"
	RouteSetTextBlockDisplayMode           = "/setTextBlockDisplayMode"
	RouteSetTextBlockFormat                = "/setTextBlockFormat"
	RouteSetTextBlockHeadingAsSectionName  = "/setTextBlockHeadingAsSectionName"
	RouteSetTextBlockMetaControlStyle      = "/setTextBlockMetaControlStyle"
	RouteSetTextBlockMasterFontSize        = "/setTextBlockMasterFontSize"
	RouteSetPromptTemplate                 = "/setPromptTemplate"
	RouteSetPromptTemplateLink             = "/setPromptTemplateLink"
	RouteSetPromptInputs                   = "/setPromptInputs"
	RouteSetPromptFormat                   = "/setPromptFormat"
	RouteToggleParamSelected               = "/toggleParamSelected"
	RouteUnselectAllParams                 = "/unselectAllParams"
	RouteSetChatSectionSettings            = "/setChatSectionSettings"
	RouteSetStateMachineSectionSettings    = "/setStateMachineSectionSettings"
	RouteSetChatSectionState               = "/setChatSectionState"
	RouteGetChatSectionChatID              = "/getChatSectionChatId"
	RouteSetChatSectionChatID              = "/setChatSectionChatId"
	RouteCreateWindowSpace                 = "/createWindowSpace"
	RouteSetWindowSpaceName                = "/setWindowSpaceName"
	RouteSetWindowSpaceSortOrder           = "/setWindowSpaceSortOrder"
	RouteDeleteWindowSpace                 = "/deleteWindowSpace"
	RouteSetProjectChatWindowingState      = "/setProjectChatWindowingState"
	RouteSetProjectChatWindowChatID        = "/setProjectChatWindowChatId"
	RouteSetCallable                       = "/setCallable"
	RouteSetProjectConfigCodegenTargets    = "/setProjectConfigCodegenTargets"
	RouteSetGenCodePrefix                  = "/setGenCodePrefix"
	RouteSetGenCodeSuffix                  = "/setGenCodeSuffix"
	RouteChangeParamImpl                   = "/changeParamImpl"
	RouteSetParamEnteredValue              = "/setParamEnteredValue"
	RouteUpdateParamImplConfig             = "/updateParamImplConfig"
	RouteSetCodeObjName                    = "/setCodeObjName"
	RouteSetCodeObjDisplayName             = "/setCodeObjDisplayName"
	RouteGetPasswordParamValue             = "/getPasswordParamValue"
	RouteDeleteSectionVariantOrAsk         = "/deleteSectionVariantOrAsk"
	RouteDeleteJSONSourceFileAndVariant    = "/deleteJsonSourceFileAndVariant"
)

var (
	ErrProjectCodegenTargetObjectRequired   = errors.New("project codegen target payload must be a JSON object")
	ErrProjectCodegenTargetLanguageRequired = errors.New("project codegen target language is required")
)

type ProjectRouteDependencies struct {
	ModePolicy                     modes.Policy
	WorkspaceRoot                  string
	ProjectState                   *projectstate.Runtime
	SettingsProjectState           *projectstate.Runtime
	WebsocketHub                   *realtime.WebsocketHub
	PromptTemplates                *prompttemplates.Store
	ShareSessions                  modes.ShareSessionStore
	Deployment                     *deployments.Runtime
	SettingsState                  *settingsstate.Runtime
	ChatSectionChatID              func(ctx context.Context, projectID string, sectionID string) (*string, error)
	EdgeExpressionBuilder          projectstate.EdgeExpressionBuilder
	CodegenTargetValidator         projectstate.CodegenTargetValidator
	PythonCodegenSectionReconciler projectstate.PythonCodegenSectionReconciler
	CallableSignatures             projectstate.CallableSignatureResolver
	SetCode                        func(ctx context.Context, projectID string, sectionID string, code string) error
	FormatCode                     func(ctx context.Context, projectID string, sectionID string) error
	SetSectionName                 func(ctx context.Context, projectID string, sectionID string, name string) error
	AcceptRenameRefactor           func(ctx context.Context, projectID string, frontendOpID string) error
	DeclineRenameRefactor          func(ctx context.Context, projectID string, frontendOpID string) error
}

// setta-go-type-discovery: skip
type ProjectStateSingleConfigWithCompletedOpIDs struct {
	ProjectState   projectview.SingleConfig `json:"projectState"`
	CompletedOpIDs []string                 `json:"completedOpIds"`
	PendingOpIDs   []string                 `json:"pendingOpIds"`
}

// setta-go-type-discovery: skip
type (
	ProjectConfigMutationResponse struct {
		ProjectConfig projectview.ProjectConfig `json:"projectConfig"`
	}

	WindowSpaceMutationResponse struct {
		ProjectConfig projectview.ProjectConfig `json:"projectConfig"`
		WindowSpaceID *string                   `json:"windowSpaceId,omitempty"`
	}

	SetProjectConfigCodegenTargetsRequest struct {
		FrontendOpID   *string           `json:"frontendOpId,omitempty"`
		ProjectID      string            `json:"projectConfigId"`
		CodegenTargets []json.RawMessage `json:"codegenTargets"`
	}

	SetGenCodePrefixRequest struct {
		FrontendOpID  *string `json:"frontendOpId,omitempty"`
		ProjectID     string  `json:"projectConfigId"`
		GenCodePrefix string  `json:"genCodePrefix"`
	}

	SetGenCodeSuffixRequest struct {
		FrontendOpID  *string `json:"frontendOpId,omitempty"`
		ProjectID     string  `json:"projectConfigId"`
		GenCodeSuffix string  `json:"genCodeSuffix"`
	}

	CodeFileBindingUpdate struct {
		CanonicalPath string                          `json:"canonical_path"`
		AccessMode    projectstate.CodeFileAccessMode `json:"access_mode"`
	}

	GetLatestProjectStateRequest struct {
		FrontendOpID *string `json:"frontendOpId,omitempty"`
		ProjectID    string  `json:"projectConfigId"`
	}

	UndoRequest struct {
		ProjectID string `json:"projectConfigId"`
		Steps     int    `json:"steps"`
	}

	RedoRequest struct {
		ProjectID string `json:"projectConfigId"`
		Steps     int    `json:"steps"`
	}
)
