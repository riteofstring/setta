package httpapi

import (
	"encoding/json"
	"fmt"
	"math"
	"net/http"

	"setta/internal/projectstate"
	"setta/internal/prompttemplates"
)

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
	FrontendOpID *string `json:"frontendOpId,omitempty"`
	ProjectID    string  `json:"projectConfigId"`
	SectionID    string  `json:"sectionId"`
}

type CreateNewSectionVariantResponse = projectstate.CreateNewSectionVariantResult

type SetSectionVariantRequest struct {
	FrontendOpID *string `json:"frontendOpId,omitempty"`
	ProjectID    string  `json:"projectConfigId"`
	SectionID    string  `json:"sectionId"`
	VariantID    string  `json:"variantId"`
}

type SetDefaultSectionVariantRequest struct {
	FrontendOpID *string `json:"frontendOpId,omitempty"`
	ProjectID    string  `json:"projectConfigId"`
	SectionID    string  `json:"sectionId"`
	VariantID    string  `json:"variantId"`
}

type SetSectionVariantSortOrderRequest struct {
	FrontendOpID      *string  `json:"frontendOpId,omitempty"`
	ProjectID         string   `json:"projectConfigId"`
	SectionID         string   `json:"sectionId"`
	OrderedVariantIDs []string `json:"orderedVariantIds"`
}

type ToggleVariantFrozenRequest struct {
	FrontendOpID *string `json:"frontendOpId,omitempty"`
	ProjectID    string  `json:"projectConfigId"`
	VariantID    string  `json:"variantId"`
}

type ToggleVariantJSONSourceRequest struct {
	FrontendOpID *string `json:"frontendOpId,omitempty"`
	ProjectID    string  `json:"projectConfigId"`
	SectionID    string  `json:"sectionId"`
	VariantID    string  `json:"variantId"`
}

type SetVariantJSONSourceKeysRequest struct {
	FrontendOpID   *string  `json:"frontendOpId,omitempty"`
	ProjectID      string   `json:"projectConfigId"`
	SectionID      string   `json:"sectionId"`
	VariantID      string   `json:"variantId"`
	JSONSourceKeys []string `json:"jsonSourceKeys"`
}

type SetSectionVariantNameRequest struct {
	FrontendOpID *string `json:"frontendOpId,omitempty"`
	ProjectID    string  `json:"projectConfigId"`
	VariantID    string  `json:"variantId"`
	Name         string  `json:"name"`
}

type DeleteSectionsRequest struct {
	FrontendOpID *string  `json:"frontendOpId,omitempty"`
	ProjectID    string   `json:"projectConfigId"`
	SectionIDs   []string `json:"sectionIds"`
}

type DeleteSelectedParamsRequest struct {
	FrontendOpID *string  `json:"frontendOpId,omitempty"`
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
	FrontendOpID    *string         `json:"frontendOpId,omitempty"`
	ProjectID       string          `json:"projectConfigId"`
	SourceSectionID string          `json:"sourceSectionId"`
	SourceVariantID string          `json:"sourceVariantId"`
	SourcePortID    string          `json:"sourcePortId"`
	TargetSectionID string          `json:"targetSectionId"`
	TargetVariantID string          `json:"targetVariantId"`
	TargetPortID    string          `json:"targetPortId"`
	Type            string          `json:"type"`
	Label           *string         `json:"label"`
	Style           json.RawMessage `json:"style" ts_type:"Record<string, unknown> | null"`
	Animated        bool            `json:"animated"`
	Hidden          bool            `json:"hidden"`
	ZIndex          int             `json:"zIndex"`
	Data            json.RawMessage `json:"data" ts_type:"Record<string, unknown> | null"`
}

type UpdateEdgeRequest struct {
	FrontendOpID *string           `json:"frontendOpId,omitempty"`
	ProjectID    string            `json:"projectConfigId"`
	Edge         projectstate.Edge `json:"edge"`
}

type DeleteEdgesRequest struct {
	FrontendOpID *string  `json:"frontendOpId,omitempty"`
	ProjectID    string   `json:"projectConfigId"`
	EdgeIDs      []string `json:"edgeIds"`
}

type ReconnectEdgeRequest struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
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
	FrontendOpID *string             `json:"frontendOpId,omitempty"`
	ProjectID    string              `json:"projectConfigId"`
	Edges        []projectstate.Edge `json:"edges"`
}

type CreateStateMachineEdgeRequest struct {
	FrontendOpID                   *string                                                  `json:"frontendOpId,omitempty"`
	ProjectID                      string                                                   `json:"projectConfigId"`
	ID                             *string                                                  `json:"id"`
	MachineGroupID                 string                                                   `json:"machineGroupId"`
	SourceSectionID                string                                                   `json:"sourceSectionId"`
	SourcePortID                   string                                                   `json:"sourcePortId"`
	TargetSectionID                string                                                   `json:"targetSectionId"`
	TargetPortID                   string                                                   `json:"targetPortId"`
	SourceFilter                   *projectstate.StateMachineSourceFilter                   `json:"sourceFilter"`
	SourceActivationCountCondition *projectstate.StateMachineSourceActivationCountCondition `json:"sourceActivationCountCondition"`
	TargetAction                   *projectstate.StateMachineTargetAction                   `json:"targetAction"`
	Style                          json.RawMessage                                          `json:"style" ts_type:"Record<string, unknown> | null"`
	Hidden                         bool                                                     `json:"hidden"`
	ZIndex                         int                                                      `json:"zIndex"`
	Selected                       bool                                                     `json:"selected"`
}

