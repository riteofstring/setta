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
	"setta/internal/deployments"
	"setta/internal/modes"
	"setta/internal/projectstate"
)

func TestSectionSizeValueRequestUnmarshalJSONSupportsAutoAndNumbers(t *testing.T) {
	t.Parallel()

	var autoValue sectionSizeValueRequest
	if err := json.Unmarshal([]byte(`"auto"`), &autoValue); err != nil {
		t.Fatalf("unmarshal auto value: %v", err)
	}
	if !autoValue.Auto {
		t.Fatalf("expected auto value to set Auto=true, got %#v", autoValue)
	}

	var numberValue sectionSizeValueRequest
	if err := json.Unmarshal([]byte(`240`), &numberValue); err != nil {
		t.Fatalf("unmarshal numeric value: %v", err)
	}
	if numberValue.Auto || numberValue.Value != 240 {
		t.Fatalf("expected numeric section size value 240, got %#v", numberValue)
	}

	var invalidValue sectionSizeValueRequest
	if err := json.Unmarshal([]byte(`"wide"`), &invalidValue); err == nil {
		t.Fatal("expected invalid section size string to fail")
	}

	var incompleteSize sectionSizeRequest
	if err := json.Unmarshal([]byte(`{"width":"auto"}`), &incompleteSize); err == nil {
		t.Fatal("expected incomplete section size object to fail")
	}
}

func TestRegisterProjectRoutesSetSectionSizesPersistsLatestState(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": sectionSizeRouteTestProject(t),
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
		"/api"+RouteSetSectionSizes,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionSizes":{"code-section":{"width":600,"height":120}}}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
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

	codeVariantID := payload.ProjectState.ProjectConfig.SectionVariantMap["code-section"]
	codeImplID := payload.ProjectState.SectionVariants[codeVariantID].Impl
	codeImplPayload := decodeProjectRouteRawObject(t, payload.ProjectState.SectionImpls[codeImplID])
	codeSize, ok := codeImplPayload["size"].(map[string]any)
	if !ok {
		t.Fatalf("expected code-section size payload, got %#v", codeImplPayload)
	}
	if got := codeSize["width"]; got != float64(600) {
		t.Fatalf("expected code-section width 600, got %#v", got)
	}

	terminalVariantID := payload.ProjectState.ProjectConfig.SectionVariantMap["terminal-section"]
	terminalImplID := payload.ProjectState.SectionVariants[terminalVariantID].Impl
	terminalImplPayload := decodeProjectRouteRawObject(t, payload.ProjectState.SectionImpls[terminalImplID])
	terminalSize, ok := terminalImplPayload["size"].(map[string]any)
	if !ok {
		t.Fatalf("expected terminal-section size payload, got %#v", terminalImplPayload)
	}
	if got := terminalSize["width"]; got != float64(600) {
		t.Fatalf("expected terminal-section width 600, got %#v", got)
	}
}

func TestRegisterProjectRoutesSetSectionSizesRejectsConflictingEmbeddedWidths(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": sectionSizeRouteTestProject(t),
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
		"/api"+RouteSetSectionSizes,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionSizes":{"code-section":{"width":600,"height":240},"terminal-section":{"width":500,"height":160}}}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"invalid_auto_layout"`) {
		t.Fatalf("expected invalid_auto_layout body, got %q", response.Body.String())
	}
}

