package externalagents

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"setta/internal/externalagentconfigs"

	toml "github.com/pelletier/go-toml/v2"
)

func TestCodexExecutorPrepareCodexHomePrefersExplicitBaseConfigPath(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	configID := "external-config"
	explicitConfigPath := filepath.Join(root, "custom", "codex.toml")
	if err := os.MkdirAll(filepath.Dir(explicitConfigPath), 0o755); err != nil {
		t.Fatalf("mkdir explicit config dir: %v", err)
	}
	explicitConfig, err := toml.Marshal(map[string]any{
		"mcp_servers": map[string]any{
			"explicit": map[string]any{
				"url": "http://explicit.example/mcp",
			},
		},
	})
	if err != nil {
		t.Fatalf("encode explicit codex config: %v", err)
	}
	if err := os.WriteFile(explicitConfigPath, explicitConfig, 0o644); err != nil {
		t.Fatalf("write explicit codex config: %v", err)
	}

	canonicalConfigPath := filepath.Join(root, codexSettingsRootName, "codex", configID, codexConfigFileName)
	if err := os.MkdirAll(filepath.Dir(canonicalConfigPath), 0o755); err != nil {
		t.Fatalf("mkdir canonical config dir: %v", err)
	}
	canonicalConfig, err := toml.Marshal(map[string]any{
		"mcp_servers": map[string]any{
			"canonical": map[string]any{
				"url": "http://canonical.example/mcp",
			},
		},
	})
	if err != nil {
		t.Fatalf("encode canonical codex config: %v", err)
	}
	if err := os.WriteFile(canonicalConfigPath, canonicalConfig, 0o644); err != nil {
		t.Fatalf("write canonical codex config: %v", err)
	}

	executor := &CodexExecutor{
		settaFilesRoot: root,
	}
	runtimeHome, err := executor.prepareCodexHome(externalagentconfigs.Config{
		ID:               configID,
		SettingsMode:     externalagentconfigs.SettingsModeExplicitPath,
		SettingsFilePath: stringPtr(explicitConfigPath),
	}, "chat-1", root, map[string]any{}, nil, false, nil)
	if err != nil {
		t.Fatalf("prepare codex home: %v", err)
	}

	content, err := os.ReadFile(filepath.Join(runtimeHome, codexConfigFileName))
	if err != nil {
		t.Fatalf("read runtime codex config: %v", err)
	}
	runtimeConfig := map[string]any{}
	if err := toml.Unmarshal(content, &runtimeConfig); err != nil {
		t.Fatalf("decode runtime codex config: %v", err)
	}
	mcpServers, ok := mapValue(runtimeConfig["mcp_servers"])
	if !ok {
		t.Fatalf("expected runtime mcp_servers map, got %#v", runtimeConfig["mcp_servers"])
	}
	if _, ok := mapValue(mcpServers["explicit"]); !ok {
		t.Fatalf("expected explicit-path mcp server to be preserved, got %#v", mcpServers)
	}
	if _, ok := mcpServers["canonical"]; ok {
		t.Fatalf("expected canonical home config to be ignored when explicit path is set, got %#v", mcpServers)
	}
}

