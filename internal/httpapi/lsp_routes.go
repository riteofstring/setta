package httpapi

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"setta/internal/modes"
	"setta/internal/projectstate"
)

const RouteGetLatestLSPDiagnostics = "/getLatestLspDiagnostics"

type LSPRouteDependencies struct {
	ModePolicy   modes.Policy
	ProjectState *projectstate.Runtime
	Diagnostics  *projectstate.LSPDiagnosticsRegistry
}

type GetLatestLSPDiagnosticsRequest struct {
	ProjectID string `json:"projectConfigId"`
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
	}

	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteGetLatestLSPDiagnostics, getLatestLSPDiagnosticsHandler(deps))
	return nil
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
