package settajsonrenderappgenbackend

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"setta/internal/deployments"
	"setta/internal/httpapi"
	"setta/internal/plugins"
)

type AppSubsystemCapabilityProvider interface {
	AppSubsystemCapabilities() plugins.PluginAppSubsystemCapabilities
}

type FrontendRouteRegistrationOptions struct {
	Capabilities              AppSubsystemCapabilityProvider
	API                       httpapi.FrontendAPIRouteDependencies
	AppDeploymentIDEPublisher deployments.AppPublishService
}

func BuildFrontendAPIRouteRegistrations(
	options FrontendRouteRegistrationOptions,
) httpapi.FrontendAPIRouteRegistrations {
	return httpapi.FrontendAPIRouteRegistrations{
		Project: wrapFrontendRouteContributions(
			buildProjectFrontendRouteContributions(options.API),
			options.Capabilities,
			appSubsystemProjectRoutesAvailable,
		),
		Deployment: wrapFrontendRouteContributions(
			buildDeploymentFrontendRouteContributions(options),
			options.Capabilities,
			appSubsystemDeploymentRoutesAvailable,
		),
	}
}

func buildProjectFrontendRouteContributions(
	deps httpapi.FrontendAPIRouteDependencies,
) []httpapi.FrontendAPIRouteContribution {
	return []httpapi.FrontendAPIRouteContribution{
		{
			Family: "app definition",
			Register: func(router chi.Router) error {
				return httpapi.RegisterAppDefinitionRoutes(router, deps.AppDefinition)
			},
		},
		{
			Family: "app generation skill",
			Register: func(router chi.Router) error {
				return httpapi.RegisterAppGenSkillRoutes(router, deps.AppGenSkill)
			},
		},
	}
}

func buildDeploymentFrontendRouteContributions(
	options FrontendRouteRegistrationOptions,
) []httpapi.FrontendAPIRouteContribution {
	appDeploymentIDE := httpapi.AppDeploymentIDERouteDependencies{
		ModePolicy:   options.API.ShareDeploymentIDE.ModePolicy,
		ProjectState: options.API.ShareDeploymentIDE.ProjectState,
		Catalog:      options.API.ShareDeploymentIDE.Catalog,
		AppPublisher: options.AppDeploymentIDEPublisher,
	}
	return []httpapi.FrontendAPIRouteContribution{
		{
			Family: "app deployment",
			Register: func(router chi.Router) error {
				return httpapi.RegisterAppDeploymentRoutes(router, options.API.AppDeployment)
			},
		},
		{
			Family: "app deployment ide",
			Register: func(router chi.Router) error {
				return httpapi.RegisterAppDeploymentIDERoutes(router, appDeploymentIDE)
			},
		},
	}
}

func wrapFrontendRouteContributions(
	contributions []httpapi.FrontendAPIRouteContribution,
	provider AppSubsystemCapabilityProvider,
	available func(plugins.PluginAppSubsystemCapabilities) bool,
) []httpapi.FrontendAPIRouteContribution {
	if len(contributions) == 0 {
		return nil
	}
	wrapped := make([]httpapi.FrontendAPIRouteContribution, 0, len(contributions))
	for _, contribution := range contributions {
		contribution := contribution
		wrapped = append(wrapped, httpapi.FrontendAPIRouteContribution{
			Family: contribution.Family,
			Register: func(router chi.Router) error {
				if provider == nil {
					return contribution.Register(router)
				}
				return contribution.Register(
					router.With(appSubsystemAvailabilityMiddleware(provider, available)),
				)
			},
		})
	}
	return wrapped
}

func appSubsystemAvailabilityMiddleware(
	provider AppSubsystemCapabilityProvider,
	available func(plugins.PluginAppSubsystemCapabilities) bool,
) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if provider == nil || available == nil {
				next.ServeHTTP(w, r)
				return
			}
			if !available(provider.AppSubsystemCapabilities()) {
				http.NotFound(w, r)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func appSubsystemProjectRoutesAvailable(
	capabilities plugins.PluginAppSubsystemCapabilities,
) bool {
	return capabilities.PluginEnabled &&
		(capabilities.AppAuthoringUI ||
			capabilities.AppPreviewUI ||
			capabilities.AppGenerationChatModes)
}

func appSubsystemDeploymentRoutesAvailable(
	capabilities plugins.PluginAppSubsystemCapabilities,
) bool {
	return capabilities.PluginEnabled && capabilities.AppDeploymentRuntime
}
