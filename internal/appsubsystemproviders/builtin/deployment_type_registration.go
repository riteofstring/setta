package settajsonrenderappgenbackend

import (
	"context"

	"setta/internal/deployments"
)

func AppDeploymentTypeRegistration() deployments.TypeRegistration {
	return deployments.TypeRegistration{
		Type: deployments.TypeApp,
		Startup: deployments.StartupRegistration{
			ModeName: string(deployments.TypeApp),
			URLLabel: "App URL",
		},
		OpenRuntime: OpenAppDeploymentRuntime,
	}
}

func OpenAppDeploymentRuntime(
	ctx context.Context,
	options deployments.RuntimeOptions,
) (*deployments.Runtime, error) {
	return deployments.Open(ctx, options)
}
