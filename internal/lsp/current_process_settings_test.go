package lsp

import "testing"

func TestCurrentProcessPythonSettingsAddsSettaFilesExtraPath(t *testing.T) {
	t.Parallel()

	settings := CurrentProcessPythonSettings(nil, []string{"/tmp/workspace/setta_files"})
	expected := map[string]any{
		"basedpyright": map[string]any{
			"analysis": map[string]any{
				"extraPaths": []any{"/tmp/workspace/setta_files"},
			},
		},
	}
	if !settingsMapsEqual(settings, expected) {
		t.Fatalf("expected basedpyright settings %#v, got %#v", expected, settings)
	}
}

func TestCurrentProcessPythonSettingsMergesExtraPathsWithoutDroppingExistingSettings(t *testing.T) {
	t.Parallel()

	base := map[string]any{
		"languageServer": map[string]any{
			"basedpyright": map[string]any{
				"analysis": map[string]any{
					"extraPaths": []any{"/tmp/already-there", " /tmp/workspace/setta_files "},
					"diagnosticSeverityOverrides": map[string]any{
						"reportUnknownVariableType": "none",
					},
				},
			},
		},
	}

	settings := CurrentProcessPythonSettings(base, []string{"/tmp/workspace/setta_files", "/tmp/added"})
	expected := map[string]any{
		"basedpyright": map[string]any{
			"analysis": map[string]any{
				"extraPaths": []any{"/tmp/already-there", "/tmp/workspace/setta_files", "/tmp/added"},
				"diagnosticSeverityOverrides": map[string]any{
					"reportUnknownVariableType": "none",
				},
			},
		},
	}
	if !settingsMapsEqual(settings, expected) {
		t.Fatalf("expected merged basedpyright settings %#v, got %#v", expected, settings)
	}
}
