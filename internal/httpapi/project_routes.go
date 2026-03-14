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
	"setta/internal/codegen"
	"setta/internal/deployments"
	"setta/internal/modes"
	"setta/internal/projectstate"
	"setta/internal/projectview"
	"setta/internal/settingsstate"
	"setta/internal/statefs"
)

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
	RouteSetPromptInputs                   = "/setPromptInputs"
	RouteSetPromptFormat                   = "/setPromptFormat"
	RouteToggleParamSelected               = "/toggleParamSelected"
	RouteUnselectAllParams                 = "/unselectAllParams"
	RouteSetChatSectionSettings            = "/setChatSectionSettings"
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
	RouteSetWatchCodeEnabled               = "/setWatchCodeEnabled"
	RouteSetWatchCodeInputs                = "/setWatchCodeInputs"
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
	ShareSessions                  modes.ShareSessionStore
	Deployment                     *deployments.Runtime
	SettingsState                  *settingsstate.Runtime
	ChatSectionChatIDs             ChatSectionChatIDService
	EdgeExpressionBuilder          projectstate.EdgeExpressionBuilder
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

type SetGenCodePrefixRequest struct {
	FrontendOpID  *string `json:"frontendOpId"`
	ProjectID     string  `json:"projectConfigId"`
	GenCodePrefix string  `json:"genCodePrefix"`
}

type SetGenCodeSuffixRequest struct {
	FrontendOpID  *string `json:"frontendOpId"`
	ProjectID     string  `json:"projectConfigId"`
	GenCodeSuffix string  `json:"genCodeSuffix"`
}

type CodeFileBindingUpdate struct {
	CanonicalPath string                          `json:"canonical_path"`
	AccessMode    projectstate.CodeFileAccessMode `json:"access_mode"`
}

type GetLatestProjectStateRequest struct {
	FrontendOpID *string `json:"frontendOpId"`
	ProjectID    string  `json:"projectConfigId"`
}

type UndoRequest struct {
	ProjectID string `json:"projectConfigId"`
	Steps     int    `json:"steps"`
}

