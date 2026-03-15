package externalagentconfigs

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	toml "github.com/pelletier/go-toml/v2"
)

func TestServiceCreateAppliesCodexDefaultsAndWritesCanonicalConfig(t *testing.T) {
	t.Parallel()

	_, service, settaFilesRoot, workspaceRoot := newExternalAgentConfigServiceTestFixture(t)

	created, err := service.Create(Config{
		ID:                 "codex-config",
		Name:               "Codex",
		ToolType:           ToolTypeCodex,
		RunMode:            RunModeAppServer,
		WorkingDirStrategy: WorkingDirStrategyProjectRoot,
	})
	if err != nil {
		t.Fatalf("create config: %v", err)
	}

	if created.ApprovalPolicy == nil || *created.ApprovalPolicy != "on-failure" {
		t.Fatalf("expected codex approval default, got %#v", created.ApprovalPolicy)
	}
	if created.SandboxPolicy == nil || *created.SandboxPolicy != "workspace-write" {
		t.Fatalf("expected codex sandbox default, got %#v", created.SandboxPolicy)
	}

	configPath := filepath.Join(settaFilesRoot, serviceSettingsRootName, "codex", created.ID, codexConfigFileName)
	content, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatalf("read codex config: %v", err)
	}
	payload := map[string]any{}
	if err := toml.Unmarshal(content, &payload); err != nil {
		t.Fatalf("decode codex config: %v", err)
	}
	if got := payload["approval_policy"]; got != "on-failure" {
		t.Fatalf("expected approval policy in payload, got %#v", payload)
	}
	if got := payload["sandbox_mode"]; got != "workspace-write" {
		t.Fatalf("expected sandbox mode in payload, got %#v", payload)
	}
	if got := payload["model_reasoning_summary"]; got != "none" {
		t.Fatalf("expected reasoning summary default, got %#v", payload)
	}
	mcpServers, ok := payload["mcp_servers"].(map[string]any)
	if !ok {
		t.Fatalf("expected mcp_servers map, got %#v", payload["mcp_servers"])
	}
	settaServer, ok := mcpServers["setta"].(map[string]any)
	if !ok {
		t.Fatalf("expected setta mcp server entry, got %#v", mcpServers)
	}
	if settaServer["url"] != "http://127.0.0.1:8000/mcp" {
		t.Fatalf("expected setta server url, got %#v", settaServer)
	}
	if _, err := os.Stat(filepath.Join(workspaceRoot, ".claude")); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("expected codex create not to touch shared claude settings, stat err=%v", err)
	}
}

func TestServiceCreateAppliesCodexOpenAIAuthDefaultsWhenOpenAIAPIKeyIsWhitelisted(t *testing.T) {
	t.Parallel()

	_, service, settaFilesRoot, _ := newExternalAgentConfigServiceTestFixture(t)

	created, err := service.Create(Config{
		ID:                 "codex-openai-auth-config",
		Name:               "Codex",
		ToolType:           ToolTypeCodex,
		RunMode:            RunModeAppServer,
		WorkingDirStrategy: WorkingDirStrategyProjectRoot,
		EnvVarWhitelist:    []string{"OPENAI_API_KEY"},
	})
	if err != nil {
		t.Fatalf("create config: %v", err)
	}

	configPath := filepath.Join(settaFilesRoot, serviceSettingsRootName, "codex", created.ID, codexConfigFileName)
	content, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatalf("read codex config: %v", err)
	}
	payload := map[string]any{}
	if err := toml.Unmarshal(content, &payload); err != nil {
		t.Fatalf("decode codex config: %v", err)
	}
	if got := payload["forced_login_method"]; got != "api" {
		t.Fatalf("expected forced login auth default, got %#v", payload)
	}
	if got := payload["preferred_auth_method"]; got != "apikey" {
		t.Fatalf("expected preferred auth default, got %#v", payload)
	}
	if got := payload["cli_auth_credentials_store"]; got != "file" {
		t.Fatalf("expected auth credential store default, got %#v", payload)
	}
	features, ok := payload["features"].(map[string]any)
	if !ok {
		t.Fatalf("expected auth feature payload, got %#v", payload["features"])
	}
	if got := features["remote_models"]; got != false {
		t.Fatalf("expected remote models to be disabled, got %#v", features)
	}
	if got := features["remote_compaction"]; got != false {
		t.Fatalf("expected remote compaction to be disabled, got %#v", features)
	}
	if got := payload["model_reasoning_summary"]; got != "none" {
		t.Fatalf("expected reasoning summary default to remain covered, got %#v", payload)
	}
}