func TestRegisterProjectRoutesChildDefaultsMutationsPersistLatestState(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": childDefaultsRouteTestProject(t),
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

	for _, requestSpec := range []struct {
		route string
		body  string
	}{
		{
			route: RouteSetParentDefaultChildSectionType,
			body:  `{"projectConfigId":"project-alpha","sectionId":"group-section","defaultChildSectionType":"Dict"}`,
		},
		{
			route: RouteSetParentDefaultChildSectionType,
			body:  `{"projectConfigId":"project-alpha","sectionId":"list-root-section","defaultChildSectionType":"TextBlock"}`,
		},
		{
			route: RouteSetListRootViewMode,
			body:  `{"projectConfigId":"project-alpha","sectionId":"list-root-section","viewMode":"task_list"}`,
		},
	} {
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

	groupSharedModifier := decodeProjectRouteRawObject(t, payload.ProjectState.Sections["group-section"].SharedModifier)
	if got := groupSharedModifier["defaultChildSectionType"]; got != "Dict" {
		t.Fatalf("expected group default child Dict, got %#v", got)
	}

	listRootSharedModifier := decodeProjectRouteRawObject(t, payload.ProjectState.Sections["list-root-section"].SharedModifier)
	if got := listRootSharedModifier["defaultChildSectionType"]; got != "TextBlock" {
		t.Fatalf("expected list root default child TextBlock, got %#v", got)
	}
	if got := listRootSharedModifier["viewMode"]; got != "task_list" {
		t.Fatalf("expected list root view mode task_list, got %#v", got)
	}
}

func TestRegisterProjectRoutesSetListRootViewModeSupportsDocumentedModes(t *testing.T) {
	t.Parallel()

	for _, viewMode := range []string{"default", "task_list", "kanban"} {
		projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
			SchemaVersion:    projectstate.CurrentSchemaVersion,
			DefaultProjectID: "project-alpha",
			Projects: map[string]projectstate.Project{
				"project-alpha": childDefaultsRouteTestProject(t),
			},
		})
		if err != nil {
			t.Fatalf("open overlay runtime for %s: %v", viewMode, err)
		}

		handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, t.TempDir(), nil, nil, nil)
		request := httptest.NewRequest(
			http.MethodPost,
			"/api"+RouteSetListRootViewMode,
			strings.NewReader(fmt.Sprintf(`{"projectConfigId":"project-alpha","sectionId":"list-root-section","viewMode":"%s"}`, viewMode)),
		)
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusOK {
			_ = projectRuntime.Close()
			t.Fatalf("expected 200 for list root view mode %s, got %d with body %q", viewMode, response.Code, response.Body.String())
		}

		project := projectRuntime.Snapshot().Document.Projects["project-alpha"]
		listRootSharedModifier := decodeProjectRouteRawObject(t, project.Sections["list-root-section"].SharedModifier)
		closeErr := projectRuntime.Close()
		if closeErr != nil {
			t.Fatalf("close overlay runtime for %s: %v", viewMode, closeErr)
		}
		if got := listRootSharedModifier["viewMode"]; got != viewMode {
			t.Fatalf("expected list root shared modifier viewMode %q, got %#v", viewMode, got)
		}
	}
}

func TestRegisterProjectRoutesChildDefaultsMutationsRejectInvalidInputs(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": childDefaultsRouteTestProject(t),
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
		route        string
		body         string
		expectedCode int
		expectedBody string
	}{
		{
			route:        RouteSetParentDefaultChildSectionType,
			body:         `{"projectConfigId":"project-alpha","sectionId":"plain-section","defaultChildSectionType":"Dict"}`,
			expectedCode: http.StatusUnprocessableEntity,
			expectedBody: `"code":"default_child_section_parent_required"`,
		},
		{
			route:        RouteSetParentDefaultChildSectionType,
			body:         `{"projectConfigId":"project-alpha","sectionId":"group-section","defaultChildSectionType":"GlobalVariables"}`,
			expectedCode: http.StatusUnprocessableEntity,
			expectedBody: `"code":"default_child_section_type_invalid"`,
		},
		{
			route:        RouteSetListRootViewMode,
			body:         `{"projectConfigId":"project-alpha","sectionId":"group-section","viewMode":"kanban"}`,
			expectedCode: http.StatusUnprocessableEntity,
			expectedBody: `"code":"list_root_section_required"`,
		},
		{
			route:        RouteSetListRootViewMode,
			body:         `{"projectConfigId":"project-alpha","sectionId":"list-root-section","viewMode":"grid"}`,
			expectedCode: http.StatusUnprocessableEntity,
			expectedBody: `"code":"list_root_view_mode_invalid"`,
		},
	} {
		request := httptest.NewRequest(
			http.MethodPost,
			"/api"+requestSpec.route,
			strings.NewReader(requestSpec.body),
		)
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != requestSpec.expectedCode {
			t.Fatalf("expected %d for %s, got %d with body %q", requestSpec.expectedCode, requestSpec.route, response.Code, response.Body.String())
		}
		if !strings.Contains(response.Body.String(), requestSpec.expectedBody) {
			t.Fatalf("expected response body to contain %s, got %q", requestSpec.expectedBody, response.Body.String())
		}
	}
}

