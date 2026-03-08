package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"setta/internal/deployments"
	"setta/internal/modes"
	"setta/internal/projectstate"
	"setta/internal/projectview"
	"setta/internal/realtime"
)

const RouteForceRefreshListener = "/forceRefreshListener"

type ListenerRouteDependencies struct {
	ModePolicy          modes.Policy
	ShareSessions       modes.ShareSessionStore
	ProjectState        *projectstate.Runtime
	Deployment          *deployments.Runtime
	ListenerBroadcaster *realtime.ListenerBroadcaster
}

type ForceRefreshProjectRequest struct {
	ProjectID string `json:"projectConfigId"`
}

func RegisterListenerRoutes(router chi.Router, deps ListenerRouteDependencies) error {
	if router == nil {
		return fmt.Errorf("router is required")
	}
	if deps.ListenerBroadcaster == nil {
		return fmt.Errorf("listener broadcaster is required")
	}

	if deps.ModePolicy.IsDeployment() {
		if deps.Deployment == nil {
			return fmt.Errorf("deployment runtime is required in deployment mode")
		}
		if deps.ShareSessions == nil {
			return fmt.Errorf("share session store is required in deployment mode")
		}
		router.With(RequireShareSession(modes.Resolver{
			Policy: deps.ModePolicy,
			Store:  deps.ShareSessions,
		})).Post(RouteForceRefreshListener, forceRefreshListenerHandler(deps))
		return nil
	}

	if deps.ProjectState == nil {
		return fmt.Errorf("project runtime is required outside deployment mode")
	}
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteForceRefreshListener, forceRefreshListenerHandler(deps))
	return nil
}

func forceRefreshListenerHandler(deps ListenerRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[ForceRefreshProjectRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}

		requestInfo, err := modes.RequireRequestInfo(r)
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		projectStatePayload, err := listenerForceRefreshPayload(deps, requestInfo, projectID)
		if err != nil {
			writeListenerForceRefreshError(w, r, err)
			return
		}

		if _, err := deps.ListenerBroadcaster.SendForceRefresh(r.Context(), realtime.ForceRefreshParams{
			ProjectID:      projectID,
			ShareSessionID: requestInfo.ShareSessionID,
			ProjectState:   projectStatePayload,
		}); err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		writeJSON(w, http.StatusOK, nil)
	}
}

func listenerForceRefreshPayload(
	deps ListenerRouteDependencies,
	requestInfo modes.RequestInfo,
	projectID string,
) (json.RawMessage, error) {
	var snapshot projectstate.Snapshot
	if requestInfo.Policy.IsDeployment() {
		if deps.Deployment == nil {
			return nil, fmt.Errorf("deployment runtime is required")
		}
		deploymentSnapshot, err := deps.Deployment.SessionSnapshot(requestInfo.ShareSessionID)
		if err != nil {
			return nil, err
		}
		snapshot = deploymentSnapshot
	} else {
		if deps.ProjectState == nil {
			return nil, fmt.Errorf("project runtime is required")
		}
		snapshot = deps.ProjectState.Snapshot()
	}

	projectStateView, err := projectview.SingleConfigByProjectID(snapshot.Document, projectID)
	if err != nil {
		return nil, err
	}

	payload, err := json.Marshal(projectStateView)
	if err != nil {
		return nil, err
	}
	return payload, nil
}

func writeListenerForceRefreshError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectview.ErrProjectConfigIDRequired),
		errors.Is(err, projectstate.ErrProjectIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, deployments.ErrUnknownSession),
		errors.Is(err, projectstate.ErrSessionIDRequired):
		writeError(w, r, http.StatusNotFound, "unknown_share_session", "Unknown share session.")
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}