func TestServiceCreateWritesOpenCodeCanonicalConfig(t *testing.T) {
	t.Parallel()

	_, service, settaFilesRoot, _ := newExternalAgentConfigServiceTestFixture(t)

	created, err := service.Create(Config{
		ID:                 "opencode-config",
		Name:               "OpenCode",
		ToolType:           ToolTypeOpenCode,
		RunMode:            RunModeSDK,
		WorkingDirStrategy: WorkingDirStrategyProjectRoot,
	})
	if err != nil {
		t.Fatalf("create config: %v", err)
	}
	if created.SettingsManagedBlock == nil || created.SettingsManagedBlock.OpenCode == nil {
		t.Fatalf("expected default opencode settings block, got %#v", created.SettingsManagedBlock)
	}

	configPath := filepath.Join(settaFilesRoot, serviceSettingsRootName, "opencode", created.ID, openCodeConfigFileName)
	content, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatalf("read opencode config: %v", err)
	}
	payload := map[string]any{}
	if err := json.Unmarshal(content, &payload); err != nil {
		t.Fatalf("decode opencode config: %v", err)
	}
	if !reflect.DeepEqual(payload["permission"], defaultOpenCodePermission()) {
		t.Fatalf("expected default permission payload, got %#v", payload["permission"])
	}
	mcpEntries, ok := payload["mcp"].(map[string]any)
	if !ok {
		t.Fatalf("expected opencode mcp payload, got %#v", payload["mcp"])
	}
	settaServer, ok := mcpEntries["setta"].(map[string]any)
	if !ok {
		t.Fatalf("expected setta mcp entry, got %#v", mcpEntries)
	}
	if settaServer["url"] != "http://127.0.0.1:8000/mcp" || settaServer["type"] != "remote" || settaServer["enabled"] != true {
		t.Fatalf("expected setta opencode mcp entry, got %#v", settaServer)
	}
}

