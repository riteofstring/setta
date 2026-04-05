package externalagentconfigs

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strings"
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
	if settaServer["transport"] != "streamable_http" {
		t.Fatalf("expected setta server transport streamable_http, got %#v", settaServer)
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
	if !ok || settaServer["transport"] != "streamable_http" || settaServer["url"] != "http://127.0.0.1:8000/mcp" {
		t.Fatalf("expected normalized setta mcp server, got %#v", mcpServers)
	}
}

func TestServiceReconcileManagedCanonicalConfigsRepairsLegacyCodexSettaTransport(t *testing.T) {
	t.Parallel()

	_, service, settaFilesRoot, _ := newExternalAgentConfigServiceTestFixture(t)

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

	configPath := filepath.Join(settaFilesRoot, serviceSettingsRootName, "codex", created.ID, codexConfigFileName)
	if err := os.WriteFile(configPath, []byte(strings.TrimSpace(`
[mcp_servers.setta]
url = "http://127.0.0.1:8000/mcp"
`)+"\n"), 0o644); err != nil {
		t.Fatalf("write legacy codex config: %v", err)
	}

	if err := service.ReconcileManagedCanonicalConfigs(); err != nil {
		t.Fatalf("reconcile managed canonical configs: %v", err)
	}

	payload := readCodexConfigPayload(t, configPath)
	mcpServers, ok := payload["mcp_servers"].(map[string]any)
	if !ok {
		t.Fatalf("expected mcp_servers map, got %#v", payload["mcp_servers"])
	}
	settaServer, ok := mcpServers["setta"].(map[string]any)
	if !ok || settaServer["transport"] != "streamable_http" || settaServer["url"] != "http://127.0.0.1:8000/mcp" {
		t.Fatalf("expected reconciled setta server entry, got %#v", mcpServers["setta"])
	}
}

func TestServiceCreateInitializesClaudeSharedSettingsForManagedModes(t *testing.T) {
	t.Parallel()

	_, service, _, workspaceRoot := newExternalAgentConfigServiceTestFixture(t)

	testCases := []struct {
		name         string
		configID     string
		settingsMode SettingsMode
		relativePath string
	}{
		{
			name:         "managed local",
			configID:     "claude-local-config",
			settingsMode: SettingsModeManagedLocal,
			relativePath: filepath.Join(".claude", "settings.local.json"),
		},
		{
			name:         "managed project",
			configID:     "claude-project-config",
			settingsMode: SettingsModeManagedProject,
			relativePath: filepath.Join(".claude", "settings.json"),
		},
	}

	for _, testCase := range testCases {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			created, err := service.Create(Config{
				ID:                 testCase.configID,
				Name:               "Claude",
				ToolType:           ToolTypeClaudeCode,
				RunMode:            RunModeSDK,
				SettingsMode:       testCase.settingsMode,
				WorkingDirStrategy: WorkingDirStrategyProjectRoot,
			})
			if err != nil {
				t.Fatalf("create config: %v", err)
			}
			if created.SettingsManagedBlock == nil || created.SettingsManagedBlock.Claude == nil {
				t.Fatalf("expected default claude settings block, got %#v", created.SettingsManagedBlock)
			}

			sharedSettingsPath := filepath.Join(workspaceRoot, testCase.relativePath)
			content, err := os.ReadFile(sharedSettingsPath)
			if err != nil {
				t.Fatalf("read claude shared settings: %v", err)
			}
			payload := map[string]any{}
			if err := json.Unmarshal(content, &payload); err != nil {
				t.Fatalf("decode claude shared settings: %v", err)
			}
			permissions, ok := payload["permissions"].(map[string]any)
			if !ok {
				t.Fatalf("expected managed permissions block, got %#v", payload)
			}
			allow, ok := permissions["allow"].([]any)
			if !ok || len(allow) == 0 {
				t.Fatalf("expected default allow rules, got %#v", permissions)
			}
		})
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
		Name:               "Claude",
		ToolType:           ToolTypeClaudeCode,
		RunMode:            RunModeSDK,
		WorkingDirStrategy: WorkingDirStrategyProjectRoot,
	})
	if err != nil {
		t.Fatalf("update config: %v", err)
	}
	if updated.ToolType != ToolTypeClaudeCode {
		t.Fatalf("expected claude config after update, got %#v", updated)
	}

	codexDir := filepath.Join(settaFilesRoot, serviceSettingsRootName, "codex", created.ID)
	if _, err := os.Stat(codexDir); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("expected old codex artifacts removed, stat err=%v", err)
	}
	claudePath := filepath.Join(settaFilesRoot, serviceSettingsRootName, "codex", created.ID)
	if _, err := os.Stat(claudePath); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("expected no new codex artifacts after switching away, stat err=%v", err)
	}
}

