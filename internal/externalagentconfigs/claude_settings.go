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
	if shouldSkipClaudeSettingsWrite(settingsPath, config.SettingsAllowSettaEdits) {
		return nil
	}
	payload, err := readClaudeSettingsPayload(settingsPath)
	if err != nil {
		return err
	}
	mergeClaudeSettingsManagedBlock(payload, config.SettingsManagedBlock)
	return writeClaudeSettingsPayload(settingsPath, payload)
}

func shouldSkipClaudeSettingsWrite(settingsPath string, allowSettaEdits bool) bool {
	if allowSettaEdits {
		return false
	}
	_, err := os.Stat(settingsPath)
	return err == nil
}

func readClaudeSettingsPayload(settingsPath string) (map[string]any, error) {
	payload := map[string]any{}
	existing, err := os.ReadFile(settingsPath)
	if err != nil {
		return payload, nil
	}
	if err := json.Unmarshal(existing, &payload); err != nil {
		return nil, fmt.Errorf("decode claude settings: %w", err)
	}
	return payload, nil
}

func mergeClaudeSettingsManagedBlock(
	payload map[string]any,
	managedBlock *SettingsManagedBlock,
) {
	if managedBlock == nil || managedBlock.Claude == nil {
		return
	}
	for key, value := range claudeSettingsManagedPayload(managedBlock.Claude) {
		payload[key] = cloneJSONValue(value)
	}
}

func writeClaudeSettingsPayload(settingsPath string, payload map[string]any) error {
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

func claudeSettingsManagedPayload(value *ClaudeSettingsManaged) map[string]any {
	if value == nil {
		return nil
	}
	payload := map[string]any{}
	if value.Permissions != nil {
		payload["permissions"] = map[string]any{
			"allow": append([]string(nil), value.Permissions.Allow...),
			"ask":   append([]string(nil), value.Permissions.Ask...),
			"deny":  append([]string(nil), value.Permissions.Deny...),
		}
	}
	if value.DefaultMode != nil {
		payload["defaultMode"] = *value.DefaultMode
	}
	if len(value.MCP) > 0 {
		payload["mcp"] = cloneJSONMap(value.MCP)
	}
	return payload
}