func TestCodexExecutorPrepareCodexHomeCopiesAuthFileIntoSessionHome(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	explicitConfigPath := filepath.Join(root, "custom", "codex.toml")
	if err := os.MkdirAll(filepath.Dir(explicitConfigPath), 0o755); err != nil {
		t.Fatalf("mkdir explicit config dir: %v", err)
	}
	if err := os.WriteFile(explicitConfigPath, []byte("model = \"gpt-5\"\n"), 0o644); err != nil {
		t.Fatalf("write explicit codex config: %v", err)
	}
	authPayload := []byte("{\"access_token\":\"secret\"}\n")
	if err := os.WriteFile(filepath.Join(filepath.Dir(explicitConfigPath), "auth.json"), authPayload, 0o600); err != nil {
		t.Fatalf("write explicit codex auth file: %v", err)
	}

	executor := &CodexExecutor{
		settaFilesRoot: root,
	}
	runtimeHome, err := executor.prepareCodexHome(externalagentconfigs.Config{
		ID:               "external-config",
		SettingsMode:     externalagentconfigs.SettingsModeExplicitPath,
		SettingsFilePath: stringPtr(explicitConfigPath),
	}, "chat-1", root, map[string]any{}, nil, false, nil)
	if err != nil {
		t.Fatalf("prepare codex home: %v", err)
	}

	runtimeAuthPayload, err := os.ReadFile(filepath.Join(runtimeHome, "auth.json"))
	if err != nil {
		t.Fatalf("read runtime auth.json: %v", err)
	}
	if string(runtimeAuthPayload) != string(authPayload) {
		t.Fatalf("expected copied auth payload %q, got %q", string(authPayload), string(runtimeAuthPayload))
	}
}

func TestCodexExecutorPrepareCodexHomeLeavesExplicitSourceConfigUnchanged(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	explicitConfigPath := filepath.Join(root, "custom", "codex.toml")
	if err := os.MkdirAll(filepath.Dir(explicitConfigPath), 0o755); err != nil {
		t.Fatalf("mkdir explicit config dir: %v", err)
	}
	sourceConfig, err := toml.Marshal(map[string]any{
		"developer_instructions": "Base instructions",
		"mcp_servers": map[string]any{
			"explicit": map[string]any{
				"url": "http://explicit.example/mcp",
			},
		},
	})
	if err != nil {
		t.Fatalf("encode explicit codex config: %v", err)
	}
	if err := os.WriteFile(explicitConfigPath, sourceConfig, 0o644); err != nil {
		t.Fatalf("write explicit codex config: %v", err)
	}

	executor := &CodexExecutor{
		settaFilesRoot: root,
	}
	runtimeHome, err := executor.prepareCodexHome(externalagentconfigs.Config{
		ID:               "external-config",
		SettingsMode:     externalagentconfigs.SettingsModeExplicitPath,
		SettingsFilePath: stringPtr(explicitConfigPath),
	}, "chat-1", root, map[string]any{
		"systemPrompt": "Runtime prompt",
	}, nil, false, nil)
	if err != nil {
		t.Fatalf("prepare codex home: %v", err)
	}

	runtimeConfigPayload, err := os.ReadFile(filepath.Join(runtimeHome, codexConfigFileName))
	if err != nil {
		t.Fatalf("read runtime codex config: %v", err)
	}
	runtimeConfig := map[string]any{}
	if err := toml.Unmarshal(runtimeConfigPayload, &runtimeConfig); err != nil {
		t.Fatalf("decode runtime codex config: %v", err)
	}
	if got := stringValue(runtimeConfig["developer_instructions"]); got != "Runtime prompt\n\nBase instructions" {
		t.Fatalf("expected merged developer instructions, got %q", got)
	}
	runtimeMCPServers, ok := mapValue(runtimeConfig["mcp_servers"])
	if !ok {
		t.Fatalf("expected runtime mcp_servers map, got %#v", runtimeConfig["mcp_servers"])
	}
	if _, ok := mapValue(runtimeMCPServers["explicit"]); !ok {
		t.Fatalf("expected explicit mcp server in runtime config, got %#v", runtimeMCPServers)
	}

	sourceConfigAfter, err := os.ReadFile(explicitConfigPath)
	if err != nil {
		t.Fatalf("read explicit codex config after prepare: %v", err)
	}
	if string(sourceConfigAfter) != string(sourceConfig) {
		t.Fatalf("expected explicit source config to stay unchanged, got %q", string(sourceConfigAfter))
	}
}

