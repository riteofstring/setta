package config

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log/slog"
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
			workspaceRootEnv: "  " + workspaceRoot + "  ",
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
			filesLocationEnv: "global",
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
			filesLocationEnv: "  GLOBAL  ",
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
			filesLocationEnv: "global",
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
			filesLocationEnv: "nope",
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

func TestDefaultSettaHomeForUnixUsesDotSetta(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	home := filepath.Join(tmpDir, "home")

	resolved, err := defaultSettaHomeFor("linux", testEnv{
		settaHomeEnv: filepath.Join(tmpDir, "ignored"),
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

func TestDefaultSettaHomeForWindowsUsesAppData(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	appData := filepath.Join(tmpDir, "AppData", "Roaming")

	resolved, err := defaultSettaHomeFor("windows", testEnv{
		"APPDATA": appData,
	}.lookup, func() (string, error) {
		t.Fatal("expected APPDATA branch without home fallback")
		return "", nil
	})
	if err != nil {
		t.Fatalf("default setta home: %v", err)
	}

	expected := filepath.Join(appData, ".setta")
	if resolved != expected {
		t.Fatalf("expected windows APPDATA setta home %q, got %q", expected, resolved)
	}
}

func TestDefaultSettaHomeForWindowsFallsBackToHomeRoaming(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	home := filepath.Join(tmpDir, "home")

	resolved, err := defaultSettaHomeFor("windows", testEnv{}.lookup, func() (string, error) {
		return home, nil
	})
	if err != nil {
		t.Fatalf("default setta home: %v", err)
	}

	expected := filepath.Join(home, "AppData", "Roaming", ".setta")
	if resolved != expected {
		t.Fatalf("expected windows fallback setta home %q, got %q", expected, resolved)
	}
}

func TestValidateSettaHomeNameRejectsNonstandardLeaf(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	invalidHome := filepath.Join(tmpDir, "custom-home")

	err := validateSettaHomeName(invalidHome, "Setta home")
	if err == nil {
		t.Fatal("expected invalid setta home name error")
	}
	if got := err.Error(); !strings.Contains(got, ".setta") || !strings.Contains(got, ".setta-development") {
		t.Fatalf("expected canonical setta home names in error, got %q", got)
	}
	var configErr *ConfigError
	if !errors.As(err, &configErr) {
		t.Fatalf("expected ConfigError, got %T: %v", err, err)
	}
	if configErr.Code != "InvalidSettaHome" {
		t.Fatalf("expected InvalidSettaHome, got %q", configErr.Code)
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
	var configErr *ConfigError
	if !errors.As(err, &configErr) {
		t.Fatalf("expected ConfigError, got %T: %v", err, err)
	}
	if configErr.Code != "InvalidSettaFilesConfig" {
		t.Fatalf("expected InvalidSettaFilesConfig, got %q", configErr.Code)
	}
	if !strings.Contains(configErr.Message, "cannot use --setta-files-root together with --setta-files-location") {
		t.Fatalf("expected conflicting setta-files flag detail, got %q", configErr.Message)
	}
}

func TestLoadPrefersExplicitSettaFilesRootOverExistingLocalRoot(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	workspaceRoot := filepath.Join(tmpDir, "workspace")
	settaHome := filepath.Join(tmpDir, ".setta")
	localRoot := filepath.Join(workspaceRoot, "setta_files")
	explicitRoot := filepath.Join(tmpDir, "state", "setta_files_dev")

	for _, path := range []string{localRoot, explicitRoot, settaHome} {
		if err := os.MkdirAll(path, 0o755); err != nil {
			t.Fatalf("mkdir %q: %v", path, err)
		}
	}

	cfg, err := Load(LoadOptions{
		CWD:       workspaceRoot,
		EnvLookup: testEnv{}.lookup,
		CLI: CLIOptions{
			WorkspaceRoot:  workspaceRoot,
			SettaHome:      settaHome,
			SettaFilesRoot: explicitRoot,
		},
	})
	if err != nil {
		t.Fatalf("load config: %v", err)
	}

	if cfg.Paths.SettaFilesRoot != explicitRoot {
		t.Fatalf("expected explicit setta files root %q, got %q", explicitRoot, cfg.Paths.SettaFilesRoot)
	}
	if !cfg.Paths.UsesExplicitSettaFiles {
		t.Fatal("expected explicit setta files root to mark usesExplicitSettaFiles")
	}
	if cfg.Paths.ActiveSettaFilesLocation() != "custom" {
		t.Fatalf("expected active files location custom, got %q", cfg.Paths.ActiveSettaFilesLocation())
	}
}

func TestLoadPrefersEnvSettaFilesRootOverExistingLocalRoot(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	workspaceRoot := filepath.Join(tmpDir, "workspace")
	settaHome := filepath.Join(tmpDir, ".setta")
	localRoot := filepath.Join(workspaceRoot, "setta_files")
	envRoot := filepath.Join(tmpDir, "state", "setta_files_dev")

	for _, path := range []string{localRoot, envRoot, settaHome} {
		if err := os.MkdirAll(path, 0o755); err != nil {
			t.Fatalf("mkdir %q: %v", path, err)
		}
	}

	cfg, err := Load(LoadOptions{
		CWD: workspaceRoot,
		EnvLookup: testEnv{
			filesRootEnv: envRoot,
		}.lookup,
		CLI: CLIOptions{
			WorkspaceRoot: workspaceRoot,
			SettaHome:     settaHome,
		},
	})
	if err != nil {
		t.Fatalf("load config: %v", err)
	}

	if cfg.Paths.SettaFilesRoot != envRoot {
		t.Fatalf("expected env setta files root %q, got %q", envRoot, cfg.Paths.SettaFilesRoot)
	}
	if !cfg.Paths.UsesExplicitSettaFiles {
		t.Fatal("expected env setta files root to mark usesExplicitSettaFiles")
	}
}

func TestLoadPrefersProfileSettaFilesRootOverEnvOverride(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	workspaceRoot := filepath.Join(tmpDir, "workspace")
	settaHome := filepath.Join(tmpDir, ".setta")
	profileRoot := filepath.Join(tmpDir, "profile_state", "setta_files")
	envRoot := filepath.Join(tmpDir, "env_state", "setta_files_dev")

	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		t.Fatalf("mkdir workspace: %v", err)
	}
	if err := os.MkdirAll(filepath.Join(settaHome, "profiles"), 0o755); err != nil {
		t.Fatalf("mkdir profiles: %v", err)
	}

	writeJSONFile(t, filepath.Join(settaHome, "profiles", "dev.json"), map[string]any{
		"name":           "dev",
		"workspaceRoot":  workspaceRoot,
		"settaFilesRoot": profileRoot,
	})

	cfg, err := Load(LoadOptions{
		CWD: workspaceRoot,
		EnvLookup: testEnv{
			filesRootEnv: envRoot,
		}.lookup,
		CLI: CLIOptions{
			WorkspaceRoot: workspaceRoot,
			SettaHome:     settaHome,
			Profile:       "dev",
		},
	})
	if err != nil {
		t.Fatalf("load config: %v", err)
	}

	if cfg.Paths.SettaFilesRoot != profileRoot {
		t.Fatalf("expected profile setta files root %q, got %q", profileRoot, cfg.Paths.SettaFilesRoot)
	}
	if !cfg.Paths.UsesExplicitSettaFiles {
		t.Fatal("expected profile setta files root to remain explicit")
	}
}

func TestLoadExplicitSettaFilesRootBypassesInvalidLocalRootFile(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	workspaceRoot := filepath.Join(tmpDir, "workspace")
	settaHome := filepath.Join(tmpDir, ".setta")
	localRoot := filepath.Join(workspaceRoot, "setta_files")
	explicitRoot := filepath.Join(tmpDir, "state", "setta_files_dev")

	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		t.Fatalf("mkdir workspace: %v", err)
	}
	if err := os.MkdirAll(settaHome, 0o755); err != nil {
		t.Fatalf("mkdir setta home: %v", err)
	}
	if err := os.MkdirAll(explicitRoot, 0o755); err != nil {
		t.Fatalf("mkdir explicit root: %v", err)
	}
	if err := os.WriteFile(localRoot, []byte("not a directory\n"), 0o644); err != nil {
		t.Fatalf("write invalid local root file: %v", err)
	}

	cfg, err := Load(LoadOptions{
		CWD:       workspaceRoot,
		EnvLookup: testEnv{}.lookup,
		CLI: CLIOptions{
			WorkspaceRoot:  workspaceRoot,
			SettaHome:      settaHome,
			SettaFilesRoot: explicitRoot,
		},
	})
	if err != nil {
		t.Fatalf("load config: %v", err)
	}

	if cfg.Paths.SettaFilesRoot != explicitRoot {
		t.Fatalf("expected explicit setta files root %q, got %q", explicitRoot, cfg.Paths.SettaFilesRoot)
	}
}

func TestLoadRejectsInvalidLocalSettaFilesRootByDefault(t *testing.T) {
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
	if err := os.WriteFile(localRoot, []byte("not a directory\n"), 0o644); err != nil {
		t.Fatalf("write invalid local setta_files root: %v", err)
	}

	_, err := Load(LoadOptions{
		CWD:       workspaceRoot,
		EnvLookup: testEnv{}.lookup,
		CLI: CLIOptions{
			WorkspaceRoot: workspaceRoot,
			SettaHome:     settaHome,
		},
	})
	if err == nil {
		t.Fatal("expected invalid default local setta_files root error")
	}
	var configErr *ConfigError
	if !errors.As(err, &configErr) {
		t.Fatalf("expected ConfigError, got %T: %v", err, err)
	}
	if configErr.Code != "InvalidSettaFilesRoot" {
		t.Fatalf("expected InvalidSettaFilesRoot, got %q", configErr.Code)
	}
	if !strings.Contains(configErr.Message, "local setta_files path is not a directory") {
		t.Fatalf("expected local setta_files path detail, got %q", configErr.Message)
	}
}

func TestLoadRejectsSettaFilesRootWithoutAllowedFolderName(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	workspaceRoot := filepath.Join(tmpDir, "workspace")
	settaHome := filepath.Join(tmpDir, ".setta")
	explicitRoot := filepath.Join(tmpDir, "state_root_custom")

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
			WorkspaceRoot:  workspaceRoot,
			SettaHome:      settaHome,
			SettaFilesRoot: explicitRoot,
		},
	})
	if err == nil {
		t.Fatal("expected invalid explicit setta files root error")
	}
	var configErr *ConfigError
	if !errors.As(err, &configErr) {
		t.Fatalf("expected ConfigError, got %T: %v", err, err)
	}
	if configErr.Code != "InvalidSettaFilesRoot" {
		t.Fatalf("expected InvalidSettaFilesRoot, got %q", configErr.Code)
	}
	if !strings.Contains(configErr.Message, "setta files root must include one of these folder names") {
		t.Fatalf("expected allowed-folder-name detail, got %q", configErr.Message)
	}
}

