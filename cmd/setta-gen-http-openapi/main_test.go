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
	document := buildOpenAPIDocumentForCapabilities(
		t,
		appsubsystemproviders.DiscoveredProviderCapabilities(),
	)

	for _, routePath := range []string{
		httpapi.RouteGetAppDefinition,
		httpapi.RouteSetAppDefinition,
		httpapi.RouteValidateAppDefinition,
		httpapi.RouteAppDeployments,
		httpapi.RouteAppDeploymentCurrentSession,
	} {
		if document.Paths[routePath] == nil {
			t.Fatalf(
				"expected discovered app subsystem capabilities to contribute %s",
				routePath,
			)
		}
	}
}

func TestBuildOpenAPIDocumentAppSubsystemRegistrationsMergesSharedRoutesAcrossProviders(t *testing.T) {
	t.Parallel()

	document := buildOpenAPIDocumentForCapabilities(
		t,
		[]plugins.PluginAppSubsystemFeatureManifest{
			{
				AppAuthoringUI:         true,
				AppPreviewUI:           true,
				AppGenerationChatModes: true,
				AppDeploymentRuntime:   true,
			},
			{
				AppAuthoringUI: true,
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

func buildOpenAPIDocumentForCapabilities(
	t *testing.T,
	providers []plugins.PluginAppSubsystemFeatureManifest,
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
