package httpapi

import (
	"context"
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

func TestRegisterProjectRoutesPrepareAndPasteSectionsRejectInvalidInputs(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-source",
		Projects: map[string]projectstate.Project{
			"project-source": copyPasteRouteSourceProject(t),
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
			route:        RoutePrepareSectionsForCopy,
			body:         `{"projectConfigId":"project-source","sectionIds":[""]}`,
			expectedCode: http.StatusBadRequest,
			expectedBody: `"code":"section_ids_invalid"`,
		},
		{
			route: RoutePasteSections,
			body: `{
				"projectConfigId":"project-source",
				"data":{
					"core":{
						"sections":{"bad":{"id":"bad","name":"Bad","displayName":"","variants":["bad-variant"],"defaultVariant":"bad-variant","sharedModifier":{},"unsharedKeys":[]}},
						"sectionImpls":{},
						"sectionVariants":{"bad-variant":{"id":"bad-variant","name":"Bad Variant","implId":"missing-impl","nonPresetImplIds":[],"modifier":{},"isFrozen":false}},
						"codeObjs":{},
						"codeObjImpls":{},
						"codeObjVariants":{}
					},
					"sectionVariantMap":{"bad":"bad-variant"}
				},
				"position":{"x":1,"y":2},
				"asRef":false
			}`,
			expectedCode: http.StatusUnprocessableEntity,
			expectedBody: `"code":"paste_sections_invalid"`,
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

func TestRegisterProjectRoutesPrepareSectionsForCopyUsesDeploymentOverlayRegardlessOfParamPolicy(t *testing.T) {
	t.Parallel()

	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		for _, allowParamChanges := range []bool{true, false} {
			t.Run(fmt.Sprintf("%s/%t", mode, allowParamChanges), func(t *testing.T) {
				deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
					Mode: mode,
					Document: projectstate.Document{
						SchemaVersion:    projectstate.CurrentSchemaVersion,
						DefaultProjectID: "project-source",
						Projects: map[string]projectstate.Project{
							"project-source": copyPasteRouteSourceProject(t),
						},
					},
					Policy: map[string]any{
						"allowParamChanges": allowParamChanges,
					},
				})
				if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
					t.Fatalf("create deployment session: %v", err)
				}

				overlay, err := deploymentRuntime.Overlay("share-a")
				if err != nil {
					t.Fatalf("deployment overlay: %v", err)
				}
				if _, err := overlay.SetSectionVariantName(context.Background(), "project-source", "group-root-variant", "Overlay Variant"); err != nil {
					t.Fatalf("set overlay variant name: %v", err)
				}

				handler := newProjectRouteDeploymentTestHandler(t, mode, deploymentRuntime)
				request := httptest.NewRequest(
					http.MethodPost,
					"/api"+RoutePrepareSectionsForCopy,
					strings.NewReader(`{"projectConfigId":"project-source","sectionIds":["group-root"]}`),
				)
				request.Header.Set("Content-Type", "application/json")
				request.Header.Set(modes.ShareSessionHeaderName, "share-a")
				response := httptest.NewRecorder()
				handler.ServeHTTP(response, request)
				if response.Code != http.StatusOK {
					t.Fatalf("expected 200 for %s, got %d with body %q", RoutePrepareSectionsForCopy, response.Code, response.Body.String())
				}

				var clipboard projectstate.SectionsClipboardData
				if err := json.Unmarshal(response.Body.Bytes(), &clipboard); err != nil {
					t.Fatalf("decode prepareSectionsForCopy payload: %v", err)
				}
				if got := clipboard.Data.Core.SectionVariants["group-root-variant"].Name; got != "Overlay Variant" {
					t.Fatalf("expected clipboard to use overlay variant name %q, got %q", "Overlay Variant", got)
				}

				baseProject := deploymentRuntime.Base().Snapshot().Document.Projects["project-source"]
				if got := baseProject.SectionVariants["group-root-variant"].Name; got != "" {
					t.Fatalf("expected base variant name unchanged, got %q", got)
				}
			})
		}
	}
}

