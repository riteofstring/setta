package httpapi

import (
	"errors"
	"fmt"
	"net/http"
	"sort"
	"strings"

	"github.com/go-chi/chi/v5"
	"setta/internal/deployments"
	"setta/internal/modes"
	"setta/internal/projectstate"
	"setta/internal/projectview"
)

const RouteShareDeploymentCurrentSession = "/share/deployments/current/session"
const RouteAppDeploymentCurrentSession = "/app/deployments/current/session"
const RouteShareDeploymentState = "/share/deployments/{deploymentName}/{version}/state"
const RouteShareDeploymentProjectConfig = "/share/deployments/{deploymentName}/{version}/project_config"
const RouteAppDeploymentState = "/app/deployments/{deploymentName}/{version}/state"
const RouteAppDeploymentProjectConfig = "/app/deployments/{deploymentName}/{version}/project_config"

type DeploymentRouteDependencies struct {
	ModePolicy modes.Policy
	Deployment *deployments.Runtime
}

type ShareDeploymentSessionResponse struct {
	DeploymentName         string                               `json:"deploymentName"`
	DeploymentVersion      string                               `json:"deploymentVersion"`
	ShareSessionID         string                               `json:"shareSessionId"`
	SessionRunCount        int                                  `json:"sessionRunCount"`
	DefaultProjectConfigID string                               `json:"defaultProjectConfigId"`
	ProjectMetadata        []projectstate.ProjectConfigMetadata `json:"projectMetadata"`
	SharePolicy            deployments.Policy                   `json:"sharePolicy"`
	Manifest               *deployments.Manifest                `json:"manifest,omitempty"`
}

type AppDeploymentSessionResponse struct {
	DeploymentName         string                               `json:"deploymentName"`
	DeploymentVersion      string                               `json:"deploymentVersion"`
	ShareSessionID         string                               `json:"shareSessionId"`
	SessionRunCount        int                                  `json:"sessionRunCount"`
	DefaultProjectConfigID string                               `json:"defaultProjectConfigId"`
	ProjectMetadata        []projectstate.ProjectConfigMetadata `json:"projectMetadata"`
	AppPolicy              deployments.Policy                   `json:"appPolicy"`
	Manifest               *deployments.Manifest                `json:"manifest,omitempty"`
}

type LoadDeploymentProjectConfigRequest struct {
	ProjectConfigID string `json:"projectConfigId"`
}

type deploymentProjectStateResponse struct {
	ProjectState   projectview.SingleConfig `json:"projectState"`
	CompletedOpIDs []string                 `json:"completedOpIds"`
	PendingOpIDs   []string                 `json:"pendingOpIds"`
}

type AppDeploymentStateResponse struct {
	ProjectState  projectview.SingleConfig    `json:"projectState"`
	AppDefinition *projectstate.AppDefinition `json:"appDefinition"`
	AppSpec       any                         `json:"appSpec"`
	AppPolicy     deployments.Policy          `json:"appPolicy"`
}

func RegisterDeploymentRoutes(router chi.Router, deps DeploymentRouteDependencies) error {
	if router == nil {
		return fmt.Errorf("router is required")
	}
	if !deps.ModePolicy.IsDeployment() {
		return nil
	}
	if deps.Deployment == nil {
		return fmt.Errorf("deployment runtime is required in deployment mode")
	}

	if deps.ModePolicy.IsShare() {
		router.Post(RouteShareDeploymentCurrentSession, currentShareDeploymentSessionHandler(deps.Deployment))
		router.With(RequireShareSession(modes.Resolver{
			Policy: deps.ModePolicy,
			Store:  deps.Deployment,
		})).Get(RouteShareDeploymentState, shareDeploymentStateHandler(deps.Deployment))
		router.With(RequireShareSession(modes.Resolver{
			Policy: deps.ModePolicy,
			Store:  deps.Deployment,
		})).Post(RouteShareDeploymentProjectConfig, shareDeploymentProjectConfigHandler(deps.Deployment))
	}
	if deps.ModePolicy.IsApp() {
		router.Post(RouteAppDeploymentCurrentSession, currentAppDeploymentSessionHandler(deps.Deployment))
		router.With(RequireShareSession(modes.Resolver{
			Policy: deps.ModePolicy,
			Store:  deps.Deployment,
		})).Get(RouteAppDeploymentState, appDeploymentStateHandler(deps.Deployment))
		router.With(RequireShareSession(modes.Resolver{
			Policy: deps.ModePolicy,
			Store:  deps.Deployment,
		})).Post(RouteAppDeploymentProjectConfig, appDeploymentProjectConfigHandler(deps.Deployment))
	}
	return nil
}

