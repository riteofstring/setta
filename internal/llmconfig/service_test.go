package llmconfig

import (
	"os"
	"path/filepath"
	"testing"
)

func TestServiceSaveManagedAPIKeysUpdatesRuntimeWithConfiguredKeysOnly(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	runtime, err := NewRuntime(AllConfigs{
		Configs: map[string]Config{
			"openai-main": {
				ID:        "openai-main",
				Model:     "gpt-4o",
				Provider:  "openai",
				APIKeyEnv: "OPENAI_API_KEY",
			},
		},
		MCPServers: map[string]ServerConfig{},
	})
	if err != nil {
		t.Fatalf("new runtime: %v", err)
	}
	service, err := NewService(ServiceOptions{
		ConfigPath:         Path(root),
		ManagedAPIKeysPath: ManagedAPIKeysPath(root),
		Runtime:            runtime,
		ProcessEnv: func() map[string]string {
			return map[string]string{}
		},
	})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	snapshot, status := service.SaveManagedAPIKeys(map[string]string{
		"OPENAI_API_KEY":      "openai-secret",
		"UNSCOPED_CUSTOM_KEY": "custom-secret",
	}, 0)

	if status != ManagedAPIKeysWriteStatusSuccess {
		t.Fatalf("expected write success, got %q with snapshot %#v", status, snapshot)
	}
	if got := snapshot.APIKeys["OPENAI_API_KEY"]; got != "openai-secret" {
		t.Fatalf("expected openai key in snapshot, got %#v", snapshot)
	}
	if got := snapshot.APIKeys["UNSCOPED_CUSTOM_KEY"]; got != "custom-secret" {
		t.Fatalf("expected unscoped key in snapshot, got %#v", snapshot)
	}
	if runtimeKeys := runtime.APIKeys(); len(runtimeKeys) != 1 || runtimeKeys["OPENAI_API_KEY"] != "openai-secret" {
		t.Fatalf("expected runtime to keep configured keys only, got %#v", runtimeKeys)
	}
}

func TestServiceSaveManagedAPIKeysLeavesRuntimeUnchangedOnRevisionConflict(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	runtime, err := NewRuntime(AllConfigs{
		Configs: map[string]Config{
			"openai-main": {
				ID:        "openai-main",
				Model:     "gpt-4o",
				Provider:  "openai",
				APIKeyEnv: "OPENAI_API_KEY",
			},
		},
		MCPServers: map[string]ServerConfig{},
	})
	if err != nil {
		t.Fatalf("new runtime: %v", err)
	}
	service, err := NewService(ServiceOptions{
		ConfigPath:         Path(root),
		ManagedAPIKeysPath: ManagedAPIKeysPath(root),
		Runtime:            runtime,
		ProcessEnv: func() map[string]string {
			return map[string]string{}
		},
	})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	firstSnapshot, firstStatus := service.SaveManagedAPIKeys(map[string]string{
		"OPENAI_API_KEY": "initial-secret",
	}, 0)
	if firstStatus != ManagedAPIKeysWriteStatusSuccess {
		t.Fatalf("expected initial write success, got %q with snapshot %#v", firstStatus, firstSnapshot)
	}

	conflictSnapshot, conflictStatus := service.SaveManagedAPIKeys(map[string]string{
		"OPENAI_API_KEY": "stale-secret",
	}, 0)
	if conflictStatus != ManagedAPIKeysWriteStatusRevisionConflict {
		t.Fatalf("expected revision conflict, got %q with snapshot %#v", conflictStatus, conflictSnapshot)
	}
	if conflictSnapshot.ErrorCode == nil || *conflictSnapshot.ErrorCode != ManagedAPIKeysRevisionConflictErrorCode {
		t.Fatalf("expected revision conflict error code, got %#v", conflictSnapshot)
	}
	if conflictSnapshot.Revision != firstSnapshot.Revision {
		t.Fatalf("expected revision %d after conflict, got %#v", firstSnapshot.Revision, conflictSnapshot)
	}
	if runtimeKeys := runtime.APIKeys(); len(runtimeKeys) != 1 || runtimeKeys["OPENAI_API_KEY"] != "initial-secret" {
		t.Fatalf("expected runtime keys to stay unchanged after revision conflict, got %#v", runtimeKeys)
	}
}

func TestServiceSaveConfigRefreshesRuntimeKeysFromManagedStore(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	write := WriteManagedAPIKeysWithExpectedRevision(ManagedAPIKeysPath(root), map[string]string{
		"ANTHROPIC_API_KEY": "managed-secret",
	}, 0, nil)
	if write.Status != ManagedAPIKeysWriteStatusSuccess {
		t.Fatalf("seed managed api keys: %#v", write)
	}

	runtime, err := NewRuntime(AllConfigs{
		Configs:    map[string]Config{},
		MCPServers: map[string]ServerConfig{},
	})
	if err != nil {
		t.Fatalf("new runtime: %v", err)
	}
	service, err := NewService(ServiceOptions{
		ConfigPath:         Path(root),
		ManagedAPIKeysPath: ManagedAPIKeysPath(root),
		Runtime:            runtime,
		ProcessEnv: func() map[string]string {
			return map[string]string{}
		},
	})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	configs, snapshot, err := service.SaveConfig(AllConfigs{
		Configs: map[string]Config{
			"anthropic-main": {
				ID:        "anthropic-main",
				Model:     "claude-sonnet",
				Provider:  "anthropic",
				APIKeyEnv: "ANTHROPIC_API_KEY",
			},
		},
		MCPServers: map[string]ServerConfig{},
	})
	if err != nil {
		t.Fatalf("save config: %v", err)
	}

	if _, ok := configs.Configs["anthropic-main"]; !ok {
		t.Fatalf("expected saved config in runtime snapshot, got %#v", configs)
	}
	if got := runtime.APIKeys()["ANTHROPIC_API_KEY"]; got != "managed-secret" {
		t.Fatalf("expected runtime to refresh managed key on config save, got %#v", runtime.APIKeys())
	}
	if got := snapshot.APIKeys["ANTHROPIC_API_KEY"]; got != "managed-secret" {
		t.Fatalf("expected broadcast snapshot to include managed key, got %#v", snapshot)
	}
}