type RedoRequest struct {
	ProjectID string `json:"projectConfigId"`
	Steps     int    `json:"steps"`
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

type CreateNewSectionVariantRequest struct {
	FrontendOpID *string `json:"frontendOpId"`
	ProjectID    string  `json:"projectConfigId"`
	SectionID    string  `json:"sectionId"`
}

type CreateNewSectionVariantResponse = projectstate.CreateNewSectionVariantResult

type SetSectionVariantRequest struct {
	FrontendOpID *string `json:"frontendOpId"`
	ProjectID    string  `json:"projectConfigId"`
	SectionID    string  `json:"sectionId"`
	VariantID    string  `json:"variantId"`
}

type SetDefaultSectionVariantRequest struct {
	FrontendOpID *string `json:"frontendOpId"`
	ProjectID    string  `json:"projectConfigId"`
	SectionID    string  `json:"sectionId"`
	VariantID    string  `json:"variantId"`
}

type SetSectionVariantSortOrderRequest struct {
	FrontendOpID      *string  `json:"frontendOpId"`
	ProjectID         string   `json:"projectConfigId"`
	SectionID         string   `json:"sectionId"`
	OrderedVariantIDs []string `json:"orderedVariantIds"`
}

type ToggleVariantFrozenRequest struct {
	FrontendOpID *string `json:"frontendOpId"`
	ProjectID    string  `json:"projectConfigId"`
	VariantID    string  `json:"variantId"`
}

type ToggleVariantJSONSourceRequest struct {
	FrontendOpID *string `json:"frontendOpId"`
	ProjectID    string  `json:"projectConfigId"`
	SectionID    string  `json:"sectionId"`
	VariantID    string  `json:"variantId"`
}

type SetVariantJSONSourceKeysRequest struct {
	FrontendOpID   *string  `json:"frontendOpId"`
	ProjectID      string   `json:"projectConfigId"`
	SectionID      string   `json:"sectionId"`
	VariantID      string   `json:"variantId"`
	JSONSourceKeys []string `json:"jsonSourceKeys"`
}

type SetSectionVariantNameRequest struct {
	FrontendOpID *string `json:"frontendOpId"`
	ProjectID    string  `json:"projectConfigId"`
	VariantID    string  `json:"variantId"`
	Name         string  `json:"name"`
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

type PrepareSectionsForCopyRequest struct {
	ProjectID  string   `json:"projectConfigId"`
	SectionIDs []string `json:"sectionIds"`
}

type PasteSectionsRequest struct {
	ProjectID string                                                      `json:"projectConfigId"`
	Data      projectstate.ClipboardProjectStateCoreWithSectionVariantMap `json:"data"`
	Position  projectstate.Position                                       `json:"position"`
	AsRef     bool                                                        `json:"asRef"`
}

type CreateEdgeRequest struct {
	FrontendOpID    *string         `json:"frontendOpId"`
	ProjectID       string          `json:"projectConfigId"`
	SourceSectionID string          `json:"sourceSectionId"`
	SourceVariantID string          `json:"sourceVariantId"`
	SourcePortID    string          `json:"sourcePortId"`
	TargetSectionID string          `json:"targetSectionId"`
	TargetVariantID string          `json:"targetVariantId"`
	TargetPortID    string          `json:"targetPortId"`
	Type            string          `json:"type"`
	Label           *string         `json:"label"`
	Style           json.RawMessage `json:"style"`
	Animated        bool            `json:"animated"`
	Hidden          bool            `json:"hidden"`
	ZIndex          int             `json:"zIndex"`
	Data            json.RawMessage `json:"data"`
}

type UpdateEdgeRequest struct {
	FrontendOpID *string           `json:"frontendOpId"`
	ProjectID    string            `json:"projectConfigId"`
	Edge         projectstate.Edge `json:"edge"`
}

type DeleteEdgesRequest struct {
	FrontendOpID *string  `json:"frontendOpId"`
	ProjectID    string   `json:"projectConfigId"`
	EdgeIDs      []string `json:"edgeIds"`
}

type ReconnectEdgeRequest struct {
	FrontendOpID    *string `json:"frontendOpId"`
	ProjectID       string  `json:"projectConfigId"`
	EdgeID          string  `json:"edgeId"`
	SourceSectionID string  `json:"sourceSectionId"`
	SourceVariantID string  `json:"sourceVariantId"`
	SourcePortID    string  `json:"sourcePortId"`
	TargetSectionID string  `json:"targetSectionId"`
	TargetVariantID string  `json:"targetVariantId"`
	TargetPortID    string  `json:"targetPortId"`
}

type SetEdgesRequest struct {
	FrontendOpID *string             `json:"frontendOpId"`
	ProjectID    string              `json:"projectConfigId"`
	Edges        []projectstate.Edge `json:"edges"`
}

type CreateAgenticEdgeRequest struct {
	FrontendOpID    *string         `json:"frontendOpId"`
	ProjectID       string          `json:"projectConfigId"`
	ID              *string         `json:"id"`
	SourceSectionID string          `json:"sourceSectionId"`
	TargetSectionID string          `json:"targetSectionId"`
	Kind            string          `json:"kind"`
	ContextMode     *string         `json:"contextMode"`
	Style           json.RawMessage `json:"style"`
	Hidden          bool            `json:"hidden"`
	ZIndex          int             `json:"zIndex"`
}

type UpdateAgenticEdgeRequest struct {
	FrontendOpID *string                  `json:"frontendOpId"`
	ProjectID    string                   `json:"projectConfigId"`
	Edge         projectstate.AgenticEdge `json:"edge"`
}

type DeleteAgenticEdgesRequest struct {
	FrontendOpID *string  `json:"frontendOpId"`
	ProjectID    string   `json:"projectConfigId"`
	EdgeIDs      []string `json:"edgeIds"`
}

type SetAgenticEdgesRequest struct {
	FrontendOpID *string                    `json:"frontendOpId"`
	ProjectID    string                     `json:"projectConfigId"`
	Edges        []projectstate.AgenticEdge `json:"edges"`
}

type MoveSectionsRequest struct {
	FrontendOpID  *string                          `json:"frontendOpId"`
	ProjectID     string                           `json:"projectConfigId"`
	SectionIDs    []string                         `json:"sectionIds"`
	NewParentID   *string                          `json:"newParentId"`
	NewIndex      *int                             `json:"newIndex"`
	PositionsByID map[string]projectstate.Position `json:"positionsById"`
}

type MoveParamsRequest struct {
	FrontendOpID *string  `json:"frontendOpId"`
	ProjectID    string   `json:"projectConfigId"`
	SectionID    string   `json:"sectionId"`
	ParamIDs     []string `json:"paramIds"`
	NewParentID  string   `json:"newParentId"`
	NewIndex     int      `json:"newIndex"`
}

type MoveParamGroupRequest struct {
	ParamIDs    []string `json:"paramIds"`
	NewParentID string   `json:"newParentId"`
	NewIndex    int      `json:"newIndex"`
}

type MoveParamGroupsRequest struct {
	FrontendOpID *string                 `json:"frontendOpId"`
	ProjectID    string                  `json:"projectConfigId"`
	SectionID    string                  `json:"sectionId"`
	Moves        []MoveParamGroupRequest `json:"moves"`
}

type IndentParamsRequest struct {
	FrontendOpID *string  `json:"frontendOpId"`
	ProjectID    string   `json:"projectConfigId"`
	SectionID    string   `json:"sectionId"`
	ParamIDs     []string `json:"paramIds"`
}

type UnindentParamsRequest struct {
	FrontendOpID *string  `json:"frontendOpId"`
	ProjectID    string   `json:"projectConfigId"`
	SectionID    string   `json:"sectionId"`
	ParamIDs     []string `json:"paramIds"`
}

type AddKwargRequest struct {
	ProjectID string `json:"projectConfigId"`
	SectionID string `json:"sectionId"`
}

type DeleteKwargRequest struct {
	ProjectID string `json:"projectConfigId"`
	SectionID string `json:"sectionId"`
}

type CreateChildSectionsRequest struct {
	FrontendOpID *string `json:"frontendOpId"`
	ProjectID    string  `json:"projectConfigId"`
	ParentID     string  `json:"parentId"`
	ImplType     string  `json:"implType"`
	NumChildren  int     `json:"numChildren"`
	StartIdx     *int    `json:"startIdx"`
}

type CreateChildSectionsViaIncrementerRequest struct {
	FrontendOpID *string `json:"frontendOpId"`
	ProjectID    string  `json:"projectConfigId"`
	CalledBy     string  `json:"calledBy"`
	ImplType     string  `json:"implType"`
	NumChildren  int     `json:"numChildren"`
}

type DeleteChildSectionsViaDecrementerRequest struct {
	FrontendOpID *string `json:"frontendOpId"`
	ProjectID    string  `json:"projectConfigId"`
	CalledBy     string  `json:"calledBy"`
	NumChildren  int     `json:"numChildren"`
}

type CreateTopLevelSectionRequest struct {
	FrontendOpID       *string                                       `json:"frontendOpId"`
	ProjectID          string                                        `json:"projectConfigId"`
	ImplType           string                                        `json:"implType"`
	ControlCodeObjType *string                                       `json:"controlCodeObjType"`
	ImplOverrides      map[string]any                                `json:"implOverrides"`
	Position           *projectstate.Position                        `json:"position"`
	Name               *string                                       `json:"name"`
	TopLevelSections   map[string]projectstate.TopLevelSectionLayout `json:"topLevelSections"`
	ViewportBounds     *projectstate.ViewportBounds                  `json:"viewportBounds"`
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

type ToggleGroupOrientationRequest struct {
	FrontendOpID *string `json:"frontendOpId"`
	ProjectID    string  `json:"projectConfigId"`
	SectionID    string  `json:"sectionId"`
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

type SetSpreadsheetFilePathRequest struct {
	FrontendOpID *string `json:"frontendOpId"`
	ProjectID    string  `json:"projectConfigId"`
	SectionID    string  `json:"sectionId"`
	FilePath     string  `json:"filePath"`
	ActiveSheet  *string `json:"activeSheet"`
}

type SetSpreadsheetSectionSettingsRequest struct {
	FrontendOpID               *string                             `json:"frontendOpId"`
	ProjectID                  string                              `json:"projectConfigId"`
	SectionID                  string                              `json:"sectionId"`
	ReadOnly                   bool                                `json:"readOnly"`
	ShowRowNumbers             bool                                `json:"showRowNumbers"`
	Density                    projectstate.SpreadsheetGridDensity `json:"density"`
	AutoReloadOnExternalChange bool                                `json:"autoReloadOnExternalChange"`
}

type SetTaskBoardSectionStateRequest struct {
	FrontendOpID *string                        `json:"frontendOpId"`
	ProjectID    string                         `json:"projectConfigId"`
	SectionID    string                         `json:"sectionId"`
	ViewMode     projectstate.TaskBoardViewMode `json:"viewMode"`
	Columns      []projectstate.TaskBoardColumn `json:"columns"`
	Tasks        []projectstate.TaskBoardTask   `json:"tasks"`
}

type SetImageAreaImagePathRequest struct {
	FrontendOpID *string `json:"frontendOpId"`
	ProjectID    string  `json:"projectConfigId"`
	SectionID    string  `json:"sectionId"`
	ImagePath    string  `json:"imagePath"`
}

type SetSocialURLRequest struct {
	FrontendOpID *string `json:"frontendOpId"`
	ProjectID    string  `json:"projectConfigId"`
	SectionID    string  `json:"sectionId"`
	URL          string  `json:"url"`
}

type AppendDrawAreaLayerItemRequest struct {
	FrontendOpID *string                        `json:"frontendOpId"`
	ProjectID    string                         `json:"projectConfigId"`
	SectionID    string                         `json:"sectionId"`
	LayerIdx     int                            `json:"layerIdx"`
	Element      projectstate.DrawAreaLayerItem `json:"element"`
}

type SetChartAreaDataPathRequest struct {
	FrontendOpID *string `json:"frontendOpId"`
	ProjectID    string  `json:"projectConfigId"`
	SectionID    string  `json:"sectionId"`
	DataPath     string  `json:"dataPath"`
}

type SetChartTypeRequest struct {
	FrontendOpID *string                `json:"frontendOpId"`
	ProjectID    string                 `json:"projectConfigId"`
	SectionID    string                 `json:"sectionId"`
	ChartType    projectstate.ChartType `json:"chartType"`
}

type SetChartSettingsRequest struct {
	FrontendOpID    *string                          `json:"frontendOpId"`
	ProjectID       string                           `json:"projectConfigId"`
	SectionID       string                           `json:"sectionId"`
	ChartSettings   projectstate.ChartSettingsUpdate `json:"chartSettings"`
	ChangedSettings []string                         `json:"changedSettings"`
}

type SetTextBlockTextRequest struct {
	FrontendOpID *string `json:"frontendOpId"`
	ProjectID    string  `json:"projectConfigId"`
	SectionID    string  `json:"sectionId"`
	Text         string  `json:"text"`
}

type SetTextBlockDisplayModeRequest struct {
	FrontendOpID    *string                           `json:"frontendOpId"`
	ProjectID       string                            `json:"projectConfigId"`
	SectionID       string                            `json:"sectionId"`
	TextDisplayMode projectstate.TextBlockDisplayMode `json:"textDisplayMode"`
}

type SetTextBlockFormatRequest struct {
	FrontendOpID *string                      `json:"frontendOpId"`
	ProjectID    string                       `json:"projectConfigId"`
	SectionID    string                       `json:"sectionId"`
	Format       projectstate.TextBlockFormat `json:"format"`
}

type SetTextBlockHeadingAsSectionNameRequest struct {
	FrontendOpID         *string `json:"frontendOpId"`
	ProjectID            string  `json:"projectConfigId"`
	SectionID            string  `json:"sectionId"`
	HeadingAsSectionName bool    `json:"headingAsSectionName"`
}

type SetTextBlockMetaControlStyleRequest struct {
	FrontendOpID     *string `json:"frontendOpId"`
	ProjectID        string  `json:"projectConfigId"`
	SectionID        string  `json:"sectionId"`
	MetaControlStyle bool    `json:"metaControlStyle"`
}

type SetTextBlockMasterFontSizeRequest struct {
	FrontendOpID     *string `json:"frontendOpId"`
	ProjectID        string  `json:"projectConfigId"`
	SectionID        string  `json:"sectionId"`
	MasterFontSizePx float64 `json:"masterFontSizePx"`
}

type SetPromptTemplateRequest struct {
	FrontendOpID *string `json:"frontendOpId"`
	ProjectID    string  `json:"projectConfigId"`
	SectionID    string  `json:"sectionId"`
	Template     string  `json:"template"`
}

type SetPromptInputsRequest struct {
	FrontendOpID *string           `json:"frontendOpId"`
	ProjectID    string            `json:"projectConfigId"`
	SectionID    string            `json:"sectionId"`
	Inputs       map[string]string `json:"inputs"`
}

type SetPromptFormatRequest struct {
	FrontendOpID *string                   `json:"frontendOpId"`
	ProjectID    string                    `json:"projectConfigId"`
	SectionID    string                    `json:"sectionId"`
	Format       projectstate.PromptFormat `json:"format"`
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

type CreateWindowSpaceRequest struct {
	FrontendOpID *string                       `json:"frontendOpId"`
	ProjectID    string                        `json:"projectConfigId"`
	State        projectstate.WindowSpaceState `json:"state"`
	Name         *string                       `json:"name,omitempty"`
}

type SetWindowSpaceNameRequest struct {
	FrontendOpID  *string `json:"frontendOpId"`
	ProjectID     string  `json:"projectConfigId"`
	WindowSpaceID string  `json:"windowSpaceId"`
	Name          string  `json:"name"`
}

type SetWindowSpaceSortOrderRequest struct {
	FrontendOpID          *string  `json:"frontendOpId"`
	ProjectID             string   `json:"projectConfigId"`
	OrderedWindowSpaceIDs []string `json:"orderedWindowSpaceIds"`
}

type DeleteWindowSpaceRequest struct {
	FrontendOpID  *string `json:"frontendOpId"`
	ProjectID     string  `json:"projectConfigId"`
	WindowSpaceID string  `json:"windowSpaceId"`
}

type SetProjectChatWindowingStateRequest struct {
	FrontendOpID *string                                `json:"frontendOpId"`
	ProjectID    string                                 `json:"projectConfigId"`
	State        projectstate.ProjectChatWindowingState `json:"state"`
}

type SetProjectChatWindowChatIDRequest struct {
	FrontendOpID *string `json:"frontendOpId"`
	ProjectID    string  `json:"projectConfigId"`
	InstanceID   string  `json:"instanceId"`
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

type ChangeParamImplRequest struct {
	FrontendOpID *string `json:"frontendOpId"`
	ProjectID    string  `json:"projectConfigId"`
	SectionID    string  `json:"sectionId"`
	ParamInfoID  string  `json:"paramInfoId"`
	SelectedID   string  `json:"selectedId"`
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

func projectRuntimeForRequest(
	deps ProjectRouteDependencies,
	r *http.Request,
) (*projectstate.Runtime, error) {
	if deps.ModePolicy.IsDeployment() {
		if deps.Deployment == nil {
			return nil, fmt.Errorf("deployment runtime is required in deployment mode")
		}
		requestInfo, ok := modes.RequestInfoFromRequest(r)
		if !ok {
			return nil, modes.ErrMissingRequestInfo
		}
		return deps.Deployment.Overlay(requestInfo.ShareSessionID)
	}
	if deps.ProjectState == nil {
		return nil, fmt.Errorf("project runtime is required")
	}
	return deps.ProjectState, nil
}

func ensureProjectLayoutMutationsAllowed(
	w http.ResponseWriter,
	r *http.Request,
	deps ProjectRouteDependencies,
) bool {
	requestInfo, ok := modes.RequestInfoFromRequest(r)
	if !ok {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
		return false
	}
	if !requestInfo.Policy.IsDeployment() {
		return true
	}
	if deps.Deployment == nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
		return false
	}
	if deps.Deployment.Policy().AllowLayoutChanges {
		return true
	}
	writeError(
		w,
		r,
		http.StatusForbidden,
		"layout_changes_forbidden",
		"Deployment policy disallows layout changes.",
	)
	return false
}

func ensureProjectLLMMutationsAllowed(
	w http.ResponseWriter,
	r *http.Request,
	deps ProjectRouteDependencies,
) bool {
	requestInfo, ok := modes.RequestInfoFromRequest(r)
	if !ok {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
		return false
	}
	if !requestInfo.Policy.IsDeployment() {
		return true
	}
	if deps.Deployment == nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
		return false
	}
	if deps.Deployment.Policy().AllowLLM {
		return true
	}
	writeError(
		w,
		r,
		http.StatusForbidden,
		"llm_access_forbidden",
		"Deployment policy disallows LLM access.",
	)
	return false
}

func ensureProjectParamMutationsAllowed(
	w http.ResponseWriter,
	r *http.Request,
	deps ProjectRouteDependencies,
) bool {
	requestInfo, ok := modes.RequestInfoFromRequest(r)
	if !ok {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
		return false
	}
	if !requestInfo.Policy.IsDeployment() {
		return true
	}
	if deps.Deployment == nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
		return false
	}
	if deps.Deployment.Policy().AllowParamChanges {
		return true
	}
	writeError(
		w,
		r,
		http.StatusForbidden,
		"param_changes_forbidden",
		"Deployment policy disallows param changes.",
	)
	return false
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
		if deps.EdgeExpressionBuilder == nil {
			return fmt.Errorf("edge expression builder is required in ide mode")
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
	if deps.ModePolicy.IsDeployment() {
		if deps.ShareSessions == nil {
			return fmt.Errorf("share session store is required in deployment mode")
		}
		if deps.Deployment == nil {
			return fmt.Errorf("deployment runtime is required in deployment mode")
		}
	}

	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteGetLatestProjectState, getLatestProjectStateHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteUndo, undoHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteRedo, redoHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteGetPasswordParamValue, getPasswordParamValueHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteCreateNewSectionVariant, createNewSectionVariantHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetSectionVariant, setSectionVariantHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetDefaultSectionVariant, setDefaultSectionVariantHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetSectionVariantSortOrder, setSectionVariantSortOrderHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteToggleVariantFrozen, toggleVariantFrozenHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteToggleVariantJSONSource, toggleVariantJSONSourceHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetVariantJSONSourceKeys, setVariantJSONSourceKeysHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetSectionVariantName, setSectionVariantNameHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteDeleteSectionVariantOrAsk, deleteSectionVariantOrAskHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteDeleteJSONSourceFileAndVariant, deleteJSONSourceFileAndVariantHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteCreateChildSections, createChildSectionsHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteCreateChildSectionsViaIncrementer, createChildSectionsViaIncrementerHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteDeleteChildSectionsViaDecrementer, deleteChildSectionsViaDecrementerHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteDeleteSections, deleteSectionsHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteDeleteSelectedParams, deleteSelectedParamsHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RoutePrepareSectionsForCopy, prepareSectionsForCopyHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RoutePasteSections, pasteSectionsHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteCreateEdge, createEdgeHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteUpdateEdge, updateEdgeHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteDeleteEdges, deleteEdgesHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteReconnectEdge, reconnectEdgeHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetEdges, setEdgesHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteCreateAgenticEdge, createAgenticEdgeHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteUpdateAgenticEdge, updateAgenticEdgeHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteDeleteAgenticEdges, deleteAgenticEdgesHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetAgenticEdges, setAgenticEdgesHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteMoveSections, moveSectionsHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteMoveParams, moveParamsHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteMoveParamGroups, moveParamGroupsHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteIndentParams, indentParamsHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteUnindentParams, unindentParamsHandler(deps))
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
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteToggleGroupOrientation, toggleGroupOrientationHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetGroupOverflowMode, setGroupOverflowModeHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetCallableHideParams, setCallableHideParamsHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetSectionHideUnpinnedParams, setSectionHideUnpinnedParamsHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetSectionPinnedParams, setSectionPinnedParamsHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetBrowserColumnWidths, setBrowserColumnWidthsHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetBrowserAreaViewMode, setBrowserAreaViewModeHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetBrowserHideColumn, setBrowserHideColumnHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetBrowserSavedSearches, setBrowserSavedSearchesHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetSpreadsheetFilePath, setSpreadsheetFilePathHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetSpreadsheetSectionSettings, setSpreadsheetSectionSettingsHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetTaskBoardSectionState, setTaskBoardSectionStateHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetImageAreaImagePath, setImageAreaImagePathHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetSocialURL, setSocialURLHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteAppendDrawAreaLayerItem, appendDrawAreaLayerItemHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetChartAreaDataPath, setChartAreaDataPathHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetChartType, setChartTypeHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetChartSettings, setChartSettingsHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetTextBlockText, setTextBlockTextHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetTextBlockDisplayMode, setTextBlockDisplayModeHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetTextBlockFormat, setTextBlockFormatHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetTextBlockHeadingAsSectionName, setTextBlockHeadingAsSectionNameHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetTextBlockMetaControlStyle, setTextBlockMetaControlStyleHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetTextBlockMasterFontSize, setTextBlockMasterFontSizeHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteToggleParamSelected, toggleParamSelectedHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteUnselectAllParams, unselectAllParamsHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetChatSectionSettings, setChatSectionSettingsHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetChatSectionState, setChatSectionStateHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteGetChatSectionChatID, getChatSectionChatIDHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetChatSectionChatID, setChatSectionChatIDHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetCallable, setCallableHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetProjectConfigCodegenTargets, setProjectConfigCodegenTargetsHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetGenCodePrefix, setGenCodePrefixHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetGenCodeSuffix, setGenCodeSuffixHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetWatchCodeEnabled, setWatchCodeEnabledHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetWatchCodeInputs, setWatchCodeInputsHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteChangeParamImpl, changeParamImplHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetParamEnteredValue, setParamEnteredValueHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteUpdateParamImplConfig, updateParamImplConfigHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetCodeObjName, setCodeObjNameHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetCodeObjDisplayName, setCodeObjDisplayNameHandler(deps))
	if deps.ModePolicy.IsDeployment() {
		shareGuard := RequireShareSession(modes.Resolver{
			Policy: deps.ModePolicy,
			Store:  deps.ShareSessions,
		})
		router.With(shareGuard).Post(RouteUndo, undoHandler(deps))
		router.With(shareGuard).Post(RouteRedo, redoHandler(deps))
		router.With(shareGuard).Post(RouteSetPromptTemplate, setPromptTemplateHandler(deps))
		router.With(shareGuard).Post(RouteSetPromptInputs, setPromptInputsHandler(deps))
		router.With(shareGuard).Post(RouteSetPromptFormat, setPromptFormatHandler(deps))
		router.With(shareGuard).Post(RouteCreateWindowSpace, createWindowSpaceHandler(deps))
		router.With(shareGuard).Post(RouteSetWindowSpaceName, setWindowSpaceNameHandler(deps))
		router.With(shareGuard).Post(RouteSetWindowSpaceSortOrder, setWindowSpaceSortOrderHandler(deps))
		router.With(shareGuard).Post(RouteDeleteWindowSpace, deleteWindowSpaceHandler(deps))
		router.With(shareGuard).Post(RouteSetProjectChatWindowingState, setProjectChatWindowingStateHandler(deps))
		router.With(shareGuard).Post(RouteSetProjectChatWindowChatID, setProjectChatWindowChatIDHandler(deps))
		return nil
	}
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetPromptTemplate, setPromptTemplateHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetPromptInputs, setPromptInputsHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetPromptFormat, setPromptFormatHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteCreateWindowSpace, createWindowSpaceHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetWindowSpaceName, setWindowSpaceNameHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetWindowSpaceSortOrder, setWindowSpaceSortOrderHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteDeleteWindowSpace, deleteWindowSpaceHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetProjectChatWindowingState, setProjectChatWindowingStateHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetProjectChatWindowChatID, setProjectChatWindowChatIDHandler(deps))
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

		responsePayload, err := projectStateEnvelopeWithFrontendOps(snapshot, frontendOps, projectID)
		if err != nil {
			writeProjectRouteStateError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, responsePayload)
	}
}

func projectStateEnvelopeWithFrontendOps(
	snapshot projectstate.Snapshot,
	frontendOps projectstate.FrontendOpStatus,
	projectID string,
) (ProjectStateSingleConfigWithCompletedOpIDs, error) {
	projectStateView, err := projectview.SingleConfigByProjectID(snapshot.Document, projectID)
	if err != nil {
		return ProjectStateSingleConfigWithCompletedOpIDs{}, err
	}
	return ProjectStateSingleConfigWithCompletedOpIDs{
		ProjectState:   projectStateView,
		CompletedOpIDs: frontendOps.Completed,
		PendingOpIDs:   frontendOps.Pending,
	}, nil
}

func undoHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[UndoRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		runtime, err := projectRuntimeForRequest(deps, r)
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		snapshot, err := runtime.UndoAndSave(r.Context(), payload.ProjectID, payload.Steps)
		if err != nil {
			writeProjectRouteStateError(w, r, err)
			return
		}

		response, err := projectStateEnvelopeWithFrontendOps(snapshot, runtime.FrontendOpStatus(), payload.ProjectID)
		if err != nil {
			writeProjectRouteStateError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, response)
	}
}

func redoHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[RedoRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		runtime, err := projectRuntimeForRequest(deps, r)
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		snapshot, err := runtime.RedoAndSave(r.Context(), payload.ProjectID, payload.Steps)
		if err != nil {
			writeProjectRouteStateError(w, r, err)
			return
		}

		response, err := projectStateEnvelopeWithFrontendOps(snapshot, runtime.FrontendOpStatus(), payload.ProjectID)
		if err != nil {
			writeProjectRouteStateError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, response)
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

func changeParamImplHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[ChangeParamImplRequest](r)
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
		selectedID := strings.TrimSpace(payload.SelectedID)
		if selectedID == "" {
			writeError(w, r, http.StatusBadRequest, "selected_id_required", "Selected impl or code object type is required.")
			return
		}
		if deps.ProjectState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if _, err := deps.ProjectState.ChangeParamImpl(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			sectionID,
			paramInfoID,
			selectedID,
		); err != nil {
			writeChangeParamImplError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
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

func createNewSectionVariantHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[CreateNewSectionVariantRequest](r)
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

		_, result, err := deps.ProjectState.CreateNewSectionVariant(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			projectstate.CreateNewSectionVariantInput{SectionID: payload.SectionID},
		)
		if err != nil {
			writeSectionVariantMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, result)
	}
}

func setSectionVariantHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetSectionVariantRequest](r)
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

		if _, err := deps.ProjectState.SetSectionVariant(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			payload.SectionID,
			payload.VariantID,
		); err != nil {
			writeSectionVariantMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setDefaultSectionVariantHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetDefaultSectionVariantRequest](r)
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

		if _, err := deps.ProjectState.SetDefaultSectionVariant(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			payload.SectionID,
			payload.VariantID,
		); err != nil {
			writeSectionVariantMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setSectionVariantSortOrderHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetSectionVariantSortOrderRequest](r)
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

		if _, err := deps.ProjectState.SetSectionVariantSortOrder(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			payload.SectionID,
			payload.OrderedVariantIDs,
		); err != nil {
			writeSectionVariantMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func toggleVariantFrozenHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[ToggleVariantFrozenRequest](r)
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

		if _, err := deps.ProjectState.ToggleVariantFrozen(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			payload.VariantID,
		); err != nil {
			writeVariantMetadataMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func toggleVariantJSONSourceHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[ToggleVariantJSONSourceRequest](r)
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

		if _, err := deps.ProjectState.ToggleVariantJSONSource(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			payload.SectionID,
			payload.VariantID,
		); err != nil {
			writeVariantJSONSourceMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setVariantJSONSourceKeysHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetVariantJSONSourceKeysRequest](r)
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

		if _, err := deps.ProjectState.SetVariantJSONSourceKeys(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			payload.SectionID,
			payload.VariantID,
			payload.JSONSourceKeys,
		); err != nil {
			writeVariantJSONSourceMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setSectionVariantNameHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetSectionVariantNameRequest](r)
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

		if _, err := deps.ProjectState.SetSectionVariantName(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			payload.VariantID,
			payload.Name,
		); err != nil {
			writeVariantMetadataMutationError(w, r, err)
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

func createChildSectionsHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[CreateChildSectionsRequest](r)
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
			writeChildSectionMutationError(w, r, err)
			return
		}

		_, result, err := deps.ProjectState.CreateChildSections(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			projectstate.CreateChildSectionsInput{
				ParentID:    payload.ParentID,
				ImplType:    payload.ImplType,
				NumChildren: payload.NumChildren,
				StartIdx:    payload.StartIdx,
			},
			settings,
		)
		if err != nil {
			writeChildSectionMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, result)
	}
}

func createChildSectionsViaIncrementerHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[CreateChildSectionsViaIncrementerRequest](r)
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
			writeChildSectionMutationError(w, r, err)
			return
		}

		_, result, err := deps.ProjectState.CreateChildSectionsViaIncrementer(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			projectstate.CreateChildSectionsViaIncrementerInput{
				CalledBy:    payload.CalledBy,
				ImplType:    payload.ImplType,
				NumChildren: payload.NumChildren,
			},
			settings,
		)
		if err != nil {
			writeChildSectionMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, result)
	}
}

func deleteChildSectionsViaDecrementerHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[DeleteChildSectionsViaDecrementerRequest](r)
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

		_, result, err := deps.ProjectState.DeleteChildSectionsViaDecrementer(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			projectstate.DeleteChildSectionsViaDecrementerInput{
				CalledBy:    payload.CalledBy,
				NumChildren: payload.NumChildren,
			},
		)
		if err != nil {
			writeChildSectionMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, result)
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

func prepareSectionsForCopyHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[PrepareSectionsForCopyRequest](r)
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

		response, err := deps.ProjectState.PrepareSectionsForCopy(r.Context(), projectID, payload.SectionIDs)
		if err != nil {
			writePrepareSectionsForCopyError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, response)
	}
}

func pasteSectionsHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[PasteSectionsRequest](r)
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

		if _, err := deps.ProjectState.PasteSections(
			projectMutationContext(r.Context(), nil),
			projectID,
			projectstate.PasteSectionsInput{
				Data:     payload.Data,
				Position: payload.Position,
				AsRef:    payload.AsRef,
			},
		); err != nil {
			writePasteSectionsError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func createEdgeHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[CreateEdgeRequest](r)
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

		if _, err := deps.ProjectState.CreateEdge(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			projectstate.Edge{
				SourceSectionID: payload.SourceSectionID,
				SourceVariantID: payload.SourceVariantID,
				SourcePortID:    payload.SourcePortID,
				TargetSectionID: payload.TargetSectionID,
				TargetVariantID: payload.TargetVariantID,
				TargetPortID:    payload.TargetPortID,
				Type:            payload.Type,
				Label:           payload.Label,
				Style:           projectstate.RawJSON(payload.Style),
				Animated:        payload.Animated,
				Hidden:          payload.Hidden,
				ZIndex:          payload.ZIndex,
				Data:            projectstate.RawJSON(payload.Data),
			},
			deps.EdgeExpressionBuilder,
		); err != nil {
			writeGraphEdgeMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func updateEdgeHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[UpdateEdgeRequest](r)
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

		if _, err := deps.ProjectState.UpdateEdge(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			payload.Edge,
		); err != nil {
			writeGraphEdgeMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func deleteEdgesHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[DeleteEdgesRequest](r)
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

		if _, err := deps.ProjectState.DeleteEdges(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			payload.EdgeIDs,
		); err != nil {
			writeGraphEdgeMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func reconnectEdgeHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[ReconnectEdgeRequest](r)
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

		if _, err := deps.ProjectState.ReconnectEdge(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			payload.EdgeID,
			payload.SourceSectionID,
			payload.SourceVariantID,
			payload.SourcePortID,
			payload.TargetSectionID,
			payload.TargetVariantID,
			payload.TargetPortID,
			deps.EdgeExpressionBuilder,
		); err != nil {
			writeGraphEdgeMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setEdgesHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetEdgesRequest](r)
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

		if _, err := deps.ProjectState.SetEdges(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			payload.Edges,
		); err != nil {
			writeGraphEdgeMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func createAgenticEdgeHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[CreateAgenticEdgeRequest](r)
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

		edgeID := ""
		if payload.ID != nil {
			edgeID = strings.TrimSpace(*payload.ID)
		}
		contextMode := ""
		if payload.ContextMode != nil {
			contextMode = strings.TrimSpace(*payload.ContextMode)
		}

		if _, err := deps.ProjectState.CreateAgenticEdge(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			projectstate.AgenticEdge{
				ID:              edgeID,
				SourceSectionID: payload.SourceSectionID,
				TargetSectionID: payload.TargetSectionID,
				Kind:            payload.Kind,
				ContextMode:     contextMode,
				Style:           projectstate.RawJSON(payload.Style),
				Hidden:          payload.Hidden,
				ZIndex:          payload.ZIndex,
			},
		); err != nil {
			writeGraphEdgeMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func updateAgenticEdgeHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[UpdateAgenticEdgeRequest](r)
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

		if _, err := deps.ProjectState.UpdateAgenticEdge(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			payload.Edge,
		); err != nil {
			writeGraphEdgeMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func deleteAgenticEdgesHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[DeleteAgenticEdgesRequest](r)
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

		if _, err := deps.ProjectState.DeleteAgenticEdges(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			payload.EdgeIDs,
		); err != nil {
			writeGraphEdgeMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setAgenticEdgesHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetAgenticEdgesRequest](r)
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

		if _, err := deps.ProjectState.SetAgenticEdges(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			payload.Edges,
		); err != nil {
			writeGraphEdgeMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func moveSectionsHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[MoveSectionsRequest](r)
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
			writeMoveSectionsError(w, r, err)
			return
		}
		if _, err := deps.ProjectState.MoveSections(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			projectstate.MoveSectionsInput{
				SectionIDs:    payload.SectionIDs,
				NewParentID:   payload.NewParentID,
				NewIndex:      payload.NewIndex,
				PositionsByID: payload.PositionsByID,
			},
			settings,
		); err != nil {
			writeMoveSectionsError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func moveParamsHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[MoveParamsRequest](r)
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

		if _, err := deps.ProjectState.MoveParams(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			projectstate.MoveParamsInput{
				SectionID:   payload.SectionID,
				ParamIDs:    payload.ParamIDs,
				NewParentID: payload.NewParentID,
				NewIndex:    payload.NewIndex,
			},
		); err != nil {
			writeParamMoveMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func moveParamGroupsHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[MoveParamGroupsRequest](r)
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

		moves := make([]projectstate.MoveParamGroupInput, 0, len(payload.Moves))
		for _, move := range payload.Moves {
			moves = append(moves, projectstate.MoveParamGroupInput{
				ParamIDs:    move.ParamIDs,
				NewParentID: move.NewParentID,
				NewIndex:    move.NewIndex,
			})
		}
		if _, err := deps.ProjectState.MoveParamGroups(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			projectstate.MoveParamGroupsInput{
				SectionID: payload.SectionID,
				Moves:     moves,
			},
		); err != nil {
			writeParamMoveMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func indentParamsHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[IndentParamsRequest](r)
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

		if _, err := deps.ProjectState.IndentParams(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			projectstate.IndentParamsInput{
				SectionID: payload.SectionID,
				ParamIDs:  payload.ParamIDs,
			},
		); err != nil {
			writeParamMoveMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func unindentParamsHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[UnindentParamsRequest](r)
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

		if _, err := deps.ProjectState.UnindentParams(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			projectstate.UnindentParamsInput{
				SectionID: payload.SectionID,
				ParamIDs:  payload.ParamIDs,
			},
		); err != nil {
			writeParamMoveMutationError(w, r, err)
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
				Name:               payload.Name,
				TopLevelSections:   payload.TopLevelSections,
				ViewportBounds:     payload.ViewportBounds,
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

func toggleGroupOrientationHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[ToggleGroupOrientationRequest](r)
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

		if _, err := deps.ProjectState.ToggleGroupOrientation(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			sectionID,
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

func setSpreadsheetFilePathHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetSpreadsheetFilePathRequest](r)
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

		if _, err := deps.ProjectState.SetSpreadsheetFilePath(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			sectionID,
			payload.FilePath,
			payload.ActiveSheet,
		); err != nil {
			writeSectionDataMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setSpreadsheetSectionSettingsHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetSpreadsheetSectionSettingsRequest](r)
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

		if _, err := deps.ProjectState.SetSpreadsheetSectionSettings(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			sectionID,
			payload.ReadOnly,
			payload.ShowRowNumbers,
			payload.Density,
			payload.AutoReloadOnExternalChange,
		); err != nil {
			writeSectionDataMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setTaskBoardSectionStateHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetTaskBoardSectionStateRequest](r)
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

		if _, err := deps.ProjectState.SetTaskBoardSectionState(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			sectionID,
			payload.ViewMode,
			payload.Columns,
			payload.Tasks,
		); err != nil {
			writeSectionDataMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setImageAreaImagePathHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetImageAreaImagePathRequest](r)
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

		if _, err := deps.ProjectState.SetImageAreaImagePath(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			sectionID,
			payload.ImagePath,
		); err != nil {
			writeSectionDataMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setSocialURLHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetSocialURLRequest](r)
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

		if _, err := deps.ProjectState.SetSocialURL(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			sectionID,
			payload.URL,
		); err != nil {
			writeSectionDataMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func appendDrawAreaLayerItemHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[AppendDrawAreaLayerItemRequest](r)
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

		if _, err := deps.ProjectState.AppendDrawAreaLayerItem(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			sectionID,
			payload.LayerIdx,
			payload.Element,
		); err != nil {
			writeDrawAreaMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setChartAreaDataPathHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetChartAreaDataPathRequest](r)
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

		if _, err := deps.ProjectState.SetChartAreaDataPath(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			sectionID,
			payload.DataPath,
		); err != nil {
			writeChartMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setChartTypeHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetChartTypeRequest](r)
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

		if _, err := deps.ProjectState.SetChartType(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			sectionID,
			payload.ChartType,
		); err != nil {
			writeChartMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setChartSettingsHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetChartSettingsRequest](r)
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

		if _, err := deps.ProjectState.SetChartSettings(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			sectionID,
			payload.ChartSettings,
			payload.ChangedSettings,
		); err != nil {
			writeChartMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setTextBlockTextHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetTextBlockTextRequest](r)
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

		if _, err := deps.ProjectState.SetTextBlockText(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			sectionID,
			payload.Text,
		); err != nil {
			writeTextBlockMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setTextBlockDisplayModeHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetTextBlockDisplayModeRequest](r)
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

		if _, err := deps.ProjectState.SetTextBlockDisplayMode(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			sectionID,
			payload.TextDisplayMode,
		); err != nil {
			writeTextBlockMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setTextBlockFormatHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetTextBlockFormatRequest](r)
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

		if _, err := deps.ProjectState.SetTextBlockFormat(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			sectionID,
			payload.Format,
		); err != nil {
			writeTextBlockMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setTextBlockHeadingAsSectionNameHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetTextBlockHeadingAsSectionNameRequest](r)
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

		if _, err := deps.ProjectState.SetTextBlockHeadingAsSectionName(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			sectionID,
			payload.HeadingAsSectionName,
		); err != nil {
			writeTextBlockMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setTextBlockMetaControlStyleHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetTextBlockMetaControlStyleRequest](r)
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

		if _, err := deps.ProjectState.SetTextBlockMetaControlStyle(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			sectionID,
			payload.MetaControlStyle,
		); err != nil {
			writeTextBlockMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setTextBlockMasterFontSizeHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetTextBlockMasterFontSizeRequest](r)
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

		if _, err := deps.ProjectState.SetTextBlockMasterFontSize(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			sectionID,
			payload.MasterFontSizePx,
		); err != nil {
			writeTextBlockMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setPromptTemplateHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetPromptTemplateRequest](r)
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
		if !ensureProjectParamMutationsAllowed(w, r, deps) {
			return
		}

		runtime, err := projectRuntimeForRequest(deps, r)
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if _, err := runtime.SetPromptTemplate(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			sectionID,
			payload.Template,
		); err != nil {
			writePromptSectionMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setPromptInputsHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetPromptInputsRequest](r)
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
		if !ensureProjectParamMutationsAllowed(w, r, deps) {
			return
		}

		runtime, err := projectRuntimeForRequest(deps, r)
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if _, err := runtime.SetPromptInputs(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			sectionID,
			payload.Inputs,
		); err != nil {
			writePromptSectionMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setPromptFormatHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetPromptFormatRequest](r)
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
		if !ensureProjectParamMutationsAllowed(w, r, deps) {
			return
		}

		runtime, err := projectRuntimeForRequest(deps, r)
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if _, err := runtime.SetPromptFormat(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			sectionID,
			payload.Format,
		); err != nil {
			writePromptSectionMutationError(w, r, err)
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

func createWindowSpaceHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[CreateWindowSpaceRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		if !ensureProjectLayoutMutationsAllowed(w, r, deps) {
			return
		}

		runtime, err := projectRuntimeForRequest(deps, r)
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		_, windowSpace, err := runtime.CreateWindowSpace(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			payload.State,
			payload.Name,
		)
		if err != nil {
			writeWindowSpaceMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, windowSpace)
	}
}

func setWindowSpaceNameHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetWindowSpaceNameRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		windowSpaceID := strings.TrimSpace(payload.WindowSpaceID)
		if windowSpaceID == "" {
			writeError(w, r, http.StatusBadRequest, "window_space_id_required", "Window space id is required.")
			return
		}
		if !ensureProjectLayoutMutationsAllowed(w, r, deps) {
			return
		}

		runtime, err := projectRuntimeForRequest(deps, r)
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if _, err := runtime.SetWindowSpaceName(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			windowSpaceID,
			payload.Name,
		); err != nil {
			writeWindowSpaceMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setWindowSpaceSortOrderHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetWindowSpaceSortOrderRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		if !ensureProjectLayoutMutationsAllowed(w, r, deps) {
			return
		}

		runtime, err := projectRuntimeForRequest(deps, r)
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if _, err := runtime.SetWindowSpaceSortOrder(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			payload.OrderedWindowSpaceIDs,
		); err != nil {
			writeWindowSpaceMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func deleteWindowSpaceHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[DeleteWindowSpaceRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		windowSpaceID := strings.TrimSpace(payload.WindowSpaceID)
		if windowSpaceID == "" {
			writeError(w, r, http.StatusBadRequest, "window_space_id_required", "Window space id is required.")
			return
		}
		if !ensureProjectLayoutMutationsAllowed(w, r, deps) {
			return
		}

		runtime, err := projectRuntimeForRequest(deps, r)
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if _, err := runtime.DeleteWindowSpace(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			windowSpaceID,
		); err != nil {
			writeWindowSpaceMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setProjectChatWindowingStateHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetProjectChatWindowingStateRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		if !ensureProjectLayoutMutationsAllowed(w, r, deps) {
			return
		}

		runtime, err := projectRuntimeForRequest(deps, r)
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		snapshot, err := runtime.SetProjectChatWindowingState(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			payload.State,
		)
		if err != nil {
			writeProjectChatWindowingMutationError(w, r, err)
			return
		}
		project, err := snapshot.Document.ProjectByID(projectID)
		if err != nil {
			writeProjectChatWindowingMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, projectstate.ProjectChatWindowingOrDefault(project.ProjectChatWindowing))
	}
}

func setProjectChatWindowChatIDHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetProjectChatWindowChatIDRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		instanceID := strings.TrimSpace(payload.InstanceID)
		if instanceID == "" {
			writeError(w, r, http.StatusBadRequest, "instance_id_required", "Instance id is required.")
			return
		}
		if !ensureProjectLLMMutationsAllowed(w, r, deps) {
			return
		}

		runtime, err := projectRuntimeForRequest(deps, r)
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		snapshot, err := runtime.SetProjectChatWindowChatID(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			instanceID,
			payload.ChatID,
		)
		if err != nil {
			writeProjectChatWindowingMutationError(w, r, err)
			return
		}
		project, err := snapshot.Document.ProjectByID(projectID)
		if err != nil {
			writeProjectChatWindowingMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, projectstate.ProjectChatWindowingOrDefault(project.ProjectChatWindowing))
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

func setGenCodePrefixHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetGenCodePrefixRequest](r)
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

		if _, err := deps.ProjectState.SetGenCodePrefix(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			payload.GenCodePrefix,
		); err != nil {
			writeSetGenCodePrefixSuffixError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setGenCodeSuffixHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetGenCodeSuffixRequest](r)
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

		if _, err := deps.ProjectState.SetGenCodeSuffix(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			payload.GenCodeSuffix,
		); err != nil {
			writeSetGenCodePrefixSuffixError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
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

func writeChildSectionMutationError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectview.ErrProjectConfigIDRequired),
		errors.Is(err, projectstate.ErrProjectIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrChildSectionParentIDRequired):
		writeError(w, r, http.StatusBadRequest, "parent_id_required", "Parent id is required.")
	case errors.Is(err, projectstate.ErrChildSectionIncrementerCalledByRequired),
		errors.Is(err, projectstate.ErrChildSectionDecrementerCalledByRequired):
		writeError(w, r, http.StatusBadRequest, "called_by_required", "Called-by section id is required.")
	case errors.Is(err, projectstate.ErrChildSectionImplTypeRequired):
		writeError(w, r, http.StatusBadRequest, "impl_type_required", "Section type is required.")
	case errors.Is(err, projectstate.ErrChildSectionCountInvalid),
		errors.Is(err, projectstate.ErrChildSectionDecrementerCountInvalid),
		errors.Is(err, projectstate.ErrChildSectionStartIdxInvalid):
		writeError(w, r, http.StatusBadRequest, "child_section_request_invalid", err.Error())
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, projectstate.ErrSectionNotFound):
		writeError(w, r, http.StatusNotFound, "section_not_found", "Section not found.")
	case errors.Is(err, projectstate.ErrChildSectionImplTypeUnsupported),
		errors.Is(err, projectstate.ErrChildSectionParentUnsupported),
		errors.Is(err, projectstate.ErrCodeSectionChildTypeInvalid),
		errors.Is(err, projectstate.ErrCodeSectionChildCountInvalid),
		errors.Is(err, projectstate.ErrCodeSectionAlreadyHasChild),
		errors.Is(err, projectstate.ErrChildSectionIncrementerCalledByUnsupported),
		errors.Is(err, projectstate.ErrChildSectionIncrementerCalledByNotInParent),
		errors.Is(err, projectstate.ErrChildSectionDecrementerCalledByUnsupported),
		errors.Is(err, projectstate.ErrChildSectionDecrementerCalledByNotInParent):
		writeError(w, r, http.StatusUnprocessableEntity, "child_section_mutation_invalid", err.Error())
	case projectstate.IsInvalidAutoLayoutError(err),
		errors.Is(err, projectstate.ErrSettingsValueInvalid),
		errors.Is(err, settingsstate.ErrSettingsValueInvalid):
		writeError(w, r, http.StatusUnprocessableEntity, "invalid_auto_layout", err.Error())
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
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

func writeChangeParamImplError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrProjectIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrSectionIDRequired):
		writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
	case errors.Is(err, projectstate.ErrCodeObjIDRequired):
		writeError(w, r, http.StatusBadRequest, "param_info_id_required", "Param info id is required.")
	case errors.Is(err, projectstate.ErrChangeParamImplSelectedRequired):
		writeError(w, r, http.StatusBadRequest, "selected_id_required", "Selected impl or code object type is required.")
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, projectstate.ErrSectionNotFound):
		writeError(w, r, http.StatusNotFound, "section_not_found", "Section not found.")
	case errors.Is(err, projectstate.ErrCodeObjNotFound):
		writeError(w, r, http.StatusNotFound, "param_info_not_found", "Param info not found.")
	case errors.Is(err, projectstate.ErrChangeParamImplUnsupported),
		errors.Is(err, projectstate.ErrChangeParamImplCodeObjTypeUnknown),
		errors.Is(err, projectstate.ErrChangeParamImplCodeObjTypeNotAllowed):
		writeError(w, r, http.StatusUnprocessableEntity, "change_param_impl_invalid", err.Error())
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

func writeSectionVariantMutationError(w http.ResponseWriter, r *http.Request, err error) {
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
	case projectstate.IsInvalidSectionVariantSortOrderError(err):
		writeError(w, r, http.StatusUnprocessableEntity, "variant_sort_order_invalid", err.Error())
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func writeVariantMetadataMutationError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrProjectIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrSectionVariantIDRequired):
		writeError(w, r, http.StatusBadRequest, "variant_id_required", "Variant id is required.")
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, projectstate.ErrSectionVariantNotFound):
		writeError(w, r, http.StatusNotFound, "variant_not_found", "Variant not found.")
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func writeVariantJSONSourceMutationError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrJSONSourceKeyEditsDisabled):
		writeError(w, r, http.StatusForbidden, "json_source_key_edits_disabled", "JSON source key edits are disabled for this project.")
	case errors.Is(err, projectstate.ErrSectionVariantDictSectionRequired):
		writeError(w, r, http.StatusUnprocessableEntity, "dict_section_required", "Section variant must resolve to a dict section.")
	default:
		writeSectionVariantMutationError(w, r, err)
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

func writeGraphEdgeMutationError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectview.ErrProjectConfigIDRequired),
		errors.Is(err, projectstate.ErrProjectIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrSectionIDRequired):
		writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
	case errors.Is(err, projectstate.ErrSectionVariantIDRequired):
		writeError(w, r, http.StatusBadRequest, "variant_id_required", "Variant id is required.")
	case errors.Is(err, projectstate.ErrCodeObjIDRequired):
		writeError(w, r, http.StatusBadRequest, "port_id_required", "Port id is required.")
	case errors.Is(err, projectstate.ErrEdgeIDRequired):
		writeError(w, r, http.StatusBadRequest, "edge_id_required", "Edge id is required.")
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, projectstate.ErrSectionNotFound):
		writeError(w, r, http.StatusNotFound, "section_not_found", "Section not found.")
	case errors.Is(err, projectstate.ErrEdgeNotFound):
		writeError(w, r, http.StatusNotFound, "edge_not_found", "Edge not found.")
	case errors.Is(err, projectstate.ErrAgenticEdgeNotFound):
		writeError(w, r, http.StatusNotFound, "agentic_edge_not_found", "Agentic edge not found.")
	case errors.Is(err, projectstate.ErrProjectCodegenPythonTargetMissing):
		writeError(w, r, http.StatusUnprocessableEntity, "project_codegen_python_target_missing", err.Error())
	case errors.Is(err, projectstate.ErrEdgeDuplicateID):
		writeError(w, r, http.StatusConflict, "edge_id_conflict", err.Error())
	case errors.Is(err, projectstate.ErrAgenticEdgeDuplicateID):
		writeError(w, r, http.StatusConflict, "agentic_edge_id_conflict", err.Error())
	case errors.Is(err, projectstate.ErrEdgeEndpointSectionUnsupported),
		errors.Is(err, projectstate.ErrEdgeSourcePortNotFound),
		errors.Is(err, projectstate.ErrEdgeTargetPortNotFound):
		writeError(w, r, http.StatusUnprocessableEntity, "edge_endpoint_invalid", err.Error())
	case errors.Is(err, projectstate.ErrAgenticEdgeKindInvalid),
		errors.Is(err, projectstate.ErrAgenticEdgeSourceSectionType),
		errors.Is(err, projectstate.ErrAgenticEdgeTargetSectionType):
		writeError(w, r, http.StatusUnprocessableEntity, "agentic_edge_invalid", err.Error())
	case errors.Is(err, projectstate.ErrAgenticEdgeContextModeInvalid):
		writeError(w, r, http.StatusUnprocessableEntity, "agentic_edge_context_mode_invalid", err.Error())
	case errors.Is(err, codegen.ErrPythonDependencyNodeNotFound):
		writeError(w, r, http.StatusUnprocessableEntity, "edge_expression_unavailable", err.Error())
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

func writeMoveSectionsError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrProjectIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrChildSectionParentIDRequired):
		writeError(w, r, http.StatusBadRequest, "parent_id_required", "Parent id is required.")
	case errors.Is(err, projectstate.ErrMoveSectionsSectionIDBlank):
		writeError(w, r, http.StatusBadRequest, "section_ids_invalid", err.Error())
	case errors.Is(err, projectstate.ErrMoveSectionsPositionsRequired),
		errors.Is(err, projectstate.ErrMoveSectionsPositionMissing),
		errors.Is(err, projectstate.ErrMoveSectionsPositionInvalid):
		writeError(w, r, http.StatusBadRequest, "positions_invalid", err.Error())
	case errors.Is(err, projectstate.ErrMoveSectionsNewIndexRequired),
		errors.Is(err, projectstate.ErrMoveSectionsNewIndexNegative):
		writeError(w, r, http.StatusBadRequest, "new_index_invalid", err.Error())
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, projectstate.ErrSectionNotFound):
		writeError(w, r, http.StatusNotFound, "section_not_found", "Section not found.")
	case errors.Is(err, projectstate.ErrMoveSectionsAncestorSelection),
		errors.Is(err, projectstate.ErrMoveSectionsNewIndexOutOfRange),
		errors.Is(err, projectstate.ErrMoveSectionsNewParentSelected),
		errors.Is(err, projectstate.ErrMoveSectionsNewParentDescendant),
		errors.Is(err, projectstate.ErrChildSectionParentUnsupported),
		errors.Is(err, projectstate.ErrCodeSectionChildTypeInvalid),
		errors.Is(err, projectstate.ErrCodeSectionChildCountInvalid),
		errors.Is(err, projectstate.ErrCodeSectionAlreadyHasChild):
		writeError(w, r, http.StatusUnprocessableEntity, "move_sections_invalid", err.Error())
	case projectstate.IsInvalidAutoLayoutError(err),
		errors.Is(err, projectstate.ErrSettingsValueInvalid),
		errors.Is(err, settingsstate.ErrSettingsValueInvalid):
		writeError(w, r, http.StatusUnprocessableEntity, "invalid_auto_layout", err.Error())
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func writePrepareSectionsForCopyError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrProjectIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrClipboardSectionIDBlank):
		writeError(w, r, http.StatusBadRequest, "section_ids_invalid", err.Error())
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, projectstate.ErrSectionNotFound):
		writeError(w, r, http.StatusNotFound, "section_not_found", "Section not found.")
	case errors.Is(err, projectstate.ErrSectionVariantNotFound),
		errors.Is(err, projectstate.ErrSectionImplNotFound),
		errors.Is(err, projectstate.ErrCodeObjNotFound),
		errors.Is(err, projectstate.ErrCodeObjVariantNotFound),
		errors.Is(err, projectstate.ErrCodeObjImplNotFound),
		errors.Is(err, projectstate.ErrClipboardSectionVariantMissing):
		writeError(w, r, http.StatusUnprocessableEntity, "prepare_sections_for_copy_invalid", err.Error())
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func isClipboardProjectStateValidationError(err error) bool {
	switch {
	case errors.Is(err, projectstate.ErrSectionIDRequired),
		errors.Is(err, projectstate.ErrSectionNameRequired),
		errors.Is(err, projectstate.ErrSectionIDKeyMismatch),
		errors.Is(err, projectstate.ErrSectionVariantIDRequired),
		errors.Is(err, projectstate.ErrSectionVariantIDKeyMismatch),
		errors.Is(err, projectstate.ErrSectionImplIDRequired),
		errors.Is(err, projectstate.ErrSectionImplIDKeyMismatch),
		errors.Is(err, projectstate.ErrSectionDefaultVariantMissing),
		errors.Is(err, projectstate.ErrSectionImplKindRequired),
		errors.Is(err, projectstate.ErrParentSectionNotFound),
		errors.Is(err, projectstate.ErrSectionVariantNotFound),
		errors.Is(err, projectstate.ErrSectionImplNotFound),
		errors.Is(err, projectstate.ErrSectionVariantMembership),
		errors.Is(err, projectstate.ErrCodeObjIDRequired),
		errors.Is(err, projectstate.ErrCodeObjNameRequired),
		errors.Is(err, projectstate.ErrCodeObjIDKeyMismatch),
		errors.Is(err, projectstate.ErrCodeObjVariantIDRequired),
		errors.Is(err, projectstate.ErrCodeObjVariantIDKeyMismatch),
		errors.Is(err, projectstate.ErrCodeObjImplIDRequired),
		errors.Is(err, projectstate.ErrCodeObjImplIDKeyMismatch),
		errors.Is(err, projectstate.ErrCodeObjDefaultVariantMissing),
		errors.Is(err, projectstate.ErrCodeObjImplTypeRequired),
		errors.Is(err, projectstate.ErrCodeObjNotFound),
		errors.Is(err, projectstate.ErrCodeObjVariantNotFound),
		errors.Is(err, projectstate.ErrCodeObjImplNotFound),
		errors.Is(err, projectstate.ErrCodeObjVariantMembership),
		errors.Is(err, projectstate.ErrFrontendPayloadInvalid):
		return true
	default:
		return false
	}
}

func writePasteSectionsError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrProjectIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrPasteSectionsPositionInvalid):
		writeError(w, r, http.StatusBadRequest, "position_invalid", err.Error())
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, projectstate.ErrClipboardSectionIDBlank),
		errors.Is(err, projectstate.ErrClipboardSectionVariantMissing),
		errors.Is(err, projectstate.ErrSectionNotFound),
		errors.Is(err, projectstate.ErrSectionVariantNotFound),
		errors.Is(err, projectstate.ErrSectionImplNotFound),
		errors.Is(err, projectstate.ErrCodeObjNotFound),
		errors.Is(err, projectstate.ErrCodeObjVariantNotFound),
		errors.Is(err, projectstate.ErrCodeObjImplNotFound),
		errors.Is(err, projectstate.ErrSectionVariantMembership),
		errors.Is(err, projectstate.ErrCodeObjVariantMembership):
		writeError(w, r, http.StatusUnprocessableEntity, "paste_sections_invalid", err.Error())
	case isClipboardProjectStateValidationError(err):
		writeError(w, r, http.StatusUnprocessableEntity, "paste_sections_invalid", err.Error())
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

func writeParamMoveMutationError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrProjectIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrSectionIDRequired):
		writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
	case errors.Is(err, projectstate.ErrParamMoveParamIDBlank):
		writeError(w, r, http.StatusBadRequest, "param_ids_invalid", err.Error())
	case errors.Is(err, projectstate.ErrParamMoveNewParentRequired):
		writeError(w, r, http.StatusBadRequest, "new_parent_id_required", "New parent id is required.")
	case errors.Is(err, projectstate.ErrParamMoveNewIndexNegative):
		writeError(w, r, http.StatusBadRequest, "new_index_invalid", err.Error())
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, projectstate.ErrSectionNotFound):
		writeError(w, r, http.StatusNotFound, "section_not_found", "Section not found.")
	case errors.Is(err, projectstate.ErrCodeObjNotFound),
		errors.Is(err, projectstate.ErrParamMoveParamNotFound):
		writeError(w, r, http.StatusNotFound, "param_info_not_found", "Param info not found.")
	case errors.Is(err, projectstate.ErrParamMoveNewParentNotFound):
		writeError(w, r, http.StatusNotFound, "new_parent_not_found", "New parent not found.")
	case errors.Is(err, projectstate.ErrParamMoveUnsupported),
		errors.Is(err, projectstate.ErrParamMoveRootMissing),
		errors.Is(err, projectstate.ErrParamMoveFilterActive),
		errors.Is(err, projectstate.ErrParamMoveParamUnsupported),
		errors.Is(err, projectstate.ErrParamMoveParentMissing),
		errors.Is(err, projectstate.ErrParamMoveParentUnsupported),
		errors.Is(err, projectstate.ErrParamMoveSelectionSpansParents),
		errors.Is(err, projectstate.ErrParamMoveAncestorSelection),
		errors.Is(err, projectstate.ErrParamMoveNewParentSelected),
		errors.Is(err, projectstate.ErrParamMoveNewParentDescendant),
		errors.Is(err, projectstate.ErrParamMoveNewIndexOutOfRange),
		errors.Is(err, projectstate.ErrParamMoveParentMissingFromGrand),
		errors.Is(err, projectstate.ErrChangeParamImplUnsupported),
		errors.Is(err, projectstate.ErrChangeParamImplCodeObjTypeNotAllowed):
		writeError(w, r, http.StatusUnprocessableEntity, "param_move_invalid", err.Error())
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

