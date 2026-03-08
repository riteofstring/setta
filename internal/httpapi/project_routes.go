package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"os"
	"strings"

	"github.com/go-chi/chi/v5"
	"setta/internal/modes"
	"setta/internal/projectstate"
	"setta/internal/projectview"
	"setta/internal/settingsstate"
	"setta/internal/statefs"
)

const (
	RouteGetLatestProjectState            = "/getLatestProjectState"
	RouteCreateTopLevelSection            = "/createTopLevelSection"
	RouteDeleteSections                   = "/deleteSections"
	RouteDeleteSelectedParams             = "/deleteSelectedParams"
	RouteAddKwarg                         = "/addKwarg"
	RouteDeleteKwarg                      = "/deleteKwarg"
	RouteCreateViewMode                   = "/createViewMode"
	RouteSetActiveViewMode                = "/setActiveViewMode"
	RouteToggleIsEditingViewMode          = "/toggleIsEditingViewMode"
	RouteToggleSectionVisibility          = "/toggleSectionVisibility"
	RouteGroupSections                    = "/groupSections"
	RouteUngroupGroups                    = "/ungroupGroups"
	RouteToggleViewModeUserFacing         = "/toggleViewModeUserFacing"
	RouteToggleViewModeTab                = "/toggleViewModeTab"
	RouteSetViewModeName                  = "/setViewModeName"
	RouteSetViewModeSortOrder             = "/setViewModeSortOrder"
	RouteDeleteViewMode                   = "/deleteViewMode"
	RouteSetTopLevelSectionLayout         = "/setTopLevelSectionLayout"
	RouteAutoLayoutTopLevelSections       = "/autoLayoutTopLevelSections"
	RouteSetShowParamDisplayNames         = "/setShowParamDisplayNames"
	RouteSetSectionName                   = "/setSectionName"
	RouteAcceptRenameRefactor             = "/acceptRenameRefactor"
	RouteDeclineRenameRefactor            = "/declineRenameRefactor"
	RouteTogglePositionLocks              = "/togglePositionLocks"
	RouteToggleMinimized                  = "/toggleMinimized"
	RouteSetGroupOverflowMode             = "/setGroupOverflowMode"
	RouteSetSectionSizes                  = "/setSectionSizes"
	RouteSetCode                          = "/setCode"
	RouteSetCodeSectionAttachedTerminal   = "/setCodeSectionAttachedTerminal"
	RouteSetCodeFileBinding               = "/setCodeFileBinding"
	RouteFormatCode                       = "/formatCode"
	RouteSetActiveIDs                     = "/setActiveIds"
	RouteSetViewport                      = "/setViewport"
	RouteSetSectionTagColor               = "/setSectionTagColor"
	RouteSetSectionStyleColor             = "/setSectionStyleColor"
	RouteSetSectionParamFilter            = "/setSectionParamFilter"
	RouteSetMetaControlShowSectionTitle   = "/setMetaControlShowSectionTitle"
	RouteSetSectionColumnWidth            = "/setSectionColumnWidth"
	RouteSetSectionEdgeInputs             = "/setSectionEdgeInputs"
	RouteSetSectionEdgeOutputs            = "/setSectionEdgeOutputs"
	RouteSetParentDefaultChildSectionType = "/setParentDefaultChildSectionType"
	RouteSetListRootViewMode              = "/setListRootViewMode"
	RouteSetCallableHideParams            = "/setCallableHideParams"
	RouteSetSectionHideUnpinnedParams     = "/setSectionHideUnpinnedParams"
	RouteSetSectionPinnedParams           = "/setSectionPinnedParams"
	RouteSetBrowserColumnWidths           = "/setBrowserColumnWidths"
	RouteSetBrowserAreaViewMode           = "/setBrowserAreaViewMode"
	RouteSetBrowserHideColumn             = "/setBrowserHideColumn"
	RouteSetBrowserSavedSearches          = "/setBrowserSavedSearches"
	RouteToggleParamSelected              = "/toggleParamSelected"
	RouteUnselectAllParams                = "/unselectAllParams"
	RouteSetChatSectionSettings           = "/setChatSectionSettings"
	RouteSetChatSectionState              = "/setChatSectionState"
	RouteGetChatSectionChatID             = "/getChatSectionChatId"
	RouteSetChatSectionChatID             = "/setChatSectionChatId"
	RouteSetCallable                      = "/setCallable"
	RouteSetProjectConfigCodegenTargets   = "/setProjectConfigCodegenTargets"
	RouteSetWatchCodeEnabled              = "/setWatchCodeEnabled"
	RouteSetWatchCodeInputs               = "/setWatchCodeInputs"
	RouteSetParamEnteredValue             = "/setParamEnteredValue"
	RouteUpdateParamImplConfig            = "/updateParamImplConfig"
	RouteSetCodeObjName                   = "/setCodeObjName"
	RouteSetCodeObjDisplayName            = "/setCodeObjDisplayName"
	RouteGetPasswordParamValue            = "/getPasswordParamValue"
	RouteDeleteSectionVariantOrAsk        = "/deleteSectionVariantOrAsk"
	RouteDeleteJSONSourceFileAndVariant   = "/deleteJsonSourceFileAndVariant"
)

var (
	ErrProjectCodegenTargetObjectRequired   = errors.New("project codegen target payload must be a JSON object")
	ErrProjectCodegenTargetLanguageRequired = errors.New("project codegen target language is required")
)

type ProjectRouteDependencies struct {
	ModePolicy                     modes.Policy
	WorkspaceRoot                  string
	ProjectState                   *projectstate.Runtime
	SettingsState                  *settingsstate.Runtime
	ChatSectionChatIDs             ChatSectionChatIDService
	CodegenTargetValidator         projectstate.CodegenTargetValidator
	PythonCodegenSectionReconciler projectstate.PythonCodegenSectionReconciler
	CallableSignatures             projectstate.CallableSignatureResolver
	CodeUpdates                    ProjectCodeUpdateService
	RenameRefactors                ProjectRenameRefactorService
}

type ProjectCodeUpdateService interface {
	SetCode(ctx context.Context, projectID string, sectionID string, code string) error
	FormatCode(ctx context.Context, projectID string, sectionID string) error
}

type ProjectRenameRefactorService interface {
	SetSectionName(ctx context.Context, projectID string, sectionID string, name string) error
	AcceptRenameRefactor(ctx context.Context, projectID string, frontendOpID string) error
	DeclineRenameRefactor(ctx context.Context, projectID string, frontendOpID string) error
}

type ChatSectionChatIDService interface {
	GetChatID(ctx context.Context, projectID string, sectionID string) (*string, error)
}

type ProjectStateSingleConfigWithCompletedOpIDs struct {
	ProjectState   projectview.SingleConfig `json:"projectState"`
	CompletedOpIDs []string                 `json:"completedOpIds"`
	PendingOpIDs   []string                 `json:"pendingOpIds"`
}

type SetProjectConfigCodegenTargetsRequest struct {
	FrontendOpID   *string           `json:"frontendOpId"`
	ProjectID      string            `json:"projectConfigId"`
	CodegenTargets []json.RawMessage `json:"codegenTargets"`
}

type CodeFileBindingUpdate struct {
	CanonicalPath string                          `json:"canonical_path"`
	AccessMode    projectstate.CodeFileAccessMode `json:"access_mode"`
}

type GetLatestProjectStateRequest struct {
	FrontendOpID *string `json:"frontendOpId"`
	ProjectID    string  `json:"projectConfigId"`
}

type GetPasswordParamValueRequest struct {
	ProjectID   string `json:"projectConfigId"`
	SectionID   string `json:"sectionId"`
	ParamInfoID string `json:"paramInfoId"`
}

type GetPasswordParamValueResponse struct {
	Value string `json:"value"`
}

type DeleteSectionVariantOrAskRequest struct {
	ProjectID string `json:"projectConfigId"`
	SectionID string `json:"sectionId"`
	VariantID string `json:"variantId"`
}

type DeleteJSONSourceFileAndVariantRequest struct {
	ProjectID string `json:"projectConfigId"`
	SectionID string `json:"sectionId"`
	VariantID string `json:"variantId"`
	Filepath  string `json:"filepath"`
}

type DeleteSectionsRequest struct {
	FrontendOpID *string  `json:"frontendOpId"`
	ProjectID    string   `json:"projectConfigId"`
	SectionIDs   []string `json:"sectionIds"`
}

type DeleteSelectedParamsRequest struct {
	FrontendOpID *string  `json:"frontendOpId"`
	ProjectID    string   `json:"projectConfigId"`
	SectionID    string   `json:"sectionId"`
	ParamInfoIDs []string `json:"paramInfoIds"`
}

type AddKwargRequest struct {
	ProjectID string `json:"projectConfigId"`
	SectionID string `json:"sectionId"`
}

type DeleteKwargRequest struct {
	ProjectID string `json:"projectConfigId"`
	SectionID string `json:"sectionId"`
}

type CreateTopLevelSectionRequest struct {
	FrontendOpID       *string                `json:"frontendOpId"`
	ProjectID          string                 `json:"projectConfigId"`
	ImplType           string                 `json:"implType"`
	ControlCodeObjType *string                `json:"controlCodeObjType"`
	ImplOverrides      map[string]any         `json:"implOverrides"`
	Position           *projectstate.Position `json:"position"`
}

type CreateViewModeRequest struct {
	FrontendOpID *string `json:"frontendOpId"`
	ProjectID    string  `json:"projectConfigId"`
}

type SetActiveViewModeRequest struct {
	FrontendOpID     *string `json:"frontendOpId"`
	ProjectID        string  `json:"projectConfigId"`
	ActiveViewModeID string  `json:"activeViewModeId"`
}

type ToggleIsEditingViewModeRequest struct {
	FrontendOpID *string `json:"frontendOpId"`
	ProjectID    string  `json:"projectConfigId"`
}

type ToggleSectionVisibilityRequest struct {
	FrontendOpID *string  `json:"frontendOpId"`
	ProjectID    string   `json:"projectConfigId"`
	SectionIDs   []string `json:"sectionIds"`
}

type GroupSectionsRequest struct {
	FrontendOpID *string  `json:"frontendOpId"`
	ProjectID    string   `json:"projectConfigId"`
	SectionIDs   []string `json:"sectionIds"`
}

type UngroupGroupsRequest struct {
	FrontendOpID *string  `json:"frontendOpId"`
	ProjectID    string   `json:"projectConfigId"`
	GroupIDs     []string `json:"groupIds"`
}

