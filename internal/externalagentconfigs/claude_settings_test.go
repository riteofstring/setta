package externalagentconfigs

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestPrepareClaudeSettingsPreservesExistingUserKeys(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	settingsPath := filepath.Join(root, ".claude", "settings.json")
	if err := os.MkdirAll(filepath.Dir(settingsPath), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	existingPayload, err := json.MarshalIndent(map[string]any{
		"userSetting": map[string]any{"foo": "bar"},
		"permissions": map[string]any{"allow": []string{"Old"}},
	}, "", "  ")
	if err != nil {
		t.Fatalf("MarshalIndent() error = %v", err)
	}
	existingPayload = append(existingPayload, '\n')
	if err := os.WriteFile(settingsPath, existingPayload, 0o644); err != nil {
		t.Fatalf("WriteFile(%s) error = %v", settingsPath, err)
	}

	err = PrepareClaudeSettings(root, Config{
		ToolType:                ToolTypeClaudeCode,
		SettingsMode:            SettingsModeManagedProject,
		SettingsAllowSettaEdits: true,
		SettingsManagedBlock: &SettingsManagedBlock{
			Claude: &ClaudeSettingsManaged{
				Permissions: &ClaudeSettingsPermissions{
					Allow: []string{"New"},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("PrepareClaudeSettings() error = %v", err)
	}

	content, err := os.ReadFile(settingsPath)
	if err != nil {
		t.Fatalf("ReadFile(%s) error = %v", settingsPath, err)
	}
	var payload map[string]any
	if err := json.Unmarshal(content, &payload); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}
	if got, ok := payload["userSetting"].(map[string]any); !ok || got["foo"] != "bar" {
		t.Fatalf("expected userSetting to be preserved, got %#v", payload["userSetting"])
	}
	permissions, ok := payload["permissions"].(map[string]any)
	if !ok {
		t.Fatalf("expected permissions block, got %#v", payload["permissions"])
	}
	allow, ok := permissions["allow"].([]any)
	if !ok || len(allow) != 1 || allow[0] != "New" {
		t.Fatalf("expected managed allow list to overwrite existing values, got %#v", permissions["allow"])
	}
}

func TestPrepareClaudeSettingsSkipsExistingFileWithoutSettaEdits(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	settingsPath := filepath.Join(root, ".claude", "settings.local.json")
	if err := os.MkdirAll(filepath.Dir(settingsPath), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	original := []byte("{\"existing\":true}\n")
	if err := os.WriteFile(settingsPath, original, 0o644); err != nil {
		t.Fatalf("WriteFile(%s) error = %v", settingsPath, err)
	}

	err := PrepareClaudeSettings(root, Config{
		ToolType:                ToolTypeClaudeCode,
		SettingsMode:            SettingsModeManagedLocal,
		SettingsAllowSettaEdits: false,
		SettingsManagedBlock: &SettingsManagedBlock{
			Claude: &ClaudeSettingsManaged{
				Permissions: &ClaudeSettingsPermissions{
					Ask: []string{"Bash(rm:*)"},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("PrepareClaudeSettings() error = %v", err)
	}

	content, err := os.ReadFile(settingsPath)
	if err != nil {
		t.Fatalf("ReadFile(%s) error = %v", settingsPath, err)
	}
	if string(content) != string(original) {
		t.Fatalf("expected settings file to remain unchanged, got %q", string(content))
	}
}