func TestServiceSaveConfigMergesProcessEnvKeysIntoSnapshot(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	runtime, err := NewRuntime(AllConfigs{
		Configs:    map[string]Config{},
		MCPServers: map[string]ServerConfig{},
	})
	if err != nil {
		t.Fatalf("new runtime: %v", err)
	}
	service, err := NewService(ServiceOptions{
		ConfigPath:         Path(root),
		ManagedAPIKeysPath: ManagedAPIKeysPath(root),
		Runtime:            runtime,
		ProcessEnv: func() map[string]string {
			return map[string]string{"ANTHROPIC_API_KEY": "process-secret"}
		},
	})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	_, snapshot, err := service.SaveConfig(AllConfigs{
		Configs: map[string]Config{
			"anthropic-main": {
				ID:        "anthropic-main",
				Model:     "claude-sonnet",
				Provider:  "anthropic",
				APIKeyEnv: "ANTHROPIC_API_KEY",
			},
		},
		MCPServers: map[string]ServerConfig{},
	})
	if err != nil {
		t.Fatalf("save config: %v", err)
	}

	if got := snapshot.APIKeys["ANTHROPIC_API_KEY"]; got != "process-secret" {
		t.Fatalf("expected effective snapshot to include process env key, got %#v", snapshot)
	}
	if got := runtime.APIKeys()["ANTHROPIC_API_KEY"]; got != "process-secret" {
		t.Fatalf("expected runtime to include process env key, got %#v", runtime.APIKeys())
	}
}

func TestServiceSaveConfigMergesWorkspaceDotEnvKeysIntoSnapshot(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	if err := os.WriteFile(
		ManagedAPIKeysPath(root),
		[]byte("ANTHROPIC_API_KEY=workspace-secret\n"),
		0o644,
	); err != nil {
		t.Fatalf("seed workspace .env: %v", err)
	}

	runtime, err := NewRuntime(AllConfigs{
		Configs:    map[string]Config{},
		MCPServers: map[string]ServerConfig{},
	})
	if err != nil {
		t.Fatalf("new runtime: %v", err)
	}
	service, err := NewService(ServiceOptions{
		ConfigPath:         Path(root),
		ManagedAPIKeysPath: ManagedAPIKeysPath(root),
		Runtime:            runtime,
		ProcessEnv: func() map[string]string {
			return map[string]string{}
		},
	})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	_, snapshot, err := service.SaveConfig(AllConfigs{
		Configs: map[string]Config{
			"anthropic-main": {
				ID:        "anthropic-main",
				Model:     "claude-sonnet",
				Provider:  "anthropic",
				APIKeyEnv: "ANTHROPIC_API_KEY",
			},
		},
		MCPServers: map[string]ServerConfig{},
	})
	if err != nil {
		t.Fatalf("save config: %v", err)
	}

	if got := snapshot.APIKeys["ANTHROPIC_API_KEY"]; got != "workspace-secret" {
		t.Fatalf("expected effective snapshot to include workspace .env key, got %#v", snapshot)
	}
	if got := runtime.APIKeys()["ANTHROPIC_API_KEY"]; got != "workspace-secret" {
		t.Fatalf("expected runtime to include workspace .env key, got %#v", runtime.APIKeys())
	}
}

func TestServiceManagedAPIKeysSnapshotUsesConfiguredLockRoot(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	runtimeRoot := filepath.Join(root, "setta_files_dev", "runtime")
	runtime, err := NewRuntime(AllConfigs{
		Configs: map[string]Config{
			"openai-main": {
				ID:        "openai-main",
				Model:     "gpt-4o",
				Provider:  "openai",
				APIKeyEnv: "OPENAI_API_KEY",
			},
		},
		MCPServers: map[string]ServerConfig{},
	})
	if err != nil {
		t.Fatalf("new runtime: %v", err)
	}
	service, err := NewService(ServiceOptions{
		ConfigPath:             Path(root),
		ManagedAPIKeysPath:     ManagedAPIKeysPath(root),
		ManagedAPIKeysLockRoot: runtimeRoot,
		Runtime:                runtime,
		ProcessEnv:             func() map[string]string { return map[string]string{} },
	})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	_, status := service.SaveManagedAPIKeys(map[string]string{
		"OPENAI_API_KEY": "saved-secret",
	}, 0)
	if status != ManagedAPIKeysWriteStatusSuccess {
		t.Fatalf("save managed api keys status: %q", status)
	}

	snapshot := service.ManagedAPIKeysSnapshot()
	if got := snapshot.APIKeys["OPENAI_API_KEY"]; got != "saved-secret" {
		t.Fatalf("expected managed key in snapshot, got %#v", snapshot)
	}
	if _, err := os.Stat(ManagedAPIKeysPath(root) + ".lock"); !os.IsNotExist(err) {
		t.Fatalf("expected no workspace .env.lock, got err=%v", err)
	}
	lockEntries, err := os.ReadDir(filepath.Join(runtimeRoot, managedAPIKeysLocksDirName))
	if err != nil {
		t.Fatalf("read runtime file lock dir: %v", err)
	}
	if len(lockEntries) == 0 {
		t.Fatal("expected runtime file lock to be created")
	}
}