func writeSectionDataMutationError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrSpreadsheetSectionRequired):
		writeError(w, r, http.StatusUnprocessableEntity, "spreadsheet_section_required", "Section must resolve to a spreadsheet section.")
	case errors.Is(err, projectstate.ErrSpreadsheetGridDensityInvalid):
		writeError(w, r, http.StatusBadRequest, "spreadsheet_grid_density_invalid", err.Error())
	case errors.Is(err, projectstate.ErrTaskBoardSectionRequired):
		writeError(w, r, http.StatusUnprocessableEntity, "task_board_section_required", "Section must resolve to a task board section.")
	case errors.Is(err, projectstate.ErrTaskBoardViewModeInvalid):
		writeError(w, r, http.StatusBadRequest, "task_board_view_mode_invalid", err.Error())
	case errors.Is(err, projectstate.ErrImageSectionRequired):
		writeError(w, r, http.StatusUnprocessableEntity, "image_section_required", "Section must resolve to an image section.")
	case errors.Is(err, projectstate.ErrSocialSectionRequired):
		writeError(w, r, http.StatusUnprocessableEntity, "social_section_required", "Section must resolve to a social section.")
	default:
		writeProjectLayoutMutationError(w, r, err)
	}
}

func writeDrawAreaMutationError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrDrawSectionRequired):
		writeError(w, r, http.StatusUnprocessableEntity, "draw_section_required", "Section must resolve to a draw section.")
	case errors.Is(err, projectstate.ErrDrawAreaLayerIndexInvalid):
		writeError(w, r, http.StatusBadRequest, "draw_layer_index_invalid", err.Error())
	case errors.Is(err, projectstate.ErrDrawAreaLayerItemTypeInvalid):
		writeError(w, r, http.StatusBadRequest, "draw_area_layer_item_type_invalid", err.Error())
	default:
		writeProjectLayoutMutationError(w, r, err)
	}
}

