package httpapi

import (
	"net/http"
	"testing"

	"github.com/go-chi/chi/v5"
)

const (
	testContributedProjectRoutePath    = "/testContributedProjectRoute"
	testContributedProjectOperationID  = "testContributedProjectRoute"
	testContributedDeploymentRoutePath = "/testContributedDeploymentRoute"
	testContributedDeploymentOperation = "testContributedDeploymentRoute"
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
		"/setWatchCodeEnabled",
		"/setWatchCodeInputs",
	} {
		if document.Paths[routePath] != nil {
			t.Fatalf("expected %s to stay absent without frontend route contributions", routePath)
		}
	}
}

func buildContributedRouteRegistrationsForTest(
	_ FrontendAPIRouteDependencies,
) FrontendAPIRouteRegistrations {
	return FrontendAPIRouteRegistrations{
		Project: []FrontendAPIRouteContribution{
			{
				Family: "test contributed project",
				Register: func(router chi.Router) error {
					RegisterOpenAPIGet[openAPIJSONNull](
						router,
						testContributedProjectOperationID,
						testContributedProjectRoutePath,
						func(w http.ResponseWriter, r *http.Request) {
							WriteJSON(w, 200, nil)
						},
						WithOpenAPITags("Contributed Test"),
					)
					return nil
				},
			},
		},
		Deployment: []FrontendAPIRouteContribution{
			{
				Family: "test contributed deployment",
				Register: func(router chi.Router) error {
					RegisterOpenAPIPostNoRequest[openAPIJSONNull](
						router,
						testContributedDeploymentOperation,
						testContributedDeploymentRoutePath,
						func(w http.ResponseWriter, r *http.Request) {
							WriteJSON(w, 200, nil)
						},
						WithOpenAPITags("Contributed Test"),
					)
					return nil
				},
			},
		},
	}
}

func TestFrontendRouteRegistrationsRestoreContributedRoutes(t *testing.T) {
	deps, err := newOpenAPIDocumentRouteDependencies[FrontendAPIRouteDependencies](frontendOpenAPIDocumentModeOverrides)
	if err != nil {
		t.Fatalf("build openapi deps: %v", err)
	}
	deps.Plugin = nil

	document := newOpenAPIDocument()
	router := wrapRouterWithOpenAPIDocumentOnly(chi.NewRouter(), document)
	registrations := buildContributedRouteRegistrationsForTest(deps)
	if len(registrations.Project) != 1 {
		t.Fatalf("expected one project contribution, got %#v", registrations.Project)
	}
	if len(registrations.Deployment) != 1 {
		t.Fatalf("expected one deployment contribution, got %#v", registrations.Deployment)
	}
	if registrations.Project[0].Family != "test contributed project" {
		t.Fatalf("unexpected project contribution family %#v", registrations.Project)
	}
	if registrations.Deployment[0].Family != "test contributed deployment" {
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
		testContributedProjectRoutePath,
		testContributedDeploymentRoutePath,
	} {
		if document.Paths[routePath] == nil {
			t.Fatalf("expected %s to be restored through contributed route registrations", routePath)
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
		"/setWatchCodeEnabled",
		"/setWatchCodeInputs",
	} {
		if document.Paths[routePath] != nil {
			t.Fatalf("expected %s to stay absent without app subsystem registration builder", routePath)
		}
	}
}

func TestBuildFrontendHTTPOpenAPIDocumentIncludesContributedRoutes(t *testing.T) {
	document, err := BuildFrontendHTTPOpenAPIDocumentWithRegistrationBuilder(
		buildContributedRouteRegistrationsForTest,
	)
	if err != nil {
		t.Fatalf("build frontend openapi document: %v", err)
	}

	for _, routePath := range []string{
		testContributedProjectRoutePath,
		testContributedDeploymentRoutePath,
	} {
		if document.Paths[routePath] == nil {
			t.Fatalf("expected %s in frontend openapi document", routePath)
		}
	}
}
