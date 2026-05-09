package httpapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	"setta/internal/config"
	"setta/internal/modes"
	"setta/internal/projectstate"
)

func TestRegisterProjectRoutesLayoutPresentationMutationsProjectLatestState(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": layoutPresentationRouteTestProject(t),
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

	requests := []struct {
		route string
		body  string
	}{
		{
			route: RouteSetShowParamDisplayNames,
			body:  `{"projectConfigId":"project-alpha","showParamDisplayNames":true}`,
		},
		{
			route: RouteSetActiveIDs,
			body:  `{"projectConfigId":"project-alpha","activeIds":["callable-section"]}`,
		},
		{
			route: RouteSetViewport,
			body:  `{"projectConfigId":"project-alpha","viewport":{"x":1.25,"y":2.5,"zoom":0.9}}`,
		},
		{
			route: RouteSetSectionTagColor,
			body:  `{"projectConfigId":"project-alpha","sectionId":"callable-section","tagColor":"#123456"}`,
		},
		{
			route: RouteSetSectionStyleColor,
			body:  `{"projectConfigId":"project-alpha","sectionId":"callable-section","styleColor":"#654321"}`,
		},
		{
			route: RouteSetGroupOverflowMode,
			body:  `{"projectConfigId":"project-alpha","sectionId":"group-section","overflowMode":true}`,
		},
		{
			route: RouteSetSectionColumnWidth,
			body:  `{"projectConfigId":"project-alpha","sectionId":"callable-section","columnWidth":248.5}`,
		},
		{
			route: RouteSetCallableHideParams,
			body:  `{"projectConfigId":"project-alpha","sectionId":"callable-section","hideParams":true}`,
		},
		{
			route: RouteSetSectionHideUnpinnedParams,
			body:  `{"projectConfigId":"project-alpha","sectionId":"callable-section","hideUnpinnedParams":true}`,
		},
		{
			route: RouteSetSectionPinnedParams,
			body:  `{"projectConfigId":"project-alpha","sectionId":"callable-section","pinnedParams":["param-a","param-b"]}`,
		},
		{
			route: RouteToggleMinimized,
			body:  `{"projectConfigId":"project-alpha","sectionId":"callable-section"}`,
		},
		{
			route: RouteTogglePositionLocks,
			body:  `{"projectConfigId":"project-alpha","sectionIds":["callable-section","plain-section"]}`,
		},
	}

	for _, requestSpec := range requests {
		request := httptest.NewRequest(
			http.MethodPost,
			"/api"+requestSpec.route,
			strings.NewReader(requestSpec.body),
		)
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusOK {
			t.Fatalf("expected 200 for %s, got %d with body %q", requestSpec.route, response.Code, response.Body.String())
		}
	}

	latestRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetLatestProjectState,
		strings.NewReader(`{"projectConfigId":"project-alpha"}`),
	)
	latestRequest.Header.Set("Content-Type", "application/json")
	latestResponse := httptest.NewRecorder()
	handler.ServeHTTP(latestResponse, latestRequest)
	if latestResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 latest-state response, got %d with body %q", latestResponse.Code, latestResponse.Body.String())
	}

	var payload ProjectStateSingleConfigWithCompletedOpIDs
	if err := json.Unmarshal(latestResponse.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode latest project payload: %v", err)
	}

	if !payload.ProjectState.ProjectConfig.ShowParamDisplayNames {
		t.Fatal("expected ShowParamDisplayNames=true")
	}
	if !reflect.DeepEqual(payload.ProjectState.ProjectConfig.ActiveIDs, []string{"callable-section"}) {
		t.Fatalf("expected active ids [callable-section], got %#v", payload.ProjectState.ProjectConfig.ActiveIDs)
	}
	if payload.ProjectState.ProjectConfig.Viewport == nil {
		t.Fatal("expected projected viewport")
	}
	if payload.ProjectState.ProjectConfig.Viewport.X != 1.25 || payload.ProjectState.ProjectConfig.Viewport.Y != 2.5 || payload.ProjectState.ProjectConfig.Viewport.Zoom != 0.9 {
		t.Fatalf("unexpected projected viewport %#v", payload.ProjectState.ProjectConfig.Viewport)
	}
	viewMode := payload.ProjectState.ProjectConfig.ViewModes["focus"]
	if viewMode.Viewport == nil || viewMode.Viewport.X != 1.25 || viewMode.Viewport.Y != 2.5 || viewMode.Viewport.Zoom != 0.9 {
		t.Fatalf("unexpected active view mode viewport %#v", viewMode.Viewport)
	}
	if !viewMode.ViewportInitialized {
		t.Fatal("expected active view mode viewport initialized")
	}

	callableSection := payload.ProjectState.Sections["callable-section"]
	callableSharedModifier := decodeProjectRouteRawObject(t, callableSection.SharedModifier)
	if got := callableSharedModifier["tagColor"]; got != "#123456" {
		t.Fatalf("expected tagColor #123456, got %#v", got)
	}
	if got := callableSharedModifier["styleColor"]; got != "#654321" {
		t.Fatalf("expected styleColor #654321, got %#v", got)
	}
	if got := callableSharedModifier["columnWidth"]; got != 248.5 {
		t.Fatalf("expected columnWidth 248.5, got %#v", got)
	}
	if got := callableSharedModifier["hideParams"]; got != true {
		t.Fatalf("expected hideParams=true, got %#v", got)
	}
	if got := callableSharedModifier["hideUnpinnedParams"]; got != true {
		t.Fatalf("expected hideUnpinnedParams=true, got %#v", got)
	}
	if got := callableSharedModifier["isMinimized"]; got != true {
		t.Fatalf("expected isMinimized=true, got %#v", got)
	}
	if got := callableSharedModifier["positionAndSizeLocked"]; got != true {
		t.Fatalf("expected positionAndSizeLocked=true, got %#v", got)
	}
	if got := decodeProjectRouteStringArray(callableSharedModifier["pinnedParams"]); !reflect.DeepEqual(got, []string{"param-a", "param-b"}) {
		t.Fatalf("expected pinned params [param-a param-b], got %#v", got)
	}

	plainSharedModifier := decodeProjectRouteRawObject(t, payload.ProjectState.Sections["plain-section"].SharedModifier)
	if got := plainSharedModifier["positionAndSizeLocked"]; got != true {
		t.Fatalf("expected plain section position lock=true, got %#v", got)
	}

	groupSharedModifier := decodeProjectRouteRawObject(t, payload.ProjectState.Sections["group-section"].SharedModifier)
	if got := groupSharedModifier["overflowMode"]; got != true {
		t.Fatalf("expected group overflowMode=true, got %#v", got)
	}
}

