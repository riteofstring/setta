package lsp

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"setta/internal/statefs"
	"setta/internal/testutil/firstpartyplugin"
)

func TestRouterCompleteSnapshotRoutesPluginLanguage(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	router := newFixturePythonRouter(t, workspaceRoot, []LanguageServerSpec{fixturePluginLanguageServerSpec(t)})
	defer func() {
		if err := router.Close(context.Background()); err != nil {
			t.Fatalf("close router: %v", err)
		}
	}()

	referencePath := filepath.Join(workspaceRoot, "code", "sections", "alpha", "editor.fixturedsl")
	if err := os.MkdirAll(filepath.Dir(referencePath), 0o755); err != nil {
		t.Fatalf("mkdir plugin-language fixture dir: %v", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	result, err := router.CompleteSnapshot(ctx, SnapshotCompletionRequest{
		ReferencePath: referencePath,
		LanguageID:    "fixturedsl",
		Content:       "fixture.",
		Line:          0,
		Character:     8,
	})
	if err != nil {
		t.Fatalf("complete snapshot: %v", err)
	}
	if len(result.Items) != 1 || result.Items[0].Label != "fixtureCompletion" {
		t.Fatalf("unexpected completion result %#v", result)
	}
}

func TestRouterReplaceAdditionalSpecsRefreshesPluginLanguages(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	router := newFixturePythonRouter(t, workspaceRoot, nil)
	defer func() {
		if err := router.Close(context.Background()); err != nil {
			t.Fatalf("close router: %v", err)
		}
	}()

	referencePath := filepath.Join(workspaceRoot, "code", "sections", "alpha", "editor.fixturedsl")
	if err := os.MkdirAll(filepath.Dir(referencePath), 0o755); err != nil {
		t.Fatalf("mkdir plugin-language fixture dir: %v", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	_, err := router.CompleteSnapshot(ctx, SnapshotCompletionRequest{
		ReferencePath: referencePath,
		LanguageID:    "fixturedsl",
		Content:       "fixture.",
		Line:          0,
		Character:     8,
	})
	if err == nil {
		t.Fatal("expected fixture language to be unavailable before refresh")
	}

	if err := router.ReplaceAdditionalSpecs(ctx, []LanguageServerSpec{
		fixturePluginLanguageServerSpec(t),
	}); err != nil {
		t.Fatalf("replace additional specs: %v", err)
	}

	result, err := router.CompleteSnapshot(ctx, SnapshotCompletionRequest{
		ReferencePath: referencePath,
		LanguageID:    "fixturedsl",
		Content:       "fixture.",
		Line:          0,
		Character:     8,
	})
	if err != nil {
		t.Fatalf("complete snapshot after refresh: %v", err)
	}
	if len(result.Items) != 1 || result.Items[0].Label != "fixtureCompletion" {
		t.Fatalf("unexpected completion result after refresh %#v", result)
	}
}

func TestRouterStartsLanguageServerWithSpecEnvironment(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	echoPath := filepath.Join(t.TempDir(), "pythonpath.txt")
	spec := fixturePythonLanguageServerSpec(t)
	spec.Environment = map[string]string{
		"PYTHONPATH": filepath.Join(t.TempDir(), "from-spec"),
	}

	router, err := NewRouter(RouterOptions{
		WorkspaceRoot: workspaceRoot,
		Environ: func() []string {
			return []string{
				"PYTHONPATH=/from-router",
				"FIXTURE_PYTHONPATH_ECHO_FILE=" + echoPath,
			}
		},
		AdditionalSpecs: []LanguageServerSpec{spec},
	})
	if err != nil {
		t.Fatalf("new router: %v", err)
	}
	defer func() {
		if err := router.Close(context.Background()); err != nil {
			t.Fatalf("close router: %v", err)
		}
	}()

	referencePath := filepath.Join(workspaceRoot, "code", "sections", "alpha", "editor.py")
	if err := os.MkdirAll(filepath.Dir(referencePath), 0o755); err != nil {
		t.Fatalf("mkdir fixture dir: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if _, err := router.CompleteSnapshot(ctx, SnapshotCompletionRequest{
		ReferencePath: referencePath,
		LanguageID:    "python",
		Content:       "value.",
		Line:          0,
		Character:     6,
	}); err != nil {
		t.Fatalf("complete snapshot: %v", err)
	}

	echoed, err := os.ReadFile(echoPath)
	if err != nil {
		t.Fatalf("read echoed PYTHONPATH: %v", err)
	}
	if string(echoed) != spec.Environment["PYTHONPATH"] {
		t.Fatalf("expected router to apply spec PYTHONPATH %q, got %q", spec.Environment["PYTHONPATH"], string(echoed))
	}
}

func TestNewRouterAllowsNoConfiguredLanguageServers(t *testing.T) {
	t.Parallel()

	router, err := NewRouter(RouterOptions{
		WorkspaceRoot: t.TempDir(),
	})
	if err != nil {
		t.Fatalf("new router without language servers: %v", err)
	}
	defer func() {
		if err := router.Close(context.Background()); err != nil {
			t.Fatalf("close router: %v", err)
		}
	}()

	_, err = router.CompleteSnapshot(context.Background(), SnapshotCompletionRequest{
		ReferencePath: filepath.Join(t.TempDir(), "fixture.py"),
		LanguageID:    "python",
		Content:       "value.",
		Line:          0,
		Character:     6,
	})
	if !errors.Is(err, ErrLanguageServerNotConfigured) {
		t.Fatalf("expected unconfigured language server error, got %v", err)
	}
}

func TestRouterInitializesFromExplicitSpecsOnly(t *testing.T) {
	t.Parallel()

	spec := fixturePluginLanguageServerSpec(t)
	router, err := NewRouter(RouterOptions{
		WorkspaceRoot:   t.TempDir(),
		AdditionalSpecs: []LanguageServerSpec{spec},
	})
	if err != nil {
		t.Fatalf("new router with explicit specs: %v", err)
	}
	defer func() {
		if err := router.Close(context.Background()); err != nil {
			t.Fatalf("close router: %v", err)
		}
	}()

	if len(router.specs) != 1 {
		t.Fatalf("expected one explicit router spec, got %#v", router.specs)
	}
	stored, ok := router.specs[spec.LanguageID]
	if !ok {
		t.Fatalf("expected explicit router spec for %q, got %#v", spec.LanguageID, router.specs)
	}
	if !languageServerSpecsEqual(stored, spec) {
		t.Fatalf("expected stored explicit spec %#v, got %#v", spec, stored)
	}
}

func TestRouterUsesSpecOwnedSettingsWithoutReapplyingSettingsKeyLookup(t *testing.T) {
	t.Parallel()

	settingsKey := "basedpyright"
	spec := LanguageServerSpec{
		Name:       "python",
		LanguageID: "python",
		Command:    "python",
		Settings: map[string]any{
			"basedpyright": map[string]any{
				"analysis": map[string]any{
					"extraPaths": []any{"/tmp/spec"},
				},
			},
		},
		SettingsKey: &settingsKey,
	}
	router, err := NewRouter(RouterOptions{
		WorkspaceRoot:   t.TempDir(),
		AdditionalSpecs: []LanguageServerSpec{spec},
	})
	if err != nil {
		t.Fatalf("new router with spec-owned settings: %v", err)
	}
	defer func() {
		if err := router.Close(context.Background()); err != nil {
			t.Fatalf("close router: %v", err)
		}
	}()

	service, ok, err := router.serviceForLanguage("python")
	if err != nil {
		t.Fatalf("resolve python service: %v", err)
	}
	if !ok || service == nil {
		t.Fatal("expected python service to be configured")
	}

	expected := map[string]any{
		"basedpyright": map[string]any{
			"analysis": map[string]any{
				"extraPaths": []any{"/tmp/spec"},
			},
		},
	}
	if !reflect.DeepEqual(service.session.options.Settings, expected) {
		t.Fatalf("expected session settings %#v, got %#v", expected, service.session.options.Settings)
	}
}

func TestRouterUsesExplicitEmptySpecSettingsWithoutGlobalFallback(t *testing.T) {
	t.Parallel()

	settingsKey := "fixtureDslLanguageServer"
	spec := LanguageServerSpec{
		Name:        "fixture-dsl",
		LanguageID:  "fixturedsl",
		Command:     "python",
		Settings:    map[string]any{},
		SettingsKey: &settingsKey,
	}
	router, err := NewRouter(RouterOptions{
		WorkspaceRoot:   t.TempDir(),
		AdditionalSpecs: []LanguageServerSpec{spec},
	})
	if err != nil {
		t.Fatalf("new router with explicit empty spec settings: %v", err)
	}
	defer func() {
		if err := router.Close(context.Background()); err != nil {
			t.Fatalf("close router: %v", err)
		}
	}()

	service, ok, err := router.serviceForLanguage("fixturedsl")
	if err != nil {
		t.Fatalf("resolve fixture service: %v", err)
	}
	if !ok || service == nil {
		t.Fatal("expected fixture service to be configured")
	}
	if !reflect.DeepEqual(service.session.options.Settings, map[string]any{}) {
		t.Fatalf("expected explicit empty settings to bypass global fallback, got %#v", service.session.options.Settings)
	}
}

func TestRouterSyncDocumentsRoutesPluginLanguageDiagnosticsAndCompletion(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	router := newFixturePythonRouter(t, workspaceRoot, []LanguageServerSpec{fixturePluginLanguageServerSpec(t)})
	defer func() {
		if err := router.Close(context.Background()); err != nil {
			t.Fatalf("close router: %v", err)
		}
	}()

	documentPath := filepath.Join(workspaceRoot, "code", "sections", "alpha", "editor.fixturedsl")
	if err := os.MkdirAll(filepath.Dir(documentPath), 0o755); err != nil {
		t.Fatalf("mkdir diagnostics fixture dir: %v", err)
	}
	if err := statefs.AtomicWriteFile(documentPath, []byte("const value = __fixture_error__;\n"), 0o644); err != nil {
		t.Fatalf("write diagnostics fixture document: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	diagnosticsCh := make(chan PublishDiagnosticsParams, 1)
	if err := router.SyncDocuments(ctx, map[string]SyncedDocument{
		documentPath: {
			Path:       documentPath,
			LanguageID: "fixturedsl",
			Content:    "const value = __fixture_error__;\n",
			Callback: func(params PublishDiagnosticsParams) {
				diagnosticsCh <- params
			},
		},
	}); err != nil {
		t.Fatalf("sync plugin language document: %v", err)
	}

	select {
	case diagnostics := <-diagnosticsCh:
		if len(diagnostics.Diagnostics) != 1 {
			t.Fatalf("expected one plugin-language diagnostic, got %#v", diagnostics.Diagnostics)
		}
		if diagnostics.Diagnostics[0].Code != "fixture-ts" {
			t.Fatalf("expected diagnostic code fixture-ts, got %#v", diagnostics.Diagnostics[0].Code)
		}
		if diagnostics.Diagnostics[0].Message != "Fixture TypeScript diagnostic" {
			t.Fatalf("unexpected diagnostic message %q", diagnostics.Diagnostics[0].Message)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("timed out waiting for plugin-language diagnostics")
	}

	result, err := router.CompleteSnapshot(ctx, SnapshotCompletionRequest{
		ReferencePath: documentPath,
		LanguageID:    "fixturedsl",
		Content:       "fixture.",
		Line:          0,
		Character:     8,
	})
	if err != nil {
		t.Fatalf("complete snapshot for plugin language: %v", err)
	}
	if len(result.Items) != 1 || result.Items[0].Label != "fixtureCompletion" {
		t.Fatalf("unexpected plugin-language completion result %#v", result)
	}
}

func TestRouterServiceForLanguageFindsPythonAndPluginLanguagesOnly(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	router := newFixturePythonRouter(t, workspaceRoot, []LanguageServerSpec{fixturePluginLanguageServerSpec(t)})
	defer func() {
		if err := router.Close(context.Background()); err != nil {
			t.Fatalf("close router: %v", err)
		}
	}()

	pythonService, ok, err := router.serviceForLanguage("python")
	if err != nil {
		t.Fatalf("resolve python service: %v", err)
	}
	if !ok || pythonService == nil {
		t.Fatal("expected python service to be configured")
	}

	pluginService, ok, err := router.serviceForLanguage("fixturedsl")
	if err != nil {
		t.Fatalf("resolve plugin-language service: %v", err)
	}
	if !ok || pluginService == nil {
		t.Fatal("expected plugin-language service to be configured")
	}
	if pluginService == pythonService {
		t.Fatal("expected plugin-language service to be distinct from python service")
	}

	missingService, ok, err := router.serviceForLanguage("json")
	if err != nil {
		t.Fatalf("resolve missing language service: %v", err)
	}
	if ok || missingService != nil {
		t.Fatalf("expected missing language to remain unconfigured, got ok=%v service=%#v", ok, missingService)
	}
}

func TestRouterPluginLanguageStartupFailureDoesNotBreakPythonService(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	router := newFixturePythonRouter(t, workspaceRoot, []LanguageServerSpec{
		{
			Name:       "broken-fixture-dsl",
			LanguageID: "fixturedsl",
			Command:    "missing-language-server",
			Args:       []string{"--stdio"},
		},
	})
	defer func() {
		if err := router.Close(context.Background()); err != nil {
			t.Fatalf("close router: %v", err)
		}
	}()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	brokenReferencePath := filepath.Join(workspaceRoot, "code", "sections", "alpha", "editor.fixturedsl")
	if err := os.MkdirAll(filepath.Dir(brokenReferencePath), 0o755); err != nil {
		t.Fatalf("mkdir broken fixture dir: %v", err)
	}
	if err := statefs.AtomicWriteFile(brokenReferencePath, []byte("fixture.\n"), 0o644); err != nil {
		t.Fatalf("write broken plugin reference file: %v", err)
	}

	_, err := router.CompleteSnapshot(ctx, SnapshotCompletionRequest{
		ReferencePath: brokenReferencePath,
		LanguageID:    "fixturedsl",
		Content:       "fixture.",
		Line:          0,
		Character:     8,
	})
	if err == nil {
		t.Fatal("expected plugin-language startup failure")
	}
	if !strings.Contains(err.Error(), "missing-language-server") {
		t.Fatalf("expected missing-language-server failure, got %v", err)
	}

	pythonReferencePath := filepath.Join(workspaceRoot, "fixture.py")
	if err := statefs.AtomicWriteFile(pythonReferencePath, []byte("value = 1\n"), 0o644); err != nil {
		t.Fatalf("write python reference file: %v", err)
	}

	result, err := router.CompleteSnapshot(ctx, SnapshotCompletionRequest{
		ReferencePath: pythonReferencePath,
		LanguageID:    "python",
		Content:       "fixture.",
		Line:          0,
		Character:     8,
	})
	if err != nil {
		t.Fatalf("complete snapshot for python after plugin failure: %v", err)
	}
	if len(result.Items) != 1 || result.Items[0].Label != "fixtureCompletion" {
		t.Fatalf("unexpected python completion result after plugin failure %#v", result)
	}
}

func TestRouterCurrentProcessPythonSettingsReadNestedLanguageServerBranch(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	settings := basedpyrightTestSettings(map[string]any{
		"languageServer": map[string]any{
			"basedpyright": map[string]any{
				"analysis": map[string]any{
					"diagnosticSeverityOverrides": map[string]any{
						"reportUnknownVariableType": "none",
					},
				},
			},
		},
	}, nil)
	spec := fixturePythonLanguageServerSpec(t)
	spec.Settings = settings

	router, err := NewRouter(RouterOptions{
		WorkspaceRoot:   workspaceRoot,
		AdditionalSpecs: []LanguageServerSpec{spec},
	})
	if err != nil {
		t.Fatalf("new router: %v", err)
	}
	defer func() {
		if err := router.Close(context.Background()); err != nil {
			t.Fatalf("close router: %v", err)
		}
	}()

	service, ok, err := router.serviceForLanguage("python")
	if err != nil {
		t.Fatalf("resolve python service: %v", err)
	}
	if !ok || service == nil {
		t.Fatal("expected python service to be configured")
	}

	expected := map[string]any{
		"basedpyright": map[string]any{
			"analysis": map[string]any{
				"diagnosticSeverityOverrides": map[string]any{
					"reportUnknownVariableType": "none",
				},
			},
		},
	}
	if !settingsMapsEqual(service.session.options.Settings, expected) {
		t.Fatalf("expected nested language-server settings %#v, got %#v", expected, service.session.options.Settings)
	}
}

func TestRouterCurrentProcessPythonDiagnosticsUseNestedBasedPyrightSettingsForWatchCodeGeneratedImports(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	settaFilesRoot := filepath.Join(workspaceRoot, "setta_files")
	sourcePath := filepath.Join(settaFilesRoot, "watch_code_test.py")
	generatedPath := filepath.Join(settaFilesRoot, "code", "sections", "telling_loud", "setta_gen.py")
	sourceContent := "def cool_fn(a, b, c):\n    pass\n"
	generatedContent := "from watch_code_test import cool_fn\n\n\nclass SettaState:\n    def __init__(state):\n        state.having_dancing = cool_fn()\n\nstate = SettaState()\n"

	if err := os.MkdirAll(filepath.Dir(generatedPath), 0o755); err != nil {
		t.Fatalf("mkdir generated path: %v", err)
	}
	if err := statefs.AtomicWriteFile(sourcePath, []byte(sourceContent), 0o644); err != nil {
		t.Fatalf("seed watch code source: %v", err)
	}
	if err := statefs.AtomicWriteFile(generatedPath, []byte(generatedContent), 0o644); err != nil {
		t.Fatalf("seed generated code source: %v", err)
	}

	settings := basedpyrightTestSettings(map[string]any{
		"languageServer": map[string]any{
			"basedpyright": map[string]any{
				"analysis": map[string]any{
					"diagnosticSeverityOverrides": map[string]any{
						"reportUnknownVariableType":       "none",
						"reportUnknownMemberType":         "none",
						"reportUnannotatedClassAttribute": "none",
						"reportSelfClsParameterName":      "none",
					},
				},
			},
		},
	}, []string{settaFilesRoot})

	router := newBasedpyrightRouter(t, workspaceRoot, settings)
	defer func() {
		if err := router.Close(context.Background()); err != nil {
			t.Fatalf("close router: %v", err)
		}
	}()

	service, ok, err := router.serviceForLanguage("python")
	if err != nil {
		t.Fatalf("resolve python service: %v", err)
	}
	if !ok || service == nil {
		t.Fatal("expected python service to be configured")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	if err := service.UpsertDocument(ctx, SyncedDocument{
		Path:       sourcePath,
		LanguageID: "python",
		Content:    sourceContent,
	}); err != nil {
		t.Fatalf("upsert watch code source: %v", err)
	}

	diagnosticsCh := make(chan PublishDiagnosticsParams, 4)
	if err := service.UpsertDocument(ctx, SyncedDocument{
		Path:       generatedPath,
		LanguageID: "python",
		Content:    generatedContent,
		Callback: func(params PublishDiagnosticsParams) {
			diagnosticsCh <- params
		},
	}); err != nil {
		t.Fatalf("upsert generated code source: %v", err)
	}

	diagnostics := waitForDiagnostics(t, diagnosticsCh)
	if diagnosticsContainRule(diagnostics.Diagnostics, "reportMissingImports") {
		t.Fatalf("did not expect unresolved watch-code import diagnostics, got %#v", diagnostics.Diagnostics)
	}
	if diagnosticsContainRule(diagnostics.Diagnostics, "reportUnknownVariableType") {
		t.Fatalf("did not expect unknown-variable diagnostics after nested settings applied, got %#v", diagnostics.Diagnostics)
	}
	if diagnosticsContainRule(diagnostics.Diagnostics, "reportSelfClsParameterName") {
		t.Fatalf("did not expect self-parameter diagnostics after nested settings applied, got %#v", diagnostics.Diagnostics)
	}
	if diagnosticsContainRule(diagnostics.Diagnostics, "reportUnknownMemberType") {
		t.Fatalf("did not expect unknown-member diagnostics after nested settings applied, got %#v", diagnostics.Diagnostics)
	}
	if diagnosticsContainRule(diagnostics.Diagnostics, "reportUnannotatedClassAttribute") {
		t.Fatalf("did not expect unannotated-attribute diagnostics after nested settings applied, got %#v", diagnostics.Diagnostics)
	}
	if !diagnosticsContainRule(diagnostics.Diagnostics, "reportCallIssue") {
		t.Fatalf("expected generated call diagnostics for missing watch-code params, got %#v", diagnostics.Diagnostics)
	}
	if !diagnosticsContainMessage(diagnostics.Diagnostics, "Arguments missing for parameters \"a\", \"b\", \"c\"") {
		t.Fatalf("expected missing-arg diagnostics for a/b/c, got %#v", diagnostics.Diagnostics)
	}
}

func TestRouterCurrentProcessPythonRefreshesGeneratedDiagnosticsWhenImportedWatchCodeSignatureChanges(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	settaFilesRoot := filepath.Join(workspaceRoot, "setta_files")
	sourcePath := filepath.Join(settaFilesRoot, "watch_code_test.py")
	generatedPath := filepath.Join(settaFilesRoot, "code", "sections", "tide_lime", "setta_gen.py")
	initialSourceContent := "def cool_fn():\n    print(\"hello\")\n"
	updatedSourceContent := "def cool_fn(a, b, c):\n    print(\"hello\")\n"
	generatedContent := "from watch_code_test import cool_fn\n\n\nclass SettaState:\n    def __init__(state):\n        state.blue_tall = cool_fn()\n\nstate = SettaState()\n"

	if err := os.MkdirAll(filepath.Dir(generatedPath), 0o755); err != nil {
		t.Fatalf("mkdir generated path: %v", err)
	}
	if err := statefs.AtomicWriteFile(sourcePath, []byte(initialSourceContent), 0o644); err != nil {
		t.Fatalf("seed watch code source: %v", err)
	}
	if err := statefs.AtomicWriteFile(generatedPath, []byte(generatedContent), 0o644); err != nil {
		t.Fatalf("seed generated code source: %v", err)
	}

	settings := basedpyrightTestSettings(map[string]any{
		"languageServer": map[string]any{
			"basedpyright": map[string]any{
				"analysis": map[string]any{
					"diagnosticSeverityOverrides": map[string]any{
						"reportUnknownVariableType":       "none",
						"reportUnknownMemberType":         "none",
						"reportUnannotatedClassAttribute": "none",
						"reportSelfClsParameterName":      "none",
					},
				},
			},
		},
	}, []string{settaFilesRoot})

	router := newBasedpyrightRouter(t, workspaceRoot, settings)
	defer func() {
		if err := router.Close(context.Background()); err != nil {
			t.Fatalf("close router: %v", err)
		}
	}()

	service, ok, err := router.serviceForLanguage("python")
	if err != nil {
		t.Fatalf("resolve python service: %v", err)
	}
	if !ok || service == nil {
		t.Fatal("expected python service to be configured")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	if err := service.UpsertDocument(ctx, SyncedDocument{
		Path:       sourcePath,
		LanguageID: "python",
		Content:    initialSourceContent,
	}); err != nil {
		t.Fatalf("upsert initial watch code source: %v", err)
	}

	diagnosticsCh := make(chan PublishDiagnosticsParams, 8)
	if err := service.UpsertDocument(ctx, SyncedDocument{
		Path:       generatedPath,
		LanguageID: "python",
		Content:    generatedContent,
		Callback: func(params PublishDiagnosticsParams) {
			diagnosticsCh <- params
		},
	}); err != nil {
		t.Fatalf("upsert generated code source: %v", err)
	}

	initialDiagnostics := waitForDiagnostics(t, diagnosticsCh)
	if diagnosticsContainRule(initialDiagnostics.Diagnostics, "reportCallIssue") {
		t.Fatalf("did not expect missing-arg diagnostics before signature change, got %#v", initialDiagnostics.Diagnostics)
	}

	if err := service.UpsertDocument(ctx, SyncedDocument{
		Path:       sourcePath,
		LanguageID: "python",
		Content:    updatedSourceContent,
	}); err != nil {
		t.Fatalf("upsert updated watch code source: %v", err)
	}

	select {
	case refreshed := <-diagnosticsCh:
		if !diagnosticsContainRule(refreshed.Diagnostics, "reportCallIssue") {
			t.Fatalf("expected regenerated call diagnostics after imported signature change, got %#v", refreshed.Diagnostics)
		}
		if !diagnosticsContainMessage(refreshed.Diagnostics, "Arguments missing for parameters \"a\", \"b\", \"c\"") {
			t.Fatalf("expected missing-arg diagnostics for a/b/c after imported signature change, got %#v", refreshed.Diagnostics)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("expected generated diagnostics refresh after imported watch code signature change")
	}
}

func TestRouterCurrentProcessPythonSyncAndRefreshPublishesGeneratedCallDiagnosticsAfterWatchCodeSignatureChange(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	settaFilesRoot := filepath.Join(workspaceRoot, "setta_files")
	sourcePath := filepath.Join(settaFilesRoot, "watch_code_test.py")
	generatedPath := filepath.Join(settaFilesRoot, "code", "sections", "raw_busy", "setta_gen.py")
	initialSourceContent := "def cool_fn():\n    print(\"hello\")\n"
	updatedSourceContent := "def cool_fn(a, b, c):\n    print(\"hello\")\n"
	generatedContent := "from watch_code_test import cool_fn\n\n\nclass SettaState:\n    def __init__(state):\n        state.blue_tall = cool_fn()\n\nstate = SettaState()\n"

	if err := os.MkdirAll(filepath.Dir(generatedPath), 0o755); err != nil {
		t.Fatalf("mkdir generated path: %v", err)
	}
	if err := statefs.AtomicWriteFile(sourcePath, []byte(initialSourceContent), 0o644); err != nil {
		t.Fatalf("seed initial watch code source: %v", err)
	}
	if err := statefs.AtomicWriteFile(generatedPath, []byte(generatedContent), 0o644); err != nil {
		t.Fatalf("seed generated code source: %v", err)
	}

	settings := basedpyrightTestSettings(map[string]any{
		"languageServer": map[string]any{
			"basedpyright": map[string]any{
				"analysis": map[string]any{
					"diagnosticSeverityOverrides": map[string]any{
						"reportUnknownVariableType":       "none",
						"reportUnknownMemberType":         "none",
						"reportUnannotatedClassAttribute": "none",
						"reportSelfClsParameterName":      "none",
					},
				},
			},
		},
	}, []string{settaFilesRoot})

	router := newBasedpyrightRouter(t, workspaceRoot, settings)
	defer func() {
		if err := router.Close(context.Background()); err != nil {
			t.Fatalf("close router: %v", err)
		}
	}()

	service, ok, err := router.serviceForLanguage("python")
	if err != nil {
		t.Fatalf("resolve python service: %v", err)
	}
	if !ok || service == nil {
		t.Fatal("expected python service to be configured")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	diagnosticsCh := make(chan PublishDiagnosticsParams, 8)
	initialDocs := map[string]SyncedDocument{
		sourcePath: {
			Path:       sourcePath,
			LanguageID: "python",
			Content:    initialSourceContent,
		},
		generatedPath: {
			Path:       generatedPath,
			LanguageID: "python",
			Content:    generatedContent,
			Callback: func(params PublishDiagnosticsParams) {
				diagnosticsCh <- params
			},
		},
	}
	if err := service.SyncDocuments(ctx, initialDocs); err != nil {
		t.Fatalf("sync initial documents: %v", err)
	}

	initialDiagnostics := waitForDiagnostics(t, diagnosticsCh)
	if diagnosticsContainRule(initialDiagnostics.Diagnostics, "reportCallIssue") {
		t.Fatalf("did not expect missing-arg diagnostics before signature change, got %#v", initialDiagnostics.Diagnostics)
	}

	updatedDocs := map[string]SyncedDocument{
		sourcePath: {
			Path:       sourcePath,
			LanguageID: "python",
			Content:    updatedSourceContent,
		},
		generatedPath: {
			Path:       generatedPath,
			LanguageID: "python",
			Content:    generatedContent,
			Callback: func(params PublishDiagnosticsParams) {
				diagnosticsCh <- params
			},
		},
	}
	if err := service.SyncDocuments(ctx, updatedDocs); err != nil {
		t.Fatalf("sync updated documents: %v", err)
	}
	if err := service.RefreshDocuments(ctx, updatedDocs); err != nil {
		t.Fatalf("refresh updated documents: %v", err)
	}

	refreshed, ok := waitForDiagnosticsContainingRule(diagnosticsCh, "reportCallIssue", 5*time.Second)
	if !ok {
		t.Fatalf("expected generated call diagnostics after sync+refresh signature change, got %#v", refreshed.Diagnostics)
	}
	if !diagnosticsContainMessage(refreshed.Diagnostics, "Arguments missing for parameters \"a\", \"b\", \"c\"") {
		t.Fatalf("expected missing-arg diagnostics for a/b/c after sync+refresh signature change, got %#v", refreshed.Diagnostics)
	}
}

func TestRouterCurrentProcessPythonIncrementalWatchCodeTypingStillPublishesGeneratedCallDiagnostics(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	settaFilesRoot := filepath.Join(workspaceRoot, "setta_files")
	sourcePath := filepath.Join(settaFilesRoot, "watch_code_test.py")
	generatedPath := filepath.Join(settaFilesRoot, "code", "sections", "tide_lime", "setta_gen.py")
	generatedContent := "from watch_code_test import cool_fn\n\n\nclass SettaState:\n    def __init__(state):\n        state.blue_tall = cool_fn()\n\nstate = SettaState()\n"
	recordedStates := []string{
		"def cool_fn",
		"def cool_fn()",
		"def cool_fn(,)",
		"def cool_fn()",
		"def cool_fn(a)",
		"def cool_fn(a,)",
		"def cool_fn(a,b)",
		"def cool_fn(a,b,)",
		"def cool_fn(a,b,c)",
		"def cool_fn(a,b,c):",
		"def cool_fn(a,b,c): print(\"dog\")\n",
	}

	if err := os.MkdirAll(filepath.Dir(generatedPath), 0o755); err != nil {
		t.Fatalf("mkdir generated path: %v", err)
	}
	if err := statefs.AtomicWriteFile(sourcePath, []byte(recordedStates[0]), 0o644); err != nil {
		t.Fatalf("seed initial watch code source: %v", err)
	}
	if err := statefs.AtomicWriteFile(generatedPath, []byte(generatedContent), 0o644); err != nil {
		t.Fatalf("seed generated code source: %v", err)
	}

	settings := basedpyrightTestSettings(map[string]any{
		"languageServer": map[string]any{
			"basedpyright": map[string]any{
				"analysis": map[string]any{
					"diagnosticSeverityOverrides": map[string]any{
						"reportUnknownVariableType":       "none",
						"reportUnknownMemberType":         "none",
						"reportUnannotatedClassAttribute": "none",
						"reportSelfClsParameterName":      "none",
					},
				},
			},
		},
	}, []string{settaFilesRoot})

	router := newBasedpyrightRouter(t, workspaceRoot, settings)
	defer func() {
		if err := router.Close(context.Background()); err != nil {
			t.Fatalf("close router: %v", err)
		}
	}()

	service, ok, err := router.serviceForLanguage("python")
	if err != nil {
		t.Fatalf("resolve python service: %v", err)
	}
	if !ok || service == nil {
		t.Fatal("expected python service to be configured")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	diagnosticsCh := make(chan PublishDiagnosticsParams, 32)
	for _, sourceContent := range recordedStates {
		docs := map[string]SyncedDocument{
			sourcePath: {
				Path:       sourcePath,
				LanguageID: "python",
				Content:    sourceContent,
			},
			generatedPath: {
				Path:       generatedPath,
				LanguageID: "python",
				Content:    generatedContent,
				Callback: func(params PublishDiagnosticsParams) {
					diagnosticsCh <- params
				},
			},
		}
		if err := service.SyncDocuments(ctx, docs); err != nil {
			t.Fatalf("sync incremental documents for %q: %v", sourceContent, err)
		}
		if err := service.RefreshDocuments(ctx, docs); err != nil {
			t.Fatalf("refresh incremental documents for %q: %v", sourceContent, err)
		}
	}

	refreshed, ok := waitForDiagnosticsContainingRule(diagnosticsCh, "reportCallIssue", 5*time.Second)
	if !ok {
		t.Fatalf("expected generated call diagnostics after incremental watch-code typing, got %#v", refreshed.Diagnostics)
	}
	if !diagnosticsContainMessage(refreshed.Diagnostics, "Arguments missing for parameters \"a\", \"b\", \"c\"") {
		t.Fatalf("expected missing-arg diagnostics for a/b/c after incremental watch-code typing, got %#v", refreshed.Diagnostics)
	}
}

func TestRouterCurrentProcessPythonPublishesGeneratedCallDiagnosticsWithWorkspaceAndMirrorWatchCodeCopies(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	settaFilesRoot := filepath.Join(workspaceRoot, "setta_files")
	workspaceSourcePath := filepath.Join(workspaceRoot, "watch_code_test.py")
	mirrorSourcePath := filepath.Join(settaFilesRoot, "watch_code_test.py")
	generatedPath := filepath.Join(settaFilesRoot, "code", "sections", "tide_lime", "setta_gen.py")
	initialSourceContent := "def cool_fn():\n    print(\"hello\")\n"
	updatedSourceContent := "def cool_fn(a, b, c):\n    print(\"hello\")\n"
	generatedContent := "from watch_code_test import cool_fn\n\n\nclass SettaState:\n    def __init__(state):\n        state.blue_tall = cool_fn()\n\nstate = SettaState()\n"

	if err := os.MkdirAll(filepath.Dir(generatedPath), 0o755); err != nil {
		t.Fatalf("mkdir generated path: %v", err)
	}
	for _, file := range []struct {
		path    string
		content string
	}{
		{path: workspaceSourcePath, content: initialSourceContent},
		{path: mirrorSourcePath, content: initialSourceContent},
		{path: generatedPath, content: generatedContent},
	} {
		if err := statefs.AtomicWriteFile(file.path, []byte(file.content), 0o644); err != nil {
			t.Fatalf("seed %q: %v", file.path, err)
		}
	}

	settings := basedpyrightTestSettings(map[string]any{
		"languageServer": map[string]any{
			"basedpyright": map[string]any{
				"analysis": map[string]any{
					"diagnosticSeverityOverrides": map[string]any{
						"reportUnknownVariableType":       "none",
						"reportUnknownMemberType":         "none",
						"reportUnannotatedClassAttribute": "none",
						"reportSelfClsParameterName":      "none",
					},
				},
			},
		},
	}, []string{settaFilesRoot})

	router := newBasedpyrightRouter(t, workspaceRoot, settings)
	defer func() {
		if err := router.Close(context.Background()); err != nil {
			t.Fatalf("close router: %v", err)
		}
	}()

	service, ok, err := router.serviceForLanguage("python")
	if err != nil {
		t.Fatalf("resolve python service: %v", err)
	}
	if !ok || service == nil {
		t.Fatal("expected python service to be configured")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	diagnosticsCh := make(chan PublishDiagnosticsParams, 16)
	for _, document := range []SyncedDocument{
		{
			Path:       workspaceSourcePath,
			LanguageID: "python",
			Content:    initialSourceContent,
		},
		{
			Path:       mirrorSourcePath,
			LanguageID: "python",
			Content:    initialSourceContent,
		},
		{
			Path:       generatedPath,
			LanguageID: "python",
			Content:    generatedContent,
			Callback: func(params PublishDiagnosticsParams) {
				diagnosticsCh <- params
			},
		},
	} {
		if err := service.UpsertDocument(ctx, document); err != nil {
			t.Fatalf("upsert initial document %q: %v", document.Path, err)
		}
	}

	_ = waitForDiagnostics(t, diagnosticsCh)

	if err := service.UpsertDocument(ctx, SyncedDocument{
		Path:       workspaceSourcePath,
		LanguageID: "python",
		Content:    updatedSourceContent,
	}); err != nil {
		t.Fatalf("upsert updated workspace source: %v", err)
	}
	if err := service.UpsertDocument(ctx, SyncedDocument{
		Path:       mirrorSourcePath,
		LanguageID: "python",
		Content:    updatedSourceContent,
	}); err != nil {
		t.Fatalf("upsert updated mirror source: %v", err)
	}
	if err := service.RefreshDocuments(ctx, map[string]SyncedDocument{
		mirrorSourcePath: {
			Path:       mirrorSourcePath,
			LanguageID: "python",
			Content:    updatedSourceContent,
		},
		generatedPath: {
			Path:       generatedPath,
			LanguageID: "python",
			Content:    generatedContent,
			Callback: func(params PublishDiagnosticsParams) {
				diagnosticsCh <- params
			},
		},
	}); err != nil {
		t.Fatalf("refresh mirror and generated documents: %v", err)
	}

	refreshed, ok := waitForDiagnosticsContainingRule(diagnosticsCh, "reportCallIssue", 5*time.Second)
	if !ok {
		t.Fatalf("expected generated call diagnostics with workspace and mirror watch-code copies, got %#v", refreshed.Diagnostics)
	}
	if !diagnosticsContainMessage(refreshed.Diagnostics, "Arguments missing for parameters \"a\", \"b\", \"c\"") {
		t.Fatalf("expected missing-arg diagnostics for a/b/c with workspace and mirror watch-code copies, got %#v", refreshed.Diagnostics)
	}
}

func settingsMapsEqual(left map[string]any, right map[string]any) bool {
	return reflect.DeepEqual(left, right)
}

func basedpyrightTestSettings(base map[string]any, extraPaths []string) map[string]any {
	branch := basedpyrightTestSettingsBranch(base)
	if len(extraPaths) != 0 {
		analysis, ok := branch["analysis"].(map[string]any)
		if !ok {
			analysis = map[string]any{}
			branch["analysis"] = analysis
		}
		analysis["extraPaths"] = basedpyrightTestStringSliceToAnySlice(
			mergeBasedpyrightTestExtraPaths(analysis["extraPaths"], extraPaths),
		)
	}
	if len(branch) == 0 {
		return nil
	}
	return map[string]any{"basedpyright": branch}
}

func basedpyrightTestSettingsBranch(base map[string]any) map[string]any {
	if base == nil {
		return map[string]any{}
	}
	if basedpyrightSettings, ok := base["basedpyright"].(map[string]any); ok {
		return cloneLanguageServerSettingsMap(basedpyrightSettings)
	}
	languageServer, ok := base["languageServer"].(map[string]any)
	if !ok {
		return map[string]any{}
	}
	basedpyrightSettings, ok := languageServer["basedpyright"].(map[string]any)
	if !ok {
		return map[string]any{}
	}
	return cloneLanguageServerSettingsMap(basedpyrightSettings)
}

func mergeBasedpyrightTestExtraPaths(existing any, extraPaths []string) []string {
	merged := []string{}
	seen := map[string]struct{}{}
	appendPath := func(rawPath string) {
		trimmed := strings.TrimSpace(rawPath)
		if trimmed == "" {
			return
		}
		normalized := filepath.Clean(trimmed)
		if _, ok := seen[normalized]; ok {
			return
		}
		seen[normalized] = struct{}{}
		merged = append(merged, normalized)
	}

	switch typed := existing.(type) {
	case []any:
		for _, value := range typed {
			path, ok := value.(string)
			if ok {
				appendPath(path)
			}
		}
	case []string:
		for _, value := range typed {
			appendPath(value)
		}
	}
	for _, value := range extraPaths {
		appendPath(value)
	}
	return merged
}

func basedpyrightTestStringSliceToAnySlice(values []string) []any {
	if len(values) == 0 {
		return nil
	}
	result := make([]any, len(values))
	for index, value := range values {
		result[index] = value
	}
	return result
}

func diagnosticsContainRule(diagnostics []Diagnostic, rule string) bool {
	for _, diagnostic := range diagnostics {
		if diagnostic.Code == rule {
			return true
		}
	}
	return false
}

func diagnosticsContainMessage(diagnostics []Diagnostic, fragment string) bool {
	for _, diagnostic := range diagnostics {
		if strings.Contains(diagnostic.Message, fragment) {
			return true
		}
	}
	return false
}

func waitForDiagnosticsContainingRule(
	diagnosticsCh <-chan PublishDiagnosticsParams,
	rule string,
	timeout time.Duration,
) (PublishDiagnosticsParams, bool) {
	timer := time.NewTimer(timeout)
	defer timer.Stop()

	last := PublishDiagnosticsParams{}
	for {
		select {
		case params := <-diagnosticsCh:
			last = params
			if diagnosticsContainRule(params.Diagnostics, rule) {
				return params, true
			}
		case <-timer.C:
			return last, false
		}
	}
}

func resolveRouterTestPythonBinary(t *testing.T) string {
	t.Helper()

	for _, candidate := range []string{"python3", "python"} {
		resolved, err := exec.LookPath(candidate)
		if err == nil {
			return resolved
		}
	}
	t.Fatal("python binary not found in PATH")
	return ""
}

func newFixturePythonRouter(
	t *testing.T,
	workspaceRoot string,
	additionalSpecs []LanguageServerSpec,
) *Router {
	t.Helper()

	specs := append([]LanguageServerSpec{fixturePythonLanguageServerSpec(t)}, additionalSpecs...)
	router, err := NewRouter(RouterOptions{
		WorkspaceRoot:   workspaceRoot,
		AdditionalSpecs: specs,
	})
	if err != nil {
		t.Fatalf("new router: %v", err)
	}
	return router
}

func newBasedpyrightRouter(t *testing.T, workspaceRoot string, settings map[string]any) *Router {
	t.Helper()

	router, err := NewRouter(RouterOptions{
		WorkspaceRoot: workspaceRoot,
		AdditionalSpecs: []LanguageServerSpec{
			basedpyrightLanguageServerSpec(t, settings),
		},
	})
	if err != nil {
		t.Fatalf("new basedpyright router: %v", err)
	}
	return router
}

func basedpyrightLanguageServerSpec(t *testing.T, settings map[string]any) LanguageServerSpec {
	t.Helper()

	settingsKey := "basedpyright"
	return LanguageServerSpec{
		Name:        "basedpyright",
		LanguageID:  "python",
		Command:     firstpartyplugin.BasedpyrightPython(t),
		Args:        []string{"-c", "from basedpyright.langserver import main; main()", "--stdio"},
		Settings:    cloneLanguageServerSettingsMap(settings),
		SettingsKey: &settingsKey,
	}
}

func fixturePythonLanguageServerSpec(t *testing.T) LanguageServerSpec {
	t.Helper()

	return fixturePythonLanguageServerSpecWithPaths(
		resolveRouterTestPythonBinary(t),
		filepath.Join(routerTestRepoRoot(t), "tests", "fixtures", "lsp", "mini_language_server.py"),
	)
}

func fixturePythonLanguageServerSpecWithPaths(pythonBinary string, fixtureServerPath string) LanguageServerSpec {
	settingsKey := "basedpyright"
	return LanguageServerSpec{
		Name:        "fixture-python",
		LanguageID:  "python",
		Command:     pythonBinary,
		Args:        []string{fixtureServerPath},
		SettingsKey: &settingsKey,
	}
}

func fixturePluginLanguageServerSpec(t *testing.T) LanguageServerSpec {
	t.Helper()

	settingsKey := "fixtureDslLanguageServer"
	return LanguageServerSpec{
		Name:        "fixture-dsl",
		LanguageID:  "fixturedsl",
		Command:     resolveRouterTestPythonBinary(t),
		Args:        []string{filepath.Join(routerTestRepoRoot(t), "tests", "fixtures", "lsp", "mini_language_server.py")},
		SettingsKey: &settingsKey,
	}
}

func routerTestRepoRoot(t *testing.T) string {
	t.Helper()

	root, err := filepath.Abs(filepath.Join("..", ".."))
	if err != nil {
		t.Fatalf("resolve repo root: %v", err)
	}
	return root
}