func TestServiceCreatePreservesExistingCodexMCPServersWhenAddingSetta(t *testing.T) {
	t.Parallel()

	_, service, settaFilesRoot, _ := newExternalAgentConfigServiceTestFixture(t)

	created, err := service.Create(Config{
		ID:                 "codex-config",
		Name:               "Codex",
		ToolType:           ToolTypeCodex,
		RunMode:            RunModeAppServer,
		WorkingDirStrategy: WorkingDirStrategyProjectRoot,
		SettingsManagedBlock: &SettingsManagedBlock{
			Codex: map[string]any{
				"mcp_servers": map[string]any{
					"filesystem": map[string]any{
						"transport": "stdio",
						"command":   "npx @modelcontextprotocol/server-filesystem .",
					},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("create config: %v", err)
	}

	configPath := filepath.Join(settaFilesRoot, serviceSettingsRootName, "codex", created.ID, codexConfigFileName)
	content, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatalf("read codex config: %v", err)
	}
	payload := map[string]any{}
	if err := toml.Unmarshal(content, &payload); err != nil {
		t.Fatalf("decode codex config: %v", err)
	}
	mcpServers, ok := payload["mcp_servers"].(map[string]any)
	if !ok {
		t.Fatalf("expected mcp_servers map, got %#v", payload["mcp_servers"])
	}
	if _, ok := mcpServers["filesystem"].(map[string]any); !ok {
		t.Fatalf("expected existing filesystem mcp server to survive, got %#v", mcpServers)
	}
	settaServer, ok := mcpServers["setta"].(map[string]any)
	if !ok || settaServer["url"] != "http://127.0.0.1:8000/mcp" {
		t.Fatalf("expected normalized setta mcp server, got %#v", mcpServers)
	}
}

func TestServiceCreatePreservesExistingOpenCodeMCPServersWhenAddingSetta(t *testing.T) {
	t.Parallel()

	_, service, settaFilesRoot, _ := newExternalAgentConfigServiceTestFixture(t)

	created, err := service.Create(Config{
		ID:                 "opencode-config",
		Name:               "OpenCode",
		ToolType:           ToolTypeOpenCode,
		RunMode:            RunModeSDK,
		WorkingDirStrategy: WorkingDirStrategyProjectRoot,
		SettingsManagedBlock: &SettingsManagedBlock{
			OpenCode: &OpenCodeSettingsBlock{
				MCP: map[string]any{
					"filesystem": map[string]any{
						"type":    "stdio",
						"command": "npx @modelcontextprotocol/server-filesystem .",
					},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("create config: %v", err)
	}

	configPath := filepath.Join(settaFilesRoot, serviceSettingsRootName, "opencode", created.ID, openCodeConfigFileName)
	content, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatalf("read opencode config: %v", err)
	}
	payload := map[string]any{}
	if err := json.Unmarshal(content, &payload); err != nil {
		t.Fatalf("decode opencode config: %v", err)
	}
	mcpEntries, ok := payload["mcp"].(map[string]any)
	if !ok {
		t.Fatalf("expected mcp map, got %#v", payload["mcp"])
	}
	if _, ok := mcpEntries["filesystem"].(map[string]any); !ok {
		t.Fatalf("expected existing filesystem mcp entry to survive, got %#v", mcpEntries)
	}
	settaServer, ok := mcpEntries["setta"].(map[string]any)
	if !ok || settaServer["url"] != "http://127.0.0.1:8000/mcp" || settaServer["type"] != "remote" || settaServer["enabled"] != true {
		t.Fatalf("expected normalized setta mcp entry, got %#v", mcpEntries)
	}
}

func TestServiceCreateLeavesClaudeSharedSettingsRuntimeOwned(t *testing.T) {
	t.Parallel()

	_, service, _, workspaceRoot := newExternalAgentConfigServiceTestFixture(t)

	created, err := service.Create(Config{
		ID:                 "claude-config",
		Name:               "Claude",
		ToolType:           ToolTypeClaudeCode,
		RunMode:            RunModeSDK,
		SettingsMode:       SettingsModeManagedLocal,
		WorkingDirStrategy: WorkingDirStrategyProjectRoot,
	})
	if err != nil {
		t.Fatalf("create config: %v", err)
	}
	if created.SettingsManagedBlock == nil || created.SettingsManagedBlock.Claude == nil {
		t.Fatalf("expected default claude settings block, got %#v", created.SettingsManagedBlock)
	}
	sharedSettingsPath := filepath.Join(workspaceRoot, ".claude", "settings.local.json")
	if _, err := os.Stat(sharedSettingsPath); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("expected claude shared settings to remain runtime-owned, stat err=%v", err)
	}
}

func TestServiceUpdateCleansPreviousCanonicalArtifactsWhenToolTypeChanges(t *testing.T) {
	t.Parallel()

	_, service, settaFilesRoot, _ := newExternalAgentConfigServiceTestFixture(t)

	created, err := service.Create(Config{
		ID:                 "shared-config",
		Name:               "Codex",
		ToolType:           ToolTypeCodex,
		RunMode:            RunModeAppServer,
		WorkingDirStrategy: WorkingDirStrategyProjectRoot,
	})
	if err != nil {
		t.Fatalf("create config: %v", err)
	}

	updated, err := service.Update(Config{
		ID:                 created.ID,
		Name:               "OpenCode",
		ToolType:           ToolTypeOpenCode,
		RunMode:            RunModeSDK,
		WorkingDirStrategy: WorkingDirStrategyProjectRoot,
	})
	if err != nil {
		t.Fatalf("update config: %v", err)
	}
	if updated.ToolType != ToolTypeOpenCode {
		t.Fatalf("expected opencode config after update, got %#v", updated)
	}

	codexDir := filepath.Join(settaFilesRoot, serviceSettingsRootName, "codex", created.ID)
	if _, err := os.Stat(codexDir); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("expected old codex artifacts removed, stat err=%v", err)
	}
	openCodePath := filepath.Join(settaFilesRoot, serviceSettingsRootName, "opencode", created.ID, openCodeConfigFileName)
	if _, err := os.Stat(openCodePath); err != nil {
		t.Fatalf("expected new opencode config: %v", err)
	}
}

func TestServiceDeleteRemovesCanonicalArtifacts(t *testing.T) {
	t.Parallel()

	store, service, settaFilesRoot, _ := newExternalAgentConfigServiceTestFixture(t)

	created, err := service.Create(Config{
		ID:                 "delete-config",
		Name:               "OpenCode",
		ToolType:           ToolTypeOpenCode,
		RunMode:            RunModeSDK,
		WorkingDirStrategy: WorkingDirStrategyProjectRoot,
	})
	if err != nil {
		t.Fatalf("create config: %v", err)
	}
	if err := service.Delete(created.ID); err != nil {
		t.Fatalf("delete config: %v", err)
	}

	configs, err := store.List()
	if err != nil {
		t.Fatalf("list configs after delete: %v", err)
	}
	if len(configs) != 0 {
		t.Fatalf("expected deleted config to be removed from store, got %#v", configs)
	}
	configDir := filepath.Join(settaFilesRoot, serviceSettingsRootName, "opencode", created.ID)
	if _, err := os.Stat(configDir); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("expected canonical config dir removed, stat err=%v", err)
	}
}

func TestServiceCreateAndUpdateNormalizeEnvVarWhitelist(t *testing.T) {
	t.Parallel()

	store, service, _, _ := newExternalAgentConfigServiceTestFixture(t)

	// Create/update should both persist the same trimmed, blank-dropped,
	// deduped, sorted env whitelist contract that the external-agent routes
	// expose to the Project AI settings surface.
	created, err := service.Create(Config{
		ID:                 "normalized-whitelist",
		Name:               "Codex",
		ToolType:           ToolTypeCodex,
		RunMode:            RunModeAppServer,
		WorkingDirStrategy: WorkingDirStrategyProjectRoot,
		EnvVarWhitelist: []string{
			" OPENAI_API_KEY ",
			"",
			"ANTHROPIC_API_KEY",
			"OPENAI_API_KEY",
			"  ",
		},
	})
	if err != nil {
		t.Fatalf("create config: %v", err)
	}
	expectedCreate := []string{"ANTHROPIC_API_KEY", "OPENAI_API_KEY"}
	if !reflect.DeepEqual(created.EnvVarWhitelist, expectedCreate) {
		t.Fatalf("expected normalized create whitelist %#v, got %#v", expectedCreate, created.EnvVarWhitelist)
	}
	storedAfterCreate, err := store.Get(created.ID)
	if err != nil {
		t.Fatalf("get created config: %v", err)
	}
	if !reflect.DeepEqual(storedAfterCreate.EnvVarWhitelist, expectedCreate) {
		t.Fatalf("expected persisted create whitelist %#v, got %#v", expectedCreate, storedAfterCreate.EnvVarWhitelist)
	}

	updated, err := service.Update(Config{
		ID:                 created.ID,
		Name:               "Codex",
		ToolType:           ToolTypeCodex,
		RunMode:            RunModeAppServer,
		WorkingDirStrategy: WorkingDirStrategyProjectRoot,
		EnvVarWhitelist: []string{
			" ZETA_KEY ",
			"ALPHA_KEY",
			"ZETA_KEY",
			"",
		},
	})
	if err != nil {
		t.Fatalf("update config: %v", err)
	}
	expectedUpdate := []string{"ALPHA_KEY", "ZETA_KEY"}
	if !reflect.DeepEqual(updated.EnvVarWhitelist, expectedUpdate) {
		t.Fatalf("expected normalized update whitelist %#v, got %#v", expectedUpdate, updated.EnvVarWhitelist)
	}
	storedAfterUpdate, err := store.Get(created.ID)
	if err != nil {
		t.Fatalf("get updated config: %v", err)
	}
	if !reflect.DeepEqual(storedAfterUpdate.EnvVarWhitelist, expectedUpdate) {
		t.Fatalf("expected persisted update whitelist %#v, got %#v", expectedUpdate, storedAfterUpdate.EnvVarWhitelist)
	}
}

func TestServiceUpdateReturnsNotFound(t *testing.T) {
	t.Parallel()

	_, service, _, _ := newExternalAgentConfigServiceTestFixture(t)

	_, err := service.Update(Config{
		ID:                 "missing",
		Name:               "Missing",
		ToolType:           ToolTypeCodex,
		RunMode:            RunModeAppServer,
		WorkingDirStrategy: WorkingDirStrategyProjectRoot,
	})
	if !errors.Is(err, ErrConfigNotFound) {
		t.Fatalf("expected config not found, got %v", err)
	}
}

func newExternalAgentConfigServiceTestFixture(t *testing.T) (*Store, *Service, string, string) {
	t.Helper()

	workspaceRoot := t.TempDir()
	settaFilesRoot := filepath.Join(workspaceRoot, "setta_files")
	if err := os.MkdirAll(settaFilesRoot, 0o755); err != nil {
		t.Fatalf("mkdir setta files root: %v", err)
	}
	store, err := NewStore(settaFilesRoot)
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	service, err := NewService(ServiceOptions{
		Configs:        store,
		SettaFilesRoot: settaFilesRoot,
		SettaServerURL: "http://127.0.0.1:8000/mcp",
	})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}
	return store, service, settaFilesRoot, workspaceRoot
}