func TestRegisterProjectRoutesLayoutChromeUsesDeploymentOverlayWhenLayoutChangesAllowed(t *testing.T) {
	t.Parallel()

	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
			t.Run("layout_presentation", func(t *testing.T) {
				deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
					Mode: mode,
					Document: projectstate.Document{
						SchemaVersion:    projectstate.CurrentSchemaVersion,
						DefaultProjectID: "project-alpha",
						Projects: map[string]projectstate.Project{
							"project-alpha": layoutPresentationRouteTestProject(t),
						},
					},
					Policy: map[string]any{
						"allowLayoutChanges": true,
					},
				})
				if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
					t.Fatalf("create deployment session: %v", err)
				}

				handler := newProjectRouteDeploymentTestHandler(t, mode, deploymentRuntime)
				post := func(route string, body string) *httptest.ResponseRecorder {
					t.Helper()
					request := httptest.NewRequest(http.MethodPost, "/api"+route, strings.NewReader(body))
					request.Header.Set("Content-Type", "application/json")
					request.Header.Set(modes.ShareSessionHeaderName, "share-a")
					response := httptest.NewRecorder()
					handler.ServeHTTP(response, request)
					return response
				}

				for _, requestSpec := range []struct {
					route string
					body  string
				}{
					{
						route: RouteSetShowParamDisplayNames,
						body:  `{"projectConfigId":"project-alpha","showParamDisplayNames":true}`,
					},
					{
						route: RouteSetSectionTagColor,
						body:  `{"projectConfigId":"project-alpha","sectionId":"callable-section","tagColor":"#123456"}`,
					},
					{
						route: RouteSetSectionStyleColor,
						body:  `{"projectConfigId":"project-alpha","sectionId":"callable-section","styleColor":"#654321"}`,
					},
					{
						route: RouteSetSectionColumnWidth,
						body:  `{"projectConfigId":"project-alpha","sectionId":"callable-section","columnWidth":248.5}`,
					},
					{
						route: RouteSetCallableHideParams,
						body:  `{"projectConfigId":"project-alpha","sectionId":"callable-section","hideParams":true}`,
					},
					{
						route: RouteSetSectionHideUnpinnedParams,
						body:  `{"projectConfigId":"project-alpha","sectionId":"callable-section","hideUnpinnedParams":true}`,
					},
					{
						route: RouteSetSectionPinnedParams,
						body:  `{"projectConfigId":"project-alpha","sectionId":"callable-section","pinnedParams":["param-a","param-b"]}`,
					},
				} {
					response := post(requestSpec.route, requestSpec.body)
					if response.Code != http.StatusOK {
						t.Fatalf("expected 200 for %s, got %d with body %q", requestSpec.route, response.Code, response.Body.String())
					}
				}

				overlay, err := deploymentRuntime.Overlay("share-a")
				if err != nil {
					t.Fatalf("deployment overlay: %v", err)
				}
				overlayProject := overlay.Snapshot().Document.Projects["project-alpha"]
				if !overlayProject.ShowParamDisplayNames {
					t.Fatal("expected overlay ShowParamDisplayNames=true")
				}
				overlayCallableModifier := decodeProjectRouteRawObject(t, overlayProject.Sections["callable-section"].SharedModifier)
				if got := overlayCallableModifier["tagColor"]; got != "#123456" {
					t.Fatalf("expected overlay tagColor #123456, got %#v", got)
				}
				if got := overlayCallableModifier["styleColor"]; got != "#654321" {
					t.Fatalf("expected overlay styleColor #654321, got %#v", got)
				}
				if got := overlayCallableModifier["columnWidth"]; got != 248.5 {
					t.Fatalf("expected overlay columnWidth 248.5, got %#v", got)
				}
				if got := overlayCallableModifier["hideParams"]; got != true {
					t.Fatalf("expected overlay hideParams=true, got %#v", got)
				}
				if got := overlayCallableModifier["hideUnpinnedParams"]; got != true {
					t.Fatalf("expected overlay hideUnpinnedParams=true, got %#v", got)
				}
				if got := decodeProjectRouteStringArray(overlayCallableModifier["pinnedParams"]); !reflect.DeepEqual(got, []string{"param-a", "param-b"}) {
					t.Fatalf("expected overlay pinnedParams [param-a param-b], got %#v", got)
				}

				baseProject := deploymentRuntime.Base().Snapshot().Document.Projects["project-alpha"]
				if baseProject.ShowParamDisplayNames {
					t.Fatal("expected base ShowParamDisplayNames to remain false")
				}
				baseCallableModifier := decodeProjectRouteRawObject(t, baseProject.Sections["callable-section"].SharedModifier)
				if got := baseCallableModifier["tagColor"]; got == "#123456" {
					t.Fatalf("expected base tagColor to remain unchanged, got %#v", got)
				}
				if got := baseCallableModifier["styleColor"]; got == "#654321" {
					t.Fatalf("expected base styleColor to remain unchanged, got %#v", got)
				}
				if got := baseCallableModifier["columnWidth"]; got == 248.5 {
					t.Fatalf("expected base columnWidth to remain unchanged, got %#v", got)
				}
				if got := baseCallableModifier["hideParams"]; got == true {
					t.Fatalf("expected base hideParams to remain unchanged, got %#v", got)
				}
				if got := baseCallableModifier["hideUnpinnedParams"]; got == true {
					t.Fatalf("expected base hideUnpinnedParams to remain unchanged, got %#v", got)
				}
				if got := decodeProjectRouteStringArray(baseCallableModifier["pinnedParams"]); len(got) != 0 {
					t.Fatalf("expected base pinnedParams to remain empty, got %#v", got)
				}
			})

			t.Run("param_filter", func(t *testing.T) {
				deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
					Mode: mode,
					Document: projectstate.Document{
						SchemaVersion:    projectstate.CurrentSchemaVersion,
						DefaultProjectID: "project-alpha",
						Projects: map[string]projectstate.Project{
							"project-alpha": sectionFilterMetaControlRouteTestProject(t),
						},
					},
					Policy: map[string]any{
						"allowLayoutChanges": true,
					},
				})
				if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
					t.Fatalf("create deployment session: %v", err)
				}

				handler := newProjectRouteDeploymentTestHandler(t, mode, deploymentRuntime)
				request := httptest.NewRequest(
					http.MethodPost,
					"/api"+RouteSetSectionParamFilter,
					strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"params-section","value":"   "}`),
				)
				request.Header.Set("Content-Type", "application/json")
				request.Header.Set(modes.ShareSessionHeaderName, "share-a")
				response := httptest.NewRecorder()
				handler.ServeHTTP(response, request)
				if response.Code != http.StatusOK {
					t.Fatalf("expected 200 for %s, got %d with body %q", RouteSetSectionParamFilter, response.Code, response.Body.String())
				}

				overlay, err := deploymentRuntime.Overlay("share-a")
				if err != nil {
					t.Fatalf("deployment overlay: %v", err)
				}
				overlayProject := overlay.Snapshot().Document.Projects["project-alpha"]
				overlayParamsModifier := decodeProjectRouteRawObject(t, overlayProject.Sections["params-section"].SharedModifier)
				if got := overlayParamsModifier["paramFilter"]; got != "   " {
					t.Fatalf("expected overlay paramFilter whitespace to persist, got %#v", got)
				}

				baseProject := deploymentRuntime.Base().Snapshot().Document.Projects["project-alpha"]
				baseParamsModifier := decodeProjectRouteRawObject(t, baseProject.Sections["params-section"].SharedModifier)
				if got := baseParamsModifier["paramFilter"]; got == "   " {
					t.Fatalf("expected base paramFilter to remain unchanged, got %#v", got)
				}
			})
		})
	}
}

func TestRegisterProjectRoutesLayoutChromeRejectsDeploymentPolicyWhenLayoutChangesDisallowed(t *testing.T) {
	t.Parallel()

	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
			t.Run("layout_presentation", func(t *testing.T) {
				deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
					Mode: mode,
					Document: projectstate.Document{
						SchemaVersion:    projectstate.CurrentSchemaVersion,
						DefaultProjectID: "project-alpha",
						Projects: map[string]projectstate.Project{
							"project-alpha": layoutPresentationRouteTestProject(t),
						},
					},
					Policy: map[string]any{
						"allowLayoutChanges": false,
					},
				})
				if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
					t.Fatalf("create deployment session: %v", err)
				}

				handler := newProjectRouteDeploymentTestHandler(t, mode, deploymentRuntime)
				post := func(route string, body string) *httptest.ResponseRecorder {
					t.Helper()
					request := httptest.NewRequest(http.MethodPost, "/api"+route, strings.NewReader(body))
					request.Header.Set("Content-Type", "application/json")
					request.Header.Set(modes.ShareSessionHeaderName, "share-a")
					response := httptest.NewRecorder()
					handler.ServeHTTP(response, request)
					return response
				}

				for _, requestSpec := range []struct {
					route string
					body  string
				}{
					{
						route: RouteSetShowParamDisplayNames,
						body:  `{"projectConfigId":"project-alpha","showParamDisplayNames":true}`,
					},
					{
						route: RouteSetSectionTagColor,
						body:  `{"projectConfigId":"project-alpha","sectionId":"callable-section","tagColor":"#123456"}`,
					},
					{
						route: RouteSetSectionStyleColor,
						body:  `{"projectConfigId":"project-alpha","sectionId":"callable-section","styleColor":"#654321"}`,
					},
					{
						route: RouteSetSectionColumnWidth,
						body:  `{"projectConfigId":"project-alpha","sectionId":"callable-section","columnWidth":248.5}`,
					},
					{
						route: RouteSetCallableHideParams,
						body:  `{"projectConfigId":"project-alpha","sectionId":"callable-section","hideParams":true}`,
					},
					{
						route: RouteSetSectionHideUnpinnedParams,
						body:  `{"projectConfigId":"project-alpha","sectionId":"callable-section","hideUnpinnedParams":true}`,
					},
					{
						route: RouteSetSectionPinnedParams,
						body:  `{"projectConfigId":"project-alpha","sectionId":"callable-section","pinnedParams":["param-a","param-b"]}`,
					},
				} {
					response := post(requestSpec.route, requestSpec.body)
					if response.Code != http.StatusForbidden {
						t.Fatalf("expected 403 for %s, got %d with body %q", requestSpec.route, response.Code, response.Body.String())
					}
					if !strings.Contains(response.Body.String(), `"code":"layout_changes_forbidden"`) {
						t.Fatalf("expected layout_changes_forbidden body, got %q", response.Body.String())
					}
					if !strings.Contains(response.Body.String(), "Deployment policy disallows layout changes.") {
						t.Fatalf("expected deployment layout policy denial, got %q", response.Body.String())
					}
				}

				overlay, err := deploymentRuntime.Overlay("share-a")
				if err != nil {
					t.Fatalf("deployment overlay: %v", err)
				}
				overlayProject := overlay.Snapshot().Document.Projects["project-alpha"]
				if overlayProject.ShowParamDisplayNames {
					t.Fatal("expected rejected mutations to keep overlay ShowParamDisplayNames false")
				}
				overlayCallableModifier := decodeProjectRouteRawObject(t, overlayProject.Sections["callable-section"].SharedModifier)
				if len(overlayCallableModifier) != 0 {
					t.Fatalf("expected rejected mutations to keep overlay callable shared modifier empty, got %#v", overlayCallableModifier)
				}
			})

			t.Run("param_filter", func(t *testing.T) {
				deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
					Mode: mode,
					Document: projectstate.Document{
						SchemaVersion:    projectstate.CurrentSchemaVersion,
						DefaultProjectID: "project-alpha",
						Projects: map[string]projectstate.Project{
							"project-alpha": sectionFilterMetaControlRouteTestProject(t),
						},
					},
					Policy: map[string]any{
						"allowLayoutChanges": false,
					},
				})
				if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
					t.Fatalf("create deployment session: %v", err)
				}

				handler := newProjectRouteDeploymentTestHandler(t, mode, deploymentRuntime)
				request := httptest.NewRequest(
					http.MethodPost,
					"/api"+RouteSetSectionParamFilter,
					strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"params-section","value":"   "}`),
				)
				request.Header.Set("Content-Type", "application/json")
				request.Header.Set(modes.ShareSessionHeaderName, "share-a")
				response := httptest.NewRecorder()
				handler.ServeHTTP(response, request)
				if response.Code != http.StatusForbidden {
					t.Fatalf("expected 403 for %s, got %d with body %q", RouteSetSectionParamFilter, response.Code, response.Body.String())
				}
				if !strings.Contains(response.Body.String(), `"code":"layout_changes_forbidden"`) {
					t.Fatalf("expected layout_changes_forbidden body, got %q", response.Body.String())
				}
				if !strings.Contains(response.Body.String(), "Deployment policy disallows layout changes.") {
					t.Fatalf("expected deployment layout policy denial, got %q", response.Body.String())
				}

				overlay, err := deploymentRuntime.Overlay("share-a")
				if err != nil {
					t.Fatalf("deployment overlay: %v", err)
				}
				overlayProject := overlay.Snapshot().Document.Projects["project-alpha"]
				overlayParamsModifier := decodeProjectRouteRawObject(t, overlayProject.Sections["params-section"].SharedModifier)
				if len(overlayParamsModifier) != 0 {
					t.Fatalf("expected rejected param filter mutation to keep overlay params shared modifier empty, got %#v", overlayParamsModifier)
				}
			})
		})
	}
}