func TestLoadRejectsInvalidGlobalSettaFilesRootWithTypedCode(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	workspaceRoot := filepath.Join(tmpDir, "workspace")
	settaHome := filepath.Join(tmpDir, ".setta")
	globalRoot := buildFilesRootFromBase(filepath.Join(settaHome, "setta_files"), workspaceRoot)

	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		t.Fatalf("mkdir workspace: %v", err)
	}
	if err := os.MkdirAll(settaHome, 0o755); err != nil {
		t.Fatalf("mkdir setta home: %v", err)
	}
	if err := os.MkdirAll(filepath.Dir(globalRoot), 0o755); err != nil {
		t.Fatalf("mkdir global root parent: %v", err)
	}
	if err := os.WriteFile(globalRoot, []byte("not a directory\n"), 0o644); err != nil {
		t.Fatalf("write invalid global setta_files root: %v", err)
	}

	_, err := Load(LoadOptions{
		CWD:       workspaceRoot,
		EnvLookup: testEnv{}.lookup,
		CLI: CLIOptions{
			WorkspaceRoot:      workspaceRoot,
			SettaHome:          settaHome,
			SettaFilesLocation: "global",
		},
	})
	if err == nil {
		t.Fatal("expected invalid global setta_files root error")
	}
	var configErr *ConfigError
	if !errors.As(err, &configErr) {
		t.Fatalf("expected ConfigError, got %T: %v", err, err)
	}
	if configErr.Code != "InvalidSettaFilesRoot" {
		t.Fatalf("expected InvalidSettaFilesRoot, got %q", configErr.Code)
	}
	if !strings.Contains(configErr.Message, "global setta_files path is not a directory") {
		t.Fatalf("expected global setta_files path detail, got %q", configErr.Message)
	}
}

