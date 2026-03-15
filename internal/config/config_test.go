package config

import (
	"encoding/json"
	"log/slog"
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

func TestLoadExpandsEnvBackedGlobalSettaFilesBase(t *testing.T) {
	tmpDir := t.TempDir()
	workspaceRoot := filepath.Join(tmpDir, "workspace")
	settaHome := filepath.Join(tmpDir, ".setta")
	globalBase := filepath.Join(tmpDir, "setta_files")

	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		t.Fatalf("mkdir workspace: %v", err)
	}
	if err := os.MkdirAll(settaHome, 0o755); err != nil {
		t.Fatalf("mkdir setta home: %v", err)
	}
	if err := os.MkdirAll(globalBase, 0o755); err != nil {
		t.Fatalf("mkdir global base: %v", err)
	}

	t.Setenv("SETTA_GLOBAL_BASE", globalBase)
	writeUserConfig(t, settaHome, map[string]any{
		"globalSettaFilesBase": "$SETTA_GLOBAL_BASE",
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
		t.Fatalf("expected env-expanded global root %q, got %q", expectedGlobalRoot, cfg.Paths.SettaFilesRoot)
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

func TestLoadUsesGlobalSettaFilesRootWhenAutoModePrefersExistingGlobalRoot(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	workspaceRoot := filepath.Join(tmpDir, "workspace")
	settaHome := filepath.Join(tmpDir, ".setta")
	globalBase := filepath.Join(settaHome, "setta_files")
	globalRoot := buildFilesRootFromBase(globalBase, workspaceRoot)

	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		t.Fatalf("mkdir workspace: %v", err)
	}
	if err := os.MkdirAll(globalRoot, 0o755); err != nil {
		t.Fatalf("mkdir global root: %v", err)
	}

	writeUserConfig(t, settaHome, map[string]any{
		"globalSettaFilesBase": globalBase,
		"autoMode":             "use_global_if_present",
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

	if cfg.Paths.SettaFilesRoot != globalRoot {
		t.Fatalf("expected existing global root %q, got %q", globalRoot, cfg.Paths.SettaFilesRoot)
	}
	if cfg.Paths.ResolvedFilesLocation != ResolvedFilesLocationGlobal {
		t.Fatalf("expected global files location, got %q", cfg.Paths.ResolvedFilesLocation)
	}
}

func TestLoadFallsBackToLocalWhenAutoModeGlobalRootIsMissing(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	workspaceRoot := filepath.Join(tmpDir, "workspace")
	settaHome := filepath.Join(tmpDir, ".setta")
	localRoot := filepath.Join(workspaceRoot, "setta_files")

	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		t.Fatalf("mkdir workspace: %v", err)
	}
	if err := os.MkdirAll(settaHome, 0o755); err != nil {
		t.Fatalf("mkdir setta home: %v", err)
	}

	writeUserConfig(t, settaHome, map[string]any{
		"globalSettaFilesBase": filepath.Join(settaHome, "setta_files"),
		"autoMode":             "use_global_if_present",
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
		t.Fatalf("expected local fallback root %q, got %q", localRoot, cfg.Paths.SettaFilesRoot)
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

func TestLoadIgnoresProfileLookupHomeWithoutSelectedProfile(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	workspaceRoot := filepath.Join(tmpDir, "workspace")
	runtimeHome := filepath.Join(tmpDir, ".setta")
	lookupHome := filepath.Join(tmpDir, ".setta-development")

	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		t.Fatalf("mkdir workspace: %v", err)
	}
	if err := os.MkdirAll(runtimeHome, 0o755); err != nil {
		t.Fatalf("mkdir runtime home: %v", err)
	}
	if err := os.MkdirAll(lookupHome, 0o755); err != nil {
		t.Fatalf("mkdir lookup home: %v", err)
	}

	cfg, err := Load(LoadOptions{
		CWD: workspaceRoot,
		EnvLookup: testEnv{
			settaHomeEnv:         runtimeHome,
			profileLookupHomeEnv: lookupHome,
		}.lookup,
	})
	if err != nil {
		t.Fatalf("load config: %v", err)
	}

	if cfg.Paths.SettaHome != runtimeHome {
		t.Fatalf("expected runtime setta home %q, got %q", runtimeHome, cfg.Paths.SettaHome)
	}
	if cfg.Paths.ProfileLookupHome != runtimeHome {
		t.Fatalf("expected profile lookup home to follow runtime setta home %q, got %q", runtimeHome, cfg.Paths.ProfileLookupHome)
	}
}

func TestResolveSettaHomeUsesTrimmedEnvOverride(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	override := filepath.Join(tmpDir, ".setta")

	resolved, err := resolveSettaHome("", "", testEnv{
		settaHomeEnv: "  " + override + "  ",
	}.lookup)
	if err != nil {
		t.Fatalf("resolve setta home: %v", err)
	}

	if resolved != override {
		t.Fatalf("expected trimmed env override %q, got %q", override, resolved)
	}
}

func TestResolveSettaHomeExpandsEnvOverride(t *testing.T) {
	tmpDir := t.TempDir()
	base := filepath.Join(tmpDir, "base")
	t.Setenv("SETTA_HOME_BASE", base)

	resolved, err := resolveSettaHome("", "", testEnv{
		settaHomeEnv: "$SETTA_HOME_BASE/.setta-development",
	}.lookup)
	if err != nil {
		t.Fatalf("resolve setta home: %v", err)
	}

	expected := filepath.Join(base, ".setta-development")
	if resolved != expected {
		t.Fatalf("expected expanded env override %q, got %q", expected, resolved)
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

func TestLoadRejectsInvalidAutoModeInUserConfig(t *testing.T) {
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
		"autoMode": "not-a-mode",
	})

	_, err := Load(LoadOptions{
		CWD:       workspaceRoot,
		EnvLookup: testEnv{}.lookup,
		CLI: CLIOptions{
			WorkspaceRoot: workspaceRoot,
			SettaHome:     settaHome,
		},
	})
	if err == nil {
		t.Fatal("expected invalid autoMode error")
	}
	if err.Error() != "autoMode must be one of: create_local, use_global_if_present, create_global" {
		t.Fatalf("unexpected invalid autoMode error: %v", err)
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

func TestLoadLauncherModeDefaultsWorkspaceToHomeAndUsesGlobalSettaFiles(t *testing.T) {
	tmpDir := t.TempDir()
	homeDir := filepath.Join(tmpDir, "home")
	settaHome := filepath.Join(tmpDir, ".setta")
	if err := os.MkdirAll(homeDir, 0o755); err != nil {
		t.Fatalf("mkdir home: %v", err)
	}
	if err := os.MkdirAll(settaHome, 0o755); err != nil {
		t.Fatalf("mkdir setta home: %v", err)
	}

	writeUserConfig(t, settaHome, map[string]any{
		"globalSettaFilesBase": filepath.Join(settaHome, "setta_files"),
		"autoMode":             "create_local",
	})

	t.Setenv("HOME", homeDir)
	cfg, err := Load(LoadOptions{
		CWD:       tmpDir,
		EnvLookup: testEnv{}.lookup,
		CLI: CLIOptions{
			Mode:      "launcher",
			SettaHome: settaHome,
		},
	})
	if err != nil {
		t.Fatalf("load config: %v", err)
	}

	if cfg.Paths.WorkspaceRoot != homeDir {
		t.Fatalf("expected launcher workspace root %q, got %q", homeDir, cfg.Paths.WorkspaceRoot)
	}
	expectedGlobalRoot := buildFilesRootFromBase(filepath.Join(settaHome, "setta_files"), homeDir)
	if cfg.Paths.SettaFilesRoot != expectedGlobalRoot {
		t.Fatalf("expected launcher setta files root %q, got %q", expectedGlobalRoot, cfg.Paths.SettaFilesRoot)
	}
	if cfg.Paths.ResolvedFilesLocation != ResolvedFilesLocationGlobal {
		t.Fatalf("expected launcher files location global, got %q", cfg.Paths.ResolvedFilesLocation)
	}
}

func TestParsePortAllowsZero(t *testing.T) {
	t.Parallel()

	value, err := parsePort("0")
	if err != nil {
		t.Fatalf("parse port: %v", err)
	}
	if value != 0 {
		t.Fatalf("expected port 0, got %d", value)
	}
}

func TestParseLogLevelAcceptsCriticalAlias(t *testing.T) {
	t.Parallel()

	value, err := parseLogLevel("CRITICAL")
	if err != nil {
		t.Fatalf("parse log level: %v", err)
	}
	if value != slog.LevelError {
		t.Fatalf("expected critical alias to map to slog error level, got %d", value)
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