func TestRegisterProjectRoutesChildDefaultsRemainIDEOnlyInDeployment(t *testing.T) {
	t.Parallel()

	assertChildDefaultsPreserved := func(t *testing.T, project projectstate.Project) {
		t.Helper()

		groupVariantID := project.SectionVariantMap["group-section"]
		groupPayload, err := project.EffectiveSectionPayload("group-section", groupVariantID)
		if err != nil {
			t.Fatalf("effective section payload group-section: %v", err)
		}
		if got := groupPayload["defaultChildSectionType"]; got != "Callable" {
			t.Fatalf("expected group default child Callable, got %#v", got)
		}

		listRootVariantID := project.SectionVariantMap["list-root-section"]
		listRootPayload, err := project.EffectiveSectionPayload("list-root-section", listRootVariantID)
		if err != nil {
			t.Fatalf("effective section payload list-root-section: %v", err)
		}
		if got := listRootPayload["defaultChildSectionType"]; got != "Callable" {
			t.Fatalf("expected list-root default child Callable, got %#v", got)
		}
		if got := listRootPayload["viewMode"]; got != "default" {
			t.Fatalf("expected list-root viewMode default, got %#v", got)
		}
	}

	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
			for _, requestSpec := range []struct {
				name  string
				route string
				body  string
			}{
				{
					name:  "set_parent_default_child_section_type_group",
					route: RouteSetParentDefaultChildSectionType,
					body:  `{"projectConfigId":"project-alpha","sectionId":"group-section","defaultChildSectionType":"Dict"}`,
				},
				{
					name:  "set_parent_default_child_section_type_list_root",
					route: RouteSetParentDefaultChildSectionType,
					body:  `{"projectConfigId":"project-alpha","sectionId":"list-root-section","defaultChildSectionType":"TextBlock"}`,
				},
				{
					name:  "set_list_root_view_mode",
					route: RouteSetListRootViewMode,
					body:  `{"projectConfigId":"project-alpha","sectionId":"list-root-section","viewMode":"task_list"}`,
				},
			} {
				t.Run(requestSpec.name, func(t *testing.T) {
					deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
						Mode: mode,
						Document: projectstate.Document{
							SchemaVersion:    projectstate.CurrentSchemaVersion,
							DefaultProjectID: "project-alpha",
							Projects: map[string]projectstate.Project{
								"project-alpha": childDefaultsRouteTestProject(t),
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
						t.Fatalf("%s %s: expected 403, got %d with body %q", mode, requestSpec.route, response.Code, response.Body.String())
					}
					if !strings.Contains(response.Body.String(), `"code":"mode_forbidden"`) {
						t.Fatalf("%s %s: expected mode_forbidden response, got %q", mode, requestSpec.route, response.Body.String())
					}
					if !strings.Contains(response.Body.String(), "Deployment mode does not allow this endpoint.") {
						t.Fatalf("%s %s: expected deployment-mode denial detail, got %q", mode, requestSpec.route, response.Body.String())
					}

					overlay, err := deploymentRuntime.Overlay("share-a")
					if err != nil {
						t.Fatalf("deployment overlay: %v", err)
					}
					assertChildDefaultsPreserved(t, overlay.Snapshot().Document.Projects["project-alpha"])
					assertChildDefaultsPreserved(t, deploymentRuntime.Base().Snapshot().Document.Projects["project-alpha"])
				})
			}
		})
	}
}

