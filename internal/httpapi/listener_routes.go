package httpapi

import (
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"setta/internal/deployments"
	"setta/internal/listenersnapshot"
	"setta/internal/modes"
	"setta/internal/projectstate"
	"setta/internal/projectview"
	"setta/internal/realtime"
)

const (
	RouteForceRefreshListener = "/forceRefreshListener"
	RouteGetListenerCoverage  = "/getListenerCoverage"
)

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

type ListenerCoverageRequest struct {
	ProjectID string `json:"projectConfigId"`
}

func RegisterListenerRoutes(router chi.Router, deps ListenerRouteDependencies) error {
	if router == nil {
		return fmt.Errorf("router is required")
	}
	documentOnly := openAPIDocumentOnlyFromRouter(router)
	if deps.ListenerBroadcaster == nil && !documentOnly {
		return fmt.Errorf("listener broadcaster is required")
	}

	if deps.ModePolicy.IsDeployment() {
		if deps.Deployment == nil && !documentOnly {
			return fmt.Errorf("deployment runtime is required in deployment mode")
		}
		if deps.ShareSessions == nil && !documentOnly {
			return fmt.Errorf("share session store is required in deployment mode")
		}
		protectedRouter := router.With(RequireShareSession(modes.Resolver{
			Policy: deps.ModePolicy,
			Store:  deps.ShareSessions,
		}))
		registerOpenAPIPost[ForceRefreshProjectRequest, openAPIJSONNull](
			protectedRouter,
			"forceRefreshListener",
			RouteForceRefreshListener,
			forceRefreshListenerHandler(deps),
			withOpenAPITags("Listeners"),
			withOpenAPISummary("Force a listener refresh broadcast for a project."),
			withOpenAPIModeRequirement("not-launcher"),
		)
		registerOpenAPIPost[ListenerCoverageRequest, realtime.ListenerCoverageSnapshot](
			protectedRouter,
			"getListenerCoverage",
			RouteGetListenerCoverage,
			getListenerCoverageHandler(deps),
			withOpenAPITags("Listeners"),
			withOpenAPISummary("Get listener dependency coverage for a project."),
			withOpenAPIModeRequirement("not-launcher"),
		)
		return nil
	}

	if deps.ProjectState == nil && !documentOnly {
		return fmt.Errorf("project runtime is required outside deployment mode")
	}
	protectedRouter := router.With(RequireIDEMode(deps.ModePolicy))
	registerOpenAPIPost[ForceRefreshProjectRequest, openAPIJSONNull](
		protectedRouter,
		"forceRefreshListener",
		RouteForceRefreshListener,
		forceRefreshListenerHandler(deps),
		withOpenAPITags("Listeners"),
		withOpenAPISummary("Force a listener refresh broadcast for a project."),
		withOpenAPIModeRequirement("not-launcher"),
	)
	registerOpenAPIPost[ListenerCoverageRequest, realtime.ListenerCoverageSnapshot](
		protectedRouter,
		"getListenerCoverage",
		RouteGetListenerCoverage,
		getListenerCoverageHandler(deps),
		withOpenAPITags("Listeners"),
		withOpenAPISummary("Get listener dependency coverage for a project."),
		withOpenAPIModeRequirement("not-launcher"),
	)
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

		snapshotPayload, err := listenerForceRefreshPayload(deps, requestInfo, projectID)
		if err != nil {
			writeListenerForceRefreshError(w, r, projectID, err)
			return
		}

		if _, err := deps.ListenerBroadcaster.SendForceRefresh(r.Context(), realtime.ForceRefreshParams{
			ProjectID:      projectID,
			ShareSessionID: requestInfo.ShareSessionID,
			Snapshot:       snapshotPayload,
			RefreshKind:    "force_refresh",
		}); err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		writeJSON(w, http.StatusOK, nil)
	}
}

func getListenerCoverageHandler(deps ListenerRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[ListenerCoverageRequest](r)
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

		registrations := deps.ListenerBroadcaster.Registry().RegistrationsForProject(projectID, requestInfo.ShareSessionID)
		snapshot, err := realtime.BuildListenerCoverageSnapshot(projectID, registrations)
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, snapshot)
	}
}

func listenerForceRefreshPayload(
	deps ListenerRouteDependencies,
	requestInfo modes.RequestInfo,
	projectID string,
) (listenersnapshot.ListenerSnapshotPayload, error) {
	var snapshot projectstate.Snapshot
	if requestInfo.Policy.IsDeployment() {
		if deps.Deployment == nil {
			return listenersnapshot.ListenerSnapshotPayload{}, fmt.Errorf("deployment runtime is required")
		}
		deploymentSnapshot, err := deps.Deployment.SessionSnapshot(requestInfo.ShareSessionID)
		if err != nil {
			return listenersnapshot.ListenerSnapshotPayload{}, err
		}
		snapshot = deploymentSnapshot
	} else {
		if deps.ProjectState == nil {
			return listenersnapshot.ListenerSnapshotPayload{}, fmt.Errorf("project runtime is required")
		}
		snapshot = deps.ProjectState.Snapshot()
	}

	return listenersnapshot.BuildListenerSnapshotPayload(snapshot.Document, projectID)
}

func writeListenerForceRefreshError(w http.ResponseWriter, r *http.Request, projectID string, err error) {
	switch {
	case errors.Is(err, projectview.ErrProjectConfigIDRequired),
		errors.Is(err, projectstate.ErrProjectIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeJSON(w, http.StatusNotFound, map[string]string{
			"detail": fmt.Sprintf("project state unavailable for %s", strings.TrimSpace(projectID)),
		})
	case errors.Is(err, deployments.ErrUnknownSession),
		errors.Is(err, projectstate.ErrSessionIDRequired):
		writeError(w, r, http.StatusNotFound, "unknown_share_session", "Unknown share session.")
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}