func TestLoadRejectsConflictingEnvSettaFilesRootAndLocation(t *testing.T) {
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
		CWD: workspaceRoot,
		EnvLookup: testEnv{
			filesRootEnv:     filepath.Join(tmpDir, "state", "setta_files_dev"),
			filesLocationEnv: "global",
		}.lookup,
		CLI: CLIOptions{
			WorkspaceRoot: workspaceRoot,
			SettaHome:     settaHome,
		},
	})
	if err == nil {
		t.Fatal("expected environment conflict error")
	}
	var configErr *ConfigError
	if !errors.As(err, &configErr) {
		t.Fatalf("expected ConfigError, got %T: %v", err, err)
	}
	if configErr.Code != "InvalidSettaFilesConfig" {
		t.Fatalf("expected InvalidSettaFilesConfig, got %q", configErr.Code)
	}
	if got := configErr.Message; !strings.Contains(got, filesRootEnv) || !strings.Contains(got, filesLocationEnv) {
		t.Fatalf("expected environment conflict error to mention %s and %s, got %q", filesRootEnv, filesLocationEnv, got)
	}
}

func TestLoadAllowsExplicitLocationToOverrideProfileSettaFilesRoot(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	workspaceRoot := filepath.Join(tmpDir, "workspace")
	settaHome := filepath.Join(tmpDir, ".setta")
	profileRoot := filepath.Join(tmpDir, "profile_state", "setta_files")
	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		t.Fatalf("mkdir workspace: %v", err)
	}
	if err := os.MkdirAll(filepath.Join(settaHome, "profiles"), 0o755); err != nil {
		t.Fatalf("mkdir profiles: %v", err)
	}

	writeJSONFile(t, filepath.Join(settaHome, "profiles", "dev.json"), map[string]any{
		"name":           "dev",
		"workspaceRoot":  workspaceRoot,
		"settaFilesRoot": profileRoot,
	})

	cfg, err := Load(LoadOptions{
		CWD:       workspaceRoot,
		EnvLookup: testEnv{}.lookup,
		CLI: CLIOptions{
			WorkspaceRoot:      workspaceRoot,
			SettaHome:          settaHome,
			Profile:            "dev",
			SettaFilesLocation: "local",
		},
	})
	if err != nil {
		t.Fatalf("load config: %v", err)
	}

	expectedLocalRoot := filepath.Join(workspaceRoot, "setta_files")
	if cfg.Paths.SettaFilesRoot != expectedLocalRoot {
		t.Fatalf("expected explicit local root %q, got %q", expectedLocalRoot, cfg.Paths.SettaFilesRoot)
	}
	if cfg.Paths.ResolvedFilesLocation != ResolvedFilesLocationLocal {
		t.Fatalf("expected explicit local location, got %q", cfg.Paths.ResolvedFilesLocation)
	}
	if cfg.Paths.UsesExplicitSettaFiles {
		t.Fatal("expected explicit location to resolve through standard local selection")
	}
}

