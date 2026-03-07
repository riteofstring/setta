package config

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

type testEnv map[string]string

func (e testEnv) lookup(key string) (string, bool) {
	value, ok := e[key]
	return value, ok
}

func TestLoadResolvesGlobalSettaFilesLocation(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	workspaceRoot := filepath.Join(tmpDir, "workspace")
	settaHome := filepath.Join(tmpDir, ".setta")
	globalBase := filepath.Join(settaHome, "setta_files")

	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		t.Fatalf("mkdir workspace: %v", err)
	}
	if err := os.MkdirAll(settaHome, 0o755); err != nil {
		t.Fatalf("mkdir setta home: %v", err)
	}

	writeUserConfig(t, settaHome, map[string]any{
		"globalSettaFilesBase": globalBase,
		"autoMode":             "create_local",
	})

	cfg, err := Load(LoadOptions{
		CWD:       tmpDir,
		EnvLookup: testEnv{}.lookup,
		CLI: CLIOptions{
			WorkspaceRoot:      workspaceRoot,
			SettaHome:          settaHome,
			SettaFilesLocation: "global",
		},
	})
	if err != nil {
		t.Fatalf("load config: %v", err)
	}

	expectedGlobalRoot := buildFilesRootFromBase(globalBase, workspaceRoot)
	if cfg.Paths.SettaFilesRoot != expectedGlobalRoot {
		t.Fatalf("expected global root %q, got %q", expectedGlobalRoot, cfg.Paths.SettaFilesRoot)
	}
	if cfg.Paths.ResolvedFilesLocation != ResolvedFilesLocationGlobal {
		t.Fatalf("expected global files location, got %q", cfg.Paths.ResolvedFilesLocation)
	}
	if cfg.Paths.ActiveSettaFilesLocation() != "global" {
		t.Fatalf("expected active files location global, got %q", cfg.Paths.ActiveSettaFilesLocation())
	}
}

func TestLoadPrefersExistingLocalSettaFilesRoot(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	workspaceRoot := filepath.Join(tmpDir, "workspace")
	settaHome := filepath.Join(tmpDir, ".setta")
	localRoot := filepath.Join(workspaceRoot, "setta_files")

	if err := os.MkdirAll(localRoot, 0o755); err != nil {
		t.Fatalf("mkdir local root: %v", err)
	}
	if err := os.MkdirAll(settaHome, 0o755); err != nil {
		t.Fatalf("mkdir setta home: %v", err)
	}

	writeUserConfig(t, settaHome, map[string]any{
		"globalSettaFilesBase": filepath.Join(settaHome, "setta_files"),
		"autoMode":             "create_global",
	})

	cfg, err := Load(LoadOptions{
		CWD:       workspaceRoot,
		EnvLookup: testEnv{}.lookup,
		CLI: CLIOptions{
			WorkspaceRoot: workspaceRoot,
			SettaHome:     settaHome,
		},
	})
	if err != nil {
		t.Fatalf("load config: %v", err)
	}

	if cfg.Paths.SettaFilesRoot != localRoot {
		t.Fatalf("expected local root %q, got %q", localRoot, cfg.Paths.SettaFilesRoot)
	}
	if cfg.Paths.ResolvedFilesLocation != ResolvedFilesLocationLocal {
		t.Fatalf("expected local files location, got %q", cfg.Paths.ResolvedFilesLocation)
	}
}

func TestLoadPreservesProfileLookupHomeWhenProfileOverridesRuntimeHome(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	workspaceRoot := filepath.Join(tmpDir, "workspace")
	lookupHome := filepath.Join(tmpDir, ".setta")
	runtimeHome := filepath.Join(tmpDir, ".setta-development")

	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		t.Fatalf("mkdir workspace: %v", err)
	}
	if err := os.MkdirAll(filepath.Join(lookupHome, "profiles"), 0o755); err != nil {
		t.Fatalf("mkdir profiles: %v", err)
	}

	writeJSONFile(t, filepath.Join(lookupHome, "profiles", "dev.json"), map[string]any{
		"name":               "dev",
		"workspaceRoot":      workspaceRoot,
		"settaHome":          runtimeHome,
		"settaFilesLocation": "local",
	})

	cfg, err := Load(LoadOptions{
		CWD:       tmpDir,
		EnvLookup: testEnv{}.lookup,
		CLI: CLIOptions{
			ProfileLookupHome: lookupHome,
			Profile:           "dev",
		},
	})
	if err != nil {
		t.Fatalf("load config: %v", err)
	}

	if cfg.Paths.ProfileLookupHome != lookupHome {
		t.Fatalf("expected profile lookup home %q, got %q", lookupHome, cfg.Paths.ProfileLookupHome)
	}
	if cfg.Paths.SettaHome != runtimeHome {
		t.Fatalf("expected runtime setta home %q, got %q", runtimeHome, cfg.Paths.SettaHome)
	}
	if cfg.Paths.ProfileName != "dev" {
		t.Fatalf("expected profile name dev, got %q", cfg.Paths.ProfileName)
	}
}