type ToggleViewModeUserFacingRequest struct {
	FrontendOpID *string `json:"frontendOpId"`
	ProjectID    string  `json:"projectConfigId"`
	ViewModeID   string  `json:"viewModeId"`
}

type ToggleViewModeTabRequest struct {
	FrontendOpID *string `json:"frontendOpId"`
	ProjectID    string  `json:"projectConfigId"`
	ViewModeID   string  `json:"viewModeId"`
}

type SetViewModeNameRequest struct {
	FrontendOpID *string `json:"frontendOpId"`
	ProjectID    string  `json:"projectConfigId"`
	ViewModeID   string  `json:"viewModeId"`
	Name         string  `json:"name"`
}

type SetViewModeSortOrderRequest struct {
	FrontendOpID       *string  `json:"frontendOpId"`
	ProjectID          string   `json:"projectConfigId"`
	OrderedViewModeIDs []string `json:"orderedViewModeIds"`
}

type DeleteViewModeRequest struct {
	FrontendOpID *string `json:"frontendOpId"`
	ProjectID    string  `json:"projectConfigId"`
	ViewModeID   string  `json:"viewModeId"`
}

type SetTopLevelSectionLayoutRequest struct {
	FrontendOpID     *string                                       `json:"frontendOpId"`
	ProjectID        string                                        `json:"projectConfigId"`
	TopLevelSections map[string]projectstate.TopLevelSectionLayout `json:"topLevelSections"`
}

type AutoLayoutTopLevelSectionsRequest struct {
	FrontendOpID *string `json:"frontendOpId"`
	ProjectID    string  `json:"projectConfigId"`
	Margin       *int    `json:"margin"`
}

type SetShowParamDisplayNamesRequest struct {
	FrontendOpID          *string `json:"frontendOpId"`
	ProjectID             string  `json:"projectConfigId"`
	ShowParamDisplayNames bool    `json:"showParamDisplayNames"`
}

type SetSectionNameRequest struct {
	FrontendOpID *string `json:"frontendOpId"`
	ProjectID    string  `json:"projectConfigId"`
	SectionID    string  `json:"sectionId"`
	Name         string  `json:"name"`
}

type SetCodeFileBindingRequest struct {
	FrontendOpID *string               `json:"frontendOpId"`
	ProjectID    string                `json:"projectConfigId"`
	SectionID    string                `json:"sectionId"`
	Binding      CodeFileBindingUpdate `json:"binding"`
}

type AcceptRenameRefactorRequest struct {
	ProjectID    string `json:"projectConfigId"`
	FrontendOpID string `json:"frontendOpId"`
}

type DeclineRenameRefactorRequest struct {
	ProjectID    string `json:"projectConfigId"`
	FrontendOpID string `json:"frontendOpId"`
}

type TogglePositionLocksRequest struct {
	FrontendOpID *string  `json:"frontendOpId"`
	ProjectID    string   `json:"projectConfigId"`
	SectionIDs   []string `json:"sectionIds"`
}

type ToggleMinimizedRequest struct {
	FrontendOpID *string `json:"frontendOpId"`
	ProjectID    string  `json:"projectConfigId"`
	SectionID    string  `json:"sectionId"`
}

type sectionSizeValueRequest struct {
	projectstate.SectionSizeValue
}

func (v *sectionSizeValueRequest) UnmarshalJSON(data []byte) error {
	var stringValue string
	if err := json.Unmarshal(data, &stringValue); err == nil {
		if stringValue != "auto" {
			return fmt.Errorf("section size value must be a number or \"auto\"")
		}
		v.SectionSizeValue = projectstate.AutoSectionSizeValue()
		return nil
	}

	var number float64
	if err := json.Unmarshal(data, &number); err == nil {
		if math.IsNaN(number) || math.IsInf(number, 0) {
			return fmt.Errorf("section size value must be finite")
		}
		v.SectionSizeValue = projectstate.FixedSectionSizeValue(number)
		return nil
	}

	return fmt.Errorf("section size value must be a number or \"auto\"")
}

type sectionSizeRequest struct {
	Width  sectionSizeValueRequest `json:"width"`
	Height sectionSizeValueRequest `json:"height"`
}

func (s *sectionSizeRequest) UnmarshalJSON(data []byte) error {
	var payload struct {
		Width  *sectionSizeValueRequest `json:"width"`
		Height *sectionSizeValueRequest `json:"height"`
	}
	if err := json.Unmarshal(data, &payload); err != nil {
		return err
	}
	if payload.Width == nil || payload.Height == nil {
		return fmt.Errorf("section size must include width and height")
	}
	s.Width = *payload.Width
	s.Height = *payload.Height
	return nil
}

func (s sectionSizeRequest) ProjectStateValue() projectstate.SectionSize {
	return projectstate.SectionSize{
		Width:  s.Width.SectionSizeValue,
		Height: s.Height.SectionSizeValue,
	}
}

type SetSectionSizesRequest struct {
	FrontendOpID *string                       `json:"frontendOpId"`
	ProjectID    string                        `json:"projectConfigId"`
	SectionSizes map[string]sectionSizeRequest `json:"sectionSizes"`
}

type SetCallableRequest struct {
	FrontendOpID  *string `json:"frontendOpId"`
	ProjectID     string  `json:"projectConfigId"`
	SectionID     string  `json:"sectionId"`
	CallableName  string  `json:"callableName"`
	RefetchParams bool    `json:"refetchParams"`
}

type SetActiveIDsRequest struct {
	FrontendOpID *string  `json:"frontendOpId"`
	ProjectID    string   `json:"projectConfigId"`
	ActiveIDs    []string `json:"activeIds"`
}

type SetViewportRequest struct {
	FrontendOpID *string                `json:"frontendOpId"`
	ProjectID    string                 `json:"projectConfigId"`
	Viewport     *projectstate.Viewport `json:"viewport"`
}

type SetCodeRequest struct {
	FrontendOpID *string `json:"frontendOpId"`
	ProjectID    string  `json:"projectConfigId"`
	SectionID    string  `json:"sectionId"`
	Code         string  `json:"code"`
}

type FormatCodeRequest struct {
	FrontendOpID *string `json:"frontendOpId"`
	ProjectID    string  `json:"projectConfigId"`
	SectionID    string  `json:"sectionId"`
}

type SetSectionTagColorRequest struct {
	FrontendOpID *string `json:"frontendOpId"`
	ProjectID    string  `json:"projectConfigId"`
	SectionID    string  `json:"sectionId"`
	TagColor     *string `json:"tagColor"`
}

type SetSectionStyleColorRequest struct {
	FrontendOpID *string `json:"frontendOpId"`
	ProjectID    string  `json:"projectConfigId"`
	SectionID    string  `json:"sectionId"`
	StyleColor   *string `json:"styleColor"`
}

type SetSectionParamFilterRequest struct {
	FrontendOpID *string `json:"frontendOpId"`
	ProjectID    string  `json:"projectConfigId"`
	SectionID    string  `json:"sectionId"`
	Value        string  `json:"value"`
}

type SetMetaControlShowSectionTitleRequest struct {
	FrontendOpID     *string `json:"frontendOpId"`
	ProjectID        string  `json:"projectConfigId"`
	SectionID        string  `json:"sectionId"`
	ShowSectionTitle bool    `json:"showSectionTitle"`
}

type SetSectionColumnWidthRequest struct {
	FrontendOpID *string  `json:"frontendOpId"`
	ProjectID    string   `json:"projectConfigId"`
	SectionID    string   `json:"sectionId"`
	ColumnWidth  *float64 `json:"columnWidth"`
}

type SetSectionEdgeInputsRequest struct {
	FrontendOpID    *string  `json:"frontendOpId"`
	ProjectID       string   `json:"projectConfigId"`
	SectionID       string   `json:"sectionId"`
	EdgeInputParams []string `json:"edgeInputParams"`
}

type SetSectionEdgeOutputsRequest struct {
	FrontendOpID    *string                 `json:"frontendOpId"`
	ProjectID       string                  `json:"projectConfigId"`
	SectionID       string                  `json:"sectionId"`
	EdgeOutputPorts []projectstate.EdgePort `json:"edgeOutputPorts"`
}

type SetParentDefaultChildSectionTypeRequest struct {
	FrontendOpID            *string `json:"frontendOpId"`
	ProjectID               string  `json:"projectConfigId"`
	SectionID               string  `json:"sectionId"`
	DefaultChildSectionType string  `json:"defaultChildSectionType"`
}

type SetListRootViewModeRequest struct {
	FrontendOpID *string                       `json:"frontendOpId"`
	ProjectID    string                        `json:"projectConfigId"`
	SectionID    string                        `json:"sectionId"`
	ViewMode     projectstate.ListRootViewMode `json:"viewMode"`
}

type SetGroupOverflowModeRequest struct {
	FrontendOpID *string `json:"frontendOpId"`
	ProjectID    string  `json:"projectConfigId"`
	SectionID    string  `json:"sectionId"`
	OverflowMode bool    `json:"overflowMode"`
}

type SetCallableHideParamsRequest struct {
	FrontendOpID *string `json:"frontendOpId"`
	ProjectID    string  `json:"projectConfigId"`
	SectionID    string  `json:"sectionId"`
	HideParams   bool    `json:"hideParams"`
}

type SetSectionHideUnpinnedParamsRequest struct {
	FrontendOpID       *string `json:"frontendOpId"`
	ProjectID          string  `json:"projectConfigId"`
	SectionID          string  `json:"sectionId"`
	HideUnpinnedParams bool    `json:"hideUnpinnedParams"`
}

type SetSectionPinnedParamsRequest struct {
	FrontendOpID *string  `json:"frontendOpId"`
	ProjectID    string   `json:"projectConfigId"`
	SectionID    string   `json:"sectionId"`
	PinnedParams []string `json:"pinnedParams"`
}

type ToggleParamSelectedRequest struct {
	FrontendOpID *string `json:"frontendOpId"`
	ProjectID    string  `json:"projectConfigId"`
	SectionID    string  `json:"sectionId"`
	ParamInfoID  string  `json:"paramInfoId"`
}

type UnselectAllParamsRequest struct {
	FrontendOpID *string `json:"frontendOpId"`
	ProjectID    string  `json:"projectConfigId"`
}

