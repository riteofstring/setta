package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"setta/internal/modes"
	"setta/internal/projectstate"
	"setta/internal/projectview"
	"setta/internal/settingsstate"

	"github.com/go-chi/chi/v5"
)

func projectRouteOperationID(routePath string) string {
	return strings.TrimPrefix(strings.TrimSpace(routePath), "/")
}

func registerProjectPost[Req, Resp any](
	router chi.Router,
	routePath string,
	handler http.HandlerFunc,
	options ...openAPIOperationOption,
) {
	operationOptions := make([]openAPIOperationOption, 0, len(options)+1)
	operationOptions = append(operationOptions, withOpenAPITags("Project"))
	operationOptions = append(operationOptions, options...)
	registerOpenAPIPost[Req, Resp](
		router,
		projectRouteOperationID(routePath),
		routePath,
		handler,
		operationOptions...,
	)
}

func registerProjectNullPost[Req any](
	router chi.Router,
	routePath string,
	handler http.HandlerFunc,
	options ...openAPIOperationOption,
) {
	registerProjectPost[Req, openAPIJSONNull](router, routePath, handler, options...)
}

type projectRouteDependencyCheck struct {
	ok      bool
	message string
}

func validateProjectRouteDependencies(router chi.Router, deps ProjectRouteDependencies) error {
	if router == nil {
		return fmt.Errorf("router is required")
	}
	if err := validateProjectIDERouteDependencies(router, deps); err != nil {
		return err
	}
	if err := validateProjectDeploymentRouteDependencies(deps); err != nil {
		return err
	}
	return nil
}

func validateProjectIDERouteDependencies(router chi.Router, deps ProjectRouteDependencies) error {
	if !deps.ModePolicy.IsIDE() || openAPIDocumentOnlyFromRouter(router) {
		return nil
	}
	return validateProjectRouteDependencyChecks([]projectRouteDependencyCheck{
		{
			ok:      strings.TrimSpace(deps.WorkspaceRoot) != "",
			message: "workspace root is required in ide mode",
		},
		{
			ok:      deps.ProjectState != nil,
			message: "project runtime is required in ide mode",
		},
		{
			ok:      deps.EdgeExpressionBuilder != nil,
			message: "edge expression builder is required in ide mode",
		},
		{
			ok:      deps.SettingsState != nil,
			message: "settings runtime is required in ide mode",
		},
		{
			ok:      deps.ChatSectionChatID != nil,
			message: "chat section chat id service is required in ide mode",
		},
		{
			ok:      hasProjectCodeUpdateServices(deps),
			message: "project code update service is required in ide mode",
		},
		{
			ok:      hasProjectRenameRefactorServices(deps),
			message: "project rename refactor service is required in ide mode",
		},
		{
			ok:      deps.PythonCodegenSectionReconciler != nil,
			message: "project python generated-section reconciler is required in ide mode",
		},
	})
}

func validateProjectDeploymentRouteDependencies(deps ProjectRouteDependencies) error {
	if !deps.ModePolicy.IsDeployment() {
		return nil
	}
	return validateProjectRouteDependencyChecks([]projectRouteDependencyCheck{
		{
			ok:      deps.ShareSessions != nil,
			message: "share session store is required in deployment mode",
		},
		{
			ok:      deps.Deployment != nil,
			message: "deployment runtime is required in deployment mode",
		},
	})
}

func validateProjectRouteDependencyChecks(checks []projectRouteDependencyCheck) error {
	for _, check := range checks {
		if !check.ok {
			return errors.New(check.message)
		}
	}
	return nil
}

func hasProjectCodeUpdateServices(deps ProjectRouteDependencies) bool {
	return deps.SetCode != nil && deps.FormatCode != nil
}

func hasProjectRenameRefactorServices(deps ProjectRouteDependencies) bool {
	return deps.SetSectionName != nil &&
		deps.AcceptRenameRefactor != nil &&
		deps.DeclineRenameRefactor != nil
}

func projectMutationContext(ctx context.Context, frontendOpID *string) context.Context {
	if frontendOpID == nil {
		return ctx
	}
	return projectstate.ContextWithFrontendOpID(ctx, *frontendOpID)
}

func ProjectMutationContext(ctx context.Context, frontendOpID *string) context.Context {
	return projectMutationContext(ctx, frontendOpID)
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
	if projectID, ok := projectIDFromRequestBody(r); ok {
		return settingsstate.ProjectRuntimeForID(
			deps.ProjectState,
			deps.SettingsProjectState,
			projectID,
		)
	}
	return deps.ProjectState, nil
}