func TestRegisterProjectRoutesSectionFilterAndMetaControlMutationsPersistLatestState(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": sectionFilterMetaControlRouteTestProject(t),
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

	for _, requestSpec := range []struct {
		route string
		body  string
	}{
		{
			route: RouteSetSectionParamFilter,
			body:  `{"projectConfigId":"project-alpha","sectionId":"params-section","value":"   "}`,
		},
		{
			route: RouteSetMetaControlShowSectionTitle,
			body:  `{"projectConfigId":"project-alpha","sectionId":"meta-section","showSectionTitle":true}`,
		},
	} {
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

	paramsSharedModifier := decodeProjectRouteRawObject(t, payload.ProjectState.Sections["params-section"].SharedModifier)
	if got := paramsSharedModifier["paramFilter"]; got != "   " {
		t.Fatalf("expected raw paramFilter whitespace to persist, got %#v", got)
	}

	metaSharedModifier := decodeProjectRouteRawObject(t, payload.ProjectState.Sections["meta-section"].SharedModifier)
	if got := metaSharedModifier["showSectionTitle"]; got != true {
		t.Fatalf("expected showSectionTitle=true, got %#v", got)
	}
}

func TestRegisterProjectRoutesSectionFilterAndMetaControlMutationsRejectInvalidInputs(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": sectionFilterMetaControlRouteTestProject(t),
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
		route        string
		body         string
		expectedCode int
		expectedBody string
	}{
		{
			route:        RouteSetSectionParamFilter,
			body:         `{"projectConfigId":"project-alpha","sectionId":"code-section","value":"alpha"}`,
			expectedCode: http.StatusUnprocessableEntity,
			expectedBody: `"code":"section_param_filter_unsupported"`,
		},
		{
			route:        RouteSetMetaControlShowSectionTitle,
			body:         `{"projectConfigId":"project-alpha","sectionId":"params-section","showSectionTitle":true}`,
			expectedCode: http.StatusUnprocessableEntity,
			expectedBody: `"code":"meta_control_section_required"`,
		},
		{
			route:        RouteSetGroupOverflowMode,
			body:         `{"projectConfigId":"project-alpha","sectionId":"plain-section","overflowMode":true}`,
			expectedCode: http.StatusUnprocessableEntity,
			expectedBody: `"code":"group_section_required"`,
		},
	} {
		request := httptest.NewRequest(
			http.MethodPost,
			"/api"+requestSpec.route,
			strings.NewReader(requestSpec.body),
		)
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != requestSpec.expectedCode {
			t.Fatalf("expected %d for %s, got %d with body %q", requestSpec.expectedCode, requestSpec.route, response.Code, response.Body.String())
		}
		if !strings.Contains(response.Body.String(), requestSpec.expectedBody) {
			t.Fatalf("expected response body to contain %s, got %q", requestSpec.expectedBody, response.Body.String())
		}
	}
}

func TestRegisterProjectRoutesSetViewportUsesNormalizedActiveViewMode(t *testing.T) {
	t.Parallel()

	project := layoutPresentationRouteTestProject(t)
	project.ActiveViewModeID = ""
	project.ViewModes = map[string]projectstate.ViewMode{}

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": project,
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
		"/api"+RouteSetViewport,
		strings.NewReader(`{"projectConfigId":"project-alpha","viewport":{"x":0,"y":0,"zoom":1}}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	normalizedProject := projectRuntime.Snapshot().Document.Projects["project-alpha"]
	if normalizedProject.ActiveViewModeID == "" {
		t.Fatal("expected overlay runtime to repair the missing active view mode id")
	}
	activeViewMode, ok := normalizedProject.ViewModes[normalizedProject.ActiveViewModeID]
	if !ok {
		t.Fatalf("expected repaired active view mode %q to exist", normalizedProject.ActiveViewModeID)
	}
	expectedViewport := &projectstate.Viewport{X: 0, Y: 0, Zoom: 1}
	if !reflect.DeepEqual(normalizedProject.Viewport, expectedViewport) {
		t.Fatalf("expected normalized project viewport %#v, got %#v", expectedViewport, normalizedProject.Viewport)
	}
	if !normalizedProject.ViewportInitialized {
		t.Fatal("expected normalized project viewportInitialized=true")
	}
	if !reflect.DeepEqual(activeViewMode.Viewport, expectedViewport) {
		t.Fatalf("expected repaired active view mode viewport %#v, got %#v", expectedViewport, activeViewMode.Viewport)
	}
	if !activeViewMode.ViewportInitialized {
		t.Fatal("expected repaired active view mode viewportInitialized=true")
	}
}

func TestWriteProjectLayoutMutationErrorReturnsInternalErrorForMissingActiveViewMode(t *testing.T) {
	t.Parallel()

	request := httptest.NewRequest(http.MethodPost, "/api"+RouteSetViewport, nil)
	response := httptest.NewRecorder()

	writeProjectLayoutMutationError(response, request, projectstate.ErrActiveViewModeRequired)
	if response.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"internal_error"`) {
		t.Fatalf("expected internal_error body, got %q", response.Body.String())
	}
}