func TestLoadUsesRuntimeRootEnvOverride(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	workspaceRoot := filepath.Join(tmpDir, "workspace")
	settaHome := filepath.Join(tmpDir, ".setta")
	runtimeRoot := filepath.Join(tmpDir, "runtime")
	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		t.Fatalf("mkdir workspace: %v", err)
	}
	if err := os.MkdirAll(settaHome, 0o755); err != nil {
		t.Fatalf("mkdir setta home: %v", err)
	}

	cfg, err := Load(LoadOptions{
		CWD: workspaceRoot,
		EnvLookup: testEnv{
			runtimeRootEnv: runtimeRoot,
		}.lookup,
		CLI: CLIOptions{
			WorkspaceRoot: workspaceRoot,
			SettaHome:     settaHome,
		},
	})
	if err != nil {
		t.Fatalf("load config: %v", err)
	}

	if cfg.Paths.RuntimeRoot != runtimeRoot {
		t.Fatalf("expected runtime root env override %q, got %q", runtimeRoot, cfg.Paths.RuntimeRoot)
	}
}

func TestLoadTrimsRuntimeRootEnvOverride(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	workspaceRoot := filepath.Join(tmpDir, "workspace")
	settaHome := filepath.Join(tmpDir, ".setta")
	runtimeRoot := filepath.Join(tmpDir, "runtime")
	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		t.Fatalf("mkdir workspace: %v", err)
	}
	if err := os.MkdirAll(settaHome, 0o755); err != nil {
		t.Fatalf("mkdir setta home: %v", err)
	}

	cfg, err := Load(LoadOptions{
		CWD: workspaceRoot,
		EnvLookup: testEnv{
			runtimeRootEnv: "  " + runtimeRoot + "  ",
		}.lookup,
		CLI: CLIOptions{
			WorkspaceRoot: workspaceRoot,
			SettaHome:     settaHome,
		},
	})
	if err != nil {
		t.Fatalf("load config: %v", err)
	}

	if cfg.Paths.RuntimeRoot != runtimeRoot {
		t.Fatalf("expected trimmed runtime root env override %q, got %q", runtimeRoot, cfg.Paths.RuntimeRoot)
	}
}

