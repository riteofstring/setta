package httpapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"setta/internal/config"
	"setta/internal/projectstate"
)

func TestRegisterProjectRoutesSectionVariantMutationsPersistLatestState(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion: projectstate.CurrentSchemaVersion,
		Projects: map[string]projectstate.Project{
			"project-alpha": sectionVariantRouteTestProject(t, true),
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

	createdVariantID := createProjectRouteSectionVariantForMutationTest(t, handler)
	postProjectRouteSectionVariantMutationRequests(t, handler, createdVariantID)
	assertProjectRouteSectionVariantMutationsPersisted(t, projectRuntime.Snapshot().Document.Projects["project-alpha"], createdVariantID)
}

func createProjectRouteSectionVariantForMutationTest(t *testing.T, handler http.Handler) string {
	t.Helper()

	createRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteCreateNewSectionVariant,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"source-section","frontendOpId":"frontend-op-create-variant"}`),
	)
	createRequest.Header.Set("Content-Type", "application/json")
	createResponse := httptest.NewRecorder()
	handler.ServeHTTP(createResponse, createRequest)
	if createResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 for createNewSectionVariant, got %d with body %q", createResponse.Code, createResponse.Body.String())
	}

	var created CreateNewSectionVariantResponse
	if err := json.Unmarshal(createResponse.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode createNewSectionVariant response: %v", err)
	}
	if strings.TrimSpace(created.VariantID) == "" {
		t.Fatal("expected createNewSectionVariant to return a variant id")
	}
	return created.VariantID
}

func postProjectRouteSectionVariantMutationRequests(t *testing.T, handler http.Handler, createdVariantID string) {
	t.Helper()

	for _, requestSpec := range []struct {
		route string
		body  string
	}{
		{
			route: RouteSetSectionVariant,
			body:  `{"projectConfigId":"project-alpha","sectionId":"source-section","variantId":"source-variant-a","frontendOpId":"frontend-op-set-variant"}`,
		},
		{
			route: RouteSetDefaultSectionVariant,
			body:  `{"projectConfigId":"project-alpha","sectionId":"source-section","variantId":"source-variant-a","frontendOpId":"frontend-op-set-default"}`,
		},
		{
			route: RouteSetSectionVariantSortOrder,
			body:  fmt.Sprintf(`{"projectConfigId":"project-alpha","sectionId":"source-section","orderedVariantIds":["source-variant-a",%q,"source-variant-b"],"frontendOpId":"frontend-op-sort-variants"}`, createdVariantID),
		},
		{
			route: RouteSetSectionVariantName,
			body:  `{"projectConfigId":"project-alpha","variantId":"source-variant-a","name":"Renamed Variant","frontendOpId":"frontend-op-rename-variant"}`,
		},
		{
			route: RouteToggleVariantFrozen,
			body:  `{"projectConfigId":"project-alpha","variantId":"source-variant-a","frontendOpId":"frontend-op-freeze-variant"}`,
		},
		{
			route: RouteToggleVariantJSONSource,
			body:  `{"projectConfigId":"project-alpha","sectionId":"json-section","variantId":"json-variant-b","frontendOpId":"frontend-op-toggle-json-source"}`,
		},
		{
			route: RouteSetVariantJSONSourceKeys,
			body:  `{"projectConfigId":"project-alpha","sectionId":"json-section","variantId":"json-variant-b","jsonSourceKeys":["config","nested"],"frontendOpId":"frontend-op-json-source-keys"}`,
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
}

func assertProjectRouteSectionVariantMutationsPersisted(t *testing.T, project projectstate.Project, createdVariantID string) {
	t.Helper()

	if _, ok := project.SectionVariants[createdVariantID]; !ok {
		t.Fatalf("expected created variant %q to persist in project state", createdVariantID)
	}
	if got := project.SectionVariantMap["source-section"]; got != "source-variant-a" {
		t.Fatalf("expected source-section active variant source-variant-a, got %q", got)
	}
	if got := project.Sections["source-section"].DefaultVariantID; got != "source-variant-a" {
		t.Fatalf("expected source-section default variant source-variant-a, got %q", got)
	}
	if got := project.Sections["source-section"].VariantIDs; len(got) != 3 || got[0] != "source-variant-a" || got[1] != createdVariantID || got[2] != "source-variant-b" {
		t.Fatalf("expected source-section variants [source-variant-a %s source-variant-b], got %#v", createdVariantID, got)
	}
	if got := project.SectionVariants["source-variant-a"].Name; got != "Renamed Variant" {
		t.Fatalf("expected source-variant-a name Renamed Variant, got %q", got)
	}
	if !project.SectionVariants["source-variant-a"].IsFrozen {
		t.Fatal("expected source-variant-a to be frozen after toggle")
	}

	payload, err := project.EffectiveSectionPayload("json-section", "json-variant-b")
	if err != nil {
		t.Fatalf("effective payload after json-source mutations: %v", err)
	}
	isJSONSource, _ := payload["isJsonSource"].(bool)
	if !isJSONSource {
		t.Fatal("expected json-variant-b payload to enable json source")
	}
	configLanguage, _ := payload["configLanguage"].(string)
	if configLanguage != "json" {
		t.Fatalf("expected json-variant-b configLanguage json, got %q", configLanguage)
	}
	rawKeys, _ := payload["jsonSourceKeys"].([]any)
	if len(rawKeys) != 2 || rawKeys[0] != "config" || rawKeys[1] != "nested" {
		t.Fatalf("expected json-variant-b jsonSourceKeys [config nested], got %#v", rawKeys)
	}
}

func TestRegisterProjectRoutesSetSectionVariantPrunesInvalidAgenticEdges(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": sectionVariantAgenticEdgeRouteTestProject(t),
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
		"/api"+RouteSetSectionVariant,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"chat-target","variantId":"chat-target-text-variant"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200 for setSectionVariant, got %d with body %q", response.Code, response.Body.String())
	}

	project := projectRuntime.Snapshot().Document.Projects["project-alpha"]
	if got := project.SectionVariantMap["chat-target"]; got != "chat-target-text-variant" {
		t.Fatalf("expected chat-target active variant chat-target-text-variant, got %q", got)
	}
	if len(project.AgenticEdges) != 0 {
		t.Fatalf("expected invalid agentic edges to be pruned, got %#v", project.AgenticEdges)
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
	if len(payload.ProjectState.ProjectConfig.AgenticEdges) != 0 {
		t.Fatalf("expected latest project state to omit pruned agentic edges, got %#v", payload.ProjectState.ProjectConfig.AgenticEdges)
	}
}

func TestRegisterProjectRoutesSectionVariantMutationsRejectInvalidInputs(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion: projectstate.CurrentSchemaVersion,
		Projects: map[string]projectstate.Project{
			"project-alpha": sectionVariantRouteTestProject(t, false),
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
			route:        RouteSetSectionVariantSortOrder,
			body:         `{"projectConfigId":"project-alpha","sectionId":"missing-section","orderedVariantIds":["source-variant-a","source-variant-b"]}`,
			expectedCode: http.StatusNotFound,
			expectedBody: `"code":"section_not_found"`,
		},
		{
			route:        RouteSetSectionVariantSortOrder,
			body:         `{"projectConfigId":"project-alpha","sectionId":"source-section","orderedVariantIds":["source-variant-a","missing-variant"]}`,
			expectedCode: http.StatusNotFound,
			expectedBody: `"code":"variant_not_found"`,
		},
		{
			route:        RouteSetSectionVariantSortOrder,
			body:         `{"projectConfigId":"project-alpha","sectionId":"source-section","orderedVariantIds":["source-variant-a","source-variant-a"]}`,
			expectedCode: http.StatusUnprocessableEntity,
			expectedBody: `"code":"variant_sort_order_invalid"`,
		},
		{
			route:        RouteToggleVariantJSONSource,
			body:         `{"projectConfigId":"project-alpha","sectionId":"code-section","variantId":"code-variant"}`,
			expectedCode: http.StatusUnprocessableEntity,
			expectedBody: `"code":"dict_section_required"`,
		},
		{
			route:        RouteSetVariantJSONSourceKeys,
			body:         `{"projectConfigId":"project-alpha","sectionId":"json-section","variantId":"json-variant-b","jsonSourceKeys":["config"]}`,
			expectedCode: http.StatusForbidden,
			expectedBody: `"code":"json_source_key_edits_disabled"`,
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

func TestRegisterProjectRoutesSetVariantJSONSourceKeysValidatesExistingFilesAndMarksMissingFiles(t *testing.T) {
	t.Parallel()

	t.Run("rejects missing path in existing file", func(t *testing.T) {
		assertProjectRouteSetVariantJSONSourceKeysRejectsExistingFilePath(
			t,
			"missing",
			`"code":"json_source_keys_path_not_found"`,
			`jsonSourceKeys path not found: missing`,
		)
	})

	t.Run("rejects leaf target in existing file", func(t *testing.T) {
		assertProjectRouteSetVariantJSONSourceKeysRejectsExistingFilePath(
			t,
			"leaf",
			`"code":"json_source_keys_object_required"`,
			`jsonSourceKeys must resolve to an object: leaf`,
		)
	})

	t.Run("accepts missing file and marks section missing", func(t *testing.T) {
		assertProjectRouteSetVariantJSONSourceKeysMarksMissingFile(t)
	})
}

func assertProjectRouteSetVariantJSONSourceKeysRejectsExistingFilePath(t *testing.T, key string, expectedCode string, expectedDetail string) {
	t.Helper()

	workspaceRoot := t.TempDir()
	writeProjectRouteSectionVariantJSONSourceFile(t, workspaceRoot)
	_, handler := newProjectRouteSectionVariantJSONSourceHandler(t, workspaceRoot)
	response := postProjectRouteSectionVariantJSONSourceKeys(t, handler, key)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), expectedCode) {
		t.Fatalf("expected response body to contain %s, got %q", expectedCode, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), expectedDetail) {
		t.Fatalf("expected response body to contain %s, got %q", expectedDetail, response.Body.String())
	}
}

func assertProjectRouteSetVariantJSONSourceKeysMarksMissingFile(t *testing.T) {
	t.Helper()

	workspaceRoot := t.TempDir()
	projectRuntime, handler := newProjectRouteSectionVariantJSONSourceHandler(t, workspaceRoot)
	response := postProjectRouteSectionVariantJSONSourceKeys(t, handler, "config")
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	project := projectRuntime.Snapshot().Document.Projects["project-alpha"]
	payload, err := project.EffectiveSectionPayload("json-section", "json-variant-a")
	if err != nil {
		t.Fatalf("effective payload after json-source key edit: %v", err)
	}
	rawKeys, _ := payload["jsonSourceKeys"].([]any)
	if len(rawKeys) != 1 || rawKeys[0] != "config" {
		t.Fatalf("expected json-variant-a jsonSourceKeys [config], got %#v", rawKeys)
	}
	jsonSourceMissing, _ := payload["jsonSourceMissing"].(bool)
	if !jsonSourceMissing {
		t.Fatal("expected missing json source file to set jsonSourceMissing")
	}
}

func writeProjectRouteSectionVariantJSONSourceFile(t *testing.T, workspaceRoot string) {
	t.Helper()

	if err := os.MkdirAll(filepath.Join(workspaceRoot, "data"), 0o755); err != nil {
		t.Fatalf("mkdir data: %v", err)
	}
	if err := os.WriteFile(filepath.Join(workspaceRoot, "data", "source.json"), []byte("{\"config\":{\"nested\":{}},\"leaf\":1}\n"), 0o644); err != nil {
		t.Fatalf("write json source file: %v", err)
	}
}

func newProjectRouteSectionVariantJSONSourceHandler(t *testing.T, workspaceRoot string) (*projectstate.Runtime, http.Handler) {
	t.Helper()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion: projectstate.CurrentSchemaVersion,
		Projects: map[string]projectstate.Project{
			"project-alpha": sectionVariantRouteTestProject(t, true),
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

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, workspaceRoot, nil, nil, nil)
	return projectRuntime, handler
}

func postProjectRouteSectionVariantJSONSourceKeys(t *testing.T, handler http.Handler, key string) *httptest.ResponseRecorder {
	t.Helper()

	requestBody := mustMarshalProjectRouteRequest(t, map[string]any{
		"projectConfigId": "project-alpha",
		"sectionId":       "json-section",
		"variantId":       "json-variant-a",
		"jsonSourceKeys":  []string{key},
	})
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetVariantJSONSourceKeys,
		strings.NewReader(requestBody),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	return response
}
