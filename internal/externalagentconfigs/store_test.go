package externalagentconfigs

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestStoreRoundTripAndGet(t *testing.T) {
	t.Parallel()

	store, err := NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("new store: %v", err)
	}

	commandPath := "/usr/local/bin/codex"
	workingDir := "/tmp/work"
	model := "anthropic/claude-sonnet-4-5-20250929"
	if err := store.Write([]Config{
		{
			ID:                 "config-codex",
			Name:               "Codex",
			ToolType:           ToolTypeCodex,
			RunMode:            RunModeAppServer,
			CommandPath:        &commandPath,
			WorkingDirStrategy: WorkingDirStrategyCustom,
			WorkingDir:         &workingDir,
			SettingsSources: []ClaudeSettingsSource{
				ClaudeSettingsSourceProject,
				ClaudeSettingsSourceLocal,
			},
			SettingsManagedBlock: &SettingsManagedBlock{
				OpenCode: &OpenCodeSettingsManaged{
					Model: &model,
					Permission: map[string]any{
						"*": "ask",
					},
				},
			},
		},
	}); err != nil {
		t.Fatalf("write configs: %v", err)
	}

	configs, err := store.List()
	if err != nil {
		t.Fatalf("list configs: %v", err)
	}
	if len(configs) != 1 {
		t.Fatalf("expected one config, got %#v", configs)
	}
	if configs[0].ToolType != ToolTypeCodex {
		t.Fatalf("expected codex tool type, got %#v", configs[0])
	}

	config, err := store.Get("config-codex")
	if err != nil {
		t.Fatalf("get config: %v", err)
	}
	if config.CommandPath == nil || *config.CommandPath != commandPath {
		t.Fatalf("unexpected command path %#v", config.CommandPath)
	}
	if config.SettingsManagedBlock == nil || config.SettingsManagedBlock.OpenCode == nil {
		t.Fatalf("expected openCode settings block, got %#v", config.SettingsManagedBlock)
	}
	if config.SettingsManagedBlock.OpenCode.Model == nil || *config.SettingsManagedBlock.OpenCode.Model != model {
		t.Fatalf("unexpected openCode model %#v", config.SettingsManagedBlock.OpenCode)
	}
	if len(config.SettingsSources) != 2 {
		t.Fatalf("expected normalized settings sources, got %#v", config.SettingsSources)
	}
}

func TestStoreListReturnsEmptyWhenFileMissing(t *testing.T) {
	t.Parallel()

	store, err := NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("new store: %v", err)
	}

	// First-run workspaces intentionally surface empty config state instead of
	// seeding example external-agent definitions into a missing file.
	configs, err := store.List()
	if err != nil {
		t.Fatalf("list configs: %v", err)
	}
	if len(configs) != 0 {
		t.Fatalf("expected no configs, got %#v", configs)
	}
}

func TestStoreReturnsNotFound(t *testing.T) {
	t.Parallel()

	store, err := NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	_, err = store.Get("missing")
	if !errors.Is(err, ErrConfigNotFound) {
		t.Fatalf("expected config not found, got %v", err)
	}
}

func TestStoreRejectsInvalidPayload(t *testing.T) {
	t.Parallel()

	store, err := NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	if err := os.WriteFile(store.Path(), []byte(`{"id":"bad"}`), 0o644); err != nil {
		t.Fatalf("write invalid payload: %v", err)
	}
	if _, err := store.List(); err == nil {
		t.Fatal("expected store list error")
	}
}

func TestStoreRejectsPluginToolType(t *testing.T) {
	t.Parallel()

	store, err := NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("new store: %v", err)
	}

	// Plugin-backed adapters are intentionally not part of the Go-owned config surface.
	err = store.Write([]Config{
		{
			ID:       "plugin",
			Name:     "Plugin Adapter",
			ToolType: ToolType("plugin"),
			RunMode:  RunModeSDK,
		},
	})
	if err == nil || !strings.Contains(err.Error(), `toolType is invalid`) {
		t.Fatalf("expected invalid toolType error, got %v", err)
	}
}

func TestSystemCheckerRequiresOpenCodeCLIForSDKModeWithoutBaseURL(t *testing.T) {
	workspaceRoot := t.TempDir()
	binDir := t.TempDir()
	nodePath := filepath.Join(binDir, "node")
	if err := os.WriteFile(nodePath, []byte("#!/bin/sh\necho v20.0.0\n"), 0o755); err != nil {
		t.Fatalf("write fake node: %v", err)
	}
	t.Setenv("PATH", binDir)

	checker, err := NewSystemChecker(SystemCheckerOptions{WorkspaceRoot: workspaceRoot})
	if err != nil {
		t.Fatalf("new checker: %v", err)
	}
	status, err := checker.Check(Config{
		ID:       "opencode",
		Name:     "OpenCode",
		ToolType: ToolTypeOpenCode,
		RunMode:  RunModeSDK,
	})
	if err != nil {
		t.Fatalf("check opencode config: %v", err)
	}
	if status.Available {
		t.Fatalf("expected opencode sdk config to be unavailable, got %#v", status)
	}
	if !containsIssue(status.Issues, "opencode CLI not found") {
		t.Fatalf("expected missing opencode issue, got %#v", status.Issues)
	}
}

func containsIssue(issues []string, fragment string) bool {
	for _, issue := range issues {
		if strings.Contains(issue, fragment) {
			return true
		}
	}
	return false
}
