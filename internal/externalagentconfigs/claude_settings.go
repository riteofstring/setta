package externalagentconfigs

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

const (
	claudeSettingsDirName   = ".claude"
	claudeSettingsLocalName = "settings.local.json"
	claudeSettingsFileName  = "settings.json"
)

func ResolveClaudeSettingsPath(config Config, workspaceRoot string) string {
	root := strings.TrimSpace(workspaceRoot)
	if root == "" || config.ToolType != ToolTypeClaudeCode {
		return ""
	}
	settingsDir := filepath.Join(root, claudeSettingsDirName)
	switch config.SettingsMode {
	case SettingsModeManagedLocal:
		return filepath.Join(settingsDir, claudeSettingsLocalName)
	case SettingsModeManagedProject:
		return filepath.Join(settingsDir, claudeSettingsFileName)
	default:
		return ""
	}
}

func PrepareClaudeSettings(workspaceRoot string, config Config) error {
	settingsPath := ResolveClaudeSettingsPath(config, workspaceRoot)
	if settingsPath == "" {
		return nil
	}
	if _, err := os.Stat(settingsPath); err == nil && !config.SettingsAllowSettaEdits {
		return nil
	}
	payload := map[string]any{}
	if existing, err := os.ReadFile(settingsPath); err == nil {
		if err := json.Unmarshal(existing, &payload); err != nil {
			return fmt.Errorf("decode claude settings: %w", err)
		}
	}
	if config.SettingsManagedBlock != nil && config.SettingsManagedBlock.Claude != nil {
		for key, value := range config.SettingsManagedBlock.Claude {
			payload[key] = cloneJSONValue(value)
		}
	}
	if err := os.MkdirAll(filepath.Dir(settingsPath), 0o755); err != nil {
		return fmt.Errorf("create claude settings dir: %w", err)
	}
	content, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return fmt.Errorf("encode claude settings: %w", err)
	}
	content = append(content, '\n')
	if err := os.WriteFile(settingsPath, content, 0o644); err != nil {
		return fmt.Errorf("write claude settings: %w", err)
	}
	return nil
}