func TestRegisterProjectRoutesMetaControlShowSectionTitleAndGroupOverflowRemainIDeOnlyInDeployment(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name    string
		project func(*testing.T) projectstate.Project
		route   string
		body    string
	}{
		{
			name:    "meta control title",
			project: sectionFilterMetaControlRouteTestProject,
			route:   RouteSetMetaControlShowSectionTitle,
			body:    `{"projectConfigId":"project-alpha","sectionId":"meta-section","showSectionTitle":true}`,
		},
		{
			name:    "group overflow",
			project: layoutPresentationRouteTestProject,
			route:   RouteSetGroupOverflowMode,
			body:    `{"projectConfigId":"project-alpha","sectionId":"group-section","overflowMode":true}`,
		},
	}

	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
			for _, tc := range testCases {
				t.Run(tc.name, func(t *testing.T) {
					deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
						Mode: mode,
						Document: projectstate.Document{
							SchemaVersion:    projectstate.CurrentSchemaVersion,
							DefaultProjectID: "project-alpha",
							Projects: map[string]projectstate.Project{
								"project-alpha": tc.project(t),
							},
						},
						Policy: map[string]any{
							"allowLayoutChanges": true,
						},
					})
					if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
						t.Fatalf("create deployment session: %v", err)
					}

					handler := newProjectRouteDeploymentTestHandler(t, mode, deploymentRuntime)
					request := httptest.NewRequest(http.MethodPost, "/api"+tc.route, strings.NewReader(tc.body))
					request.Header.Set("Content-Type", "application/json")
					request.Header.Set(modes.ShareSessionHeaderName, "share-a")
					response := httptest.NewRecorder()
					handler.ServeHTTP(response, request)
					if response.Code != http.StatusForbidden {
						t.Fatalf("expected 403 for %s in %s mode, got %d with body %q", tc.route, mode, response.Code, response.Body.String())
					}
					if !strings.Contains(response.Body.String(), `"code":"mode_forbidden"`) {
						t.Fatalf("expected mode_forbidden for %s in %s mode, got %q", tc.route, mode, response.Body.String())
					}
				})
			}
		})
	}
}