func TestRegisterProjectRoutesPasteSectionsRemainsIDEOnlyInDeployment(t *testing.T) {
	t.Parallel()

	assertProjectUnchanged := func(t *testing.T, project projectstate.Project) {
		t.Helper()

		if len(project.Sections) != 3 {
			t.Fatalf("expected three existing sections after rejected paste, got %#v", project.Sections)
		}
		if _, ok := project.Sections["group-root"]; !ok {
			t.Fatalf("expected group-root to remain present, got %#v", project.Sections)
		}
		if _, ok := project.Sections["group-child-a"]; !ok {
			t.Fatalf("expected group-child-a to remain present, got %#v", project.Sections)
		}
		if _, ok := project.Sections["group-child-b"]; !ok {
			t.Fatalf("expected group-child-b to remain present, got %#v", project.Sections)
		}
	}

	requestBody, err := json.Marshal(PasteSectionsRequest{
		ProjectID: "project-source",
		Data: projectstate.ClipboardProjectStateCoreWithSectionVariantMap{
			Core:              projectstate.ClipboardProjectStateCore{},
			SectionVariantMap: map[string]string{},
		},
		Position: projectstate.Position{X: 0, Y: 0},
		AsRef:    false,
	})
	if err != nil {
		t.Fatalf("marshal pasteSections request: %v", err)
	}

	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
			deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
				Mode: mode,
				Document: projectstate.Document{
					SchemaVersion:    projectstate.CurrentSchemaVersion,
					DefaultProjectID: "project-source",
					Projects: map[string]projectstate.Project{
						"project-source": copyPasteRouteSourceProject(t),
					},
				},
			})
			if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
				t.Fatalf("create deployment session: %v", err)
			}

			handler := newProjectRouteDeploymentTestHandler(t, mode, deploymentRuntime)
			request := httptest.NewRequest(
				http.MethodPost,
				"/api"+RoutePasteSections,
				strings.NewReader(string(requestBody)),
			)
			request.Header.Set("Content-Type", "application/json")
			request.Header.Set(modes.ShareSessionHeaderName, "share-a")
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			if response.Code != http.StatusForbidden {
				t.Fatalf("expected 403 for %s in %s mode, got %d with body %q", RoutePasteSections, mode, response.Code, response.Body.String())
			}
			if !strings.Contains(response.Body.String(), `"code":"mode_forbidden"`) {
				t.Fatalf("expected mode_forbidden for %s in %s mode, got %q", RoutePasteSections, mode, response.Body.String())
			}
			if !strings.Contains(response.Body.String(), "Deployment mode does not allow this endpoint.") {
				t.Fatalf("expected deployment-mode denial detail for %s in %s mode, got %q", RoutePasteSections, mode, response.Body.String())
			}

			overlay, err := deploymentRuntime.Overlay("share-a")
			if err != nil {
				t.Fatalf("deployment overlay: %v", err)
			}
			assertProjectUnchanged(t, overlay.Snapshot().Document.Projects["project-source"])
			assertProjectUnchanged(t, deploymentRuntime.Base().Snapshot().Document.Projects["project-source"])
		})
	}
}

func TestRegisterProjectRoutesChildSectionMutationsPersistLatestState(t *testing.T) {
	t.Parallel()

	harness := newProjectChildMutationRouteHarness(t)

	terminalID := createProjectRouteTerminalChild(t, harness)
	createdSiblingID := createProjectRouteSiblingViaIncrementer(t, harness)
	deleteProjectRouteSiblingViaDecrementer(t, harness, createdSiblingID)

	payload := latestProjectChildMutationPayload(t, harness)
	assertProjectRouteTerminalChildPersisted(t, payload, terminalID)
	assertProjectRouteSiblingDeletionPersisted(t, payload, createdSiblingID)
}

type projectChildMutationRouteHarness struct {
	handler http.Handler
}

func newProjectChildMutationRouteHarness(t *testing.T) projectChildMutationRouteHarness {
	t.Helper()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": childSectionRouteTestProject(t),
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
	return projectChildMutationRouteHarness{handler: handler}
}

func postProjectChildMutationRoute(
	t *testing.T,
	harness projectChildMutationRouteHarness,
	route string,
	body string,
) *httptest.ResponseRecorder {
	t.Helper()

	request := httptest.NewRequest(http.MethodPost, "/api"+route, strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	harness.handler.ServeHTTP(response, request)
	return response
}

func createProjectRouteTerminalChild(t *testing.T, harness projectChildMutationRouteHarness) string {
	t.Helper()

	createTerminalResponse := postProjectChildMutationRoute(t, harness, RouteCreateChildSections, `{"projectConfigId":"project-alpha","parentId":"code-section","implType":"Terminal","numChildren":1,"startIdx":0}`)
	if createTerminalResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 for %s, got %d with body %q", RouteCreateChildSections, createTerminalResponse.Code, createTerminalResponse.Body.String())
	}
	var createTerminalPayload projectstate.CreateChildSectionsResult
	if err := json.Unmarshal(createTerminalResponse.Body.Bytes(), &createTerminalPayload); err != nil {
		t.Fatalf("decode create child response: %v", err)
	}
	if len(createTerminalPayload.SectionIDs) != 1 {
		t.Fatalf("expected one created terminal id, got %#v", createTerminalPayload.SectionIDs)
	}
	return createTerminalPayload.SectionIDs[0]
}