type SetBrowserColumnWidthsRequest struct {
	FrontendOpID     *string  `json:"frontendOpId"`
	ProjectID        string   `json:"projectConfigId"`
	SectionID        string   `json:"sectionId"`
	ColumnWidth      *float64 `json:"columnWidth"`
	TypesColumnWidth *float64 `json:"typesColumnWidth"`
}

type SetBrowserAreaViewModeRequest struct {
	FrontendOpID *string                          `json:"frontendOpId"`
	ProjectID    string                           `json:"projectConfigId"`
	SectionID    string                           `json:"sectionId"`
	ViewMode     projectstate.BrowserAreaViewMode `json:"viewMode"`
}

type SetBrowserHideColumnRequest struct {
	FrontendOpID *string `json:"frontendOpId"`
	ProjectID    string  `json:"projectConfigId"`
	SectionID    string  `json:"sectionId"`
	HideColumn   bool    `json:"hideColumn"`
}

type SetBrowserSavedSearchesRequest struct {
	FrontendOpID  *string                           `json:"frontendOpId"`
	ProjectID     string                            `json:"projectConfigId"`
	SectionID     string                            `json:"sectionId"`
	SavedSearches []projectstate.BrowserSavedSearch `json:"savedSearches"`
}

type SetChatSectionSettingsRequest struct {
	FrontendOpID           *string                         `json:"frontendOpId"`
	ProjectID              string                          `json:"projectConfigId"`
	SectionID              string                          `json:"sectionId"`
	Managed                bool                            `json:"managed"`
	EngineConfigID         *string                         `json:"engineConfigId"`
	TranscriptionProfileID *string                         `json:"transcriptionProfileId"`
	AgentProfileID         *string                         `json:"agentProfileId"`
	Thinking               bool                            `json:"thinking"`
	PermissionMode         projectstate.ChatPermissionMode `json:"permissionMode"`
	SearchEnabled          bool                            `json:"searchEnabled"`
	DictationMode          projectstate.ChatDictationMode  `json:"dictationMode"`
}

type SetChatSectionStateRequest struct {
	FrontendOpID *string                       `json:"frontendOpId"`
	ProjectID    string                        `json:"projectConfigId"`
	SectionID    string                        `json:"sectionId"`
	State        projectstate.ChatSectionState `json:"state"`
}

type GetChatSectionChatIDRequest struct {
	ProjectID string `json:"projectConfigId"`
	SectionID string `json:"sectionId"`
}

type SetChatSectionChatIDRequest struct {
	FrontendOpID *string `json:"frontendOpId"`
	ProjectID    string  `json:"projectConfigId"`
	SectionID    string  `json:"sectionId"`
	ChatID       *string `json:"chatId"`
}

type SetWatchCodeEnabledRequest struct {
	FrontendOpID *string `json:"frontendOpId"`
	ProjectID    string  `json:"projectConfigId"`
	Enabled      bool    `json:"enabled"`
}

type SetWatchCodeInputsRequest struct {
	FrontendOpID     *string                        `json:"frontendOpId"`
	ProjectID        string                         `json:"projectConfigId"`
	WatchCodeFolders []projectstate.WatchCodeFolder `json:"watchCodeFolders"`
	WatchCodeFiles   []string                       `json:"watchCodeFiles"`
}

type SetParamEnteredValueRequest struct {
	FrontendOpID *string `json:"frontendOpId"`
	ProjectID    string  `json:"projectConfigId"`
	SectionID    string  `json:"sectionId"`
	ParamInfoID  string  `json:"paramInfoId"`
	Value        string  `json:"value"`
}

type UpdateParamImplConfigRequest struct {
	FrontendOpID *string        `json:"frontendOpId"`
	ProjectID    string         `json:"projectConfigId"`
	SectionID    string         `json:"sectionId"`
	ParamInfoID  string         `json:"paramInfoId"`
	NewConfig    map[string]any `json:"newConfig"`
}

type SetCodeSectionAttachedTerminalRequest struct {
	FrontendOpID      *string `json:"frontendOpId"`
	ProjectID         string  `json:"projectConfigId"`
	SectionID         string  `json:"sectionId"`
	TerminalSectionID *string `json:"terminalSectionId"`
}

type SetCodeObjNameRequest struct {
	FrontendOpID *string `json:"frontendOpId"`
	ProjectID    string  `json:"projectConfigId"`
	CodeObjID    string  `json:"codeObjId"`
	Name         string  `json:"name"`
}

type SetCodeObjDisplayNameRequest struct {
	FrontendOpID *string `json:"frontendOpId"`
	ProjectID    string  `json:"projectConfigId"`
	CodeObjID    string  `json:"codeObjId"`
	DisplayName  string  `json:"displayName"`
}

func projectMutationContext(ctx context.Context, frontendOpID *string) context.Context {
	if frontendOpID == nil {
		return ctx
	}
	return projectstate.ContextWithFrontendOpID(ctx, *frontendOpID)
}

func resolveStructuralMutationSettingsFromRuntime(
	runtime *settingsstate.Runtime,
) (projectstate.StructuralMutationSettings, error) {
	if runtime == nil {
		return projectstate.DefaultStructuralMutationSettings(), nil
	}
	return settingsstate.StructuralMutationSettingsForDocument(runtime.Snapshot().Document)
}

func RegisterProjectRoutes(router chi.Router, deps ProjectRouteDependencies) error {
	if router == nil {
		return fmt.Errorf("router is required")
	}
	if deps.ModePolicy.IsIDE() {
		if strings.TrimSpace(deps.WorkspaceRoot) == "" {
			return fmt.Errorf("workspace root is required in ide mode")
		}
		if deps.ProjectState == nil {
			return fmt.Errorf("project runtime is required in ide mode")
		}
		if deps.SettingsState == nil {
			return fmt.Errorf("settings runtime is required in ide mode")
		}
		if deps.ChatSectionChatIDs == nil {
			return fmt.Errorf("chat section chat id service is required in ide mode")
		}
		if deps.CodeUpdates == nil {
			return fmt.Errorf("project code update service is required in ide mode")
		}
		if deps.RenameRefactors == nil {
			return fmt.Errorf("project rename refactor service is required in ide mode")
		}
		if deps.CodegenTargetValidator == nil {
			return fmt.Errorf("project codegen target validator is required in ide mode")
		}
		if deps.PythonCodegenSectionReconciler == nil {
			return fmt.Errorf("project python generated-section reconciler is required in ide mode")
		}
	}

	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteGetLatestProjectState, getLatestProjectStateHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteGetPasswordParamValue, getPasswordParamValueHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteDeleteSectionVariantOrAsk, deleteSectionVariantOrAskHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteDeleteJSONSourceFileAndVariant, deleteJSONSourceFileAndVariantHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteDeleteSections, deleteSectionsHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteDeleteSelectedParams, deleteSelectedParamsHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteAddKwarg, addKwargHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteDeleteKwarg, deleteKwargHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteCreateTopLevelSection, createTopLevelSectionHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteCreateViewMode, createViewModeHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetActiveViewMode, setActiveViewModeHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteToggleIsEditingViewMode, toggleIsEditingViewModeHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteToggleSectionVisibility, toggleSectionVisibilityHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteGroupSections, groupSectionsHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteUngroupGroups, ungroupGroupsHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteToggleViewModeUserFacing, toggleViewModeUserFacingHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteToggleViewModeTab, toggleViewModeTabHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetViewModeName, setViewModeNameHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetViewModeSortOrder, setViewModeSortOrderHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteDeleteViewMode, deleteViewModeHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetTopLevelSectionLayout, setTopLevelSectionLayoutHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteAutoLayoutTopLevelSections, autoLayoutTopLevelSectionsHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetSectionSizes, setSectionSizesHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetShowParamDisplayNames, setShowParamDisplayNamesHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetSectionName, setSectionNameHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteAcceptRenameRefactor, acceptRenameRefactorHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteDeclineRenameRefactor, declineRenameRefactorHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteTogglePositionLocks, togglePositionLocksHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteToggleMinimized, toggleMinimizedHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetCode, setCodeHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetCodeSectionAttachedTerminal, setCodeSectionAttachedTerminalHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetCodeFileBinding, setCodeFileBindingHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteFormatCode, formatCodeHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetActiveIDs, setActiveIDsHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetViewport, setViewportHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetSectionTagColor, setSectionTagColorHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetSectionStyleColor, setSectionStyleColorHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetSectionParamFilter, setSectionParamFilterHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetMetaControlShowSectionTitle, setMetaControlShowSectionTitleHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetSectionColumnWidth, setSectionColumnWidthHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetSectionEdgeInputs, setSectionEdgeInputsHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetSectionEdgeOutputs, setSectionEdgeOutputsHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetParentDefaultChildSectionType, setParentDefaultChildSectionTypeHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetListRootViewMode, setListRootViewModeHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetGroupOverflowMode, setGroupOverflowModeHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetCallableHideParams, setCallableHideParamsHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetSectionHideUnpinnedParams, setSectionHideUnpinnedParamsHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetSectionPinnedParams, setSectionPinnedParamsHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetBrowserColumnWidths, setBrowserColumnWidthsHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetBrowserAreaViewMode, setBrowserAreaViewModeHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetBrowserHideColumn, setBrowserHideColumnHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetBrowserSavedSearches, setBrowserSavedSearchesHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteToggleParamSelected, toggleParamSelectedHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteUnselectAllParams, unselectAllParamsHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetChatSectionSettings, setChatSectionSettingsHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetChatSectionState, setChatSectionStateHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteGetChatSectionChatID, getChatSectionChatIDHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetChatSectionChatID, setChatSectionChatIDHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetCallable, setCallableHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetProjectConfigCodegenTargets, setProjectConfigCodegenTargetsHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetWatchCodeEnabled, setWatchCodeEnabledHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetWatchCodeInputs, setWatchCodeInputsHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetParamEnteredValue, setParamEnteredValueHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteUpdateParamImplConfig, updateParamImplConfigHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetCodeObjName, setCodeObjNameHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetCodeObjDisplayName, setCodeObjDisplayNameHandler(deps))
	return nil
}

func getLatestProjectStateHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[GetLatestProjectStateRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		if deps.ProjectState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		snapshot, frontendOps, err := deps.ProjectState.SnapshotAndConsumeFrontendOps()
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		projectStateView, err := projectview.SingleConfigByProjectID(snapshot.Document, projectID)
		if err != nil {
			writeProjectRouteStateError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, ProjectStateSingleConfigWithCompletedOpIDs{
			ProjectState:   projectStateView,
			CompletedOpIDs: frontendOps.Completed,
			PendingOpIDs:   frontendOps.Pending,
		})
	}
}

func getPasswordParamValueHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[GetPasswordParamValueRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		if deps.ProjectState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		value, err := deps.ProjectState.GetPasswordParamValue(
			r.Context(),
			payload.ProjectID,
			payload.SectionID,
			payload.ParamInfoID,
		)
		if err != nil {
			writeGetPasswordParamValueError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, GetPasswordParamValueResponse{Value: value})
	}
}

func setParamEnteredValueHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetParamEnteredValueRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		sectionID := strings.TrimSpace(payload.SectionID)
		if sectionID == "" {
			writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
			return
		}
		paramInfoID := strings.TrimSpace(payload.ParamInfoID)
		if paramInfoID == "" {
			writeError(w, r, http.StatusBadRequest, "param_info_id_required", "Param info id is required.")
			return
		}
		if deps.ProjectState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if _, err := deps.ProjectState.SetSectionCodeObjectValue(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			sectionID,
			paramInfoID,
			payload.Value,
		); err != nil {
			writeParamValueMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func updateParamImplConfigHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[UpdateParamImplConfigRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		sectionID := strings.TrimSpace(payload.SectionID)
		if sectionID == "" {
			writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
			return
		}
		paramInfoID := strings.TrimSpace(payload.ParamInfoID)
		if paramInfoID == "" {
			writeError(w, r, http.StatusBadRequest, "param_info_id_required", "Param info id is required.")
			return
		}
		if deps.ProjectState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if _, err := deps.ProjectState.UpdateParamImplConfig(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			sectionID,
			paramInfoID,
			payload.NewConfig,
		); err != nil {
			writeUpdateParamImplConfigError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setCodeObjNameHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetCodeObjNameRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		codeObjID := strings.TrimSpace(payload.CodeObjID)
		if codeObjID == "" {
			writeError(w, r, http.StatusBadRequest, "code_obj_id_required", "Code object id is required.")
			return
		}
		if deps.ProjectState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if _, err := deps.ProjectState.SetCodeObjectName(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			codeObjID,
			payload.Name,
		); err != nil {
			writeCodeObjNameMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setCodeObjDisplayNameHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetCodeObjDisplayNameRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		codeObjID := strings.TrimSpace(payload.CodeObjID)
		if codeObjID == "" {
			writeError(w, r, http.StatusBadRequest, "code_obj_id_required", "Code object id is required.")
			return
		}
		if deps.ProjectState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if _, err := deps.ProjectState.SetCodeObjectDisplayName(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			codeObjID,
			payload.DisplayName,
		); err != nil {
			writeCodeObjDisplayNameMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setCodeSectionAttachedTerminalHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetCodeSectionAttachedTerminalRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		sectionID := strings.TrimSpace(payload.SectionID)
		if sectionID == "" {
			writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
			return
		}
		if deps.ProjectState == nil || deps.SettingsState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		settings, err := resolveStructuralMutationSettingsFromRuntime(deps.SettingsState)
		if err != nil {
			writeCodeSectionAttachedTerminalError(w, r, err)
			return
		}
		if _, err := deps.ProjectState.SetCodeSectionAttachedTerminal(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			sectionID,
			payload.TerminalSectionID,
			settings,
		); err != nil {
			writeCodeSectionAttachedTerminalError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func deleteSectionVariantOrAskHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[DeleteSectionVariantOrAskRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		sectionID := strings.TrimSpace(payload.SectionID)
		if sectionID == "" {
			writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
			return
		}
		variantID := strings.TrimSpace(payload.VariantID)
		if variantID == "" {
			writeError(w, r, http.StatusBadRequest, "variant_id_required", "Variant id is required.")
			return
		}
		if deps.ProjectState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		promptPath, requiresPrompt, err := deps.ProjectState.DeleteSectionVariantPromptPath(r.Context(), projectID, sectionID, variantID)
		if err != nil {
			writeDeleteSectionVariantError(w, r, err)
			return
		}
		if requiresPrompt {
			resolvedPath, err := statefs.ResolveWithinRoot(deps.WorkspaceRoot, promptPath, "File path")
			if err != nil {
				writeError(w, r, http.StatusForbidden, "filepath_forbidden", "File path must be within the project root.")
				return
			}
			writeJSON(w, http.StatusOK, resolvedPath)
			return
		}

		if _, err := deps.ProjectState.DeleteSectionVariant(r.Context(), projectID, sectionID, variantID); err != nil {
			writeDeleteSectionVariantError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func deleteJSONSourceFileAndVariantHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[DeleteJSONSourceFileAndVariantRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		sectionID := strings.TrimSpace(payload.SectionID)
		if sectionID == "" {
			writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
			return
		}
		variantID := strings.TrimSpace(payload.VariantID)
		if variantID == "" {
			writeError(w, r, http.StatusBadRequest, "variant_id_required", "Variant id is required.")
			return
		}
		if deps.ProjectState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		promptPath, requiresPrompt, err := deps.ProjectState.DeleteSectionVariantPromptPath(r.Context(), projectID, sectionID, variantID)
		if err != nil {
			writeDeleteSectionVariantError(w, r, err)
			return
		}
		if !requiresPrompt {
			writeError(w, r, http.StatusUnprocessableEntity, "json_source_variant_required", "Section variant must resolve to a JSON source variant.")
			return
		}

		resolvedPath, err := statefs.ResolveWithinRoot(deps.WorkspaceRoot, promptPath, "File path")
		if err != nil {
			writeError(w, r, http.StatusForbidden, "filepath_forbidden", "File path must be within the project root.")
			return
		}
		if err := os.Remove(resolvedPath); err != nil {
			if errors.Is(err, os.ErrNotExist) {
				writeJSON(w, http.StatusOK, nil)
				return
			}
			writeJSON(w, http.StatusOK, nil)
			return
		}

		if _, err := deps.ProjectState.DeleteSectionVariant(r.Context(), projectID, sectionID, variantID); err != nil {
			writeDeleteSectionVariantError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func deleteSectionsHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[DeleteSectionsRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		if deps.ProjectState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if _, _, err := deps.ProjectState.DeleteSections(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			projectstate.DeleteSectionsInput{SectionIDs: payload.SectionIDs},
		); err != nil {
			writeDeleteSectionsError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func deleteSelectedParamsHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[DeleteSelectedParamsRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		if deps.ProjectState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if _, _, err := deps.ProjectState.DeleteSelectedParams(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			projectstate.DeleteSelectedParamsInput{
				SectionID:    payload.SectionID,
				ParamInfoIDs: payload.ParamInfoIDs,
			},
		); err != nil {
			writeParamSelectionMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func addKwargHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[AddKwargRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		sectionID := strings.TrimSpace(payload.SectionID)
		if sectionID == "" {
			writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
			return
		}
		if deps.ProjectState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if _, _, err := deps.ProjectState.AddKwarg(projectMutationContext(r.Context(), nil), projectID, sectionID); err != nil {
			writeKwargMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func deleteKwargHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[DeleteKwargRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		sectionID := strings.TrimSpace(payload.SectionID)
		if sectionID == "" {
			writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
			return
		}
		if deps.ProjectState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if _, _, err := deps.ProjectState.DeleteKwarg(projectMutationContext(r.Context(), nil), projectID, sectionID); err != nil {
			writeKwargMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func createTopLevelSectionHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[CreateTopLevelSectionRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		if deps.ProjectState == nil || deps.SettingsState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		settings, err := resolveStructuralMutationSettingsFromRuntime(deps.SettingsState)
		if err != nil {
			writeCreateTopLevelSectionError(w, r, err)
			return
		}

		_, result, err := deps.ProjectState.CreateTopLevelSection(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			projectstate.CreateTopLevelSectionInput{
				ImplType:           payload.ImplType,
				ControlCodeObjType: payload.ControlCodeObjType,
				ImplOverrides:      payload.ImplOverrides,
				Position:           payload.Position,
			},
			settings,
		)
		if err != nil {
			writeCreateTopLevelSectionError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, result)
	}
}

func setShowParamDisplayNamesHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetShowParamDisplayNamesRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		if deps.ProjectState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if _, err := deps.ProjectState.SetShowParamDisplayNames(projectMutationContext(r.Context(), payload.FrontendOpID), projectID, payload.ShowParamDisplayNames); err != nil {
			writeProjectLayoutMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setSectionSizesHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetSectionSizesRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		if deps.ProjectState == nil || deps.SettingsState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		settings, err := resolveStructuralMutationSettingsFromRuntime(deps.SettingsState)
		if err != nil {
			writeProjectLayoutMutationError(w, r, err)
			return
		}

		sectionSizes := make(map[string]projectstate.SectionSize, len(payload.SectionSizes))
		for sectionID, size := range payload.SectionSizes {
			sectionSizes[sectionID] = size.ProjectStateValue()
		}
		if _, err := deps.ProjectState.SetSectionSizes(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			sectionSizes,
			settings,
		); err != nil {
			writeProjectLayoutMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setSectionNameHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetSectionNameRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		if deps.RenameRefactors == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if err := deps.RenameRefactors.SetSectionName(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			payload.ProjectID,
			payload.SectionID,
			payload.Name,
		); err != nil {
			writeSectionNameMutationError(w, r, err)
			return
		}

		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	}
}

func acceptRenameRefactorHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[AcceptRenameRefactorRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		if deps.RenameRefactors == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if err := deps.RenameRefactors.AcceptRenameRefactor(r.Context(), payload.ProjectID, payload.FrontendOpID); err != nil {
			writeRenameRefactorMutationError(w, r, err)
			return
		}

		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	}
}

func declineRenameRefactorHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[DeclineRenameRefactorRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		if deps.RenameRefactors == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if err := deps.RenameRefactors.DeclineRenameRefactor(r.Context(), payload.ProjectID, payload.FrontendOpID); err != nil {
			writeRenameRefactorMutationError(w, r, err)
			return
		}

		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	}
}

func createViewModeHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[CreateViewModeRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		if deps.ProjectState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		_, viewModeID, err := deps.ProjectState.CreateViewMode(projectMutationContext(r.Context(), payload.FrontendOpID), projectID)
		if err != nil {
			writeProjectLayoutMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, viewModeID)
	}
}

func setActiveViewModeHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetActiveViewModeRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		activeViewModeID := strings.TrimSpace(payload.ActiveViewModeID)
		if activeViewModeID == "" {
			writeError(w, r, http.StatusBadRequest, "view_mode_id_required", "View mode id is required.")
			return
		}
		if deps.ProjectState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if _, err := deps.ProjectState.SetActiveViewMode(projectMutationContext(r.Context(), payload.FrontendOpID), projectID, activeViewModeID); err != nil {
			writeViewModeMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func toggleIsEditingViewModeHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[ToggleIsEditingViewModeRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		if deps.ProjectState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if _, err := deps.ProjectState.ToggleIsEditingViewMode(projectMutationContext(r.Context(), payload.FrontendOpID), projectID); err != nil {
			writeProjectLayoutMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func toggleSectionVisibilityHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[ToggleSectionVisibilityRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		if deps.ProjectState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if _, err := deps.ProjectState.ToggleSectionVisibility(projectMutationContext(r.Context(), payload.FrontendOpID), projectID, payload.SectionIDs); err != nil {
			writeViewModeMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func groupSectionsHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[GroupSectionsRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		if deps.ProjectState == nil || deps.SettingsState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		settings, err := resolveStructuralMutationSettingsFromRuntime(deps.SettingsState)
		if err != nil {
			writeGroupSectionsError(w, r, err)
			return
		}
		if _, err := deps.ProjectState.GroupSections(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			projectstate.GroupSectionsInput{SectionIDs: payload.SectionIDs},
			settings,
		); err != nil {
			writeGroupSectionsError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func ungroupGroupsHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[UngroupGroupsRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		if deps.ProjectState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if _, err := deps.ProjectState.UngroupGroups(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			projectstate.UngroupGroupsInput{GroupIDs: payload.GroupIDs},
		); err != nil {
			writeUngroupGroupsError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func toggleViewModeUserFacingHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[ToggleViewModeUserFacingRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		viewModeID := strings.TrimSpace(payload.ViewModeID)
		if viewModeID == "" {
			writeError(w, r, http.StatusBadRequest, "view_mode_id_required", "View mode id is required.")
			return
		}
		if deps.ProjectState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if _, err := deps.ProjectState.ToggleViewModeUserFacing(projectMutationContext(r.Context(), payload.FrontendOpID), projectID, viewModeID); err != nil {
			writeViewModeMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func toggleViewModeTabHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[ToggleViewModeTabRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		viewModeID := strings.TrimSpace(payload.ViewModeID)
		if viewModeID == "" {
			writeError(w, r, http.StatusBadRequest, "view_mode_id_required", "View mode id is required.")
			return
		}
		if deps.ProjectState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if _, err := deps.ProjectState.ToggleViewModeTab(projectMutationContext(r.Context(), payload.FrontendOpID), projectID, viewModeID); err != nil {
			writeViewModeMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setViewModeNameHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetViewModeNameRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		viewModeID := strings.TrimSpace(payload.ViewModeID)
		if viewModeID == "" {
			writeError(w, r, http.StatusBadRequest, "view_mode_id_required", "View mode id is required.")
			return
		}
		if deps.ProjectState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if _, err := deps.ProjectState.SetViewModeName(projectMutationContext(r.Context(), payload.FrontendOpID), projectID, viewModeID, payload.Name); err != nil {
			writeViewModeMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setViewModeSortOrderHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetViewModeSortOrderRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		if deps.ProjectState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if _, err := deps.ProjectState.SetViewModeSortOrder(projectMutationContext(r.Context(), payload.FrontendOpID), projectID, payload.OrderedViewModeIDs); err != nil {
			writeViewModeMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func deleteViewModeHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[DeleteViewModeRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		viewModeID := strings.TrimSpace(payload.ViewModeID)
		if viewModeID == "" {
			writeError(w, r, http.StatusBadRequest, "view_mode_id_required", "View mode id is required.")
			return
		}
		if deps.ProjectState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if _, err := deps.ProjectState.DeleteViewMode(projectMutationContext(r.Context(), payload.FrontendOpID), projectID, viewModeID); err != nil {
			writeViewModeMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setTopLevelSectionLayoutHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetTopLevelSectionLayoutRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		if deps.ProjectState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if _, err := deps.ProjectState.SetTopLevelSectionLayout(projectMutationContext(r.Context(), payload.FrontendOpID), projectID, payload.TopLevelSections); err != nil {
			writeProjectLayoutMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func autoLayoutTopLevelSectionsHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[AutoLayoutTopLevelSectionsRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		if deps.ProjectState == nil || deps.SettingsState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		margin := 50
		if payload.Margin != nil {
			margin = *payload.Margin
		}
		settings, err := resolveStructuralMutationSettingsFromRuntime(deps.SettingsState)
		if err != nil {
			writeAutoLayoutError(w, r, err)
			return
		}
		if _, err := deps.ProjectState.AutoLayoutTopLevelSections(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			settings,
			margin,
		); err != nil {
			writeAutoLayoutError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func togglePositionLocksHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[TogglePositionLocksRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		if deps.ProjectState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if _, err := deps.ProjectState.TogglePositionLocks(projectMutationContext(r.Context(), payload.FrontendOpID), projectID, payload.SectionIDs); err != nil {
			writeProjectLayoutMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func toggleMinimizedHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[ToggleMinimizedRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		sectionID := strings.TrimSpace(payload.SectionID)
		if sectionID == "" {
			writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
			return
		}
		if deps.ProjectState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if _, err := deps.ProjectState.ToggleMinimized(projectMutationContext(r.Context(), payload.FrontendOpID), projectID, sectionID); err != nil {
			writeProjectLayoutMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setCallableHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetCallableRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		sectionID := strings.TrimSpace(payload.SectionID)
		if sectionID == "" {
			writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
			return
		}
		if deps.ProjectState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		_, response, err := deps.ProjectState.SetCallable(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			sectionID,
			payload.CallableName,
			payload.RefetchParams,
			deps.CallableSignatures,
		)
		if err != nil {
			writeSetCallableError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, response)
	}
}

func setActiveIDsHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetActiveIDsRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		if deps.ProjectState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if _, err := deps.ProjectState.SetActiveIDs(projectMutationContext(r.Context(), payload.FrontendOpID), projectID, payload.ActiveIDs); err != nil {
			writeProjectLayoutMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setViewportHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetViewportRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		if deps.ProjectState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if _, err := deps.ProjectState.SetViewport(projectMutationContext(r.Context(), payload.FrontendOpID), projectID, payload.Viewport); err != nil {
			writeProjectLayoutMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setCodeHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetCodeRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		sectionID := strings.TrimSpace(payload.SectionID)
		if sectionID == "" {
			writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
			return
		}
		if deps.CodeUpdates == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if err := deps.CodeUpdates.SetCode(projectMutationContext(r.Context(), payload.FrontendOpID), projectID, sectionID, payload.Code); err != nil {
			writeSetCodeError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setCodeFileBindingHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetCodeFileBindingRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		sectionID := strings.TrimSpace(payload.SectionID)
		if sectionID == "" {
			writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
			return
		}
		if deps.ProjectState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if _, err := deps.ProjectState.SetCodeFileBinding(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			sectionID,
			projectstate.CodeFileBinding{
				Path:       payload.Binding.CanonicalPath,
				AccessMode: payload.Binding.AccessMode,
			},
		); err != nil {
			writeSetCodeFileBindingError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func formatCodeHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[FormatCodeRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		sectionID := strings.TrimSpace(payload.SectionID)
		if sectionID == "" {
			writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
			return
		}
		if deps.CodeUpdates == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if err := deps.CodeUpdates.FormatCode(projectMutationContext(r.Context(), payload.FrontendOpID), projectID, sectionID); err != nil {
			writeFormatCodeError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setSectionTagColorHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetSectionTagColorRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		sectionID := strings.TrimSpace(payload.SectionID)
		if sectionID == "" {
			writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
			return
		}
		if deps.ProjectState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if _, err := deps.ProjectState.SetSectionTagColor(projectMutationContext(r.Context(), payload.FrontendOpID), projectID, sectionID, payload.TagColor); err != nil {
			writeProjectLayoutMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setSectionStyleColorHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetSectionStyleColorRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		sectionID := strings.TrimSpace(payload.SectionID)
		if sectionID == "" {
			writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
			return
		}
		if deps.ProjectState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if _, err := deps.ProjectState.SetSectionStyleColor(projectMutationContext(r.Context(), payload.FrontendOpID), projectID, sectionID, payload.StyleColor); err != nil {
			writeProjectLayoutMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setSectionParamFilterHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetSectionParamFilterRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		sectionID := strings.TrimSpace(payload.SectionID)
		if sectionID == "" {
			writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
			return
		}
		if deps.ProjectState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if _, err := deps.ProjectState.SetSectionParamFilter(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			sectionID,
			payload.Value,
		); err != nil {
			writeProjectLayoutMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setMetaControlShowSectionTitleHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetMetaControlShowSectionTitleRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		sectionID := strings.TrimSpace(payload.SectionID)
		if sectionID == "" {
			writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
			return
		}
		if deps.ProjectState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if _, err := deps.ProjectState.SetMetaControlShowSectionTitle(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			sectionID,
			payload.ShowSectionTitle,
		); err != nil {
			writeProjectLayoutMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setCallableHideParamsHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetCallableHideParamsRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		sectionID := strings.TrimSpace(payload.SectionID)
		if sectionID == "" {
			writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
			return
		}
		if deps.ProjectState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if _, err := deps.ProjectState.SetCallableHideParams(projectMutationContext(r.Context(), payload.FrontendOpID), projectID, sectionID, payload.HideParams); err != nil {
			writeProjectLayoutMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setGroupOverflowModeHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetGroupOverflowModeRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		sectionID := strings.TrimSpace(payload.SectionID)
		if sectionID == "" {
			writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
			return
		}
		if deps.ProjectState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if _, err := deps.ProjectState.SetGroupOverflowMode(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			sectionID,
			payload.OverflowMode,
		); err != nil {
			writeProjectLayoutMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setSectionColumnWidthHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetSectionColumnWidthRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		sectionID := strings.TrimSpace(payload.SectionID)
		if sectionID == "" {
			writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
			return
		}
		if deps.ProjectState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if _, err := deps.ProjectState.SetSectionColumnWidth(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			sectionID,
			payload.ColumnWidth,
		); err != nil {
			writeProjectLayoutMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setSectionEdgeInputsHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetSectionEdgeInputsRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		sectionID := strings.TrimSpace(payload.SectionID)
		if sectionID == "" {
			writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
			return
		}
		if deps.ProjectState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if _, err := deps.ProjectState.SetSectionEdgeInputs(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			sectionID,
			payload.EdgeInputParams,
		); err != nil {
			writeSectionEdgeMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setSectionEdgeOutputsHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetSectionEdgeOutputsRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		sectionID := strings.TrimSpace(payload.SectionID)
		if sectionID == "" {
			writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
			return
		}
		if deps.ProjectState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if _, err := deps.ProjectState.SetSectionEdgeOutputs(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			sectionID,
			payload.EdgeOutputPorts,
		); err != nil {
			writeSectionEdgeMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setParentDefaultChildSectionTypeHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetParentDefaultChildSectionTypeRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		sectionID := strings.TrimSpace(payload.SectionID)
		if sectionID == "" {
			writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
			return
		}
		if deps.ProjectState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if _, err := deps.ProjectState.SetParentDefaultChildSectionType(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			sectionID,
			payload.DefaultChildSectionType,
		); err != nil {
			writeProjectLayoutMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setListRootViewModeHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetListRootViewModeRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		sectionID := strings.TrimSpace(payload.SectionID)
		if sectionID == "" {
			writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
			return
		}
		if deps.ProjectState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if _, err := deps.ProjectState.SetListRootViewMode(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			sectionID,
			payload.ViewMode,
		); err != nil {
			writeProjectLayoutMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setSectionHideUnpinnedParamsHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetSectionHideUnpinnedParamsRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		sectionID := strings.TrimSpace(payload.SectionID)
		if sectionID == "" {
			writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
			return
		}
		if deps.ProjectState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if _, err := deps.ProjectState.SetSectionHideUnpinnedParams(projectMutationContext(r.Context(), payload.FrontendOpID), projectID, sectionID, payload.HideUnpinnedParams); err != nil {
			writeProjectLayoutMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setSectionPinnedParamsHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetSectionPinnedParamsRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		sectionID := strings.TrimSpace(payload.SectionID)
		if sectionID == "" {
			writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
			return
		}
		if deps.ProjectState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if _, err := deps.ProjectState.SetSectionPinnedParams(projectMutationContext(r.Context(), payload.FrontendOpID), projectID, sectionID, payload.PinnedParams); err != nil {
			writeProjectLayoutMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func toggleParamSelectedHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[ToggleParamSelectedRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		if deps.ProjectState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if _, err := deps.ProjectState.ToggleParamSelected(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			projectstate.ToggleParamSelectedInput{
				SectionID:   payload.SectionID,
				ParamInfoID: payload.ParamInfoID,
			},
		); err != nil {
			writeParamSelectionMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func unselectAllParamsHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[UnselectAllParamsRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		if deps.ProjectState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if _, err := deps.ProjectState.UnselectAllParams(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
		); err != nil {
			writeParamSelectionMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setBrowserColumnWidthsHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetBrowserColumnWidthsRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		sectionID := strings.TrimSpace(payload.SectionID)
		if sectionID == "" {
			writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
			return
		}
		if deps.ProjectState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if _, err := deps.ProjectState.SetBrowserColumnWidths(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			sectionID,
			payload.ColumnWidth,
			payload.TypesColumnWidth,
		); err != nil {
			writeBrowserSectionMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setBrowserAreaViewModeHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetBrowserAreaViewModeRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		sectionID := strings.TrimSpace(payload.SectionID)
		if sectionID == "" {
			writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
			return
		}
		if deps.ProjectState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if _, err := deps.ProjectState.SetBrowserAreaViewMode(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			sectionID,
			payload.ViewMode,
		); err != nil {
			writeBrowserSectionMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setBrowserHideColumnHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetBrowserHideColumnRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		sectionID := strings.TrimSpace(payload.SectionID)
		if sectionID == "" {
			writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
			return
		}
		if deps.ProjectState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if _, err := deps.ProjectState.SetBrowserHideColumn(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			sectionID,
			payload.HideColumn,
		); err != nil {
			writeBrowserSectionMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setBrowserSavedSearchesHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetBrowserSavedSearchesRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		sectionID := strings.TrimSpace(payload.SectionID)
		if sectionID == "" {
			writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
			return
		}
		if deps.ProjectState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if _, err := deps.ProjectState.SetBrowserSavedSearches(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			sectionID,
			payload.SavedSearches,
		); err != nil {
			writeBrowserSectionMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setChatSectionSettingsHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetChatSectionSettingsRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		sectionID := strings.TrimSpace(payload.SectionID)
		if sectionID == "" {
			writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
			return
		}
		if deps.ProjectState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		settings := projectstate.ChatSectionSettings{
			Managed:                payload.Managed,
			EngineConfigID:         payload.EngineConfigID,
			TranscriptionProfileID: payload.TranscriptionProfileID,
			AgentProfileID:         payload.AgentProfileID,
			Thinking:               payload.Thinking,
			PermissionMode:         payload.PermissionMode,
			SearchEnabled:          payload.SearchEnabled,
			DictationMode:          payload.DictationMode,
		}
		if _, err := deps.ProjectState.SetChatSectionSettings(projectMutationContext(r.Context(), payload.FrontendOpID), projectID, sectionID, settings); err != nil {
			writeChatSectionMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setChatSectionStateHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetChatSectionStateRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		sectionID := strings.TrimSpace(payload.SectionID)
		if sectionID == "" {
			writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
			return
		}
		if deps.ProjectState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if _, err := deps.ProjectState.SetChatSectionState(projectMutationContext(r.Context(), payload.FrontendOpID), projectID, sectionID, payload.State); err != nil {
			writeChatSectionMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func getChatSectionChatIDHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[GetChatSectionChatIDRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		sectionID := strings.TrimSpace(payload.SectionID)
		if sectionID == "" {
			writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
			return
		}
		if deps.ChatSectionChatIDs == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		chatID, err := deps.ChatSectionChatIDs.GetChatID(r.Context(), projectID, sectionID)
		if err != nil {
			writeChatSectionMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, chatID)
	}
}

func setChatSectionChatIDHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetChatSectionChatIDRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		sectionID := strings.TrimSpace(payload.SectionID)
		if sectionID == "" {
			writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
			return
		}
		if deps.ProjectState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if _, err := deps.ProjectState.SetChatSectionChatID(projectMutationContext(r.Context(), payload.FrontendOpID), projectID, sectionID, payload.ChatID); err != nil {
			writeChatSectionMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setProjectConfigCodegenTargetsHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetProjectConfigCodegenTargetsRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		if deps.ProjectState == nil || deps.CodegenTargetValidator == nil || deps.PythonCodegenSectionReconciler == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		targets, err := decodeProjectCodegenTargets(payload.CodegenTargets)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_project_codegen_targets", err.Error())
			return
		}

		snapshot, err := deps.ProjectState.SetProjectCodegenTargets(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			targets,
			deps.CodegenTargetValidator,
			deps.PythonCodegenSectionReconciler,
		)
		if err != nil {
			writeSetProjectConfigCodegenTargetsError(w, r, err)
			return
		}

		projectStateView, err := projectview.SingleConfigByProjectID(snapshot.Document, projectID)
		if err != nil {
			writeSetProjectConfigCodegenTargetsError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, projectStateView)
	}
}

func setWatchCodeEnabledHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetWatchCodeEnabledRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		if deps.ProjectState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if _, err := deps.ProjectState.SetWatchCodeEnabled(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			payload.Enabled,
			deps.WorkspaceRoot,
		); err != nil {
			writeSetWatchCodeError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setWatchCodeInputsHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetWatchCodeInputsRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		if deps.ProjectState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if _, err := deps.ProjectState.SetWatchCodeInputs(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			payload.WatchCodeFolders,
			payload.WatchCodeFiles,
			deps.WorkspaceRoot,
		); err != nil {
			writeSetWatchCodeError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func decodeProjectCodegenTargets(payloads []json.RawMessage) ([]projectstate.ProjectCodegenTarget, error) {
	targets := make([]projectstate.ProjectCodegenTarget, 0, len(payloads))
	for _, payload := range payloads {
		target, err := decodeProjectCodegenTarget(payload)
		if err != nil {
			return nil, err
		}
		targets = append(targets, target)
	}
	return targets, nil
}

func decodeProjectCodegenTarget(payload json.RawMessage) (projectstate.ProjectCodegenTarget, error) {
	trimmedPayload := bytes.TrimSpace(payload)
	if len(trimmedPayload) == 0 {
		return projectstate.ProjectCodegenTarget{}, ErrProjectCodegenTargetObjectRequired
	}

	var object map[string]json.RawMessage
	if err := json.Unmarshal(trimmedPayload, &object); err != nil {
		return projectstate.ProjectCodegenTarget{}, err
	}
	if object == nil {
		return projectstate.ProjectCodegenTarget{}, ErrProjectCodegenTargetObjectRequired
	}

	languagePayload, ok := object["language"]
	if !ok {
		return projectstate.ProjectCodegenTarget{}, ErrProjectCodegenTargetLanguageRequired
	}

	var language string
	if err := json.Unmarshal(languagePayload, &language); err != nil {
		return projectstate.ProjectCodegenTarget{}, ErrProjectCodegenTargetLanguageRequired
	}
	language = strings.TrimSpace(language)
	if language == "" {
		return projectstate.ProjectCodegenTarget{}, ErrProjectCodegenTargetLanguageRequired
	}

	return projectstate.ProjectCodegenTarget{
		Language: language,
		Payload:  append(projectstate.RawJSON(nil), trimmedPayload...),
	}, nil
}

func writeProjectRouteStateError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectview.ErrProjectConfigIDRequired),
		errors.Is(err, projectstate.ErrProjectIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func writeGetPasswordParamValueError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrProjectIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrSectionIDRequired):
		writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
	case errors.Is(err, projectstate.ErrCodeObjIDRequired):
		writeError(w, r, http.StatusBadRequest, "param_info_id_required", "Param info id is required.")
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, projectstate.ErrSectionNotFound):
		writeError(w, r, http.StatusNotFound, "section_not_found", "Section not found.")
	case errors.Is(err, projectstate.ErrCodeObjNotFound):
		writeError(w, r, http.StatusNotFound, "param_info_not_found", "Param info not found.")
	case errors.Is(err, projectstate.ErrPasswordParamRequired):
		writeError(w, r, http.StatusUnprocessableEntity, "password_param_required", "Param info must resolve to a password param.")
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func writeParamValueMutationError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrProjectIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrSectionIDRequired):
		writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
	case errors.Is(err, projectstate.ErrCodeObjIDRequired):
		writeError(w, r, http.StatusBadRequest, "param_info_id_required", "Param info id is required.")
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, projectstate.ErrSectionNotFound):
		writeError(w, r, http.StatusNotFound, "section_not_found", "Section not found.")
	case errors.Is(err, projectstate.ErrCodeObjNotFound):
		writeError(w, r, http.StatusNotFound, "param_info_not_found", "Param info not found.")
	case errors.Is(err, projectstate.ErrCodeObjectValueMutationUnsupported):
		writeError(w, r, http.StatusUnprocessableEntity, "param_value_mutation_unsupported", err.Error())
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func writeUpdateParamImplConfigError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrProjectIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrSectionIDRequired):
		writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
	case errors.Is(err, projectstate.ErrCodeObjIDRequired):
		writeError(w, r, http.StatusBadRequest, "param_info_id_required", "Param info id is required.")
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, projectstate.ErrSectionNotFound):
		writeError(w, r, http.StatusNotFound, "section_not_found", "Section not found.")
	case errors.Is(err, projectstate.ErrCodeObjNotFound):
		writeError(w, r, http.StatusNotFound, "param_info_not_found", "Param info not found.")
	case errors.Is(err, projectstate.ErrUpdateParamImplConfigUnsupported):
		writeError(w, r, http.StatusUnprocessableEntity, "param_impl_config_unsupported", err.Error())
	case errors.Is(err, projectstate.ErrUpdateParamImplConfigFieldUnsupported),
		errors.Is(err, projectstate.ErrUpdateParamImplConfigFieldInvalid):
		writeError(w, r, http.StatusUnprocessableEntity, "param_impl_config_invalid", err.Error())
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func writeCodeObjNameMutationError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrProjectIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrCodeObjIDRequired):
		writeError(w, r, http.StatusBadRequest, "code_obj_id_required", "Code object id is required.")
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, projectstate.ErrCodeObjNotFound):
		writeError(w, r, http.StatusNotFound, "code_obj_not_found", "Code object not found.")
	case errors.Is(err, projectstate.ErrCodeObjActiveReferenceNotFound):
		writeError(w, r, http.StatusUnprocessableEntity, "code_obj_active_reference_not_found", err.Error())
	case errors.Is(err, projectstate.ErrCodeObjRenameUnsupported):
		writeError(w, r, http.StatusUnprocessableEntity, "code_obj_rename_unsupported", err.Error())
	case projectstate.IsInvalidCodeObjectNameError(err):
		writeError(w, r, http.StatusUnprocessableEntity, "invalid_code_obj_name", err.Error())
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func writeCodeObjDisplayNameMutationError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrProjectIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrCodeObjIDRequired):
		writeError(w, r, http.StatusBadRequest, "code_obj_id_required", "Code object id is required.")
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, projectstate.ErrCodeObjNotFound):
		writeError(w, r, http.StatusNotFound, "code_obj_not_found", "Code object not found.")
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func writeCodeSectionAttachedTerminalError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrCodeSectionRequired):
		writeError(w, r, http.StatusBadRequest, "invalid_code_section", "Section must resolve to a code section.")
	case errors.Is(err, projectstate.ErrTerminalSectionRequired):
		writeError(w, r, http.StatusBadRequest, "invalid_terminal_section", "Section must resolve to a terminal section.")
	case errors.Is(err, projectstate.ErrCodeSectionAttachedTerminalConflict),
		errors.Is(err, projectstate.ErrCodeSectionMultipleChildren):
		writeError(w, r, http.StatusUnprocessableEntity, "attached_terminal_invalid", err.Error())
	default:
		writeProjectLayoutMutationError(w, r, err)
	}
}

func writeDeleteSectionVariantError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrProjectIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrSectionIDRequired):
		writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
	case errors.Is(err, projectstate.ErrSectionVariantIDRequired):
		writeError(w, r, http.StatusBadRequest, "variant_id_required", "Variant id is required.")
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, projectstate.ErrSectionNotFound):
		writeError(w, r, http.StatusNotFound, "section_not_found", "Section not found.")
	case errors.Is(err, projectstate.ErrSectionVariantNotFound),
		errors.Is(err, projectstate.ErrSectionVariantMembership):
		writeError(w, r, http.StatusNotFound, "variant_not_found", "Variant not found.")
	case errors.Is(err, projectstate.ErrSectionVariantDeletePromptPathRequired):
		writeError(w, r, http.StatusUnprocessableEntity, "json_source_filepath_required", "JSON source variants must have a file path.")
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func writeDeleteSectionsError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrProjectIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrDeleteSectionsSectionIDsRequired),
		errors.Is(err, projectstate.ErrDeleteSectionsSectionIDBlank):
		writeError(w, r, http.StatusBadRequest, "section_ids_invalid", err.Error())
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, projectstate.ErrSectionNotFound):
		writeError(w, r, http.StatusNotFound, "section_not_found", "Section not found.")
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func writeProjectLayoutMutationError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectview.ErrProjectConfigIDRequired),
		errors.Is(err, projectstate.ErrProjectIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrSectionIDRequired):
		writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, projectstate.ErrSectionNotFound):
		writeError(w, r, http.StatusNotFound, "section_not_found", "Section not found.")
	case errors.Is(err, projectstate.ErrGroupSectionRequired):
		writeError(w, r, http.StatusUnprocessableEntity, "group_section_required", "Section must resolve to a group section.")
	case errors.Is(err, projectstate.ErrDefaultChildSectionParentRequired):
		writeError(w, r, http.StatusUnprocessableEntity, "default_child_section_parent_required", "Section must resolve to a list root or group section.")
	case errors.Is(err, projectstate.ErrDefaultChildSectionTypeInvalid):
		writeError(w, r, http.StatusUnprocessableEntity, "default_child_section_type_invalid", err.Error())
	case errors.Is(err, projectstate.ErrListRootSectionRequired):
		writeError(w, r, http.StatusUnprocessableEntity, "list_root_section_required", "Section must resolve to a list root section.")
	case errors.Is(err, projectstate.ErrListRootViewModeInvalid):
		writeError(w, r, http.StatusUnprocessableEntity, "list_root_view_mode_invalid", err.Error())
	case errors.Is(err, projectstate.ErrSectionParamFilterUnsupported):
		writeError(w, r, http.StatusUnprocessableEntity, "section_param_filter_unsupported", err.Error())
	case errors.Is(err, projectstate.ErrMetaControlSectionRequired):
		writeError(w, r, http.StatusUnprocessableEntity, "meta_control_section_required", "Section must resolve to a meta control section.")
	case projectstate.IsInvalidAutoLayoutError(err),
		errors.Is(err, projectstate.ErrSettingsValueInvalid),
		errors.Is(err, settingsstate.ErrSettingsValueInvalid):
		writeError(w, r, http.StatusUnprocessableEntity, "invalid_auto_layout", err.Error())
	case errors.Is(err, projectstate.ErrSectionParamColumnWidthUnsupported):
		writeError(w, r, http.StatusUnprocessableEntity, "section_param_column_width_unsupported", err.Error())
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func writeSectionEdgeMutationError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrCodeObjIDRequired):
		writeError(w, r, http.StatusBadRequest, "param_info_id_required", "Param info id is required.")
	case errors.Is(err, projectstate.ErrCodeObjNotFound):
		writeError(w, r, http.StatusNotFound, "param_info_not_found", "Param info not found.")
	case errors.Is(err, projectstate.ErrSectionEdgeIOUnsupported):
		writeError(w, r, http.StatusUnprocessableEntity, "section_edge_io_unsupported", err.Error())
	case errors.Is(err, projectstate.ErrSectionEdgeInputParamUnsupported),
		errors.Is(err, projectstate.ErrChangeParamImplUnsupported),
		errors.Is(err, projectstate.ErrChangeParamImplCodeObjTypeNotAllowed):
		writeError(w, r, http.StatusUnprocessableEntity, "edge_input_param_invalid", err.Error())
	default:
		writeProjectLayoutMutationError(w, r, err)
	}
}

func writeGroupSectionsError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrProjectIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrGroupSectionsSectionIDsRequired),
		errors.Is(err, projectstate.ErrGroupSectionsSectionIDBlank):
		writeError(w, r, http.StatusBadRequest, "section_ids_invalid", err.Error())
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, projectstate.ErrSectionNotFound):
		writeError(w, r, http.StatusNotFound, "section_not_found", "Section not found.")
	case errors.Is(err, projectstate.ErrGroupSectionsParentMismatch),
		errors.Is(err, projectstate.ErrTopLevelSectionLayoutRequired),
		errors.Is(err, projectstate.ErrChildSectionParentIDRequired),
		errors.Is(err, projectstate.ErrChildSectionImplTypeRequired),
		errors.Is(err, projectstate.ErrChildSectionImplTypeUnsupported),
		errors.Is(err, projectstate.ErrChildSectionCountInvalid),
		errors.Is(err, projectstate.ErrChildSectionStartIdxInvalid),
		errors.Is(err, projectstate.ErrChildSectionParentUnsupported),
		errors.Is(err, projectstate.ErrCodeSectionChildTypeInvalid),
		errors.Is(err, projectstate.ErrCodeSectionChildCountInvalid),
		errors.Is(err, projectstate.ErrCodeSectionAlreadyHasChild):
		writeError(w, r, http.StatusUnprocessableEntity, "group_sections_invalid", err.Error())
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func writeUngroupGroupsError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrProjectIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrUngroupGroupsGroupIDsRequired),
		errors.Is(err, projectstate.ErrUngroupGroupsGroupIDBlank):
		writeError(w, r, http.StatusBadRequest, "group_ids_invalid", err.Error())
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, projectstate.ErrSectionNotFound):
		writeError(w, r, http.StatusNotFound, "section_not_found", "Section not found.")
	case errors.Is(err, projectstate.ErrGroupSectionRequired),
		errors.Is(err, projectstate.ErrTopLevelSectionLayoutRequired):
		writeError(w, r, http.StatusUnprocessableEntity, "ungroup_groups_invalid", err.Error())
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func writeParamSelectionMutationError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrProjectIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrSectionIDRequired):
		writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
	case errors.Is(err, projectstate.ErrCodeObjIDRequired):
		writeError(w, r, http.StatusBadRequest, "param_info_id_required", "Param info id is required.")
	case errors.Is(err, projectstate.ErrDeleteSelectedParamsParamIDBlank):
		writeError(w, r, http.StatusBadRequest, "param_info_ids_invalid", err.Error())
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, projectstate.ErrSectionNotFound):
		writeError(w, r, http.StatusNotFound, "section_not_found", "Section not found.")
	case errors.Is(err, projectstate.ErrCodeObjNotFound):
		writeError(w, r, http.StatusNotFound, "param_info_not_found", "Param info not found.")
	case errors.Is(err, projectstate.ErrParamSelectionUnsupported),
		errors.Is(err, projectstate.ErrParamSelectionTargetUnsupported),
		errors.Is(err, projectstate.ErrDeleteSelectedParamsUnsupported),
		errors.Is(err, projectstate.ErrDeleteSelectedParamsRootMissing),
		errors.Is(err, projectstate.ErrDeleteSelectedParamsParamUnsupported),
		errors.Is(err, projectstate.ErrDeleteSelectedParamsParentMissing),
		errors.Is(err, projectstate.ErrDeleteSelectedParamsParentUnsupported):
		writeError(w, r, http.StatusUnprocessableEntity, "param_selection_invalid", err.Error())
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func writeKwargMutationError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrAddKwargUnsupported),
		errors.Is(err, projectstate.ErrAddKwargCallableUnset),
		errors.Is(err, projectstate.ErrAddKwargParentTypeUnsupported),
		errors.Is(err, projectstate.ErrDeleteKwargUnsupported),
		errors.Is(err, projectstate.ErrDeleteKwargCallableUnset),
		errors.Is(err, projectstate.ErrDeleteKwargNoParams),
		errors.Is(err, projectstate.ErrDeleteKwargRootMissing),
		errors.Is(err, projectstate.ErrDeleteKwargParentUnsupported):
		writeError(w, r, http.StatusUnprocessableEntity, "kwarg_mutation_invalid", err.Error())
	default:
		writeProjectLayoutMutationError(w, r, err)
	}
}

func writeBrowserSectionMutationError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrBrowserSectionRequired):
		writeError(w, r, http.StatusUnprocessableEntity, "browser_section_required", "Section must resolve to a browser section.")
	case errors.Is(err, projectstate.ErrBrowserAreaViewModeInvalid):
		writeError(w, r, http.StatusBadRequest, "browser_area_view_mode_invalid", err.Error())
	case errors.Is(err, projectstate.ErrBrowserSearchScopeInvalid):
		writeError(w, r, http.StatusBadRequest, "browser_search_scope_invalid", err.Error())
	default:
		writeProjectLayoutMutationError(w, r, err)
	}
}

func writeChatSectionMutationError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrChatSectionRequired):
		writeError(w, r, http.StatusUnprocessableEntity, "chat_section_required", "Section must resolve to a chat section.")
	case errors.Is(err, projectstate.ErrChatPermissionModeInvalid):
		writeError(w, r, http.StatusBadRequest, "chat_permission_mode_invalid", err.Error())
	case errors.Is(err, projectstate.ErrChatDictationModeInvalid):
		writeError(w, r, http.StatusBadRequest, "chat_dictation_mode_invalid", err.Error())
	default:
		writeProjectLayoutMutationError(w, r, err)
	}
}

func writeCreateTopLevelSectionError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrProjectIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, projectstate.ErrTopLevelSectionImplTypeRequired):
		writeError(w, r, http.StatusBadRequest, "impl_type_required", "Top-level section implType is required.")
	case errors.Is(err, projectstate.ErrTopLevelSectionImplTypeUnsupported):
		writeError(w, r, http.StatusUnprocessableEntity, "impl_type_unsupported", err.Error())
	case errors.Is(err, projectstate.ErrTopLevelMetaControlCodeObjTypeUnsupported),
		errors.Is(err, projectstate.ErrTopLevelMetaControlCodeObjTypeNotAllowed):
		writeError(w, r, http.StatusUnprocessableEntity, "control_code_obj_type_invalid", err.Error())
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func writeSectionNameMutationError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectview.ErrProjectConfigIDRequired),
		errors.Is(err, projectstate.ErrProjectIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrSectionIDRequired):
		writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, projectstate.ErrSectionNotFound):
		writeError(w, r, http.StatusNotFound, "section_not_found", "Section not found.")
	case projectstate.IsInvalidSectionNameError(err):
		writeError(w, r, http.StatusUnprocessableEntity, "invalid_section_name", err.Error())
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func writeRenameRefactorMutationError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectview.ErrProjectConfigIDRequired),
		errors.Is(err, projectstate.ErrProjectIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrRenameRefactorFrontendOpRequired):
		writeError(w, r, http.StatusBadRequest, "frontend_op_id_required", "Frontend op id is required.")
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, projectstate.ErrRenameRefactorPendingNotFound):
		writeError(w, r, http.StatusNotFound, "rename_refactor_not_found", "Pending rename refactor not found.")
	case errors.Is(err, projectstate.ErrRenameRefactorProjectMismatch):
		writeError(w, r, http.StatusConflict, "rename_refactor_project_mismatch", err.Error())
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func writeAutoLayoutError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectview.ErrProjectConfigIDRequired),
		errors.Is(err, projectstate.ErrProjectIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case projectstate.IsInvalidAutoLayoutError(err),
		errors.Is(err, projectstate.ErrSettingsValueInvalid),
		errors.Is(err, settingsstate.ErrSettingsValueInvalid):
		writeError(w, r, http.StatusUnprocessableEntity, "invalid_auto_layout", err.Error())
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func writeViewModeMutationError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectview.ErrProjectConfigIDRequired),
		errors.Is(err, projectstate.ErrProjectIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrViewModeIDRequired):
		writeError(w, r, http.StatusBadRequest, "view_mode_id_required", "View mode id is required.")
	case errors.Is(err, projectstate.ErrSectionIDRequired):
		writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, projectstate.ErrViewModeNotFound):
		writeError(w, r, http.StatusNotFound, "view_mode_not_found", "View mode not found.")
	case errors.Is(err, projectstate.ErrSectionNotFound):
		writeError(w, r, http.StatusNotFound, "section_not_found", "Section not found.")
	case projectstate.IsInvalidViewModeNameError(err):
		writeError(w, r, http.StatusUnprocessableEntity, "invalid_view_mode_name", err.Error())
	case projectstate.IsInvalidViewModeSortOrderError(err):
		writeError(w, r, http.StatusUnprocessableEntity, "invalid_view_mode_sort_order", err.Error())
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func writeSetProjectConfigCodegenTargetsError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectview.ErrProjectConfigIDRequired),
		errors.Is(err, projectstate.ErrProjectIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, ErrProjectCodegenTargetObjectRequired),
		errors.Is(err, ErrProjectCodegenTargetLanguageRequired),
		errors.Is(err, projectstate.ErrFrontendPayloadInvalid),
		errors.Is(err, projectstate.ErrProjectCodegenTargetLanguage),
		errors.Is(err, projectstate.ErrProjectCodegenTargetDuplicateLanguage),
		errors.Is(err, projectstate.ErrProjectCodegenTargetValidatorRequired),
		errors.Is(err, projectstate.ErrProjectCodegenPythonReconcilerRequired):
		writeError(w, r, http.StatusBadRequest, "invalid_project_codegen_targets", err.Error())
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func writeSetCallableError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrProjectIDRequired),
		errors.Is(err, projectview.ErrProjectConfigIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrSectionIDRequired):
		writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, projectstate.ErrSectionNotFound):
		writeError(w, r, http.StatusNotFound, "section_not_found", "Section not found.")
	case errors.Is(err, projectstate.ErrCallableSectionRequired):
		writeError(w, r, http.StatusBadRequest, "invalid_callable_section", "Section must resolve to a callable section.")
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func writeSetCodeError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrProjectIDRequired),
		errors.Is(err, projectview.ErrProjectConfigIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrSectionIDRequired):
		writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, projectstate.ErrSectionNotFound):
		writeError(w, r, http.StatusNotFound, "section_not_found", "Section not found.")
	case errors.Is(err, projectstate.ErrCodeSectionReadOnly):
		writeError(w, r, http.StatusForbidden, "code_section_read_only", "Code section is read-only.")
	case errors.Is(err, projectstate.ErrCodeSectionRequired):
		writeError(w, r, http.StatusBadRequest, "invalid_code_section", "Section must resolve to a code section.")
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func writeSetCodeFileBindingError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrProjectIDRequired),
		errors.Is(err, projectview.ErrProjectConfigIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrSectionIDRequired):
		writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, projectstate.ErrSectionNotFound):
		writeError(w, r, http.StatusNotFound, "section_not_found", "Section not found.")
	case errors.Is(err, projectstate.ErrCodeSectionRequired):
		writeError(w, r, http.StatusBadRequest, "invalid_code_section", "Section must resolve to a code section.")
	case errors.Is(err, projectstate.ErrCodeFileBindingPathRequired):
		writeError(w, r, http.StatusBadRequest, "code_file_binding_path_required", "Code file binding path is required.")
	case errors.Is(err, projectstate.ErrCodeFileAccessModeInvalid):
		writeError(w, r, http.StatusBadRequest, "code_file_access_mode_invalid", err.Error())
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func writeFormatCodeError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrProjectIDRequired),
		errors.Is(err, projectview.ErrProjectConfigIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrSectionIDRequired):
		writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, projectstate.ErrSectionNotFound):
		writeError(w, r, http.StatusNotFound, "section_not_found", "Section not found.")
	case errors.Is(err, projectstate.ErrCodeSectionReadOnly):
		writeError(w, r, http.StatusForbidden, "code_section_read_only", "Code section is read-only.")
	case projectstate.IsFormatCodeError(err):
		writeError(w, r, http.StatusUnprocessableEntity, "invalid_format_code", err.Error())
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func writeSetWatchCodeError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrProjectIDRequired),
		errors.Is(err, projectview.ErrProjectConfigIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, projectstate.ErrWatchCodeWorkspaceRootRequired),
		errors.Is(err, projectstate.ErrWatchCodeInputPathInvalid):
		writeError(w, r, http.StatusBadRequest, "invalid_watch_code_input", err.Error())
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}
