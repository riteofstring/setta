package app

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"setta/internal/lsp"
	"setta/internal/plugins"
)

func TestCloneLanguageServerSpecsDeepCopiesSettings(t *testing.T) {
	original := []lsp.LanguageServerSpec{
		{
			PluginID:   "setta-basedpyright",
			Name:       "basedpyright",
			LanguageID: "python",
			Command:    "/tmp/python",
			Args:       []string{"-c", "from basedpyright.langserver import main; main()", "--stdio"},
			Settings: map[string]any{
				"basedpyright": map[string]any{
					"analysis": map[string]any{
						"diagnosticSeverityOverrides": map[string]any{
							"reportUnknownVariableType": "none",
						},
					},
				},
			},
		},
	}

	cloned := cloneLanguageServerSpecs(original)
	basedpyrightSettings := cloned[0].Settings["basedpyright"].(map[string]any)
	analysis := basedpyrightSettings["analysis"].(map[string]any)
	overrides := analysis["diagnosticSeverityOverrides"].(map[string]any)
	overrides["reportUnknownVariableType"] = "error"

	originalOverrides := original[0].Settings["basedpyright"].(map[string]any)["analysis"].(map[string]any)["diagnosticSeverityOverrides"].(map[string]any)
	if originalOverrides["reportUnknownVariableType"] != "none" {
		t.Fatalf("expected original settings to remain unchanged, got %#v", originalOverrides)
	}
}

func TestCloneLanguageServerSpecsPreservesEmptySettingsMap(t *testing.T) {
	original := []lsp.LanguageServerSpec{
		{
			PluginID:   "setta-fixture-backend",
			Name:       "fixture-dsl",
			LanguageID: "fixturedsl",
			Command:    "python",
			Settings:   map[string]any{},
		},
	}

	cloned := cloneLanguageServerSpecs(original)
	if cloned[0].Settings == nil || len(cloned[0].Settings) != 0 {
		t.Fatalf("expected explicit empty settings map to remain explicit, got %#v", cloned[0].Settings)
	}
}

func TestRollbackRefreshTransitionRestoresLanguageServerSettings(t *testing.T) {
	previous := []lsp.LanguageServerSpec{
		{
			PluginID:   "setta-basedpyright",
			Name:       "basedpyright",
			LanguageID: "python",
			Command:    "/tmp/python",
			Args:       []string{"-c", "from basedpyright.langserver import main; main()", "--stdio"},
			Settings: map[string]any{
				"basedpyright": map[string]any{
					"analysis": map[string]any{
						"diagnosticSeverityOverrides": map[string]any{
							"reportUnknownVariableType": "none",
						},
					},
				},
			},
		},
	}
	next := []lsp.LanguageServerSpec{
		{
			PluginID:   "setta-basedpyright",
			Name:       "basedpyright",
			LanguageID: "python",
			Command:    "/tmp/python",
			Args:       []string{"-c", "from basedpyright.langserver import main; main()", "--stdio"},
		},
	}

	refresher := &pluginBackendRuntimeRefresher{
		lspSpecs:        cloneLanguageServerSpecs(next),
		appliedLSPSpecs: cloneLanguageServerSpecs(next),
	}
	refresher.rollbackRefreshTransitionLocked(&pluginBackendRefreshTransition{
		nextLSPSpecs:     cloneLanguageServerSpecs(next),
		previousLSPSpecs: cloneLanguageServerSpecs(previous),
	})

	if len(refresher.lspSpecs) != 1 {
		t.Fatalf("expected one restored LSP spec, got %#v", refresher.lspSpecs)
	}
	basedpyrightSettings, ok := refresher.lspSpecs[0].Settings["basedpyright"].(map[string]any)
	if !ok {
		t.Fatalf("expected restored settings map, got %#v", refresher.lspSpecs[0].Settings)
	}
	analysis, ok := basedpyrightSettings["analysis"].(map[string]any)
	if !ok {
		t.Fatalf("expected restored analysis settings, got %#v", basedpyrightSettings["analysis"])
	}
	overrides, ok := analysis["diagnosticSeverityOverrides"].(map[string]any)
	if !ok {
		t.Fatalf("expected restored override settings, got %#v", analysis["diagnosticSeverityOverrides"])
	}
	if overrides["reportUnknownVariableType"] != "none" {
		t.Fatalf("expected restored reportUnknownVariableType override, got %#v", overrides["reportUnknownVariableType"])
	}
}

func TestPluginBackendRuntimeRefresherAppliesLanguageServerStatus(t *testing.T) {
	refresher := &pluginBackendRuntimeRefresher{
		appliedLSPSpecs: []lsp.LanguageServerSpec{
			{
				PluginID:   "setta-basedpyright",
				LanguageID: "python",
			},
		},
	}
	status := plugins.PluginStatusResponse{
		Plugins: []plugins.PluginStatusEntry{
			{
				PluginID:                       "setta-basedpyright",
				State:                          plugins.PluginRuntimeStateActive,
				AppliedLanguageServerLanguages: []string{},
			},
			{
				PluginID: "setta-shadowed",
				State:    plugins.PluginRuntimeStateShadowed,
			},
		},
	}

	refresher.applyAppliedLanguageServerStatus(&status)

	if len(status.Plugins[0].AppliedLanguageServerLanguages) != 1 || status.Plugins[0].AppliedLanguageServerLanguages[0] != "python" {
		t.Fatalf("expected applied python status, got %#v", status.Plugins[0].AppliedLanguageServerLanguages)
	}
}

