package lsp

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"setta/internal/statefs"
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

func TestResolveLanguageServerSettingsWrapsNestedKey(t *testing.T) {
	t.Parallel()

	settings := map[string]any{
		"settings": map[string]any{
			"fixtureDslLanguageServer": map[string]any{
				"analysis": map[string]any{
					"emitDiagnostics": true,
				},
			},
		},
	}
	settingsKey := "settings.fixtureDslLanguageServer"

	resolved := resolveLanguageServerSettings(settings, &settingsKey)
	expected := map[string]any{
		"settings": map[string]any{
			"fixtureDslLanguageServer": map[string]any{
				"analysis": map[string]any{
					"emitDiagnostics": true,
				},
			},
		},
	}
	if !settingsMapsEqual(resolved, expected) {
		t.Fatalf("unexpected resolved settings %#v", resolved)
	}
}

func TestRouterCurrentProcessPythonSettingsReadNestedLanguageServerBranch(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	settings := func() map[string]any {
		return CurrentProcessPythonSettings(map[string]any{
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

	router, err := NewRouter(RouterOptions{
		WorkspaceRoot: workspaceRoot,
		Settings:      settings,
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

	settings := func() map[string]any {
		return CurrentProcessPythonSettings(map[string]any{
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

	router, err := NewRouter(RouterOptions{
		WorkspaceRoot: workspaceRoot,
		Settings:      settings,
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

func settingsMapsEqual(left map[string]any, right map[string]any) bool {
	return reflect.DeepEqual(left, right)
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

	router, err := NewRouter(RouterOptions{
		WorkspaceRoot: workspaceRoot,
		LookupEnv: func(key string) (string, bool) {
			switch key {
			case lspCommandEnv:
				return pythonBinary, true
			case lspArgsEnv:
				return fixtureServerPath, true
			default:
				return "", false
			}
		},
		AdditionalSpecs: additionalSpecs,
		Settings:        settings,
	})
	if err != nil {
		t.Fatalf("new router: %v", err)
	}
	return router
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
