package httpapi

import (
	"bytes"
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

type SetCallableRequest struct {
	FrontendOpID  *string `json:"frontendOpId"`
	ProjectID     string  `json:"projectConfigId"`
	SectionID     string  `json:"sectionId"`
	CallableName  string  `json:"callableName"`
	RefetchParams bool    `json:"refetchParams"`
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
		if deps.CodegenTargetValidator == nil {
			return fmt.Errorf("project codegen target validator is required in ide mode")
		}
		if deps.PythonCodegenSectionReconciler == nil {
			return fmt.Errorf("project python generated-section reconciler is required in ide mode")
		}
	}

	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteGetLatestProjectState, getLatestProjectStateHandler(deps))
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
