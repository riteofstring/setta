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

func TestBuildFrontendHTTPOpenAPIDocumentExcludesCoreWatchCodeRoutes(t *testing.T) {
	document := buildOpenAPIDocumentForCapabilities(t, nil)

	for _, routePath := range []string{
		"/setWatchCodeEnabled",
		"/setWatchCodeInputs",
	} {
		if document.Paths[routePath] != nil {
			t.Fatalf("expected core watch code route %s to stay absent", routePath)
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

func TestBuildFrontendHTTPOpenAPIDocumentMarksAppSubsystemSDKSurface(t *testing.T) {
	document := buildOpenAPIDocumentForCapabilities(
		t,
		appsubsystemproviders.DiscoveredProviderCapabilities(),
	)

	for _, routePath := range []string{
		httpapi.RouteGetServerMode,
		httpapi.RouteGetAppDefinition,
		httpapi.RouteSetAppDefinition,
		httpapi.RouteValidateAppDefinition,
		httpapi.RouteAppDeployments,
		httpapi.RouteAppDeploymentCurrentSession,
		httpapi.RouteLoadProjectConfig,
		httpapi.RouteGetLatestProjectState,
		httpapi.RouteGetPasswordParamValue,
		httpapi.RouteSetParamEnteredValue,
		httpapi.RouteRunCode,
		httpapi.RouteCheckIfFileExists,
		httpapi.RouteLoadCachedImageArtifacts,
		httpapi.RouteUpdateArtifacts,
		httpapi.RouteDeleteArtifacts,
		httpapi.RouteBinaryUpload,
		httpapi.RouteBinaryDownload,
		httpapi.RouteGetAttachmentDownloadURL,
	} {
		assertOperationHasAppSubsystemSDKScope(t, document, routePath)
	}

	for _, routePath := range []string{
		httpapi.RouteAddKwarg,
		httpapi.RouteAcceptRenameRefactor,
		httpapi.RouteAddLauncherRecentWorkspace,
	} {
		assertOperationDoesNotHaveAppSubsystemSDKScope(t, document, routePath)
	}
}

func buildOpenAPIDocumentForCapabilities(
	t *testing.T,
	providers []plugins.PluginAppSubsystemFeatureManifest,
) *huma.OpenAPI {
	t.Helper()

	document, err := httpapi.BuildFrontendHTTPOpenAPIDocumentWithRegistrationBuilder(
		func(deps httpapi.FrontendAPIRouteDependencies) httpapi.FrontendAPIRouteRegistrations {
			registrations, buildErr := buildOpenAPIDocumentRouteRegistrations(
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

func assertOperationHasAppSubsystemSDKScope(
	t *testing.T,
	document *huma.OpenAPI,
	routePath string,
) {
	t.Helper()

	if !operationHasAppSubsystemSDKScope(document, routePath) {
		t.Fatalf("expected %s to be marked for app-subsystem SDK generation", routePath)
	}
}

func assertOperationDoesNotHaveAppSubsystemSDKScope(
	t *testing.T,
	document *huma.OpenAPI,
	routePath string,
) {
	t.Helper()

	if operationHasAppSubsystemSDKScope(document, routePath) {
		t.Fatalf("expected %s not to be marked for app-subsystem SDK generation", routePath)
	}
}

func operationHasAppSubsystemSDKScope(
	document *huma.OpenAPI,
	routePath string,
) bool {
	pathItem := document.Paths[routePath]
	if pathItem == nil {
		return false
	}
	for _, operation := range []*huma.Operation{
		pathItem.Get,
		pathItem.Post,
		pathItem.Put,
		pathItem.Patch,
		pathItem.Delete,
	} {
		if operation == nil {
			continue
		}
		scopes, ok := operation.Extensions["x-setta-frontend-sdk-scopes"].([]string)
		if !ok {
			continue
		}
		for _, scope := range scopes {
			if scope == httpapi.OpenAPIFrontendSDKScopeAppSubsystem {
				return true
			}
		}
	}
	return false
}
