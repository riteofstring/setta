package settajsonrenderappgenbackend

import (
	"setta/internal/appsubsystem"
	"setta/internal/chatmodes"
	"setta/internal/deployments"
	"setta/internal/httpapi"
	"setta/internal/mcpx"
	"setta/internal/projectstate"
	"setta/internal/uisettings"
	"setta/plugins/setta-json-render-app-gen/backend/appspec"
	settajsonrenderappgenbackendappuisettings "setta/plugins/setta-json-render-app-gen/backend/appuisettings"
	settajsonrenderappgenbackendchatmodes "setta/plugins/setta-json-render-app-gen/backend/chatmodes"
)

const ProviderPluginID = "setta-json-render-app-gen"

type backendProvider struct {
	pluginID string
}

func init() {
	RegisterBackendProvider(ProviderPluginID)
}

func RegisterBackendProvider(pluginID string) {
	appsubsystem.RegisterBackendProvider(
		pluginID,
		NewBackendProvider(pluginID),
	)
}

func NewBackendProvider(pluginID string) appsubsystem.BackendProvider {
	return backendProvider{pluginID: pluginID}
}

func (p backendProvider) BuildFrontendAPIRouteRegistrations(
	options appsubsystem.FrontendRouteRegistrationOptions,
) httpapi.FrontendAPIRouteRegistrations {
	return BuildFrontendAPIRouteRegistrations(options, p.pluginID)
}

func (p backendProvider) BuildMCPToolRegistrations(
	projectRuntime *projectstate.Runtime,
) []mcpx.ToolRegistration {
	if projectRuntime == nil {
		return nil
	}
	return BuildMCPToolRegistrations(
		NewAppDefinitionService(projectRuntime, p.pluginID),
		p.defaultAppSpecPath(),
	)
}

func (p backendProvider) BuildScopedUISettingEntries(
	projectRuntime *projectstate.Runtime,
) ([]uisettings.RuntimeEntry, error) {
	if projectRuntime == nil {
		return nil, nil
	}
	return settajsonrenderappgenbackendappuisettings.BuildEntries(
		NewAppDefinitionService(projectRuntime, p.pluginID),
		p.pluginID,
	)
}

func (backendProvider) AppGenerationModeContributions() []chatmodes.AppGenerationModeContribution {
	return settajsonrenderappgenbackendchatmodes.BuildChatModeContributions()
}

func (p backendProvider) NewAppPublishService(
	options deployments.AppPublisherOptions,
	projectRuntime *projectstate.Runtime,
) (deployments.AppPublishService, error) {
	return NewAppPublishService(
		options,
		NewAppDefinitionService(projectRuntime, p.pluginID),
		p.pluginID,
	)
}

func (backendProvider) DeploymentTypeRegistration() deployments.TypeRegistration {
	return AppDeploymentTypeRegistration()
}

func (p backendProvider) defaultAppSpecPath() string {
	return appspec.MustForPlugin(p.pluginID).DefaultPath()
}