func TestLoadExpandsExplicitSettaFilesRootPathInputs(t *testing.T) {
	tmpDir := t.TempDir()
	workspaceRoot := filepath.Join(tmpDir, "workspace")
	settaHome := filepath.Join(tmpDir, ".setta")
	homeDir := filepath.Join(tmpDir, "home")
	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		t.Fatalf("mkdir workspace: %v", err)
	}
	if err := os.MkdirAll(settaHome, 0o755); err != nil {
		t.Fatalf("mkdir setta home: %v", err)
	}
	if err := os.MkdirAll(homeDir, 0o755); err != nil {
		t.Fatalf("mkdir home: %v", err)
	}
	t.Setenv("HOME", homeDir)
	t.Setenv("USERPROFILE", homeDir)
	t.Setenv("SETTA_STATE_BASE", filepath.Join(homeDir, "state_from_env"))

	testCases := []struct {
		name     string
		rawPath  string
		expected string
	}{
		{
			name:     "tilde",
			rawPath:  "~/state_from_tilde/setta_files_dev",
			expected: filepath.Join(homeDir, "state_from_tilde", "setta_files_dev"),
		},
		{
			name:     "env",
			rawPath:  "$SETTA_STATE_BASE/setta_files",
			expected: filepath.Join(homeDir, "state_from_env", "setta_files"),
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			cfg, err := Load(LoadOptions{
				CWD:       workspaceRoot,
				EnvLookup: testEnv{}.lookup,
				CLI: CLIOptions{
					WorkspaceRoot:  workspaceRoot,
					SettaHome:      settaHome,
					SettaFilesRoot: testCase.rawPath,
				},
			})
			if err != nil {
				t.Fatalf("load config: %v", err)
			}
			if cfg.Paths.SettaFilesRoot != testCase.expected {
				t.Fatalf("expected expanded setta files root %q, got %q", testCase.expected, cfg.Paths.SettaFilesRoot)
			}
		})
	}
}

func TestLoadExpandsExplicitRuntimeRootPathInputs(t *testing.T) {
	tmpDir := t.TempDir()
	workspaceRoot := filepath.Join(tmpDir, "workspace")
	settaHome := filepath.Join(tmpDir, ".setta")
	homeDir := filepath.Join(tmpDir, "home")
	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		t.Fatalf("mkdir workspace: %v", err)
	}
	if err := os.MkdirAll(settaHome, 0o755); err != nil {
		t.Fatalf("mkdir setta home: %v", err)
	}
	if err := os.MkdirAll(homeDir, 0o755); err != nil {
		t.Fatalf("mkdir home: %v", err)
	}
	t.Setenv("HOME", homeDir)
	t.Setenv("USERPROFILE", homeDir)
	t.Setenv("SETTA_RUNTIME_BASE", filepath.Join(homeDir, "runtime_from_env"))

	testCases := []struct {
		name     string
		rawPath  string
		expected string
	}{
		{
			name:     "tilde",
			rawPath:  "~/runtime_from_tilde",
			expected: filepath.Join(homeDir, "runtime_from_tilde"),
		},
		{
			name:     "env",
			rawPath:  "$SETTA_RUNTIME_BASE",
			expected: filepath.Join(homeDir, "runtime_from_env"),
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			cfg, err := Load(LoadOptions{
				CWD:       workspaceRoot,
				EnvLookup: testEnv{}.lookup,
				CLI: CLIOptions{
					WorkspaceRoot: workspaceRoot,
					SettaHome:     settaHome,
					RuntimeRoot:   testCase.rawPath,
				},
			})
			if err != nil {
				t.Fatalf("load config: %v", err)
			}
			if cfg.Paths.RuntimeRoot != testCase.expected {
				t.Fatalf("expected expanded runtime root %q, got %q", testCase.expected, cfg.Paths.RuntimeRoot)
			}
		})
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

