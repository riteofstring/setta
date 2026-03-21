package lsp

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
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

func settingsMapsEqual(left map[string]any, right map[string]any) bool {
	if len(left) != len(right) {
		return false
	}
	for key, leftValue := range left {
		rightValue, ok := right[key]
		if !ok {
			return false
		}
		leftMap, leftIsMap := leftValue.(map[string]any)
		rightMap, rightIsMap := rightValue.(map[string]any)
		if leftIsMap || rightIsMap {
			if !leftIsMap || !rightIsMap || !settingsMapsEqual(leftMap, rightMap) {
				return false
			}
			continue
		}
		if leftValue != rightValue {
			return false
		}
	}
	return true
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
