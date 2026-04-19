package main

import (
	"net/http"
	"sync"
	"testing"

	"github.com/danielgtaylor/huma/v2"
	"github.com/go-chi/chi/v5"
	"setta/internal/appsubsystem"
	"setta/internal/appsubsystemproviders"
	"setta/internal/chatmodes"
	"setta/internal/deployments"
	"setta/internal/httpapi"
	"setta/internal/mcpx"
	"setta/internal/plugins"
	"setta/internal/projectstate"
	"setta/internal/uisettings"
)

func TestBuildFrontendHTTPOpenAPIDocumentIncludesDiscoveredAppSubsystemRoutes(
	t *testing.T,
) {
	document := buildOpenAPIDocumentForProviders(t, appsubsystemproviders.DiscoveredProviders())

	for _, routePath := range []string{
		httpapi.RouteGetAppDefinition,
		httpapi.RouteSetAppDefinition,
		httpapi.RouteValidateAppDefinition,
		httpapi.RouteAppDeployments,
		httpapi.RouteAppDeploymentCurrentSession,
	} {
		if document.Paths[routePath] == nil {
			t.Fatalf(
				"expected discovered app subsystem provider %q to contribute %s",
				"setta-json-render-app-gen",
				routePath,
			)
		}
	}
}

func TestBuildOpenAPIDocumentAppSubsystemRegistrationsIncludesAdditionalProviders(t *testing.T) {
	t.Parallel()

	registerOpenAPITestProvider()

	document := buildOpenAPIDocumentForProviders(
		t,
		[]appsubsystemproviders.DiscoveredProvider{
			{
				PluginID: "setta-json-render-app-gen",
				Capabilities: plugins.PluginAppSubsystemFeatureManifest{
					AppAuthoringUI:         true,
					AppPreviewUI:           true,
					AppGenerationChatModes: true,
					AppDeploymentRuntime:   true,
				},
			},
			{
				PluginID: openAPITestProviderPluginID,
				Capabilities: plugins.PluginAppSubsystemFeatureManifest{
					AppAuthoringUI: true,
				},
			},
		},
	)
	if document.Paths["/test-provider-route"] == nil {
		t.Fatal("expected additional discovered provider route in openapi document")
	}
}

func buildOpenAPIDocumentForProviders(
	t *testing.T,
	providers []appsubsystemproviders.DiscoveredProvider,
) *huma.OpenAPI {
	t.Helper()

	document, err := httpapi.BuildFrontendHTTPOpenAPIDocumentWithRegistrationBuilder(
		func(deps httpapi.FrontendAPIRouteDependencies) httpapi.FrontendAPIRouteRegistrations {
			registrations, buildErr := buildOpenAPIDocumentAppSubsystemRegistrations(
				deps,
				providers,
			)
			if buildErr != nil {
				t.Fatalf("build app subsystem route registrations: %v", buildErr)
			}
			return registrations
		},
	)
	if err != nil {
		t.Fatalf("build frontend openapi document: %v", err)
	}
	return document
}

const openAPITestProviderPluginID = "acme.test-openapi-provider"

var registerOpenAPITestProviderOnce sync.Once

type openAPITestProvider struct{}

func registerOpenAPITestProvider() {
	registerOpenAPITestProviderOnce.Do(func() {
		appsubsystem.RegisterBackendProvider(
			openAPITestProviderPluginID,
			openAPITestProvider{},
		)
	})
}

func (openAPITestProvider) BuildFrontendAPIRouteRegistrations(
	options appsubsystem.FrontendRouteRegistrationOptions,
) httpapi.FrontendAPIRouteRegistrations {
	return httpapi.FrontendAPIRouteRegistrations{
		Project: []httpapi.FrontendAPIRouteContribution{{
			Family: "test provider",
			Register: func(router chi.Router) error {
				httpapi.RegisterOpenAPIGet[map[string]string](
					router,
					"getTestProviderRoute",
					"/test-provider-route",
					func(w http.ResponseWriter, r *http.Request) {
						httpapi.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
					},
					httpapi.WithOpenAPITags("Test Provider"),
				)
				return nil
			},
		}},
	}
}

func (openAPITestProvider) BuildMCPToolRegistrations(*projectstate.Runtime) []mcpx.ToolRegistration {
	return nil
}

func (openAPITestProvider) BuildScopedUISettingEntries(*projectstate.Runtime) ([]uisettings.RuntimeEntry, error) {
	return nil, nil
}

func (openAPITestProvider) AppGenerationModeContributions() []chatmodes.AppGenerationModeContribution {
	return nil
}

func (openAPITestProvider) NewAppPublishService(
	deployments.AppPublisherOptions,
	*projectstate.Runtime,
) (deployments.AppPublishService, error) {
	return nil, nil
}

func (openAPITestProvider) DeploymentTypeRegistration() deployments.TypeRegistration {
	return deployments.TypeRegistration{}
}