func writeChartMutationError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrChartSectionRequired):
		writeError(w, r, http.StatusUnprocessableEntity, "chart_section_required", "Section must resolve to a chart section.")
	case errors.Is(err, projectstate.ErrChartTypeInvalid):
		writeError(w, r, http.StatusBadRequest, "chart_type_invalid", err.Error())
	case errors.Is(err, projectstate.ErrChartSettingsFieldInvalid):
		writeError(w, r, http.StatusBadRequest, "chart_settings_field_invalid", err.Error())
	default:
		writeProjectLayoutMutationError(w, r, err)
	}
}

func writeTextBlockMutationError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrTextBlockSectionRequired):
		writeError(w, r, http.StatusUnprocessableEntity, "text_block_section_required", "Section must resolve to a text block section.")
	case errors.Is(err, projectstate.ErrTextBlockDisplayModeInvalid):
		writeError(w, r, http.StatusBadRequest, "text_block_display_mode_invalid", err.Error())
	case errors.Is(err, projectstate.ErrTextBlockFormatInvalid):
		writeError(w, r, http.StatusBadRequest, "text_block_format_invalid", err.Error())
	default:
		writeProjectLayoutMutationError(w, r, err)
	}
}

func writePromptSectionMutationError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrPromptSectionRequired):
		writeError(w, r, http.StatusUnprocessableEntity, "prompt_section_required", "Section must resolve to a prompt section.")
	case errors.Is(err, projectstate.ErrPromptFormatInvalid):
		writeError(w, r, http.StatusBadRequest, "prompt_format_invalid", err.Error())
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