func TestRegisterProjectRoutesSectionStructureMutationsPersistLatestState(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": sectionStructureRouteTestProject(t),
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

	groupResponse := post(RouteGroupSections, `{"projectConfigId":"project-alpha","sectionIds":["beta-section","alpha-section"]}`)
	if groupResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 from groupSections, got %d with body %q", groupResponse.Code, groupResponse.Body.String())
	}

	groupedLatestResponse := post(RouteGetLatestProjectState, `{"projectConfigId":"project-alpha"}`)
	if groupedLatestResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 grouped latest-state response, got %d with body %q", groupedLatestResponse.Code, groupedLatestResponse.Body.String())
	}

	var groupedPayload ProjectStateSingleConfigWithCompletedOpIDs
	if err := json.Unmarshal(groupedLatestResponse.Body.Bytes(), &groupedPayload); err != nil {
		t.Fatalf("decode grouped latest project payload: %v", err)
	}

	createdGroupID := ""
	for sectionID := range groupedPayload.ProjectState.Sections {
		switch sectionID {
		case "alpha-section", "beta-section", "top-group", "top-child-a", "top-child-b", "nested-parent", "nested-group", "nested-child-a", "nested-child-b", "nested-sibling":
			continue
		default:
			createdGroupID = sectionID
		}
	}
	if createdGroupID == "" {
		t.Fatal("expected groupSections to create a new group section")
	}
	if parent := groupedPayload.ProjectState.ParentSectionMap["alpha-section"]; parent == nil || *parent != createdGroupID {
		t.Fatalf("expected alpha-section parent %q after grouping, got %#v", createdGroupID, parent)
	}
	if parent := groupedPayload.ProjectState.ParentSectionMap["beta-section"]; parent == nil || *parent != createdGroupID {
		t.Fatalf("expected beta-section parent %q after grouping, got %#v", createdGroupID, parent)
	}

	ungroupResponse := post(RouteUngroupGroups, fmt.Sprintf(`{"projectConfigId":"project-alpha","groupIds":["%s"]}`, createdGroupID))
	if ungroupResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 from ungroupGroups, got %d with body %q", ungroupResponse.Code, ungroupResponse.Body.String())
	}

	deleteResponse := post(RouteDeleteSections, `{"projectConfigId":"project-alpha","sectionIds":["top-group"]}`)
	if deleteResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 from deleteSections, got %d with body %q", deleteResponse.Code, deleteResponse.Body.String())
	}

	finalLatestResponse := post(RouteGetLatestProjectState, `{"projectConfigId":"project-alpha"}`)
	if finalLatestResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 final latest-state response, got %d with body %q", finalLatestResponse.Code, finalLatestResponse.Body.String())
	}

	var finalPayload ProjectStateSingleConfigWithCompletedOpIDs
	if err := json.Unmarshal(finalLatestResponse.Body.Bytes(), &finalPayload); err != nil {
		t.Fatalf("decode final latest project payload: %v", err)
	}

	if _, ok := finalPayload.ProjectState.Sections[createdGroupID]; ok {
		t.Fatalf("expected temporary group %q to be removed after ungroup", createdGroupID)
	}
	for _, deletedSectionID := range []string{"top-group", "top-child-a", "top-child-b"} {
		if _, ok := finalPayload.ProjectState.Sections[deletedSectionID]; ok {
			t.Fatalf("expected %q to be removed after deleteSections", deletedSectionID)
		}
		if _, ok := finalPayload.ProjectState.ProjectConfig.SectionVariantMap[deletedSectionID]; ok {
			t.Fatalf("expected %q variant mapping to be removed after deleteSections", deletedSectionID)
		}
	}
	if parent := finalPayload.ProjectState.ParentSectionMap["alpha-section"]; parent != nil {
		t.Fatalf("expected alpha-section to be top-level after ungroup, got parent %#v", parent)
	}
	if parent := finalPayload.ProjectState.ParentSectionMap["beta-section"]; parent != nil {
		t.Fatalf("expected beta-section to be top-level after ungroup, got parent %#v", parent)
	}
	if _, ok := finalPayload.ProjectState.ProjectConfig.TopLevelSections["alpha-section"]; !ok {
		t.Fatal("expected alpha-section top-level layout after ungroup")
	}
	if _, ok := finalPayload.ProjectState.ProjectConfig.TopLevelSections["beta-section"]; !ok {
		t.Fatal("expected beta-section top-level layout after ungroup")
	}
}