func TestCommitAppliedLanguageServerPluginsDoesNotAdvanceAppliedSpecsOnCommitFailure(t *testing.T) {
	app := newAppWithFixtureLanguageServer(t)

	previous := []lsp.LanguageServerSpec{
		{
			PluginID:   "setta-fixture-backend",
			LanguageID: "fixturedsl",
			Command:    "python",
			Settings:   map[string]any{},
		},
	}
	next := []lsp.LanguageServerSpec{
		{
			PluginID:   "setta-basedpyright",
			LanguageID: "python",
			Command:    "python",
			Settings: map[string]any{
				"basedpyright": map[string]any{
					"analysis": map[string]any{
						"extraPaths": []any{"/tmp/spec"},
					},
				},
			},
		},
	}

	app.pluginRuntime.mu.Lock()
	app.pluginRuntime.appliedLSPSpecs = cloneLanguageServerSpecs(previous)
	app.pluginRuntime.lspSpecs = cloneLanguageServerSpecs(next)
	app.pluginRuntime.mu.Unlock()

	if err := os.WriteFile(filepath.Join(app.config.Paths.SettaFilesRoot, "plugins_state.json"), []byte("{"), 0o644); err != nil {
		t.Fatalf("write malformed plugin state: %v", err)
	}

	err := app.pluginRuntime.CommitAppliedLanguageServerPlugins(context.Background())
	if err == nil {
		t.Fatal("expected commit failure")
	}

	app.pluginRuntime.mu.Lock()
	defer app.pluginRuntime.mu.Unlock()

	if !languageServerSpecSlicesEqual(app.pluginRuntime.appliedLSPSpecs, previous) {
		t.Fatalf("expected applied specs to remain unchanged after commit failure, got %#v", app.pluginRuntime.appliedLSPSpecs)
	}
}

func TestRefreshedAppliedLanguageServerSpecsKeepsOnlyPreviouslyAppliedSelections(t *testing.T) {
	applied := []lsp.LanguageServerSpec{
		{
			PluginID:   "setta-fixture-backend",
			LanguageID: "fixturedsl",
			Command:    "python",
			Args:       []string{"fixture-lsp.py"},
		},
	}
	selected := []lsp.LanguageServerSpec{
		{
			PluginID:   "setta-fixture-backend",
			LanguageID: "fixturedsl",
			Command:    "python",
			Args:       []string{"fixture-lsp-updated.py"},
		},
		{
			PluginID:   "setta-basedpyright",
			LanguageID: "python",
			Command:    "python",
			Args:       []string{"basedpyright.py"},
		},
	}

	refreshed := refreshedAppliedLanguageServerSpecs(applied, selected, "setta-fixture-backend")
	if len(refreshed) != 1 {
		t.Fatalf("expected only previously applied spec to remain, got %#v", refreshed)
	}
	if refreshed[0].PluginID != "setta-fixture-backend" || refreshed[0].LanguageID != "fixturedsl" {
		t.Fatalf("unexpected refreshed spec identity %#v", refreshed[0])
	}
	if len(refreshed[0].Args) != 1 || refreshed[0].Args[0] != "fixture-lsp-updated.py" {
		t.Fatalf("expected refreshed spec to pick updated applied-plugin args, got %#v", refreshed[0].Args)
	}
}

func expectRefreshedAppliedLanguageServerSpecsKeepAppliedSelection(t *testing.T, selected []lsp.LanguageServerSpec) {
	t.Helper()

	applied := []lsp.LanguageServerSpec{
		{
			PluginID:   "setta-fixture-backend",
			LanguageID: "fixturedsl",
			Command:    "python",
			Args:       []string{"fixture-lsp.py"},
		},
	}

	refreshed := refreshedAppliedLanguageServerSpecs(applied, selected, "setta-fixture-backend")
	if len(refreshed) != 1 {
		t.Fatalf("expected applied spec to remain pending until restart, got %#v", refreshed)
	}
	if refreshed[0].PluginID != "setta-fixture-backend" || refreshed[0].LanguageID != "fixturedsl" {
		t.Fatalf("unexpected refreshed spec identity %#v", refreshed[0])
	}
	if len(refreshed[0].Args) != 1 || refreshed[0].Args[0] != "fixture-lsp.py" {
		t.Fatalf("expected applied spec to remain unchanged, got %#v", refreshed[0].Args)
	}
}

func TestRefreshedAppliedLanguageServerSpecsKeepsClearedSelectionPendingUntilRestart(t *testing.T) {
	expectRefreshedAppliedLanguageServerSpecsKeepAppliedSelection(t, nil)
}

func TestRefreshedAppliedLanguageServerSpecsKeepsSwitchedSelectionPendingUntilRestart(t *testing.T) {
	expectRefreshedAppliedLanguageServerSpecsKeepAppliedSelection(t, []lsp.LanguageServerSpec{
		{
			PluginID:   "setta-fixture-backend-alt",
			LanguageID: "fixturedsl",
			Command:    "python",
			Args:       []string{"fixture-lsp-alt.py"},
		},
	})
}