func currentShareDeploymentSessionHandler(runtime *deployments.Runtime) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		session, err := currentDeploymentSession(runtime, r)
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		manifest := runtime.Manifest()
		writeJSON(w, http.StatusOK, ShareDeploymentSessionResponse{
			DeploymentName:         manifest.DeploymentName,
			DeploymentVersion:      manifest.DeploymentVersion,
			ShareSessionID:         session.ID,
			SessionRunCount:        session.RunCount,
			DefaultProjectConfigID: manifest.DefaultProjectID,
			ProjectMetadata:        deploymentProjectMetadataFromRuntime(runtime),
			SharePolicy:            runtime.Policy(),
			Manifest:               &manifest,
		})
	}
}

func currentAppDeploymentSessionHandler(runtime *deployments.Runtime) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		session, err := currentDeploymentSession(runtime, r)
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		manifest := runtime.Manifest()
		writeJSON(w, http.StatusOK, AppDeploymentSessionResponse{
			DeploymentName:         manifest.DeploymentName,
			DeploymentVersion:      manifest.DeploymentVersion,
			ShareSessionID:         session.ID,
			SessionRunCount:        session.RunCount,
			DefaultProjectConfigID: manifest.DefaultProjectID,
			ProjectMetadata:        deploymentProjectMetadataFromRuntime(runtime),
			AppPolicy:              runtime.Policy(),
			Manifest:               &manifest,
		})
	}
}

func currentDeploymentSession(runtime *deployments.Runtime, request *http.Request) (deployments.Session, error) {
	requestedSessionID := modes.MaybeShareSessionIDFromRequest(request)
	session, _, err := runtime.GetOrCreateSession(requestedSessionID)
	if err != nil {
		return deployments.Session{}, err
	}
	if err := runtime.EnsureListenerForSession(session.ID, runtime.Manifest().DefaultProjectID); err != nil {
		return deployments.Session{}, err
	}
	return session, nil
}

func deploymentProjectMetadataFromRuntime(runtime *deployments.Runtime) []projectstate.ProjectConfigMetadata {
	snapshot := runtime.Base().Snapshot()
	metadata := make([]projectstate.ProjectConfigMetadata, 0, len(snapshot.Document.Projects))
	for _, project := range snapshot.Document.Projects {
		metadata = append(metadata, projectstate.ProjectConfigMetadata{
			ID:   project.ID,
			Name: project.Name,
		})
	}

	sort.Slice(metadata, func(i int, j int) bool {
		leftName := strings.TrimSpace(metadata[i].Name)
		rightName := strings.TrimSpace(metadata[j].Name)
		if leftName == rightName {
			return metadata[i].ID < metadata[j].ID
		}
		return leftName < rightName
	})
	return metadata
}

func shareDeploymentStateHandler(runtime *deployments.Runtime) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !requireDeploymentMatch(w, r, runtime, "Share") {
			return
		}

		projectState, err := currentDeploymentProjectState(runtime, r)
		if err != nil {
			handleDeploymentProjectStateError(w, r, err)
			return
		}

		writeJSON(w, http.StatusOK, deploymentProjectStateResponse{
			ProjectState:   projectState,
			CompletedOpIDs: []string{},
			PendingOpIDs:   []string{},
		})
	}
}

func shareDeploymentProjectConfigHandler(runtime *deployments.Runtime) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !requireDeploymentMatch(w, r, runtime, "Share") {
			return
		}

		payload, err := decodeStrictJSONBody[LoadDeploymentProjectConfigRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectConfigID := strings.TrimSpace(payload.ProjectConfigID)
		if projectConfigID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}

		projectState, err := explicitDeploymentProjectState(runtime, r, projectConfigID)
		if err != nil {
			handleDeploymentProjectStateError(w, r, err)
			return
		}

		writeJSON(w, http.StatusOK, deploymentProjectStateResponse{
			ProjectState:   projectState,
			CompletedOpIDs: []string{},
			PendingOpIDs:   []string{},
		})
	}
}

func appDeploymentStateHandler(runtime *deployments.Runtime) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !requireDeploymentMatch(w, r, runtime, "App") {
			return
		}

		snapshot, err := currentDeploymentSnapshot(runtime, r)
		if err != nil {
			handleDeploymentProjectStateError(w, r, err)
			return
		}

		projectState, err := projectview.DefaultSingleConfig(snapshot.Document)
		if err != nil {
			handleDeploymentProjectStateError(w, r, err)
			return
		}
		appSpec, err := runtime.LoadAppSpec(snapshot.Document.AppDefinition)
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		writeJSON(w, http.StatusOK, AppDeploymentStateResponse{
			ProjectState:  projectState,
			AppDefinition: cloneAppDefinition(snapshot.Document.AppDefinition),
			AppSpec:       appSpec,
			AppPolicy:     runtime.Policy(),
		})
	}
}