type UpdateStateMachineEdgeRequest struct {
	FrontendOpID *string                       `json:"frontendOpId,omitempty"`
	ProjectID    string                        `json:"projectConfigId"`
	Edge         projectstate.StateMachineEdge `json:"edge"`
}

type DeleteStateMachineEdgesRequest struct {
	FrontendOpID *string  `json:"frontendOpId,omitempty"`
	ProjectID    string   `json:"projectConfigId"`
	EdgeIDs      []string `json:"edgeIds"`
}

type SetStateMachineEdgesRequest struct {
	FrontendOpID *string                         `json:"frontendOpId,omitempty"`
	ProjectID    string                          `json:"projectConfigId"`
	Edges        []projectstate.StateMachineEdge `json:"edges"`
}

type CreateAgenticEdgeRequest struct {
	FrontendOpID    *string         `json:"frontendOpId,omitempty"`
	ProjectID       string          `json:"projectConfigId"`
	ID              *string         `json:"id"`
	SourceSectionID string          `json:"sourceSectionId"`
	TargetSectionID string          `json:"targetSectionId"`
	Kind            string          `json:"kind"`
	ContextMode     *string         `json:"contextMode"`
	Style           json.RawMessage `json:"style" ts_type:"Record<string, unknown> | null"`
	Hidden          bool            `json:"hidden"`
	ZIndex          int             `json:"zIndex"`
}

type UpdateAgenticEdgeRequest struct {
	FrontendOpID *string                  `json:"frontendOpId,omitempty"`
	ProjectID    string                   `json:"projectConfigId"`
	Edge         projectstate.AgenticEdge `json:"edge"`
}

type DeleteAgenticEdgesRequest struct {
	FrontendOpID *string  `json:"frontendOpId,omitempty"`
	ProjectID    string   `json:"projectConfigId"`
	EdgeIDs      []string `json:"edgeIds"`
}

type SetAgenticEdgesRequest struct {
	FrontendOpID *string                    `json:"frontendOpId,omitempty"`
	ProjectID    string                     `json:"projectConfigId"`
	Edges        []projectstate.AgenticEdge `json:"edges"`
}

type MoveSectionsRequest struct {
	FrontendOpID  *string                          `json:"frontendOpId,omitempty"`
	ProjectID     string                           `json:"projectConfigId"`
	SectionIDs    []string                         `json:"sectionIds"`
	NewParentID   *string                          `json:"newParentId"`
	NewIndex      *int                             `json:"newIndex"`
	PositionsByID map[string]projectstate.Position `json:"positionsById" ts_type:"Record<string, Position> | null"`
}

type MoveParamsRequest struct {
	FrontendOpID *string  `json:"frontendOpId,omitempty"`
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
	FrontendOpID *string                 `json:"frontendOpId,omitempty"`
	ProjectID    string                  `json:"projectConfigId"`
	SectionID    string                  `json:"sectionId"`
	Moves        []MoveParamGroupRequest `json:"moves"`
}

type IndentParamsRequest struct {
	FrontendOpID *string  `json:"frontendOpId,omitempty"`
	ProjectID    string   `json:"projectConfigId"`
	SectionID    string   `json:"sectionId"`
	ParamIDs     []string `json:"paramIds"`
}

type UnindentParamsRequest struct {
	FrontendOpID *string  `json:"frontendOpId,omitempty"`
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
	FrontendOpID *string `json:"frontendOpId,omitempty"`
	ProjectID    string  `json:"projectConfigId"`
	ParentID     string  `json:"parentId"`
	ImplType     string  `json:"implType"`
	NumChildren  int     `json:"numChildren"`
	StartIdx     *int    `json:"startIdx"`
}

type CreateChildSectionsViaIncrementerRequest struct {
	FrontendOpID *string `json:"frontendOpId,omitempty"`
	ProjectID    string  `json:"projectConfigId"`
	CalledBy     string  `json:"calledBy"`
	ImplType     string  `json:"implType"`
	NumChildren  int     `json:"numChildren"`
}

type DeleteChildSectionsViaDecrementerRequest struct {
	FrontendOpID *string `json:"frontendOpId,omitempty"`
	ProjectID    string  `json:"projectConfigId"`
	CalledBy     string  `json:"calledBy"`
	NumChildren  int     `json:"numChildren"`
}