func TestRegisterProjectRoutesTogglePositionLocksReturnsNotFoundForUnknownSection(t *testing.T) {
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
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteTogglePositionLocks,
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

func TestRegisterProjectRoutesLayoutPresentationUsesDeploymentOverlayWhenLayoutChangesAllowed(t *testing.T) {
	t.Parallel()

	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
			t.Run("top_level_layout_and_viewport", func(t *testing.T) {
				assertDeploymentOverlayTopLevelLayoutAndViewport(t, mode)
			})

			t.Run("auto_layout", func(t *testing.T) {
				assertDeploymentOverlayAutoLayout(t, mode)
			})

			t.Run("section_sizes", func(t *testing.T) {
				assertDeploymentOverlaySectionSizes(t, mode)
			})

			t.Run("minimize_and_locks", func(t *testing.T) {
				assertDeploymentOverlayMinimizeAndLocks(t, mode)
			})
		})
	}
}

func newLayoutChangesAllowedDeploymentRuntime(t *testing.T, mode config.Mode, project projectstate.Project) *deployments.Runtime {
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
			"allowLayoutChanges": true,
		},
	})
	if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
		t.Fatalf("create deployment session: %v", err)
	}
	return deploymentRuntime
}

func postDeploymentLayoutRoute(t *testing.T, handler http.Handler, route string, body string) {
	t.Helper()

	request := httptest.NewRequest(http.MethodPost, "/api"+route, strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set(modes.ShareSessionHeaderName, "share-a")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200 for %s, got %d with body %q", route, response.Code, response.Body.String())
	}
}

func assertDeploymentOverlayTopLevelLayoutAndViewport(t *testing.T, mode config.Mode) {
	t.Helper()

	deploymentRuntime := newLayoutChangesAllowedDeploymentRuntime(t, mode, viewModesRouteTestProject(t))
	handler := newProjectRouteDeploymentTestHandler(t, mode, deploymentRuntime)
	postDeploymentLayoutRoute(t, handler, RouteSetTopLevelSectionLayout, `{"projectConfigId":"project-alpha","topLevelSections":{"parent-section":{"x":0,"y":0,"zIndex":0},"standalone-section":{"x":460,"y":310,"zIndex":9},"moving-section":{"x":220,"y":120,"zIndex":2}}}`)
	postDeploymentLayoutRoute(t, handler, RouteSetViewport, `{"projectConfigId":"project-alpha","viewport":{"x":42,"y":24,"zoom":1.1}}`)

	overlay, err := deploymentRuntime.Overlay("share-a")
	if err != nil {
		t.Fatalf("deployment overlay: %v", err)
	}
	overlayProject := overlay.Snapshot().Document.Projects["project-alpha"]
	if got := overlayProject.TopLevelSections["standalone-section"]; got.X != 460 || got.Y != 310 || got.ZIndex != 9 {
		t.Fatalf("expected overlay standalone-section layout {460 310 9}, got %#v", got)
	}
	if overlayProject.Viewport == nil || overlayProject.Viewport.X != 42 || overlayProject.Viewport.Y != 24 || overlayProject.Viewport.Zoom != 1.1 {
		t.Fatalf("expected overlay viewport {42 24 1.1}, got %#v", overlayProject.Viewport)
	}

	baseProject := deploymentRuntime.Base().Snapshot().Document.Projects["project-alpha"]
	if got := baseProject.TopLevelSections["standalone-section"]; got.X != 100 || got.Y != 50 || got.ZIndex != 1 {
		t.Fatalf("expected base standalone-section layout unchanged, got %#v", got)
	}
	if baseProject.Viewport == nil || baseProject.Viewport.X != 5 || baseProject.Viewport.Y != 10 || baseProject.Viewport.Zoom != 0.8 {
		t.Fatalf("expected base viewport unchanged, got %#v", baseProject.Viewport)
	}
}