func createProjectRouteSiblingViaIncrementer(t *testing.T, harness projectChildMutationRouteHarness) string {
	t.Helper()

	createSiblingResponse := postProjectChildMutationRoute(t, harness, RouteCreateChildSectionsViaIncrementer, `{"projectConfigId":"project-alpha","calledBy":"child-a","implType":"TextBlock","numChildren":1}`)
	if createSiblingResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 for %s, got %d with body %q", RouteCreateChildSectionsViaIncrementer, createSiblingResponse.Code, createSiblingResponse.Body.String())
	}
	var createSiblingPayload projectstate.CreateChildSectionsResult
	if err := json.Unmarshal(createSiblingResponse.Body.Bytes(), &createSiblingPayload); err != nil {
		t.Fatalf("decode incrementer child response: %v", err)
	}
	if len(createSiblingPayload.SectionIDs) != 1 {
		t.Fatalf("expected one created incrementer child id, got %#v", createSiblingPayload.SectionIDs)
	}
	return createSiblingPayload.SectionIDs[0]
}

func deleteProjectRouteSiblingViaDecrementer(
	t *testing.T,
	harness projectChildMutationRouteHarness,
	createdSiblingID string,
) {
	t.Helper()

	deleteSiblingResponse := postProjectChildMutationRoute(t, harness, RouteDeleteChildSectionsViaDecrementer, `{"projectConfigId":"project-alpha","calledBy":"child-a","numChildren":1}`)
	if deleteSiblingResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 for %s, got %d with body %q", RouteDeleteChildSectionsViaDecrementer, deleteSiblingResponse.Code, deleteSiblingResponse.Body.String())
	}
	var deleteSiblingPayload projectstate.DeleteSectionsResult
	if err := json.Unmarshal(deleteSiblingResponse.Body.Bytes(), &deleteSiblingPayload); err != nil {
		t.Fatalf("decode decrementer delete response: %v", err)
	}
	if !reflect.DeepEqual(deleteSiblingPayload.SectionIDs, []string{createdSiblingID}) {
		t.Fatalf("expected deleted child ids [%s], got %#v", createdSiblingID, deleteSiblingPayload.SectionIDs)
	}
}

func latestProjectChildMutationPayload(
	t *testing.T,
	harness projectChildMutationRouteHarness,
) ProjectStateSingleConfigWithCompletedOpIDs {
	t.Helper()

	latestResponse := postProjectChildMutationRoute(t, harness, RouteGetLatestProjectState, `{"projectConfigId":"project-alpha"}`)
	if latestResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 latest-state response, got %d with body %q", latestResponse.Code, latestResponse.Body.String())
	}

	var payload ProjectStateSingleConfigWithCompletedOpIDs
	if err := json.Unmarshal(latestResponse.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode latest project payload: %v", err)
	}
	return payload
}

func assertProjectRouteTerminalChildPersisted(
	t *testing.T,
	payload ProjectStateSingleConfigWithCompletedOpIDs,
	terminalID string,
) {
	t.Helper()

	if _, ok := payload.ProjectState.Sections[terminalID]; !ok {
		t.Fatalf("expected created terminal section %q to exist", terminalID)
	}
	if parent := payload.ProjectState.ParentSectionMap[terminalID]; parent == nil || *parent != "code-section" {
		t.Fatalf("expected terminal parent code-section, got %#v", parent)
	}
	codeVariantID := payload.ProjectState.ProjectConfig.SectionVariantMap["code-section"]
	codeImplID := payload.ProjectState.SectionVariants[codeVariantID].Impl
	codePayload := decodeProjectRouteRawObject(t, payload.ProjectState.SectionImpls[codeImplID])
	if got := codePayload["attachedTerminalSectionId"]; got != terminalID {
		t.Fatalf("expected attachedTerminalSectionId %q, got %#v", terminalID, got)
	}
	if got := decodeProjectRouteStringArray(codePayload["children"]); !reflect.DeepEqual(got, []string{terminalID}) {
		t.Fatalf("expected code children [%s], got %#v", terminalID, got)
	}
}

func assertProjectRouteSiblingDeletionPersisted(
	t *testing.T,
	payload ProjectStateSingleConfigWithCompletedOpIDs,
	createdSiblingID string,
) {
	t.Helper()

	if _, ok := payload.ProjectState.Sections[createdSiblingID]; ok {
		t.Fatalf("expected created incrementer child %q to be deleted", createdSiblingID)
	}
	groupVariantID := payload.ProjectState.ProjectConfig.SectionVariantMap["group-parent"]
	groupImplID := payload.ProjectState.SectionVariants[groupVariantID].Impl
	groupPayload := decodeProjectRouteRawObject(t, payload.ProjectState.SectionImpls[groupImplID])
	if got := decodeProjectRouteStringArray(groupPayload["children"]); !reflect.DeepEqual(got, []string{"child-a", "child-b"}) {
		t.Fatalf("expected group children [child-a child-b], got %#v", got)
	}
}