func TestServiceDeleteRemovesCanonicalArtifacts(t *testing.T) {
	t.Parallel()

	store, service, settaFilesRoot, _ := newExternalAgentConfigServiceTestFixture(t)

	created, err := service.Create(Config{
		ID:                 "delete-config",
		Name:               "Codex",
		ToolType:           ToolTypeCodex,
		RunMode:            RunModeAppServer,
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
	configDir := filepath.Join(settaFilesRoot, serviceSettingsRootName, "codex", created.ID)
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

func TestServiceCreateBootstrapsCodexUserMCPServersWhenMissing(t *testing.T) {
	// These tests depend on process env because the Codex user config loader
	// resolves CODEX_HOME / HOME at runtime.
	codexHome := filepath.Join(t.TempDir(), "codex-home")
	if err := os.MkdirAll(codexHome, 0o755); err != nil {
		t.Fatalf("mkdir codex home: %v", err)
	}
	t.Setenv("CODEX_HOME", codexHome)
	t.Setenv("HOME", t.TempDir())
	if err := os.WriteFile(filepath.Join(codexHome, codexConfigFileName), []byte(strings.TrimSpace(`
[mcp_servers.figma-desktop]
command = "figma"
args = ["mcp"]

[mcp_servers."foo.bar"]
url = "http://localhost:1234"
`)+"\n"), 0o644); err != nil {
		t.Fatalf("write codex home config: %v", err)
	}

	_, service, settaFilesRoot, _ := newExternalAgentConfigServiceTestFixture(t)
	created, err := service.Create(Config{
		ID:                 "codex-bootstrap",
		Name:               "Codex",
		ToolType:           ToolTypeCodex,
		RunMode:            RunModeAppServer,
		WorkingDirStrategy: WorkingDirStrategyProjectRoot,
	})
	if err != nil {
		t.Fatalf("create config: %v", err)
	}

	payload := readCodexConfigPayload(t, filepath.Join(settaFilesRoot, serviceSettingsRootName, "codex", created.ID, codexConfigFileName))
	mcpServers, ok := payload["mcp_servers"].(map[string]any)
	if !ok {
		t.Fatalf("expected mcp_servers map, got %#v", payload["mcp_servers"])
	}
	if _, ok := mcpServers["figma-desktop"].(map[string]any); !ok {
		t.Fatalf("expected imported figma-desktop server, got %#v", mcpServers)
	}
	fooBar, ok := mcpServers["foo.bar"].(map[string]any)
	if !ok || fooBar["url"] != "http://localhost:1234" {
		t.Fatalf("expected imported dotted server id, got %#v", mcpServers["foo.bar"])
	}
	if marker := payload[codexMCPImportedAtKey]; reflect.TypeOf(marker).Kind() != reflect.String {
		t.Fatalf("expected bootstrap marker string, got %#v", marker)
	}
}

func TestValidateCodexMCPServersPayloadDoesNotMutatePayload(t *testing.T) {
	t.Parallel()

	payload := map[string]any{
		"mcp_servers": map[string]any{
			"figma-desktop": map[string]any{
				"command": "figma",
				"args":    []any{"mcp"},
			},
		},
	}
	snapshot := cloneJSONMap(payload)

	if err := validateCodexMCPServersPayload(payload); err != nil {
		t.Fatalf("validate codex payload: %v", err)
	}
	if !reflect.DeepEqual(payload, snapshot) {
		t.Fatalf("expected validation to leave payload unchanged, got %#v", payload)
	}
}

func TestLoadCodexMCPServerPayloadsFromConfigDoesNotFallbackWhenExplicitCODEXHOMEMissingFile(t *testing.T) {
	codexHome := filepath.Join(t.TempDir(), "missing-codex-home")
	t.Setenv("CODEX_HOME", codexHome)
	homeDir := filepath.Join(t.TempDir(), "home")
	t.Setenv("HOME", homeDir)
	if err := os.MkdirAll(filepath.Join(homeDir, ".codex"), 0o755); err != nil {
		t.Fatalf("mkdir fallback home codex dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(homeDir, ".codex", codexConfigFileName), []byte(strings.TrimSpace(`
[mcp_servers.figma-desktop]
command = "figma"
args = ["mcp"]
`)+"\n"), 0o644); err != nil {
		t.Fatalf("write fallback home codex config: %v", err)
	}

	payloads := loadCodexMCPServerPayloadsFromConfig()
	if len(payloads) != 0 {
		t.Fatalf("expected explicit CODEX_HOME missing config to fail closed without HOME fallback, got %#v", payloads)
	}
}

func TestServiceCreateBootstrapsOnlyNonCollidingCanonicalCodexServerIDs(t *testing.T) {
	codexHome := filepath.Join(t.TempDir(), "codex-home")
	if err := os.MkdirAll(codexHome, 0o755); err != nil {
		t.Fatalf("mkdir codex home: %v", err)
	}
	t.Setenv("CODEX_HOME", codexHome)
	t.Setenv("HOME", t.TempDir())
	if err := os.WriteFile(filepath.Join(codexHome, codexConfigFileName), []byte(strings.TrimSpace(`
[mcp_servers.foo]
command = "alpha"

[mcp_servers." foo "]
command = "beta"

[mcp_servers.pencil]
command = "node"
args = ["pencil-mcp.js"]
`)+"\n"), 0o644); err != nil {
		t.Fatalf("write codex home config: %v", err)
	}

	_, service, settaFilesRoot, _ := newExternalAgentConfigServiceTestFixture(t)
	created, err := service.Create(Config{
		ID:                 "codex-canonical-collision",
		Name:               "Codex",
		ToolType:           ToolTypeCodex,
		RunMode:            RunModeAppServer,
		WorkingDirStrategy: WorkingDirStrategyProjectRoot,
	})
	if err != nil {
		t.Fatalf("create config: %v", err)
	}

	payload := readCodexConfigPayload(t, filepath.Join(settaFilesRoot, serviceSettingsRootName, "codex", created.ID, codexConfigFileName))
	mcpServers, ok := payload["mcp_servers"].(map[string]any)
	if !ok {
		t.Fatalf("expected mcp_servers map, got %#v", payload["mcp_servers"])
	}
	if _, ok := mcpServers["foo"]; ok {
		t.Fatalf("expected colliding canonical server id to be skipped, got %#v", mcpServers)
	}
	if _, ok := mcpServers["pencil"].(map[string]any); !ok {
		t.Fatalf("expected non-colliding canonical server id to remain, got %#v", mcpServers)
	}
	if marker, ok := payload[codexMCPImportedAtKey].(string); !ok || marker == "" {
		t.Fatalf("expected bootstrap marker when a non-colliding user server is imported, got %#v", payload[codexMCPImportedAtKey])
	}
}

func TestServiceCreateSkipsInvalidScalarTypedCodexHomeServersAndOmitsImportMarker(t *testing.T) {
	codexHome := filepath.Join(t.TempDir(), "codex-home")
	if err := os.MkdirAll(codexHome, 0o755); err != nil {
		t.Fatalf("mkdir codex home: %v", err)
	}
	t.Setenv("CODEX_HOME", codexHome)
	t.Setenv("HOME", t.TempDir())
	if err := os.WriteFile(filepath.Join(codexHome, codexConfigFileName), []byte(strings.TrimSpace(`
[mcp_servers]
figma-desktop = "figma"
`)+"\n"), 0o644); err != nil {
		t.Fatalf("write invalid codex home config: %v", err)
	}

	_, service, settaFilesRoot, _ := newExternalAgentConfigServiceTestFixture(t)
	created, err := service.Create(Config{
		ID:                 "codex-invalid-scalar-server",
		Name:               "Codex",
		ToolType:           ToolTypeCodex,
		RunMode:            RunModeAppServer,
		WorkingDirStrategy: WorkingDirStrategyProjectRoot,
	})
	if err != nil {
		t.Fatalf("create config: %v", err)
	}

	payload := readCodexConfigPayload(t, filepath.Join(settaFilesRoot, serviceSettingsRootName, "codex", created.ID, codexConfigFileName))
	if _, ok := payload[codexMCPImportedAtKey]; ok {
		t.Fatalf("expected invalid scalar-only user config to omit import marker, got %#v", payload[codexMCPImportedAtKey])
	}
	mcpServers, ok := payload["mcp_servers"].(map[string]any)
	if !ok {
		t.Fatalf("expected mcp_servers map, got %#v", payload["mcp_servers"])
	}
	if _, ok := mcpServers["figma-desktop"]; ok {
		t.Fatalf("expected invalid scalar-typed user server to be skipped, got %#v", mcpServers)
	}
	settaServer, ok := mcpServers["setta"].(map[string]any)
	if !ok || settaServer["url"] != "http://127.0.0.1:8000/mcp" {
		t.Fatalf("expected only the managed setta server to remain, got %#v", mcpServers)
	}
}

func TestServiceUpdateRetriesCodexUserMCPBootstrapAfterUserConfigIsFixed(t *testing.T) {
	codexHome := filepath.Join(t.TempDir(), "codex-home")
	if err := os.MkdirAll(codexHome, 0o755); err != nil {
		t.Fatalf("mkdir codex home: %v", err)
	}
	t.Setenv("CODEX_HOME", codexHome)
	t.Setenv("HOME", t.TempDir())
	configPath := filepath.Join(codexHome, codexConfigFileName)
	if err := os.WriteFile(configPath, []byte("[mcp_servers.invalid\n"), 0o644); err != nil {
		t.Fatalf("write invalid codex home config: %v", err)
	}

	_, service, settaFilesRoot, _ := newExternalAgentConfigServiceTestFixture(t)
	created, err := service.Create(Config{
		ID:                 "codex-bootstrap-retry",
		Name:               "Codex",
		ToolType:           ToolTypeCodex,
		RunMode:            RunModeAppServer,
		WorkingDirStrategy: WorkingDirStrategyProjectRoot,
	})
	if err != nil {
		t.Fatalf("create config: %v", err)
	}

	canonicalPath := filepath.Join(settaFilesRoot, serviceSettingsRootName, "codex", created.ID, codexConfigFileName)
	initialPayload := readCodexConfigPayload(t, canonicalPath)
	if _, ok := initialPayload[codexMCPImportedAtKey]; ok {
		t.Fatalf("expected no bootstrap marker after invalid user config, got %#v", initialPayload)
	}
	initialServers, ok := initialPayload["mcp_servers"].(map[string]any)
	if !ok {
		t.Fatalf("expected mcp_servers map, got %#v", initialPayload["mcp_servers"])
	}
	if _, ok := initialServers["figma-desktop"]; ok {
		t.Fatalf("expected invalid user config to fail closed, got %#v", initialServers)
	}

	if err := os.WriteFile(configPath, []byte(strings.TrimSpace(`
[mcp_servers.figma-desktop]
command = "figma"
args = ["mcp"]
`)+"\n"), 0o644); err != nil {
		t.Fatalf("write repaired codex home config: %v", err)
	}
	if _, err := service.Update(created); err != nil {
		t.Fatalf("update config after repair: %v", err)
	}

	updatedPayload := readCodexConfigPayload(t, canonicalPath)
	updatedServers, ok := updatedPayload["mcp_servers"].(map[string]any)
	if !ok {
		t.Fatalf("expected updated mcp_servers map, got %#v", updatedPayload["mcp_servers"])
	}
	if _, ok := updatedServers["figma-desktop"].(map[string]any); !ok {
		t.Fatalf("expected repaired user config to bootstrap on retry, got %#v", updatedServers)
	}
	if marker, ok := updatedPayload[codexMCPImportedAtKey].(string); !ok || marker == "" {
		t.Fatalf("expected bootstrap marker after retry, got %#v", updatedPayload[codexMCPImportedAtKey])
	}
}

func TestServiceUpdateKeepsUserRemovedImportedCodexServersRemoved(t *testing.T) {
	codexHome := filepath.Join(t.TempDir(), "codex-home")
	if err := os.MkdirAll(codexHome, 0o755); err != nil {
		t.Fatalf("mkdir codex home: %v", err)
	}
	t.Setenv("CODEX_HOME", codexHome)
	t.Setenv("HOME", t.TempDir())
	if err := os.WriteFile(filepath.Join(codexHome, codexConfigFileName), []byte(strings.TrimSpace(`
[mcp_servers.figma-desktop]
command = "figma"
args = ["mcp"]
`)+"\n"), 0o644); err != nil {
		t.Fatalf("write codex home config: %v", err)
	}

	_, service, settaFilesRoot, _ := newExternalAgentConfigServiceTestFixture(t)
	created, err := service.Create(Config{
		ID:                 "codex-removed-server",
		Name:               "Codex",
		ToolType:           ToolTypeCodex,
		RunMode:            RunModeAppServer,
		WorkingDirStrategy: WorkingDirStrategyProjectRoot,
	})
	if err != nil {
		t.Fatalf("create config: %v", err)
	}

	canonicalPath := filepath.Join(settaFilesRoot, serviceSettingsRootName, "codex", created.ID, codexConfigFileName)
	initialPayload := readCodexConfigPayload(t, canonicalPath)
	initialMarker, ok := initialPayload[codexMCPImportedAtKey].(string)
	if !ok || initialMarker == "" {
		t.Fatalf("expected initial bootstrap marker, got %#v", initialPayload[codexMCPImportedAtKey])
	}
	updatedCanonical := map[string]any{
		codexMCPImportedAtKey: initialMarker,
		"mcp_servers": map[string]any{
			"setta": map[string]any{
				"url": "http://127.0.0.1:8000/mcp",
			},
		},
	}
	content, err := toml.Marshal(updatedCanonical)
	if err != nil {
		t.Fatalf("encode canonical codex config: %v", err)
	}
	if err := os.WriteFile(canonicalPath, content, 0o644); err != nil {
		t.Fatalf("write canonical codex config: %v", err)
	}

	if _, err := service.Update(created); err != nil {
		t.Fatalf("update config after user removal: %v", err)
	}

	finalPayload := readCodexConfigPayload(t, canonicalPath)
	finalServers, ok := finalPayload["mcp_servers"].(map[string]any)
	if !ok {
		t.Fatalf("expected final mcp_servers map, got %#v", finalPayload["mcp_servers"])
	}
	if _, ok := finalServers["figma-desktop"]; ok {
		t.Fatalf("expected removed imported server to stay removed, got %#v", finalServers)
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
		WorkspaceRoot:  workspaceRoot,
		SettaServerURL: "http://127.0.0.1:8000/mcp",
	})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}
	return store, service, settaFilesRoot, workspaceRoot
}

func readCodexConfigPayload(t *testing.T, path string) map[string]any {
	t.Helper()

	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read codex config: %v", err)
	}
	payload := map[string]any{}
	if err := toml.Unmarshal(content, &payload); err != nil {
		t.Fatalf("decode codex config: %v", err)
	}
	return payload
}