func TestRegisterProjectRoutesSectionStructureMutationsAreBlockedInDeploymentModes(t *testing.T) {
	t.Parallel()

	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
			baselineProject := sectionStructureRouteTestProject(t)
			for _, requestSpec := range []struct {
				name  string
				route string
				body  string
			}{
				{
					name:  "group_sections",
					route: RouteGroupSections,
					body:  `{"projectConfigId":"project-alpha","sectionIds":["alpha-section","beta-section"]}`,
				},
				{
					name:  "ungroup_groups",
					route: RouteUngroupGroups,
					body:  `{"projectConfigId":"project-alpha","groupIds":["top-group"]}`,
				},
			} {
				t.Run(requestSpec.name, func(t *testing.T) {
					deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
						Mode: mode,
						Document: projectstate.Document{
							SchemaVersion:    projectstate.CurrentSchemaVersion,
							DefaultProjectID: "project-alpha",
							Projects: map[string]projectstate.Project{
								"project-alpha": baselineProject,
							},
						},
						Policy: map[string]any{
							"allowLayoutChanges": true,
						},
					})
					if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
						t.Fatalf("create deployment session: %v", err)
					}

					handler := newProjectRouteDeploymentTestHandler(t, mode, deploymentRuntime)
					request := httptest.NewRequest(http.MethodPost, "/api"+requestSpec.route, strings.NewReader(requestSpec.body))
					request.Header.Set("Content-Type", "application/json")
					request.Header.Set(modes.ShareSessionHeaderName, "share-a")
					response := httptest.NewRecorder()
					handler.ServeHTTP(response, request)
					if response.Code != http.StatusForbidden {
						t.Fatalf("expected 403 for %s in %s mode, got %d with body %q", requestSpec.route, mode, response.Code, response.Body.String())
					}
					if !strings.Contains(response.Body.String(), `"code":"mode_forbidden"`) {
						t.Fatalf("expected mode_forbidden for %s in %s mode, got %q", requestSpec.route, mode, response.Body.String())
					}
					if !strings.Contains(response.Body.String(), "Deployment mode does not allow this endpoint.") {
						t.Fatalf("expected deployment-mode denial detail for %s in %s mode, got %q", requestSpec.route, mode, response.Body.String())
					}

					overlay, err := deploymentRuntime.Overlay("share-a")
					if err != nil {
						t.Fatalf("deployment overlay: %v", err)
					}
					overlayProject := overlay.Snapshot().Document.Projects["project-alpha"]
					if len(overlayProject.Sections) != len(baselineProject.Sections) {
						t.Fatalf("expected rejected %s mutation to preserve overlay section count %d, got %d", requestSpec.route, len(baselineProject.Sections), len(overlayProject.Sections))
					}
				})
			}
		})
	}
}

