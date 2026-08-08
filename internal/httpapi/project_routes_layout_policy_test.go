package httpapi

import (
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	"setta/internal/config"
	"setta/internal/deployments"
	"setta/internal/modes"
	"setta/internal/projectstate"
)

func TestRegisterProjectRoutesLayoutPresentationRejectsDeploymentPolicyWhenLayoutChangesDisallowed(t *testing.T) {
	t.Parallel()

	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
			t.Run("top_level_layout_and_viewport", func(t *testing.T) {
				runDeploymentLayoutPolicyRejectionTopLevelLayoutAndViewport(t, mode)
			})

			t.Run("auto_layout", func(t *testing.T) {
				runDeploymentLayoutPolicyRejectionAutoLayout(t, mode)
			})

			t.Run("section_sizes", func(t *testing.T) {
				runDeploymentLayoutPolicyRejectionSectionSizes(t, mode)
			})

			t.Run("minimize_and_locks", func(t *testing.T) {
				runDeploymentLayoutPolicyRejectionMinimizeAndLocks(t, mode)
			})
		})
	}
}

func newLayoutChangesDisallowedDeploymentRuntime(t *testing.T, mode config.Mode, project projectstate.Project) *deployments.Runtime {
	t.Helper()

	deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
		Mode: mode,
		Document: projectstate.Document{
			SchemaVersion:    projectstate.CurrentSchemaVersion,
			DefaultProjectID: "project-alpha",
			Projects: map[string]projectstate.Project{
				"project-alpha": project,
			},
		},
		Policy: map[string]any{
			"allowLayoutChanges": false,
		},
	})
	if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
		t.Fatalf("create deployment session: %v", err)
	}
	return deploymentRuntime
}

func runRejectedDeploymentLayoutRoute(t *testing.T, handler http.Handler, route string, body string) {
	t.Helper()

	request := httptest.NewRequest(http.MethodPost, "/api"+route, strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set(modes.ShareSessionHeaderName, "share-a")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	assertDeploymentLayoutPolicyForbidden(t, response, route)
}

func assertDeploymentLayoutPolicyForbidden(t *testing.T, response *httptest.ResponseRecorder, route string) {
	t.Helper()

	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for %s, got %d with body %q", route, response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"layout_changes_forbidden"`) {
		t.Fatalf("expected layout_changes_forbidden body, got %q", response.Body.String())
	}
	if !strings.Contains(response.Body.String(), "Deployment policy disallows layout changes.") {
		t.Fatalf("expected deployment layout policy denial, got %q", response.Body.String())
	}
}

func runDeploymentLayoutPolicyRejectionTopLevelLayoutAndViewport(t *testing.T, mode config.Mode) {
	t.Helper()

	deploymentRuntime := newLayoutChangesDisallowedDeploymentRuntime(t, mode, viewModesRouteTestProject(t))
	handler := newProjectRouteDeploymentTestHandler(t, mode, deploymentRuntime)
	for _, requestSpec := range []struct {
		route string
		body  string
	}{
		{
			route: RouteSetTopLevelSectionLayout,
			body:  `{"projectConfigId":"project-alpha","topLevelSections":{"parent-section":{"x":0,"y":0,"zIndex":0},"standalone-section":{"x":460,"y":310,"zIndex":9},"moving-section":{"x":220,"y":120,"zIndex":2}}}`,
		},
		{
			route: RouteSetViewport,
			body:  `{"projectConfigId":"project-alpha","viewport":{"x":42,"y":24,"zoom":1.1}}`,
		},
	} {
		runRejectedDeploymentLayoutRoute(t, handler, requestSpec.route, requestSpec.body)
	}

	overlay, err := deploymentRuntime.Overlay("share-a")
	if err != nil {
		t.Fatalf("deployment overlay: %v", err)
	}
	overlayProject := overlay.Snapshot().Document.Projects["project-alpha"]
	if got := overlayProject.TopLevelSections["standalone-section"]; got.X != 100 || got.Y != 50 || got.ZIndex != 1 {
		t.Fatalf("expected rejected overlay layout unchanged, got %#v", got)
	}
	if overlayProject.Viewport == nil || overlayProject.Viewport.X != 5 || overlayProject.Viewport.Y != 10 || overlayProject.Viewport.Zoom != 0.8 {
		t.Fatalf("expected rejected overlay viewport unchanged, got %#v", overlayProject.Viewport)
	}
}