func TestCodexExecutorPrepareCodexHomeLeavesCanonicalConfigBytesUnchanged(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	configID := "external-config"
	canonicalConfigPath := filepath.Join(root, codexSettingsRootName, "codex", configID, codexConfigFileName)
	if err := os.MkdirAll(filepath.Dir(canonicalConfigPath), 0o755); err != nil {
		t.Fatalf("mkdir canonical config dir: %v", err)
	}
	canonicalConfig, err := toml.Marshal(map[string]any{
		"developer_instructions": "Canonical instructions",
		"model":                  "gpt-5",
	})
	if err != nil {
		t.Fatalf("encode canonical codex config: %v", err)
	}
	if err := os.WriteFile(canonicalConfigPath, canonicalConfig, 0o644); err != nil {
		t.Fatalf("write canonical codex config: %v", err)
	}

	executor := &CodexExecutor{
		settaFilesRoot: root,
	}
	_, err = executor.prepareCodexHome(externalagentconfigs.Config{
		ID:           configID,
		SettingsMode: externalagentconfigs.SettingsModeReadOnly,
	}, "chat-1", root, map[string]any{
		"systemPrompt": "Runtime prompt",
	}, nil, false, nil)
	if err != nil {
		t.Fatalf("prepare codex home: %v", err)
	}

	canonicalConfigAfter, err := os.ReadFile(canonicalConfigPath)
	if err != nil {
		t.Fatalf("read canonical codex config after prepare: %v", err)
	}
	if string(canonicalConfigAfter) != string(canonicalConfig) {
		t.Fatalf("expected canonical config bytes to stay unchanged, got %q", string(canonicalConfigAfter))
	}
}

func TestCodexExecutorPrepareCodexHomeDoesNotCreateMissingCanonicalConfigInManagedLocalNoEditMode(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	configID := "external-config"
	canonicalConfigPath := filepath.Join(root, codexSettingsRootName, "codex", configID, codexConfigFileName)

	executor := &CodexExecutor{
		settaFilesRoot: root,
	}
	runtimeHome, err := executor.prepareCodexHome(externalagentconfigs.Config{
		ID:                      configID,
		SettingsMode:            externalagentconfigs.SettingsModeManagedLocal,
		SettingsAllowSettaEdits: false,
	}, "chat-1", root, map[string]any{}, nil, false, nil)
	if err != nil {
		t.Fatalf("prepare codex home: %v", err)
	}

	if _, err := os.Stat(canonicalConfigPath); !os.IsNotExist(err) {
		t.Fatalf("expected canonical config to remain absent, stat err=%v", err)
	}
	if _, err := os.Stat(filepath.Join(runtimeHome, codexConfigFileName)); err != nil {
		t.Fatalf("expected session-scoped runtime config to exist, stat err=%v", err)
	}
}

func TestCodexExecutorPrepareCodexHomeRejectsCamelCaseMCPServersRootKey(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	explicitConfigPath := filepath.Join(root, "custom", "codex.toml")
	if err := os.MkdirAll(filepath.Dir(explicitConfigPath), 0o755); err != nil {
		t.Fatalf("mkdir explicit config dir: %v", err)
	}
	if err := os.WriteFile(explicitConfigPath, []byte("mcpServers = {}\n"), 0o644); err != nil {
		t.Fatalf("write explicit codex config: %v", err)
	}

	executor := &CodexExecutor{
		settaFilesRoot: root,
	}
	_, err := executor.prepareCodexHome(externalagentconfigs.Config{
		ID:               "external-config",
		SettingsMode:     externalagentconfigs.SettingsModeExplicitPath,
		SettingsFilePath: stringPtr(explicitConfigPath),
	}, "chat-1", root, map[string]any{}, nil, false, nil)
	if err == nil {
		t.Fatal("expected camel-case mcpServers root to be rejected")
	}
	if !strings.Contains(err.Error(), "mcp_servers") || !strings.Contains(err.Error(), "mcpServers") {
		t.Fatalf("expected camel-case rejection error to mention mcp_servers and mcpServers, got %v", err)
	}
}
