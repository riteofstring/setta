package settajsonrenderappgenbackend

import "setta/internal/deployments"

func AppDeploymentTypeRegistration() deployments.TypeRegistration {
	return deployments.TypeRegistration{
		Type: deployments.TypeApp,
		Startup: deployments.StartupRegistration{
			ModeName: string(deployments.TypeApp),
			URLLabel: "App URL",
		},
		OpenRuntime: deployments.Open,
	}
}