func TestRegisterProjectRoutesMoveSectionsPersistsLatestState(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": moveSectionsRouteTestProject(t),
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
	post := func(body string) *httptest.ResponseRecorder {
		t.Helper()
		request := httptest.NewRequest(http.MethodPost, "/api"+RouteMoveSections, strings.NewReader(body))
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		return response
	}

	reparentResponse := post(`{"projectConfigId":"project-alpha","sectionIds":["top-a","top-b"],"newParentId":"group-parent","newIndex":0}`)
	if reparentResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 for %s reparent, got %d with body %q", RouteMoveSections, reparentResponse.Code, reparentResponse.Body.String())
	}

	paneResponse := post(`{"projectConfigId":"project-alpha","sectionIds":["terminal-section"],"newParentId":null,"newIndex":null,"positionsById":{"terminal-section":{"x":120,"y":80}}}`)
	if paneResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 for %s pane move, got %d with body %q", RouteMoveSections, paneResponse.Code, paneResponse.Body.String())
	}

	latestResponse := httptest.NewRequest(http.MethodPost, "/api"+RouteGetLatestProjectState, strings.NewReader(`{"projectConfigId":"project-alpha"}`))
	latestResponse.Header.Set("Content-Type", "application/json")
	latestRecorder := httptest.NewRecorder()
	handler.ServeHTTP(latestRecorder, latestResponse)
	if latestRecorder.Code != http.StatusOK {
		t.Fatalf("expected 200 latest-state response, got %d with body %q", latestRecorder.Code, latestRecorder.Body.String())
	}

	var payload ProjectStateSingleConfigWithCompletedOpIDs
	if err := json.Unmarshal(latestRecorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode latest project payload: %v", err)
	}

	if parent := payload.ProjectState.ParentSectionMap["top-a"]; parent == nil || *parent != "group-parent" {
		t.Fatalf("expected top-a parent group-parent, got %#v", parent)
	}
	if parent := payload.ProjectState.ParentSectionMap["top-b"]; parent == nil || *parent != "group-parent" {
		t.Fatalf("expected top-b parent group-parent, got %#v", parent)
	}
	if _, ok := payload.ProjectState.ProjectConfig.TopLevelSections["top-a"]; ok {
		t.Fatal("expected top-a to leave top-level layouts")
	}
	if _, ok := payload.ProjectState.ProjectConfig.TopLevelSections["top-b"]; ok {
		t.Fatal("expected top-b to leave top-level layouts")
	}

	groupVariantID := payload.ProjectState.ProjectConfig.SectionVariantMap["group-parent"]
	groupImplID := payload.ProjectState.SectionVariants[groupVariantID].Impl
	groupPayload := decodeProjectRouteRawObject(t, payload.ProjectState.SectionImpls[groupImplID])
	if got := decodeProjectRouteStringArray(groupPayload["children"]); !reflect.DeepEqual(got, []string{"top-a", "top-b", "nested-group"}) {
		t.Fatalf("expected group-parent children [top-a top-b nested-group], got %#v", got)
	}

	codeVariantID := payload.ProjectState.ProjectConfig.SectionVariantMap["code-section"]
	codeImplID := payload.ProjectState.SectionVariants[codeVariantID].Impl
	codePayload := decodeProjectRouteRawObject(t, payload.ProjectState.SectionImpls[codeImplID])
	if got := decodeProjectRouteStringArray(codePayload["children"]); len(got) != 0 {
		t.Fatalf("expected code-section children cleared after detach, got %#v", got)
	}
	if got, ok := codePayload["attachedTerminalSectionId"]; ok && got != nil && got != "" {
		t.Fatalf("expected attachedTerminalSectionId cleared after detach, got %#v", got)
	}

	if parent := payload.ProjectState.ParentSectionMap["terminal-section"]; parent != nil {
		t.Fatalf("expected terminal-section to become top-level, got parent %#v", parent)
	}
	layout, ok := payload.ProjectState.ProjectConfig.TopLevelSections["terminal-section"]
	if !ok {
		t.Fatalf("expected terminal-section layout after pane move, got %#v", payload.ProjectState.ProjectConfig.TopLevelSections)
	}
	if layout.X != 120 || layout.Y != 80 || layout.ZIndex != 2 {
		t.Fatalf("expected terminal-section layout {120 80 2}, got %#v", layout)
	}
}

