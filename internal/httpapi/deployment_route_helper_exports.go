package httpapi

import (
	"net/http"

	"setta/internal/deployments"
	"setta/internal/projectstate"
)

// These helpers let plugin-owned deployment routes reuse the shared host
// deployment/session plumbing without re-implementing it.
func CurrentDeploymentSession(runtime *deployments.Runtime, request *http.Request) (deployments.Session, error) {
	return currentDeploymentSession(runtime, request)
}

func DeploymentProjectMetadataFromRuntime(runtime *deployments.Runtime) []projectstate.ProjectConfigMetadata {
	return deploymentProjectMetadataFromRuntime(runtime)
}

func RequireDeploymentMatch(w http.ResponseWriter, r *http.Request, runtime *deployments.Runtime, label string) bool {
	return requireDeploymentMatch(w, r, runtime, label)
}

func CurrentDeploymentSnapshot(runtime *deployments.Runtime, request *http.Request) (projectstate.Snapshot, error) {
	return currentDeploymentSnapshot(runtime, request)
}

func EnsureDeploymentListener(runtime *deployments.Runtime, request *http.Request, projectConfigID string) error {
	return ensureDeploymentListener(runtime, request, projectConfigID)
}

func HandleDeploymentProjectStateError(w http.ResponseWriter, r *http.Request, err error) {
	handleDeploymentProjectStateError(w, r, err)
}

func CloneAppDefinition(appDefinition *projectstate.AppDefinition) *projectstate.AppDefinition {
	return cloneAppDefinition(appDefinition)
}