func TestLoadRejectsConflictingSettaFilesFlags(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	workspaceRoot := filepath.Join(tmpDir, "workspace")
	settaHome := filepath.Join(tmpDir, ".setta")
	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		t.Fatalf("mkdir workspace: %v", err)
	}
	if err := os.MkdirAll(settaHome, 0o755); err != nil {
		t.Fatalf("mkdir setta home: %v", err)
	}

	_, err := Load(LoadOptions{
		CWD:       workspaceRoot,
		EnvLookup: testEnv{}.lookup,
		CLI: CLIOptions{
			WorkspaceRoot:      workspaceRoot,
			SettaHome:          settaHome,
			SettaFilesRoot:     filepath.Join(tmpDir, "setta_files_dev"),
			SettaFilesLocation: "local",
		},
	})
	if err == nil {
		t.Fatal("expected conflict error")
	}
}

func TestLoadRejectsMissingWorkspace(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	settaHome := filepath.Join(tmpDir, ".setta")
	if err := os.MkdirAll(settaHome, 0o755); err != nil {
		t.Fatalf("mkdir setta home: %v", err)
	}

	_, err := Load(LoadOptions{
		CWD:       tmpDir,
		EnvLookup: testEnv{}.lookup,
		CLI: CLIOptions{
			WorkspaceRoot: filepath.Join(tmpDir, "missing"),
			SettaHome:     settaHome,
		},
	})
	if err == nil {
		t.Fatal("expected missing workspace error")
	}
}

func TestLoadDerivesDeploymentRuntimeRootInShareMode(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	workspaceRoot := filepath.Join(tmpDir, "workspace")
	settaHome := filepath.Join(tmpDir, ".setta")
	deploymentRoot := filepath.Join(tmpDir, "deployments", "demo-share", "v2")

	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		t.Fatalf("mkdir workspace: %v", err)
	}
	if err := os.MkdirAll(settaHome, 0o755); err != nil {
		t.Fatalf("mkdir setta home: %v", err)
	}

	writeUserConfig(t, settaHome, map[string]any{
		"globalSettaFilesBase": filepath.Join(settaHome, "setta_files"),
		"autoMode":             "create_local",
	})
	writeJSONFile(t, filepath.Join(deploymentRoot, "manifest.json"), map[string]any{
		"version":                1,
		"deploymentName":         "demo-share",
		"deploymentType":         "share",
		"defaultProjectConfigId": "project-alpha",
		"deploymentVersion":      "v2",
	})

	cfg, err := Load(LoadOptions{
		CWD:       workspaceRoot,
		EnvLookup: testEnv{}.lookup,
		CLI: CLIOptions{
			WorkspaceRoot:  workspaceRoot,
			SettaHome:      settaHome,
			Mode:           "share",
			DeploymentRoot: deploymentRoot,
		},
	})
	if err != nil {
		t.Fatalf("load config: %v", err)
	}

	if cfg.Paths.DeploymentRoot != deploymentRoot {
		t.Fatalf("expected deployment root %q, got %q", deploymentRoot, cfg.Paths.DeploymentRoot)
	}
	expectedRuntimeRoot := filepath.Join(tmpDir, "deployment_runtime", "demo-share", "v2")
	if cfg.Paths.RuntimeRoot != expectedRuntimeRoot {
		t.Fatalf("expected runtime root %q, got %q", expectedRuntimeRoot, cfg.Paths.RuntimeRoot)
	}
}

func TestLoadRejectsMissingDeploymentRootInShareMode(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	workspaceRoot := filepath.Join(tmpDir, "workspace")
	settaHome := filepath.Join(tmpDir, ".setta")

	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		t.Fatalf("mkdir workspace: %v", err)
	}
	if err := os.MkdirAll(settaHome, 0o755); err != nil {
		t.Fatalf("mkdir setta home: %v", err)
	}

	writeUserConfig(t, settaHome, map[string]any{
		"globalSettaFilesBase": filepath.Join(settaHome, "setta_files"),
		"autoMode":             "create_local",
	})

	_, err := Load(LoadOptions{
		CWD:       workspaceRoot,
		EnvLookup: testEnv{}.lookup,
		CLI: CLIOptions{
			WorkspaceRoot: workspaceRoot,
			SettaHome:     settaHome,
			Mode:          "share",
		},
	})
	if err == nil {
		t.Fatal("expected missing deployment root error")
	}
}

func writeUserConfig(t *testing.T, settaHome string, payload map[string]any) {
	t.Helper()
	writeJSONFile(t, filepath.Join(settaHome, "config.json"), payload)
}

func writeJSONFile(t *testing.T, path string, payload map[string]any) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir parent: %v", err)
	}
	content, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		t.Fatalf("marshal json: %v", err)
	}
	content = append(content, '\n')
	if err := os.WriteFile(path, content, 0o644); err != nil {
		t.Fatalf("write json file: %v", err)
	}
}