func TestRegisterProjectRoutesMoveSectionsRejectsInvalidInputs(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": moveSectionsRouteTestProject(t),
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

	for _, requestSpec := range []struct {
		body         string
		expectedCode int
		expectedBody string
	}{
		{
			body:         `{"projectConfigId":"project-alpha","sectionIds":["terminal-section"],"newParentId":null,"newIndex":null,"positionsById":{}}`,
			expectedCode: http.StatusBadRequest,
			expectedBody: `"code":"positions_invalid"`,
		},
		{
			body:         `{"projectConfigId":"project-alpha","sectionIds":["group-parent"],"newParentId":"nested-group","newIndex":0}`,
			expectedCode: http.StatusUnprocessableEntity,
			expectedBody: `"code":"move_sections_invalid"`,
		},
		{
			body:         `{"projectConfigId":"project-alpha","sectionIds":["top-a"],"newParentId":"missing-parent","newIndex":0}`,
			expectedCode: http.StatusNotFound,
			expectedBody: `"code":"section_not_found"`,
		},
		{
			body:         `{"projectConfigId":"project-alpha","sectionIds":["top-a"],"newParentId":"group-parent","newIndex":-1}`,
			expectedCode: http.StatusBadRequest,
			expectedBody: `"code":"new_index_invalid"`,
		},
	} {
		request := httptest.NewRequest(http.MethodPost, "/api"+RouteMoveSections, strings.NewReader(requestSpec.body))
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != requestSpec.expectedCode {
			t.Fatalf("expected %d for %s, got %d with body %q", requestSpec.expectedCode, RouteMoveSections, response.Code, response.Body.String())
		}
		if !strings.Contains(response.Body.String(), requestSpec.expectedBody) {
			t.Fatalf("expected response body to contain %s, got %q", requestSpec.expectedBody, response.Body.String())
		}
	}
}

func TestRegisterProjectRoutesMoveSectionsUsesDeploymentOverlayWhenLayoutChangesAllowed(t *testing.T) {
	t.Parallel()

	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
			deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
				Mode: mode,
				Document: projectstate.Document{
					SchemaVersion:    projectstate.CurrentSchemaVersion,
					DefaultProjectID: "project-alpha",
					Projects: map[string]projectstate.Project{
						"project-alpha": moveSectionsRouteTestProject(t),
					},
				},
				Policy: map[string]any{
					"allowLayoutChanges": true,
				},
			})
			if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
				t.Fatalf("create deployment session: %v", err)
			}

			handler := newProjectRouteDeploymentTestHandler(t, mode, deploymentRuntime)
			request := httptest.NewRequest(
				http.MethodPost,
				"/api"+RouteMoveSections,
				strings.NewReader(`{"projectConfigId":"project-alpha","sectionIds":["top-a","top-b"],"newParentId":"group-parent","newIndex":0}`),
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
			if parent := overlayProject.Sections["top-a"].ParentSectionID; parent != "group-parent" {
				t.Fatalf("expected overlay top-a parent group-parent, got %q", parent)
			}
			if parent := overlayProject.Sections["top-b"].ParentSectionID; parent != "group-parent" {
				t.Fatalf("expected overlay top-b parent group-parent, got %q", parent)
			}
			if _, ok := overlayProject.TopLevelSections["top-a"]; ok {
				t.Fatal("expected overlay top-a to leave top-level layouts")
			}
			if _, ok := overlayProject.TopLevelSections["top-b"]; ok {
				t.Fatal("expected overlay top-b to leave top-level layouts")
			}

			baseProject := deploymentRuntime.Base().Snapshot().Document.Projects["project-alpha"]
			if parent := baseProject.Sections["top-a"].ParentSectionID; parent != "" {
				t.Fatalf("expected base top-a parent to remain empty, got %q", parent)
			}
			if parent := baseProject.Sections["top-b"].ParentSectionID; parent != "" {
				t.Fatalf("expected base top-b parent to remain empty, got %q", parent)
			}
			if _, ok := baseProject.TopLevelSections["top-a"]; !ok {
				t.Fatal("expected base top-a layout to remain present")
			}
			if _, ok := baseProject.TopLevelSections["top-b"]; !ok {
				t.Fatal("expected base top-b layout to remain present")
			}
		})
	}
}

func TestRegisterProjectRoutesMoveSectionsRejectsDeploymentPolicyWhenLayoutChangesDisallowed(t *testing.T) {
	t.Parallel()

	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
			deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
				Mode: mode,
				Document: projectstate.Document{
					SchemaVersion:    projectstate.CurrentSchemaVersion,
					DefaultProjectID: "project-alpha",
					Projects: map[string]projectstate.Project{
						"project-alpha": moveSectionsRouteTestProject(t),
					},
				},
				Policy: map[string]any{
					"allowLayoutChanges": false,
				},
			})
			if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
				t.Fatalf("create deployment session: %v", err)
			}

			handler := newProjectRouteDeploymentTestHandler(t, mode, deploymentRuntime)
			request := httptest.NewRequest(
				http.MethodPost,
				"/api"+RouteMoveSections,
				strings.NewReader(`{"projectConfigId":"project-alpha","sectionIds":["top-a","top-b"],"newParentId":"group-parent","newIndex":0}`),
			)
			request.Header.Set("Content-Type", "application/json")
			request.Header.Set(modes.ShareSessionHeaderName, "share-a")
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			if response.Code != http.StatusForbidden {
				t.Fatalf("expected 403, got %d with body %q", response.Code, response.Body.String())
			}
			if !strings.Contains(response.Body.String(), `"code":"layout_changes_forbidden"`) {
				t.Fatalf("expected layout_changes_forbidden body, got %q", response.Body.String())
			}
			if !strings.Contains(response.Body.String(), "Deployment policy disallows layout changes.") {
				t.Fatalf("expected deployment layout policy denial, got %q", response.Body.String())
			}

			overlay, err := deploymentRuntime.Overlay("share-a")
			if err != nil {
				t.Fatalf("deployment overlay: %v", err)
			}
			overlayProject := overlay.Snapshot().Document.Projects["project-alpha"]
			if parent := overlayProject.Sections["top-a"].ParentSectionID; parent != "" {
				t.Fatalf("expected rejected mutation to keep top-a parent empty, got %q", parent)
			}
			if parent := overlayProject.Sections["top-b"].ParentSectionID; parent != "" {
				t.Fatalf("expected rejected mutation to keep top-b parent empty, got %q", parent)
			}
		})
	}
}

