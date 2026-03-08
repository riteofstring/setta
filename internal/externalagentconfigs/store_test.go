package externalagentconfigs

import (
	"errors"
	"os"
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
	if err := store.Write([]Config{
		{
			ID:                 "config-codex",
			Name:               "Codex",
			ToolType:           ToolTypeCodex,
			RunMode:            RunModeAppServer,
			CommandPath:        &commandPath,
			WorkingDirStrategy: WorkingDirStrategyCustom,
			WorkingDir:         &workingDir,
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

func TestSystemCheckerReportsUnsupportedPluginConfig(t *testing.T) {
	t.Parallel()

	checker, err := NewSystemChecker(SystemCheckerOptions{WorkspaceRoot: t.TempDir()})
	if err != nil {
		t.Fatalf("new checker: %v", err)
	}
	status, err := checker.Check(Config{
		ID:       "plugin",
		Name:     "Plugin",
		ToolType: ToolTypePlugin,
		RunMode:  RunModeSDK,
	})
	if err != nil {
		t.Fatalf("check plugin config: %v", err)
	}
	if status.Supported {
		t.Fatalf("expected plugin config to be unsupported, got %#v", status)
	}
	if status.Available {
		t.Fatalf("expected plugin config to be unavailable, got %#v", status)
	}
}
