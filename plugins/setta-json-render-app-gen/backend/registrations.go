package settajsonrenderappgenbackend

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"setta/internal/httpapi"
	"setta/internal/mcpx"
	"setta/internal/plugins"
)

type AppSubsystemCapabilityProvider interface {
	AppSubsystemCapabilities() plugins.PluginAppSubsystemCapabilities
}

type FrontendRouteRegistrationOptions struct {
	Capabilities AppSubsystemCapabilityProvider
	API          httpapi.FrontendAPIRouteDependencies
}

func BuildFrontendAPIRouteRegistrations(
	options FrontendRouteRegistrationOptions,
) httpapi.FrontendAPIRouteRegistrations {
	base := httpapi.BuildAppSubsystemFrontendAPIRouteRegistrations(options.API)
	return httpapi.FrontendAPIRouteRegistrations{
		Project: wrapFrontendRouteContributions(
			base.Project,
			options.Capabilities,
			appSubsystemProjectRoutesAvailable,
		),
		Deployment: wrapFrontendRouteContributions(
			base.Deployment,
			options.Capabilities,
			appSubsystemDeploymentRoutesAvailable,
		),
	}
}

func BuildMCPToolRegistrations(
	projectState mcpx.AppSubsystemProjectStateProvider,
) []mcpx.ToolRegistration {
	return mcpx.BuildAppSubsystemToolRegistrations(projectState)
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
