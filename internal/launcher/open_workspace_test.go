package launcher

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"setta/internal/auth"
	"setta/internal/config"
)

func TestOpenWorkspaceServiceCreatesWorkspaceLaunchesSessionAndPersistsState(t *testing.T) {
	t.Parallel()

	baseRoot := t.TempDir()
	allowedRoot := filepath.Join(baseRoot, "allowed")
	defaultSettaHome := filepath.Join(baseRoot, ".setta")
	workspaceRoot := filepath.Join(allowedRoot, "new-workspace")
	if err := os.MkdirAll(allowedRoot, 0o755); err != nil {
		t.Fatalf("mkdir allowed root: %v", err)
	}
	resolvedWorkspaceRoot, err := resolvePathLoose(workspaceRoot)
	if err != nil {
		t.Fatalf("resolve workspace root: %v", err)
	}
	resolvedSettaHome, err := resolvePathLoose(defaultSettaHome)
	if err != nil {
		t.Fatalf("resolve default setta home: %v", err)
	}
	targetExecutable := filepath.Join(baseRoot, "setta")
	if err := os.WriteFile(targetExecutable, []byte("#!/usr/bin/env bash\n"), 0o755); err != nil {
		t.Fatalf("write launcher target executable: %v", err)
	}
	installMetadata, err := BuildLauncherInstallMetadata(LauncherInstallMetadataInput{
		TargetCommand:          []string{targetExecutable},
		Channel:                "manual",
		InstallSource:          LauncherInstallSourceUnsupported,
		ArtifactOwnershipToken: "open-workspace-test-token",
		SettaVersion:           "1.2.3",
		SettaHome:              defaultSettaHome,
		OpenMode:               LauncherOpenModeBrowser,
		WorkspaceBehavior:      LauncherWorkspaceBehaviorDefault,
		ArtifactOptions:        map[string]string{},
		ManagedArtifacts:       map[string]string{},
	})
	if err != nil {
		t.Fatalf("build launcher metadata: %v", err)
	}
	metadataPath, err := WriteLauncherInstallMetadata(defaultSettaHome, installMetadata)
	if err != nil {
		t.Fatalf("write launcher metadata: %v", err)
	}

	now := time.Unix(123, 0).UTC()
	serviceHome := NewHomeService(HomeServiceOptions{
		EnvLookup: testEnvLookup(map[string]string{
			"HOME":                         os.Getenv("HOME"),
			"SETTA_LAUNCHER_ALLOWED_ROOTS": allowedRoot,
		}),
		Now: func() time.Time {
			return now
		},
	})

	sessionLauncher := &capturingIDELauncher{
		result: IDELaunchResult{
			Session: auth.SessionMetadata{
				ID:   "session-1",
				Host: "127.0.0.1",
				Port: 61234,
			},
			Secret: []byte("secret"),
			Paths: config.Paths{
				WorkspaceRoot:         resolvedWorkspaceRoot,
				SettaHome:             resolvedSettaHome,
				SettaFilesRoot:        filepath.Join(resolvedWorkspaceRoot, "setta_files"),
				ResolvedFilesLocation: config.ResolvedFilesLocationLocal,
				RuntimeRoot:           filepath.Join(resolvedWorkspaceRoot, "setta_files", "runtime"),
			},
			StartedNew: true,
		},
	}

	service, err := NewOpenWorkspaceService(OpenWorkspaceServiceOptions{
		DefaultSettaHome: defaultSettaHome,
		Home:             serviceHome,
		Sessions:         sessionLauncher,
		Now: func() time.Time {
			return now
		},
		MintBootstrapToken: func(sessionID string, secret []byte, mintedAt time.Time) (string, error) {
			if sessionID != "session-1" {
				t.Fatalf("expected minted session id session-1, got %q", sessionID)
			}
			if string(secret) != "secret" {
				t.Fatalf("expected minted secret to match launch result, got %q", string(secret))
			}
			if !mintedAt.Equal(now) {
				t.Fatalf("expected mint time %v, got %v", now, mintedAt)
			}
			return "tok", nil
		},
	})
	if err != nil {
		t.Fatalf("new open workspace service: %v", err)
	}

	result, err := service.OpenWorkspace(OpenWorkspaceInput{
		WorkspaceRoot:   workspaceRoot,
		CreateIfMissing: true,
	})
	if err != nil {
		t.Fatalf("open workspace: %v", err)
	}

	if sessionLauncher.input == nil {
		t.Fatal("expected launcher input to be captured")
	}
	if sessionLauncher.input.SettaHome != resolvedSettaHome {
		t.Fatalf("expected default setta home %q, got %q", resolvedSettaHome, sessionLauncher.input.SettaHome)
	}
	if sessionLauncher.input.SettaFilesLocation == nil || *sessionLauncher.input.SettaFilesLocation != "auto" {
		t.Fatalf("expected omitted setta files location to normalize to auto, got %#v", sessionLauncher.input.SettaFilesLocation)
	}
	if _, err := os.Stat(workspaceRoot); err != nil {
		t.Fatalf("expected created workspace root to exist: %v", err)
	}
	if result.BootstrapURLFragment != "http://127.0.0.1:61234/__setta__/bootstrap#token=tok" {
		t.Fatalf("unexpected bootstrap URL fragment %q", result.BootstrapURLFragment)
	}
	if result.WorkspaceRoot != resolvedWorkspaceRoot || result.SettaFilesLocation != "local" || result.SettaHome != resolvedSettaHome || result.SessionID != "session-1" || !result.StartedNew {
		t.Fatalf("unexpected open workspace result %#v", result)
	}
	if result.Profile != nil {
		t.Fatalf("expected nil profile, got %#v", result.Profile)
	}

	recentWorkspaces, err := serviceHome.LoadRecentWorkspaces(resolvedSettaHome)
	if err != nil {
		t.Fatalf("load recent workspaces: %v", err)
	}
	if len(recentWorkspaces) != 1 || recentWorkspaces[0].WorkspaceRoot != resolvedWorkspaceRoot {
		t.Fatalf("unexpected recent workspaces %#v", recentWorkspaces)
	}

	metadataBytes, err := os.ReadFile(metadataPath)
	if err != nil {
		t.Fatalf("read launcher metadata: %v", err)
	}
	var metadata launcherInstallMetadata
	if err := json.Unmarshal(metadataBytes, &metadata); err != nil {
		t.Fatalf("decode launcher metadata: %v", err)
	}
	if metadata.LastUsedWorkspace == nil || *metadata.LastUsedWorkspace != resolvedWorkspaceRoot {
		t.Fatalf("expected launcher metadata last used workspace %q, got %#v", resolvedWorkspaceRoot, metadata.LastUsedWorkspace)
	}
}

