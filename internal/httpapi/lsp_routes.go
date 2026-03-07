package httpapi

import (
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"setta/internal/lspcompletion"
	"setta/internal/modes"
	"setta/internal/projectstate"
)

const (
	RouteClearTextFieldCompletion                = "/clearTextFieldCompletion"
	RouteTextFieldCompletion                     = "/textFieldCompletion"
	RouteOutputAccessorCompletion                = "/outputAccessorCompletion"
	RouteCodeAreaCompletion                      = "/codeAreaCompletion"
	RouteGenCodePrefixCompletion                 = "/genCodePrefixCompletion"
	RouteGenCodeSuffixCompletion                 = "/genCodeSuffixCompletion"
	RouteGetLatestLSPDiagnostics                 = "/getLatestLspDiagnostics"
	RouteSetCodeSectionDiagnosticsMute           = "/setCodeSectionDiagnosticsMute"
	RouteSetCodeSectionDiagnosticCodeSuppression = "/setCodeSectionDiagnosticCodeSuppression"
)

type LSPRouteDependencies struct {
	ModePolicy   modes.Policy
	ProjectState *projectstate.Runtime
	Diagnostics  *projectstate.LSPDiagnosticsRegistry
	Completions  *lspcompletion.Service
}

type GetLatestLSPDiagnosticsRequest struct {
	ProjectID string `json:"projectConfigId"`
}

type SetCodeSectionDiagnosticsMuteRequest struct {
	ProjectID string `json:"projectConfigId"`
	SectionID string `json:"sectionId"`
	Mute      bool   `json:"mute"`
}

type SetCodeSectionDiagnosticCodeSuppressionRequest struct {
	ProjectID string `json:"projectConfigId"`
	SectionID string `json:"sectionId"`
	Code      any    `json:"code"`
	Suppress  bool   `json:"suppress"`
}

type ClearTextFieldCompletionRequest struct {
	ProjectID   string  `json:"projectConfigId"`
	SectionID   string  `json:"sectionId"`
	ParamInfoID *string `json:"paramInfoId"`
}

type TextFieldCompletionRequest struct {
	ProjectID   string  `json:"projectConfigId"`
	SectionID   string  `json:"sectionId"`
	ParamInfoID *string `json:"paramInfoId"`
	FullText    string  `json:"fullText"`
	Position    int     `json:"position"`
}

type OutputAccessorCompletionRequest struct {
	ProjectID string `json:"projectConfigId"`
	SectionID string `json:"sectionId"`
	FullText  string `json:"fullText"`
	Position  int    `json:"position"`
}

type CodeAreaCompletionRequest struct {
	ProjectID string `json:"projectConfigId"`
	SectionID string `json:"sectionId"`
	FullText  string `json:"fullText"`
	Position  int    `json:"position"`
}

type GenCodePrefixCompletionRequest struct {
	ProjectID string `json:"projectConfigId"`
	FullText  string `json:"fullText"`
	Position  int    `json:"position"`
}

type GenCodeSuffixCompletionRequest struct {
	ProjectID string `json:"projectConfigId"`
	FullText  string `json:"fullText"`
	Position  int    `json:"position"`
}

func RegisterLSPRoutes(router chi.Router, deps LSPRouteDependencies) error {
	if router == nil {
		return fmt.Errorf("router is required")
	}
	if deps.ModePolicy.IsIDE() {
		if deps.ProjectState == nil {
			return fmt.Errorf("project runtime is required in ide mode")
		}
		if deps.Diagnostics == nil {
			return fmt.Errorf("lsp diagnostics registry is required in ide mode")
		}
		if deps.Completions == nil {
			return fmt.Errorf("lsp completion service is required in ide mode")
		}
	}

	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteClearTextFieldCompletion, clearTextFieldCompletionHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteTextFieldCompletion, textFieldCompletionHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteOutputAccessorCompletion, outputAccessorCompletionHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteCodeAreaCompletion, codeAreaCompletionHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteGenCodePrefixCompletion, genCodePrefixCompletionHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteGenCodeSuffixCompletion, genCodeSuffixCompletionHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteGetLatestLSPDiagnostics, getLatestLSPDiagnosticsHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetCodeSectionDiagnosticsMute, setCodeSectionDiagnosticsMuteHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteSetCodeSectionDiagnosticCodeSuppression, setCodeSectionDiagnosticCodeSuppressionHandler(deps))
	return nil
}