func assertDeploymentOverlayAutoLayout(t *testing.T, mode config.Mode) {
	t.Helper()

	deploymentRuntime := newLayoutChangesAllowedDeploymentRuntime(t, mode, viewModesRouteTestProject(t))
	overlay, err := deploymentRuntime.Overlay("share-a")
	if err != nil {
		t.Fatalf("deployment overlay before auto layout: %v", err)
	}
	before := overlay.Snapshot().Document.Projects["project-alpha"]

	handler := newProjectRouteDeploymentTestHandler(t, mode, deploymentRuntime)
	postDeploymentLayoutRoute(t, handler, RouteAutoLayoutTopLevelSections, `{"projectConfigId":"project-alpha"}`)

	overlayProject := overlay.Snapshot().Document.Projects["project-alpha"]
	if autoLayoutRouteMinX(overlayProject.TopLevelSections) != autoLayoutRouteMinX(before.TopLevelSections) {
		t.Fatalf("expected overlay auto layout to preserve min x %v, got %v", autoLayoutRouteMinX(before.TopLevelSections), autoLayoutRouteMinX(overlayProject.TopLevelSections))
	}
	if autoLayoutRouteMinY(overlayProject.TopLevelSections) != autoLayoutRouteMinY(before.TopLevelSections) {
		t.Fatalf("expected overlay auto layout to preserve min y %v, got %v", autoLayoutRouteMinY(before.TopLevelSections), autoLayoutRouteMinY(overlayProject.TopLevelSections))
	}
	if overlayProject.TopLevelSections["standalone-section"] == before.TopLevelSections["standalone-section"] {
		t.Fatal("expected overlay auto layout to rewrite at least one top-level section position")
	}

	baseProject := deploymentRuntime.Base().Snapshot().Document.Projects["project-alpha"]
	if !reflect.DeepEqual(baseProject.TopLevelSections, before.TopLevelSections) {
		t.Fatalf("expected base top-level sections unchanged, got %#v", baseProject.TopLevelSections)
	}
}

func assertDeploymentOverlaySectionSizes(t *testing.T, mode config.Mode) {
	t.Helper()

	deploymentRuntime := newLayoutChangesAllowedDeploymentRuntime(t, mode, sectionSizeRouteTestProject(t))
	handler := newProjectRouteDeploymentTestHandler(t, mode, deploymentRuntime)
	postDeploymentLayoutRoute(t, handler, RouteSetSectionSizes, `{"projectConfigId":"project-alpha","sectionSizes":{"code-section":{"width":600,"height":120}}}`)

	overlay, err := deploymentRuntime.Overlay("share-a")
	if err != nil {
		t.Fatalf("deployment overlay: %v", err)
	}
	overlayProject := overlay.Snapshot().Document.Projects["project-alpha"]
	if got := projectRouteSectionWidth(t, overlayProject, "code-section"); got != float64(600) {
		t.Fatalf("expected overlay code-section width 600, got %#v", got)
	}
	if got := projectRouteSectionWidth(t, overlayProject, "terminal-section"); got != float64(600) {
		t.Fatalf("expected overlay terminal-section width 600, got %#v", got)
	}

	baseProject := deploymentRuntime.Base().Snapshot().Document.Projects["project-alpha"]
	if got := projectRouteSectionWidth(t, baseProject, "code-section"); got == float64(600) {
		t.Fatalf("expected base code-section width unchanged, got %#v", got)
	}
}

func projectRouteSectionWidth(t *testing.T, project projectstate.Project, sectionID string) any {
	t.Helper()

	variantID := project.SectionVariantMap[sectionID]
	implID := project.SectionVariants[variantID].ImplID
	payload := decodeProjectRouteRawObject(t, project.SectionImpls[implID].Payload)
	size := decodeProjectRouteRawObject(t, mustMarshalProjectRouteObject(t, payload["size"].(map[string]any)))
	return size["width"]
}

