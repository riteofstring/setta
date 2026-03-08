package httpapi

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"setta/internal/modes"
	"setta/internal/projectshell"
	"setta/internal/projectstate"
	"setta/internal/projectview"
)

const (
	RouteLoadAllProjectMetadata = "/loadAllProjectMetadata"
	RouteLoadProjectConfig      = "/loadProjectConfig"
)

type ProjectShellRouteDependencies struct {
	ModePolicy modes.Policy
	Shell      ProjectShellService
}

type ProjectShellService interface {
	LoadAllProjectMetadata(ctx context.Context) (projectshell.AllProjectMetadata, error)
	LoadProjectConfig(ctx context.Context, projectConfigName string) (projectview.SingleConfig, error)
}

type ProjectLoadRequest struct {
	ProjectConfigName string `json:"projectConfigName"`
}

func RegisterProjectShellRoutes(router chi.Router, deps ProjectShellRouteDependencies) error {
	if router == nil {
		return fmt.Errorf("router is required")
	}
	if deps.ModePolicy.IsIDE() && deps.Shell == nil {
		return fmt.Errorf("project shell service is required in ide mode")
	}

	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteLoadAllProjectMetadata, loadAllProjectMetadataHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteLoadProjectConfig, loadProjectConfigHandler(deps))
	return nil
}

func loadAllProjectMetadataHandler(deps ProjectShellRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if _, err := decodeJSONBody[struct{}](r); err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		if deps.Shell == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		metadata, err := deps.Shell.LoadAllProjectMetadata(r.Context())
		if err != nil {
			writeProjectShellRouteError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, metadata)
	}
}

func loadProjectConfigHandler(deps ProjectShellRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[ProjectLoadRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}
		if deps.Shell == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		projectStateView, err := deps.Shell.LoadProjectConfig(r.Context(), strings.TrimSpace(payload.ProjectConfigName))
		if err != nil {
			writeProjectShellRouteError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, projectStateView)
	}
}

func writeProjectShellRouteError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrProjectLookupNameRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_name_required", "Project config name is required.")
	case errors.Is(err, projectstate.ErrProjectNameAmbiguous):
		writeError(w, r, http.StatusConflict, "project_config_name_ambiguous", "Project config name resolves to multiple projects.")
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}