type CreateTopLevelSectionRequest struct {
	FrontendOpID       *string                                       `json:"frontendOpId,omitempty"`
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
	FrontendOpID *string `json:"frontendOpId,omitempty"`
	ProjectID    string  `json:"projectConfigId"`
}

type SetActiveViewModeRequest struct {
	FrontendOpID     *string `json:"frontendOpId,omitempty"`
	ProjectID        string  `json:"projectConfigId"`
	ActiveViewModeID string  `json:"activeViewModeId"`
}

type ToggleIsEditingViewModeRequest struct {
	FrontendOpID *string `json:"frontendOpId,omitempty"`
	ProjectID    string  `json:"projectConfigId"`
}

type ToggleSectionVisibilityRequest struct {
	FrontendOpID *string  `json:"frontendOpId,omitempty"`
	ProjectID    string   `json:"projectConfigId"`
	SectionIDs   []string `json:"sectionIds"`
}

type GroupSectionsRequest struct {
	FrontendOpID *string  `json:"frontendOpId,omitempty"`
	ProjectID    string   `json:"projectConfigId"`
	SectionIDs   []string `json:"sectionIds"`
}

type UngroupGroupsRequest struct {
	FrontendOpID *string  `json:"frontendOpId,omitempty"`
	ProjectID    string   `json:"projectConfigId"`
	GroupIDs     []string `json:"groupIds"`
}

type ToggleViewModeUserFacingRequest struct {
	FrontendOpID *string `json:"frontendOpId,omitempty"`
	ProjectID    string  `json:"projectConfigId"`
	ViewModeID   string  `json:"viewModeId"`
}

type ToggleViewModeTabRequest struct {
	FrontendOpID *string `json:"frontendOpId,omitempty"`
	ProjectID    string  `json:"projectConfigId"`
	ViewModeID   string  `json:"viewModeId"`
}

type SetViewModeNameRequest struct {
	FrontendOpID *string `json:"frontendOpId,omitempty"`
	ProjectID    string  `json:"projectConfigId"`
	ViewModeID   string  `json:"viewModeId"`
	Name         string  `json:"name"`
}

type SetViewModeSortOrderRequest struct {
	FrontendOpID       *string  `json:"frontendOpId,omitempty"`
	ProjectID          string   `json:"projectConfigId"`
	OrderedViewModeIDs []string `json:"orderedViewModeIds"`
}

type DeleteViewModeRequest struct {
	FrontendOpID *string `json:"frontendOpId,omitempty"`
	ProjectID    string  `json:"projectConfigId"`
	ViewModeID   string  `json:"viewModeId"`
}

type SetTopLevelSectionLayoutRequest struct {
	FrontendOpID     *string                                       `json:"frontendOpId,omitempty"`
	ProjectID        string                                        `json:"projectConfigId"`
	TopLevelSections map[string]projectstate.TopLevelSectionLayout `json:"topLevelSections"`
}

type AutoLayoutTopLevelSectionsRequest struct {
	FrontendOpID *string `json:"frontendOpId,omitempty"`
	ProjectID    string  `json:"projectConfigId"`
	Margin       *int    `json:"margin"`
}

type SetShowParamDisplayNamesRequest struct {
	FrontendOpID          *string `json:"frontendOpId,omitempty"`
	ProjectID             string  `json:"projectConfigId"`
	ShowParamDisplayNames bool    `json:"showParamDisplayNames"`
}

type SetSectionNameRequest struct {
	FrontendOpID *string `json:"frontendOpId,omitempty"`
	ProjectID    string  `json:"projectConfigId"`
	SectionID    string  `json:"sectionId"`
	Name         string  `json:"name"`
}

type SetCodeFileBindingRequest struct {
	FrontendOpID *string               `json:"frontendOpId,omitempty"`
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
	FrontendOpID *string  `json:"frontendOpId,omitempty"`
	ProjectID    string   `json:"projectConfigId"`
	SectionIDs   []string `json:"sectionIds"`
}