func TestRegisterProjectRoutesChildSectionMutationsSupportExpandedTypes(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": childSectionRouteTestProject(t),
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

	createBrowserResponse := post(RouteCreateChildSections, `{"projectConfigId":"project-alpha","parentId":"group-parent","implType":"Browser","numChildren":1}`)
	if createBrowserResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 for browser child create, got %d with body %q", createBrowserResponse.Code, createBrowserResponse.Body.String())
	}
	var createBrowserPayload projectstate.CreateChildSectionsResult
	if err := json.Unmarshal(createBrowserResponse.Body.Bytes(), &createBrowserPayload); err != nil {
		t.Fatalf("decode browser child create response: %v", err)
	}
	if len(createBrowserPayload.SectionIDs) != 1 {
		t.Fatalf("expected one browser child id, got %#v", createBrowserPayload.SectionIDs)
	}

	createMetaControlResponse := post(RouteCreateChildSectionsViaIncrementer, `{"projectConfigId":"project-alpha","calledBy":"child-a","implType":"MetaControl","numChildren":1}`)
	if createMetaControlResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 for meta control incrementer create, got %d with body %q", createMetaControlResponse.Code, createMetaControlResponse.Body.String())
	}
	var createMetaControlPayload projectstate.CreateChildSectionsResult
	if err := json.Unmarshal(createMetaControlResponse.Body.Bytes(), &createMetaControlPayload); err != nil {
		t.Fatalf("decode meta control incrementer response: %v", err)
	}
	if len(createMetaControlPayload.SectionIDs) != 1 {
		t.Fatalf("expected one meta control child id, got %#v", createMetaControlPayload.SectionIDs)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project snapshot: %v", err)
	}

	_, _, browserImpl, err := project.ResolveSection(createBrowserPayload.SectionIDs[0])
	if err != nil {
		t.Fatalf("resolve browser child: %v", err)
	}
	browserPayload := decodeProjectRouteRawObject(t, browserImpl.Payload)
	if got, _ := browserPayload["type"].(string); got != "Browser" {
		t.Fatalf("expected browser payload type Browser, got %q", got)
	}
	if got, _ := browserPayload["viewMode"].(string); got != string(projectstate.BrowserAreaViewModeList) {
		t.Fatalf("expected browser view mode %q, got %q", projectstate.BrowserAreaViewModeList, got)
	}

	_, _, metaControlImpl, err := project.ResolveSection(createMetaControlPayload.SectionIDs[0])
	if err != nil {
		t.Fatalf("resolve meta control child: %v", err)
	}
	metaControlPayload := decodeProjectRouteRawObject(t, metaControlImpl.Payload)
	if got, _ := metaControlPayload["type"].(string); got != "MetaControl" {
		t.Fatalf("expected meta control payload type MetaControl, got %q", got)
	}
	metaControlParamID, _ := metaControlPayload["metaControlParamId"].(string)
	if strings.TrimSpace(metaControlParamID) == "" {
		t.Fatalf("expected meta control child param id, got %#v", metaControlPayload)
	}
	if _, ok := project.CodeObjs[metaControlParamID]; !ok {
		t.Fatalf("expected meta control code object %q to exist, got %#v", metaControlParamID, project.CodeObjs)
	}
}

