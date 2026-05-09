package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"setta/internal/codegen"
	"setta/internal/config"
	"setta/internal/projectstate"
	"setta/internal/projectview"
)

func TestRegisterProjectRoutesRejectsPythonCodegenTargetsWithInvalidCodeObjValuePolicyAs422(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
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

	handler := newProjectRouteTestHandler(
		t,
		config.ModeIDE,
		projectRuntime,
		t.TempDir(),
		projectstate.CodegenTargetValidatorFunc(func(context.Context, projectstate.ProjectCodegenTarget) error {
			return nil
		}),
		projectstate.PythonCodegenSectionReconcilerFunc(func(context.Context, *projectstate.Project) error {
			return nil
		}),
		nil,
	)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetProjectConfigCodegenTargets,
		strings.NewReader(`{"projectConfigId":"project-alpha","codegenTargets":[{"language":"python","codeObjValuePolicy":{"unexpected":true}}]}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"invalid_project_codegen_targets"`) {
		t.Fatalf("expected invalid_project_codegen_targets error, got %q", response.Body.String())
	}

	snapshot := projectRuntime.Snapshot()
	project := snapshot.Document.Projects["project-alpha"]
	if len(project.CodegenTargets) != 0 {
		t.Fatalf("expected no persisted codegen targets after validation failure, got %#v", project.CodegenTargets)
	}
}

