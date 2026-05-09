package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	"setta/internal/config"
	"setta/internal/modes"
	"setta/internal/projectstate"
)

func TestRegisterProjectRoutesParamSelectionMutationsPersistLatestState(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": passwordParamRouteTestProject(t),
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
			route: RouteToggleParamSelected,
			body:  `{"projectConfigId":"project-alpha","sectionId":"dict-a","paramInfoId":"shared-child"}`,
		},
		{
			route: RouteToggleParamSelected,
			body:  `{"projectConfigId":"project-alpha","sectionId":"dict-a","paramInfoId":"shared-secret"}`,
		},
		{
			route: RouteDeleteSelectedParams,
			body:  `{"projectConfigId":"project-alpha","sectionId":"dict-a","paramInfoIds":["shared-child"]}`,
		},
		{
			route: RouteUnselectAllParams,
			body:  `{"projectConfigId":"project-alpha"}`,
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

	if _, ok := payload.ProjectState.CodeObjs["shared-child"]; ok {
		t.Fatal("expected shared-child code object to be deleted")
	}
	if _, ok := payload.ProjectState.CodeObjs["shared-secret"]; !ok {
		t.Fatal("expected shared-secret code object to remain")
	}

	dictVariantID := payload.ProjectState.ProjectConfig.SectionVariantMap["dict-a"]
	dictImplID := payload.ProjectState.SectionVariants[dictVariantID].Impl
	dictPayload := decodeProjectRouteRawObject(t, payload.ProjectState.SectionImpls[dictImplID])
	if got := decodeProjectRouteStringArray(dictPayload["selectedParams"]); len(got) != 0 {
		t.Fatalf("expected selectedParams to be cleared, got %#v", got)
	}
	codeObjVariantMap, ok := dictPayload["codeObjVariantMap"].(map[string]any)
	if !ok {
		t.Fatalf("expected codeObjVariantMap object, got %#v", dictPayload["codeObjVariantMap"])
	}
	if _, ok := codeObjVariantMap["shared-child"]; ok {
		t.Fatalf("expected deleted param to be removed from codeObjVariantMap, got %#v", codeObjVariantMap)
	}
}

func TestRegisterProjectRoutesDeleteSelectedParamsPersistsLatestStateOnDirectHTTPRoute(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": passwordParamRouteTestProject(t),
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

	// The live kwargs caller selects params locally, then deletes them through
	// the direct /deleteSelectedParams route.
	toggleResponse := post(
		RouteToggleParamSelected,
		`{"projectConfigId":"project-alpha","sectionId":"dict-a","paramInfoId":"shared-child"}`,
	)
	if toggleResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 toggle response, got %d with body %q", toggleResponse.Code, toggleResponse.Body.String())
	}

	deleteResponse := post(
		RouteDeleteSelectedParams,
		`{"projectConfigId":"project-alpha","sectionId":"dict-a","paramInfoIds":["shared-child"]}`,
	)
	if deleteResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 deleteSelectedParams response, got %d with body %q", deleteResponse.Code, deleteResponse.Body.String())
	}

	latestResponse := post(RouteGetLatestProjectState, `{"projectConfigId":"project-alpha"}`)
	if latestResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 latest-state response, got %d with body %q", latestResponse.Code, latestResponse.Body.String())
	}

	var payload ProjectStateSingleConfigWithCompletedOpIDs
	if err := json.Unmarshal(latestResponse.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode latest project payload: %v", err)
	}

	if _, ok := payload.ProjectState.CodeObjs["shared-child"]; ok {
		t.Fatal("expected shared-child code object to be deleted")
	}
	if _, ok := payload.ProjectState.CodeObjs["shared-secret"]; !ok {
		t.Fatal("expected shared-secret code object to remain")
	}

	dictVariantID := payload.ProjectState.ProjectConfig.SectionVariantMap["dict-a"]
	dictImplID := payload.ProjectState.SectionVariants[dictVariantID].Impl
	dictPayload := decodeProjectRouteRawObject(t, payload.ProjectState.SectionImpls[dictImplID])
	if got := decodeProjectRouteStringArray(dictPayload["selectedParams"]); len(got) != 0 {
		t.Fatalf("expected selectedParams to be cleared, got %#v", got)
	}
	codeObjVariantMap, ok := dictPayload["codeObjVariantMap"].(map[string]any)
	if !ok {
		t.Fatalf("expected codeObjVariantMap object, got %#v", dictPayload["codeObjVariantMap"])
	}
	if _, ok := codeObjVariantMap["shared-child"]; ok {
		t.Fatalf("expected deleted param to be removed from codeObjVariantMap, got %#v", codeObjVariantMap)
	}
}

// deleteSelectedParams is now a live direct HTTP surface for kwargs controls,
// so keep the route-specific transport failures explicit instead of relying
// only on the broader latest-state mutation proof above.
func TestRegisterProjectRoutesDeleteSelectedParamsRejectsInvalidInputs(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": passwordParamRouteTestProject(t),
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

	for _, testCase := range []struct {
		name             string
		payload          string
		expectedStatus   int
		expectedFragment string
	}{
		{
			name:             "blank param id",
			payload:          `{"projectConfigId":"project-alpha","sectionId":"dict-a","paramInfoIds":["  "]}`,
			expectedStatus:   http.StatusBadRequest,
			expectedFragment: `"code":"param_info_ids_invalid"`,
		},
		{
			name:             "missing param",
			payload:          `{"projectConfigId":"project-alpha","sectionId":"dict-a","paramInfoIds":["missing-param"]}`,
			expectedStatus:   http.StatusNotFound,
			expectedFragment: `"code":"param_info_not_found"`,
		},
		{
			name:             "missing section",
			payload:          `{"projectConfigId":"project-alpha","sectionId":"missing-section","paramInfoIds":["shared-child"]}`,
			expectedStatus:   http.StatusNotFound,
			expectedFragment: `"code":"section_not_found"`,
		},
	} {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			request := httptest.NewRequest(
				http.MethodPost,
				"/api"+RouteDeleteSelectedParams,
				strings.NewReader(testCase.payload),
			)
			request.Header.Set("Content-Type", "application/json")
			response := httptest.NewRecorder()

			handler.ServeHTTP(response, request)

			if response.Code != testCase.expectedStatus {
				t.Fatalf("expected %d, got %d with body %q", testCase.expectedStatus, response.Code, response.Body.String())
			}
			if !strings.Contains(response.Body.String(), testCase.expectedFragment) {
				t.Fatalf("expected response to contain %s, got %q", testCase.expectedFragment, response.Body.String())
			}
		})
	}
}

