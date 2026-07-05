package terminal

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestProfileStoreCreatesUpdatesSelectsDeletesAndPersists(t *testing.T) {
	appDataDir := t.TempDir()
	cwd := t.TempDir()
	executable := testExecutablePath(t)
	store := newTestProfileStore(t, appDataDir)

	assertProfileStoreInitialized(t, store, appDataDir)
	profileID := createCustomCommandProfile(t, store, executable, cwd)
	assertProfileCanBecomeDefault(t, store, profileID)
	updateProfileToHomeShell(t, store, profileID, executable)
	assertProfilesPersist(t, appDataDir, profileID)
	assertProfileDeletes(t, appDataDir, profileID)
}

func TestProfileStoreRejectsInvalidProfiles(t *testing.T) {
	store := newTestProfileStore(t, t.TempDir())
	cwd := t.TempDir()
	executable := testExecutablePath(t)

	for _, tt := range []struct {
		name  string
		input TerminalProfileInput
		want  string
	}{
		{
			name: "missing name",
			input: TerminalProfileInput{
				LaunchMode: ProfileLaunchModeShell,
				CWDMode:    ProfileCWDModeProject,
				Env:        map[string]string{},
			},
			want: "name is required",
		},
		{
			name: "relative shell",
			input: TerminalProfileInput{
				Name:       "Bad shell",
				LaunchMode: ProfileLaunchModeShell,
				ShellPath:  "zsh",
				CWDMode:    ProfileCWDModeProject,
				Env:        map[string]string{},
			},
			want: "shell path must be absolute",
		},
		{
			name: "custom command without path",
			input: TerminalProfileInput{
				Name:       "Custom",
				LaunchMode: ProfileLaunchModeCustomCommand,
				CWDMode:    ProfileCWDModeProject,
				Env:        map[string]string{},
			},
			want: "shellPath is required",
		},
		{
			name: "custom cwd missing",
			input: TerminalProfileInput{
				Name:       "Custom cwd",
				LaunchMode: ProfileLaunchModeShell,
				ShellPath:  executable,
				CWDMode:    ProfileCWDModeCustom,
				CWD:        filepath.Join(cwd, "missing"),
				Env:        map[string]string{},
			},
			want: "cwd does not exist",
		},
		{
			name: "reserved env",
			input: TerminalProfileInput{
				Name:       "Reserved env",
				LaunchMode: ProfileLaunchModeShell,
				ShellPath:  executable,
				CWDMode:    ProfileCWDModeProject,
				Env:        map[string]string{"TERM": "bad"},
			},
			want: "cannot override TERM",
		},
	} {
		t.Run(tt.name, func(t *testing.T) {
			_, err := store.Create(tt.input)
			if err == nil {
				t.Fatal("create profile succeeded, want validation error")
			}
			if !strings.Contains(err.Error(), tt.want) {
				t.Fatalf("error = %q, want containing %q", err.Error(), tt.want)
			}
		})
	}
}

func newTestProfileStore(t *testing.T, appDataDir string) *ProfileStore {
	t.Helper()
	store, err := NewProfileStore(appDataDir, WithProfileStoreClock(testClock(t)))
	if err != nil {
		t.Fatalf("new profile store: %v", err)
	}
	return store
}

func assertProfileStoreInitialized(t *testing.T, store *ProfileStore, appDataDir string) {
	t.Helper()
	if err := store.EnsureInitialized(); err != nil {
		t.Fatalf("initialize profile store: %v", err)
	}
	if _, err := os.Stat(filepath.Join(appDataDir, "settings", "terminal-profiles.json")); err != nil {
		t.Fatalf("profile store did not create settings file: %v", err)
	}
	initial, err := store.List()
	if err != nil {
		t.Fatalf("list default profiles: %v", err)
	}
	if initial.DefaultProfileID != DefaultProfileID || len(initial.Profiles) != 1 {
		t.Fatalf("initial profiles = %+v, want one default profile", initial)
	}
}

func createCustomCommandProfile(t *testing.T, store *ProfileStore, executable string, cwd string) string {
	t.Helper()
	created, err := store.Create(TerminalProfileInput{
		Name:       "Project command",
		LaunchMode: ProfileLaunchModeCustomCommand,
		ShellPath:  executable,
		Args:       []string{"--version"},
		CWDMode:    ProfileCWDModeCustom,
		CWD:        cwd,
		Env:        map[string]string{"SETTA_PROFILE_TEST": "1"},
		FontFamily: "Fira Code",
		FontSize:   16,
		ThemeID:    ThemeSettaLight,
		Scrollback: 800,
	})
	if err != nil {
		t.Fatalf("create terminal profile: %v", err)
	}
	profile := created.Profiles[1]
	if profile.ID == "" || profile.ID == DefaultProfileID {
		t.Fatalf("created profile id = %q, want generated id", profile.ID)
	}
	if profile.SafeAutoStart {
		t.Fatal("custom command profile safeAutoStart = true, want false")
	}
	return profile.ID
}

func assertProfileCanBecomeDefault(t *testing.T, store *ProfileStore, profileID string) {
	t.Helper()
	selected, err := store.SetDefault(profileID)
	if err != nil {
		t.Fatalf("select default profile: %v", err)
	}
	if selected.DefaultProfileID != profileID {
		t.Fatalf("default profile id = %s, want %s", selected.DefaultProfileID, profileID)
	}
}

func updateProfileToHomeShell(t *testing.T, store *ProfileStore, profileID string, executable string) {
	t.Helper()
	updated, err := store.Update(profileID, TerminalProfileInput{
		Name:       "Home shell",
		LaunchMode: ProfileLaunchModeShell,
		ShellPath:  executable,
		Args:       []string{"--help"},
		CWDMode:    ProfileCWDModeHome,
		CWD:        "",
		Env:        map[string]string{"SETTA_PROFILE_TEST": "updated"},
		FontFamily: "JetBrains Mono",
		FontSize:   14,
		ThemeID:    ThemeHighContrastDark,
		Scrollback: 2000,
	})
	if err != nil {
		t.Fatalf("update terminal profile: %v", err)
	}
	if updated.Profiles[1].CWD != "" || !updated.Profiles[1].SafeAutoStart {
		t.Fatalf("updated profile = %+v, want home cwd with safe auto start", updated.Profiles[1])
	}
}

func assertProfilesPersist(t *testing.T, appDataDir string, profileID string) {
	t.Helper()
	reloaded := newTestProfileStore(t, appDataDir)
	persisted, err := reloaded.List()
	if err != nil {
		t.Fatalf("reload terminal profiles: %v", err)
	}
	if persisted.DefaultProfileID != profileID || persisted.Profiles[1].Name != "Home shell" {
		t.Fatalf("persisted profiles = %+v, want selected updated profile", persisted)
	}
}

func assertProfileDeletes(t *testing.T, appDataDir string, profileID string) {
	t.Helper()
	reloaded := newTestProfileStore(t, appDataDir)
	if _, err := reloaded.SetDefault(DefaultProfileID); err != nil {
		t.Fatalf("restore default profile: %v", err)
	}
	deleted, err := reloaded.Delete(profileID)
	if err != nil {
		t.Fatalf("delete terminal profile: %v", err)
	}
	if len(deleted.Profiles) != 1 || deleted.Profiles[0].ID != DefaultProfileID {
		t.Fatalf("profiles after delete = %+v, want only default", deleted.Profiles)
	}
}

func testExecutablePath(t *testing.T) string {
	t.Helper()
	executable, err := os.Executable()
	if err != nil {
		t.Fatalf("read test executable path: %v", err)
	}
	return executable
}
