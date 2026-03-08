package lsp

import (
	"context"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

func TestRouterCompleteSnapshotRoutesPluginLanguage(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	fixtureServerPath := filepath.Join(
		routerTestRepoRoot(t),
		"tests",
		"fixtures",
		"plugins",
		"backend-language-server-e2e",
		"backend",
		"mini_language_server.py",
	)
	settingsKey := "fixtureDslLanguageServer"

	router, err := NewRouter(RouterOptions{
		WorkspaceRoot: workspaceRoot,
		AdditionalSpecs: []LanguageServerSpec{
			{
				Name:        "fixture-dsl",
				LanguageID:  "fixturedsl",
				Command:     resolveRouterTestPythonBinary(t),
				Args:        []string{fixtureServerPath},
				SettingsKey: &settingsKey,
			},
		},
		Settings: func() map[string]any {
			return map[string]any{
				"fixtureDslLanguageServer": map[string]any{
					"analysis": map[string]any{
						"emitDiagnostics": true,
					},
				},
			}
		},
	})
	if err != nil {
		t.Fatalf("new router: %v", err)
	}
	defer func() {
		if err := router.Close(context.Background()); err != nil {
			t.Fatalf("close router: %v", err)
		}
	}()

	referencePath := filepath.Join(workspaceRoot, "code", "sections", "alpha", "editor.fixturedsl")
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

func routerTestRepoRoot(t *testing.T) string {
	t.Helper()

	root, err := filepath.Abs(filepath.Join("..", ".."))
	if err != nil {
		t.Fatalf("resolve repo root: %v", err)
	}
	return root
}