func writeWindowSpaceMutationError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrProjectIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrWindowSpaceIDRequired):
		writeError(w, r, http.StatusBadRequest, "window_space_id_required", "Window space id is required.")
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, projectstate.ErrWindowSpaceNotFound):
		writeError(w, r, http.StatusNotFound, "window_space_not_found", "Window space not found.")
	case projectstate.IsInvalidWindowSpaceNameError(err):
		writeError(w, r, http.StatusUnprocessableEntity, "invalid_window_space_name", err.Error())
	case projectstate.IsInvalidWindowSpaceSortOrderError(err):
		writeError(w, r, http.StatusUnprocessableEntity, "invalid_window_space_sort_order", err.Error())
	case projectstate.IsInvalidWindowSpaceStateError(err):
		writeError(w, r, http.StatusUnprocessableEntity, "invalid_window_space_state", err.Error())
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func writeProjectChatWindowingMutationError(
	w http.ResponseWriter,
	r *http.Request,
	err error,
) {
	switch {
	case errors.Is(err, projectstate.ErrProjectIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrProjectChatWindowIDRequired):
		writeError(w, r, http.StatusBadRequest, "instance_id_required", "Instance id is required.")
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, projectstate.ErrProjectChatWindowNotFound):
		writeError(w, r, http.StatusNotFound, "project_chat_window_not_found", "Project chat window not found.")
	case projectstate.IsInvalidProjectChatWindowingError(err):
		writeError(w, r, http.StatusUnprocessableEntity, "invalid_project_chat_windowing", err.Error())
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
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

func writeSetGenCodePrefixSuffixError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectview.ErrProjectConfigIDRequired),
		errors.Is(err, projectstate.ErrProjectIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, projectstate.ErrProjectCodegenPythonTargetMissing):
		writeError(w, r, http.StatusUnprocessableEntity, "project_codegen_python_target_missing", err.Error())
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
