package main

import (
	"testing"

	"github.com/danielgtaylor/huma/v2"
	"setta/internal/appsubsystemproviders"
	"setta/internal/httpapi"
	"setta/internal/plugins"
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

func TestBuildOpenAPIDocumentAppSubsystemRegistrationsMergesSharedRoutesAcrossProviders(t *testing.T) {
	t.Parallel()

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
				PluginID: "acme.additional-provider",
				Capabilities: plugins.PluginAppSubsystemFeatureManifest{
					AppAuthoringUI: true,
				},
			},
		},
	)
	for _, routePath := range []string{
		httpapi.RouteGetAppCatalog,
		httpapi.RouteGetAppDefinition,
		httpapi.RouteSetAppDefinition,
		httpapi.RouteValidateAppDefinition,
		httpapi.RouteAppDeployments,
		httpapi.RouteAppDeploymentCurrentSession,
	} {
		if document.Paths[routePath] == nil {
			t.Fatalf("expected merged app subsystem route %s", routePath)
		}
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