func assertDeploymentOverlayMinimizeAndLocks(t *testing.T, mode config.Mode) {
	t.Helper()

	deploymentRuntime := newLayoutChangesAllowedDeploymentRuntime(t, mode, layoutPresentationRouteTestProject(t))
	handler := newProjectRouteDeploymentTestHandler(t, mode, deploymentRuntime)
	postDeploymentLayoutRoute(t, handler, RouteToggleMinimized, `{"projectConfigId":"project-alpha","sectionId":"callable-section"}`)
	postDeploymentLayoutRoute(t, handler, RouteTogglePositionLocks, `{"projectConfigId":"project-alpha","sectionIds":["callable-section","plain-section"]}`)

	overlay, err := deploymentRuntime.Overlay("share-a")
	if err != nil {
		t.Fatalf("deployment overlay: %v", err)
	}
	overlayProject := overlay.Snapshot().Document.Projects["project-alpha"]
	overlayCallableModifier := decodeProjectRouteRawObject(t, overlayProject.Sections["callable-section"].SharedModifier)
	if got := overlayCallableModifier["isMinimized"]; got != true {
		t.Fatalf("expected overlay callable isMinimized=true, got %#v", got)
	}
	if got := overlayCallableModifier["positionAndSizeLocked"]; got != true {
		t.Fatalf("expected overlay callable positionAndSizeLocked=true, got %#v", got)
	}
	overlayPlainModifier := decodeProjectRouteRawObject(t, overlayProject.Sections["plain-section"].SharedModifier)
	if got := overlayPlainModifier["positionAndSizeLocked"]; got != true {
		t.Fatalf("expected overlay plain positionAndSizeLocked=true, got %#v", got)
	}

	baseProject := deploymentRuntime.Base().Snapshot().Document.Projects["project-alpha"]
	baseCallableModifier := decodeProjectRouteRawObject(t, baseProject.Sections["callable-section"].SharedModifier)
	if got := baseCallableModifier["isMinimized"]; got == true {
		t.Fatalf("expected base callable isMinimized unchanged, got %#v", got)
	}
	if got := baseCallableModifier["positionAndSizeLocked"]; got == true {
		t.Fatalf("expected base callable positionAndSizeLocked unchanged, got %#v", got)
	}
	basePlainModifier := decodeProjectRouteRawObject(t, baseProject.Sections["plain-section"].SharedModifier)
	if got := basePlainModifier["positionAndSizeLocked"]; got == true {
		t.Fatalf("expected base plain positionAndSizeLocked unchanged, got %#v", got)
	}
}

