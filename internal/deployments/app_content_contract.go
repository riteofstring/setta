package deployments

import (
	"context"

	"setta/internal/projectstate"
)

// AppDeploymentRuntimeContent loads plugin-owned app content for app runtimes.
type AppDeploymentRuntimeContent interface {
	LoadPublishedAppSpec(deploymentRoot string, appDefinition *projectstate.AppDefinition) (any, error)
}

// AppDeploymentPublishContent owns plugin-specific app-definition/app-spec
// preparation for app deployment publishing.
type AppDeploymentPublishContent interface {
	PreparePublishedAppDefinition(
		ctx context.Context,
		projectRoot string,
		appDefinition *projectstate.AppDefinition,
	) (*projectstate.AppDefinition, any, string, error)
	WritePublishedAppSpec(deploymentRoot string, targetAppSpecPath string, appSpec any) error
}
