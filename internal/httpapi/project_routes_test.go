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
	"setta/internal/codegen"
	"setta/internal/config"
	"setta/internal/modes"
	"setta/internal/projectstate"
	"setta/internal/projectview"
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
		projectRouteCodeUpdateServiceFunc(func(_ context.Context, projectID string, sectionID string, code string) error {
			captured = projectRouteSetCodeCall{
				ProjectID: projectID,
				SectionID: sectionID,
				Code:      code,
			}
			return nil
		}),
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
		projectRouteCodeUpdateServiceFunc(func(context.Context, string, string, string) error {
			return fmt.Errorf("%w: %q", projectstate.ErrCodeSectionReadOnly, "section-1")
		}),
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
		codeUpdateService = projectRouteCodeUpdateServiceFunc(func(context.Context, string, string, string) error {
			return nil
		})
	}

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: string(mode), info: RuntimeInfo{Mode: string(mode)}},
		ModePolicy: modes.NewPolicy(mode),
		Register: func(r chi.Router) {
			if err := RegisterProjectRoutes(r, ProjectRouteDependencies{
				ModePolicy:                     modes.NewPolicy(mode),
				WorkspaceRoot:                  workspaceRoot,
				ProjectState:                   projectRuntime,
				CodegenTargetValidator:         validator,
				PythonCodegenSectionReconciler: pythonReconciler,
				CallableSignatures:             callableResolver,
				CodeUpdates:                    codeUpdateService,
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

type projectRouteCodeUpdateServiceFunc func(ctx context.Context, projectID string, sectionID string, code string) error

func (f projectRouteCodeUpdateServiceFunc) SetCode(ctx context.Context, projectID string, sectionID string, code string) error {
	return f(ctx, projectID, sectionID, code)
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
