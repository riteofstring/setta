package config

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

type testEnv map[string]string

func (e testEnv) lookup(key string) (string, bool) {
	value, ok := e[key]
	return value, ok
}

func TestEnsureUserConfigExistsWritesConfigJSONUnderSettaHome(t *testing.T) {
	t.Parallel()

	settaHome := filepath.Join(t.TempDir(), ".setta")
	if err := EnsureUserConfigExists(settaHome); err != nil {
		t.Fatalf("ensure user config exists: %v", err)
	}

	configPath := filepath.Join(settaHome, "config.json")
	if _, err := os.Stat(configPath); err != nil {
		t.Fatalf("stat config path %q: %v", configPath, err)
	}

	content, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatalf("read config path %q: %v", configPath, err)
	}

	var payload map[string]any
	if err := json.Unmarshal(content, &payload); err != nil {
		t.Fatalf("unmarshal config payload: %v", err)
	}

	if got := payload["autoMode"]; got != string(AutoModeCreateLocal) {
		t.Fatalf("expected autoMode %q, got %#v", AutoModeCreateLocal, got)
	}
	expectedBase := filepath.Join(settaHome, "setta_files")
	if got := payload["globalSettaFilesBase"]; got != expectedBase {
		t.Fatalf("expected globalSettaFilesBase %q, got %#v", expectedBase, got)
	}
}

func TestEnsureUserConfigExistsPreservesExistingConfigFile(t *testing.T) {
	t.Parallel()

	settaHome := filepath.Join(t.TempDir(), ".setta")
	if err := os.MkdirAll(settaHome, 0o755); err != nil {
		t.Fatalf("mkdir setta home: %v", err)
	}

	configPath := filepath.Join(settaHome, "config.json")
	expected := "{\"ok\":true}\n"
	if err := os.WriteFile(configPath, []byte(expected), 0o644); err != nil {
		t.Fatalf("write config path %q: %v", configPath, err)
	}

	if err := EnsureUserConfigExists(settaHome); err != nil {
		t.Fatalf("ensure user config exists: %v", err)
	}

	content, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatalf("read config path %q: %v", configPath, err)
	}
	if string(content) != expected {
		t.Fatalf("expected existing config file to stay unchanged, got %q", string(content))
	}
}

func TestEnsureUserConfigExistsRejectsDirectoryBackedConfigPath(t *testing.T) {
	t.Parallel()

	settaHome := filepath.Join(t.TempDir(), ".setta")
	configPath := filepath.Join(settaHome, "config.json")
	if err := os.MkdirAll(configPath, 0o755); err != nil {
		t.Fatalf("mkdir config path %q: %v", configPath, err)
	}

	err := EnsureUserConfigExists(settaHome)
	if err == nil {
		t.Fatal("expected directory-backed config path error")
	}
	if got := err.Error(); !strings.Contains(got, "Setta config path exists but is not a file") {
		t.Fatalf("expected non-file config path error, got %q", got)
	}
}

func TestEnsureUserConfigExistsReportsSettaHomeCreationFailure(t *testing.T) {
	t.Parallel()

	settaHome := filepath.Join(t.TempDir(), "not_a_dir")
	if err := os.WriteFile(settaHome, []byte("nope\n"), 0o644); err != nil {
		t.Fatalf("write file-backed setta home %q: %v", settaHome, err)
	}

	err := EnsureUserConfigExists(settaHome)
	if err == nil {
		t.Fatal("expected setta home creation failure")
	}
	if got := err.Error(); !strings.Contains(got, "Failed to create Setta home directory") {
		t.Fatalf("expected setta home creation failure, got %q", got)
	}
}

func TestLoadUserConfigUsesDefaultsWithoutCreatingFile(t *testing.T) {
	t.Parallel()

	settaHome := filepath.Join(t.TempDir(), ".setta")
	configPath := filepath.Join(settaHome, "config.json")

	cfg, err := loadUserConfig(settaHome)
	if err != nil {
		t.Fatalf("load user config: %v", err)
	}

	if cfg.AutoMode != AutoModeCreateLocal {
		t.Fatalf("expected default auto mode %q, got %q", AutoModeCreateLocal, cfg.AutoMode)
	}
	expectedBase := filepath.Join(settaHome, "setta_files")
	if cfg.GlobalSettaFilesBase != expectedBase {
		t.Fatalf("expected default global base %q, got %q", expectedBase, cfg.GlobalSettaFilesBase)
	}
	if _, err := os.Stat(configPath); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("expected config path %q to stay absent, stat err=%v", configPath, err)
	}
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

