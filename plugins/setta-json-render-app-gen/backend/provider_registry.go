package settajsonrenderappgenbackend

import (
	"setta/internal/appsubsystem"
	"setta/internal/deployments"
	"setta/internal/httpapi"
	"setta/internal/projectstate"
)

const backendProviderPluginID = "setta-json-render-app-gen"

type backendProvider struct{}

func init() {
	appsubsystem.RegisterBackendProvider(
		backendProviderPluginID,
		NewBackendProvider(),
	)
}

func NewBackendProvider() appsubsystem.BackendProvider {
	return backendProvider{}
}

func (backendProvider) BuildFrontendAPIRouteRegistrations(
	options appsubsystem.FrontendRouteRegistrationOptions,
) httpapi.FrontendAPIRouteRegistrations {
	return BuildFrontendAPIRouteRegistrations(options)
}

func (backendProvider) NewAppPublishService(
	options deployments.AppPublisherOptions,
	projectRuntime *projectstate.Runtime,
) (deployments.AppPublishService, error) {
	return NewAppPublishService(options, NewAppDefinitionService(projectRuntime))
}

func (backendProvider) DeploymentTypeRegistration() deployments.TypeRegistration {
	return AppDeploymentTypeRegistration()
}