func runDeploymentLayoutPolicyRejectionAutoLayout(t *testing.T, mode config.Mode) {
	t.Helper()

	deploymentRuntime := newLayoutChangesDisallowedDeploymentRuntime(t, mode, viewModesRouteTestProject(t))
	overlay, err := deploymentRuntime.Overlay("share-a")
	if err != nil {
		t.Fatalf("deployment overlay before rejected auto layout: %v", err)
	}
	before := overlay.Snapshot().Document.Projects["project-alpha"]

	handler := newProjectRouteDeploymentTestHandler(t, mode, deploymentRuntime)
	runRejectedDeploymentLayoutRoute(t, handler, RouteAutoLayoutTopLevelSections, `{"projectConfigId":"project-alpha"}`)

	after := overlay.Snapshot().Document.Projects["project-alpha"]
	if !reflect.DeepEqual(after.TopLevelSections, before.TopLevelSections) {
		t.Fatalf("expected rejected auto layout overlay unchanged, got %#v", after.TopLevelSections)
	}
}

func runDeploymentLayoutPolicyRejectionSectionSizes(t *testing.T, mode config.Mode) {
	t.Helper()

	deploymentRuntime := newLayoutChangesDisallowedDeploymentRuntime(t, mode, sectionSizeRouteTestProject(t))
	handler := newProjectRouteDeploymentTestHandler(t, mode, deploymentRuntime)
	runRejectedDeploymentLayoutRoute(t, handler, RouteSetSectionSizes, `{"projectConfigId":"project-alpha","sectionSizes":{"code-section":{"width":600,"height":120}}}`)

	overlay, err := deploymentRuntime.Overlay("share-a")
	if err != nil {
		t.Fatalf("deployment overlay: %v", err)
	}
	overlayProject := overlay.Snapshot().Document.Projects["project-alpha"]
	overlayCodeVariantID := overlayProject.SectionVariantMap["code-section"]
	overlayCodeImplID := overlayProject.SectionVariants[overlayCodeVariantID].ImplID
	overlayCodePayload := decodeProjectRouteRawObject(t, overlayProject.SectionImpls[overlayCodeImplID].Payload)
	overlayCodeSize := decodeProjectRouteRawObject(t, mustMarshalProjectRouteObject(t, overlayCodePayload["size"].(map[string]any)))
	if got := overlayCodeSize["width"]; got == float64(600) {
		t.Fatalf("expected rejected overlay code-section width unchanged, got %#v", got)
	}
}

func runDeploymentLayoutPolicyRejectionMinimizeAndLocks(t *testing.T, mode config.Mode) {
	t.Helper()

	deploymentRuntime := newLayoutChangesDisallowedDeploymentRuntime(t, mode, layoutPresentationRouteTestProject(t))
	handler := newProjectRouteDeploymentTestHandler(t, mode, deploymentRuntime)
	for _, requestSpec := range []struct {
		route string
		body  string
	}{
		{
			route: RouteToggleMinimized,
			body:  `{"projectConfigId":"project-alpha","sectionId":"callable-section"}`,
		},
		{
			route: RouteTogglePositionLocks,
			body:  `{"projectConfigId":"project-alpha","sectionIds":["callable-section","plain-section"]}`,
		},
	} {
		runRejectedDeploymentLayoutRoute(t, handler, requestSpec.route, requestSpec.body)
	}

	overlay, err := deploymentRuntime.Overlay("share-a")
	if err != nil {
		t.Fatalf("deployment overlay: %v", err)
	}
	overlayProject := overlay.Snapshot().Document.Projects["project-alpha"]
	overlayCallableModifier := decodeProjectRouteRawObject(t, overlayProject.Sections["callable-section"].SharedModifier)
	if len(overlayCallableModifier) != 0 {
		t.Fatalf("expected rejected overlay callable shared modifier unchanged, got %#v", overlayCallableModifier)
	}
	overlayPlainModifier := decodeProjectRouteRawObject(t, overlayProject.Sections["plain-section"].SharedModifier)
	if len(overlayPlainModifier) != 0 {
		t.Fatalf("expected rejected overlay plain shared modifier unchanged, got %#v", overlayPlainModifier)
	}
}