func TestLoadUserConfigRejectsRemovedLegacyKeys(t *testing.T) {
	t.Parallel()

	settaHome := filepath.Join(t.TempDir(), ".setta")
	if err := os.MkdirAll(settaHome, 0o755); err != nil {
		t.Fatalf("mkdir setta home: %v", err)
	}

	writeUserConfig(t, settaHome, map[string]any{
		"openWorkspaceFallback": "global",
	})

	_, err := loadUserConfig(settaHome)
	if err == nil {
		t.Fatal("expected removed legacy-key error")
	}
	if got := err.Error(); !strings.Contains(got, "openWorkspaceFallback/defaultCreateLocation") {
		t.Fatalf("expected removed legacy-key error, got %q", got)
	}
	var configErr *ConfigError
	if !errors.As(err, &configErr) {
		t.Fatalf("expected ConfigError, got %T: %v", err, err)
	}
	if configErr.Code != "InvalidSettaUserConfig" {
		t.Fatalf("expected InvalidSettaUserConfig, got %q", configErr.Code)
	}
}

func TestLoadUserConfigRejectsMalformedJSON(t *testing.T) {
	t.Parallel()

	settaHome := filepath.Join(t.TempDir(), ".setta")
	if err := os.MkdirAll(settaHome, 0o755); err != nil {
		t.Fatalf("mkdir setta home: %v", err)
	}
	if err := os.WriteFile(filepath.Join(settaHome, "config.json"), []byte("{\n"), 0o644); err != nil {
		t.Fatalf("write malformed config: %v", err)
	}

	_, err := loadUserConfig(settaHome)
	if err == nil {
		t.Fatal("expected malformed json error")
	}
	if got := err.Error(); !strings.Contains(got, "invalid json in setta config") {
		t.Fatalf("expected malformed json error, got %q", got)
	}
	var configErr *ConfigError
	if !errors.As(err, &configErr) {
		t.Fatalf("expected ConfigError, got %T: %v", err, err)
	}
	if configErr.Code != "InvalidSettaUserConfig" {
		t.Fatalf("expected InvalidSettaUserConfig, got %q", configErr.Code)
	}
}

func TestLoadUserConfigRejectsNonObjectJSON(t *testing.T) {
	t.Parallel()

	settaHome := filepath.Join(t.TempDir(), ".setta")
	if err := os.MkdirAll(settaHome, 0o755); err != nil {
		t.Fatalf("mkdir setta home: %v", err)
	}
	if err := os.WriteFile(filepath.Join(settaHome, "config.json"), []byte("[1, 2, 3]\n"), 0o644); err != nil {
		t.Fatalf("write non-object config: %v", err)
	}

	_, err := loadUserConfig(settaHome)
	if err == nil {
		t.Fatal("expected non-object json error")
	}
	if got := err.Error(); !strings.Contains(got, "invalid json in setta config") {
		t.Fatalf("expected non-object json error, got %q", got)
	}
}