func projectIDFromRequestBody(r *http.Request) (string, bool) {
	rawBody := rawJSONBodyFromRequest(r)
	if len(rawBody) == 0 {
		return "", false
	}
	var payload struct {
		ProjectID string `json:"projectConfigId"`
	}
	if err := json.Unmarshal(rawBody, &payload); err != nil {
		return "", false
	}
	projectID := strings.TrimSpace(payload.ProjectID)
	if projectID == "" {
		return "", false
	}
	return projectID, true
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

func ensureProjectParamValueMutationAllowed(
	w http.ResponseWriter,
	r *http.Request,
	deps ProjectRouteDependencies,
	runtime *projectstate.Runtime,
	projectID string,
	sectionID string,
	sectionVariantID string,
	paramInfoID string,
) bool {
	if !deps.ModePolicy.IsDeployment() {
		return true
	}

	project, err := runtime.Snapshot().Document.ProjectByID(projectID)
	if err != nil {
		writeParamValueMutationError(w, r, err)
		return false
	}
	payload, _, _, impl, err := project.ResolveSectionCodeObjectForVariant(
		sectionID,
		sectionVariantID,
		paramInfoID,
	)
	if err != nil {
		writeParamValueMutationError(w, r, err)
		return false
	}

	codeObjType := strings.TrimSpace(impl.Type)
	if payloadType, ok := payload["type"].(string); ok && strings.TrimSpace(payloadType) != "" {
		codeObjType = strings.TrimSpace(payloadType)
	}
	if codeObjType != "CodeParam" {
		return true
	}

	writeError(
		w,
		r,
		http.StatusForbidden,
		"code_param_edits_forbidden",
		"Deployment mode disallows CodeParam edits.",
	)
	return false
}

func ensureProjectVariantMutationsAllowed(
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
	if deps.Deployment.Policy().AllowVariantChanges {
		return true
	}
	writeError(
		w,
		r,
		http.StatusForbidden,
		"variant_changes_forbidden",
		"Deployment policy disallows variant changes.",
	)
	return false
}

func ensureProjectStructuralMutationsAllowed(
	w http.ResponseWriter,
	r *http.Request,
) bool {
	requestInfo, ok := modes.RequestInfoFromRequest(r)
	if !ok {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
		return false
	}
	if !requestInfo.Policy.IsDeployment() {
		return true
	}
	writeError(
		w,
		r,
		http.StatusForbidden,
		"structural_changes_forbidden",
		"Deployment mode disallows structural changes.",
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
	if err := validateProjectRouteDependencies(router, deps); err != nil {
		return err
	}

	ideRouter := router.With(RequireIDEMode(deps.ModePolicy))
	if deps.ModePolicy.IsDeployment() {
		ideRouter = routerWithoutOpenAPI(ideRouter)
	}
	registerProjectPost[GetLatestProjectStateRequest, ProjectStateSingleConfigWithCompletedOpIDs](
		ideRouter,
		RouteGetLatestProjectState,
		getLatestProjectStateHandler(deps),
		withOpenAPIAppSubsystemFrontendSDK(),
	)
	registerProjectPost[UndoRequest, ProjectStateSingleConfigWithCompletedOpIDs](ideRouter, RouteUndo, undoHandler(deps))
	registerProjectPost[RedoRequest, ProjectStateSingleConfigWithCompletedOpIDs](ideRouter, RouteRedo, redoHandler(deps))
	registerProjectPost[GetPasswordParamValueRequest, GetPasswordParamValueResponse](
		ideRouter,
		RouteGetPasswordParamValue,
		getPasswordParamValueHandler(deps),
		withOpenAPIAppSubsystemFrontendSDK(),
	)
	registerProjectPost[CreateNewSectionVariantRequest, CreateNewSectionVariantResponse](ideRouter, RouteCreateNewSectionVariant, createNewSectionVariantHandler(deps))
	registerProjectNullPost[SetSectionVariantRequest](ideRouter, RouteSetSectionVariant, setSectionVariantHandler(deps))
	registerProjectNullPost[SetDefaultSectionVariantRequest](ideRouter, RouteSetDefaultSectionVariant, setDefaultSectionVariantHandler(deps))
	registerProjectNullPost[SetSectionVariantSortOrderRequest](ideRouter, RouteSetSectionVariantSortOrder, setSectionVariantSortOrderHandler(deps))
	registerProjectNullPost[ToggleVariantFrozenRequest](ideRouter, RouteToggleVariantFrozen, toggleVariantFrozenHandler(deps))
	registerProjectNullPost[ToggleVariantJSONSourceRequest](ideRouter, RouteToggleVariantJSONSource, toggleVariantJSONSourceHandler(deps))
	registerProjectNullPost[SetVariantJSONSourceKeysRequest](ideRouter, RouteSetVariantJSONSourceKeys, setVariantJSONSourceKeysHandler(deps))
	registerProjectNullPost[SetSectionVariantNameRequest](ideRouter, RouteSetSectionVariantName, setSectionVariantNameHandler(deps))
	registerProjectPost[DeleteSectionVariantOrAskRequest, *string](ideRouter, RouteDeleteSectionVariantOrAsk, deleteSectionVariantOrAskHandler(deps))
	registerProjectNullPost[DeleteJSONSourceFileAndVariantRequest](ideRouter, RouteDeleteJSONSourceFileAndVariant, deleteJSONSourceFileAndVariantHandler(deps))
	registerProjectPost[CreateChildSectionsRequest, projectstate.CreateChildSectionsResult](ideRouter, RouteCreateChildSections, createChildSectionsHandler(deps))
	registerProjectPost[CreateChildSectionsViaIncrementerRequest, projectstate.CreateChildSectionsResult](ideRouter, RouteCreateChildSectionsViaIncrementer, createChildSectionsViaIncrementerHandler(deps))
	registerProjectPost[DeleteChildSectionsViaDecrementerRequest, projectstate.DeleteSectionsResult](ideRouter, RouteDeleteChildSectionsViaDecrementer, deleteChildSectionsViaDecrementerHandler(deps))
	registerProjectNullPost[DeleteSectionsRequest](ideRouter, RouteDeleteSections, deleteSectionsHandler(deps))
	registerProjectNullPost[DeleteSelectedParamsRequest](ideRouter, RouteDeleteSelectedParams, deleteSelectedParamsHandler(deps))
	registerProjectPost[PrepareSectionsForCopyRequest, projectstate.SectionsClipboardData](ideRouter, RoutePrepareSectionsForCopy, prepareSectionsForCopyHandler(deps))
	registerProjectNullPost[PasteSectionsRequest](ideRouter, RoutePasteSections, pasteSectionsHandler(deps))
	registerProjectNullPost[CreateEdgeRequest](ideRouter, RouteCreateEdge, createEdgeHandler(deps))
	registerProjectNullPost[UpdateEdgeRequest](ideRouter, RouteUpdateEdge, updateEdgeHandler(deps))
	registerProjectNullPost[DeleteEdgesRequest](ideRouter, RouteDeleteEdges, deleteEdgesHandler(deps))
	registerProjectNullPost[ReconnectEdgeRequest](ideRouter, RouteReconnectEdge, reconnectEdgeHandler(deps))
	registerProjectNullPost[SetEdgesRequest](ideRouter, RouteSetEdges, setEdgesHandler(deps))
	registerProjectNullPost[CreateStateMachineEdgeRequest](ideRouter, RouteCreateStateMachineEdge, createStateMachineEdgeHandler(deps))
	registerProjectNullPost[UpdateStateMachineEdgeRequest](ideRouter, RouteUpdateStateMachineEdge, updateStateMachineEdgeHandler(deps))
	registerProjectNullPost[DeleteStateMachineEdgesRequest](ideRouter, RouteDeleteStateMachineEdges, deleteStateMachineEdgesHandler(deps))
	registerProjectNullPost[SetStateMachineEdgesRequest](ideRouter, RouteSetStateMachineEdges, setStateMachineEdgesHandler(deps))
	registerProjectNullPost[CreateAgenticEdgeRequest](ideRouter, RouteCreateAgenticEdge, createAgenticEdgeHandler(deps))
	registerProjectNullPost[UpdateAgenticEdgeRequest](ideRouter, RouteUpdateAgenticEdge, updateAgenticEdgeHandler(deps))
	registerProjectNullPost[DeleteAgenticEdgesRequest](ideRouter, RouteDeleteAgenticEdges, deleteAgenticEdgesHandler(deps))
	registerProjectNullPost[SetAgenticEdgesRequest](ideRouter, RouteSetAgenticEdges, setAgenticEdgesHandler(deps))
	registerProjectNullPost[MoveSectionsRequest](ideRouter, RouteMoveSections, moveSectionsHandler(deps))
	registerProjectNullPost[MoveParamsRequest](ideRouter, RouteMoveParams, moveParamsHandler(deps))
	registerProjectNullPost[MoveParamGroupsRequest](ideRouter, RouteMoveParamGroups, moveParamGroupsHandler(deps))
	registerProjectNullPost[IndentParamsRequest](ideRouter, RouteIndentParams, indentParamsHandler(deps))
	registerProjectNullPost[UnindentParamsRequest](ideRouter, RouteUnindentParams, unindentParamsHandler(deps))
	registerProjectNullPost[AddKwargRequest](ideRouter, RouteAddKwarg, addKwargHandler(deps))
	registerProjectNullPost[DeleteKwargRequest](ideRouter, RouteDeleteKwarg, deleteKwargHandler(deps))
	registerProjectPost[CreateTopLevelSectionRequest, projectstate.CreateTopLevelSectionResult](ideRouter, RouteCreateTopLevelSection, createTopLevelSectionHandler(deps))
	registerProjectPost[CreateViewModeRequest, string](ideRouter, RouteCreateViewMode, createViewModeHandler(deps))
	registerProjectNullPost[SetActiveViewModeRequest](ideRouter, RouteSetActiveViewMode, setActiveViewModeHandler(deps))
	registerProjectNullPost[ToggleIsEditingViewModeRequest](ideRouter, RouteToggleIsEditingViewMode, toggleIsEditingViewModeHandler(deps))
	registerProjectNullPost[ToggleSectionVisibilityRequest](ideRouter, RouteToggleSectionVisibility, toggleSectionVisibilityHandler(deps))
	registerProjectNullPost[GroupSectionsRequest](ideRouter, RouteGroupSections, groupSectionsHandler(deps))
	registerProjectNullPost[UngroupGroupsRequest](ideRouter, RouteUngroupGroups, ungroupGroupsHandler(deps))
	registerProjectNullPost[ToggleViewModeUserFacingRequest](ideRouter, RouteToggleViewModeUserFacing, toggleViewModeUserFacingHandler(deps))
	registerProjectNullPost[ToggleViewModeTabRequest](ideRouter, RouteToggleViewModeTab, toggleViewModeTabHandler(deps))
	registerProjectNullPost[SetViewModeNameRequest](ideRouter, RouteSetViewModeName, setViewModeNameHandler(deps))
	registerProjectPost[SetViewModeSortOrderRequest, ProjectConfigMutationResponse](ideRouter, RouteSetViewModeSortOrder, setViewModeSortOrderHandler(deps))
	registerProjectPost[DeleteViewModeRequest, ProjectConfigMutationResponse](ideRouter, RouteDeleteViewMode, deleteViewModeHandler(deps))
	registerProjectNullPost[SetTopLevelSectionLayoutRequest](ideRouter, RouteSetTopLevelSectionLayout, setTopLevelSectionLayoutHandler(deps))
	registerProjectNullPost[AutoLayoutTopLevelSectionsRequest](ideRouter, RouteAutoLayoutTopLevelSections, autoLayoutTopLevelSectionsHandler(deps))
	registerProjectNullPost[SetSectionSizesRequest](ideRouter, RouteSetSectionSizes, setSectionSizesHandler(deps))
	registerProjectNullPost[SetShowParamDisplayNamesRequest](ideRouter, RouteSetShowParamDisplayNames, setShowParamDisplayNamesHandler(deps))
	registerProjectNullPost[SetSectionNameRequest](ideRouter, RouteSetSectionName, setSectionNameHandler(deps))
	registerProjectNullPost[AcceptRenameRefactorRequest](ideRouter, RouteAcceptRenameRefactor, acceptRenameRefactorHandler(deps))
	registerProjectNullPost[DeclineRenameRefactorRequest](ideRouter, RouteDeclineRenameRefactor, declineRenameRefactorHandler(deps))
	registerProjectNullPost[TogglePositionLocksRequest](ideRouter, RouteTogglePositionLocks, togglePositionLocksHandler(deps))
	registerProjectNullPost[ToggleMinimizedRequest](ideRouter, RouteToggleMinimized, toggleMinimizedHandler(deps))
	registerProjectNullPost[SetCodeRequest](ideRouter, RouteSetCode, setCodeHandler(deps))
	registerProjectNullPost[SetCodeSectionAttachedTerminalRequest](ideRouter, RouteSetCodeSectionAttachedTerminal, setCodeSectionAttachedTerminalHandler(deps))
	registerProjectNullPost[SetCodeFileBindingRequest](ideRouter, RouteSetCodeFileBinding, setCodeFileBindingHandler(deps))
	registerProjectNullPost[FormatCodeRequest](ideRouter, RouteFormatCode, formatCodeHandler(deps))
	registerProjectNullPost[SetActiveIDsRequest](ideRouter, RouteSetActiveIDs, setActiveIDsHandler(deps))
	registerProjectNullPost[SetViewportRequest](ideRouter, RouteSetViewport, setViewportHandler(deps))
	registerProjectNullPost[SetSectionTagColorRequest](ideRouter, RouteSetSectionTagColor, setSectionTagColorHandler(deps))
	registerProjectNullPost[SetSectionStyleColorRequest](ideRouter, RouteSetSectionStyleColor, setSectionStyleColorHandler(deps))
	registerProjectNullPost[SetSectionParamFilterRequest](ideRouter, RouteSetSectionParamFilter, setSectionParamFilterHandler(deps))
	registerProjectNullPost[SetMetaControlShowSectionTitleRequest](ideRouter, RouteSetMetaControlShowSectionTitle, setMetaControlShowSectionTitleHandler(deps))
	registerProjectNullPost[SetSectionColumnWidthRequest](ideRouter, RouteSetSectionColumnWidth, setSectionColumnWidthHandler(deps))
	registerProjectNullPost[SetSectionEdgeInputsRequest](ideRouter, RouteSetSectionEdgeInputs, setSectionEdgeInputsHandler(deps))
	registerProjectNullPost[SetSectionEdgeOutputsRequest](ideRouter, RouteSetSectionEdgeOutputs, setSectionEdgeOutputsHandler(deps))
	registerProjectNullPost[SetParentDefaultChildSectionTypeRequest](ideRouter, RouteSetParentDefaultChildSectionType, setParentDefaultChildSectionTypeHandler(deps))
	registerProjectNullPost[SetListRootViewModeRequest](ideRouter, RouteSetListRootViewMode, setListRootViewModeHandler(deps))
	registerProjectNullPost[ToggleGroupOrientationRequest](ideRouter, RouteToggleGroupOrientation, toggleGroupOrientationHandler(deps))
	registerProjectNullPost[SetGroupOverflowModeRequest](ideRouter, RouteSetGroupOverflowMode, setGroupOverflowModeHandler(deps))
	registerProjectNullPost[SetCallableHideParamsRequest](ideRouter, RouteSetCallableHideParams, setCallableHideParamsHandler(deps))
	registerProjectNullPost[SetSectionHideUnpinnedParamsRequest](ideRouter, RouteSetSectionHideUnpinnedParams, setSectionHideUnpinnedParamsHandler(deps))
	registerProjectNullPost[SetSectionPinnedParamsRequest](ideRouter, RouteSetSectionPinnedParams, setSectionPinnedParamsHandler(deps))
	registerProjectNullPost[SetBrowserColumnWidthsRequest](ideRouter, RouteSetBrowserColumnWidths, setBrowserColumnWidthsHandler(deps))
	registerProjectNullPost[SetBrowserAreaViewModeRequest](ideRouter, RouteSetBrowserAreaViewMode, setBrowserAreaViewModeHandler(deps))
	registerProjectNullPost[SetBrowserHideColumnRequest](ideRouter, RouteSetBrowserHideColumn, setBrowserHideColumnHandler(deps))
	registerProjectNullPost[SetBrowserSavedSearchesRequest](ideRouter, RouteSetBrowserSavedSearches, setBrowserSavedSearchesHandler(deps))
	registerProjectNullPost[SetSpreadsheetFilePathRequest](ideRouter, RouteSetSpreadsheetFilePath, setSpreadsheetFilePathHandler(deps))
	registerProjectNullPost[SetSpreadsheetSectionSettingsRequest](ideRouter, RouteSetSpreadsheetSectionSettings, setSpreadsheetSectionSettingsHandler(deps))
	registerProjectNullPost[SetTaskBoardSectionStateRequest](ideRouter, RouteSetTaskBoardSectionState, setTaskBoardSectionStateHandler(deps))
	registerProjectNullPost[SetImageAreaImagePathRequest](ideRouter, RouteSetImageAreaImagePath, setImageAreaImagePathHandler(deps))
	registerProjectNullPost[SetSocialURLRequest](ideRouter, RouteSetSocialURL, setSocialURLHandler(deps))
	registerProjectNullPost[AppendDrawAreaLayerItemRequest](ideRouter, RouteAppendDrawAreaLayerItem, appendDrawAreaLayerItemHandler(deps))
	registerProjectNullPost[SetChartAreaDataPathRequest](ideRouter, RouteSetChartAreaDataPath, setChartAreaDataPathHandler(deps))
	registerProjectNullPost[SetChartTypeRequest](ideRouter, RouteSetChartType, setChartTypeHandler(deps))
	registerProjectNullPost[SetChartSettingsRequest](ideRouter, RouteSetChartSettings, setChartSettingsHandler(deps))
	registerProjectNullPost[SetTextBlockTextRequest](ideRouter, RouteSetTextBlockText, setTextBlockTextHandler(deps))
	registerProjectNullPost[SetTextBlockDisplayModeRequest](ideRouter, RouteSetTextBlockDisplayMode, setTextBlockDisplayModeHandler(deps))
	registerProjectNullPost[SetTextBlockFormatRequest](ideRouter, RouteSetTextBlockFormat, setTextBlockFormatHandler(deps))
	registerProjectNullPost[SetTextBlockHeadingAsSectionNameRequest](ideRouter, RouteSetTextBlockHeadingAsSectionName, setTextBlockHeadingAsSectionNameHandler(deps))
	registerProjectNullPost[SetTextBlockMetaControlStyleRequest](ideRouter, RouteSetTextBlockMetaControlStyle, setTextBlockMetaControlStyleHandler(deps))
	registerProjectNullPost[SetTextBlockMasterFontSizeRequest](ideRouter, RouteSetTextBlockMasterFontSize, setTextBlockMasterFontSizeHandler(deps))
	registerProjectNullPost[ToggleParamSelectedRequest](ideRouter, RouteToggleParamSelected, toggleParamSelectedHandler(deps))
	registerProjectNullPost[UnselectAllParamsRequest](ideRouter, RouteUnselectAllParams, unselectAllParamsHandler(deps))
	registerProjectNullPost[SetChatSectionSettingsRequest](ideRouter, RouteSetChatSectionSettings, setChatSectionSettingsHandler(deps))
	registerProjectNullPost[SetStateMachineSectionSettingsRequest](ideRouter, RouteSetStateMachineSectionSettings, setStateMachineSectionSettingsHandler(deps))
	registerProjectNullPost[SetChatSectionStateRequest](ideRouter, RouteSetChatSectionState, setChatSectionStateHandler(deps))
	registerProjectPost[GetChatSectionChatIDRequest, string](ideRouter, RouteGetChatSectionChatID, getChatSectionChatIDHandler(deps))
	registerProjectNullPost[SetChatSectionChatIDRequest](ideRouter, RouteSetChatSectionChatID, setChatSectionChatIDHandler(deps))
	registerProjectPost[SetCallableRequest, projectstate.SetCallableResponse](ideRouter, RouteSetCallable, setCallableHandler(deps))
	registerProjectPost[SetProjectConfigCodegenTargetsRequest, projectview.SingleConfig](ideRouter, RouteSetProjectConfigCodegenTargets, setProjectConfigCodegenTargetsHandler(deps))
	registerProjectNullPost[SetGenCodePrefixRequest](ideRouter, RouteSetGenCodePrefix, setGenCodePrefixHandler(deps))
	registerProjectNullPost[SetGenCodeSuffixRequest](ideRouter, RouteSetGenCodeSuffix, setGenCodeSuffixHandler(deps))
	registerProjectNullPost[SetTypeErrorIgnoreRequest](ideRouter, RouteSetTypeErrorIgnore, setTypeErrorIgnoreHandler(deps))
	registerProjectNullPost[ChangeParamImplRequest](ideRouter, RouteChangeParamImpl, changeParamImplHandler(deps))
	registerProjectNullPost[SetParamEnteredValueRequest](
		ideRouter,
		RouteSetParamEnteredValue,
		setParamEnteredValueHandler(deps),
		withOpenAPIAppSubsystemFrontendSDK(),
	)
	registerProjectNullPost[UpdateParamImplConfigRequest](ideRouter, RouteUpdateParamImplConfig, updateParamImplConfigHandler(deps))
	registerProjectNullPost[SetCodeObjNameRequest](ideRouter, RouteSetCodeObjName, setCodeObjNameHandler(deps))
	registerProjectNullPost[SetCodeObjDisplayNameRequest](ideRouter, RouteSetCodeObjDisplayName, setCodeObjDisplayNameHandler(deps))
	if deps.ModePolicy.IsDeployment() {
		shareGuard := RequireShareSession(modes.Resolver{
			Policy: deps.ModePolicy,
			Store:  deps.ShareSessions,
		})
		shareRouter := router.With(shareGuard)
		registerProjectNullPost[SetTopLevelSectionLayoutRequest](shareRouter, RouteSetTopLevelSectionLayout, setTopLevelSectionLayoutHandler(deps))
		registerProjectNullPost[AutoLayoutTopLevelSectionsRequest](shareRouter, RouteAutoLayoutTopLevelSections, autoLayoutTopLevelSectionsHandler(deps))
		registerProjectNullPost[SetSectionSizesRequest](shareRouter, RouteSetSectionSizes, setSectionSizesHandler(deps))
		registerProjectPost[CreateNewSectionVariantRequest, CreateNewSectionVariantResponse](shareRouter, RouteCreateNewSectionVariant, createNewSectionVariantHandler(deps))
		registerProjectNullPost[SetSectionVariantRequest](shareRouter, RouteSetSectionVariant, setSectionVariantHandler(deps))
		registerProjectNullPost[SetDefaultSectionVariantRequest](shareRouter, RouteSetDefaultSectionVariant, setDefaultSectionVariantHandler(deps))
		registerProjectNullPost[SetSectionVariantSortOrderRequest](shareRouter, RouteSetSectionVariantSortOrder, setSectionVariantSortOrderHandler(deps))
		registerProjectNullPost[ToggleVariantFrozenRequest](shareRouter, RouteToggleVariantFrozen, toggleVariantFrozenHandler(deps))
		registerProjectNullPost[ToggleVariantJSONSourceRequest](shareRouter, RouteToggleVariantJSONSource, toggleVariantJSONSourceHandler(deps))
		registerProjectNullPost[SetVariantJSONSourceKeysRequest](shareRouter, RouteSetVariantJSONSourceKeys, setVariantJSONSourceKeysHandler(deps))
		registerProjectNullPost[SetSectionVariantNameRequest](shareRouter, RouteSetSectionVariantName, setSectionVariantNameHandler(deps))
		registerProjectPost[PrepareSectionsForCopyRequest, projectstate.SectionsClipboardData](shareRouter, RoutePrepareSectionsForCopy, prepareSectionsForCopyHandler(deps))
		registerProjectNullPost[TogglePositionLocksRequest](shareRouter, RouteTogglePositionLocks, togglePositionLocksHandler(deps))
		registerProjectNullPost[ToggleMinimizedRequest](shareRouter, RouteToggleMinimized, toggleMinimizedHandler(deps))
		registerProjectNullPost[SetViewportRequest](shareRouter, RouteSetViewport, setViewportHandler(deps))
		registerProjectNullPost[SetTextBlockTextRequest](shareRouter, RouteSetTextBlockText, setTextBlockTextHandler(deps))
		registerProjectNullPost[SetTextBlockDisplayModeRequest](shareRouter, RouteSetTextBlockDisplayMode, setTextBlockDisplayModeHandler(deps))
		registerProjectNullPost[SetTextBlockFormatRequest](shareRouter, RouteSetTextBlockFormat, setTextBlockFormatHandler(deps))
		registerProjectNullPost[SetTextBlockMasterFontSizeRequest](shareRouter, RouteSetTextBlockMasterFontSize, setTextBlockMasterFontSizeHandler(deps))
		registerProjectNullPost[SetBrowserColumnWidthsRequest](shareRouter, RouteSetBrowserColumnWidths, setBrowserColumnWidthsHandler(deps))
		registerProjectNullPost[SetBrowserAreaViewModeRequest](shareRouter, RouteSetBrowserAreaViewMode, setBrowserAreaViewModeHandler(deps))
		registerProjectNullPost[SetBrowserHideColumnRequest](shareRouter, RouteSetBrowserHideColumn, setBrowserHideColumnHandler(deps))
		registerProjectNullPost[SetBrowserSavedSearchesRequest](shareRouter, RouteSetBrowserSavedSearches, setBrowserSavedSearchesHandler(deps))
		registerProjectNullPost[SetSpreadsheetFilePathRequest](shareRouter, RouteSetSpreadsheetFilePath, setSpreadsheetFilePathHandler(deps))
		registerProjectNullPost[SetSpreadsheetSectionSettingsRequest](shareRouter, RouteSetSpreadsheetSectionSettings, setSpreadsheetSectionSettingsHandler(deps))
		registerProjectNullPost[SetTaskBoardSectionStateRequest](shareRouter, RouteSetTaskBoardSectionState, setTaskBoardSectionStateHandler(deps))
		registerProjectNullPost[SetChatSectionSettingsRequest](shareRouter, RouteSetChatSectionSettings, setChatSectionSettingsHandler(deps))
		registerProjectNullPost[SetChatSectionStateRequest](shareRouter, RouteSetChatSectionState, setChatSectionStateHandler(deps))
		registerProjectNullPost[SetChatSectionChatIDRequest](shareRouter, RouteSetChatSectionChatID, setChatSectionChatIDHandler(deps))
		registerProjectNullPost[SetParamEnteredValueRequest](
			shareRouter,
			RouteSetParamEnteredValue,
			setParamEnteredValueHandler(deps),
			withOpenAPIAppSubsystemFrontendSDK(),
		)
		registerProjectNullPost[SetTypeErrorIgnoreRequest](shareRouter, RouteSetTypeErrorIgnore, setTypeErrorIgnoreHandler(deps))
		registerProjectNullPost[SetShowParamDisplayNamesRequest](shareRouter, RouteSetShowParamDisplayNames, setShowParamDisplayNamesHandler(deps))
		registerProjectNullPost[SetSectionTagColorRequest](shareRouter, RouteSetSectionTagColor, setSectionTagColorHandler(deps))
		registerProjectNullPost[SetSectionStyleColorRequest](shareRouter, RouteSetSectionStyleColor, setSectionStyleColorHandler(deps))
		registerProjectNullPost[SetSectionParamFilterRequest](shareRouter, RouteSetSectionParamFilter, setSectionParamFilterHandler(deps))
		registerProjectNullPost[SetSectionColumnWidthRequest](shareRouter, RouteSetSectionColumnWidth, setSectionColumnWidthHandler(deps))
		registerProjectNullPost[SetCallableHideParamsRequest](shareRouter, RouteSetCallableHideParams, setCallableHideParamsHandler(deps))
		registerProjectNullPost[SetSectionHideUnpinnedParamsRequest](shareRouter, RouteSetSectionHideUnpinnedParams, setSectionHideUnpinnedParamsHandler(deps))
		registerProjectNullPost[SetSectionPinnedParamsRequest](shareRouter, RouteSetSectionPinnedParams, setSectionPinnedParamsHandler(deps))
		registerProjectNullPost[ToggleParamSelectedRequest](shareRouter, RouteToggleParamSelected, toggleParamSelectedHandler(deps))
		registerProjectNullPost[UnselectAllParamsRequest](shareRouter, RouteUnselectAllParams, unselectAllParamsHandler(deps))
		registerProjectPost[CreateChildSectionsRequest, projectstate.CreateChildSectionsResult](shareRouter, RouteCreateChildSections, createChildSectionsHandler(deps))
		registerProjectNullPost[DeleteSectionsRequest](shareRouter, RouteDeleteSections, deleteSectionsHandler(deps))
		registerProjectNullPost[MoveSectionsRequest](shareRouter, RouteMoveSections, moveSectionsHandler(deps))
		registerProjectNullPost[SetCodeSectionAttachedTerminalRequest](shareRouter, RouteSetCodeSectionAttachedTerminal, setCodeSectionAttachedTerminalHandler(deps))
		registerProjectNullPost[SetActiveViewModeRequest](shareRouter, RouteSetActiveViewMode, setActiveViewModeHandler(deps))
		registerProjectPost[UndoRequest, ProjectStateSingleConfigWithCompletedOpIDs](shareRouter, RouteUndo, undoHandler(deps))
		registerProjectPost[RedoRequest, ProjectStateSingleConfigWithCompletedOpIDs](shareRouter, RouteRedo, redoHandler(deps))
		registerProjectNullPost[SetPromptTemplateRequest](shareRouter, RouteSetPromptTemplate, setPromptTemplateHandler(deps))
		registerProjectNullPost[SetPromptTemplateLinkRequest](shareRouter, RouteSetPromptTemplateLink, setPromptTemplateLinkHandler(deps))
		registerProjectNullPost[SetPromptInputsRequest](shareRouter, RouteSetPromptInputs, setPromptInputsHandler(deps))
		registerProjectNullPost[SetPromptFormatRequest](shareRouter, RouteSetPromptFormat, setPromptFormatHandler(deps))
		registerProjectPost[CreateWindowSpaceRequest, WindowSpaceMutationResponse](shareRouter, RouteCreateWindowSpace, createWindowSpaceHandler(deps))
		registerProjectPost[SetWindowSpaceNameRequest, ProjectConfigMutationResponse](shareRouter, RouteSetWindowSpaceName, setWindowSpaceNameHandler(deps))
		registerProjectPost[SetWindowSpaceSortOrderRequest, ProjectConfigMutationResponse](shareRouter, RouteSetWindowSpaceSortOrder, setWindowSpaceSortOrderHandler(deps))
		registerProjectPost[DeleteWindowSpaceRequest, ProjectConfigMutationResponse](shareRouter, RouteDeleteWindowSpace, deleteWindowSpaceHandler(deps))
		registerProjectPost[SetProjectChatWindowingStateRequest, projectstate.ProjectChatWindowingState](shareRouter, RouteSetProjectChatWindowingState, setProjectChatWindowingStateHandler(deps))
		registerProjectPost[SetProjectChatWindowChatIDRequest, projectstate.ProjectChatWindowingState](shareRouter, RouteSetProjectChatWindowChatID, setProjectChatWindowChatIDHandler(deps))
		return nil
	}
	registerProjectNullPost[SetPromptTemplateRequest](ideRouter, RouteSetPromptTemplate, setPromptTemplateHandler(deps))
	registerProjectNullPost[SetPromptTemplateLinkRequest](ideRouter, RouteSetPromptTemplateLink, setPromptTemplateLinkHandler(deps))
	registerProjectNullPost[SetPromptInputsRequest](ideRouter, RouteSetPromptInputs, setPromptInputsHandler(deps))
	registerProjectNullPost[SetPromptFormatRequest](ideRouter, RouteSetPromptFormat, setPromptFormatHandler(deps))
	registerProjectPost[CreateWindowSpaceRequest, WindowSpaceMutationResponse](ideRouter, RouteCreateWindowSpace, createWindowSpaceHandler(deps))
	registerProjectPost[SetWindowSpaceNameRequest, ProjectConfigMutationResponse](ideRouter, RouteSetWindowSpaceName, setWindowSpaceNameHandler(deps))
	registerProjectPost[SetWindowSpaceSortOrderRequest, ProjectConfigMutationResponse](ideRouter, RouteSetWindowSpaceSortOrder, setWindowSpaceSortOrderHandler(deps))
	registerProjectPost[DeleteWindowSpaceRequest, ProjectConfigMutationResponse](ideRouter, RouteDeleteWindowSpace, deleteWindowSpaceHandler(deps))
	registerProjectPost[SetProjectChatWindowingStateRequest, projectstate.ProjectChatWindowingState](ideRouter, RouteSetProjectChatWindowingState, setProjectChatWindowingStateHandler(deps))
	registerProjectPost[SetProjectChatWindowChatIDRequest, projectstate.ProjectChatWindowingState](ideRouter, RouteSetProjectChatWindowChatID, setProjectChatWindowChatIDHandler(deps))
	return nil
}