func TestRegisterProjectRoutesEnablesPythonCodegenAndReturnsGeneratedSingletonSections(t *testing.T) {
	t.Parallel()

	settaFilesRoot := filepath.Join(t.TempDir(), "setta_files")
	runtimeRoot := filepath.Join(settaFilesRoot, "runtime")
	materializer, err := codegen.NewPythonMaterializer(codegen.PythonMaterializerOptions{
		SettaFilesRoot: settaFilesRoot,
		RuntimeRoot:    runtimeRoot,
	})
	if err != nil {
		t.Fatalf("new python materializer: %v", err)
	}

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:                 "project-alpha",
				Name:               "Alpha",
				TopLevelSectionIDs: []string{"section-1"},
				SectionVariantMap: map[string]string{
					"section-1": "section-variant-1",
				},
				Sections: map[string]projectstate.Section{
					"section-1": {
						ID:               "section-1",
						Name:             "Greeting",
						VariantIDs:       []string{"section-variant-1"},
						DefaultVariantID: "section-variant-1",
					},
				},
				SectionVariants: map[string]projectstate.SectionVariant{
					"section-variant-1": {
						ID:     "section-variant-1",
						ImplID: "section-impl-1",
					},
				},
				SectionImpls: map[string]projectstate.SectionImpl{
					"section-impl-1": {
						ID:   "section-impl-1",
						Kind: projectstate.SectionKind("text_block"),
						Payload: projectstate.RawJSON(
							`{"id":"section-impl-1","type":"TextBlock","text":"hello world"}`,
						),
					},
				},
				ViewModes: map[string]projectstate.ViewMode{
					"focus": {
						ID: "focus",
					},
				},
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

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, settaFilesRoot, projectstate.CodegenTargetValidatorFunc(func(context.Context, projectstate.ProjectCodegenTarget) error {
		return nil
	}), materializer, nil)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetProjectConfigCodegenTargets,
		strings.NewReader(`{"projectConfigId":"project-alpha","codegenTargets":[{"language":"python","genCodePrefix":"import math","generateMetadata":true}]}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload projectview.SingleConfig
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode project state payload: %v", err)
	}
	if got := derefString(payload.SingletonSections.GenPythonCode); got != projectstate.GeneratedPythonCodeSectionID {
		t.Fatalf("expected generated python singleton %q, got %q", projectstate.GeneratedPythonCodeSectionID, got)
	}
	if got := derefString(payload.SingletonSections.GenPythonMetadata); got != projectstate.GeneratedPythonMetadataSectionID {
		t.Fatalf("expected generated python metadata singleton %q, got %q", projectstate.GeneratedPythonMetadataSectionID, got)
	}
	if payload.GenCodeBinding == nil {
		t.Fatal("expected generated code binding in response")
	}
	if payload.GenCodeBinding.CanonicalPath != projectstate.GeneratedPythonCodeRelativePath("Alpha") {
		t.Fatalf("unexpected generated code binding path %q", payload.GenCodeBinding.CanonicalPath)
	}

	codeVariantID := payload.ProjectConfig.SectionVariantMap[projectstate.GeneratedPythonCodeSectionID]
	codeImplID := payload.SectionVariants[codeVariantID].Impl
	codePayload := string(payload.SectionImpls[codeImplID])
	if !strings.Contains(codePayload, `"type":"GenPythonCode"`) {
		t.Fatalf("expected generated python impl payload, got %q", codePayload)
	}
	if !strings.Contains(codePayload, `state.Greeting = 'hello world'`) {
		t.Fatalf("expected generated python body assignment, got %q", codePayload)
	}

	metaVariantID := payload.ProjectConfig.SectionVariantMap[projectstate.GeneratedPythonMetadataSectionID]
	metaImplID := payload.SectionVariants[metaVariantID].Impl
	metaPayload := string(payload.SectionImpls[metaImplID])
	if !strings.Contains(metaPayload, `"type":"GenPythonMetadata"`) {
		t.Fatalf("expected generated python metadata impl payload, got %q", metaPayload)
	}
	if !strings.Contains(metaPayload, `class SettaGenMetadata:`) {
		t.Fatalf("expected generated metadata code in payload, got %q", metaPayload)
	}
}

func TestRegisterProjectRoutesSetGenCodePrefixAndSuffixPersistRuntimeState(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": genCodePrefixSuffixRouteTestProject(t),
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
		route string
		body  string
	}{
		{
			route: RouteSetGenCodePrefix,
			body:  `{"projectConfigId":"project-alpha","genCodePrefix":"import math\n","frontendOpId":"frontend-op-prefix"}`,
		},
		{
			route: RouteSetGenCodeSuffix,
			body:  `{"projectConfigId":"project-alpha","genCodeSuffix":"state = CustomState()\n","frontendOpId":"frontend-op-suffix"}`,
		},
	} {
		request := httptest.NewRequest(http.MethodPost, "/api"+requestSpec.route, strings.NewReader(requestSpec.body))
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusOK {
			t.Fatalf("expected 200 for %s, got %d with body %q", requestSpec.route, response.Code, response.Body.String())
		}
	}

	project := projectRuntime.Snapshot().Document.Projects["project-alpha"]
	config, ok, err := project.PythonCodegenTarget()
	if err != nil {
		t.Fatalf("read python target after prefix/suffix mutation: %v", err)
	}
	if !ok {
		t.Fatal("expected python target after prefix/suffix mutation")
	}
	if config.GenCodePrefix != "import math\n" {
		t.Fatalf("expected gen code prefix import math, got %q", config.GenCodePrefix)
	}
	if config.GenCodeSuffix != "state = CustomState()\n" {
		t.Fatalf("expected gen code suffix state = CustomState(), got %q", config.GenCodeSuffix)
	}
	if project.GeneratedCodeBinding == nil {
		t.Fatal("expected generated code binding to remain reconciled")
	}
	if project.GeneratedCodeBinding.Path != projectstate.GeneratedPythonCodeRelativePath(project.Name) {
		t.Fatalf("unexpected generated code binding path %q", project.GeneratedCodeBinding.Path)
	}
}

func TestRegisterProjectRoutesSetGenCodePrefixAndSuffixRejectMissingPythonTarget(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": mustNormalizedProjectRouteProject(t, projectstate.Project{
				ID:   "project-alpha",
				Name: "Alpha",
			}),
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
		route string
		body  string
	}{
		{
			route: RouteSetGenCodePrefix,
			body:  `{"projectConfigId":"project-alpha","genCodePrefix":"import math\n"}`,
		},
		{
			route: RouteSetGenCodeSuffix,
			body:  `{"projectConfigId":"project-alpha","genCodeSuffix":"state = CustomState()\n"}`,
		},
	} {
		request := httptest.NewRequest(http.MethodPost, "/api"+requestSpec.route, strings.NewReader(requestSpec.body))
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusUnprocessableEntity {
			t.Fatalf("expected 422 for %s, got %d with body %q", requestSpec.route, response.Code, response.Body.String())
		}
		if !strings.Contains(response.Body.String(), `"code":"project_codegen_python_target_missing"`) {
			t.Fatalf("expected project_codegen_python_target_missing for %s, got %q", requestSpec.route, response.Body.String())
		}
	}
}

func TestRegisterProjectRoutesSectionEdgeMutationsPersistLatestState(t *testing.T) {
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
			route: RouteSetSectionEdgeInputs,
			body:  `{"projectConfigId":"project-alpha","sectionId":"dict-section","edgeInputParams":[" added-param ","added-param"]}`,
		},
		{
			route: RouteSetSectionEdgeOutputs,
			body:  `{"projectConfigId":"project-alpha","sectionId":"dict-section","edgeOutputPorts":[{"id":"new-port","accessor":"  .result  "},{"id":"new-port","accessor":".ignored"}]}`,
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
	if got := decodeProjectRouteStringArray(dictPayload["edgeInputParams"]); !reflect.DeepEqual(got, []string{"added-param"}) {
		t.Fatalf("expected edgeInputParams [added-param], got %#v", got)
	}

	rawPorts, ok := dictPayload["edgeOutputPorts"].([]any)
	if !ok || len(rawPorts) != 1 {
		t.Fatalf("expected one edgeOutputPort, got %#v", dictPayload["edgeOutputPorts"])
	}
	portObject, ok := rawPorts[0].(map[string]any)
	if !ok {
		t.Fatalf("expected edgeOutputPorts[0] object, got %#v", rawPorts[0])
	}
	if got := portObject["id"]; got != "new-port" {
		t.Fatalf("expected edgeOutputPorts[0].id new-port, got %#v", got)
	}
	if got := portObject["accessor"]; got != ".result" {
		t.Fatalf("expected edgeOutputPorts[0].accessor .result, got %#v", got)
	}

	addedVariantID := payload.ProjectState.CodeObjs["added-param"].DefaultVariant
	if addedVariantID == nil {
		t.Fatal("expected added-param default variant to be present")
	}
	addedImplID := payload.ProjectState.CodeObjVariants[*addedVariantID].Impl
	addedPayload := decodeProjectRouteRawObject(t, payload.ProjectState.CodeObjImpls[addedImplID])
	if got := addedPayload["type"]; got != "CodeParam" {
		t.Fatalf("expected added-param to convert to CodeParam, got %#v", got)
	}
}

func TestRegisterProjectRoutesSectionEdgeMutationsRejectInvalidInputs(t *testing.T) {
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
			route:        RouteSetSectionEdgeInputs,
			body:         `{"projectConfigId":"project-alpha","sectionId":"plain-section","edgeInputParams":["added-param"]}`,
			expectedCode: http.StatusUnprocessableEntity,
			expectedBody: `"code":"section_edge_io_unsupported"`,
		},
		{
			route:        RouteSetSectionEdgeOutputs,
			body:         `{"projectConfigId":"project-alpha","sectionId":"plain-section","edgeOutputPorts":[{"id":"result","accessor":".result"}]}`,
			expectedCode: http.StatusUnprocessableEntity,
			expectedBody: `"code":"section_edge_io_unsupported"`,
		},
		{
			route:        RouteSetSectionEdgeInputs,
			body:         `{"projectConfigId":"project-alpha","sectionId":"dict-section","edgeInputParams":["missing-param"]}`,
			expectedCode: http.StatusNotFound,
			expectedBody: `"code":"param_info_not_found"`,
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

func TestRegisterProjectRoutesSetSectionEdgeOutputsReappliesChangedAccessorValues(t *testing.T) {
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

	project := projectRuntime.Snapshot().Document.Projects["project-alpha"]
	edge := findProjectRouteEdge(t, project, "outgoing-edge")
	initialExpression, err := codegen.BuildPythonEdgeExpression(project, edge)
	if err != nil {
		t.Fatalf("build initial edge expression: %v", err)
	}
	if _, err := projectRuntime.SetSectionCodeObjectValue(
		context.Background(),
		"project-alpha",
		"sink-section",
		"sink-param",
		initialExpression,
	); err != nil {
		t.Fatalf("seed sink-param with initial expression: %v", err)
	}

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, t.TempDir(), nil, nil, nil)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetSectionEdgeOutputs,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"dict-section","edgeOutputPorts":[{"id":"result","accessor":".new"}]}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	project = projectRuntime.Snapshot().Document.Projects["project-alpha"]
	updatedEdge := findProjectRouteEdge(t, project, "outgoing-edge")
	updatedExpression, err := codegen.BuildPythonEdgeExpression(project, updatedEdge)
	if err != nil {
		t.Fatalf("build updated edge expression: %v", err)
	}
	if initialExpression == updatedExpression {
		t.Fatal("expected accessor change to produce a new edge expression")
	}

	sinkPayload, _, _, _, err := project.ResolveSectionCodeObject("sink-section", "sink-param")
	if err != nil {
		t.Fatalf("resolve sink-param after accessor change: %v", err)
	}
	if got := sinkPayload["value"]; got != updatedExpression {
		t.Fatalf("expected sink-param value %q after accessor change, got %#v", updatedExpression, got)
	}
}

func TestRegisterProjectRoutesGraphEdgeMutationsPersistLatestState(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": graphEdgeRouteTestProject(t),
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
	post := func(route string, body any) *httptest.ResponseRecorder {
		t.Helper()
		request := httptest.NewRequest(
			http.MethodPost,
			"/api"+route,
			strings.NewReader(mustMarshalProjectRouteRequest(t, body)),
		)
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		return response
	}

	createResponse := post(RouteCreateEdge, map[string]any{
		"projectConfigId": "project-alpha",
		"sourceSectionId": "source-section",
		"sourceVariantId": "source-variant",
		"sourcePortId":    "result",
		"targetSectionId": "target-a",
		"targetVariantId": "target-a-variant",
		"targetPortId":    "input-a",
		"type":            "default",
	})
	if createResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 create-edge response, got %d with body %q", createResponse.Code, createResponse.Body.String())
	}

	project := projectRuntime.Snapshot().Document.Projects["project-alpha"]
	if len(project.Edges) != 1 {
		t.Fatalf("expected one created edge, got %#v", project.Edges)
	}
	createdEdge := project.Edges[0]
	if createdEdge.ID == "" {
		t.Fatal("expected createEdge to generate an id")
	}
	targetAPayload, _, _, _, err := project.ResolveSectionCodeObject("target-a", "input-a")
	if err != nil {
		t.Fatalf("ResolveSectionCodeObject target-a/input-a after create: %v", err)
	}
	if got := targetAPayload["value"]; got != "state.Source_Call.result" {
		t.Fatalf("expected created edge expression state.Source_Call.result, got %#v", got)
	}

	label := "Primary"
	createdEdge.Label = &label
	createdEdge.Selected = true
	updateResponse := post(RouteUpdateEdge, UpdateEdgeRequest{
		ProjectID: "project-alpha",
		Edge:      createdEdge,
	})
	if updateResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 update-edge response, got %d with body %q", updateResponse.Code, updateResponse.Body.String())
	}

	project = projectRuntime.Snapshot().Document.Projects["project-alpha"]
	if len(project.Edges) != 1 {
		t.Fatalf("expected one updated edge, got %#v", project.Edges)
	}
	updatedEdge := project.Edges[0]
	if updatedEdge.Label == nil || *updatedEdge.Label != "Primary" || !updatedEdge.Selected {
		t.Fatalf("expected updated edge label/selection to persist, got %#v", updatedEdge)
	}

	reconnectResponse := post(RouteReconnectEdge, ReconnectEdgeRequest{
		ProjectID:       "project-alpha",
		EdgeID:          updatedEdge.ID,
		SourceSectionID: "source-section",
		SourceVariantID: "source-variant",
		SourcePortID:    "summary",
		TargetSectionID: "target-b",
		TargetVariantID: "target-b-variant",
		TargetPortID:    "input-b",
	})
	if reconnectResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 reconnect-edge response, got %d with body %q", reconnectResponse.Code, reconnectResponse.Body.String())
	}

	project = projectRuntime.Snapshot().Document.Projects["project-alpha"]
	reconnectedEdge := project.Edges[0]
	if reconnectedEdge.TargetSectionID != "target-b" || reconnectedEdge.TargetPortID != "input-b" || reconnectedEdge.SourcePortID != "summary" {
		t.Fatalf("expected reconnect to update endpoints, got %#v", reconnectedEdge)
	}
	targetAPayload, _, _, _, err = project.ResolveSectionCodeObject("target-a", "input-a")
	if err != nil {
		t.Fatalf("ResolveSectionCodeObject target-a/input-a after reconnect: %v", err)
	}
	if got := targetAPayload["value"]; got != "" {
		t.Fatalf("expected reconnect to clear previous target, got %#v", got)
	}
	targetBPayload, _, _, _, err := project.ResolveSectionCodeObject("target-b", "input-b")
	if err != nil {
		t.Fatalf("ResolveSectionCodeObject target-b/input-b after reconnect: %v", err)
	}
	if got := targetBPayload["value"]; got != "state.Source_Call" {
		t.Fatalf("expected reconnect to write state.Source_Call, got %#v", got)
	}

	reconnectedEdge.Hidden = true
	reconnectedEdge.Selected = false
	setResponse := post(RouteSetEdges, SetEdgesRequest{
		ProjectID: "project-alpha",
		Edges:     []projectstate.Edge{reconnectedEdge},
	})
	if setResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 set-edges response, got %d with body %q", setResponse.Code, setResponse.Body.String())
	}

	project = projectRuntime.Snapshot().Document.Projects["project-alpha"]
	if len(project.Edges) != 1 || !project.Edges[0].Hidden || project.Edges[0].Selected {
		t.Fatalf("expected setEdges to persist hidden/selected flags, got %#v", project.Edges)
	}

	deleteResponse := post(RouteDeleteEdges, DeleteEdgesRequest{
		ProjectID: "project-alpha",
		EdgeIDs:   []string{reconnectedEdge.ID},
	})
	if deleteResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 delete-edges response, got %d with body %q", deleteResponse.Code, deleteResponse.Body.String())
	}

	project = projectRuntime.Snapshot().Document.Projects["project-alpha"]
	if len(project.Edges) != 0 {
		t.Fatalf("expected deleteEdges to remove the edge, got %#v", project.Edges)
	}
	targetBPayload, _, _, _, err = project.ResolveSectionCodeObject("target-b", "input-b")
	if err != nil {
		t.Fatalf("ResolveSectionCodeObject target-b/input-b after delete: %v", err)
	}
	if got := targetBPayload["value"]; got != "" {
		t.Fatalf("expected deleteEdges to clear target-b value, got %#v", got)
	}

	createAgenticResponse := post(RouteCreateAgenticEdge, map[string]any{
		"projectConfigId": "project-alpha",
		"sourceSectionId": "chat-source",
		"targetSectionId": "chat-target",
		"kind":            "chat_chat",
	})
	if createAgenticResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 create-agentic-edge response, got %d with body %q", createAgenticResponse.Code, createAgenticResponse.Body.String())
	}

	project = projectRuntime.Snapshot().Document.Projects["project-alpha"]
	if len(project.AgenticEdges) != 1 {
		t.Fatalf("expected one created agentic edge, got %#v", project.AgenticEdges)
	}
	createdAgenticEdge := project.AgenticEdges[0]
	if createdAgenticEdge.ID == "" || createdAgenticEdge.ContextMode != "reference_only" {
		t.Fatalf("expected createAgenticEdge to normalize id/contextMode, got %#v", createdAgenticEdge)
	}

	createdAgenticEdge.ContextMode = "inline_text"
	createdAgenticEdge.Selected = true
	updateAgenticResponse := post(RouteUpdateAgenticEdge, UpdateAgenticEdgeRequest{
		ProjectID: "project-alpha",
		Edge:      createdAgenticEdge,
	})
	if updateAgenticResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 update-agentic-edge response, got %d with body %q", updateAgenticResponse.Code, updateAgenticResponse.Body.String())
	}

	project = projectRuntime.Snapshot().Document.Projects["project-alpha"]
	updatedAgenticEdge := project.AgenticEdges[0]
	if updatedAgenticEdge.ContextMode != "inline_text" || !updatedAgenticEdge.Selected {
		t.Fatalf("expected updateAgenticEdge to persist contextMode/selection, got %#v", updatedAgenticEdge)
	}

	updatedAgenticEdge.Hidden = true
	setAgenticResponse := post(RouteSetAgenticEdges, SetAgenticEdgesRequest{
		ProjectID: "project-alpha",
		Edges:     []projectstate.AgenticEdge{updatedAgenticEdge},
	})
	if setAgenticResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 set-agentic-edges response, got %d with body %q", setAgenticResponse.Code, setAgenticResponse.Body.String())
	}

	project = projectRuntime.Snapshot().Document.Projects["project-alpha"]
	if len(project.AgenticEdges) != 1 || !project.AgenticEdges[0].Hidden {
		t.Fatalf("expected setAgenticEdges to persist hidden flag, got %#v", project.AgenticEdges)
	}

	deleteAgenticResponse := post(RouteDeleteAgenticEdges, DeleteAgenticEdgesRequest{
		ProjectID: "project-alpha",
		EdgeIDs:   []string{updatedAgenticEdge.ID},
	})
	if deleteAgenticResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 delete-agentic-edges response, got %d with body %q", deleteAgenticResponse.Code, deleteAgenticResponse.Body.String())
	}

	project = projectRuntime.Snapshot().Document.Projects["project-alpha"]
	if len(project.AgenticEdges) != 0 {
		t.Fatalf("expected deleteAgenticEdges to remove the edge, got %#v", project.AgenticEdges)
	}
}

func TestRegisterProjectRoutesGraphEdgeMutationsRejectInvalidInputs(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": graphEdgeRouteTestProject(t),
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

	noPythonProject := graphEdgeRouteTestProject(t)
	noPythonProject.CodegenTargets = nil
	noPythonRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": noPythonProject,
		},
	})
	if err != nil {
		t.Fatalf("open no-python overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := noPythonRuntime.Close(); err != nil {
			t.Fatalf("close no-python runtime: %v", err)
		}
	})

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, t.TempDir(), nil, nil, nil)
	noPythonHandler := newProjectRouteTestHandler(t, config.ModeIDE, noPythonRuntime, t.TempDir(), nil, nil, nil)

	for _, requestSpec := range []struct {
		name         string
		handler      http.Handler
		route        string
		body         any
		expectedCode int
		expectedBody string
	}{
		{
			name:    "create edge missing python target",
			handler: noPythonHandler,
			route:   RouteCreateEdge,
			body: map[string]any{
				"projectConfigId": "project-alpha",
				"sourceSectionId": "source-section",
				"sourceVariantId": "source-variant",
				"sourcePortId":    "result",
				"targetSectionId": "target-a",
				"targetVariantId": "target-a-variant",
				"targetPortId":    "input-a",
				"type":            "default",
			},
			expectedCode: http.StatusUnprocessableEntity,
			expectedBody: `"code":"project_codegen_python_target_missing"`,
		},
		{
			name:    "create edge invalid target port",
			handler: handler,
			route:   RouteCreateEdge,
			body: map[string]any{
				"projectConfigId": "project-alpha",
				"sourceSectionId": "source-section",
				"sourceVariantId": "source-variant",
				"sourcePortId":    "result",
				"targetSectionId": "target-a",
				"targetVariantId": "target-a-variant",
				"targetPortId":    "missing-port",
				"type":            "default",
			},
			expectedCode: http.StatusUnprocessableEntity,
			expectedBody: `"code":"edge_endpoint_invalid"`,
		},
		{
			name:    "reconnect edge missing edge",
			handler: handler,
			route:   RouteReconnectEdge,
			body: ReconnectEdgeRequest{
				ProjectID:       "project-alpha",
				EdgeID:          "missing-edge",
				SourceSectionID: "source-section",
				SourceVariantID: "source-variant",
				SourcePortID:    "result",
				TargetSectionID: "target-a",
				TargetVariantID: "target-a-variant",
				TargetPortID:    "input-a",
			},
			expectedCode: http.StatusNotFound,
			expectedBody: `"code":"edge_not_found"`,
		},
		{
			name:    "agentic edge invalid source type",
			handler: handler,
			route:   RouteCreateAgenticEdge,
			body: map[string]any{
				"projectConfigId": "project-alpha",
				"sourceSectionId": "plain-section",
				"targetSectionId": "chat-target",
				"kind":            "chat_section",
			},
			expectedCode: http.StatusUnprocessableEntity,
			expectedBody: `"code":"agentic_edge_invalid"`,
		},
		{
			name:    "set agentic edges invalid context mode",
			handler: handler,
			route:   RouteSetAgenticEdges,
			body: SetAgenticEdgesRequest{
				ProjectID: "project-alpha",
				Edges: []projectstate.AgenticEdge{
					{
						ID:              "edge-invalid-context",
						SourceSectionID: "chat-source",
						TargetSectionID: "chat-target",
						Kind:            "chat_chat",
						ContextMode:     "bad-mode",
					},
				},
			},
			expectedCode: http.StatusUnprocessableEntity,
			expectedBody: `"code":"agentic_edge_context_mode_invalid"`,
		},
	} {
		request := httptest.NewRequest(
			http.MethodPost,
			"/api"+requestSpec.route,
			strings.NewReader(mustMarshalProjectRouteRequest(t, requestSpec.body)),
		)
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		requestSpec.handler.ServeHTTP(response, request)
		if response.Code != requestSpec.expectedCode {
			t.Fatalf("%s: expected %d for %s, got %d with body %q", requestSpec.name, requestSpec.expectedCode, requestSpec.route, response.Code, response.Body.String())
		}
		if !strings.Contains(response.Body.String(), requestSpec.expectedBody) {
			t.Fatalf("%s: expected response body to contain %s, got %q", requestSpec.name, requestSpec.expectedBody, response.Body.String())
		}
	}
}

func TestRegisterProjectRoutesAgenticEdgesSupportDocumentedKindsAndContextModes(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name        string
		sourceID    string
		targetID    string
		kind        projectstate.AgenticEdgeKind
		contextMode projectstate.AgenticEdgeContextMode
	}{
		{
			name:        "chat chat reference only",
			sourceID:    "chat-source",
			targetID:    "chat-target",
			kind:        projectstate.AgenticEdgeKindChatChat,
			contextMode: projectstate.AgenticEdgeContextModeReferenceOnly,
		},
		{
			name:        "section chat summary",
			sourceID:    "source-section",
			targetID:    "chat-target",
			kind:        projectstate.AgenticEdgeKindSectionChat,
			contextMode: projectstate.AgenticEdgeContextModeSummary,
		},
		{
			name:        "chat section inline text",
			sourceID:    "chat-source",
			targetID:    "source-section",
			kind:        projectstate.AgenticEdgeKindChatSection,
			contextMode: projectstate.AgenticEdgeContextModeInlineText,
		},
	}

	for _, tc := range testCases {
		projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
			SchemaVersion:    projectstate.CurrentSchemaVersion,
			DefaultProjectID: "project-alpha",
			Projects: map[string]projectstate.Project{
				"project-alpha": graphEdgeRouteTestProject(t),
			},
		})
		if err != nil {
			t.Fatalf("open overlay runtime for %s: %v", tc.name, err)
		}

		handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, t.TempDir(), nil, nil, nil)
		request := httptest.NewRequest(
			http.MethodPost,
			"/api"+RouteCreateAgenticEdge,
			strings.NewReader(fmt.Sprintf(`{"projectConfigId":"project-alpha","sourceSectionId":"%s","targetSectionId":"%s","kind":"%s","contextMode":"%s"}`, tc.sourceID, tc.targetID, tc.kind, tc.contextMode)),
		)
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusOK {
			_ = projectRuntime.Close()
			t.Fatalf("expected 200 for %s agentic edge create, got %d with body %q", tc.name, response.Code, response.Body.String())
		}

		project := projectRuntime.Snapshot().Document.Projects["project-alpha"]
		closeErr := projectRuntime.Close()
		if closeErr != nil {
			t.Fatalf("close overlay runtime for %s: %v", tc.name, closeErr)
		}
		if len(project.AgenticEdges) != 1 {
			t.Fatalf("expected one persisted %s agentic edge, got %#v", tc.name, project.AgenticEdges)
		}
		created := project.AgenticEdges[0]
		if created.Kind != tc.kind {
			t.Fatalf("expected %s kind %q, got %q", tc.name, tc.kind, created.Kind)
		}
		if created.ContextMode != tc.contextMode {
			t.Fatalf("expected %s context mode %q, got %q", tc.name, tc.contextMode, created.ContextMode)
		}
	}
}

func TestRegisterProjectRoutesAgenticEdgesAcceptLinkedChatTargets(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": graphEdgeRouteTestProject(t),
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

	engineConfigID := "engine-linked"
	if _, err := projectRuntime.SetChatSectionSettings(context.Background(), "project-alpha", "chat-target", projectstate.ChatSectionSettings{
		Managed:        true,
		EngineConfigID: &engineConfigID,
		PermissionMode: projectstate.ChatPermissionModeMinimal,
		SearchEnabled:  true,
		DictationMode:  projectstate.ChatDictationModeAuto,
	}); err != nil {
		t.Fatalf("seed linked chat target: %v", err)
	}

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, t.TempDir(), nil, nil, nil)
	post := func(route string, body any) *httptest.ResponseRecorder {
		t.Helper()

		request := httptest.NewRequest(
			http.MethodPost,
			"/api"+route,
			strings.NewReader(mustMarshalProjectRouteRequest(t, body)),
		)
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		return response
	}

	createResponse := post(RouteCreateAgenticEdge, map[string]any{
		"projectConfigId": "project-alpha",
		"sourceSectionId": "chat-source",
		"targetSectionId": "chat-target",
		"kind":            "chat_chat",
	})
	if createResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 create-agentic-edge response, got %d with body %q", createResponse.Code, createResponse.Body.String())
	}

	project := projectRuntime.Snapshot().Document.Projects["project-alpha"]
	targetModifier := decodeProjectRouteRawObject(t, project.Sections["chat-target"].SharedModifier)
	if got := targetModifier["managed"]; got != true {
		t.Fatalf("expected linked chat target to remain managed, got %#v", got)
	}
	if got := targetModifier["engineConfigId"]; got != "engine-linked" {
		t.Fatalf("expected linked chat target to retain engineConfigId, got %#v", got)
	}
	if len(project.AgenticEdges) != 1 {
		t.Fatalf("expected one created agentic edge, got %#v", project.AgenticEdges)
	}

	createdEdge := project.AgenticEdges[0]
	updatedEdge := createdEdge
	updatedEdge.Hidden = true
	updateResponse := post(RouteUpdateAgenticEdge, UpdateAgenticEdgeRequest{
		ProjectID: "project-alpha",
		Edge:      updatedEdge,
	})
	if updateResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 update-agentic-edge response, got %d with body %q", updateResponse.Code, updateResponse.Body.String())
	}

	replacementEdge := projectstate.AgenticEdge{
		ID:              "edge-linked-replacement",
		SourceSectionID: "chat-source",
		TargetSectionID: "chat-target",
		Kind:            "chat_chat",
		ContextMode:     "reference_only",
	}
	setResponse := post(RouteSetAgenticEdges, SetAgenticEdgesRequest{
		ProjectID: "project-alpha",
		Edges:     []projectstate.AgenticEdge{replacementEdge},
	})
	if setResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 set-agentic-edges response, got %d with body %q", setResponse.Code, setResponse.Body.String())
	}

	project = projectRuntime.Snapshot().Document.Projects["project-alpha"]
	if !reflect.DeepEqual(project.AgenticEdges, []projectstate.AgenticEdge{replacementEdge}) {
		t.Fatalf("expected linked chat target edge set to roundtrip replacement, got %#v", project.AgenticEdges)
	}
}

func TestRegisterProjectRoutesAgenticEdgesIgnoreInvalidLLMConfigForNonLinkedEdges(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": graphEdgeRouteTestProject(t),
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

	workspaceRoot := t.TempDir()
	if err := os.WriteFile(filepath.Join(workspaceRoot, "llm_config.json"), []byte(`{"configs":{"broken":[]}}`), 0o600); err != nil {
		t.Fatalf("write invalid llm config: %v", err)
	}

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, workspaceRoot, nil, nil, nil)
	post := func(route string, body any) *httptest.ResponseRecorder {
		t.Helper()

		request := httptest.NewRequest(
			http.MethodPost,
			"/api"+route,
			strings.NewReader(mustMarshalProjectRouteRequest(t, body)),
		)
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		return response
	}

	createResponse := post(RouteCreateAgenticEdge, map[string]any{
		"projectConfigId": "project-alpha",
		"sourceSectionId": "chat-source",
		"targetSectionId": "source-section",
		"kind":            "chat_section",
	})
	if createResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 create-agentic-edge response, got %d with body %q", createResponse.Code, createResponse.Body.String())
	}

	project := projectRuntime.Snapshot().Document.Projects["project-alpha"]
	if len(project.AgenticEdges) != 1 {
		t.Fatalf("expected one created non-linked agentic edge, got %#v", project.AgenticEdges)
	}

	updatedEdge := project.AgenticEdges[0]
	updatedEdge.Hidden = true
	updateResponse := post(RouteUpdateAgenticEdge, UpdateAgenticEdgeRequest{
		ProjectID: "project-alpha",
		Edge:      updatedEdge,
	})
	if updateResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 update-agentic-edge response, got %d with body %q", updateResponse.Code, updateResponse.Body.String())
	}

	replacementEdge := projectstate.AgenticEdge{
		ID:              "edge-chat-section-replacement",
		SourceSectionID: "chat-source",
		TargetSectionID: "source-section",
		Kind:            "chat_section",
		ContextMode:     "reference_only",
	}
	setResponse := post(RouteSetAgenticEdges, SetAgenticEdgesRequest{
		ProjectID: "project-alpha",
		Edges:     []projectstate.AgenticEdge{replacementEdge},
	})
	if setResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 set-agentic-edges response, got %d with body %q", setResponse.Code, setResponse.Body.String())
	}

	project = projectRuntime.Snapshot().Document.Projects["project-alpha"]
	if !reflect.DeepEqual(project.AgenticEdges, []projectstate.AgenticEdge{replacementEdge}) {
		t.Fatalf("expected malformed llm config to stay irrelevant for non-linked agentic edges, got %#v", project.AgenticEdges)
	}
}

func TestRegisterProjectRoutesAgenticEdgesRejectInvalidKindsAndMissingIDs(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": graphEdgeRouteTestProject(t),
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
		name         string
		route        string
		body         string
		expectedCode int
		expectedBody string
	}{
		{
			name:         "invalid kind",
			route:        RouteCreateAgenticEdge,
			body:         `{"projectConfigId":"project-alpha","sourceSectionId":"chat-source","targetSectionId":"chat-target","kind":"chat_plain"}`,
			expectedCode: http.StatusUnprocessableEntity,
			expectedBody: `"code":"agentic_edge_invalid"`,
		},
		{
			name:         "missing id",
			route:        RouteDeleteAgenticEdges,
			body:         `{"projectConfigId":"project-alpha","edgeIds":["missing-agentic-edge"]}`,
			expectedCode: http.StatusNotFound,
			expectedBody: `"code":"agentic_edge_not_found"`,
		},
	} {
		request := httptest.NewRequest(http.MethodPost, "/api"+requestSpec.route, strings.NewReader(requestSpec.body))
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != requestSpec.expectedCode {
			t.Fatalf("expected %d for %s, got %d with body %q", requestSpec.expectedCode, requestSpec.name, response.Code, response.Body.String())
		}
		if !strings.Contains(response.Body.String(), requestSpec.expectedBody) {
			t.Fatalf("expected %s body to contain %s, got %q", requestSpec.name, requestSpec.expectedBody, response.Body.String())
		}
	}
}

func TestRegisterProjectRoutesBlocksDeploymentMode(t *testing.T) {
	t.Parallel()

	handler := newProjectRouteTestHandler(t, config.ModeShare, nil, "", nil, nil, nil)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetProjectConfigCodegenTargets,
		strings.NewReader(`{"projectConfigId":"project-alpha","codegenTargets":[]}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"mode_forbidden"`) {
		t.Fatalf("expected mode_forbidden error, got %q", response.Body.String())
	}
}

func TestRegisterProjectRoutesSetsCallableAndPersistsUpdatedProjectState(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": callableRouteTestProject(t),
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

	handler := newProjectRouteTestHandler(
		t,
		config.ModeIDE,
		projectRuntime,
		t.TempDir(),
		nil,
		nil,
		projectstate.CallableSignatureResolver(&stubProjectRouteCallableSignatureResolver{
			result: projectstate.CallableSignatureResult{
				Documentation: "Sort values.",
				Status:        projectstate.SignatureHelpStatusMatched,
				Params: []projectstate.CallableParamProposal{
					{
						Name:         "iterable",
						Description:  "Values to sort.",
						PassingStyle: "POSITIONAL_ONLY",
					},
					{
						Name:         "reverse",
						DefaultValue: "False",
						Description:  "Descending order flag.",
						PassingStyle: "KEYWORD_ONLY",
					},
				},
			},
			ok: true,
		}),
	)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetCallable,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"callable-section","callableName":"sorted","refetchParams":true}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload projectstate.SetCallableResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode set callable payload: %v", err)
	}
	if payload.CallableID == nil || *payload.CallableID != "callable-2" {
		t.Fatalf("expected callable-2 response, got %#v", payload.CallableID)
	}
	if payload.LSPStatus != projectstate.SignatureHelpStatusMatched {
		t.Fatalf("expected matched status, got %q", payload.LSPStatus)
	}
	if len(payload.ChildCodeObjs) != 2 {
		t.Fatalf("expected two child params, got %#v", payload.ChildCodeObjs)
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

	var latestPayload ProjectStateSingleConfigWithCompletedOpIDs
	if err := json.Unmarshal(latestResponse.Body.Bytes(), &latestPayload); err != nil {
		t.Fatalf("decode latest project payload: %v", err)
	}
	callableVariantID := latestPayload.ProjectState.ProjectConfig.SectionVariantMap["callable-section"]
	callableImplID := latestPayload.ProjectState.SectionVariants[callableVariantID].Impl
	callableImplPayload := string(latestPayload.ProjectState.SectionImpls[callableImplID])
	if !strings.Contains(callableImplPayload, `"callable":"callable-2"`) {
		t.Fatalf("expected callable-2 in persisted payload, got %q", callableImplPayload)
	}
}
