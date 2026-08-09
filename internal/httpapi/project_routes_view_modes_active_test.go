package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"setta/internal/config"
	"setta/internal/modes"
	"setta/internal/projectstate"
)

func TestRegisterProjectRoutesSetActiveViewModeReturnsNotFoundForUnknownViewMode(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": viewModesRouteTestProject(t),
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, t.TempDir(), nil, nil, nil)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetActiveViewMode,
		strings.NewReader(`{"projectConfigId":"project-alpha","activeViewModeId":"missing-view-mode"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"view_mode_not_found"`) {
		t.Fatalf("expected view_mode_not_found body, got %q", response.Body.String())
	}
}

func TestRegisterProjectRoutesSetActiveViewModeSwapsLayoutAndViewportInIDE(t *testing.T) {
	t.Parallel()

	document, alternateViewModeID := viewModesDeploymentRouteTestDocument(t)
	projectRuntime, err := projectstate.OpenOverlayRuntime(document)
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, t.TempDir(), nil, nil, nil)
	post := func(route string, body string) *httptest.ResponseRecorder {
		t.Helper()

		request := httptest.NewRequest(
			http.MethodPost,
			"/api"+route,
			strings.NewReader(body),
		)
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		return response
	}

	response := post(
		RouteSetActiveViewMode,
		fmt.Sprintf(`{"projectConfigId":"project-alpha","activeViewModeId":"%s"}`, alternateViewModeID),
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	project := projectRuntime.Snapshot().Document.Projects["project-alpha"]
	assertProjectUsesAlternateActiveViewModeLayout(t, project, alternateViewModeID, "runtime")

	latestResponse := post(RouteGetLatestProjectState, `{"projectConfigId":"project-alpha"}`)
	if latestResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 latest-state response, got %d with body %q", latestResponse.Code, latestResponse.Body.String())
	}

	var payload ProjectStateSingleConfigWithCompletedOpIDs
	if err := json.Unmarshal(latestResponse.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode latest project payload: %v", err)
	}
	assertLatestStateUsesAlternateActiveViewModeLayout(t, payload, alternateViewModeID)
}

func assertProjectUsesAlternateActiveViewModeLayout(t *testing.T, project projectstate.Project, alternateViewModeID string, source string) {
	t.Helper()

	if project.ActiveViewModeID != alternateViewModeID {
		t.Fatalf("expected %s active view mode %q, got %q", source, alternateViewModeID, project.ActiveViewModeID)
	}
	if got := project.TopLevelSections["standalone-section"]; got.X != 460 || got.Y != 310 || got.ZIndex != 9 {
		t.Fatalf("expected %s to switch to alternate layout, got %#v", source, got)
	}
	if project.Viewport == nil || project.Viewport.X != 42 || project.Viewport.Y != 24 || project.Viewport.Zoom != 1.1 {
		t.Fatalf("expected %s to switch to alternate viewport, got %#v", source, project.Viewport)
	}
}

func assertLatestStateUsesAlternateActiveViewModeLayout(t *testing.T, payload ProjectStateSingleConfigWithCompletedOpIDs, alternateViewModeID string) {
	t.Helper()

	if got := derefString(payload.ProjectState.ProjectConfig.ActiveViewModeID); got != alternateViewModeID {
		t.Fatalf("expected latest-state active view mode %q, got %q", alternateViewModeID, got)
	}
	if got := payload.ProjectState.ProjectConfig.TopLevelSections["standalone-section"]; got.X != 460 || got.Y != 310 || got.ZIndex != 9 {
		t.Fatalf("expected latest-state active layout to match alternate view mode, got %#v", got)
	}
	if payload.ProjectState.ProjectConfig.Viewport == nil ||
		payload.ProjectState.ProjectConfig.Viewport.X != 42 ||
		payload.ProjectState.ProjectConfig.Viewport.Y != 24 ||
		payload.ProjectState.ProjectConfig.Viewport.Zoom != 1.1 {
		t.Fatalf("expected latest-state active viewport to match alternate view mode, got %#v", payload.ProjectState.ProjectConfig.Viewport)
	}

	viewMode := payload.ProjectState.ProjectConfig.ViewModes[alternateViewModeID]
	if !viewMode.ViewportInitialized {
		t.Fatal("expected alternate view mode viewport to remain initialized")
	}
	if viewMode.Viewport == nil || viewMode.Viewport.X != 42 || viewMode.Viewport.Y != 24 || viewMode.Viewport.Zoom != 1.1 {
		t.Fatalf("expected alternate view mode viewport to stay intact, got %#v", viewMode.Viewport)
	}
}