func TestLoadUserConfigRejectsFileBackedGlobalSettaFilesBase(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	settaHome := filepath.Join(tmpDir, ".setta")
	globalBaseFile := filepath.Join(tmpDir, "not-a-directory")
	if err := os.MkdirAll(settaHome, 0o755); err != nil {
		t.Fatalf("mkdir setta home: %v", err)
	}
	if err := os.WriteFile(globalBaseFile, []byte("file\n"), 0o644); err != nil {
		t.Fatalf("write file-backed global base: %v", err)
	}

	writeUserConfig(t, settaHome, map[string]any{
		"globalSettaFilesBase": globalBaseFile,
	})

	_, err := loadUserConfig(settaHome)
	if err == nil {
		t.Fatal("expected file-backed globalSettaFilesBase error")
	}
	if got := err.Error(); !strings.Contains(got, "globalSettaFilesBase is not a directory") {
		t.Fatalf("expected file-backed globalSettaFilesBase error, got %q", got)
	}
	var configErr *ConfigError
	if !errors.As(err, &configErr) {
		t.Fatalf("expected ConfigError, got %T: %v", err, err)
	}
	if configErr.Code != "InvalidSettaUserConfig" {
		t.Fatalf("expected InvalidSettaUserConfig, got %q", configErr.Code)
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
	var configErr *ConfigError
	if !errors.As(err, &configErr) {
		t.Fatalf("expected ConfigError, got %T: %v", err, err)
	}
	if configErr.Code != "InvalidWorkspace" {
		t.Fatalf("expected InvalidWorkspace, got %q", configErr.Code)
	}
}

func TestLoadRejectsRuntimeRootMatchingWorkspace(t *testing.T) {
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
			WorkspaceRoot: workspaceRoot,
			SettaHome:     settaHome,
			RuntimeRoot:   workspaceRoot,
		},
	})
	if err == nil {
		t.Fatal("expected invalid runtime root error")
	}
	var configErr *ConfigError
	if !errors.As(err, &configErr) {
		t.Fatalf("expected ConfigError, got %T: %v", err, err)
	}
	if configErr.Code != "InvalidRuntimeRoot" {
		t.Fatalf("expected InvalidRuntimeRoot, got %q", configErr.Code)
	}
}

func TestLoadRejectsInvalidLocalSettaFilesRootWithTypedCode(t *testing.T) {
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
	if err := os.WriteFile(localRoot, []byte("not a directory\n"), 0o644); err != nil {
		t.Fatalf("write invalid local setta_files root: %v", err)
	}

	_, err := Load(LoadOptions{
		CWD:       workspaceRoot,
		EnvLookup: testEnv{}.lookup,
		CLI: CLIOptions{
			WorkspaceRoot:      workspaceRoot,
			SettaHome:          settaHome,
			SettaFilesLocation: "local",
		},
	})
	if err == nil {
		t.Fatal("expected invalid local setta_files root error")
	}
	var configErr *ConfigError
	if !errors.As(err, &configErr) {
		t.Fatalf("expected ConfigError, got %T: %v", err, err)
	}
	if configErr.Code != "InvalidSettaFilesRoot" {
		t.Fatalf("expected InvalidSettaFilesRoot, got %q", configErr.Code)
	}
	if !strings.Contains(configErr.Message, "local setta_files path is not a directory") {
		t.Fatalf("expected local setta_files path detail, got %q", configErr.Message)
	}
}

func TestLoadRejectsInvalidRuntimeRootWithTypedCode(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	workspaceRoot := filepath.Join(tmpDir, "workspace")
	settaHome := filepath.Join(tmpDir, ".setta")
	runtimeRoot := filepath.Join(tmpDir, "runtime-root-file")
	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		t.Fatalf("mkdir workspace: %v", err)
	}
	if err := os.MkdirAll(settaHome, 0o755); err != nil {
		t.Fatalf("mkdir setta home: %v", err)
	}
	if err := os.WriteFile(runtimeRoot, []byte("not a directory\n"), 0o644); err != nil {
		t.Fatalf("write invalid runtime root file: %v", err)
	}

	_, err := Load(LoadOptions{
		CWD:       workspaceRoot,
		EnvLookup: testEnv{}.lookup,
		CLI: CLIOptions{
			WorkspaceRoot:      workspaceRoot,
			SettaHome:          settaHome,
			SettaFilesLocation: "local",
			RuntimeRoot:        runtimeRoot,
		},
	})
	if err == nil {
		t.Fatal("expected invalid runtime root error")
	}
	var configErr *ConfigError
	if !errors.As(err, &configErr) {
		t.Fatalf("expected ConfigError, got %T: %v", err, err)
	}
	if configErr.Code != "InvalidRuntimeRoot" {
		t.Fatalf("expected InvalidRuntimeRoot, got %q", configErr.Code)
	}
	if !strings.Contains(configErr.Message, "runtime root is not a directory") {
		t.Fatalf("expected runtime root directory detail, got %q", configErr.Message)
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