func TestRegisterProjectRoutesCreateChildSectionsSupportsSourceSingletonAndGeneratedTypes(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": childSectionRouteTestProject(t),
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
		request := httptest.NewRequest(http.MethodPost, "/api"+RouteCreateChildSections, strings.NewReader(body))
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		return response
	}

	testCases := []struct {
		name         string
		implType     string
		expectedName string
		expectedKind projectstate.SectionKind
		expectedGen  projectstate.GeneratedSectionKind
	}{
		{
			name:         "global variables",
			implType:     "GlobalVariables",
			expectedName: "Global Variables",
			expectedKind: projectstate.SectionKind("frontend"),
		},
		{
			name:         "generated python code",
			implType:     "GenPythonCode",
			expectedName: "Generated Python Code",
			expectedKind: projectstate.SectionKindGenerated,
			expectedGen:  projectstate.GeneratedSectionKindPythonCode,
		},
		{
			name:         "generated python metadata",
			implType:     "GenPythonMetadata",
			expectedName: "Generated Python Metadata",
			expectedKind: projectstate.SectionKindGenerated,
			expectedGen:  projectstate.GeneratedSectionKindPythonMetadata,
		},
	}

	for _, tc := range testCases {
		response := post(fmt.Sprintf(`{"projectConfigId":"project-alpha","parentId":"group-parent","implType":"%s","numChildren":1}`, tc.implType))
		if response.Code != http.StatusOK {
			t.Fatalf("expected 200 for %s child create, got %d with body %q", tc.name, response.Code, response.Body.String())
		}

		var payload projectstate.CreateChildSectionsResult
		if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
			t.Fatalf("decode %s child create response: %v", tc.name, err)
		}
		if len(payload.SectionIDs) != 1 {
			t.Fatalf("expected one %s child id, got %#v", tc.name, payload.SectionIDs)
		}

		project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
		if err != nil {
			t.Fatalf("project snapshot after %s child create: %v", tc.name, err)
		}
		createdSection, ok := project.Sections[payload.SectionIDs[0]]
		if !ok {
			t.Fatalf("expected created %s section %q", tc.name, payload.SectionIDs[0])
		}
		if createdSection.Name != tc.expectedName {
			t.Fatalf("expected %s child name %q, got %q", tc.name, tc.expectedName, createdSection.Name)
		}
		_, _, impl, err := project.ResolveSection(payload.SectionIDs[0])
		if err != nil {
			t.Fatalf("resolve %s child section: %v", tc.name, err)
		}
		if impl.Kind != tc.expectedKind {
			t.Fatalf("expected %s child kind %q, got %q", tc.name, tc.expectedKind, impl.Kind)
		}
		if tc.expectedKind == projectstate.SectionKindGenerated {
			if impl.Generated == nil || impl.Generated.Kind != tc.expectedGen {
				t.Fatalf("expected %s generated kind %q, got %#v", tc.name, tc.expectedGen, impl.Generated)
			}
		}

		implPayload := decodeProjectRouteRawObject(t, impl.Payload)
		if got, _ := implPayload["type"].(string); got != tc.implType {
			t.Fatalf("expected %s child payload type %q, got %#v", tc.name, tc.implType, implPayload["type"])
		}
	}
}