func TestRegisterProjectRoutesSetActiveViewModeUsesDeploymentOverlayWhenVariantChangesAllowed(t *testing.T) {
	t.Parallel()

	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
			document, alternateViewModeID := viewModesDeploymentRouteTestDocument(t)
			deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
				Mode:     mode,
				Document: document,
				Policy: map[string]any{
					"allowVariantChanges": true,
				},
			})
			if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
				t.Fatalf("create deployment session: %v", err)
			}

			handler := newProjectRouteDeploymentTestHandler(t, mode, deploymentRuntime)
			request := httptest.NewRequest(
				http.MethodPost,
				"/api"+RouteSetActiveViewMode,
				strings.NewReader(fmt.Sprintf(`{"projectConfigId":"project-alpha","activeViewModeId":"%s"}`, alternateViewModeID)),
			)
			request.Header.Set("Content-Type", "application/json")
			request.Header.Set(modes.ShareSessionHeaderName, "share-a")
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			if response.Code != http.StatusOK {
				t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
			}

			overlay, err := deploymentRuntime.Overlay("share-a")
			if err != nil {
				t.Fatalf("deployment overlay: %v", err)
			}
			overlayProject := overlay.Snapshot().Document.Projects["project-alpha"]
			if overlayProject.ActiveViewModeID != alternateViewModeID {
				t.Fatalf("expected overlay active view mode %q, got %q", alternateViewModeID, overlayProject.ActiveViewModeID)
			}
			if got := overlayProject.TopLevelSections["standalone-section"]; got.X != 460 || got.Y != 310 || got.ZIndex != 9 {
				t.Fatalf("expected overlay to switch to alternate layout, got %#v", got)
			}
			if overlayProject.Viewport == nil || overlayProject.Viewport.X != 42 || overlayProject.Viewport.Y != 24 || overlayProject.Viewport.Zoom != 1.1 {
				t.Fatalf("expected overlay to switch to alternate viewport, got %#v", overlayProject.Viewport)
			}

			baseProject := deploymentRuntime.Base().Snapshot().Document.Projects["project-alpha"]
			if baseProject.ActiveViewModeID != "focus" {
				t.Fatalf("expected base deployment project to stay on focus, got %q", baseProject.ActiveViewModeID)
			}
			if got := baseProject.TopLevelSections["standalone-section"]; got.X != 100 || got.Y != 50 || got.ZIndex != 1 {
				t.Fatalf("expected base deployment layout to stay unchanged, got %#v", got)
			}
		})
	}
}

func TestRegisterProjectRoutesSetActiveViewModeRejectsDeploymentPolicyWhenVariantChangesDisallowed(t *testing.T) {
	t.Parallel()

	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
			document, alternateViewModeID := viewModesDeploymentRouteTestDocument(t)
			deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
				Mode:     mode,
				Document: document,
				Policy: map[string]any{
					"allowVariantChanges": false,
				},
			})
			if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
				t.Fatalf("create deployment session: %v", err)
			}

			handler := newProjectRouteDeploymentTestHandler(t, mode, deploymentRuntime)
			request := httptest.NewRequest(
				http.MethodPost,
				"/api"+RouteSetActiveViewMode,
				strings.NewReader(fmt.Sprintf(`{"projectConfigId":"project-alpha","activeViewModeId":"%s"}`, alternateViewModeID)),
			)
			request.Header.Set("Content-Type", "application/json")
			request.Header.Set(modes.ShareSessionHeaderName, "share-a")
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			if response.Code != http.StatusForbidden {
				t.Fatalf("expected 403, got %d with body %q", response.Code, response.Body.String())
			}
			if !strings.Contains(response.Body.String(), `"code":"variant_changes_forbidden"`) {
				t.Fatalf("expected variant_changes_forbidden body, got %q", response.Body.String())
			}
			if !strings.Contains(response.Body.String(), "Deployment policy disallows variant changes.") {
				t.Fatalf("expected deployment variant policy denial, got %q", response.Body.String())
			}

			overlay, err := deploymentRuntime.Overlay("share-a")
			if err != nil {
				t.Fatalf("deployment overlay: %v", err)
			}
			overlayProject := overlay.Snapshot().Document.Projects["project-alpha"]
			if overlayProject.ActiveViewModeID != "focus" {
				t.Fatalf("expected rejected mutation to keep focus active, got %q", overlayProject.ActiveViewModeID)
			}
		})
	}
}

func TestRegisterProjectRoutesToggleSectionVisibilityReturnsNotFoundForUnknownSection(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": viewModesRouteTestProject(t),
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, t.TempDir(), nil, nil, nil)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteToggleSectionVisibility,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionIds":["missing-section"]}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"section_not_found"`) {
		t.Fatalf("expected section_not_found body, got %q", response.Body.String())
	}
}

func TestRegisterProjectRoutesSetViewModeNameReturns422ForInvalidName(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": viewModesRouteTestProject(t),
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, t.TempDir(), nil, nil, nil)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetViewModeName,
		strings.NewReader(`{"projectConfigId":"project-alpha","viewModeId":"focus","name":"settings"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"detail":"View mode name 'settings' is reserved."`) {
		t.Fatalf("expected invalid view mode detail body, got %q", response.Body.String())
	}
}

func TestRegisterProjectRoutesSetViewModeSortOrderReturns422ForDuplicateIDs(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": viewModesRouteTestProject(t),
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	if _, _, err := projectRuntime.CreateViewMode(context.Background(), "project-alpha"); err != nil {
		t.Fatalf("seed second view mode: %v", err)
	}

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, t.TempDir(), nil, nil, nil)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetViewModeSortOrder,
		strings.NewReader(`{"projectConfigId":"project-alpha","orderedViewModeIds":["focus","focus"]}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"invalid_view_mode_sort_order"`) {
		t.Fatalf("expected invalid_view_mode_sort_order body, got %q", response.Body.String())
	}
}

func TestRegisterProjectRoutesSetViewModeSortOrderReturns404ForUnknownViewMode(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": viewModesRouteTestProject(t),
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	if _, _, err := projectRuntime.CreateViewMode(context.Background(), "project-alpha"); err != nil {
		t.Fatalf("seed second view mode: %v", err)
	}

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, t.TempDir(), nil, nil, nil)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetViewModeSortOrder,
		strings.NewReader(`{"projectConfigId":"project-alpha","orderedViewModeIds":["focus","missing-view-mode"]}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"view_mode_not_found"`) {
		t.Fatalf("expected view_mode_not_found body, got %q", response.Body.String())
	}
}