func TestLoadUserConfigResolvesRelativeGlobalSettaFilesBase(t *testing.T) {
	t.Parallel()

	settaHome := filepath.Join(t.TempDir(), ".setta")
	if err := os.MkdirAll(settaHome, 0o755); err != nil {
		t.Fatalf("mkdir setta home: %v", err)
	}

	writeUserConfig(t, settaHome, map[string]any{
		"globalSettaFilesBase": "state",
		"autoMode":             "create_local",
	})

	cfg, err := loadUserConfig(settaHome)
	if err != nil {
		t.Fatalf("load user config: %v", err)
	}

	expectedBase := filepath.Join(settaHome, "state")
	if cfg.GlobalSettaFilesBase != expectedBase {
		t.Fatalf("expected relative global base %q, got %q", expectedBase, cfg.GlobalSettaFilesBase)
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

func TestLoadUsesGlobalRootWhenAutoModeCreatesGlobal(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	workspaceRoot := filepath.Join(tmpDir, "workspace")
	settaHome := filepath.Join(tmpDir, ".setta")
	globalBase := filepath.Join(settaHome, "setta_files")
	expectedGlobalRoot := buildFilesRootFromBase(globalBase, workspaceRoot)

	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		t.Fatalf("mkdir workspace: %v", err)
	}
	if err := os.MkdirAll(settaHome, 0o755); err != nil {
		t.Fatalf("mkdir setta home: %v", err)
	}

	writeUserConfig(t, settaHome, map[string]any{
		"globalSettaFilesBase": globalBase,
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

	if cfg.Paths.SettaFilesRoot != expectedGlobalRoot {
		t.Fatalf("expected create_global root %q, got %q", expectedGlobalRoot, cfg.Paths.SettaFilesRoot)
	}
	if cfg.Paths.ResolvedFilesLocation != ResolvedFilesLocationGlobal {
		t.Fatalf("expected create_global files location, got %q", cfg.Paths.ResolvedFilesLocation)
	}
	if _, err := os.Stat(expectedGlobalRoot); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("expected create_global root to remain absent until caller creates it, stat err=%v", err)
	}
}

func TestLoadDefaultsToLocalSettaFilesRootAndRuntime(t *testing.T) {
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

	cfg, err := Load(LoadOptions{
		CWD:       tmpDir,
		EnvLookup: testEnv{}.lookup,
		CLI: CLIOptions{
			WorkspaceRoot: workspaceRoot,
			SettaHome:     settaHome,
		},
	})
	if err != nil {
		t.Fatalf("load config: %v", err)
	}

	expectedSettaFilesRoot := filepath.Join(workspaceRoot, "setta_files")
	if cfg.Paths.WorkspaceRoot != workspaceRoot {
		t.Fatalf("expected workspace root %q, got %q", workspaceRoot, cfg.Paths.WorkspaceRoot)
	}
	if cfg.Paths.SettaFilesRoot != expectedSettaFilesRoot {
		t.Fatalf("expected default local setta files root %q, got %q", expectedSettaFilesRoot, cfg.Paths.SettaFilesRoot)
	}
	if cfg.Paths.ResolvedFilesLocation != ResolvedFilesLocationLocal {
		t.Fatalf("expected default local files location, got %q", cfg.Paths.ResolvedFilesLocation)
	}
	expectedRuntimeRoot := filepath.Join(expectedSettaFilesRoot, "runtime")
	if cfg.Paths.RuntimeRoot != expectedRuntimeRoot {
		t.Fatalf("expected default runtime root %q, got %q", expectedRuntimeRoot, cfg.Paths.RuntimeRoot)
	}
}

func TestLoadTrimsWorkspaceRootEnv(t *testing.T) {
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

	cfg, err := Load(LoadOptions{
		CWD: tmpDir,
		EnvLookup: testEnv{
			WorkspaceRootEnv: "  " + workspaceRoot + "  ",
		}.lookup,
		CLI: CLIOptions{
			SettaHome: settaHome,
		},
	})
	if err != nil {
		t.Fatalf("load config with env workspace root: %v", err)
	}

	if cfg.Paths.WorkspaceRoot != workspaceRoot {
		t.Fatalf("expected trimmed env workspace root %q, got %q", workspaceRoot, cfg.Paths.WorkspaceRoot)
	}
}

func TestLoadUsesFilesLocationEnvGlobal(t *testing.T) {
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

	cfg, err := Load(LoadOptions{
		CWD: tmpDir,
		EnvLookup: testEnv{
			FilesLocationEnv: "global",
		}.lookup,
		CLI: CLIOptions{
			WorkspaceRoot: workspaceRoot,
			SettaHome:     settaHome,
		},
	})
	if err != nil {
		t.Fatalf("load config with env files location: %v", err)
	}

	expectedGlobalRoot := buildFilesRootFromBase(filepath.Join(settaHome, "setta_files"), workspaceRoot)
	if cfg.Paths.SettaFilesRoot != expectedGlobalRoot {
		t.Fatalf("expected global env setta files root %q, got %q", expectedGlobalRoot, cfg.Paths.SettaFilesRoot)
	}
	if cfg.Paths.ResolvedFilesLocation != ResolvedFilesLocationGlobal {
		t.Fatalf("expected global files location, got %q", cfg.Paths.ResolvedFilesLocation)
	}
	expectedRuntimeRoot := filepath.Join(expectedGlobalRoot, "runtime")
	if cfg.Paths.RuntimeRoot != expectedRuntimeRoot {
		t.Fatalf("expected runtime root %q, got %q", expectedRuntimeRoot, cfg.Paths.RuntimeRoot)
	}
}

func TestLoadTrimsFilesLocationEnvWhitespace(t *testing.T) {
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

	cfg, err := Load(LoadOptions{
		CWD: tmpDir,
		EnvLookup: testEnv{
			FilesLocationEnv: "  GLOBAL  ",
		}.lookup,
		CLI: CLIOptions{
			WorkspaceRoot: workspaceRoot,
			SettaHome:     settaHome,
		},
	})
	if err != nil {
		t.Fatalf("load config with whitespace-padded env files location: %v", err)
	}

	expectedGlobalRoot := buildFilesRootFromBase(filepath.Join(settaHome, "setta_files"), workspaceRoot)
	if cfg.Paths.SettaFilesRoot != expectedGlobalRoot {
		t.Fatalf("expected trimmed global env setta files root %q, got %q", expectedGlobalRoot, cfg.Paths.SettaFilesRoot)
	}
	if cfg.Paths.ResolvedFilesLocation != ResolvedFilesLocationGlobal {
		t.Fatalf("expected trimmed global files location, got %q", cfg.Paths.ResolvedFilesLocation)
	}
}

func TestLoadExplicitLocalLocationCanCreateRoot(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	workspaceRoot := filepath.Join(tmpDir, "workspace")
	settaHome := filepath.Join(tmpDir, ".setta")
	expectedLocalRoot := filepath.Join(workspaceRoot, "setta_files")

	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		t.Fatalf("mkdir workspace: %v", err)
	}
	if err := os.MkdirAll(settaHome, 0o755); err != nil {
		t.Fatalf("mkdir setta home: %v", err)
	}

	cfg, err := Load(LoadOptions{
		CWD:       tmpDir,
		EnvLookup: testEnv{}.lookup,
		CLI: CLIOptions{
			WorkspaceRoot:      workspaceRoot,
			SettaHome:          settaHome,
			SettaFilesLocation: "local",
		},
	})
	if err != nil {
		t.Fatalf("load config with explicit local files location: %v", err)
	}

	if cfg.Paths.SettaFilesRoot != expectedLocalRoot {
		t.Fatalf("expected explicit local root %q, got %q", expectedLocalRoot, cfg.Paths.SettaFilesRoot)
	}
	if cfg.Paths.ResolvedFilesLocation != ResolvedFilesLocationLocal {
		t.Fatalf("expected explicit local files location, got %q", cfg.Paths.ResolvedFilesLocation)
	}
	if _, err := os.Stat(expectedLocalRoot); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("expected explicit local root to remain absent until caller creates it, stat err=%v", err)
	}
	if err := os.MkdirAll(cfg.Paths.SettaFilesRoot, 0o755); err != nil {
		t.Fatalf("mkdir explicit local root: %v", err)
	}
	rootInfo, err := os.Stat(expectedLocalRoot)
	if err != nil {
		t.Fatalf("stat explicit local root after create: %v", err)
	}
	if !rootInfo.IsDir() {
		t.Fatalf("expected explicit local root %q to be a directory after caller creation", expectedLocalRoot)
	}
}

