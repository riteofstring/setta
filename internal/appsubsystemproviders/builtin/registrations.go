package settajsonrenderappgenbackend

import (
	"github.com/go-chi/chi/v5"
	"setta/internal/appsubsystem"
	"setta/internal/httpapi"
	"setta/internal/plugins"
)

func BuildFrontendAPIRouteRegistrations(
	options appsubsystem.FrontendRouteRegistrationOptions,
	pluginID string,
) httpapi.FrontendAPIRouteRegistrations {
	capabilities := appSubsystemRouteCapabilities(options.Capabilities)
	if !capabilities.PluginEnabled {
		return httpapi.FrontendAPIRouteRegistrations{}
	}
	return httpapi.FrontendAPIRouteRegistrations{
		Deployment: buildDeploymentFrontendRouteContributions(options, pluginID, capabilities),
	}
}

func buildDeploymentFrontendRouteContributions(
	options appsubsystem.FrontendRouteRegistrationOptions,
	pluginID string,
	capabilities plugins.PluginAppSubsystemCapabilities,
) []httpapi.FrontendAPIRouteContribution {
	if !capabilities.AppDeploymentRuntime {
		return nil
	}
	appDeploymentIDE := AppDeploymentIDERouteDependencies{
		ModePolicy:   options.ShareDeploymentIDE.ModePolicy,
		ProjectState: options.ShareDeploymentIDE.ProjectState,
		Catalog:      options.ShareDeploymentIDE.Catalog,
		AppPublisher: options.AppDeploymentIDEPublisher,
		PluginID:     pluginID,
	}
	return []httpapi.FrontendAPIRouteContribution{
		{
			Family: "app deployment",
			Register: func(router chi.Router) error {
				return RegisterAppDeploymentRoutes(router, options.AppDeployment, pluginID)
			},
		},
		{
			Family: "app deployment ide",
			Register: func(router chi.Router) error {
				return RegisterAppDeploymentIDERoutes(router, appDeploymentIDE)
			},
		},
	}
}

func appSubsystemRouteCapabilities(
	provider appsubsystem.CapabilityProvider,
) plugins.PluginAppSubsystemCapabilities {
	if provider == nil {
		return plugins.PluginAppSubsystemCapabilities{}
	}
	return provider.AppSubsystemCapabilities()
}