func TestOpenWorkspaceServiceRejectsDotSegmentsWhenCreateRequested(t *testing.T) {
	t.Parallel()

	baseRoot := t.TempDir()
	allowedRoot := filepath.Join(baseRoot, "allowed")
	if err := os.MkdirAll(allowedRoot, 0o755); err != nil {
		t.Fatalf("mkdir allowed root: %v", err)
	}

	service, err := NewOpenWorkspaceService(OpenWorkspaceServiceOptions{
		DefaultSettaHome: filepath.Join(baseRoot, ".setta"),
		Home: NewHomeService(HomeServiceOptions{
			EnvLookup: testEnvLookup(map[string]string{
				"HOME":                         os.Getenv("HOME"),
				"SETTA_LAUNCHER_ALLOWED_ROOTS": allowedRoot,
			}),
		}),
		Sessions: &capturingIDELauncher{},
	})
	if err != nil {
		t.Fatalf("new open workspace service: %v", err)
	}

	_, err = service.OpenWorkspace(OpenWorkspaceInput{
		WorkspaceRoot:   allowedRoot + string(os.PathSeparator) + ".." + string(os.PathSeparator) + "escape",
		CreateIfMissing: true,
	})
	if err == nil {
		t.Fatal("expected dot-segment create request to fail")
	}
	var openErr *OpenWorkspaceError
	if !errorsAs(err, &openErr) {
		t.Fatalf("expected open workspace error, got %T", err)
	}
	if openErr.Code != "BadRequest" || !strings.Contains(openErr.Message, "must not contain '.' or '..' segments") {
		t.Fatalf("unexpected dot-segment error %#v", openErr)
	}
}

