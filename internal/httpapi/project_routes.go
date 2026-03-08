package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"setta/internal/modes"
	"setta/internal/projectstate"
	"setta/internal/projectview"
	"setta/internal/settingsstate"
)

const (
	RouteGetLatestProjectState          = "/getLatestProjectState"
	RouteCreateViewMode                 = "/createViewMode"
	RouteSetActiveViewMode              = "/setActiveViewMode"
	RouteToggleIsEditingViewMode        = "/toggleIsEditingViewMode"
	RouteToggleSectionVisibility        = "/toggleSectionVisibility"
	RouteToggleViewModeUserFacing       = "/toggleViewModeUserFacing"
	RouteToggleViewModeTab              = "/toggleViewModeTab"
	RouteSetViewModeName                = "/setViewModeName"
	RouteSetViewModeSortOrder           = "/setViewModeSortOrder"
	RouteDeleteViewMode                 = "/deleteViewMode"
	RouteSetTopLevelSectionLayout       = "/setTopLevelSectionLayout"
	RouteAutoLayoutTopLevelSections     = "/autoLayoutTopLevelSections"
	RouteSetShowParamDisplayNames       = "/setShowParamDisplayNames"
	RouteSetSectionName                 = "/setSectionName"
	RouteAcceptRenameRefactor           = "/acceptRenameRefactor"
	RouteDeclineRenameRefactor          = "/declineRenameRefactor"
	RouteTogglePositionLocks            = "/togglePositionLocks"
	RouteToggleMinimized                = "/toggleMinimized"
	RouteSetCode                        = "/setCode"
	RouteFormatCode                     = "/formatCode"
	RouteSetActiveIDs                   = "/setActiveIds"
	RouteSetViewport                    = "/setViewport"
	RouteSetSectionTagColor             = "/setSectionTagColor"
	RouteSetSectionStyleColor           = "/setSectionStyleColor"
	RouteSetCallableHideParams          = "/setCallableHideParams"
	RouteSetSectionHideUnpinnedParams   = "/setSectionHideUnpinnedParams"
	RouteSetSectionPinnedParams         = "/setSectionPinnedParams"
	RouteSetCallable                    = "/setCallable"
	RouteSetProjectConfigCodegenTargets = "/setProjectConfigCodegenTargets"
	RouteSetWatchCodeEnabled            = "/setWatchCodeEnabled"
	RouteSetWatchCodeInputs             = "/setWatchCodeInputs"
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

type GetLatestProjectStateRequest struct {
	FrontendOpID *string `json:"frontendOpId"`
	ProjectID    string  `json:"projectConfigId"`
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
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteCreateViewMode, createViewModeHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetActiveViewMode, setActiveViewModeHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteToggleIsEditingViewMode, toggleIsEditingViewModeHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteToggleSectionVisibility, toggleSectionVisibilityHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteToggleViewModeUserFacing, toggleViewModeUserFacingHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteToggleViewModeTab, toggleViewModeTabHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetViewModeName, setViewModeNameHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetViewModeSortOrder, setViewModeSortOrderHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteDeleteViewMode, deleteViewModeHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetTopLevelSectionLayout, setTopLevelSectionLayoutHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteAutoLayoutTopLevelSections, autoLayoutTopLevelSectionsHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetShowParamDisplayNames, setShowParamDisplayNamesHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetSectionName, setSectionNameHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteAcceptRenameRefactor, acceptRenameRefactorHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteDeclineRenameRefactor, declineRenameRefactorHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteTogglePositionLocks, togglePositionLocksHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteToggleMinimized, toggleMinimizedHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetCode, setCodeHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteFormatCode, formatCodeHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetActiveIDs, setActiveIDsHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetViewport, setViewportHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetSectionTagColor, setSectionTagColorHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetSectionStyleColor, setSectionStyleColorHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetCallableHideParams, setCallableHideParamsHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetSectionHideUnpinnedParams, setSectionHideUnpinnedParamsHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetSectionPinnedParams, setSectionPinnedParamsHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetCallable, setCallableHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetProjectConfigCodegenTargets, setProjectConfigCodegenTargetsHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetWatchCodeEnabled, setWatchCodeEnabledHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetWatchCodeInputs, setWatchCodeInputsHandler(deps))
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
