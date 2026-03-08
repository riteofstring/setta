package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"setta/internal/agentruns"
	"setta/internal/chatsections"
	"setta/internal/codegen"
	"setta/internal/config"
	"setta/internal/modes"
	"setta/internal/projectstate"
	"setta/internal/projectview"
	"setta/internal/settingsstate"
)

func TestRegisterProjectRoutesSetsCodegenTargetsAndReturnsProjectState(t *testing.T) {
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

	validatedTargets := make([]string, 0, 1)
	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, t.TempDir(), projectstate.CodegenTargetValidatorFunc(func(_ context.Context, target projectstate.ProjectCodegenTarget) error {
		validatedTargets = append(validatedTargets, target.Language)
		return nil
	}), nil, nil)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetProjectConfigCodegenTargets,
		strings.NewReader(`{"projectConfigId":"project-alpha","codegenTargets":[{"language":"setta-fixture-backend-codegen:typescript","options":{"className":"AlphaState"}}]}`),
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
	if payload.ProjectConfig.ID != "project-alpha" {
		t.Fatalf("expected project-alpha response, got %q", payload.ProjectConfig.ID)
	}
	if len(payload.ProjectConfig.CodegenTargets) != 1 {
		t.Fatalf("expected one returned codegen target, got %d", len(payload.ProjectConfig.CodegenTargets))
	}
	if string(payload.ProjectConfig.CodegenTargets[0]) != `{"language":"setta-fixture-backend-codegen:typescript","options":{"className":"AlphaState"}}` {
		t.Fatalf("unexpected returned codegen target %q", string(payload.ProjectConfig.CodegenTargets[0]))
	}
	if len(validatedTargets) != 1 || validatedTargets[0] != "setta-fixture-backend-codegen:typescript" {
		t.Fatalf("unexpected validated targets %#v", validatedTargets)
	}

	snapshot := projectRuntime.Snapshot()
	project := snapshot.Document.Projects["project-alpha"]
	if len(project.CodegenTargets) != 1 {
		t.Fatalf("expected one persisted codegen target, got %d", len(project.CodegenTargets))
	}
	if string(project.CodegenTargets[0].Payload) != `{"language":"setta-fixture-backend-codegen:typescript","options":{"className":"AlphaState"}}` {
		t.Fatalf("unexpected persisted payload %q", string(project.CodegenTargets[0].Payload))
	}
}

func TestRegisterProjectRoutesReturnsLatestProjectStateEnvelope(t *testing.T) {
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

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, t.TempDir(), nil, nil, nil)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetLatestProjectState,
		strings.NewReader(`{"projectConfigId":"project-alpha"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload ProjectStateSingleConfigWithCompletedOpIDs
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode latest project state payload: %v", err)
	}
	if payload.ProjectState.ProjectConfig.ID != "project-alpha" {
		t.Fatalf("expected project-alpha response, got %q", payload.ProjectState.ProjectConfig.ID)
	}
	if len(payload.CompletedOpIDs) != 0 || len(payload.PendingOpIDs) != 0 {
		t.Fatalf("expected empty op ids, got completed=%#v pending=%#v", payload.CompletedOpIDs, payload.PendingOpIDs)
	}
}

func TestRegisterProjectRoutesGetsPasswordParamValue(t *testing.T) {
	t.Parallel()

	// The Go project route should return the stored secret for active password
	// params without relying on the Python project manager path.
	passwordSecrets := projectstate.NewMemoryPasswordSecretStore()
	if err := passwordSecrets.Set("shared-secret-impl", "topsecret"); err != nil {
		t.Fatalf("seed password secret: %v", err)
	}

	projectRuntime, err := projectstate.OpenOverlayRuntimeWithOptions(projectstate.Document{
		SchemaVersion: projectstate.CurrentSchemaVersion,
		Projects: map[string]projectstate.Project{
			"project-alpha": passwordParamRouteTestProject(t),
		},
	}, projectstate.RuntimeOptions{
		PasswordSecrets: passwordSecrets,
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
		"/api"+RouteGetPasswordParamValue,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"dict-a","paramInfoId":"shared-secret"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload GetPasswordParamValueResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode password param response: %v", err)
	}
	if payload.Value != "topsecret" {
		t.Fatalf("expected topsecret, got %q", payload.Value)
	}
}

func TestRegisterProjectRoutesGetPasswordParamValueRejectsNonPasswordParam(t *testing.T) {
	t.Parallel()

	// Non-password params should fail with a typed caller error instead of
	// falling through to a generic internal failure.
	passwordSecrets := projectstate.NewMemoryPasswordSecretStore()
	projectRuntime, err := projectstate.OpenOverlayRuntimeWithOptions(projectstate.Document{
		SchemaVersion: projectstate.CurrentSchemaVersion,
		Projects: map[string]projectstate.Project{
			"project-alpha": passwordParamRouteTestProject(t),
		},
	}, projectstate.RuntimeOptions{
		PasswordSecrets: passwordSecrets,
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
		"/api"+RouteGetPasswordParamValue,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"dict-a","paramInfoId":"shared-child"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"password_param_required"`) {
		t.Fatalf("expected password_param_required body, got %q", response.Body.String())
	}
}