func clearTextFieldCompletionHandler(deps LSPRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[ClearTextFieldCompletionRequest](r)
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
		if deps.ProjectState == nil || deps.Completions == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if err := deps.Completions.ClearTextFieldCompletion(
			r.Context(),
			deps.ProjectState,
			projectID,
			sectionID,
			trimOptionalString(payload.ParamInfoID),
		); err != nil {
			writeLSPCompletionError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func textFieldCompletionHandler(deps LSPRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[TextFieldCompletionRequest](r)
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
		if deps.ProjectState == nil || deps.Completions == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		completions, err := deps.Completions.TextFieldCompletion(
			r.Context(),
			deps.ProjectState,
			projectID,
			sectionID,
			trimOptionalString(payload.ParamInfoID),
			payload.FullText,
			payload.Position,
		)
		if err != nil {
			writeLSPCompletionError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, completions)
	}
}

func outputAccessorCompletionHandler(deps LSPRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[OutputAccessorCompletionRequest](r)
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
		if deps.ProjectState == nil || deps.Completions == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		completions, err := deps.Completions.OutputAccessorCompletion(
			r.Context(),
			deps.ProjectState,
			projectID,
			sectionID,
			payload.FullText,
			payload.Position,
		)
		if err != nil {
			writeLSPCompletionError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, completions)
	}
}

func codeAreaCompletionHandler(deps LSPRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[CodeAreaCompletionRequest](r)
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
		if deps.ProjectState == nil || deps.Completions == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		completions, err := deps.Completions.CodeAreaCompletion(
			r.Context(),
			deps.ProjectState,
			projectID,
			sectionID,
			payload.FullText,
			payload.Position,
		)
		if err != nil {
			writeLSPCompletionError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, completions)
	}
}

func genCodePrefixCompletionHandler(deps LSPRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[GenCodePrefixCompletionRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		if deps.ProjectState == nil || deps.Completions == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		completions, err := deps.Completions.GenCodePrefixCompletion(
			r.Context(),
			deps.ProjectState,
			projectID,
			payload.FullText,
			payload.Position,
		)
		if err != nil {
			writeLSPCompletionError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, completions)
	}
}

func genCodeSuffixCompletionHandler(deps LSPRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[GenCodeSuffixCompletionRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		if deps.ProjectState == nil || deps.Completions == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		completions, err := deps.Completions.GenCodeSuffixCompletion(
			r.Context(),
			deps.ProjectState,
			projectID,
			payload.FullText,
			payload.Position,
		)
		if err != nil {
			writeLSPCompletionError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, completions)
	}
}

func getLatestLSPDiagnosticsHandler(deps LSPRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[GetLatestLSPDiagnosticsRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		if deps.ProjectState == nil || deps.Diagnostics == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		snapshot := deps.ProjectState.Snapshot()
		if _, err := snapshot.Document.ProjectByID(projectID); err != nil {
			writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
			return
		}

		writeJSON(w, http.StatusOK, deps.Diagnostics.Snapshot(projectID))
	}
}

func setCodeSectionDiagnosticsMuteHandler(deps LSPRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetCodeSectionDiagnosticsMuteRequest](r)
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
		if deps.ProjectState == nil || deps.Diagnostics == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		snapshot, err := deps.ProjectState.SetCodeSectionDiagnosticsMute(r.Context(), projectID, sectionID, payload.Mute)
		if err != nil {
			writeLSPDiagnosticsMutationError(w, r, err)
			return
		}
		project, err := snapshot.Document.ProjectByID(projectID)
		if err != nil {
			writeLSPDiagnosticsMutationError(w, r, err)
			return
		}
		if err := deps.Diagnostics.ReapplyCodeSectionIgnoreState(project, sectionID); err != nil {
			writeLSPDiagnosticsMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setCodeSectionDiagnosticCodeSuppressionHandler(deps LSPRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetCodeSectionDiagnosticCodeSuppressionRequest](r)
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
		if deps.ProjectState == nil || deps.Diagnostics == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		snapshot, err := deps.ProjectState.SetCodeSectionDiagnosticCodeSuppression(
			r.Context(),
			projectID,
			sectionID,
			payload.Code,
			payload.Suppress,
		)
		if err != nil {
			writeLSPDiagnosticsMutationError(w, r, err)
			return
		}
		project, err := snapshot.Document.ProjectByID(projectID)
		if err != nil {
			writeLSPDiagnosticsMutationError(w, r, err)
			return
		}
		if err := deps.Diagnostics.ReapplyCodeSectionIgnoreState(project, sectionID); err != nil {
			writeLSPDiagnosticsMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func trimOptionalString(value *string) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(*value)
}

func writeLSPCompletionError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrProjectNotFound),
		errors.Is(err, projectstate.ErrProjectIDRequired):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, projectstate.ErrSectionNotFound):
		writeError(w, r, http.StatusNotFound, "section_not_found", "Section not found.")
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func writeLSPDiagnosticsMutationError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrProjectNotFound),
		errors.Is(err, projectstate.ErrProjectIDRequired):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, projectstate.ErrSectionNotFound):
		writeError(w, r, http.StatusNotFound, "section_not_found", "Section not found.")
	case errors.Is(err, projectstate.ErrCodeSectionRequired),
		errors.Is(err, projectstate.ErrInvalidCodeSectionDiagnosticCode),
		errors.Is(err, projectstate.ErrInvalidCodeSectionDiagnosticsIgnoreState):
		writeError(w, r, http.StatusBadRequest, "invalid_lsp_diagnostics_request", "Invalid LSP diagnostics request.")
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}
