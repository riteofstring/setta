package app

import (
	"reflect"
	"testing"

	"setta/internal/lsp"
)

func TestCloneLanguageServerSpecsClonesSettingsDeeply(t *testing.T) {
	t.Parallel()

	settingsKey := "basedpyright"
	original := []lsp.LanguageServerSpec{
		{
			Name:       "python",
			LanguageID: "python",
			Command:    "basedpyright-langserver",
			Args:       []string{"--stdio"},
			Settings: map[string]any{
				"basedpyright": map[string]any{
					"analysis": map[string]any{
						"extraPaths": []any{"setta_files"},
					},
				},
			},
			SettingsKey: &settingsKey,
		},
	}

	cloned := cloneLanguageServerSpecs(original)
	if !reflect.DeepEqual(cloned, original) {
		t.Fatalf("expected cloned specs to match original, got %#v", cloned)
	}

	cloned[0].Args[0] = "--other"
	cloned[0].Settings["basedpyright"].(map[string]any)["analysis"].(map[string]any)["extraPaths"] = []any{"other"}
	*cloned[0].SettingsKey = "other"

	if original[0].Args[0] != "--stdio" {
		t.Fatalf("expected original args unchanged, got %#v", original[0].Args)
	}
	originalExtraPaths := original[0].Settings["basedpyright"].(map[string]any)["analysis"].(map[string]any)["extraPaths"].([]any)
	if len(originalExtraPaths) != 1 || originalExtraPaths[0] != "setta_files" {
		t.Fatalf("expected original settings unchanged, got %#v", originalExtraPaths)
	}
	if *original[0].SettingsKey != "basedpyright" {
		t.Fatalf("expected original settings key unchanged, got %q", *original[0].SettingsKey)
	}
}
