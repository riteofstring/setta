package app

import (
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
		lspSpecs: cloneLanguageServerSpecs(next),
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
		lspSpecs: []lsp.LanguageServerSpec{
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