func TestRegisterProjectRoutesViewModeMutationsAreBlockedInDeploymentModes(t *testing.T) {
	t.Parallel()

	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
			baselineProject := viewModesRouteTestProject(t)
			assertForbidden := func(t *testing.T, response *httptest.ResponseRecorder, route string) {
				t.Helper()
				if response.Code != http.StatusForbidden {
					t.Fatalf("%s %s: expected 403, got %d with body %q", mode, route, response.Code, response.Body.String())
				}
				if !strings.Contains(response.Body.String(), `"code":"mode_forbidden"`) {
					t.Fatalf("%s %s: expected mode_forbidden response, got %q", mode, route, response.Body.String())
				}
				if !strings.Contains(response.Body.String(), "Deployment mode does not allow this endpoint.") {
					t.Fatalf("%s %s: expected deployment-mode denial detail, got %q", mode, route, response.Body.String())
				}
			}

			for _, requestSpec := range []struct {
				name  string
				route string
				body  string
			}{
				{
					name:  "create_view_mode",
					route: RouteCreateViewMode,
					body:  `{"projectConfigId":"project-alpha"}`,
				},
				{
					name:  "toggle_is_editing_view_mode",
					route: RouteToggleIsEditingViewMode,
					body:  `{"projectConfigId":"project-alpha"}`,
				},
				{
					name:  "toggle_view_mode_user_facing",
					route: RouteToggleViewModeUserFacing,
					body:  `{"projectConfigId":"project-alpha","viewModeId":"focus"}`,
				},
				{
					name:  "toggle_view_mode_tab",
					route: RouteToggleViewModeTab,
					body:  `{"projectConfigId":"project-alpha","viewModeId":"focus"}`,
				},
				{
					name:  "toggle_section_visibility",
					route: RouteToggleSectionVisibility,
					body:  `{"projectConfigId":"project-alpha","sectionIds":["moving-section"]}`,
				},
				{
					name:  "set_view_mode_name",
					route: RouteSetViewModeName,
					body:  `{"projectConfigId":"project-alpha","viewModeId":"focus","name":"Viewer"}`,
				},
				{
					name:  "delete_view_mode",
					route: RouteDeleteViewMode,
					body:  `{"projectConfigId":"project-alpha","viewModeId":"focus"}`,
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
							"allowVariantChanges": true,
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
					assertForbidden(t, response, requestSpec.route)

					overlay, err := deploymentRuntime.Overlay("share-a")
					if err != nil {
						t.Fatalf("deployment overlay: %v", err)
					}
					overlayProject := overlay.Snapshot().Document.Projects["project-alpha"]
					if !reflect.DeepEqual(overlayProject.ViewModes, baselineProject.ViewModes) {
						t.Fatalf("expected rejected %s mutation to preserve view modes, got %#v", requestSpec.route, overlayProject.ViewModes)
					}
					if overlayProject.ActiveViewModeID != baselineProject.ActiveViewModeID {
						t.Fatalf("expected rejected %s mutation to preserve active view mode %q, got %q", requestSpec.route, baselineProject.ActiveViewModeID, overlayProject.ActiveViewModeID)
					}
					if overlayProject.IsEditingViewMode != baselineProject.IsEditingViewMode {
						t.Fatalf("expected rejected %s mutation to preserve editing mode %v, got %v", requestSpec.route, baselineProject.IsEditingViewMode, overlayProject.IsEditingViewMode)
					}
				})
			}
		})
	}
}

func TestRegisterProjectRoutesAutoLayoutTopLevelSectionsPersistsLatestState(t *testing.T) {
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

	before := projectRuntime.Snapshot().Document.Projects["project-alpha"]
	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, t.TempDir(), nil, nil, nil)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteAutoLayoutTopLevelSections,
		strings.NewReader(`{"projectConfigId":"project-alpha"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	project := projectRuntime.Snapshot().Document.Projects["project-alpha"]
	if autoLayoutRouteMinX(project.TopLevelSections) != autoLayoutRouteMinX(before.TopLevelSections) {
		t.Fatalf("expected auto layout to preserve min x %v, got %v", autoLayoutRouteMinX(before.TopLevelSections), autoLayoutRouteMinX(project.TopLevelSections))
	}
	if autoLayoutRouteMinY(project.TopLevelSections) != autoLayoutRouteMinY(before.TopLevelSections) {
		t.Fatalf("expected auto layout to preserve min y %v, got %v", autoLayoutRouteMinY(before.TopLevelSections), autoLayoutRouteMinY(project.TopLevelSections))
	}
	if project.TopLevelSections["standalone-section"] == before.TopLevelSections["standalone-section"] {
		t.Fatal("expected auto layout to rewrite at least one top-level section position")
	}
	if !reflect.DeepEqual(project.TopLevelSections, project.ViewModes["focus"].TopLevelSections) {
		t.Fatal("expected auto layout to keep the active view mode layouts aligned with project layouts")
	}
}

func TestRegisterProjectRoutesAutoLayoutTopLevelSectionsReturns422ForInvalidMargin(t *testing.T) {
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
		"/api"+RouteAutoLayoutTopLevelSections,
		strings.NewReader(`{"projectConfigId":"project-alpha","margin":-1}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"invalid_auto_layout"`) {
		t.Fatalf("expected invalid_auto_layout body, got %q", response.Body.String())
	}
}

func TestRegisterProjectRoutesAutoLayoutTopLevelSectionsReturns404ForMissingProject(t *testing.T) {
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
		"/api"+RouteAutoLayoutTopLevelSections,
		strings.NewReader(`{"projectConfigId":"missing-project"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"project_config_not_found"`) {
		t.Fatalf("expected project_config_not_found body, got %q", response.Body.String())
	}
}
