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
	router := newFixturePythonRouter(t, workspaceRoot, []LanguageServerSpec{fixturePluginLanguageServerSpec(t)}, fixturePluginLanguageServerSettings)
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
	router := newFixturePythonRouter(t, workspaceRoot, nil, fixturePluginLanguageServerSettings)
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

func TestCloneLanguageServerSpecsDeepClonesSettings(t *testing.T) {
	t.Parallel()

	specs := []LanguageServerSpec{{
		PluginID:   "setta-basedpyright",
		Name:       "basedpyright",
		LanguageID: "python",
		Command:    "python",
		Args:       []string{"-c", "print('fixture')"},
		Settings: map[string]any{
			"basedpyright": map[string]any{
				"analysis": map[string]any{
					"severityOverrides": map[string]any{
						"reportUnusedCallResult": "warning",
					},
				},
			},
		},
	}}

	cloned := CloneLanguageServerSpecs(specs)
	specs[0].Settings["basedpyright"].(map[string]any)["analysis"].(map[string]any)["severityOverrides"].(map[string]any)["reportUnusedCallResult"] = "error"

	got := cloned[0].Settings["basedpyright"].(map[string]any)["analysis"].(map[string]any)["severityOverrides"].(map[string]any)["reportUnusedCallResult"]
	if got != "warning" {
		t.Fatalf("expected cloned settings to keep original value, got %#v", got)
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

func TestRouterSyncDocumentsRoutesPluginLanguageDiagnosticsAndCompletion(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	router := newFixturePythonRouter(t, workspaceRoot, []LanguageServerSpec{fixturePluginLanguageServerSpec(t)}, fixturePluginLanguageServerSettings)
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
	router := newFixturePythonRouter(t, workspaceRoot, []LanguageServerSpec{fixturePluginLanguageServerSpec(t)}, fixturePluginLanguageServerSettings)
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
	}, nil)
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

func TestResolveLanguageServerSettings(t *testing.T) {
	t.Parallel()

	baseSettings := map[string]any{
		"settings": map[string]any{
			"fixtureDslLanguageServer": map[string]any{
				"analysis": map[string]any{
					"emitDiagnostics": true,
				},
			},
		},
		"topLevel": map[string]any{
			"enabled": true,
		},
	}
	testCases := []struct {
		name        string
		settings    map[string]any
		settingsKey *string
		expected    map[string]any
	}{
		{
			name:        "wraps nested key",
			settings:    baseSettings,
			settingsKey: stringPtr("settings.fixtureDslLanguageServer"),
			expected: map[string]any{
				"settings": map[string]any{
					"fixtureDslLanguageServer": map[string]any{
						"analysis": map[string]any{
							"emitDiagnostics": true,
						},
					},
				},
			},
		},
		{
			name:        "returns full clone when key is nil",
			settings:    baseSettings,
			settingsKey: nil,
			expected:    baseSettings,
		},
		{
			name:        "drops blank segments around nested key",
			settings:    baseSettings,
			settingsKey: stringPtr(" settings..fixtureDslLanguageServer "),
			expected: map[string]any{
				"settings": map[string]any{
					"fixtureDslLanguageServer": map[string]any{
						"analysis": map[string]any{
							"emitDiagnostics": true,
						},
					},
				},
			},
		},
		{
			name:        "returns nil for missing branch",
			settings:    baseSettings,
			settingsKey: stringPtr("settings.missing"),
			expected:    nil,
		},
		{
			name: "returns nil for non map leaf",
			settings: map[string]any{
				"settings": map[string]any{
					"enabled": true,
				},
			},
			settingsKey: stringPtr("settings.enabled"),
			expected:    nil,
		},
		{
			name:        "returns nil for blank key",
			settings:    baseSettings,
			settingsKey: stringPtr("  .  "),
			expected:    nil,
		},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			resolved := resolveLanguageServerSettings(tc.settings, tc.settingsKey)
			if !settingsMapsEqual(resolved, tc.expected) {
				t.Fatalf("unexpected resolved settings %#v", resolved)
			}
		})
	}
}