func TestRegisterProjectRoutesCreateChildSectionsAppliesDefaultTaskBoardColumns(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": childSectionRouteTestProject(t),
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
		"/api"+RouteCreateChildSections,
		strings.NewReader(`{"projectConfigId":"project-alpha","parentId":"group-parent","implType":"TaskBoard","numChildren":1}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload projectstate.CreateChildSectionsResult
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode task board child create response: %v", err)
	}
	if len(payload.SectionIDs) != 1 {
		t.Fatalf("expected one created task board child id, got %#v", payload.SectionIDs)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project snapshot: %v", err)
	}
	_, _, impl, err := project.ResolveSection(payload.SectionIDs[0])
	if err != nil {
		t.Fatalf("resolve created task board child: %v", err)
	}
	implPayload := decodeProjectRouteRawObject(t, impl.Payload)
	rawColumns, ok := implPayload["columns"].([]any)
	if !ok || len(rawColumns) != 3 {
		t.Fatalf("expected seeded task board child columns, got %#v", implPayload["columns"])
	}
	gotNames := make([]string, 0, len(rawColumns))
	for _, rawColumn := range rawColumns {
		column, ok := rawColumn.(map[string]any)
		if !ok {
			t.Fatalf("expected task board child column object, got %#v", rawColumn)
		}
		gotNames = append(gotNames, fmt.Sprintf("%v", column["name"]))
	}
	if !reflect.DeepEqual(gotNames, []string{"Todo", "Doing", "Done"}) {
		t.Fatalf("expected default task board child columns, got %#v", gotNames)
	}
}

func TestRegisterProjectRoutesCreateChildSectionsViaIncrementerSupportsSourceDirectOnlyTypes(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": childSectionRouteTestProject(t),
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
	testCases := []struct {
		name         string
		implType     string
		expectedName string
		expectedKind projectstate.SectionKind
		expectedGen  projectstate.GeneratedSectionKind
	}{
		{
			name:         "global variables",
			implType:     "GlobalVariables",
			expectedName: "Global Variables",
			expectedKind: projectstate.SectionKind("frontend"),
		},
		{
			name:         "generated python code",
			implType:     "GenPythonCode",
			expectedName: "Generated Python Code",
			expectedKind: projectstate.SectionKindGenerated,
			expectedGen:  projectstate.GeneratedSectionKindPythonCode,
		},
		{
			name:         "generated python metadata",
			implType:     "GenPythonMetadata",
			expectedName: "Generated Python Metadata",
			expectedKind: projectstate.SectionKindGenerated,
			expectedGen:  projectstate.GeneratedSectionKindPythonMetadata,
		},
	}

	for _, tc := range testCases {
		request := httptest.NewRequest(
			http.MethodPost,
			"/api"+RouteCreateChildSectionsViaIncrementer,
			strings.NewReader(fmt.Sprintf(`{"projectConfigId":"project-alpha","calledBy":"child-a","implType":"%s","numChildren":1}`, tc.implType)),
		)
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusOK {
			t.Fatalf("expected 200 for incrementer %s create, got %d with body %q", tc.name, response.Code, response.Body.String())
		}

		var payload projectstate.CreateChildSectionsResult
		if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
			t.Fatalf("decode %s incrementer create response: %v", tc.name, err)
		}
		if len(payload.SectionIDs) != 1 {
			t.Fatalf("expected one %s incrementer child id, got %#v", tc.name, payload.SectionIDs)
		}

		project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
		if err != nil {
			t.Fatalf("project snapshot after incrementer %s create: %v", tc.name, err)
		}
		createdSection, ok := project.Sections[payload.SectionIDs[0]]
		if !ok {
			t.Fatalf("expected created incrementer %s section %q", tc.name, payload.SectionIDs[0])
		}
		if createdSection.Name != tc.expectedName {
			t.Fatalf("expected incrementer %s child name %q, got %q", tc.name, tc.expectedName, createdSection.Name)
		}
		_, _, impl, err := project.ResolveSection(payload.SectionIDs[0])
		if err != nil {
			t.Fatalf("resolve incrementer %s child: %v", tc.name, err)
		}
		if impl.Kind != tc.expectedKind {
			t.Fatalf("expected incrementer %s child kind %q, got %q", tc.name, tc.expectedKind, impl.Kind)
		}
		if tc.expectedKind == projectstate.SectionKindGenerated {
			if impl.Generated == nil || impl.Generated.Kind != tc.expectedGen {
				t.Fatalf("expected incrementer %s generated kind %q, got %#v", tc.name, tc.expectedGen, impl.Generated)
			}
		}
	}
}

func TestRegisterProjectRoutesCreateChildSectionsViaIncrementerRejectsTopLevelOnlyStateMachineTypes(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": childSectionRouteTestProject(t),
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
	for _, implType := range []string{"StateMachineStart", "StateMachineGate", "StateMachineEnd"} {
		request := httptest.NewRequest(
			http.MethodPost,
			"/api"+RouteCreateChildSectionsViaIncrementer,
			strings.NewReader(fmt.Sprintf(`{"projectConfigId":"project-alpha","calledBy":"child-a","implType":"%s","numChildren":1}`, implType)),
		)
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusUnprocessableEntity {
			t.Fatalf("expected 422 for incrementer %s child create, got %d with body %q", implType, response.Code, response.Body.String())
		}
		if !strings.Contains(response.Body.String(), `"code":"child_section_mutation_invalid"`) {
			t.Fatalf("expected child_section_mutation_invalid for incrementer %s child create, got %q", implType, response.Body.String())
		}
	}
}

func TestRegisterProjectRoutesCreateChildSectionsRejectsTopLevelOnlyStateMachineTypes(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": childSectionRouteTestProject(t),
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
	for _, implType := range []string{"StateMachineStart", "StateMachineGate", "StateMachineEnd"} {
		request := httptest.NewRequest(
			http.MethodPost,
			"/api"+RouteCreateChildSections,
			strings.NewReader(fmt.Sprintf(`{"projectConfigId":"project-alpha","parentId":"group-parent","implType":"%s","numChildren":1}`, implType)),
		)
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusUnprocessableEntity {
			t.Fatalf("expected 422 for direct %s child create, got %d with body %q", implType, response.Code, response.Body.String())
		}
		if !strings.Contains(response.Body.String(), `"code":"child_section_mutation_invalid"`) {
			t.Fatalf("expected child_section_mutation_invalid for direct %s child create, got %q", implType, response.Body.String())
		}
	}
}

func TestRegisterProjectRoutesChildSectionMutationsRejectInvalidInputs(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": childSectionRouteTestProject(t),
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
			route:        RouteCreateChildSections,
			body:         `{"projectConfigId":"project-alpha","parentId":"","implType":"Terminal","numChildren":1}`,
			expectedCode: http.StatusBadRequest,
			expectedBody: `"code":"parent_id_required"`,
		},
		{
			route:        RouteCreateChildSections,
			body:         `{"projectConfigId":"project-alpha","parentId":"code-section","implType":"TextBlock","numChildren":1}`,
			expectedCode: http.StatusUnprocessableEntity,
			expectedBody: `"code":"child_section_mutation_invalid"`,
		},
		{
			route:        RouteCreateChildSectionsViaIncrementer,
			body:         `{"projectConfigId":"project-alpha","calledBy":"missing","implType":"TextBlock","numChildren":1}`,
			expectedCode: http.StatusNotFound,
			expectedBody: `"code":"section_not_found"`,
		},
		{
			route:        RouteDeleteChildSectionsViaDecrementer,
			body:         `{"projectConfigId":"project-alpha","calledBy":"group-parent","numChildren":-1}`,
			expectedCode: http.StatusBadRequest,
			expectedBody: `"code":"child_section_request_invalid"`,
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

func TestRegisterProjectRoutesCreateChildSectionsRejectsDeploymentStructuralChanges(t *testing.T) {
	t.Parallel()

	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
			baselineProject := childSectionRouteTestProject(t)
			deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
				Mode: mode,
				Document: projectstate.Document{
					SchemaVersion:    projectstate.CurrentSchemaVersion,
					DefaultProjectID: "project-alpha",
					Projects: map[string]projectstate.Project{
						"project-alpha": baselineProject,
					},
				},
			})
			if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
				t.Fatalf("create deployment session: %v", err)
			}

			handler := newProjectRouteDeploymentTestHandler(t, mode, deploymentRuntime)
			request := httptest.NewRequest(
				http.MethodPost,
				"/api"+RouteCreateChildSections,
				strings.NewReader(`{"projectConfigId":"project-alpha","parentId":"code-section","implType":"Terminal","numChildren":1,"startIdx":0}`),
			)
			request.Header.Set("Content-Type", "application/json")
			request.Header.Set(modes.ShareSessionHeaderName, "share-a")
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			if response.Code != http.StatusForbidden {
				t.Fatalf("expected 403, got %d with body %q", response.Code, response.Body.String())
			}
			if !strings.Contains(response.Body.String(), `"code":"structural_changes_forbidden"`) {
				t.Fatalf("expected structural_changes_forbidden body, got %q", response.Body.String())
			}
			if !strings.Contains(response.Body.String(), "Deployment mode disallows structural changes.") {
				t.Fatalf("expected deployment structural denial, got %q", response.Body.String())
			}

			overlay, err := deploymentRuntime.Overlay("share-a")
			if err != nil {
				t.Fatalf("deployment overlay: %v", err)
			}
			overlayProject := overlay.Snapshot().Document.Projects["project-alpha"]
			if len(overlayProject.Sections) != len(baselineProject.Sections) {
				t.Fatalf("expected rejected mutation to preserve overlay section count %d, got %d", len(baselineProject.Sections), len(overlayProject.Sections))
			}
			if got := overlayProject.SectionImpls["code-impl"].Code; got == nil || len(got.Children) != 0 {
				t.Fatalf("expected code section to keep no attached children, got %#v", got)
			}
		})
	}
}

func TestRegisterProjectRoutesDeleteSectionsRejectsDeploymentStructuralChanges(t *testing.T) {
	t.Parallel()

	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
			baselineProject := sectionStructureRouteTestProject(t)
			deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
				Mode: mode,
				Document: projectstate.Document{
					SchemaVersion:    projectstate.CurrentSchemaVersion,
					DefaultProjectID: "project-alpha",
					Projects: map[string]projectstate.Project{
						"project-alpha": baselineProject,
					},
				},
			})
			if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
				t.Fatalf("create deployment session: %v", err)
			}

			handler := newProjectRouteDeploymentTestHandler(t, mode, deploymentRuntime)
			request := httptest.NewRequest(
				http.MethodPost,
				"/api"+RouteDeleteSections,
				strings.NewReader(`{"projectConfigId":"project-alpha","sectionIds":["top-group"]}`),
			)
			request.Header.Set("Content-Type", "application/json")
			request.Header.Set(modes.ShareSessionHeaderName, "share-a")
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			if response.Code != http.StatusForbidden {
				t.Fatalf("expected 403, got %d with body %q", response.Code, response.Body.String())
			}
			if !strings.Contains(response.Body.String(), `"code":"structural_changes_forbidden"`) {
				t.Fatalf("expected structural_changes_forbidden body, got %q", response.Body.String())
			}
			if !strings.Contains(response.Body.String(), "Deployment mode disallows structural changes.") {
				t.Fatalf("expected deployment structural denial, got %q", response.Body.String())
			}

			overlay, err := deploymentRuntime.Overlay("share-a")
			if err != nil {
				t.Fatalf("deployment overlay: %v", err)
			}
			overlayProject := overlay.Snapshot().Document.Projects["project-alpha"]
			if len(overlayProject.Sections) != len(baselineProject.Sections) {
				t.Fatalf("expected rejected mutation to preserve overlay section count %d, got %d", len(baselineProject.Sections), len(overlayProject.Sections))
			}
			if _, ok := overlayProject.Sections["top-group"]; !ok {
				t.Fatal("expected rejected mutation to preserve top-group in overlay")
			}
			if _, ok := overlayProject.Sections["top-child-a"]; !ok {
				t.Fatal("expected rejected mutation to preserve top-child-a in overlay")
			}
			if _, ok := overlayProject.Sections["top-child-b"]; !ok {
				t.Fatal("expected rejected mutation to preserve top-child-b in overlay")
			}
		})
	}
}

func TestRegisterProjectRoutesRenameAndCodeBindingRoutesRemainIDEOnlyInDeployment(t *testing.T) {
	t.Parallel()

	assertCodeObjectNamesPreserved := func(t *testing.T, project projectstate.Project) {
		t.Helper()

		sharedChild, ok := project.CodeObjs["shared-child"]
		if !ok {
			t.Fatalf("expected shared-child code object, got %#v", project.CodeObjs)
		}
		if sharedChild.Name != "child" {
			t.Fatalf("expected shared-child name child, got %#v", sharedChild)
		}
		if sharedChild.DisplayName != "" {
			t.Fatalf("expected shared-child display name to stay empty, got %#v", sharedChild)
		}
	}

	assertSectionRenameAndBindingPreserved := func(t *testing.T, project projectstate.Project) {
		t.Helper()

		codeSection, ok := project.Sections["code-section"]
		if !ok {
			t.Fatalf("expected code-section, got %#v", project.Sections)
		}
		if codeSection.Name != "Code Section" {
			t.Fatalf("expected code-section name Code Section, got %#v", codeSection)
		}

		_, _, impl, err := project.ResolveSection("code-section")
		if err != nil {
			t.Fatalf("resolve code-section: %v", err)
		}
		if impl.Code == nil || impl.Code.Binding == nil {
			t.Fatalf("expected code-section binding to remain present, got %#v", impl.Code)
		}
		if impl.Code.Binding.Path != "pkg/original.py" {
			t.Fatalf("expected code-section binding path pkg/original.py, got %#v", impl.Code.Binding)
		}
		if impl.Code.Binding.AccessMode != projectstate.CodeFileAccessModeReadWrite {
			t.Fatalf("expected code-section binding access mode read_write, got %#v", impl.Code.Binding)
		}
	}

	testCases := []struct {
		name            string
		project         func(*testing.T) projectstate.Project
		route           string
		body            string
		assertPreserved func(*testing.T, projectstate.Project)
	}{
		{
			name:            "set_code_obj_name",
			project:         passwordParamRouteTestProject,
			route:           RouteSetCodeObjName,
			body:            `{"projectConfigId":"project-alpha","codeObjId":"shared-child","name":"renamed_key","frontendOpId":"frontend-op-code-obj-name"}`,
			assertPreserved: assertCodeObjectNamesPreserved,
		},
		{
			name:            "set_code_obj_display_name",
			project:         passwordParamRouteTestProject,
			route:           RouteSetCodeObjDisplayName,
			body:            `{"projectConfigId":"project-alpha","codeObjId":"shared-child","displayName":"Renamed Key","frontendOpId":"frontend-op-code-obj-display"}`,
			assertPreserved: assertCodeObjectNamesPreserved,
		},
		{
			name:            "set_code_file_binding",
			project:         codeFileBindingRouteTestProject,
			route:           RouteSetCodeFileBinding,
			body:            `{"projectConfigId":"project-alpha","sectionId":"code-section","binding":{"canonical_path":"pkg/renamed.py","access_mode":"read_only"}}`,
			assertPreserved: assertSectionRenameAndBindingPreserved,
		},
		{
			name:            "set_section_name",
			project:         codeFileBindingRouteTestProject,
			route:           RouteSetSectionName,
			body:            `{"projectConfigId":"project-alpha","sectionId":"code-section","name":"Renamed Section","frontendOpId":"frontend-op-section-name"}`,
			assertPreserved: assertSectionRenameAndBindingPreserved,
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
							"allowLayoutChanges":  true,
							"allowParamChanges":   true,
							"allowVariantChanges": true,
							"allowRun":            true,
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
					if !strings.Contains(response.Body.String(), "Deployment mode does not allow this endpoint.") {
						t.Fatalf("expected deployment-mode denial detail for %s in %s mode, got %q", tc.route, mode, response.Body.String())
					}

					overlay, err := deploymentRuntime.Overlay("share-a")
					if err != nil {
						t.Fatalf("deployment overlay: %v", err)
					}
					tc.assertPreserved(t, overlay.Snapshot().Document.Projects["project-alpha"])
					tc.assertPreserved(t, deploymentRuntime.Base().Snapshot().Document.Projects["project-alpha"])
				})
			}
		})
	}
}
