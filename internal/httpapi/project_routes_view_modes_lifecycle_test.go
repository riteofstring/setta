package httpapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"setta/internal/config"
	"setta/internal/projectstate"
)

func TestRegisterProjectRoutesViewModeAndTopLevelLayoutMutationsPersistLatestState(t *testing.T) {
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

	// Persist an initial layout on the focus mode, then create a new mode that clones it.
	response := post(
		RouteSetTopLevelSectionLayout,
		`{"projectConfigId":"project-alpha","topLevelSections":{"parent-section":{"x":0,"y":0,"zIndex":0},"standalone-section":{"x":180,"y":90,"zIndex":4},"moving-section":{"x":220,"y":120,"zIndex":2}}}`,
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200 from setTopLevelSectionLayout, got %d with body %q", response.Code, response.Body.String())
	}

	createResponse := post(RouteCreateViewMode, `{"projectConfigId":"project-alpha"}`)
	if createResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 from createViewMode, got %d with body %q", createResponse.Code, createResponse.Body.String())
	}

	var createdViewModeID string
	if err := json.Unmarshal(createResponse.Body.Bytes(), &createdViewModeID); err != nil {
		t.Fatalf("decode created view mode id: %v", err)
	}
	if strings.TrimSpace(createdViewModeID) == "" {
		t.Fatal("expected createViewMode to return a view mode id")
	}

	requests := []struct {
		route string
		body  string
	}{
		{
			route: RouteSetTopLevelSectionLayout,
			body:  `{"projectConfigId":"project-alpha","topLevelSections":{"parent-section":{"x":0,"y":0,"zIndex":0},"standalone-section":{"x":460,"y":310,"zIndex":9},"moving-section":{"x":220,"y":120,"zIndex":2}}}`,
		},
		{
			route: RouteSetViewModeName,
			body:  fmt.Sprintf(`{"projectConfigId":"project-alpha","viewModeId":"%s","name":"  Details  "}`, createdViewModeID),
		},
		{
			route: RouteToggleViewModeUserFacing,
			body:  fmt.Sprintf(`{"projectConfigId":"project-alpha","viewModeId":"%s"}`, createdViewModeID),
		},
		{
			route: RouteToggleViewModeTab,
			body:  fmt.Sprintf(`{"projectConfigId":"project-alpha","viewModeId":"%s"}`, createdViewModeID),
		},
		{
			route: RouteToggleSectionVisibility,
			body:  `{"projectConfigId":"project-alpha","sectionIds":["moving-section"]}`,
		},
		{
			route: RouteSetViewModeSortOrder,
			body:  fmt.Sprintf(`{"projectConfigId":"project-alpha","orderedViewModeIds":["%s","focus"]}`, createdViewModeID),
		},
		{
			route: RouteToggleIsEditingViewMode,
			body:  `{"projectConfigId":"project-alpha"}`,
		},
		{
			route: RouteSetActiveViewMode,
			body:  `{"projectConfigId":"project-alpha","activeViewModeId":"focus"}`,
		},
		{
			route: RouteSetActiveViewMode,
			body:  fmt.Sprintf(`{"projectConfigId":"project-alpha","activeViewModeId":"%s"}`, createdViewModeID),
		},
		{
			route: RouteDeleteViewMode,
			body:  `{"projectConfigId":"project-alpha","viewModeId":"focus"}`,
		},
	}

	for _, requestSpec := range requests {
		response := post(requestSpec.route, requestSpec.body)
		if response.Code != http.StatusOK {
			t.Fatalf("expected 200 for %s, got %d with body %q", requestSpec.route, response.Code, response.Body.String())
		}
	}

	latestResponse := post(RouteGetLatestProjectState, `{"projectConfigId":"project-alpha"}`)
	if latestResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 latest-state response, got %d with body %q", latestResponse.Code, latestResponse.Body.String())
	}

	var payload ProjectStateSingleConfigWithCompletedOpIDs
	if err := json.Unmarshal(latestResponse.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode latest project payload: %v", err)
	}
	assertCreatedViewModeOwnsFinalActiveLayout(t, payload, createdViewModeID)
}

func assertCreatedViewModeOwnsFinalActiveLayout(t *testing.T, payload ProjectStateSingleConfigWithCompletedOpIDs, createdViewModeID string) {
	t.Helper()

	if got := derefString(payload.ProjectState.ProjectConfig.ActiveViewModeID); got != createdViewModeID {
		t.Fatalf("expected active view mode %q, got %q", createdViewModeID, got)
	}
	if payload.ProjectState.ProjectConfig.IsEditingViewMode {
		t.Fatal("expected toggleIsEditingViewMode to leave editing mode disabled")
	}
	if len(payload.ProjectState.ProjectConfig.ViewModes) != 1 {
		t.Fatalf("expected one remaining view mode after delete, got %d", len(payload.ProjectState.ProjectConfig.ViewModes))
	}

	viewMode := payload.ProjectState.ProjectConfig.ViewModes[createdViewModeID]
	if viewMode.Name != "Details" {
		t.Fatalf("expected view mode name Details, got %q", viewMode.Name)
	}
	if !viewMode.IsUserFacing {
		t.Fatal("expected created view mode to be user-facing")
	}
	if !viewMode.IsTab {
		t.Fatal("expected created view mode to be a tab")
	}
	if viewMode.SortIndex != 0 {
		t.Fatalf("expected created view mode sort index 0, got %d", viewMode.SortIndex)
	}
	if visible := viewMode.VisibilityBySectionID["moving-section"]; visible {
		t.Fatal("expected moving-section visibility to be toggled off in created view mode")
	}
	if got := viewMode.TopLevelSections["standalone-section"]; got.X != 460 || got.Y != 310 || got.ZIndex != 9 {
		t.Fatalf("unexpected created view mode layout %#v", got)
	}
	if got := payload.ProjectState.ProjectConfig.TopLevelSections["standalone-section"]; got.X != 460 || got.Y != 310 || got.ZIndex != 9 {
		t.Fatalf("unexpected active project layout %#v", got)
	}
}