type ToggleMinimizedRequest struct {
	FrontendOpID *string `json:"frontendOpId,omitempty"`
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

// setta-go-type-discovery: skip
type (
	SetSectionSizesRequest struct {
		FrontendOpID *string                       `json:"frontendOpId,omitempty"`
		ProjectID    string                        `json:"projectConfigId"`
		SectionSizes map[string]sectionSizeRequest `json:"sectionSizes"`
	}

	SetCallableRequest struct {
		FrontendOpID  *string `json:"frontendOpId,omitempty"`
		ProjectID     string  `json:"projectConfigId"`
		SectionID     string  `json:"sectionId"`
		CallableName  string  `json:"callableName"`
		RefetchParams bool    `json:"refetchParams"`
	}

	SetActiveIDsRequest struct {
		FrontendOpID *string  `json:"frontendOpId,omitempty"`
		ProjectID    string   `json:"projectConfigId"`
		ActiveIDs    []string `json:"activeIds"`
	}

	SetViewportRequest struct {
		FrontendOpID *string                `json:"frontendOpId,omitempty"`
		ProjectID    string                 `json:"projectConfigId"`
		Viewport     *projectstate.Viewport `json:"viewport"`
	}

	SetCodeRequest struct {
		FrontendOpID *string `json:"frontendOpId,omitempty"`
		ProjectID    string  `json:"projectConfigId"`
		SectionID    string  `json:"sectionId"`
		Code         string  `json:"code"`
	}

	FormatCodeRequest struct {
		FrontendOpID *string `json:"frontendOpId,omitempty"`
		ProjectID    string  `json:"projectConfigId"`
		SectionID    string  `json:"sectionId"`
	}
)

type SetSectionTagColorRequest struct {
	FrontendOpID *string `json:"frontendOpId,omitempty"`
	ProjectID    string  `json:"projectConfigId"`
	SectionID    string  `json:"sectionId"`
	TagColor     *string `json:"tagColor"`
}

type SetSectionStyleColorRequest struct {
	FrontendOpID *string `json:"frontendOpId,omitempty"`
	ProjectID    string  `json:"projectConfigId"`
	SectionID    string  `json:"sectionId"`
	StyleColor   *string `json:"styleColor"`
}

type SetSectionParamFilterRequest struct {
	FrontendOpID *string `json:"frontendOpId,omitempty"`
	ProjectID    string  `json:"projectConfigId"`
	SectionID    string  `json:"sectionId"`
	Value        string  `json:"value"`
}

type SetMetaControlShowSectionTitleRequest struct {
	FrontendOpID     *string `json:"frontendOpId,omitempty"`
	ProjectID        string  `json:"projectConfigId"`
	SectionID        string  `json:"sectionId"`
	ShowSectionTitle bool    `json:"showSectionTitle"`
}

type SetSectionColumnWidthRequest struct {
	FrontendOpID *string  `json:"frontendOpId,omitempty"`
	ProjectID    string   `json:"projectConfigId"`
	SectionID    string   `json:"sectionId"`
	ColumnWidth  *float64 `json:"columnWidth"`
}

type SetSectionEdgeInputsRequest struct {
	FrontendOpID    *string  `json:"frontendOpId,omitempty"`
	ProjectID       string   `json:"projectConfigId"`
	SectionID       string   `json:"sectionId"`
	EdgeInputParams []string `json:"edgeInputParams"`
}

type SetSectionEdgeOutputsRequest struct {
	FrontendOpID    *string                 `json:"frontendOpId,omitempty"`
	ProjectID       string                  `json:"projectConfigId"`
	SectionID       string                  `json:"sectionId"`
	EdgeOutputPorts []projectstate.EdgePort `json:"edgeOutputPorts"`
}

type SetParentDefaultChildSectionTypeRequest struct {
	FrontendOpID            *string `json:"frontendOpId,omitempty"`
	ProjectID               string  `json:"projectConfigId"`
	SectionID               string  `json:"sectionId"`
	DefaultChildSectionType string  `json:"defaultChildSectionType"`
}

type SetListRootViewModeRequest struct {
	FrontendOpID *string                       `json:"frontendOpId,omitempty"`
	ProjectID    string                        `json:"projectConfigId"`
	SectionID    string                        `json:"sectionId"`
	ViewMode     projectstate.ListRootViewMode `json:"viewMode"`
}

type ToggleGroupOrientationRequest struct {
	FrontendOpID *string `json:"frontendOpId,omitempty"`
	ProjectID    string  `json:"projectConfigId"`
	SectionID    string  `json:"sectionId"`
}

type SetGroupOverflowModeRequest struct {
	FrontendOpID *string `json:"frontendOpId,omitempty"`
	ProjectID    string  `json:"projectConfigId"`
	SectionID    string  `json:"sectionId"`
	OverflowMode bool    `json:"overflowMode"`
}

type SetCallableHideParamsRequest struct {
	FrontendOpID *string `json:"frontendOpId,omitempty"`
	ProjectID    string  `json:"projectConfigId"`
	SectionID    string  `json:"sectionId"`
	HideParams   bool    `json:"hideParams"`
}

type SetSectionHideUnpinnedParamsRequest struct {
	FrontendOpID       *string `json:"frontendOpId,omitempty"`
	ProjectID          string  `json:"projectConfigId"`
	SectionID          string  `json:"sectionId"`
	HideUnpinnedParams bool    `json:"hideUnpinnedParams"`
}

type SetSectionPinnedParamsRequest struct {
	FrontendOpID *string  `json:"frontendOpId,omitempty"`
	ProjectID    string   `json:"projectConfigId"`
	SectionID    string   `json:"sectionId"`
	PinnedParams []string `json:"pinnedParams"`
}

type ToggleParamSelectedRequest struct {
	FrontendOpID *string `json:"frontendOpId,omitempty"`
	ProjectID    string  `json:"projectConfigId"`
	SectionID    string  `json:"sectionId"`
	ParamInfoID  string  `json:"paramInfoId"`
}

type UnselectAllParamsRequest struct {
	FrontendOpID *string `json:"frontendOpId,omitempty"`
	ProjectID    string  `json:"projectConfigId"`
}

type SetBrowserColumnWidthsRequest struct {
	FrontendOpID     *string  `json:"frontendOpId,omitempty"`
	ProjectID        string   `json:"projectConfigId"`
	SectionID        string   `json:"sectionId"`
	ColumnWidth      *float64 `json:"columnWidth"`
	TypesColumnWidth *float64 `json:"typesColumnWidth"`
}

type SetBrowserAreaViewModeRequest struct {
	FrontendOpID *string                          `json:"frontendOpId,omitempty"`
	ProjectID    string                           `json:"projectConfigId"`
	SectionID    string                           `json:"sectionId"`
	ViewMode     projectstate.BrowserAreaViewMode `json:"viewMode"`
}

type SetBrowserHideColumnRequest struct {
	FrontendOpID *string `json:"frontendOpId,omitempty"`
	ProjectID    string  `json:"projectConfigId"`
	SectionID    string  `json:"sectionId"`
	HideColumn   bool    `json:"hideColumn"`
}

type SetBrowserSavedSearchesRequest struct {
	FrontendOpID  *string                           `json:"frontendOpId,omitempty"`
	ProjectID     string                            `json:"projectConfigId"`
	SectionID     string                            `json:"sectionId"`
	SavedSearches []projectstate.BrowserSavedSearch `json:"savedSearches"`
}

type browserSavedSearchRequestRaw struct {
	ID          string                                      `json:"id"`
	Name        string                                      `json:"name"`
	Query       string                                      `json:"query"`
	SearchScope *json.RawMessage                            `json:"searchScope"`
	TypeFilters *projectstate.BrowserSavedSearchTypeFilters `json:"typeFilters"`
	Color       string                                      `json:"color"`
	QuickInfo   string                                      `json:"quickInfo"`
}

type setBrowserSavedSearchesRequestRaw struct {
	FrontendOpID  *string                        `json:"frontendOpId,omitempty"`
	ProjectID     string                         `json:"projectConfigId"`
	SectionID     string                         `json:"sectionId"`
	SavedSearches []browserSavedSearchRequestRaw `json:"savedSearches"`
}

type browserRequestValidationError struct {
	message string
}

func (e *browserRequestValidationError) Error() string {
	if e == nil {
		return ""
	}
	return e.message
}

func validateBrowserAreaViewModeRequestValue(mode projectstate.BrowserAreaViewMode) error {
	switch mode {
	case projectstate.BrowserAreaViewModeList, projectstate.BrowserAreaViewModeThumbnail, projectstate.BrowserAreaViewModeCarousel:
		return nil
	default:
		return fmt.Errorf(
			"Invalid viewMode value %q. Expected one of: %q, %q, %q.",
			string(mode),
			projectstate.BrowserAreaViewModeList,
			projectstate.BrowserAreaViewModeThumbnail,
			projectstate.BrowserAreaViewModeCarousel,
		)
	}
}

func validateBrowserSearchScopeRequestValue(scope projectstate.BrowserSearchScope) error {
	switch scope {
	case projectstate.BrowserSearchScopeRecursive, projectstate.BrowserSearchScopeLocal:
		return nil
	default:
		return fmt.Errorf(
			"Invalid searchScope value %q. Expected one of: %q, %q.",
			string(scope),
			projectstate.BrowserSearchScopeRecursive,
			projectstate.BrowserSearchScopeLocal,
		)
	}
}

func decodeBrowserSavedSearchesRequest(r *http.Request) (SetBrowserSavedSearchesRequest, error) {
	rawPayload, err := decodeJSONBody[setBrowserSavedSearchesRequestRaw](r)
	if err != nil {
		return SetBrowserSavedSearchesRequest{}, err
	}

	payload := SetBrowserSavedSearchesRequest{
		FrontendOpID: rawPayload.FrontendOpID,
		ProjectID:    rawPayload.ProjectID,
		SectionID:    rawPayload.SectionID,
	}
	if len(rawPayload.SavedSearches) == 0 {
		payload.SavedSearches = []projectstate.BrowserSavedSearch{}
		return payload, nil
	}

	payload.SavedSearches = make([]projectstate.BrowserSavedSearch, len(rawPayload.SavedSearches))
	for idx, rawSearch := range rawPayload.SavedSearches {
		savedSearch := projectstate.BrowserSavedSearch{
			ID:          rawSearch.ID,
			Name:        rawSearch.Name,
			Query:       rawSearch.Query,
			TypeFilters: rawSearch.TypeFilters,
			Color:       rawSearch.Color,
			QuickInfo:   rawSearch.QuickInfo,
		}
		if rawSearch.SearchScope != nil {
			var scope string
			if err := json.Unmarshal(*rawSearch.SearchScope, &scope); err != nil {
				return SetBrowserSavedSearchesRequest{}, err
			}
			savedSearch.SearchScope = projectstate.BrowserSearchScope(scope)
			if err := validateBrowserSearchScopeRequestValue(savedSearch.SearchScope); err != nil {
				return SetBrowserSavedSearchesRequest{}, &browserRequestValidationError{message: err.Error()}
			}
		}
		payload.SavedSearches[idx] = savedSearch
	}
	return payload, nil
}

type SetSpreadsheetFilePathRequest struct {
	FrontendOpID *string `json:"frontendOpId,omitempty"`
	ProjectID    string  `json:"projectConfigId"`
	SectionID    string  `json:"sectionId"`
	FilePath     string  `json:"filePath"`
	ActiveSheet  *string `json:"activeSheet"`
}

type SetSpreadsheetSectionSettingsRequest struct {
	FrontendOpID               *string                             `json:"frontendOpId,omitempty"`
	ProjectID                  string                              `json:"projectConfigId"`
	SectionID                  string                              `json:"sectionId"`
	ReadOnly                   bool                                `json:"readOnly"`
	ShowRowNumbers             bool                                `json:"showRowNumbers"`
	Density                    projectstate.SpreadsheetGridDensity `json:"density"`
	AutoReloadOnExternalChange bool                                `json:"autoReloadOnExternalChange"`
}

type SetTaskBoardSectionStateRequest struct {
	FrontendOpID *string                        `json:"frontendOpId,omitempty"`
	ProjectID    string                         `json:"projectConfigId"`
	SectionID    string                         `json:"sectionId"`
	ViewMode     projectstate.TaskBoardViewMode `json:"viewMode"`
	Columns      []projectstate.TaskBoardColumn `json:"columns"`
	Tasks        []projectstate.TaskBoardTask   `json:"tasks"`
}

func validateSpreadsheetDensityRequestValue(density projectstate.SpreadsheetGridDensity) error {
	switch density {
	case projectstate.SpreadsheetGridDensityCompact, projectstate.SpreadsheetGridDensityComfortable:
		return nil
	default:
		return fmt.Errorf(
			"Invalid density value %q. Expected one of: %q, %q.",
			string(density),
			projectstate.SpreadsheetGridDensityCompact,
			projectstate.SpreadsheetGridDensityComfortable,
		)
	}
}

func validateTaskBoardViewModeRequestValue(viewMode projectstate.TaskBoardViewMode) error {
	switch viewMode {
	case projectstate.TaskBoardViewModeTaskList, projectstate.TaskBoardViewModeKanban:
		return nil
	default:
		return fmt.Errorf(
			"Invalid viewMode value %q. Expected one of: %q, %q.",
			string(viewMode),
			projectstate.TaskBoardViewModeTaskList,
			projectstate.TaskBoardViewModeKanban,
		)
	}
}

type SetImageAreaImagePathRequest struct {
	FrontendOpID *string `json:"frontendOpId,omitempty"`
	ProjectID    string  `json:"projectConfigId"`
	SectionID    string  `json:"sectionId"`
	ImagePath    string  `json:"imagePath"`
}

type SetSocialURLRequest struct {
	FrontendOpID *string `json:"frontendOpId,omitempty"`
	ProjectID    string  `json:"projectConfigId"`
	SectionID    string  `json:"sectionId"`
	URL          string  `json:"url"`
}

type AppendDrawAreaLayerItemRequest struct {
	FrontendOpID *string                        `json:"frontendOpId,omitempty"`
	ProjectID    string                         `json:"projectConfigId"`
	SectionID    string                         `json:"sectionId"`
	LayerIdx     int                            `json:"layerIdx"`
	Element      projectstate.DrawAreaLayerItem `json:"element"`
}

type SetChartAreaDataPathRequest struct {
	FrontendOpID *string `json:"frontendOpId,omitempty"`
	ProjectID    string  `json:"projectConfigId"`
	SectionID    string  `json:"sectionId"`
	DataPath     string  `json:"dataPath"`
}

type SetChartTypeRequest struct {
	FrontendOpID *string                `json:"frontendOpId,omitempty"`
	ProjectID    string                 `json:"projectConfigId"`
	SectionID    string                 `json:"sectionId"`
	ChartType    projectstate.ChartType `json:"chartType"`
}

type SetChartSettingsRequest struct {
	FrontendOpID    *string                          `json:"frontendOpId,omitempty"`
	ProjectID       string                           `json:"projectConfigId"`
	SectionID       string                           `json:"sectionId"`
	ChartSettings   projectstate.ChartSettingsUpdate `json:"chartSettings"`
	ChangedSettings []string                         `json:"changedSettings"`
}

func validateChartTypeRequestValue(fieldName string, chartType projectstate.ChartType) error {
	switch chartType {
	case projectstate.ChartTypeLine, projectstate.ChartTypeScatter:
		return nil
	default:
		return fmt.Errorf(
			"Invalid %s value %q. Expected one of: %q, %q.",
			fieldName,
			string(chartType),
			projectstate.ChartTypeLine,
			projectstate.ChartTypeScatter,
		)
	}
}

type SetTextBlockTextRequest struct {
	FrontendOpID *string `json:"frontendOpId,omitempty"`
	ProjectID    string  `json:"projectConfigId"`
	SectionID    string  `json:"sectionId"`
	Text         string  `json:"text"`
}

type SetTextBlockDisplayModeRequest struct {
	FrontendOpID    *string                           `json:"frontendOpId,omitempty"`
	ProjectID       string                            `json:"projectConfigId"`
	SectionID       string                            `json:"sectionId"`
	TextDisplayMode projectstate.TextBlockDisplayMode `json:"textDisplayMode"`
}

type SetTextBlockFormatRequest struct {
	FrontendOpID *string                      `json:"frontendOpId,omitempty"`
	ProjectID    string                       `json:"projectConfigId"`
	SectionID    string                       `json:"sectionId"`
	Format       projectstate.TextBlockFormat `json:"format"`
}

func validateTextBlockDisplayModeRequestValue(mode projectstate.TextBlockDisplayMode) error {
	switch mode {
	case projectstate.TextBlockDisplayModeRender, projectstate.TextBlockDisplayModeEdit:
		return nil
	default:
		return fmt.Errorf(
			"Invalid textDisplayMode value %q. Expected one of: %q, %q.",
			string(mode),
			projectstate.TextBlockDisplayModeRender,
			projectstate.TextBlockDisplayModeEdit,
		)
	}
}

func validateTextBlockFormatRequestValue(format projectstate.TextBlockFormat) error {
	switch format {
	case projectstate.TextBlockFormatPlaintext, projectstate.TextBlockFormatMarkdown:
		return nil
	default:
		return fmt.Errorf(
			"Invalid format value %q. Expected one of: %q, %q.",
			string(format),
			projectstate.TextBlockFormatPlaintext,
			projectstate.TextBlockFormatMarkdown,
		)
	}
}

type SetTextBlockHeadingAsSectionNameRequest struct {
	FrontendOpID         *string `json:"frontendOpId,omitempty"`
	ProjectID            string  `json:"projectConfigId"`
	SectionID            string  `json:"sectionId"`
	HeadingAsSectionName bool    `json:"headingAsSectionName"`
}

type SetTextBlockMetaControlStyleRequest struct {
	FrontendOpID     *string `json:"frontendOpId,omitempty"`
	ProjectID        string  `json:"projectConfigId"`
	SectionID        string  `json:"sectionId"`
	MetaControlStyle bool    `json:"metaControlStyle"`
}

type SetTextBlockMasterFontSizeRequest struct {
	FrontendOpID     *string `json:"frontendOpId,omitempty"`
	ProjectID        string  `json:"projectConfigId"`
	SectionID        string  `json:"sectionId"`
	MasterFontSizePx float64 `json:"masterFontSizePx"`
}

type SetPromptTemplateRequest struct {
	FrontendOpID *string `json:"frontendOpId,omitempty"`
	ProjectID    string  `json:"projectConfigId"`
	SectionID    string  `json:"sectionId"`
	Template     string  `json:"template"`
}

type SetPromptTemplateLinkRequest struct {
	FrontendOpID     *string `json:"frontendOpId,omitempty"`
	ProjectID        string  `json:"projectConfigId"`
	SectionID        string  `json:"sectionId"`
	PromptTemplateID *string `json:"promptTemplateId,omitempty"`
}

type SetPromptInputsRequest struct {
	FrontendOpID *string           `json:"frontendOpId,omitempty"`
	ProjectID    string            `json:"projectConfigId"`
	SectionID    string            `json:"sectionId"`
	Inputs       map[string]string `json:"inputs"`
}

type SetPromptFormatRequest struct {
	FrontendOpID *string                `json:"frontendOpId,omitempty"`
	ProjectID    string                 `json:"projectConfigId"`
	SectionID    string                 `json:"sectionId"`
	Format       prompttemplates.Format `json:"format"`
}

// setta-go-type-discovery: skip
type SetChatSectionSettingsRequest struct {
	FrontendOpID           *string                         `json:"frontendOpId,omitempty"`
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

func validateChatPermissionModeRequestValue(mode projectstate.ChatPermissionMode) error {
	switch mode {
	case projectstate.ChatPermissionModeMinimal,
		projectstate.ChatPermissionModeYOLO,
		projectstate.ChatPermissionModeConfigTomlCustom:
		return nil
	default:
		return fmt.Errorf(
			"Invalid permissionMode value %q. Expected one of: %q, %q, %q.",
			string(mode),
			projectstate.ChatPermissionModeMinimal,
			projectstate.ChatPermissionModeYOLO,
			projectstate.ChatPermissionModeConfigTomlCustom,
		)
	}
}

func validateChatDictationModeRequestValue(mode projectstate.ChatDictationMode) error {
	switch mode {
	case projectstate.ChatDictationModeAuto,
		projectstate.ChatDictationModeBrowser,
		projectstate.ChatDictationModeProvider:
		return nil
	default:
		return fmt.Errorf(
			"Invalid dictationMode value %q. Expected one of: %q, %q, %q.",
			string(mode),
			projectstate.ChatDictationModeAuto,
			projectstate.ChatDictationModeBrowser,
			projectstate.ChatDictationModeProvider,
		)
	}
}

type SetStateMachineSectionSettingsRequest struct {
	FrontendOpID   *string                            `json:"frontendOpId,omitempty"`
	ProjectID      string                             `json:"projectConfigId"`
	SectionID      string                             `json:"sectionId"`
	MachineGroupID string                             `json:"machineGroupId"`
	Label          string                             `json:"label"`
	GateType       *projectstate.StateMachineGateType `json:"gateType,omitempty"`
}

type SetChatSectionStateRequest struct {
	FrontendOpID *string                       `json:"frontendOpId,omitempty"`
	ProjectID    string                        `json:"projectConfigId"`
	SectionID    string                        `json:"sectionId"`
	State        projectstate.ChatSectionState `json:"state"`
}

type GetChatSectionChatIDRequest struct {
	ProjectID string `json:"projectConfigId"`
	SectionID string `json:"sectionId"`
}

type ChatSectionChatIDResponse string

type SetChatSectionChatIDRequest struct {
	FrontendOpID *string `json:"frontendOpId,omitempty"`
	ProjectID    string  `json:"projectConfigId"`
	SectionID    string  `json:"sectionId"`
	ChatID       *string `json:"chatId"`
}

type CreateWindowSpaceRequest struct {
	FrontendOpID *string                       `json:"frontendOpId,omitempty"`
	ProjectID    string                        `json:"projectConfigId"`
	State        projectstate.WindowSpaceState `json:"state"`
	Name         *string                       `json:"name,omitempty"`
}

type SetWindowSpaceNameRequest struct {
	FrontendOpID  *string `json:"frontendOpId,omitempty"`
	ProjectID     string  `json:"projectConfigId"`
	WindowSpaceID string  `json:"windowSpaceId"`
	Name          string  `json:"name"`
}

type SetWindowSpaceSortOrderRequest struct {
	FrontendOpID          *string  `json:"frontendOpId,omitempty"`
	ProjectID             string   `json:"projectConfigId"`
	OrderedWindowSpaceIDs []string `json:"orderedWindowSpaceIds"`
}

type DeleteWindowSpaceRequest struct {
	FrontendOpID  *string `json:"frontendOpId,omitempty"`
	ProjectID     string  `json:"projectConfigId"`
	WindowSpaceID string  `json:"windowSpaceId"`
}

type SetProjectChatWindowingStateRequest struct {
	FrontendOpID *string                                `json:"frontendOpId,omitempty"`
	ProjectID    string                                 `json:"projectConfigId"`
	State        projectstate.ProjectChatWindowingState `json:"state"`
}

type SetProjectChatWindowChatIDRequest struct {
	FrontendOpID *string `json:"frontendOpId,omitempty"`
	ProjectID    string  `json:"projectConfigId"`
	InstanceID   string  `json:"instanceId"`
	ChatID       *string `json:"chatId"`
}

type ChangeParamImplRequest struct {
	FrontendOpID *string `json:"frontendOpId,omitempty"`
	ProjectID    string  `json:"projectConfigId"`
	SectionID    string  `json:"sectionId"`
	ParamInfoID  string  `json:"paramInfoId"`
	SelectedID   string  `json:"selectedId"`
}

type SetParamEnteredValueRequest struct {
	FrontendOpID     *string `json:"frontendOpId,omitempty"`
	ProjectID        string  `json:"projectConfigId"`
	SectionID        string  `json:"sectionId"`
	SectionVariantID string  `json:"sectionVariantId"`
	ParamInfoID      string  `json:"paramInfoId"`
	Value            string  `json:"value"`
}

type UpdateParamImplConfigRequest struct {
	FrontendOpID *string        `json:"frontendOpId,omitempty"`
	ProjectID    string         `json:"projectConfigId"`
	SectionID    string         `json:"sectionId"`
	ParamInfoID  string         `json:"paramInfoId"`
	NewConfig    map[string]any `json:"newConfig"`
}

type SetCodeSectionAttachedTerminalRequest struct {
	FrontendOpID      *string `json:"frontendOpId,omitempty"`
	ProjectID         string  `json:"projectConfigId"`
	SectionID         string  `json:"sectionId"`
	TerminalSectionID *string `json:"terminalSectionId"`
}

type SetCodeObjNameRequest struct {
	FrontendOpID *string `json:"frontendOpId,omitempty"`
	ProjectID    string  `json:"projectConfigId"`
	CodeObjID    string  `json:"codeObjId"`
	Name         string  `json:"name"`
}

type SetCodeObjDisplayNameRequest struct {
	FrontendOpID *string `json:"frontendOpId,omitempty"`
	ProjectID    string  `json:"projectConfigId"`
	CodeObjID    string  `json:"codeObjId"`
	DisplayName  string  `json:"displayName"`
}