func TestRegisterProjectRoutesDeleteSectionVariantOrAskReturnsWorkspacePathForJSONSourceVariant(t *testing.T) {
	t.Parallel()

	workspaceRoot := filepath.Join(t.TempDir(), "workspace")
	if err := os.MkdirAll(filepath.Join(workspaceRoot, "data"), 0o755); err != nil {
		t.Fatalf("mkdir workspace data: %v", err)
	}

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion: projectstate.CurrentSchemaVersion,
		Projects: map[string]projectstate.Project{
			"project-alpha": sectionVariantDeletionRouteTestProject(t),
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
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteDeleteSectionVariantOrAsk,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"json-section","variantId":"json-variant-a"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var filepathPayload string
	if err := json.Unmarshal(response.Body.Bytes(), &filepathPayload); err != nil {
		t.Fatalf("decode filepath payload: %v", err)
	}
	if filepathPayload != filepath.Join(workspaceRoot, "data", "source.json") {
		t.Fatalf("expected json-source filepath %q, got %q", filepath.Join(workspaceRoot, "data", "source.json"), filepathPayload)
	}
	if _, ok := projectRuntime.Snapshot().Document.Projects["project-alpha"].SectionVariants["json-variant-a"]; !ok {
		t.Fatal("did not expect prompt-only route to delete the json-source variant")
	}
}

func TestRegisterProjectRoutesDeleteSectionVariantOrAskDeletesNonJSONSourceVariant(t *testing.T) {
	t.Parallel()

	workspaceRoot := filepath.Join(t.TempDir(), "workspace")
	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		t.Fatalf("mkdir workspace root: %v", err)
	}

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion: projectstate.CurrentSchemaVersion,
		Projects: map[string]projectstate.Project{
			"project-alpha": sectionVariantDeletionRouteTestProject(t),
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
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteDeleteSectionVariantOrAsk,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"source-section","variantId":"source-variant-b"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	if strings.TrimSpace(response.Body.String()) != "null" {
		t.Fatalf("expected null delete response body, got %q", response.Body.String())
	}

	project := projectRuntime.Snapshot().Document.Projects["project-alpha"]
	sourceSection := project.Sections["source-section"]
	if !reflect.DeepEqual(sourceSection.VariantIDs, []string{"source-variant-a"}) {
		t.Fatalf("expected source-section variants [source-variant-a], got %#v", sourceSection.VariantIDs)
	}
	if got := project.SectionVariantMap["source-section"]; got != "source-variant-a" {
		t.Fatalf("expected active source-section variant source-variant-a, got %q", got)
	}
}

func TestRegisterProjectRoutesDeleteJSONSourceFileAndVariantDeletesWorkspaceFileAndVariant(t *testing.T) {
	t.Parallel()

	workspaceRoot := filepath.Join(t.TempDir(), "workspace")
	targetPath := filepath.Join(workspaceRoot, "data", "source.json")
	if err := os.MkdirAll(filepath.Dir(targetPath), 0o755); err != nil {
		t.Fatalf("mkdir json-source parent: %v", err)
	}
	if err := os.WriteFile(targetPath, []byte(`{"ok":true}`), 0o644); err != nil {
		t.Fatalf("seed json-source file: %v", err)
	}

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion: projectstate.CurrentSchemaVersion,
		Projects: map[string]projectstate.Project{
			"project-alpha": sectionVariantDeletionRouteTestProject(t),
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
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteDeleteJSONSourceFileAndVariant,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"json-section","variantId":"json-variant-a","filepath":"`+targetPath+`"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	if _, err := os.Stat(targetPath); !os.IsNotExist(err) {
		t.Fatalf("expected json-source file to be removed, stat err=%v", err)
	}

	project := projectRuntime.Snapshot().Document.Projects["project-alpha"]
	jsonSection := project.Sections["json-section"]
	if !reflect.DeepEqual(jsonSection.VariantIDs, []string{"json-variant-b"}) {
		t.Fatalf("expected json-section variants [json-variant-b], got %#v", jsonSection.VariantIDs)
	}
	if got := project.SectionVariantMap["json-section"]; got != "json-variant-b" {
		t.Fatalf("expected active json-section variant json-variant-b, got %q", got)
	}
	if _, ok := project.SectionVariants["json-variant-a"]; ok {
		t.Fatal("did not expect deleted json-source variant to remain in project state")
	}
}

func TestRegisterProjectRoutesDeleteJSONSourceFileAndVariantRejectsPathsOutsideWorkspaceRoot(t *testing.T) {
	t.Parallel()

	workspaceRoot := filepath.Join(t.TempDir(), "workspace")
	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		t.Fatalf("mkdir workspace root: %v", err)
	}

	project := sectionVariantDeletionRouteTestProject(t)
	jsonVariant := project.SectionVariants["json-variant-a"]
	jsonVariant.Name = "../outside.json"
	project.SectionVariants["json-variant-a"] = jsonVariant
	project = mustNormalizedProjectRouteProject(t, project)

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion: projectstate.CurrentSchemaVersion,
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

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, workspaceRoot, nil, nil, nil)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteDeleteJSONSourceFileAndVariant,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"json-section","variantId":"json-variant-a","filepath":"../outside.json"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"filepath_forbidden"`) {
		t.Fatalf("expected filepath_forbidden body, got %q", response.Body.String())
	}
	if _, ok := projectRuntime.Snapshot().Document.Projects["project-alpha"].SectionVariants["json-variant-a"]; !ok {
		t.Fatal("did not expect forbidden filepath request to delete the json-source variant")
	}
}

func TestRegisterProjectRoutesReturnsCompletedFrontendOpIDsAfterMutation(t *testing.T) {
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

	// A successful mutation should mark the frontend op completed in the next
	// hydrate payload so optimistic state can clear deterministically.
	mutateRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetViewport,
		strings.NewReader(`{"projectConfigId":"project-alpha","frontendOpId":"frontend-op-1","viewport":{"x":15,"y":25,"zoom":1.25}}`),
	)
	mutateRequest.Header.Set("Content-Type", "application/json")
	mutateResponse := httptest.NewRecorder()
	handler.ServeHTTP(mutateResponse, mutateRequest)
	if mutateResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 from setViewport, got %d with body %q", mutateResponse.Code, mutateResponse.Body.String())
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
		t.Fatalf("expected 200 from getLatestProjectState, got %d with body %q", latestResponse.Code, latestResponse.Body.String())
	}

	var payload ProjectStateSingleConfigWithCompletedOpIDs
	if err := json.Unmarshal(latestResponse.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode latest project state payload: %v", err)
	}
	if !reflect.DeepEqual(payload.CompletedOpIDs, []string{"frontend-op-1"}) {
		t.Fatalf("expected completed frontend op id [frontend-op-1], got %#v", payload.CompletedOpIDs)
	}
	if len(payload.PendingOpIDs) != 0 {
		t.Fatalf("expected no pending frontend op ids, got %#v", payload.PendingOpIDs)
	}
	if payload.ProjectState.ProjectConfig.Viewport == nil || payload.ProjectState.ProjectConfig.Viewport.X != 15 {
		t.Fatalf("expected updated viewport in hydrate payload, got %#v", payload.ProjectState.ProjectConfig.Viewport)
	}

	// Completed ids are one-shot metadata and should be cleared after the hydrate
	// that exposes them.
	secondLatestRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetLatestProjectState,
		strings.NewReader(`{"projectConfigId":"project-alpha"}`),
	)
	secondLatestRequest.Header.Set("Content-Type", "application/json")
	secondLatestResponse := httptest.NewRecorder()
	handler.ServeHTTP(secondLatestResponse, secondLatestRequest)
	if secondLatestResponse.Code != http.StatusOK {
		t.Fatalf("expected second 200 from getLatestProjectState, got %d with body %q", secondLatestResponse.Code, secondLatestResponse.Body.String())
	}
	if err := json.Unmarshal(secondLatestResponse.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode second latest project state payload: %v", err)
	}
	if len(payload.CompletedOpIDs) != 0 {
		t.Fatalf("expected completed frontend op ids to clear after hydration, got %#v", payload.CompletedOpIDs)
	}
}

func TestRegisterProjectRoutesSetCodeInvokesServiceAndReturnsOK(t *testing.T) {
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

	var captured projectRouteSetCodeCall
	handler := newProjectRouteTestHandler(
		t,
		config.ModeIDE,
		projectRuntime,
		t.TempDir(),
		nil,
		nil,
		nil,
		projectRouteCodeUpdateService{
			setCode: func(_ context.Context, projectID string, sectionID string, code string) error {
				captured = projectRouteSetCodeCall{
					ProjectID: projectID,
					SectionID: sectionID,
					Code:      code,
				}
				return nil
			},
		},
	)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetCode,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"section-1","code":"print('updated')\n"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	if captured != (projectRouteSetCodeCall{
		ProjectID: "project-alpha",
		SectionID: "section-1",
		Code:      "print('updated')\n",
	}) {
		t.Fatalf("unexpected setCode call %#v", captured)
	}
}

func TestRegisterProjectRoutesCreatesTopLevelPluginLanguageSection(t *testing.T) {
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

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, t.TempDir(), nil, nil, nil)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteCreateTopLevelSection,
		strings.NewReader(`{"projectConfigId":"project-alpha","implType":"Code","implOverrides":{"type":"Code","codeLanguage":"FixtureDSL"}}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload projectstate.CreateTopLevelSectionResult
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode createTopLevelSection response: %v", err)
	}
	if strings.TrimSpace(payload.SectionID) == "" {
		t.Fatalf("expected created section id, got %#v", payload)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project snapshot: %v", err)
	}
	_, _, impl, err := project.ResolveSection(payload.SectionID)
	if err != nil {
		t.Fatalf("resolve created section: %v", err)
	}
	if !impl.IsCode() || impl.Code == nil {
		t.Fatalf("expected created code section, got %#v", impl)
	}
	if impl.Code.Language != projectstate.CodeLanguage("fixturedsl") {
		t.Fatalf("expected plugin code language fixturedsl, got %q", impl.Code.Language)
	}
}

func TestRegisterProjectRoutesFormatCodeInvokesServiceAndReturnsOK(t *testing.T) {
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

	var captured projectRouteFormatCodeCall
	handler := newProjectRouteTestHandler(
		t,
		config.ModeIDE,
		projectRuntime,
		t.TempDir(),
		nil,
		nil,
		nil,
		projectRouteCodeUpdateService{
			formatCode: func(_ context.Context, projectID string, sectionID string) error {
				captured = projectRouteFormatCodeCall{
					ProjectID: projectID,
					SectionID: sectionID,
				}
				return nil
			},
		},
	)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteFormatCode,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"section-1"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	if captured != (projectRouteFormatCodeCall{
		ProjectID: "project-alpha",
		SectionID: "section-1",
	}) {
		t.Fatalf("unexpected formatCode call %#v", captured)
	}
}