func TestResolveLanguageServerSettingsClonesReturnedMap(t *testing.T) {
	t.Parallel()

	settingsKey := "settings.fixtureDslLanguageServer"
	settings := map[string]any{
		"settings": map[string]any{
			"fixtureDslLanguageServer": map[string]any{
				"analysis": map[string]any{
					"emitDiagnostics": true,
				},
			},
		},
	}

	resolved := resolveLanguageServerSettings(settings, &settingsKey)
	analysis := resolved["settings"].(map[string]any)["fixtureDslLanguageServer"].(map[string]any)["analysis"].(map[string]any)
	analysis["emitDiagnostics"] = false

	original := settings["settings"].(map[string]any)["fixtureDslLanguageServer"].(map[string]any)["analysis"].(map[string]any)
	if original["emitDiagnostics"] != true {
		t.Fatalf("expected original settings to remain unchanged, got %#v", original)
	}
}

func TestRouterConfiguredPythonSettingsReadNestedBasedpyrightBranch(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	settings := func() map[string]any {
		return BuildBasedpyrightSettingsRoot(map[string]any{
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
	}

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

func TestRouterConfiguredPythonDiagnosticsUseNestedBasedpyrightSettingsForWatchCodeGeneratedImports(t *testing.T) {
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

	settings := func() map[string]any {
		return BuildBasedpyrightSettingsRoot(map[string]any{
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
	}

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

func TestRouterConfiguredPythonRefreshesGeneratedDiagnosticsWhenImportedWatchCodeSignatureChanges(t *testing.T) {
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

	settings := func() map[string]any {
		return BuildBasedpyrightSettingsRoot(map[string]any{
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
	}

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

func TestRouterConfiguredPythonSyncAndRefreshPublishesGeneratedCallDiagnosticsAfterWatchCodeSignatureChange(t *testing.T) {
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

	settings := func() map[string]any {
		return BuildBasedpyrightSettingsRoot(map[string]any{
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
	}

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

func TestRouterConfiguredPythonIncrementalWatchCodeTypingStillPublishesGeneratedCallDiagnostics(t *testing.T) {
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

	settings := func() map[string]any {
		return BuildBasedpyrightSettingsRoot(map[string]any{
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
	}

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

func TestRouterConfiguredPythonPublishesGeneratedCallDiagnosticsWithWorkspaceAndMirrorWatchCodeCopies(t *testing.T) {
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

	settings := func() map[string]any {
		return BuildBasedpyrightSettingsRoot(map[string]any{
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
	}

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

func stringPtr(value string) *string {
	return &value
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
	settings func() map[string]any,
) *Router {
	t.Helper()

	pythonBinary := resolveRouterTestPythonBinary(t)
	fixtureServerPath := filepath.Join(
		routerTestRepoRoot(t),
		"tests",
		"fixtures",
		"lsp",
		"mini_language_server.py",
	)

	specs := append([]LanguageServerSpec{fixturePythonLanguageServerSpecWithPaths(pythonBinary, fixtureServerPath)}, additionalSpecs...)
	router, err := NewRouter(RouterOptions{
		WorkspaceRoot:   workspaceRoot,
		AdditionalSpecs: specs,
		Settings:        settings,
	})
	if err != nil {
		t.Fatalf("new router: %v", err)
	}
	return router
}

func newBasedpyrightRouter(
	t *testing.T,
	workspaceRoot string,
	settings func() map[string]any,
) *Router {
	t.Helper()

	settingsKey := "basedpyright"
	router, err := NewRouter(RouterOptions{
		WorkspaceRoot: workspaceRoot,
		AdditionalSpecs: []LanguageServerSpec{{
			PluginID:    "setta-basedpyright",
			Name:        "basedpyright",
			LanguageID:  "python",
			Command:     firstpartyplugin.BasedpyrightLangserverCommand(t),
			Args:        []string{"--stdio"},
			SettingsKey: &settingsKey,
		}},
		Settings: settings,
	})
	if err != nil {
		t.Fatalf("new router: %v", err)
	}
	return router
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

func fixturePluginLanguageServerSettings() map[string]any {
	return map[string]any{
		"fixtureDslLanguageServer": map[string]any{
			"analysis": map[string]any{
				"emitDiagnostics": true,
			},
		},
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
