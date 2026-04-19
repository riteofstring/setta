package httpapi

import (
	"testing"

	"github.com/go-chi/chi/v5"
)

func TestRegisterFrontendAPIRoutesLeavesAppSubsystemRoutesOutWithoutContributions(t *testing.T) {
	deps, err := newOpenAPIDocumentRouteDependencies[FrontendAPIRouteDependencies](frontendOpenAPIDocumentModeOverrides)
	if err != nil {
		t.Fatalf("build openapi deps: %v", err)
	}
	deps.Plugin = nil

	document := newOpenAPIDocument()
	router := wrapRouterWithOpenAPIDocumentOnly(chi.NewRouter(), document)
	if err := RegisterFrontendAPIRoutes(router, deps, FrontendAPIRouteRegistrations{}); err != nil {
		t.Fatalf("register frontend api routes without contributions: %v", err)
	}

	for _, routePath := range []string{
		RouteShareDeployments,
		RouteShareDeploymentVersions,
		RouteShareDeploymentLatest,
	} {
		if document.Paths[routePath] == nil {
			t.Fatalf("expected %s to stay present without app subsystem contributions", routePath)
		}
	}

	for _, routePath := range []string{
		RouteGetAppDefinition,
		RouteSetAppDefinition,
		RouteValidateAppDefinition,
		RouteGetAppGenSkills,
		RouteGetAppGenSkillContent,
		RouteUpsertAppGenCustomSkill,
		RouteAppDeployments,
		RouteAppDeploymentVersions,
		RouteAppDeploymentLatest,
		RouteAppDeploymentCurrentSession,
		RouteAppDeploymentProjectConfig,
		RouteAppDeploymentState,
	} {
		if document.Paths[routePath] != nil {
			t.Fatalf("expected %s to stay absent without app subsystem contributions", routePath)
		}
	}
}

func buildAppSubsystemRegistrationsForTest(
	deps FrontendAPIRouteDependencies,
) FrontendAPIRouteRegistrations {
	return FrontendAPIRouteRegistrations{
		Project: []FrontendAPIRouteContribution{
			{
				Family: "app definition",
				Register: func(router chi.Router) error {
					return RegisterAppDefinitionRoutes(router, deps.AppDefinition)
				},
			},
			{
				Family: "app generation skill",
				Register: func(router chi.Router) error {
					return RegisterAppGenSkillRoutes(router, deps.AppGenSkill)
				},
			},
		},
		Deployment: []FrontendAPIRouteContribution{
			{
				Family: "app deployment",
				Register: func(router chi.Router) error {
					return RegisterAppDeploymentRoutes(router, deps.AppDeployment)
				},
			},
			{
				Family: "app deployment ide",
				Register: func(router chi.Router) error {
					return RegisterAppDeploymentIDERoutes(router, deps.DeploymentIDE)
				},
			},
		},
	}
}

func TestAppSubsystemFrontendRouteRegistrationsRestoreFrozenRoutes(t *testing.T) {
	deps, err := newOpenAPIDocumentRouteDependencies[FrontendAPIRouteDependencies](frontendOpenAPIDocumentModeOverrides)
	if err != nil {
		t.Fatalf("build openapi deps: %v", err)
	}
	deps.Plugin = nil

	document := newOpenAPIDocument()
	router := wrapRouterWithOpenAPIDocumentOnly(chi.NewRouter(), document)
	registrations := buildAppSubsystemRegistrationsForTest(deps)
	if len(registrations.Project) != 2 {
		t.Fatalf("expected two project contributions, got %#v", registrations.Project)
	}
	if len(registrations.Deployment) != 2 {
		t.Fatalf("expected two deployment contributions, got %#v", registrations.Deployment)
	}
	if registrations.Project[0].Family != "app definition" || registrations.Project[1].Family != "app generation skill" {
		t.Fatalf("unexpected project contribution family %#v", registrations.Project)
	}
	if registrations.Deployment[0].Family != "app deployment" || registrations.Deployment[1].Family != "app deployment ide" {
		t.Fatalf("unexpected deployment contribution families %#v", registrations.Deployment)
	}
	if err := RegisterFrontendAPIRoutes(router, deps, registrations); err != nil {
		t.Fatalf("register frontend api routes with app subsystem contributions: %v", err)
	}

	for _, routePath := range []string{
		RouteShareDeployments,
		RouteShareDeploymentVersions,
		RouteShareDeploymentLatest,
	} {
		if document.Paths[routePath] == nil {
			t.Fatalf("expected %s to remain available alongside app subsystem contributions", routePath)
		}
	}

	for _, routePath := range []string{
		RouteGetAppDefinition,
		RouteSetAppDefinition,
		RouteValidateAppDefinition,
		RouteGetAppGenSkills,
		RouteGetAppGenSkillContent,
		RouteUpsertAppGenCustomSkill,
		RouteAppDeployments,
		RouteAppDeploymentVersions,
		RouteAppDeploymentLatest,
		RouteAppDeploymentCurrentSession,
		RouteAppDeploymentProjectConfig,
		RouteAppDeploymentState,
	} {
		if document.Paths[routePath] == nil {
			t.Fatalf("expected %s to be restored through app subsystem contributions", routePath)
		}
	}
}

func TestBuildFrontendHTTPOpenAPIDocumentLeavesAppSubsystemRoutesOutWithoutRegistrations(t *testing.T) {
	document, err := BuildFrontendHTTPOpenAPIDocument()
	if err != nil {
		t.Fatalf("build frontend openapi document: %v", err)
	}

	for _, routePath := range []string{
		RouteGetAppDefinition,
		RouteSetAppDefinition,
		RouteValidateAppDefinition,
		RouteGetAppGenSkills,
		RouteGetAppGenSkillContent,
		RouteUpsertAppGenCustomSkill,
		RouteAppDeployments,
		RouteAppDeploymentVersions,
		RouteAppDeploymentLatest,
		RouteAppDeploymentCurrentSession,
		RouteAppDeploymentProjectConfig,
		RouteAppDeploymentState,
	} {
		if document.Paths[routePath] != nil {
			t.Fatalf("expected %s to stay absent without app subsystem registration builder", routePath)
		}
	}
}

func TestBuildFrontendHTTPOpenAPIDocumentIncludesAppSubsystemRouteContributions(t *testing.T) {
	document, err := BuildFrontendHTTPOpenAPIDocumentWithRegistrationBuilder(
		buildAppSubsystemRegistrationsForTest,
	)
	if err != nil {
		t.Fatalf("build frontend openapi document: %v", err)
	}

	for _, routePath := range []string{
		RouteGetAppDefinition,
		RouteSetAppDefinition,
		RouteValidateAppDefinition,
		RouteGetAppGenSkills,
		RouteGetAppGenSkillContent,
		RouteUpsertAppGenCustomSkill,
		RouteAppDeployments,
		RouteAppDeploymentVersions,
		RouteAppDeploymentLatest,
		RouteAppDeploymentCurrentSession,
		RouteAppDeploymentProjectConfig,
		RouteAppDeploymentState,
	} {
		if document.Paths[routePath] == nil {
			t.Fatalf("expected %s in frontend openapi document", routePath)
		}
	}
}