func TestRegisterProjectRoutesSetSectionNameReturns422ForInvalidName(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion: projectstate.CurrentSchemaVersion,
		Projects: map[string]projectstate.Project{
			"project-alpha": {ID: "project-alpha", Name: "Alpha"},
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

	handler := newProjectRouteTestHandlerWithRenameService(
		t,
		config.ModeIDE,
		projectRuntime,
		t.TempDir(),
		nil,
		nil,
		nil,
		nil,
		&stubProjectRouteRenameRefactorService{
			setSectionNameErr: &projectstate.InvalidSectionNameError{
				Message: "Section name cannot include path separators.",
			},
		},
	)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetSectionName,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"section-1","name":"bad/name","frontendOpId":"frontend-op-1"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"invalid_section_name"`) {
		t.Fatalf("expected invalid_section_name response, got %q", response.Body.String())
	}
}

func TestRegisterProjectRoutesAcceptRenameRefactorReturns404WhenPendingMissing(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion: projectstate.CurrentSchemaVersion,
		Projects: map[string]projectstate.Project{
			"project-alpha": {ID: "project-alpha", Name: "Alpha"},
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

	handler := newProjectRouteTestHandlerWithRenameService(
		t,
		config.ModeIDE,
		projectRuntime,
		t.TempDir(),
		nil,
		nil,
		nil,
		nil,
		&stubProjectRouteRenameRefactorService{
			acceptErr: fmt.Errorf("%w: rename-op-1", projectstate.ErrRenameRefactorPendingNotFound),
		},
	)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteAcceptRenameRefactor,
		strings.NewReader(`{"projectConfigId":"project-alpha","frontendOpId":"rename-op-1"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"rename_refactor_not_found"`) {
		t.Fatalf("expected rename_refactor_not_found response, got %q", response.Body.String())
	}
}

func TestRegisterProjectRoutesSetCodeReturnsForbiddenForReadOnlyBinding(t *testing.T) {
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
		nil,
		nil,
		nil,
		projectRouteCodeUpdateService{
			setCode: func(context.Context, string, string, string) error {
				return fmt.Errorf("%w: %q", projectstate.ErrCodeSectionReadOnly, "section-1")
			},
		},
	)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetCode,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"section-1","code":"print('updated')\n"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"code_section_read_only"`) {
		t.Fatalf("expected read-only error body, got %q", response.Body.String())
	}
}

func TestRegisterProjectRoutesFormatCodeReturnsForbiddenForReadOnlyBinding(t *testing.T) {
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
		nil,
		nil,
		nil,
		projectRouteCodeUpdateService{
			formatCode: func(context.Context, string, string) error {
				return fmt.Errorf("%w: %q", projectstate.ErrCodeSectionReadOnly, "section-1")
			},
		},
	)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteFormatCode,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"section-1"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"code_section_read_only"`) {
		t.Fatalf("expected read-only error body, got %q", response.Body.String())
	}
}

func TestRegisterProjectRoutesFormatCodeReturns422ForInvalidTarget(t *testing.T) {
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
		nil,
		nil,
		nil,
		projectRouteCodeUpdateService{
			formatCode: func(context.Context, string, string) error {
				return projectstate.NewFormatCodeError("Format code only supports Python code sections.")
			},
		},
	)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteFormatCode,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"section-1"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"invalid_format_code"`) {
		t.Fatalf("expected invalid_format_code response, got %q", response.Body.String())
	}
}

func TestRegisterProjectRoutesSetWatchCodeEnabledBaselinesExistingInputs(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	watchFile := filepath.Join(workspaceRoot, "pkg", "watch_me.py")
	if err := os.MkdirAll(filepath.Dir(watchFile), 0o755); err != nil {
		t.Fatalf("mkdir watch file parent: %v", err)
	}
	if err := os.WriteFile(watchFile, []byte("def existing(value):\n    return value\n"), 0o644); err != nil {
		t.Fatalf("write watch file: %v", err)
	}

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:             "project-alpha",
				Name:           "Alpha",
				WatchCodeFiles: []string{"pkg/watch_me.py"},
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

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, workspaceRoot, nil, nil, nil)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetWatchCodeEnabled,
		strings.NewReader(`{"projectConfigId":"project-alpha","enabled":true}`),
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
		t.Fatalf("decode latest project state payload: %v", err)
	}
	if !payload.ProjectState.ProjectConfig.WatchCodeEnabled {
		t.Fatal("expected watch code to be enabled in latest project state")
	}
	expectedBaselineKey := filepath.Clean(watchFile)
	expectedIdentity := "pkg.watch_me.existing:function"
	if got := payload.ProjectState.ProjectConfig.WatchCodeBaselineByPath[expectedBaselineKey]; !reflect.DeepEqual(got, []string{expectedIdentity}) {
		t.Fatalf("expected watch code baseline %#v, got %#v", []string{expectedIdentity}, got)
	}
}

func TestRegisterProjectRoutesSetWatchCodeInputsBaselinesOnlyNewInputs(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	existingFile := filepath.Join(workspaceRoot, "pkg", "existing.py")
	newFile := filepath.Join(workspaceRoot, "pkg", "new_watch.py")
	if err := os.MkdirAll(filepath.Dir(existingFile), 0o755); err != nil {
		t.Fatalf("mkdir pkg: %v", err)
	}
	if err := os.WriteFile(existingFile, []byte("def existing(value):\n    return value\n"), 0o644); err != nil {
		t.Fatalf("write existing file: %v", err)
	}
	if err := os.WriteFile(newFile, []byte("class Added:\n    pass\n"), 0o644); err != nil {
		t.Fatalf("write new file: %v", err)
	}

	existingBaselineKey := filepath.Clean(existingFile)
	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:               "project-alpha",
				Name:             "Alpha",
				WatchCodeEnabled: true,
				WatchCodeFiles:   []string{"pkg/existing.py"},
				WatchCodeBaselineByPath: map[string][]string{
					existingBaselineKey: []string{"pkg.existing.existing:function"},
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

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, workspaceRoot, nil, nil, nil)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetWatchCodeInputs,
		strings.NewReader(`{"projectConfigId":"project-alpha","watchCodeFolders":[],"watchCodeFiles":["pkg/existing.py","pkg/new_watch.py"]}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	project := projectRuntime.Snapshot().Document.Projects["project-alpha"]
	if !reflect.DeepEqual(project.WatchCodeFiles, []string{"pkg/existing.py", "pkg/new_watch.py"}) {
		t.Fatalf("expected normalized watch files, got %#v", project.WatchCodeFiles)
	}
	if got := project.WatchCodeBaselineByPath[existingBaselineKey]; !reflect.DeepEqual(got, []string{"pkg.existing.existing:function"}) {
		t.Fatalf("expected existing baseline to stay unchanged, got %#v", project.WatchCodeBaselineByPath)
	}
	newBaselineKey := filepath.Clean(newFile)
	if got := project.WatchCodeBaselineByPath[newBaselineKey]; !reflect.DeepEqual(got, []string{"pkg.new_watch.Added:class_init"}) {
		t.Fatalf("expected new baseline, got %#v", project.WatchCodeBaselineByPath)
	}
}

func TestRegisterProjectRoutesRejectsWatchCodeInputsOutsideWorkspace(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
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

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, workspaceRoot, nil, nil, nil)
	outsideFile := filepath.Join(filepath.Dir(workspaceRoot), "outside_watch.py")
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetWatchCodeInputs,
		strings.NewReader(fmt.Sprintf(`{"projectConfigId":"project-alpha","watchCodeFolders":[],"watchCodeFiles":["%s"]}`, outsideFile)),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"invalid_watch_code_input"`) {
		t.Fatalf("expected invalid_watch_code_input error, got %q", response.Body.String())
	}
}