func appDeploymentProjectConfigHandler(runtime *deployments.Runtime) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !requireDeploymentMatch(w, r, runtime, "App") {
			return
		}

		payload, err := decodeStrictJSONBody[LoadDeploymentProjectConfigRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectConfigID := strings.TrimSpace(payload.ProjectConfigID)
		if projectConfigID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}

		if err := ensureDeploymentListener(runtime, r, projectConfigID); err != nil {
			handleDeploymentProjectStateError(w, r, err)
			return
		}

		snapshot, err := currentDeploymentSnapshot(runtime, r)
		if err != nil {
			handleDeploymentProjectStateError(w, r, err)
			return
		}

		projectState, err := projectview.SingleConfigByProjectID(snapshot.Document, projectConfigID)
		if err != nil {
			handleDeploymentProjectStateError(w, r, err)
			return
		}
		appSpec, err := runtime.LoadAppSpec(snapshot.Document.AppDefinition)
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		writeJSON(w, http.StatusOK, AppDeploymentStateResponse{
			ProjectState:  projectState,
			AppDefinition: cloneAppDefinition(snapshot.Document.AppDefinition),
			AppSpec:       appSpec,
			AppPolicy:     runtime.Policy(),
		})
	}
}

func requireDeploymentMatch(w http.ResponseWriter, r *http.Request, runtime *deployments.Runtime, label string) bool {
	deploymentName := strings.TrimSpace(chi.URLParam(r, "deploymentName"))
	version := strings.TrimSpace(chi.URLParam(r, "version"))
	manifest := runtime.Manifest()
	if deploymentName != manifest.DeploymentName || version != manifest.DeploymentVersion {
		writeError(
			w,
			r,
			http.StatusNotFound,
			"not_found",
			fmt.Sprintf("%s deployment not found: %s/%s", label, deploymentName, version),
		)
		return false
	}
	return true
}

func currentDeploymentProjectState(runtime *deployments.Runtime, request *http.Request) (projectview.SingleConfig, error) {
	defaultProjectID := runtime.Manifest().DefaultProjectID
	if err := ensureDeploymentListener(runtime, request, defaultProjectID); err != nil {
		return projectview.SingleConfig{}, err
	}
	snapshot, err := currentDeploymentSnapshot(runtime, request)
	if err != nil {
		return projectview.SingleConfig{}, err
	}
	return projectview.DefaultSingleConfig(snapshot.Document)
}

func explicitDeploymentProjectState(runtime *deployments.Runtime, request *http.Request, projectConfigID string) (projectview.SingleConfig, error) {
	if err := ensureDeploymentListener(runtime, request, projectConfigID); err != nil {
		return projectview.SingleConfig{}, err
	}
	snapshot, err := currentDeploymentSnapshot(runtime, request)
	if err != nil {
		return projectview.SingleConfig{}, err
	}
	return projectview.SingleConfigByProjectID(snapshot.Document, projectConfigID)
}

func currentDeploymentSnapshot(runtime *deployments.Runtime, request *http.Request) (projectstate.Snapshot, error) {
	requestInfo, ok := modes.RequestInfoFromRequest(request)
	if !ok || strings.TrimSpace(requestInfo.ShareSessionID) == "" {
		return projectstate.Snapshot{}, &modes.MissingShareSessionError{}
	}
	return runtime.SessionSnapshot(requestInfo.ShareSessionID)
}

func ensureDeploymentListener(runtime *deployments.Runtime, request *http.Request, projectConfigID string) error {
	requestInfo, ok := modes.RequestInfoFromRequest(request)
	if !ok || strings.TrimSpace(requestInfo.ShareSessionID) == "" {
		return &modes.MissingShareSessionError{}
	}
	return runtime.EnsureListenerForSession(requestInfo.ShareSessionID, projectConfigID)
}

func handleDeploymentProjectStateError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case writeModesError(w, r, err):
		return
	case errors.Is(err, projectview.ErrProjectConfigIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func cloneAppDefinition(appDefinition *projectstate.AppDefinition) *projectstate.AppDefinition {
	if appDefinition == nil {
		return nil
	}
	cloned := appDefinition.Clone()
	return &cloned
}
