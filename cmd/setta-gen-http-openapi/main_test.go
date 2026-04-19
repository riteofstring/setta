package main

import (
	"testing"

	"setta/internal/appsubsystem"
	"setta/internal/config"
	"setta/internal/httpapi"
	"setta/internal/modes"
	appsubsystemplugin "setta/plugins/setta-json-render-app-gen/backend"
)

func TestBuildFrontendHTTPOpenAPIDocumentIncludesDiscoveredAppSubsystemRoutes(
	t *testing.T,
) {
	document, err := httpapi.BuildFrontendHTTPOpenAPIDocumentWithRegistrationBuilder(
		func(deps httpapi.FrontendAPIRouteDependencies) httpapi.FrontendAPIRouteRegistrations {
			registrations, buildErr := appsubsystem.BuildFrontendAPIRouteRegistrations(
				appsubsystem.FrontendRouteRegistrationOptions{
					Capabilities:       openAPIDocumentAppSubsystemCapabilities{},
					ModePolicy:         deps.Project.ModePolicy,
					ProjectState:       deps.Project.ProjectState,
					AppGenSkill:        deps.AppGenSkill,
					ShareDeploymentIDE: deps.ShareDeploymentIDE,
					AppDeployment: httpapi.DeploymentRouteDependencies{
						ModePolicy: modes.NewPolicy(config.ModeApp),
					},
				},
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
				appsubsystemplugin.ProviderPluginID,
				routePath,
			)
		}
	}
}