func TestLoadExplicitGlobalLocationCanCreateRoot(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	workspaceRoot := filepath.Join(tmpDir, "workspace")
	settaHome := filepath.Join(tmpDir, ".setta")
	expectedGlobalRoot := buildFilesRootFromBase(filepath.Join(settaHome, "setta_files"), workspaceRoot)

	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		t.Fatalf("mkdir workspace: %v", err)
	}
	if err := os.MkdirAll(settaHome, 0o755); err != nil {
		t.Fatalf("mkdir setta home: %v", err)
	}

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
		t.Fatalf("load config with explicit global files location: %v", err)
	}

	if cfg.Paths.SettaFilesRoot != expectedGlobalRoot {
		t.Fatalf("expected explicit global root %q, got %q", expectedGlobalRoot, cfg.Paths.SettaFilesRoot)
	}
	if cfg.Paths.ResolvedFilesLocation != ResolvedFilesLocationGlobal {
		t.Fatalf("expected explicit global files location, got %q", cfg.Paths.ResolvedFilesLocation)
	}
	if _, err := os.Stat(expectedGlobalRoot); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("expected explicit global root to remain absent until caller creates it, stat err=%v", err)
	}
	if _, err := os.Stat(filepath.Join(workspaceRoot, "setta_files")); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("expected workspace local root to stay absent when global location is explicit, stat err=%v", err)
	}
	if err := os.MkdirAll(cfg.Paths.SettaFilesRoot, 0o755); err != nil {
		t.Fatalf("mkdir explicit global root: %v", err)
	}
	rootInfo, err := os.Stat(expectedGlobalRoot)
	if err != nil {
		t.Fatalf("stat explicit global root after create: %v", err)
	}
	if !rootInfo.IsDir() {
		t.Fatalf("expected explicit global root %q to be a directory after caller creation", expectedGlobalRoot)
	}
	if _, err := os.Stat(filepath.Join(workspaceRoot, "setta_files")); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("expected workspace local root to remain absent after explicit global root creation, stat err=%v", err)
	}
}