func TestOpenWorkspaceServiceProfilePreservesOmittedSettaFilesLocation(t *testing.T) {
	t.Parallel()

	baseRoot := t.TempDir()
	allowedRoot := filepath.Join(baseRoot, "allowed")
	workspaceRoot := filepath.Join(allowedRoot, "workspace")
	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		t.Fatalf("mkdir workspace root: %v", err)
	}

	sessionLauncher := &capturingIDELauncher{
		err: &SessionLaunchError{
			Code:    "Captured",
			Message: "intentional capture",
		},
	}
	service, err := NewOpenWorkspaceService(OpenWorkspaceServiceOptions{
		DefaultSettaHome: filepath.Join(baseRoot, ".setta"),
		Home: NewHomeService(HomeServiceOptions{
			EnvLookup: testEnvLookup(map[string]string{
				"HOME":                         os.Getenv("HOME"),
				"SETTA_LAUNCHER_ALLOWED_ROOTS": allowedRoot,
			}),
		}),
		Sessions: sessionLauncher,
	})
	if err != nil {
		t.Fatalf("new open workspace service: %v", err)
	}

	_, err = service.OpenWorkspace(OpenWorkspaceInput{
		WorkspaceRoot: workspaceRoot,
		Profile:       "dev",
	})
	if err == nil {
		t.Fatal("expected captured launch error")
	}
	if sessionLauncher.input == nil {
		t.Fatal("expected launcher input to be captured")
	}
	if sessionLauncher.input.SettaFilesLocation != nil {
		t.Fatalf("expected omitted setta files location with profile to remain nil, got %#v", sessionLauncher.input.SettaFilesLocation)
	}
	var openErr *OpenWorkspaceError
	if !errorsAs(err, &openErr) || openErr.Code != "Captured" {
		t.Fatalf("expected captured open workspace error, got %#v", err)
	}
}

func TestOpenWorkspaceServiceExplicitAutoOverridesProfile(t *testing.T) {
	t.Parallel()

	baseRoot := t.TempDir()
	allowedRoot := filepath.Join(baseRoot, "allowed")
	workspaceRoot := filepath.Join(allowedRoot, "workspace")
	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		t.Fatalf("mkdir workspace root: %v", err)
	}

	sessionLauncher := &capturingIDELauncher{
		err: &SessionLaunchError{
			Code:    "Captured",
			Message: "intentional capture",
		},
	}
	service, err := NewOpenWorkspaceService(OpenWorkspaceServiceOptions{
		DefaultSettaHome: filepath.Join(baseRoot, ".setta"),
		Home: NewHomeService(HomeServiceOptions{
			EnvLookup: testEnvLookup(map[string]string{
				"HOME":                         os.Getenv("HOME"),
				"SETTA_LAUNCHER_ALLOWED_ROOTS": allowedRoot,
			}),
		}),
		Sessions: sessionLauncher,
	})
	if err != nil {
		t.Fatalf("new open workspace service: %v", err)
	}

	auto := "auto"
	_, err = service.OpenWorkspace(OpenWorkspaceInput{
		WorkspaceRoot:              workspaceRoot,
		Profile:                    "dev",
		SettaFilesLocation:         &auto,
		SettaFilesLocationProvided: true,
	})
	if err == nil {
		t.Fatal("expected captured launch error")
	}
	if sessionLauncher.input == nil {
		t.Fatal("expected launcher input to be captured")
	}
	if sessionLauncher.input.SettaFilesLocation == nil || *sessionLauncher.input.SettaFilesLocation != "auto" {
		t.Fatalf("expected explicit auto to be preserved, got %#v", sessionLauncher.input.SettaFilesLocation)
	}
}

type capturingIDELauncher struct {
	input  *IDELaunchInput
	result IDELaunchResult
	err    error
}

func (l *capturingIDELauncher) EnsureSession(input IDELaunchInput) (IDELaunchResult, error) {
	inputCopy := input
	if input.SettaFilesLocation != nil {
		location := *input.SettaFilesLocation
		inputCopy.SettaFilesLocation = &location
	}
	l.input = &inputCopy
	if l.err != nil {
		return IDELaunchResult{}, l.err
	}
	return l.result, nil
}

func testEnvLookup(values map[string]string) func(string) (string, bool) {
	return func(key string) (string, bool) {
		value, ok := values[key]
		return value, ok
	}
}

func errorsAs(err error, target any) bool {
	return err != nil && errors.As(err, target)
}