func TestRegisterProjectRoutesDisablesPythonCodegenAndReturnsCleanedProjectState(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
				CodegenTargets: []projectstate.ProjectCodegenTarget{
					{
						Language: string(projectstate.CodeLanguagePython),
						Payload:  projectstate.RawJSON(`{"language":"python","generateMetadata":true}`),
					},
				},
				GeneratedCodeBinding: &projectstate.CodeFileBinding{
					Path:       "code/sections/alpha/setta_gen.py",
					AccessMode: projectstate.CodeFileAccessModeReadOnly,
				},
				GeneratedMetadataBinding: &projectstate.CodeFileBinding{
					Path:       "code/sections/alpha/setta_gen_meta.py",
					AccessMode: projectstate.CodeFileAccessModeReadOnly,
				},
				EntryCodeBlockID:   "gen-python-section",
				TopLevelSectionIDs: []string{"manual-section", "gen-python-section", "gen-python-metadata-section"},
				SectionVariantMap: map[string]string{
					"manual-section":              "manual-variant",
					"gen-python-section":          "gen-python-variant",
					"gen-python-metadata-section": "gen-python-metadata-variant",
				},
				Sections: map[string]projectstate.Section{
					"manual-section": {
						ID:               "manual-section",
						Name:             "Manual",
						VariantIDs:       []string{"manual-variant"},
						DefaultVariantID: "manual-variant",
					},
					"gen-python-section": {
						ID:               "gen-python-section",
						Name:             "Generated Python",
						VariantIDs:       []string{"gen-python-variant"},
						DefaultVariantID: "gen-python-variant",
					},
					"gen-python-metadata-section": {
						ID:               "gen-python-metadata-section",
						Name:             "Generated Python Metadata",
						VariantIDs:       []string{"gen-python-metadata-variant"},
						DefaultVariantID: "gen-python-metadata-variant",
					},
				},
				SectionVariants: map[string]projectstate.SectionVariant{
					"manual-variant": {
						ID:     "manual-variant",
						ImplID: "manual-impl",
					},
					"gen-python-variant": {
						ID:     "gen-python-variant",
						ImplID: "gen-python-impl",
					},
					"gen-python-metadata-variant": {
						ID:     "gen-python-metadata-variant",
						ImplID: "gen-python-metadata-impl",
					},
				},
				SectionImpls: map[string]projectstate.SectionImpl{
					"manual-impl": {
						ID:   "manual-impl",
						Kind: projectstate.SectionKindCode,
						Code: &projectstate.CodeSectionImpl{
							Language: projectstate.CodeLanguagePython,
						},
					},
					"gen-python-impl": {
						ID:   "gen-python-impl",
						Kind: projectstate.SectionKindGenerated,
						Generated: &projectstate.GeneratedSectionImpl{
							Kind: projectstate.GeneratedSectionKindPythonCode,
						},
					},
					"gen-python-metadata-impl": {
						ID:   "gen-python-metadata-impl",
						Kind: projectstate.SectionKindGenerated,
						Generated: &projectstate.GeneratedSectionImpl{
							Kind: projectstate.GeneratedSectionKindPythonMetadata,
						},
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

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, t.TempDir(), projectstate.CodegenTargetValidatorFunc(func(context.Context, projectstate.ProjectCodegenTarget) error {
		return nil
	}), nil, nil)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetProjectConfigCodegenTargets,
		strings.NewReader(`{"projectConfigId":"project-alpha","codegenTargets":[]}`),
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
	if len(payload.ProjectConfig.CodegenTargets) != 0 {
		t.Fatalf("expected codegen targets to be cleared, got %#v", payload.ProjectConfig.CodegenTargets)
	}
	if payload.ProjectConfig.EntryCodeBlockID != nil {
		t.Fatalf("expected entry code block id to be cleared, got %q", *payload.ProjectConfig.EntryCodeBlockID)
	}
	if payload.SingletonSections.GenPythonCode != nil {
		t.Fatalf("expected generated python singleton to be cleared, got %q", *payload.SingletonSections.GenPythonCode)
	}
	if payload.SingletonSections.GenPythonMetadata != nil {
		t.Fatalf("expected generated python metadata singleton to be cleared, got %q", *payload.SingletonSections.GenPythonMetadata)
	}
	if payload.GenCodeBinding != nil {
		t.Fatalf("expected generated code binding to be cleared, got %#v", payload.GenCodeBinding)
	}

	snapshot := projectRuntime.Snapshot()
	project := snapshot.Document.Projects["project-alpha"]
	if _, ok := project.Sections["gen-python-section"]; ok {
		t.Fatal("expected generated python section to be removed from runtime state")
	}
}

func TestRegisterProjectRoutesRejectsInvalidCodegenTargetPayload(t *testing.T) {
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

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, t.TempDir(), projectstate.CodegenTargetValidatorFunc(func(context.Context, projectstate.ProjectCodegenTarget) error {
		return nil
	}), nil, nil)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetProjectConfigCodegenTargets,
		strings.NewReader(`{"projectConfigId":"project-alpha","codegenTargets":[[]]}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"invalid_project_codegen_targets"`) {
		t.Fatalf("expected invalid_project_codegen_targets error, got %q", response.Body.String())
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

	browserSection := payload.ProjectState.Sections["browser-section"]
	browserSharedModifier := decodeProjectRouteRawObject(t, browserSection.SharedModifier)
	if browserSharedModifier["columnWidth"] != 240.5 {
		t.Fatalf("expected columnWidth 240.5, got %#v", browserSharedModifier["columnWidth"])
	}
	if browserSharedModifier["typesColumnWidth"] != 160.0 {
		t.Fatalf("expected typesColumnWidth 160.0, got %#v", browserSharedModifier["typesColumnWidth"])
	}
	if browserSharedModifier["viewMode"] != "thumbnail" {
		t.Fatalf("expected viewMode thumbnail, got %#v", browserSharedModifier["viewMode"])
	}
	if browserSharedModifier["hideColumn"] != true {
		t.Fatalf("expected hideColumn=true, got %#v", browserSharedModifier["hideColumn"])
	}

	savedSearches, ok := browserSharedModifier["savedSearches"].([]any)
	if !ok || len(savedSearches) != 2 {
		t.Fatalf("expected two saved searches, got %#v", browserSharedModifier["savedSearches"])
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

	response := post(
		RouteSetCodeFileBinding,
		`{"projectConfigId":"project-alpha","sectionId":"code-section","binding":{"canonical_path":"./pkg/../pkg/updated.py","access_mode":"read_only"}}`,
	)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	latestResponse := post(RouteGetLatestProjectState, `{"projectConfigId":"project-alpha"}`)
	if latestResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 latest-state response, got %d with body %q", latestResponse.Code, latestResponse.Body.String())
	}

	var payload ProjectStateSingleConfigWithCompletedOpIDs
	if err := json.Unmarshal(latestResponse.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode latest project payload: %v", err)
	}

	codeSection := payload.ProjectState.Sections["code-section"]
	codeSharedModifier := decodeProjectRouteRawObject(t, codeSection.SharedModifier)
	rawBinding, ok := codeSharedModifier["codeFileBinding"].(map[string]any)
	if !ok {
		t.Fatalf("expected codeFileBinding object, got %#v", codeSharedModifier["codeFileBinding"])
	}
	if rawBinding["canonical_path"] != "pkg/updated.py" {
		t.Fatalf("expected canonical_path pkg/updated.py, got %#v", rawBinding["canonical_path"])
	}
	if rawBinding["access_mode"] != "read_only" {
		t.Fatalf("expected access_mode read_only, got %#v", rawBinding["access_mode"])
	}
	if rawBinding["autoBinding"] != false {
		t.Fatalf("expected autoBinding=false, got %#v", rawBinding["autoBinding"])
	}

	project := projectRuntime.Snapshot().Document.Projects["project-alpha"]
	_, _, impl, err := project.ResolveSection("code-section")
	if err != nil {
		t.Fatalf("resolve code section: %v", err)
	}
	if impl.Code == nil || impl.Code.Binding == nil {
		t.Fatalf("expected code impl binding, got %#v", impl.Code)
	}
	if impl.Code.Binding.Path != "pkg/updated.py" {
		t.Fatalf("expected impl binding path pkg/updated.py, got %q", impl.Code.Binding.Path)
	}
	if impl.Code.Binding.AccessMode != projectstate.CodeFileAccessModeReadOnly {
		t.Fatalf("expected impl binding access mode read_only, got %q", impl.Code.Binding.AccessMode)
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

	for _, requestSpec := range []struct {
		route        string
		body         string
		expectedCode int
		expectedBody string
	}{
		{
			route:        RouteSetBrowserHideColumn,
			body:         `{"projectConfigId":"project-alpha","sectionId":"plain-section","hideColumn":true}`,
			expectedCode: http.StatusUnprocessableEntity,
			expectedBody: `"code":"browser_section_required"`,
		},
		{
			route:        RouteSetBrowserAreaViewMode,
			body:         `{"projectConfigId":"project-alpha","sectionId":"browser-section","viewMode":"grid"}`,
			expectedCode: http.StatusBadRequest,
			expectedBody: `"code":"browser_area_view_mode_invalid"`,
		},
		{
			route:        RouteSetBrowserSavedSearches,
			body:         `{"projectConfigId":"project-alpha","sectionId":"browser-section","savedSearches":[{"id":"bad","searchScope":"global"}]}`,
			expectedCode: http.StatusBadRequest,
			expectedBody: `"code":"browser_search_scope_invalid"`,
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

func TestRegisterProjectRoutesSetSectionColumnWidthRejectsUnsupportedSection(t *testing.T) {
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
		"/api"+RouteSetSectionColumnWidth,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"plain-section","columnWidth":180}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"section_param_column_width_unsupported"`) {
		t.Fatalf("expected section_param_column_width_unsupported body, got %q", response.Body.String())
	}
}

func TestRegisterProjectRoutesSetViewportReturnsInternalErrorWithoutActiveViewMode(t *testing.T) {
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

	// The created mode should own the final active layout after switching and deletion.
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
	if !strings.Contains(response.Body.String(), `"code":"invalid_view_mode_name"`) {
		t.Fatalf("expected invalid_view_mode_name body, got %q", response.Body.String())
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

func newProjectRouteTestHandler(
	t *testing.T,
	mode config.Mode,
	projectRuntime *projectstate.Runtime,
	workspaceRoot string,
	validator projectstate.CodegenTargetValidator,
	pythonReconciler projectstate.PythonCodegenSectionReconciler,
	callableResolver projectstate.CallableSignatureResolver,
	codeUpdates ...ProjectCodeUpdateService,
) http.Handler {
	return newProjectRouteTestHandlerWithRenameService(
		t,
		mode,
		projectRuntime,
		workspaceRoot,
		validator,
		pythonReconciler,
		callableResolver,
		nil,
		nil,
		codeUpdates...,
	)
}

func newProjectRouteTestHandlerWithRenameService(
	t *testing.T,
	mode config.Mode,
	projectRuntime *projectstate.Runtime,
	workspaceRoot string,
	validator projectstate.CodegenTargetValidator,
	pythonReconciler projectstate.PythonCodegenSectionReconciler,
	callableResolver projectstate.CallableSignatureResolver,
	chatSectionChatIDs ChatSectionChatIDService,
	renameRefactors ProjectRenameRefactorService,
	codeUpdates ...ProjectCodeUpdateService,
) http.Handler {
	t.Helper()
	if validator == nil {
		validator = projectstate.CodegenTargetValidatorFunc(func(context.Context, projectstate.ProjectCodegenTarget) error {
			return nil
		})
	}
	if pythonReconciler == nil {
		pythonReconciler = projectstate.PythonCodegenSectionReconcilerFunc(func(context.Context, *projectstate.Project) error {
			return nil
		})
	}
	var codeUpdateService ProjectCodeUpdateService
	if len(codeUpdates) > 0 {
		codeUpdateService = codeUpdates[0]
	}
	if codeUpdateService == nil {
		codeUpdateService = projectRouteCodeUpdateService{}
	}
	if renameRefactors == nil {
		renameRefactors = projectRouteRenameRefactorServiceFunc(func(context.Context, string, string, string) error {
			return nil
		})
	}
	if chatSectionChatIDs == nil {
		if projectRuntime == nil {
			chatSectionChatIDs = projectRouteChatSectionChatIDServiceFunc(func(context.Context, string, string) (*string, error) {
				return nil, nil
			})
		} else {
			runStore, err := agentruns.NewRunStore(t.TempDir())
			if err != nil {
				t.Fatalf("new chat section run store: %v", err)
			}
			chatSectionService, err := chatsections.NewService(chatsections.ServiceOptions{
				ProjectState: projectRuntime,
				Runs:         runStore,
			})
			if err != nil {
				t.Fatalf("new chat section service: %v", err)
			}
			chatSectionChatIDs = chatSectionService
		}
	}
	settingsDocument, err := settingsstate.NewDocument()
	if err != nil {
		t.Fatalf("new settings document: %v", err)
	}
	settingsRuntime, err := settingsstate.OpenOverlayRuntime(settingsDocument)
	if err != nil {
		t.Fatalf("open settings overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := settingsRuntime.Close(); err != nil {
			t.Fatalf("close settings overlay runtime: %v", err)
		}
	})

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: string(mode), info: RuntimeInfo{Mode: string(mode)}},
		ModePolicy: modes.NewPolicy(mode),
		Register: func(r chi.Router) {
			if err := RegisterProjectRoutes(r, ProjectRouteDependencies{
				ModePolicy:                     modes.NewPolicy(mode),
				WorkspaceRoot:                  workspaceRoot,
				ProjectState:                   projectRuntime,
				SettingsState:                  settingsRuntime,
				ChatSectionChatIDs:             chatSectionChatIDs,
				CodegenTargetValidator:         validator,
				PythonCodegenSectionReconciler: pythonReconciler,
				CallableSignatures:             callableResolver,
				CodeUpdates:                    codeUpdateService,
				RenameRefactors:                renameRefactors,
			}); err != nil {
				t.Fatalf("register project routes: %v", err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}
	return handler
}

func derefString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func decodeProjectRouteRawObject(t *testing.T, payload json.RawMessage) map[string]any {
	t.Helper()
	if len(payload) == 0 {
		return map[string]any{}
	}
	var object map[string]any
	if err := json.Unmarshal(payload, &object); err != nil {
		t.Fatalf("decode raw object %q: %v", string(payload), err)
	}
	return object
}

func decodeProjectRouteStringArray(value any) []string {
	entries, ok := value.([]any)
	if !ok {
		return nil
	}
	output := make([]string, 0, len(entries))
	for _, entry := range entries {
		stringValue, ok := entry.(string)
		if ok {
			output = append(output, stringValue)
		}
	}
	return output
}

func autoLayoutRouteMinX(layouts map[string]projectstate.TopLevelSectionLayout) float64 {
	first := true
	minX := 0.0
	for _, layout := range layouts {
		if first || layout.X < minX {
			minX = layout.X
		}
		first = false
	}
	return minX
}

func autoLayoutRouteMinY(layouts map[string]projectstate.TopLevelSectionLayout) float64 {
	first := true
	minY := 0.0
	for _, layout := range layouts {
		if first || layout.Y < minY {
			minY = layout.Y
		}
		first = false
	}
	return minY
}

type stubProjectRouteCallableSignatureResolver struct {
	result projectstate.CallableSignatureResult
	ok     bool
	err    error
}

type projectRouteSetCodeCall struct {
	ProjectID string
	SectionID string
	Code      string
}

type projectRouteFormatCodeCall struct {
	ProjectID string
	SectionID string
}

type projectRouteCodeUpdateService struct {
	setCode    func(ctx context.Context, projectID string, sectionID string, code string) error
	formatCode func(ctx context.Context, projectID string, sectionID string) error
}

func (s projectRouteCodeUpdateService) SetCode(ctx context.Context, projectID string, sectionID string, code string) error {
	if s.setCode == nil {
		return nil
	}
	return s.setCode(ctx, projectID, sectionID, code)
}

func (s projectRouteCodeUpdateService) FormatCode(ctx context.Context, projectID string, sectionID string) error {
	if s.formatCode == nil {
		return nil
	}
	return s.formatCode(ctx, projectID, sectionID)
}

type projectRouteRenameRefactorServiceFunc func(ctx context.Context, projectID string, sectionID string, name string) error

func (f projectRouteRenameRefactorServiceFunc) SetSectionName(ctx context.Context, projectID string, sectionID string, name string) error {
	return f(ctx, projectID, sectionID, name)
}

func (f projectRouteRenameRefactorServiceFunc) AcceptRenameRefactor(context.Context, string, string) error {
	return nil
}

func (f projectRouteRenameRefactorServiceFunc) DeclineRenameRefactor(context.Context, string, string) error {
	return nil
}

type projectRouteChatSectionChatIDServiceFunc func(ctx context.Context, projectID string, sectionID string) (*string, error)

func (f projectRouteChatSectionChatIDServiceFunc) GetChatID(ctx context.Context, projectID string, sectionID string) (*string, error) {
	return f(ctx, projectID, sectionID)
}

type stubProjectRouteRenameRefactorService struct {
	setSectionNameErr error
	acceptErr         error
	declineErr        error
}

func (s *stubProjectRouteRenameRefactorService) SetSectionName(context.Context, string, string, string) error {
	return s.setSectionNameErr
}

func (s *stubProjectRouteRenameRefactorService) AcceptRenameRefactor(context.Context, string, string) error {
	return s.acceptErr
}

func (s *stubProjectRouteRenameRefactorService) DeclineRenameRefactor(context.Context, string, string) error {
	return s.declineErr
}

func (s *stubProjectRouteCallableSignatureResolver) ResolveCallableSignature(
	_ context.Context,
	_ projectstate.Project,
	_ string,
	_ string,
) (projectstate.CallableSignatureResult, bool, error) {
	return s.result, s.ok, s.err
}

func callableRouteTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"callable-section": "callable-variant-1",
		},
		Sections: map[string]projectstate.Section{
			"callable-section": {
				ID:               "callable-section",
				Name:             "CallSection",
				VariantIDs:       []string{"callable-variant-1"},
				DefaultVariantID: "callable-variant-1",
				UnsharedKeys:     []string{"callable", "codeObjVariantMap"},
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"callable-variant-1": {
				ID:     "callable-variant-1",
				ImplID: "callable-impl-1",
			},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"callable-impl-1": {
				ID:   "callable-impl-1",
				Kind: projectstate.SectionKind("callable"),
				Payload: projectstate.RawJSON(`{
					"id":"callable-impl-1",
					"type":"Callable",
					"callable":"callable-1",
					"codeObjVariantMap":{
						"callable-1":"callable-variant-a",
						"callable-2":"callable-variant-b",
						"param-existing":"param-variant-existing"
					}
				}`),
			},
		},
		CodeObjs: map[string]projectstate.CodeObject{
			"callable-1": {
				ID:               "callable-1",
				Name:             "existing_callable",
				VariantIDs:       []string{"callable-variant-a"},
				DefaultVariantID: "callable-variant-a",
			},
			"callable-2": {
				ID:               "callable-2",
				Name:             "sorted",
				VariantIDs:       []string{"callable-variant-b"},
				DefaultVariantID: "callable-variant-b",
			},
			"param-existing": {
				ID:               "param-existing",
				Name:             "iterable",
				VariantIDs:       []string{"param-variant-existing"},
				DefaultVariantID: "param-variant-existing",
			},
		},
		CodeObjVariants: map[string]projectstate.CodeObjectVariant{
			"callable-variant-a": {
				ID:     "callable-variant-a",
				ImplID: "callable-impl-a",
			},
			"callable-variant-b": {
				ID:     "callable-variant-b",
				ImplID: "callable-impl-b",
			},
			"param-variant-existing": {
				ID:     "param-variant-existing",
				ImplID: "param-impl-existing",
			},
		},
		CodeObjImpls: map[string]projectstate.CodeObjectImpl{
			"callable-impl-a": {
				ID:      "callable-impl-a",
				Type:    "CodeCallable",
				Payload: projectstate.RawJSON(`{"id":"callable-impl-a","type":"CodeCallable","children":[]}`),
			},
			"callable-impl-b": {
				ID:      "callable-impl-b",
				Type:    "CodeCallable",
				Payload: projectstate.RawJSON(`{"id":"callable-impl-b","type":"CodeCallable","children":["param-existing"]}`),
			},
			"param-impl-existing": {
				ID:      "param-impl-existing",
				Type:    "CodeParam",
				Payload: projectstate.RawJSON(`{"id":"param-impl-existing","type":"CodeParam","value":"user_value","passingStyle":"DEFAULT"}`),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize callable route project: %v", err)
	}
	return project
}

func layoutPresentationRouteTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:               "project-alpha",
		Name:             "Alpha",
		ActiveViewModeID: "focus",
		ViewModes: map[string]projectstate.ViewMode{
			"focus": {
				ID: "focus",
			},
		},
		SectionVariantMap: map[string]string{
			"callable-section": "callable-variant",
			"plain-section":    "plain-variant",
		},
		Sections: map[string]projectstate.Section{
			"callable-section": {
				ID:               "callable-section",
				Name:             "Callable Section",
				VariantIDs:       []string{"callable-variant"},
				DefaultVariantID: "callable-variant",
			},
			"plain-section": {
				ID:               "plain-section",
				Name:             "Plain Section",
				VariantIDs:       []string{"plain-variant"},
				DefaultVariantID: "plain-variant",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"callable-variant": {
				ID:     "callable-variant",
				ImplID: "callable-impl",
			},
			"plain-variant": {
				ID:     "plain-variant",
				ImplID: "plain-impl",
			},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"callable-impl": {
				ID:      "callable-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "callable-impl", "type": "Callable"}),
			},
			"plain-impl": {
				ID:      "plain-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "plain-impl", "type": "TextBlock"}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize layout presentation route project: %v", err)
	}
	return project
}

func browserSectionRouteTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"browser-section": "browser-variant",
			"plain-section":   "plain-variant",
		},
		Sections: map[string]projectstate.Section{
			"browser-section": {
				ID:               "browser-section",
				Name:             "Browser Section",
				VariantIDs:       []string{"browser-variant"},
				DefaultVariantID: "browser-variant",
			},
			"plain-section": {
				ID:               "plain-section",
				Name:             "Plain Section",
				VariantIDs:       []string{"plain-variant"},
				DefaultVariantID: "plain-variant",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"browser-variant": {
				ID:     "browser-variant",
				ImplID: "browser-impl",
			},
			"plain-variant": {
				ID:     "plain-variant",
				ImplID: "plain-impl",
			},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"browser-impl": {
				ID:   "browser-impl",
				Kind: projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":               "browser-impl",
					"type":             "Browser",
					"folder":           "",
					"hideColumn":       false,
					"columnWidth":      nil,
					"typesColumnWidth": nil,
					"viewMode":         "list",
					"savedSearches":    []any{},
				}),
			},
			"plain-impl": {
				ID:      "plain-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "plain-impl", "type": "TextBlock"}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize browser route project: %v", err)
	}
	return project
}

func codeFileBindingRouteTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"code-section":  "code-variant",
			"plain-section": "plain-variant",
		},
		Sections: map[string]projectstate.Section{
			"code-section": {
				ID:               "code-section",
				Name:             "Code Section",
				VariantIDs:       []string{"code-variant"},
				DefaultVariantID: "code-variant",
			},
			"plain-section": {
				ID:               "plain-section",
				Name:             "Plain Section",
				VariantIDs:       []string{"plain-variant"},
				DefaultVariantID: "plain-variant",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"code-variant": {
				ID:     "code-variant",
				ImplID: "code-impl",
			},
			"plain-variant": {
				ID:     "plain-variant",
				ImplID: "plain-impl",
			},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"code-impl": {
				ID:   "code-impl",
				Kind: projectstate.SectionKindCode,
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":           "code-impl",
					"type":         "Code",
					"code":         "print('hello')\n",
					"codeLanguage": "python",
					"children":     []any{},
				}),
				Code: &projectstate.CodeSectionImpl{
					Language: projectstate.CodeLanguagePython,
					Binding: &projectstate.CodeFileBinding{
						Path:       "pkg/original.py",
						AccessMode: projectstate.CodeFileAccessModeReadWrite,
					},
				},
			},
			"plain-impl": {
				ID:      "plain-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "plain-impl", "type": "TextBlock"}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize code file binding route project: %v", err)
	}
	return project
}

func viewModesRouteTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:                  "project-alpha",
		Name:                "Alpha",
		ActiveViewModeID:    "focus",
		IsEditingViewMode:   false,
		Viewport:            &projectstate.Viewport{X: 5, Y: 10, Zoom: 0.8},
		ViewportInitialized: true,
		TopLevelSections: map[string]projectstate.TopLevelSectionLayout{
			"parent-section":     {X: 0, Y: 0, ZIndex: 0},
			"standalone-section": {X: 100, Y: 50, ZIndex: 1},
			"moving-section":     {X: 220, Y: 120, ZIndex: 2},
		},
		ViewModes: map[string]projectstate.ViewMode{
			"focus": {
				ID:        "focus",
				Name:      "Focus",
				SortIndex: 0,
				Viewport:  &projectstate.Viewport{X: 5, Y: 10, Zoom: 0.8},
				TopLevelSections: map[string]projectstate.TopLevelSectionLayout{
					"parent-section":     {X: 0, Y: 0, ZIndex: 0},
					"standalone-section": {X: 100, Y: 50, ZIndex: 1},
					"moving-section":     {X: 220, Y: 120, ZIndex: 2},
				},
				ViewportInitialized: true,
				VisibilityBySectionID: map[string]bool{
					"parent-section":     true,
					"standalone-section": true,
					"moving-section":     true,
				},
			},
		},
		SectionVariantMap: map[string]string{
			"parent-section":     "parent-variant",
			"standalone-section": "standalone-variant",
			"moving-section":     "moving-variant",
		},
		Sections: map[string]projectstate.Section{
			"parent-section": {
				ID:               "parent-section",
				Name:             "Parent Section",
				VariantIDs:       []string{"parent-variant"},
				DefaultVariantID: "parent-variant",
			},
			"standalone-section": {
				ID:               "standalone-section",
				Name:             "Standalone Section",
				VariantIDs:       []string{"standalone-variant"},
				DefaultVariantID: "standalone-variant",
			},
			"moving-section": {
				ID:               "moving-section",
				Name:             "Moving Section",
				VariantIDs:       []string{"moving-variant"},
				DefaultVariantID: "moving-variant",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"parent-variant": {
				ID:     "parent-variant",
				ImplID: "parent-impl",
			},
			"standalone-variant": {
				ID:     "standalone-variant",
				ImplID: "standalone-impl",
			},
			"moving-variant": {
				ID:     "moving-variant",
				ImplID: "moving-impl",
			},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"parent-impl": {
				ID:      "parent-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "parent-impl", "type": "Group"}),
			},
			"standalone-impl": {
				ID:      "standalone-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "standalone-impl", "type": "TextBlock"}),
			},
			"moving-impl": {
				ID:      "moving-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "moving-impl", "type": "TextBlock"}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize view modes route project: %v", err)
	}
	return project
}

func sectionStructureRouteTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	topLevelSections := map[string]projectstate.TopLevelSectionLayout{
		"alpha-section": {X: 120, Y: 40, ZIndex: 1},
		"beta-section":  {X: 20, Y: 10, ZIndex: 2},
		"top-group":     {X: 400, Y: 60, ZIndex: 3},
		"nested-parent": {X: 700, Y: 80, ZIndex: 4},
	}

	return mustNormalizedProjectRouteProject(t, projectstate.Project{
		ID:               "project-alpha",
		Name:             "Alpha",
		ActiveViewModeID: "focus",
		TopLevelSectionIDs: []string{
			"alpha-section",
			"beta-section",
			"top-group",
			"nested-parent",
		},
		TopLevelSections: topLevelSections,
		ViewModes: map[string]projectstate.ViewMode{
			"focus": {
				ID:               "focus",
				TopLevelSections: topLevelSections,
				VisibilityBySectionID: map[string]bool{
					"alpha-section":  true,
					"beta-section":   true,
					"top-group":      true,
					"top-child-a":    true,
					"top-child-b":    true,
					"nested-parent":  true,
					"nested-group":   true,
					"nested-child-a": true,
					"nested-child-b": true,
					"nested-sibling": true,
				},
			},
		},
		SectionVariantMap: map[string]string{
			"alpha-section":  "alpha-variant",
			"beta-section":   "beta-variant",
			"top-group":      "top-group-variant",
			"top-child-a":    "top-child-a-variant",
			"top-child-b":    "top-child-b-variant",
			"nested-parent":  "nested-parent-variant",
			"nested-group":   "nested-group-variant",
			"nested-child-a": "nested-child-a-variant",
			"nested-child-b": "nested-child-b-variant",
			"nested-sibling": "nested-sibling-variant",
		},
		Sections: map[string]projectstate.Section{
			"alpha-section": {
				ID:               "alpha-section",
				Name:             "Alpha Section",
				VariantIDs:       []string{"alpha-variant"},
				DefaultVariantID: "alpha-variant",
			},
			"beta-section": {
				ID:               "beta-section",
				Name:             "Beta Section",
				VariantIDs:       []string{"beta-variant"},
				DefaultVariantID: "beta-variant",
			},
			"top-group": {
				ID:               "top-group",
				Name:             "Top Group",
				VariantIDs:       []string{"top-group-variant"},
				DefaultVariantID: "top-group-variant",
			},
			"top-child-a": {
				ID:               "top-child-a",
				Name:             "Top Child A",
				ParentSectionID:  "top-group",
				VariantIDs:       []string{"top-child-a-variant"},
				DefaultVariantID: "top-child-a-variant",
			},
			"top-child-b": {
				ID:               "top-child-b",
				Name:             "Top Child B",
				ParentSectionID:  "top-group",
				VariantIDs:       []string{"top-child-b-variant"},
				DefaultVariantID: "top-child-b-variant",
			},
			"nested-parent": {
				ID:               "nested-parent",
				Name:             "Nested Parent",
				VariantIDs:       []string{"nested-parent-variant"},
				DefaultVariantID: "nested-parent-variant",
			},
			"nested-group": {
				ID:               "nested-group",
				Name:             "Nested Group",
				ParentSectionID:  "nested-parent",
				VariantIDs:       []string{"nested-group-variant"},
				DefaultVariantID: "nested-group-variant",
			},
			"nested-child-a": {
				ID:               "nested-child-a",
				Name:             "Nested Child A",
				ParentSectionID:  "nested-group",
				VariantIDs:       []string{"nested-child-a-variant"},
				DefaultVariantID: "nested-child-a-variant",
			},
			"nested-child-b": {
				ID:               "nested-child-b",
				Name:             "Nested Child B",
				ParentSectionID:  "nested-group",
				VariantIDs:       []string{"nested-child-b-variant"},
				DefaultVariantID: "nested-child-b-variant",
			},
			"nested-sibling": {
				ID:               "nested-sibling",
				Name:             "Nested Sibling",
				ParentSectionID:  "nested-parent",
				VariantIDs:       []string{"nested-sibling-variant"},
				DefaultVariantID: "nested-sibling-variant",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"alpha-variant":          {ID: "alpha-variant", ImplID: "alpha-impl"},
			"beta-variant":           {ID: "beta-variant", ImplID: "beta-impl"},
			"top-group-variant":      {ID: "top-group-variant", ImplID: "top-group-impl"},
			"top-child-a-variant":    {ID: "top-child-a-variant", ImplID: "top-child-a-impl"},
			"top-child-b-variant":    {ID: "top-child-b-variant", ImplID: "top-child-b-impl"},
			"nested-parent-variant":  {ID: "nested-parent-variant", ImplID: "nested-parent-impl"},
			"nested-group-variant":   {ID: "nested-group-variant", ImplID: "nested-group-impl"},
			"nested-child-a-variant": {ID: "nested-child-a-variant", ImplID: "nested-child-a-impl"},
			"nested-child-b-variant": {ID: "nested-child-b-variant", ImplID: "nested-child-b-impl"},
			"nested-sibling-variant": {ID: "nested-sibling-variant", ImplID: "nested-sibling-impl"},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"alpha-impl": {
				ID:      "alpha-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "alpha-impl", "type": "TextBlock"}),
			},
			"beta-impl": {
				ID:      "beta-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "beta-impl", "type": "TextBlock"}),
			},
			"top-group-impl": {
				ID:   "top-group-impl",
				Kind: projectstate.SectionKind("group"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":       "top-group-impl",
					"type":     "Group",
					"children": []string{"top-child-a", "top-child-b"},
				}),
			},
			"top-child-a-impl": {
				ID:      "top-child-a-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "top-child-a-impl", "type": "TextBlock"}),
			},
			"top-child-b-impl": {
				ID:      "top-child-b-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "top-child-b-impl", "type": "TextBlock"}),
			},
			"nested-parent-impl": {
				ID:   "nested-parent-impl",
				Kind: projectstate.SectionKind("group"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":       "nested-parent-impl",
					"type":     "Group",
					"children": []string{"nested-group", "nested-sibling"},
				}),
			},
			"nested-group-impl": {
				ID:   "nested-group-impl",
				Kind: projectstate.SectionKind("group"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":       "nested-group-impl",
					"type":     "Group",
					"children": []string{"nested-child-a", "nested-child-b"},
				}),
			},
			"nested-child-a-impl": {
				ID:      "nested-child-a-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "nested-child-a-impl", "type": "TextBlock"}),
			},
			"nested-child-b-impl": {
				ID:      "nested-child-b-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "nested-child-b-impl", "type": "TextBlock"}),
			},
			"nested-sibling-impl": {
				ID:      "nested-sibling-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "nested-sibling-impl", "type": "TextBlock"}),
			},
		},
	})
}

func mustProjectRouteRawJSON(t *testing.T, value map[string]any) projectstate.RawJSON {
	t.Helper()
	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal raw JSON: %v", err)
	}
	return projectstate.RawJSON(encoded)
}

func passwordParamRouteTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"dict-a": "dict-a-variant",
		},
		Sections: map[string]projectstate.Section{
			"dict-a": {
				ID:               "dict-a",
				Name:             "Dict A",
				VariantIDs:       []string{"dict-a-variant"},
				DefaultVariantID: "dict-a-variant",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"dict-a-variant": {
				ID:     "dict-a-variant",
				ImplID: "dict-a-impl",
			},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"dict-a-impl": {
				ID:   "dict-a-impl",
				Kind: projectstate.SectionKind("dict"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":              "dict-a-impl",
					"type":            "Dict",
					"selectedParams":  []string{},
					"topLevelParamId": "shared-root",
					"codeObjVariantMap": map[string]string{
						"shared-root":   "shared-root-variant",
						"shared-child":  "shared-child-variant",
						"shared-secret": "shared-secret-variant",
					},
				}),
			},
		},
		CodeObjs: map[string]projectstate.CodeObject{
			"shared-root": {
				ID:               "shared-root",
				Name:             "root",
				VariantIDs:       []string{"shared-root-variant"},
				DefaultVariantID: "shared-root-variant",
			},
			"shared-child": {
				ID:               "shared-child",
				Name:             "child",
				VariantIDs:       []string{"shared-child-variant"},
				DefaultVariantID: "shared-child-variant",
			},
			"shared-secret": {
				ID:               "shared-secret",
				Name:             "secret",
				VariantIDs:       []string{"shared-secret-variant"},
				DefaultVariantID: "shared-secret-variant",
			},
		},
		CodeObjVariants: map[string]projectstate.CodeObjectVariant{
			"shared-root-variant": {
				ID:     "shared-root-variant",
				ImplID: "shared-root-impl",
			},
			"shared-child-variant": {
				ID:     "shared-child-variant",
				ImplID: "shared-child-impl",
			},
			"shared-secret-variant": {
				ID:     "shared-secret-variant",
				ImplID: "shared-secret-impl",
			},
		},
		CodeObjImpls: map[string]projectstate.CodeObjectImpl{
			"shared-root-impl": {
				ID:      "shared-root-impl",
				Type:    "NestedParam",
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "shared-root-impl", "type": "NestedParam", "children": []string{"shared-child", "shared-secret"}}),
			},
			"shared-child-impl": {
				ID:      "shared-child-impl",
				Type:    "TextParam",
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "shared-child-impl", "type": "TextParam", "value": "seed", "coreNameEditable": true}),
			},
			"shared-secret-impl": {
				ID:      "shared-secret-impl",
				Type:    "PasswordParam",
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "shared-secret-impl", "type": "PasswordParam", "value": ""}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize password route test project: %v", err)
	}
	return project
}

func sectionVariantDeletionRouteTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	return mustNormalizedProjectRouteProject(t, projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"source-section": "source-variant-b",
			"json-section":   "json-variant-a",
		},
		Sections: map[string]projectstate.Section{
			"source-section": {
				ID:               "source-section",
				Name:             "Source",
				VariantIDs:       []string{"source-variant-a", "source-variant-b"},
				DefaultVariantID: "source-variant-b",
			},
			"json-section": {
				ID:               "json-section",
				Name:             "JSON Source",
				VariantIDs:       []string{"json-variant-a", "json-variant-b"},
				DefaultVariantID: "json-variant-a",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"source-variant-a": {
				ID:     "source-variant-a",
				ImplID: "source-impl-a",
			},
			"source-variant-b": {
				ID:     "source-variant-b",
				ImplID: "source-impl-b",
			},
			"json-variant-a": {
				ID:     "json-variant-a",
				ImplID: "json-impl-a",
				Name:   "data/source.json",
			},
			"json-variant-b": {
				ID:     "json-variant-b",
				ImplID: "json-impl-b",
			},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"source-impl-a": {
				ID:      "source-impl-a",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "source-impl-a", "type": "TextBlock"}),
			},
			"source-impl-b": {
				ID:      "source-impl-b",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "source-impl-b", "type": "TextBlock"}),
			},
			"json-impl-a": {
				ID:      "json-impl-a",
				Kind:    projectstate.SectionKind("dict"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "json-impl-a", "type": "Dict", "isJsonSource": true, "jsonSourceKeys": []string{"config"}}),
			},
			"json-impl-b": {
				ID:      "json-impl-b",
				Kind:    projectstate.SectionKind("dict"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "json-impl-b", "type": "Dict"}),
			},
		},
	})
}

func mustNormalizedProjectRouteProject(t *testing.T, project projectstate.Project) projectstate.Project {
	t.Helper()

	normalized, err := project.Normalized()
	if err != nil {
		t.Fatalf("normalize project route project: %v", err)
	}
	return normalized
}