func TestBuildFilesRootFromBaseSanitizesLeaf(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	workspaceRoot := filepath.Join(tmpDir, "___")
	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		t.Fatalf("mkdir workspace: %v", err)
	}

	result := BuildFilesRootFromBase(filepath.Join(tmpDir, "state"), workspaceRoot)
	if !strings.HasPrefix(filepath.Base(result), "workspace-") {
		t.Fatalf("expected sanitized leaf to start with workspace-, got %q", result)
	}
}

func TestBuildFilesRootFromBaseTruncatesLongWorkspaceNames(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	workspaceRoot := filepath.Join(tmpDir, strings.Repeat("a", 200))

	result := BuildFilesRootFromBase(filepath.Join(tmpDir, "state"), workspaceRoot)
	resultLeaf := filepath.Base(result)
	dashIndex := strings.LastIndex(resultLeaf, "-")
	if dashIndex <= 0 {
		t.Fatalf("expected hashed result leaf, got %q", resultLeaf)
	}
	prefix := resultLeaf[:dashIndex]
	if len(prefix) > 48 {
		t.Fatalf("expected truncated prefix length <= 48, got %d for %q", len(prefix), prefix)
	}

	sum := sha256.Sum256([]byte(canonicalWorkspaceRootForHash(workspaceRoot)))
	expectedSuffix := hex.EncodeToString(sum[:4])
	if !strings.HasSuffix(resultLeaf, "-"+expectedSuffix) {
		t.Fatalf("expected digest suffix %q, got %q", expectedSuffix, resultLeaf)
	}
}