func TestRegisterProjectRoutesParamSelectionUsesDeploymentOverlayWhenParamChangesAllowed(t *testing.T) {
	t.Parallel()

	selectedParamsForProject := func(t *testing.T, project projectstate.Project) []string {
		t.Helper()

		dictVariantID := project.SectionVariantMap["dict-a"]
		dictPayload, err := project.EffectiveSectionPayload("dict-a", dictVariantID)
		if err != nil {
			t.Fatalf("effective section payload dict-a: %v", err)
		}
		return decodeProjectRouteStringArray(dictPayload["selectedParams"])
	}

	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
			deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
				Mode: mode,
				Document: projectstate.Document{
					SchemaVersion:    projectstate.CurrentSchemaVersion,
					DefaultProjectID: "project-alpha",
					Projects: map[string]projectstate.Project{
						"project-alpha": passwordParamRouteTestProject(t),
					},
				},
				Policy: map[string]any{
					"allowParamChanges": true,
				},
			})
			if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
				t.Fatalf("create deployment session: %v", err)
			}

			handler := newProjectRouteDeploymentTestHandler(t, mode, deploymentRuntime)

			toggleRequest := httptest.NewRequest(
				http.MethodPost,
				"/api"+RouteToggleParamSelected,
				strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"dict-a","paramInfoId":"shared-child"}`),
			)
			toggleRequest.Header.Set("Content-Type", "application/json")
			toggleRequest.Header.Set(modes.ShareSessionHeaderName, "share-a")
			toggleResponse := httptest.NewRecorder()
			handler.ServeHTTP(toggleResponse, toggleRequest)
			if toggleResponse.Code != http.StatusOK {
				t.Fatalf("expected 200 for toggle, got %d with body %q", toggleResponse.Code, toggleResponse.Body.String())
			}

			overlay, err := deploymentRuntime.Overlay("share-a")
			if err != nil {
				t.Fatalf("deployment overlay: %v", err)
			}
			overlayProject := overlay.Snapshot().Document.Projects["project-alpha"]
			if got := selectedParamsForProject(t, overlayProject); !reflect.DeepEqual(got, []string{"shared-child"}) {
				t.Fatalf("expected overlay selectedParams [shared-child] after toggle, got %#v", got)
			}

			baseProject := deploymentRuntime.Base().Snapshot().Document.Projects["project-alpha"]
			if got := selectedParamsForProject(t, baseProject); len(got) != 0 {
				t.Fatalf("expected base selectedParams to remain empty after toggle, got %#v", got)
			}

			unselectRequest := httptest.NewRequest(
				http.MethodPost,
				"/api"+RouteUnselectAllParams,
				strings.NewReader(`{"projectConfigId":"project-alpha"}`),
			)
			unselectRequest.Header.Set("Content-Type", "application/json")
			unselectRequest.Header.Set(modes.ShareSessionHeaderName, "share-a")
			unselectResponse := httptest.NewRecorder()
			handler.ServeHTTP(unselectResponse, unselectRequest)
			if unselectResponse.Code != http.StatusOK {
				t.Fatalf("expected 200 for unselect, got %d with body %q", unselectResponse.Code, unselectResponse.Body.String())
			}

			overlayProject = overlay.Snapshot().Document.Projects["project-alpha"]
			if got := selectedParamsForProject(t, overlayProject); len(got) != 0 {
				t.Fatalf("expected overlay selectedParams to clear after unselect, got %#v", got)
			}
		})
	}
}

func TestRegisterProjectRoutesParamSelectionRejectsDeploymentPolicyWhenParamChangesDisallowed(t *testing.T) {
	t.Parallel()

	selectedParamsForProject := func(t *testing.T, project projectstate.Project) []string {
		t.Helper()

		dictVariantID := project.SectionVariantMap["dict-a"]
		dictPayload, err := project.EffectiveSectionPayload("dict-a", dictVariantID)
		if err != nil {
			t.Fatalf("effective section payload dict-a: %v", err)
		}
		return decodeProjectRouteStringArray(dictPayload["selectedParams"])
	}

	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
			deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
				Mode: mode,
				Document: projectstate.Document{
					SchemaVersion:    projectstate.CurrentSchemaVersion,
					DefaultProjectID: "project-alpha",
					Projects: map[string]projectstate.Project{
						"project-alpha": passwordParamRouteTestProject(t),
					},
				},
				Policy: map[string]any{
					"allowParamChanges": false,
				},
			})
			if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
				t.Fatalf("create deployment session: %v", err)
			}

			handler := newProjectRouteDeploymentTestHandler(t, mode, deploymentRuntime)

			for _, requestSpec := range []struct {
				name  string
				route string
				body  string
			}{
				{
					name:  "toggle",
					route: RouteToggleParamSelected,
					body:  `{"projectConfigId":"project-alpha","sectionId":"dict-a","paramInfoId":"shared-child"}`,
				},
				{
					name:  "unselect",
					route: RouteUnselectAllParams,
					body:  `{"projectConfigId":"project-alpha"}`,
				},
			} {
				t.Run(requestSpec.name, func(t *testing.T) {
					request := httptest.NewRequest(
						http.MethodPost,
						"/api"+requestSpec.route,
						strings.NewReader(requestSpec.body),
					)
					request.Header.Set("Content-Type", "application/json")
					request.Header.Set(modes.ShareSessionHeaderName, "share-a")
					response := httptest.NewRecorder()
					handler.ServeHTTP(response, request)
					if response.Code != http.StatusForbidden {
						t.Fatalf("expected 403 for %s, got %d with body %q", requestSpec.route, response.Code, response.Body.String())
					}
					if !strings.Contains(response.Body.String(), `"code":"param_changes_forbidden"`) {
						t.Fatalf("expected param_changes_forbidden body, got %q", response.Body.String())
					}
					if !strings.Contains(response.Body.String(), "Deployment policy disallows param changes.") {
						t.Fatalf("expected deployment param policy denial, got %q", response.Body.String())
					}

					overlay, err := deploymentRuntime.Overlay("share-a")
					if err != nil {
						t.Fatalf("deployment overlay: %v", err)
					}
					overlayProject := overlay.Snapshot().Document.Projects["project-alpha"]
					if got := selectedParamsForProject(t, overlayProject); len(got) != 0 {
						t.Fatalf("expected rejected mutation to keep overlay selectedParams empty, got %#v", got)
					}
				})
			}
		})
	}
}

func TestRegisterProjectRoutesParamMoveMutationsPersistLatestState(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": paramMoveRouteTestProject(t),
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
		request := httptest.NewRequest(http.MethodPost, "/api"+route, strings.NewReader(body))
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
			route: RouteIndentParams,
			body:  `{"projectConfigId":"project-alpha","sectionId":"dict-section","paramIds":["selected-a","selected-b"]}`,
		},
		{
			route: RouteUnindentParams,
			body:  `{"projectConfigId":"project-alpha","sectionId":"dict-section","paramIds":["selected-b"]}`,
		},
		{
			route: RouteMoveParams,
			body:  `{"projectConfigId":"project-alpha","sectionId":"dict-section","paramIds":["selected-a"],"newParentId":"root-param","newIndex":0}`,
		},
		{
			route: RouteMoveParamGroups,
			body:  `{"projectConfigId":"project-alpha","sectionId":"dict-section","moves":[{"paramIds":["selected-a"],"newParentId":"root-param","newIndex":3}]}`,
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

	dictVariantID := payload.ProjectState.ProjectConfig.SectionVariantMap["dict-section"]
	dictImplID := payload.ProjectState.SectionVariants[dictVariantID].Impl
	dictPayload := decodeProjectRouteRawObject(t, payload.ProjectState.SectionImpls[dictImplID])
	codeObjVariantMap, ok := dictPayload["codeObjVariantMap"].(map[string]any)
	if !ok {
		t.Fatalf("expected codeObjVariantMap object, got %#v", dictPayload["codeObjVariantMap"])
	}
	rootSharedModifier := decodeProjectRouteRawObject(t, payload.ProjectState.CodeObjs["root-param"].SharedModifier)
	if got := decodeProjectRouteStringArray(rootSharedModifier["children"]); !reflect.DeepEqual(got, []string{"parent-param", "selected-b", "other-param", "selected-a"}) {
		t.Fatalf("expected final root order [parent-param selected-b other-param selected-a], got %#v", got)
	}

	parentVariantID, ok := codeObjVariantMap["parent-param"].(string)
	if !ok {
		t.Fatalf("expected parent-param variant id string, got %#v", codeObjVariantMap["parent-param"])
	}
	parentImplID := payload.ProjectState.CodeObjVariants[parentVariantID].Impl
	parentImplPayload := decodeProjectRouteRawObject(t, payload.ProjectState.CodeObjImpls[parentImplID])
	if got := parentImplPayload["type"]; got != "NestedParam" {
		t.Fatalf("expected parent-param impl type NestedParam after indent, got %#v", got)
	}
	parentSharedModifier := decodeProjectRouteRawObject(t, payload.ProjectState.CodeObjs["parent-param"].SharedModifier)
	if got := decodeProjectRouteStringArray(parentSharedModifier["children"]); len(got) != 0 {
		t.Fatalf("expected parent-param children to be empty after move-out, got %#v", got)
	}
}

func TestRegisterProjectRoutesParamMoveMutationsRejectInvalidInputs(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": paramMoveRouteTestProject(t),
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
			route:        RouteIndentParams,
			body:         `{"projectConfigId":"project-alpha","sectionId":"dict-section","paramIds":["selected-a"," "]}`,
			expectedCode: http.StatusBadRequest,
			expectedBody: `"code":"param_ids_invalid"`,
		},
		{
			route:        RouteMoveParams,
			body:         `{"projectConfigId":"project-alpha","sectionId":"dict-section","paramIds":["selected-a"],"newParentId":"missing-param","newIndex":0}`,
			expectedCode: http.StatusNotFound,
			expectedBody: `"code":"new_parent_not_found"`,
		},
		{
			route:        RouteMoveParamGroups,
			body:         `{"projectConfigId":"project-alpha","sectionId":"dict-section","moves":[{"paramIds":["selected-a"],"newParentId":"selected-a","newIndex":0}]}`,
			expectedCode: http.StatusUnprocessableEntity,
			expectedBody: `"code":"param_move_invalid"`,
		},
		{
			route:        RouteMoveParams,
			body:         `{"projectConfigId":"project-alpha","sectionId":"dict-section","paramIds":["selected-a"],"newParentId":"root-param","newIndex":-1}`,
			expectedCode: http.StatusBadRequest,
			expectedBody: `"code":"new_index_invalid"`,
		},
	} {
		request := httptest.NewRequest(http.MethodPost, "/api"+requestSpec.route, strings.NewReader(requestSpec.body))
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

func TestRegisterProjectRoutesAddKwargPersistsLatestState(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": passwordParamRouteTestProject(t),
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
		request := httptest.NewRequest(http.MethodPost, "/api"+route, strings.NewReader(body))
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		return response
	}

	response := post(RouteAddKwarg, `{"projectConfigId":"project-alpha","sectionId":"dict-a"}`)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200 for %s, got %d with body %q", RouteAddKwarg, response.Code, response.Body.String())
	}

	latestResponse := post(RouteGetLatestProjectState, `{"projectConfigId":"project-alpha"}`)
	if latestResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 latest-state response, got %d with body %q", latestResponse.Code, latestResponse.Body.String())
	}

	var payload ProjectStateSingleConfigWithCompletedOpIDs
	if err := json.Unmarshal(latestResponse.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode latest project payload: %v", err)
	}

	sharedRootSharedModifier := decodeProjectRouteRawObject(t, payload.ProjectState.CodeObjs["shared-root"].SharedModifier)
	sharedChildren := decodeProjectRouteStringArray(sharedRootSharedModifier["children"])
	if len(sharedChildren) != 3 || sharedChildren[0] != "shared-child" || sharedChildren[1] != "shared-secret" {
		t.Fatalf("expected shared-root children to append one new param, got %#v", sharedChildren)
	}
	createdCodeObj, ok := payload.ProjectState.CodeObjs[sharedChildren[2]]
	if !ok {
		t.Fatalf("expected created shared child %q to be present in code objects", sharedChildren[2])
	}
	if createdCodeObj.Name != "" {
		t.Fatalf("expected created shared child name to start empty, got %q", createdCodeObj.Name)
	}

	dictVariantID := payload.ProjectState.ProjectConfig.SectionVariantMap["dict-a"]
	dictImplID := payload.ProjectState.SectionVariants[dictVariantID].Impl
	dictPayload := decodeProjectRouteRawObject(t, payload.ProjectState.SectionImpls[dictImplID])
	codeObjVariantMap, ok := dictPayload["codeObjVariantMap"].(map[string]any)
	if !ok {
		t.Fatalf("expected dict codeObjVariantMap object, got %#v", dictPayload["codeObjVariantMap"])
	}
	if _, ok := codeObjVariantMap[sharedChildren[2]]; !ok {
		t.Fatalf("expected created shared child %q to be present in codeObjVariantMap, got %#v", sharedChildren[2], codeObjVariantMap)
	}

	shown := payload.ProjectState.ShownParamIDs[dictVariantID]
	if got := shown.Pinned.TopLevelParamIDs; len(got) != 0 {
		t.Fatalf("expected no pinned shown params after add kwarg, got %#v", got)
	}
	if got := shown.Unpinned.TopLevelParamIDs; !reflect.DeepEqual(got, []string{"shared-child", "shared-secret", sharedChildren[2]}) {
		t.Fatalf("expected unpinned shown params to include created kwarg, got %#v", got)
	}
	if got := shown.Unpinned.RequiredParamIDsToPaths[sharedChildren[2]]; !reflect.DeepEqual(got, []string{sharedChildren[2]}) {
		t.Fatalf("expected created kwarg path [%s], got %#v", sharedChildren[2], got)
	}
}

func TestRegisterProjectRoutesDeleteKwargPersistsLatestState(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": passwordParamRouteTestProject(t),
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
		request := httptest.NewRequest(http.MethodPost, "/api"+route, strings.NewReader(body))
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		return response
	}

	response := post(RouteDeleteKwarg, `{"projectConfigId":"project-alpha","sectionId":"dict-a"}`)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200 for %s, got %d with body %q", RouteDeleteKwarg, response.Code, response.Body.String())
	}

	latestResponse := post(RouteGetLatestProjectState, `{"projectConfigId":"project-alpha"}`)
	if latestResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 latest-state response, got %d with body %q", latestResponse.Code, latestResponse.Body.String())
	}

	var payload ProjectStateSingleConfigWithCompletedOpIDs
	if err := json.Unmarshal(latestResponse.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode latest project payload: %v", err)
	}

	sharedRootSharedModifier := decodeProjectRouteRawObject(t, payload.ProjectState.CodeObjs["shared-root"].SharedModifier)
	if children := decodeProjectRouteStringArray(sharedRootSharedModifier["children"]); !reflect.DeepEqual(children, []string{"shared-child"}) {
		t.Fatalf("expected shared-root children [shared-child] after deleteKwarg, got %#v", children)
	}

	dictVariantID := payload.ProjectState.ProjectConfig.SectionVariantMap["dict-a"]
	dictImplID := payload.ProjectState.SectionVariants[dictVariantID].Impl
	dictPayload := decodeProjectRouteRawObject(t, payload.ProjectState.SectionImpls[dictImplID])
	codeObjVariantMap, ok := dictPayload["codeObjVariantMap"].(map[string]any)
	if !ok {
		t.Fatalf("expected dict codeObjVariantMap object, got %#v", dictPayload["codeObjVariantMap"])
	}
	if _, ok := codeObjVariantMap["shared-secret"]; ok {
		t.Fatalf("expected deleted shared-secret to be removed from codeObjVariantMap, got %#v", codeObjVariantMap)
	}
	if _, ok := payload.ProjectState.CodeObjs["shared-secret"]; ok {
		t.Fatalf("expected shared-secret code object to be pruned after deleteKwarg")
	}
}

func TestRegisterProjectRoutesDeleteKwargToEmptyPersistsLatestState(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": passwordParamRouteTestProject(t),
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
		request := httptest.NewRequest(http.MethodPost, "/api"+route, strings.NewReader(body))
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		return response
	}

	for index := 0; index < 2; index += 1 {
		response := post(RouteDeleteKwarg, `{"projectConfigId":"project-alpha","sectionId":"dict-a"}`)
		if response.Code != http.StatusOK {
			t.Fatalf("expected 200 for %s on delete %d, got %d with body %q", RouteDeleteKwarg, index+1, response.Code, response.Body.String())
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

	sharedRootSharedModifier := decodeProjectRouteRawObject(t, payload.ProjectState.CodeObjs["shared-root"].SharedModifier)
	children, ok := sharedRootSharedModifier["children"].([]any)
	if !ok || children == nil {
		t.Fatalf("expected shared-root sharedModifier children array, got %#v", sharedRootSharedModifier["children"])
	}
	if len(children) != 0 {
		t.Fatalf("expected shared-root children [] after deleting all kwargs, got %#v", children)
	}

	dictVariantID := payload.ProjectState.ProjectConfig.SectionVariantMap["dict-a"]
	shown := payload.ProjectState.ShownParamIDs[dictVariantID]
	if got := shown.Pinned.TopLevelParamIDs; len(got) != 0 {
		t.Fatalf("expected no pinned shown params after deleting all kwargs, got %#v", got)
	}
	if got := shown.Unpinned.TopLevelParamIDs; len(got) != 0 {
		t.Fatalf("expected no unpinned shown params after deleting all kwargs, got %#v", got)
	}
	if len(shown.Pinned.RequiredParamIDsToPaths) != 0 {
		t.Fatalf("expected empty pinned path map after deleting all kwargs, got %#v", shown.Pinned.RequiredParamIDsToPaths)
	}
	if len(shown.Unpinned.RequiredParamIDsToPaths) != 0 {
		t.Fatalf("expected empty unpinned path map after deleting all kwargs, got %#v", shown.Unpinned.RequiredParamIDsToPaths)
	}
}

func TestRegisterProjectRoutesKwargMutationsRejectInvalidInputs(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": sectionEdgeRouteTestProject(t),
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
			route:        RouteAddKwarg,
			body:         `{"projectConfigId":"project-alpha","sectionId":"plain-section"}`,
			expectedCode: http.StatusUnprocessableEntity,
			expectedBody: `"code":"kwarg_mutation_invalid"`,
		},
		{
			route:        RouteDeleteKwarg,
			body:         `{"projectConfigId":"project-alpha","sectionId":"plain-section"}`,
			expectedCode: http.StatusUnprocessableEntity,
			expectedBody: `"code":"kwarg_mutation_invalid"`,
		},
	} {
		request := httptest.NewRequest(http.MethodPost, "/api"+requestSpec.route, strings.NewReader(requestSpec.body))
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

func TestRegisterProjectRoutesPasswordAndParamImplRoutesAreBlockedInDeploymentModes(t *testing.T) {
	t.Parallel()

	assertParamRoutesPreserved := func(t *testing.T, project projectstate.Project) {
		t.Helper()

		sharedRootPayload, _, _, sharedRootImpl, err := project.ResolveSectionCodeObject("dict-a", "shared-root")
		if err != nil {
			t.Fatalf("resolve shared-root: %v", err)
		}
		if sharedRootImpl.Type != "NestedParam" {
			t.Fatalf("expected shared-root impl NestedParam, got %q", sharedRootImpl.Type)
		}
		if children := decodeProjectRouteStringArray(sharedRootPayload["children"]); !reflect.DeepEqual(children, []string{"shared-child", "shared-secret"}) {
			t.Fatalf("expected shared-root children [shared-child shared-secret], got %#v", children)
		}

		dictVariantID := project.SectionVariantMap["dict-a"]
		dictPayload, err := project.EffectiveSectionPayload("dict-a", dictVariantID)
		if err != nil {
			t.Fatalf("effective section payload dict-a: %v", err)
		}
		codeObjVariantMap, ok := dictPayload["codeObjVariantMap"].(map[string]any)
		if !ok {
			t.Fatalf("expected dict codeObjVariantMap object, got %#v", dictPayload["codeObjVariantMap"])
		}
		if len(codeObjVariantMap) != 3 {
			t.Fatalf("expected dict codeObjVariantMap to keep 3 entries, got %#v", codeObjVariantMap)
		}
		for _, codeObjID := range []string{"shared-root", "shared-child", "shared-secret"} {
			if _, ok := codeObjVariantMap[codeObjID]; !ok {
				t.Fatalf("expected dict codeObjVariantMap to preserve %q, got %#v", codeObjID, codeObjVariantMap)
			}
		}

		sharedChildPayload, _, _, sharedChildImpl, err := project.ResolveSectionCodeObject("dict-a", "shared-child")
		if err != nil {
			t.Fatalf("resolve shared-child: %v", err)
		}
		if sharedChildImpl.Type != "TextParam" {
			t.Fatalf("expected shared-child impl TextParam, got %q", sharedChildImpl.Type)
		}
		if got, _ := sharedChildPayload["value"].(string); got != "seed" {
			t.Fatalf("expected shared-child value seed, got %#v", sharedChildPayload["value"])
		}
		if _, ok := sharedChildPayload["description"]; ok {
			t.Fatalf("expected rejected deployment mutations to leave shared-child description unset, got %#v", sharedChildPayload)
		}

		sharedSecretPayload, _, _, sharedSecretImpl, err := project.ResolveSectionCodeObject("dict-a", "shared-secret")
		if err != nil {
			t.Fatalf("resolve shared-secret: %v", err)
		}
		if sharedSecretImpl.Type != "PasswordParam" {
			t.Fatalf("expected shared-secret impl PasswordParam, got %q", sharedSecretImpl.Type)
		}
		if got, _ := sharedSecretPayload["value"].(string); got != "" {
			t.Fatalf("expected shared-secret value to stay redacted, got %#v", sharedSecretPayload["value"])
		}
		if _, ok := sharedSecretPayload["hasSecret"]; ok {
			t.Fatalf("expected rejected deployment mutations to avoid adding hasSecret state, got %#v", sharedSecretPayload)
		}
	}

	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
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
					name:  "get_password_param_value",
					route: RouteGetPasswordParamValue,
					body:  `{"projectConfigId":"project-alpha","sectionId":"dict-a","paramInfoId":"shared-secret"}`,
				},
				{
					name:  "change_param_impl",
					route: RouteChangeParamImpl,
					body:  `{"projectConfigId":"project-alpha","sectionId":"dict-a","paramInfoId":"shared-child","selectedId":"PasswordParam"}`,
				},
				{
					name:  "update_param_impl_config",
					route: RouteUpdateParamImplConfig,
					body:  `{"projectConfigId":"project-alpha","sectionId":"dict-a","paramInfoId":"shared-child","newConfig":{"description":"blocked"}}`,
				},
				{
					name:  "add_kwarg",
					route: RouteAddKwarg,
					body:  `{"projectConfigId":"project-alpha","sectionId":"dict-a"}`,
				},
				{
					name:  "delete_kwarg",
					route: RouteDeleteKwarg,
					body:  `{"projectConfigId":"project-alpha","sectionId":"dict-a"}`,
				},
			} {
				t.Run(requestSpec.name, func(t *testing.T) {
					deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
						Mode: mode,
						Document: projectstate.Document{
							SchemaVersion:    projectstate.CurrentSchemaVersion,
							DefaultProjectID: "project-alpha",
							Projects: map[string]projectstate.Project{
								"project-alpha": passwordParamRouteTestProject(t),
							},
						},
						Policy: map[string]any{
							"allowParamChanges": true,
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
					assertParamRoutesPreserved(t, overlay.Snapshot().Document.Projects["project-alpha"])
					assertParamRoutesPreserved(t, deploymentRuntime.Base().Snapshot().Document.Projects["project-alpha"])
				})
			}
		})
	}
}

func TestRegisterProjectRoutesBrowserMetadataMutationsPersistLatestState(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": browserSectionRouteTestProject(t),
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

	latestBrowserModifier := func() map[string]any {
		t.Helper()

		latestResponse := post(RouteGetLatestProjectState, `{"projectConfigId":"project-alpha"}`)
		if latestResponse.Code != http.StatusOK {
			t.Fatalf("expected 200 latest-state response, got %d with body %q", latestResponse.Code, latestResponse.Body.String())
		}

		var payload ProjectStateSingleConfigWithCompletedOpIDs
		if err := json.Unmarshal(latestResponse.Body.Bytes(), &payload); err != nil {
			t.Fatalf("decode latest project payload: %v", err)
		}
		return decodeProjectRouteRawObject(t, payload.ProjectState.Sections["browser-section"].SharedModifier)
	}

	response := post(RouteSetBrowserColumnWidths, `{"projectConfigId":"project-alpha","sectionId":"browser-section","columnWidth":240.5,"typesColumnWidth":160}`)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200 for %s, got %d with body %q", RouteSetBrowserColumnWidths, response.Code, response.Body.String())
	}
	for _, viewMode := range []string{"list", "thumbnail", "carousel"} {
		response = post(RouteSetBrowserAreaViewMode, `{"projectConfigId":"project-alpha","sectionId":"browser-section","viewMode":"`+viewMode+`"}`)
		if response.Code != http.StatusOK {
			t.Fatalf("expected 200 for %s=%s, got %d with body %q", RouteSetBrowserAreaViewMode, viewMode, response.Code, response.Body.String())
		}
		if got := latestBrowserModifier()["viewMode"]; got != viewMode {
			t.Fatalf("expected viewMode %s, got %#v", viewMode, got)
		}
	}
	response = post(RouteSetBrowserHideColumn, `{"projectConfigId":"project-alpha","sectionId":"browser-section","hideColumn":true}`)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200 for %s, got %d with body %q", RouteSetBrowserHideColumn, response.Code, response.Body.String())
	}
	response = post(
		RouteSetBrowserSavedSearches,
		`{"projectConfigId":"project-alpha","sectionId":"browser-section","savedSearches":[{"id":"images","name":"Images","query":"png","searchScope":"local","typeFilters":{"image":true,"video":false,"audio":false,"text":false,"data":false},"color":"#ef4444","quickInfo":"Only images"},{"id":"defaults","name":"Defaults","query":"todo","color":"#3b82f6","quickInfo":""},{"id":"recursive","name":"Recursive","query":"notes","searchScope":"recursive","color":"#10b981","quickInfo":""}]}`,
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200 for %s, got %d with body %q", RouteSetBrowserSavedSearches, response.Code, response.Body.String())
	}

	browserSharedModifier := latestBrowserModifier()
	if browserSharedModifier["columnWidth"] != 240.5 {
		t.Fatalf("expected columnWidth 240.5, got %#v", browserSharedModifier["columnWidth"])
	}
	if browserSharedModifier["typesColumnWidth"] != 160.0 {
		t.Fatalf("expected typesColumnWidth 160.0, got %#v", browserSharedModifier["typesColumnWidth"])
	}
	if browserSharedModifier["viewMode"] != "carousel" {
		t.Fatalf("expected final viewMode carousel, got %#v", browserSharedModifier["viewMode"])
	}
	if browserSharedModifier["hideColumn"] != true {
		t.Fatalf("expected hideColumn=true, got %#v", browserSharedModifier["hideColumn"])
	}

	savedSearches, ok := browserSharedModifier["savedSearches"].([]any)
	if !ok || len(savedSearches) != 3 {
		t.Fatalf("expected three saved searches, got %#v", browserSharedModifier["savedSearches"])
	}
	secondSavedSearch, ok := savedSearches[1].(map[string]any)
	if !ok {
		t.Fatalf("expected second saved search object, got %#v", savedSearches[1])
	}
	if secondSavedSearch["searchScope"] != "recursive" {
		t.Fatalf("expected blank searchScope to normalize to recursive, got %#v", secondSavedSearch["searchScope"])
	}
	secondTypeFilters, ok := secondSavedSearch["typeFilters"].(map[string]any)
	if !ok {
		t.Fatalf("expected second saved search typeFilters object, got %#v", secondSavedSearch["typeFilters"])
	}
	for _, key := range []string{"image", "video", "audio", "text", "data"} {
		if secondTypeFilters[key] != true {
			t.Fatalf("expected default type filter %s=true, got %#v", key, secondTypeFilters[key])
		}
	}
	thirdSavedSearch, ok := savedSearches[2].(map[string]any)
	if !ok {
		t.Fatalf("expected third saved search object, got %#v", savedSearches[2])
	}
	if thirdSavedSearch["searchScope"] != "recursive" {
		t.Fatalf("expected explicit recursive searchScope, got %#v", thirdSavedSearch["searchScope"])
	}
}

func TestRegisterProjectRoutesSetCodeFileBindingPersistsLatestState(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": codeFileBindingRouteTestProject(t),
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

	for _, accessMode := range []projectstate.CodeFileAccessMode{
		projectstate.CodeFileAccessModeReadWrite,
		projectstate.CodeFileAccessModeReadOnly,
		projectstate.CodeFileAccessModeWriteOnly,
	} {
		response := post(
			RouteSetCodeFileBinding,
			`{"projectConfigId":"project-alpha","sectionId":"code-section","binding":{"canonical_path":"./pkg/../pkg/`+string(accessMode)+`.py","access_mode":"`+string(accessMode)+`"}}`,
		)
		if response.Code != http.StatusOK {
			t.Fatalf("expected 200 for %s, got %d with body %q", accessMode, response.Code, response.Body.String())
		}

		latestResponse := post(RouteGetLatestProjectState, `{"projectConfigId":"project-alpha"}`)
		if latestResponse.Code != http.StatusOK {
			t.Fatalf("expected 200 latest-state response for %s, got %d with body %q", accessMode, latestResponse.Code, latestResponse.Body.String())
		}

		var payload ProjectStateSingleConfigWithCompletedOpIDs
		if err := json.Unmarshal(latestResponse.Body.Bytes(), &payload); err != nil {
			t.Fatalf("decode latest project payload for %s: %v", accessMode, err)
		}

		codeSection := payload.ProjectState.Sections["code-section"]
		codeSharedModifier := decodeProjectRouteRawObject(t, codeSection.SharedModifier)
		rawBinding, ok := codeSharedModifier["codeFileBinding"].(map[string]any)
		if !ok {
			t.Fatalf("expected codeFileBinding object for %s, got %#v", accessMode, codeSharedModifier["codeFileBinding"])
		}
		if rawBinding["canonical_path"] != "pkg/"+string(accessMode)+".py" {
			t.Fatalf("expected canonical_path pkg/%s.py, got %#v", accessMode, rawBinding["canonical_path"])
		}
		if rawBinding["access_mode"] != string(accessMode) {
			t.Fatalf("expected access_mode %s, got %#v", accessMode, rawBinding["access_mode"])
		}
		if rawBinding["autoBinding"] != false {
			t.Fatalf("expected autoBinding=false for %s, got %#v", accessMode, rawBinding["autoBinding"])
		}

		project := projectRuntime.Snapshot().Document.Projects["project-alpha"]
		_, _, impl, err := project.ResolveSection("code-section")
		if err != nil {
			t.Fatalf("resolve code section for %s: %v", accessMode, err)
		}
		if impl.Code == nil || impl.Code.Binding == nil {
			t.Fatalf("expected code impl binding for %s, got %#v", accessMode, impl.Code)
		}
		if impl.Code.Binding.Path != "pkg/"+string(accessMode)+".py" {
			t.Fatalf("expected impl binding path pkg/%s.py, got %q", accessMode, impl.Code.Binding.Path)
		}
		if impl.Code.Binding.AccessMode != accessMode {
			t.Fatalf("expected impl binding access mode %s, got %q", accessMode, impl.Code.Binding.AccessMode)
		}
	}
}

func TestRegisterProjectRoutesSetCodeFileBindingRejectsInvalidInputs(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": codeFileBindingRouteTestProject(t),
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
			body:         `{"projectConfigId":"project-alpha","sectionId":"plain-section","binding":{"canonical_path":"pkg/plain.py","access_mode":"read_write"}}`,
			expectedCode: http.StatusBadRequest,
			expectedBody: `"code":"invalid_code_section"`,
		},
		{
			body:         `{"projectConfigId":"project-alpha","sectionId":"code-section","binding":{"canonical_path":" ","access_mode":"read_only"}}`,
			expectedCode: http.StatusBadRequest,
			expectedBody: `"code":"code_file_binding_path_required"`,
		},
		{
			body:         `{"projectConfigId":"project-alpha","sectionId":"code-section","binding":{"canonical_path":"pkg/invalid.py","access_mode":"execute"}}`,
			expectedCode: http.StatusBadRequest,
			expectedBody: `"code":"code_file_access_mode_invalid"`,
		},
	} {
		request := httptest.NewRequest(
			http.MethodPost,
			"/api"+RouteSetCodeFileBinding,
			strings.NewReader(requestSpec.body),
		)
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != requestSpec.expectedCode {
			t.Fatalf("expected %d, got %d with body %q", requestSpec.expectedCode, response.Code, response.Body.String())
		}
		if !strings.Contains(response.Body.String(), requestSpec.expectedBody) {
			t.Fatalf("expected response body to contain %s, got %q", requestSpec.expectedBody, response.Body.String())
		}
	}
}

func TestRegisterProjectRoutesBrowserMetadataMutationsRejectInvalidInputs(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": browserSectionRouteTestProject(t),
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
		name                string
		route               string
		body                string
		expectedCode        int
		expectedErrorCode   string
		expectedMessagePart string
	}{
		{
			name:                "browser_mutation_requires_browser_section",
			route:               RouteSetBrowserHideColumn,
			body:                `{"projectConfigId":"project-alpha","sectionId":"plain-section","hideColumn":true}`,
			expectedCode:        http.StatusUnprocessableEntity,
			expectedErrorCode:   "browser_section_required",
			expectedMessagePart: "Section must resolve to a browser section.",
		},
		{
			name:                "view_mode_rejects_unknown_literal_at_transport",
			route:               RouteSetBrowserAreaViewMode,
			body:                `{"projectConfigId":"project-alpha","sectionId":"browser-section","viewMode":"grid"}`,
			expectedCode:        http.StatusUnprocessableEntity,
			expectedErrorCode:   "invalid_request",
			expectedMessagePart: `Invalid viewMode value "grid".`,
		},
		{
			name:                "view_mode_rejects_padded_literal_without_trimming",
			route:               RouteSetBrowserAreaViewMode,
			body:                `{"projectConfigId":"project-alpha","sectionId":"browser-section","viewMode":" thumbnail "}`,
			expectedCode:        http.StatusUnprocessableEntity,
			expectedErrorCode:   "invalid_request",
			expectedMessagePart: `Invalid viewMode value " thumbnail ".`,
		},
		{
			name:                "saved_search_scope_rejects_unknown_literal_at_transport",
			route:               RouteSetBrowserSavedSearches,
			body:                `{"projectConfigId":"project-alpha","sectionId":"browser-section","savedSearches":[{"id":"bad","searchScope":"global"}]}`,
			expectedCode:        http.StatusUnprocessableEntity,
			expectedErrorCode:   "invalid_request",
			expectedMessagePart: `Invalid searchScope value "global".`,
		},
		{
			name:                "saved_search_scope_rejects_blank_present_field",
			route:               RouteSetBrowserSavedSearches,
			body:                `{"projectConfigId":"project-alpha","sectionId":"browser-section","savedSearches":[{"id":"bad","searchScope":""}]}`,
			expectedCode:        http.StatusUnprocessableEntity,
			expectedErrorCode:   "invalid_request",
			expectedMessagePart: `Invalid searchScope value "".`,
		},
		{
			name:                "saved_search_scope_rejects_padded_present_field",
			route:               RouteSetBrowserSavedSearches,
			body:                `{"projectConfigId":"project-alpha","sectionId":"browser-section","savedSearches":[{"id":"bad","searchScope":" local "} ]}`,
			expectedCode:        http.StatusUnprocessableEntity,
			expectedErrorCode:   "invalid_request",
			expectedMessagePart: `Invalid searchScope value " local ".`,
		},
	} {
		response := post(requestSpec.route, requestSpec.body)
		if response.Code != requestSpec.expectedCode {
			t.Fatalf("%s: expected %d for %s, got %d with body %q", requestSpec.name, requestSpec.expectedCode, requestSpec.route, response.Code, response.Body.String())
		}

		var payload errorResponse
		if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
			t.Fatalf("%s: decode error payload: %v", requestSpec.name, err)
		}
		if payload.Error.Code != requestSpec.expectedErrorCode {
			t.Fatalf("%s: expected error code %q, got %#v", requestSpec.name, requestSpec.expectedErrorCode, payload)
		}
		if !strings.Contains(payload.Error.Message, requestSpec.expectedMessagePart) {
			t.Fatalf("%s: expected error message to contain %q, got %#v", requestSpec.name, requestSpec.expectedMessagePart, payload)
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

	browserVariantID := payload.ProjectState.ProjectConfig.SectionVariantMap["browser-section"]
	browserImplID := payload.ProjectState.SectionVariants[browserVariantID].Impl
	browserImplPayload := decodeProjectRouteRawObject(t, payload.ProjectState.SectionImpls[browserImplID])
	if got := browserImplPayload["viewMode"]; got != "list" {
		t.Fatalf("expected rejected browser view-mode requests to leave viewMode unchanged, got %#v", got)
	}
	if got := browserImplPayload["savedSearches"]; !reflect.DeepEqual(got, []any{}) {
		t.Fatalf("expected rejected saved-search requests to leave savedSearches unchanged, got %#v", got)
	}
}

func TestRegisterProjectRoutesBrowserMetadataUsesDeploymentOverlayWhenLayoutChangesAllowed(t *testing.T) {
	t.Parallel()

	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
			deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
				Mode: mode,
				Document: projectstate.Document{
					SchemaVersion:    projectstate.CurrentSchemaVersion,
					DefaultProjectID: "project-alpha",
					Projects: map[string]projectstate.Project{
						"project-alpha": browserSectionRouteTestProject(t),
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
			for _, requestSpec := range []struct {
				route string
				body  string
			}{
				{
					route: RouteSetBrowserColumnWidths,
					body:  `{"projectConfigId":"project-alpha","sectionId":"browser-section","columnWidth":240.5,"typesColumnWidth":160}`,
				},
				{
					route: RouteSetBrowserAreaViewMode,
					body:  `{"projectConfigId":"project-alpha","sectionId":"browser-section","viewMode":"thumbnail"}`,
				},
				{
					route: RouteSetBrowserHideColumn,
					body:  `{"projectConfigId":"project-alpha","sectionId":"browser-section","hideColumn":true}`,
				},
				{
					route: RouteSetBrowserSavedSearches,
					body:  `{"projectConfigId":"project-alpha","sectionId":"browser-section","savedSearches":[{"id":"images","name":"Images","query":"png","searchScope":"local","typeFilters":{"image":true,"video":false,"audio":false,"text":false,"data":false},"color":"#ef4444","quickInfo":"Only images"},{"id":"defaults","name":"Defaults","query":"todo","color":"#3b82f6","quickInfo":""}]}`,
				},
			} {
				request := httptest.NewRequest(http.MethodPost, "/api"+requestSpec.route, strings.NewReader(requestSpec.body))
				request.Header.Set("Content-Type", "application/json")
				request.Header.Set(modes.ShareSessionHeaderName, "share-a")
				response := httptest.NewRecorder()
				handler.ServeHTTP(response, request)
				if response.Code != http.StatusOK {
					t.Fatalf("expected 200 for %s, got %d with body %q", requestSpec.route, response.Code, response.Body.String())
				}
			}

			overlay, err := deploymentRuntime.Overlay("share-a")
			if err != nil {
				t.Fatalf("deployment overlay: %v", err)
			}
			overlaySharedModifier := decodeProjectRouteRawObject(t, overlay.Snapshot().Document.Projects["project-alpha"].Sections["browser-section"].SharedModifier)
			if overlaySharedModifier["columnWidth"] != 240.5 {
				t.Fatalf("expected overlay columnWidth 240.5, got %#v", overlaySharedModifier["columnWidth"])
			}
			if overlaySharedModifier["typesColumnWidth"] != 160.0 {
				t.Fatalf("expected overlay typesColumnWidth 160.0, got %#v", overlaySharedModifier["typesColumnWidth"])
			}
			if overlaySharedModifier["viewMode"] != "thumbnail" {
				t.Fatalf("expected overlay viewMode thumbnail, got %#v", overlaySharedModifier["viewMode"])
			}
			if overlaySharedModifier["hideColumn"] != true {
				t.Fatalf("expected overlay hideColumn=true, got %#v", overlaySharedModifier["hideColumn"])
			}
			overlaySavedSearches, ok := overlaySharedModifier["savedSearches"].([]any)
			if !ok || len(overlaySavedSearches) != 2 {
				t.Fatalf("expected overlay saved searches, got %#v", overlaySharedModifier["savedSearches"])
			}
			secondOverlaySavedSearch, ok := overlaySavedSearches[1].(map[string]any)
			if !ok {
				t.Fatalf("expected overlay second saved search object, got %#v", overlaySavedSearches[1])
			}
			if secondOverlaySavedSearch["searchScope"] != "recursive" {
				t.Fatalf("expected overlay blank searchScope to normalize to recursive, got %#v", secondOverlaySavedSearch["searchScope"])
			}

			baseSharedModifier := decodeProjectRouteRawObject(t, deploymentRuntime.Base().Snapshot().Document.Projects["project-alpha"].Sections["browser-section"].SharedModifier)
			if len(baseSharedModifier) != 0 {
				t.Fatalf("expected base browser shared modifier unchanged, got %#v", baseSharedModifier)
			}
		})
	}
}
