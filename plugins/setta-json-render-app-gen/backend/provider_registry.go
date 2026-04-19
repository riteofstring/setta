package settajsonrenderappgenbackend

import (
	"setta/internal/appsubsystem"
	"setta/internal/chatmodes"
	"setta/internal/deployments"
	"setta/internal/httpapi"
	settamcpx "setta/internal/mcpx"
	"setta/internal/projectstate"
	"setta/internal/uisettings"
	settajsonrenderappgenbackendappuisettings "setta/plugins/setta-json-render-app-gen/backend/appuisettings"
	settajsonrenderappgenbackendchatmodes "setta/plugins/setta-json-render-app-gen/backend/chatmodes"
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

func (backendProvider) BuildMCPToolRegistrations(
	projectRuntime *projectstate.Runtime,
) []appsubsystem.MCPToolRegistration {
	if projectRuntime == nil {
		return nil
	}
	return convertAppSubsystemMCPToolRegistrations(
		BuildMCPToolRegistrations(NewAppDefinitionService(projectRuntime)),
	)
}

func (backendProvider) BuildScopedUISettingEntries(
	projectRuntime *projectstate.Runtime,
) ([]uisettings.RuntimeEntry, error) {
	if projectRuntime == nil {
		return nil, nil
	}
	return settajsonrenderappgenbackendappuisettings.BuildEntries(
		NewAppDefinitionService(projectRuntime),
	)
}

func (backendProvider) AppGenerationModeContributions() []chatmodes.AppGenerationModeContribution {
	return settajsonrenderappgenbackendchatmodes.BuildChatModeContributions()
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

func convertAppSubsystemMCPToolRegistrations(
	registrations []settamcpx.ToolRegistration,
) []appsubsystem.MCPToolRegistration {
	if len(registrations) == 0 {
		return nil
	}
	converted := make([]appsubsystem.MCPToolRegistration, 0, len(registrations))
	for _, registration := range registrations {
		converted = append(converted, appsubsystem.MCPToolRegistration{
			Spec:         registration.Spec,
			InputSchema:  registration.InputSchema,
			OutputSchema: registration.OutputSchema,
		})
	}
	return converted
}
