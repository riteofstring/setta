package httpapi

import (
	"fmt"
	"net/http"
	"sort"
	"strings"

	"github.com/go-chi/chi/v5"
	"setta/internal/deployments"
	"setta/internal/modes"
)

const RouteShareDeploymentCurrentSession = "/share/deployments/current/session"
const RouteAppDeploymentCurrentSession = "/app/deployments/current/session"

type DeploymentRouteDependencies struct {
	ModePolicy modes.Policy
	Deployment *deployments.Runtime
}

type deploymentProjectMetadata struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type ShareDeploymentSessionResponse struct {
	DeploymentName         string                      `json:"deploymentName"`
	DeploymentVersion      string                      `json:"deploymentVersion"`
	ShareSessionID         string                      `json:"shareSessionId"`
	SessionRunCount        int                         `json:"sessionRunCount"`
	DefaultProjectConfigID string                      `json:"defaultProjectConfigId"`
	ProjectMetadata        []deploymentProjectMetadata `json:"projectMetadata"`
	SharePolicy            deployments.Policy          `json:"sharePolicy"`
	Manifest               *deployments.Manifest       `json:"manifest,omitempty"`
}

type AppDeploymentSessionResponse struct {
	DeploymentName         string                      `json:"deploymentName"`
	DeploymentVersion      string                      `json:"deploymentVersion"`
	ShareSessionID         string                      `json:"shareSessionId"`
	SessionRunCount        int                         `json:"sessionRunCount"`
	DefaultProjectConfigID string                      `json:"defaultProjectConfigId"`
	ProjectMetadata        []deploymentProjectMetadata `json:"projectMetadata"`
	AppPolicy              deployments.Policy          `json:"appPolicy"`
	Manifest               *deployments.Manifest       `json:"manifest,omitempty"`
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
	}
	if deps.ModePolicy.IsApp() {
		router.Post(RouteAppDeploymentCurrentSession, currentAppDeploymentSessionHandler(deps.Deployment))
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
	return session, nil
}

func deploymentProjectMetadataFromRuntime(runtime *deployments.Runtime) []deploymentProjectMetadata {
	snapshot := runtime.Base().Snapshot()
	metadata := make([]deploymentProjectMetadata, 0, len(snapshot.Document.Projects))
	for _, project := range snapshot.Document.Projects {
		metadata = append(metadata, deploymentProjectMetadata{
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
