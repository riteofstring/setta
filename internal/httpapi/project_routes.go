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
)

const (
	RouteGetLatestProjectState          = "/getLatestProjectState"
	RouteSetShowParamDisplayNames       = "/setShowParamDisplayNames"
	RouteTogglePositionLocks            = "/togglePositionLocks"
	RouteToggleMinimized                = "/toggleMinimized"
	RouteSetCode                        = "/setCode"
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
	CodegenTargetValidator         projectstate.CodegenTargetValidator
	PythonCodegenSectionReconciler projectstate.PythonCodegenSectionReconciler
	CallableSignatures             projectstate.CallableSignatureResolver
	CodeUpdates                    ProjectCodeUpdateService
}

type ProjectCodeUpdateService interface {
	SetCode(ctx context.Context, projectID string, sectionID string, code string) error
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

type SetShowParamDisplayNamesRequest struct {
	FrontendOpID          *string `json:"frontendOpId"`
	ProjectID             string  `json:"projectConfigId"`
	ShowParamDisplayNames bool    `json:"showParamDisplayNames"`
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
		if deps.CodeUpdates == nil {
			return fmt.Errorf("project code update service is required in ide mode")
		}
		if deps.CodegenTargetValidator == nil {
			return fmt.Errorf("project codegen target validator is required in ide mode")
		}
		if deps.PythonCodegenSectionReconciler == nil {
			return fmt.Errorf("project python generated-section reconciler is required in ide mode")
		}
	}

	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteGetLatestProjectState, getLatestProjectStateHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetShowParamDisplayNames, setShowParamDisplayNamesHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteTogglePositionLocks, togglePositionLocksHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteToggleMinimized, toggleMinimizedHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetCode, setCodeHandler(deps))
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

		projectStateView, err := projectview.SingleConfigByProjectID(deps.ProjectState.Snapshot().Document, projectID)
		if err != nil {
			writeProjectRouteStateError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, ProjectStateSingleConfigWithCompletedOpIDs{
			ProjectState:   projectStateView,
			CompletedOpIDs: []string{},
			PendingOpIDs:   []string{},
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

		if _, err := deps.ProjectState.SetShowParamDisplayNames(r.Context(), projectID, payload.ShowParamDisplayNames); err != nil {
			writeProjectLayoutMutationError(w, r, err)
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

		if _, err := deps.ProjectState.TogglePositionLocks(r.Context(), projectID, payload.SectionIDs); err != nil {
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

		if _, err := deps.ProjectState.ToggleMinimized(r.Context(), projectID, sectionID); err != nil {
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
			r.Context(),
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

		if _, err := deps.ProjectState.SetActiveIDs(r.Context(), projectID, payload.ActiveIDs); err != nil {
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

		if _, err := deps.ProjectState.SetViewport(r.Context(), projectID, payload.Viewport); err != nil {
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

		if err := deps.CodeUpdates.SetCode(r.Context(), projectID, sectionID, payload.Code); err != nil {
			writeSetCodeError(w, r, err)
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

		if _, err := deps.ProjectState.SetSectionTagColor(r.Context(), projectID, sectionID, payload.TagColor); err != nil {
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

		if _, err := deps.ProjectState.SetSectionStyleColor(r.Context(), projectID, sectionID, payload.StyleColor); err != nil {
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

		if _, err := deps.ProjectState.SetCallableHideParams(r.Context(), projectID, sectionID, payload.HideParams); err != nil {
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

		if _, err := deps.ProjectState.SetSectionHideUnpinnedParams(r.Context(), projectID, sectionID, payload.HideUnpinnedParams); err != nil {
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

		if _, err := deps.ProjectState.SetSectionPinnedParams(r.Context(), projectID, sectionID, payload.PinnedParams); err != nil {
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
			r.Context(),
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
			r.Context(),
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
			r.Context(),
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