func TestBuildFilesRootFromBaseUsesCanonicalWorkspacePath(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	baseRoot := filepath.Join(tmpDir, "state")
	realParent := filepath.Join(tmpDir, "real_parent")
	if err := os.MkdirAll(realParent, 0o755); err != nil {
		t.Fatalf("mkdir real parent: %v", err)
	}
	realWorkspace := filepath.Join(realParent, "workspace")
	if err := os.MkdirAll(realWorkspace, 0o755); err != nil {
		t.Fatalf("mkdir real workspace: %v", err)
	}

	aliasParent := filepath.Join(tmpDir, "alias_parent")
	if err := os.Symlink(realParent, aliasParent); err != nil {
		t.Skipf("symlink unsupported: %v", err)
	}
	aliasWorkspace := filepath.Join(aliasParent, "workspace")

	realRoot := BuildFilesRootFromBase(baseRoot, realWorkspace)
	aliasRoot := BuildFilesRootFromBase(baseRoot, aliasWorkspace)
	if realRoot != aliasRoot {
		t.Fatalf("expected canonicalized roots to match, got %q and %q", realRoot, aliasRoot)
	}
}

func TestLoadPrefersExistingLocalRootEvenWhenGlobalRequested(t *testing.T) {
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

	cfg, err := Load(LoadOptions{
		CWD: tmpDir,
		EnvLookup: testEnv{
			FilesLocationEnv: "global",
		}.lookup,
		CLI: CLIOptions{
			WorkspaceRoot: workspaceRoot,
			SettaHome:     settaHome,
		},
	})
	if err != nil {
		t.Fatalf("load config with existing local root and global request: %v", err)
	}

	if cfg.Paths.SettaFilesRoot != localRoot {
		t.Fatalf("expected existing local root %q, got %q", localRoot, cfg.Paths.SettaFilesRoot)
	}
	if cfg.Paths.ResolvedFilesLocation != ResolvedFilesLocationLocal {
		t.Fatalf("expected existing local root to win with local files location, got %q", cfg.Paths.ResolvedFilesLocation)
	}
}

func TestLoadRejectsInvalidFilesLocationEnv(t *testing.T) {
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
		CWD: tmpDir,
		EnvLookup: testEnv{
			FilesLocationEnv: "nope",
		}.lookup,
		CLI: CLIOptions{
			WorkspaceRoot: workspaceRoot,
			SettaHome:     settaHome,
		},
	})
	if err == nil {
		t.Fatal("expected invalid env files location error")
	}
	if got := err.Error(); !strings.Contains(got, `invalid setta files location "nope"`) {
		t.Fatalf("expected invalid env files location error, got %q", got)
	}
}

func TestLoadRejectsInvalidFilesLocationOverride(t *testing.T) {
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
		CWD:       tmpDir,
		EnvLookup: testEnv{}.lookup,
		CLI: CLIOptions{
			WorkspaceRoot:      workspaceRoot,
			SettaHome:          settaHome,
			SettaFilesLocation: "nope",
		},
	})
	if err == nil {
		t.Fatal("expected invalid explicit files location error")
	}
	if got := err.Error(); !strings.Contains(got, `invalid setta files location "nope"`) {
		t.Fatalf("expected invalid explicit files location error, got %q", got)
	}
}