func TestRegisterProjectRoutesPrepareAndPasteSectionsPersistLatestState(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-source",
		Projects: map[string]projectstate.Project{
			"project-source": copyPasteRouteSourceProject(t),
			"project-target": {
				ID:   "project-target",
				Name: "Target",
			},
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

	prepareRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RoutePrepareSectionsForCopy,
		strings.NewReader(`{"projectConfigId":"project-source","sectionIds":["group-root"]}`),
	)
	prepareRequest.Header.Set("Content-Type", "application/json")
	prepareResponse := httptest.NewRecorder()
	handler.ServeHTTP(prepareResponse, prepareRequest)
	if prepareResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 for %s, got %d with body %q", RoutePrepareSectionsForCopy, prepareResponse.Code, prepareResponse.Body.String())
	}

	var clipboard projectstate.SectionsClipboardData
	if err := json.Unmarshal(prepareResponse.Body.Bytes(), &clipboard); err != nil {
		t.Fatalf("decode prepareSectionsForCopy payload: %v", err)
	}
	if clipboard.Type != projectstate.ClipboardDataTypeSections {
		t.Fatalf("expected clipboard type %q, got %q", projectstate.ClipboardDataTypeSections, clipboard.Type)
	}
	if len(clipboard.Data.Core.Sections) != 3 {
		t.Fatalf("expected copied subtree with three sections, got %#v", clipboard.Data.Core.Sections)
	}
	if got := clipboard.Data.SectionVariantMap["group-root"]; got != "group-root-variant" {
		t.Fatalf("expected copied root active variant group-root-variant, got %q", got)
	}
	if got := clipboard.Data.SectionVariantMap["group-child-a"]; got != "group-child-a-variant-alt" {
		t.Fatalf("expected copied descendant active variant group-child-a-variant-alt, got %q", got)
	}
	if got := clipboard.Data.SectionVariantMap["group-child-b"]; got != "group-child-b-variant-default" {
		t.Fatalf("expected copied descendant active variant group-child-b-variant-default, got %q", got)
	}

	pasteBody, err := json.Marshal(PasteSectionsRequest{
		ProjectID: "project-target",
		Data:      clipboard.Data,
		Position:  projectstate.Position{X: 220, Y: 180},
		AsRef:     false,
	})
	if err != nil {
		t.Fatalf("marshal pasteSections request: %v", err)
	}
	pasteRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RoutePasteSections,
		strings.NewReader(string(pasteBody)),
	)
	pasteRequest.Header.Set("Content-Type", "application/json")
	pasteResponse := httptest.NewRecorder()
	handler.ServeHTTP(pasteResponse, pasteRequest)
	if pasteResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 for %s, got %d with body %q", RoutePasteSections, pasteResponse.Code, pasteResponse.Body.String())
	}

	targetProject := projectRuntime.Snapshot().Document.Projects["project-target"]
	if len(targetProject.Sections) != 3 {
		t.Fatalf("expected three pasted sections in target project, got %#v", targetProject.Sections)
	}

	var pastedRootID string
	for sectionID, section := range targetProject.Sections {
		if section.ParentSectionID != "" {
			continue
		}
		if pastedRootID != "" {
			t.Fatalf("expected one pasted root section, got %#v", targetProject.Sections)
		}
		pastedRootID = sectionID
	}
	if pastedRootID == "" {
		t.Fatalf("expected pasted root section, got %#v", targetProject.Sections)
	}
	if pastedRootID == "group-root" {
		t.Fatalf("expected pasted root section id to be remapped, got %q", pastedRootID)
	}
	if !targetProject.HasTopLevelSection(pastedRootID) {
		t.Fatalf("expected pasted root %q to become top-level", pastedRootID)
	}
	layout, ok := targetProject.TopLevelSections[pastedRootID]
	if !ok {
		t.Fatalf("expected pasted root layout, got %#v", targetProject.TopLevelSections)
	}
	if layout.X != 220 || layout.Y != 180 || layout.ZIndex != 0 {
		t.Fatalf("expected pasted root layout {220 180 0}, got %#v", layout)
	}

	rootVariantID := targetProject.SectionVariantMap[pastedRootID]
	rootPayload, err := targetProject.EffectiveSectionPayload(pastedRootID, rootVariantID)
	if err != nil {
		t.Fatalf("resolve pasted root payload: %v", err)
	}
	children := decodeProjectRouteStringArray(rootPayload["children"])
	if len(children) != 2 {
		t.Fatalf("expected pasted group children to be preserved, got %#v", children)
	}
	for _, childID := range children {
		if childID == "group-child-a" || childID == "group-child-b" {
			t.Fatalf("expected pasted child id to be remapped, got %#v", children)
		}
		childSection := targetProject.Sections[childID]
		if childSection.ParentSectionID != pastedRootID {
			t.Fatalf("expected pasted child %q parent %q, got %#v", childID, pastedRootID, childSection)
		}
		childVariantID := targetProject.SectionVariantMap[childID]
		if childVariantID == "" {
			t.Fatalf("expected pasted child %q to keep an explicit active variant entry, got %#v", childID, targetProject.SectionVariantMap)
		}
		childPayload, err := targetProject.EffectiveSectionPayload(childID, childVariantID)
		if err != nil {
			t.Fatalf("resolve pasted child payload %q: %v", childID, err)
		}
		switch childSection.Name {
		case "Group Child A":
			if got := fmt.Sprint(childPayload["text"]); got != "Child A Alt" {
				t.Fatalf("expected pasted Group Child A active payload text %q, got %q", "Child A Alt", got)
			}
		case "Group Child B":
			if got := fmt.Sprint(childPayload["text"]); got != "Child B Default" {
				t.Fatalf("expected pasted Group Child B active payload text %q, got %q", "Child B Default", got)
			}
		default:
			t.Fatalf("unexpected pasted child section %#v", childSection)
		}
	}
}
