package config

import (
	"encoding/json"
	"errors"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

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
			FilesRootEnv: envRoot,
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
			FilesRootEnv: envRoot,
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
			FilesRootEnv:     filepath.Join(tmpDir, "state", "setta_files_dev"),
			FilesLocationEnv: "global",
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
	if got := configErr.Message; !strings.Contains(got, FilesRootEnv) || !strings.Contains(got, FilesLocationEnv) {
		t.Fatalf("expected environment conflict error to mention %s and %s, got %q", FilesRootEnv, FilesLocationEnv, got)
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
			RuntimeRootEnv: runtimeRoot,
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
			RuntimeRootEnv: "  " + runtimeRoot + "  ",
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