func TestLoadNormalizesFilesLocationOverrideCaseAndWhitespace(t *testing.T) {
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

	cfg, err := Load(LoadOptions{
		CWD:       tmpDir,
		EnvLookup: testEnv{}.lookup,
		CLI: CLIOptions{
			WorkspaceRoot:      workspaceRoot,
			SettaHome:          settaHome,
			SettaFilesLocation: "  GLOBAL  ",
		},
	})
	if err != nil {
		t.Fatalf("load config with whitespace-padded explicit files location: %v", err)
	}

	expectedGlobalRoot := buildFilesRootFromBase(filepath.Join(settaHome, "setta_files"), workspaceRoot)
	if cfg.Paths.SettaFilesRoot != expectedGlobalRoot {
		t.Fatalf("expected normalized explicit global root %q, got %q", expectedGlobalRoot, cfg.Paths.SettaFilesRoot)
	}
	if cfg.Paths.ResolvedFilesLocation != ResolvedFilesLocationGlobal {
		t.Fatalf("expected normalized explicit global files location, got %q", cfg.Paths.ResolvedFilesLocation)
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
			SettaHomeEnv:         runtimeHome,
			ProfileLookupHomeEnv: lookupHome,
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

func TestLoadProfileRejectsUnknownProfile(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	settaHome := filepath.Join(tmpDir, ".setta")
	if err := os.MkdirAll(settaHome, 0o755); err != nil {
		t.Fatalf("mkdir setta home: %v", err)
	}

	_, err := loadProfile(settaHome, "missing")
	if err == nil {
		t.Fatal("expected unknown profile error")
	}
	if got := err.Error(); !strings.Contains(got, `unknown setta profile "missing"`) {
		t.Fatalf("expected unknown profile error, got %q", got)
	}
	var configErr *ConfigError
	if !errors.As(err, &configErr) {
		t.Fatalf("expected ConfigError, got %T: %v", err, err)
	}
	if configErr.Code != "UnknownSettaProfile" {
		t.Fatalf("expected UnknownSettaProfile, got %q", configErr.Code)
	}
}

func TestLoadProfileRejectsConflictingSettaFilesFields(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	settaHome := filepath.Join(tmpDir, ".setta")
	if err := os.MkdirAll(filepath.Join(settaHome, "profiles"), 0o755); err != nil {
		t.Fatalf("mkdir profiles: %v", err)
	}

	writeJSONFile(t, filepath.Join(settaHome, "profiles", "dev.json"), map[string]any{
		"name":               "dev",
		"settaFilesRoot":     filepath.Join(tmpDir, "state_dev"),
		"settaFilesLocation": "global",
	})

	_, err := loadProfile(settaHome, "dev")
	if err == nil {
		t.Fatal("expected conflicting setta files fields error")
	}
	if got := err.Error(); !strings.Contains(got, "settaFilesRoot") || !strings.Contains(got, "settaFilesLocation") {
		t.Fatalf("expected conflicting setta files fields error, got %q", got)
	}
}

func TestLoadProfileRejectsInvalidNameInPayload(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	settaHome := filepath.Join(tmpDir, ".setta")
	if err := os.MkdirAll(filepath.Join(settaHome, "profiles"), 0o755); err != nil {
		t.Fatalf("mkdir profiles: %v", err)
	}

	writeJSONFile(t, filepath.Join(settaHome, "profiles", "dev.json"), map[string]any{
		"name": "different",
	})

	_, err := loadProfile(settaHome, "dev")
	if err == nil {
		t.Fatal("expected profile name mismatch error")
	}
	if got := err.Error(); !strings.Contains(got, `profile name mismatch: expected "dev", got "different"`) {
		t.Fatalf("expected profile name mismatch error, got %q", got)
	}
}

func TestLoadProfileRejectsInvalidProfileName(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	settaHome := filepath.Join(tmpDir, ".setta")
	if err := os.MkdirAll(settaHome, 0o755); err != nil {
		t.Fatalf("mkdir setta home: %v", err)
	}

	_, err := loadProfile(settaHome, "../dev")
	if err == nil {
		t.Fatal("expected invalid profile name error")
	}
	if got := err.Error(); !strings.Contains(got, `invalid profile name "../dev"`) {
		t.Fatalf("expected invalid profile name error, got %q", got)
	}
}

func TestResolveSettaHomeUsesTrimmedEnvOverride(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	override := filepath.Join(tmpDir, ".setta")

	resolved, err := resolveSettaHome("", "", testEnv{
		SettaHomeEnv: "  " + override + "  ",
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
		SettaHomeEnv: "$SETTA_HOME_BASE/.setta-development",
	}.lookup)
	if err != nil {
		t.Fatalf("resolve setta home: %v", err)
	}

	expected := filepath.Join(base, ".setta-development")
	if resolved != expected {
		t.Fatalf("expected expanded env override %q, got %q", expected, resolved)
	}
}

func TestDefaultSettaHomeForUnixUsesDotSetta(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	home := filepath.Join(tmpDir, "home")

	resolved, err := defaultSettaHomeFor("linux", testEnv{
		SettaHomeEnv: filepath.Join(tmpDir, "ignored"),
	}.lookup, func() (string, error) {
		return home, nil
	})
	if err != nil {
		t.Fatalf("default setta home: %v", err)
	}

	expected := filepath.Join(home, ".setta")
	if resolved != expected {
		t.Fatalf("expected unix default setta home %q, got %q", expected, resolved)
	}
}
