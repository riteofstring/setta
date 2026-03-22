package launcher

import (
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"testing"
	"time"

	"setta/internal/auth"
	"setta/internal/config"
	"setta/internal/localsessions"
	"setta/internal/projectstate"
	"setta/internal/settingsstate"

	"github.com/shirou/gopsutil/v4/process"
)

func TestLocalIDESessionLauncherBuildLaunchArgsIncludeExecutablePath(t *testing.T) {
	t.Parallel()

	launcher, err := NewLocalIDESessionLauncher(LocalIDESessionLauncherOptions{
		ExecutablePath: "/tmp/setta-server",
	})
	if err != nil {
		t.Fatalf("new local IDE session launcher: %v", err)
	}

	auto := "auto"
	args := launcher.buildLaunchArgs(IDELaunchInput{
		WorkspaceRoot:      "/tmp/workspace",
		SettaHome:          "/tmp/.setta",
		ProfileLookupHome:  "/tmp/.setta-profiles",
		Profile:            "dev",
		SettaFilesLocation: &auto,
		RuntimeRoot:        "/tmp/runtime",
	})
	if len(args) == 0 || args[0] != "/tmp/setta-server" {
		t.Fatalf("expected executable path to lead launch args, got %#v", args)
	}
	foundLookupHome := false
	for index := 0; index < len(args)-1; index++ {
		if args[index] == "--profile-lookup-home" && args[index+1] == "/tmp/.setta-profiles" {
			foundLookupHome = true
		}
	}
	if !foundLookupHome {
		t.Fatalf("expected launch args to include profile lookup home, got %#v", args)
	}
	for index := 0; index < len(args)-1; index++ {
		if args[index] == "--setta-home" {
			t.Fatalf("expected profile launch args to omit --setta-home, got %#v", args)
		}
	}
}

func TestLocalIDESessionLauncherBuildLaunchArgsKeepsSettaHomeForNonProfileLaunch(t *testing.T) {
	t.Parallel()

	launcherRuntime, err := NewLocalIDESessionLauncher(LocalIDESessionLauncherOptions{
		ExecutablePath: "/tmp/setta-server",
	})
	if err != nil {
		t.Fatalf("new local IDE session launcher: %v", err)
	}

	args := launcherRuntime.buildLaunchArgs(IDELaunchInput{
		WorkspaceRoot: "/tmp/workspace",
		SettaHome:     "/tmp/.setta",
		ServerMode:    config.ModeIDE,
	})

	foundSettaHome := false
	for index := 0; index < len(args)-1; index++ {
		if args[index] == "--setta-home" && args[index+1] == "/tmp/.setta" {
			foundSettaHome = true
		}
	}
	if !foundSettaHome {
		t.Fatalf("expected non-profile launch args to include --setta-home, got %#v", args)
	}
}

func TestLocalIDESessionLauncherBuildLaunchArgsUseLauncherModeWhenRequested(t *testing.T) {
	t.Parallel()

	launcherRuntime, err := NewLocalIDESessionLauncher(LocalIDESessionLauncherOptions{
		ExecutablePath: "/tmp/setta-server",
	})
	if err != nil {
		t.Fatalf("new local IDE session launcher: %v", err)
	}

	args := launcherRuntime.buildLaunchArgs(IDELaunchInput{
		WorkspaceRoot: "/tmp/workspace",
		SettaHome:     "/tmp/.setta",
		ServerMode:    config.ModeLauncher,
	})

	foundMode := false
	for index := 0; index < len(args)-1; index++ {
		if args[index] == "--mode" && args[index+1] == string(config.ModeLauncher) {
			foundMode = true
		}
	}
	if !foundMode {
		t.Fatalf("expected launch args to include launcher mode, got %#v", args)
	}
}

func TestLocalIDESessionLauncherLaunchEnvClearsInheritedAuthCookieName(t *testing.T) {
	t.Parallel()

	launcher, err := NewLocalIDESessionLauncher(LocalIDESessionLauncherOptions{
		ExecutablePath: "/tmp/setta-server",
		Env: []string{
			"PATH=/usr/bin",
			"SETTA_AUTH_COOKIE_NAME=stale-cookie",
			"SETTA_RUNTIME_ROOT=/tmp/runtime",
		},
	})
	if err != nil {
		t.Fatalf("new local IDE session launcher: %v", err)
	}

	env := launcher.launchEnv()
	for _, entry := range env {
		if strings.HasPrefix(entry, "SETTA_AUTH_COOKIE_NAME=") {
			t.Fatalf("expected auth cookie name to be cleared from launch env, got %#v", env)
		}
	}
	if len(env) != 1 || env[0] != "PATH=/usr/bin" {
		t.Fatalf("expected only unrelated env entries to remain, got %#v", env)
	}
}

func TestLocalIDESessionLauncherLaunchEnvClearsInheritedRuntimeIdentityVars(t *testing.T) {
	t.Parallel()

	launcher, err := NewLocalIDESessionLauncher(LocalIDESessionLauncherOptions{
		ExecutablePath: "/tmp/setta-server",
		Env: []string{
			"PATH=/usr/bin",
			"SETTA_WORKSPACE_ROOT=/tmp/workspace",
			"SETTA_HOME=/tmp/.setta",
			"SETTA_PROFILE_LOOKUP_HOME=/tmp/.profiles",
			"SETTA_RUNTIME_ROOT=/tmp/runtime",
			"SETTA_FILES_ROOT=/tmp/files",
			"SETTA_FILES_LOCATION=local",
			"SETTA_PROFILE=dev",
			"SETTA_SERVER_MODE=launcher",
			"SETTA_SESSION_ID=session-a",
			"SETTA_SESSIONS_ROOT=/tmp/runtime/sessions",
			"OTHER=value",
		},
	})
	if err != nil {
		t.Fatalf("new local IDE session launcher: %v", err)
	}

	env := launcher.launchEnv()
	if len(env) != 2 {
		t.Fatalf("expected only unrelated env entries to remain, got %#v", env)
	}
	if env[0] != "PATH=/usr/bin" || env[1] != "OTHER=value" {
		t.Fatalf("unexpected filtered env %#v", env)
	}
}

func TestLocalIDESessionLauncherEnsureSessionReusesOnlyMatchingModeAndRuntimeIdentity(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	workspaceRoot := filepath.Join(root, "workspace")
	settaHome := filepath.Join(root, ".setta")
	profileLookupHome := settaHome
	runtimeRoot := filepath.Join(root, "runtime")
	for _, path := range []string{workspaceRoot, settaHome, profileLookupHome, runtimeRoot} {
		if err := os.MkdirAll(path, 0o755); err != nil {
			t.Fatalf("mkdir %q: %v", path, err)
		}
	}
	writeSessionLauncherProfile(t, profileLookupHome, workspaceRoot, settaHome)

	location := "local"
	input := IDELaunchInput{
		WorkspaceRoot:      workspaceRoot,
		SettaHome:          settaHome,
		ProfileLookupHome:  profileLookupHome,
		Profile:            "dev",
		SettaFilesLocation: &location,
		RuntimeRoot:        runtimeRoot,
		ServerMode:         config.ModeIDE,
	}
	cfg, err := loadIDELaunchConfig(input)
	if err != nil {
		t.Fatalf("load launch config: %v", err)
	}

	now := time.Date(2026, time.March, 18, 12, 0, 0, 0, time.UTC)
	registry, err := localsessions.NewRegistry(localsessions.RegistryOptions{
		SessionsRoot: filepath.Join(cfg.Paths.RuntimeRoot, "sessions"),
		Now: func() time.Time {
			now = now.Add(time.Second)
			return now
		},
		PIDCreateTime: func(int) *float64 { return nil },
	})
	if err != nil {
		t.Fatalf("new session registry: %v", err)
	}

	matchingSession := createConnectableLauncherSession(t, registry, localsessions.CreateSessionInput{
		WorkspaceRoot:      cfg.Paths.WorkspaceRoot,
		SettaHome:          cfg.Paths.SettaHome,
		SettaFilesRoot:     cfg.Paths.SettaFilesRoot,
		SettaFilesLocation: cfg.Paths.ActiveSettaFilesLocation(),
		RuntimeRoot:        cfg.Paths.RuntimeRoot,
		Profile:            cfg.Paths.ProfileName,
		ServerMode:         string(config.ModeIDE),
	})
	createConnectableLauncherSession(t, registry, localsessions.CreateSessionInput{
		WorkspaceRoot:      cfg.Paths.WorkspaceRoot,
		SettaHome:          cfg.Paths.SettaHome,
		SettaFilesRoot:     cfg.Paths.SettaFilesRoot,
		SettaFilesLocation: cfg.Paths.ActiveSettaFilesLocation(),
		RuntimeRoot:        cfg.Paths.RuntimeRoot,
		Profile:            cfg.Paths.ProfileName,
		ServerMode:         string(config.ModeLauncher),
	})
	createConnectableLauncherSession(t, registry, localsessions.CreateSessionInput{
		WorkspaceRoot:      cfg.Paths.WorkspaceRoot,
		SettaHome:          cfg.Paths.SettaHome,
		SettaFilesRoot:     cfg.Paths.SettaFilesRoot,
		SettaFilesLocation: cfg.Paths.ActiveSettaFilesLocation(),
		RuntimeRoot:        cfg.Paths.RuntimeRoot,
		Profile:            "prod",
		ServerMode:         string(config.ModeIDE),
	})
	createConnectableLauncherSession(t, registry, localsessions.CreateSessionInput{
		WorkspaceRoot:      cfg.Paths.WorkspaceRoot,
		SettaHome:          filepath.Join(root, ".setta-other"),
		SettaFilesRoot:     cfg.Paths.SettaFilesRoot,
		SettaFilesLocation: cfg.Paths.ActiveSettaFilesLocation(),
		RuntimeRoot:        cfg.Paths.RuntimeRoot,
		Profile:            cfg.Paths.ProfileName,
		ServerMode:         string(config.ModeIDE),
	})
	createConnectableLauncherSession(t, registry, localsessions.CreateSessionInput{
		WorkspaceRoot:      cfg.Paths.WorkspaceRoot,
		SettaHome:          cfg.Paths.SettaHome,
		SettaFilesRoot:     filepath.Join(root, "other-setta-files"),
		SettaFilesLocation: cfg.Paths.ActiveSettaFilesLocation(),
		RuntimeRoot:        cfg.Paths.RuntimeRoot,
		Profile:            cfg.Paths.ProfileName,
		ServerMode:         string(config.ModeIDE),
	})
	createConnectableLauncherSession(t, registry, localsessions.CreateSessionInput{
		WorkspaceRoot:      cfg.Paths.WorkspaceRoot,
		SettaHome:          cfg.Paths.SettaHome,
		SettaFilesRoot:     cfg.Paths.SettaFilesRoot,
		SettaFilesLocation: "global",
		RuntimeRoot:        cfg.Paths.RuntimeRoot,
		Profile:            cfg.Paths.ProfileName,
		ServerMode:         string(config.ModeIDE),
	})
	createConnectableLauncherSession(t, registry, localsessions.CreateSessionInput{
		WorkspaceRoot:      cfg.Paths.WorkspaceRoot,
		SettaHome:          cfg.Paths.SettaHome,
		SettaFilesRoot:     cfg.Paths.SettaFilesRoot,
		SettaFilesLocation: cfg.Paths.ActiveSettaFilesLocation(),
		RuntimeRoot:        filepath.Join(root, "other-runtime"),
		Profile:            cfg.Paths.ProfileName,
		ServerMode:         string(config.ModeIDE),
	})

	processStarterCalled := false
	launcher, err := NewLocalIDESessionLauncher(LocalIDESessionLauncherOptions{
		ExecutablePath: "/tmp/setta-server",
		RegistryFactory: func(string) (*localsessions.Registry, error) {
			return registry, nil
		},
		ProcessStarter: func(processStartRequest) (startedProcess, error) {
			processStarterCalled = true
			return nil, errors.New("unexpected process start")
		},
	})
	if err != nil {
		t.Fatalf("new local IDE session launcher: %v", err)
	}

	result, err := launcher.EnsureSession(input)
	if err != nil {
		t.Fatalf("ensure session: %v", err)
	}
	if result.StartedNew {
		t.Fatalf("expected existing session reuse, got %#v", result)
	}
	if processStarterCalled {
		t.Fatal("expected reuse to avoid starting a new process")
	}
	if result.Session.ID != matchingSession.ID {
		t.Fatalf("expected reused session id %q, got %#v", matchingSession.ID, result)
	}
	if result.Paths.RuntimeRoot != cfg.Paths.RuntimeRoot {
		t.Fatalf("expected runtime root %q, got %#v", cfg.Paths.RuntimeRoot, result.Paths.RuntimeRoot)
	}
	if result.Paths.ActiveSettaFilesLocation() != cfg.Paths.ActiveSettaFilesLocation() {
		t.Fatalf("expected settaFilesLocation %q, got %q", cfg.Paths.ActiveSettaFilesLocation(), result.Paths.ActiveSettaFilesLocation())
	}
	if len(result.Secret) == 0 {
		t.Fatal("expected reused session secret")
	}
}

func TestExistingSessionWaitWindowExtendsForRecentSessions(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, time.March, 19, 12, 0, 0, 0, time.UTC)
	got := existingSessionWaitWindow(auth.SessionMetadata{
		PID:       os.Getpid(),
		StartedAt: now,
	}, now, 30*time.Second, defaultExistingSessionWait)
	if got != defaultExistingSessionExtendedWait {
		t.Fatalf("expected extended wait %s, got %s", defaultExistingSessionExtendedWait, got)
	}
}

func TestExistingSessionWaitWindowUsesBaseForOlderSessions(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, time.March, 19, 12, 0, 0, 0, time.UTC)
	got := existingSessionWaitWindow(auth.SessionMetadata{
		PID:       os.Getpid(),
		StartedAt: now.Add(-(defaultExistingSessionRecentAge + time.Second)),
	}, now, 30*time.Second, defaultExistingSessionWait)
	if got != defaultExistingSessionWait {
		t.Fatalf("expected base wait %s, got %s", defaultExistingSessionWait, got)
	}
}

func TestLocalIDESessionLauncherEnsureSessionExtendsRecentSessionGraceBeforeSpawn(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	workspaceRoot := filepath.Join(root, "workspace")
	settaHome := filepath.Join(root, ".setta")
	runtimeRoot := filepath.Join(root, "runtime")
	for _, path := range []string{workspaceRoot, settaHome, runtimeRoot} {
		if err := os.MkdirAll(path, 0o755); err != nil {
			t.Fatalf("mkdir %q: %v", path, err)
		}
	}

	location := "local"
	input := IDELaunchInput{
		WorkspaceRoot:      workspaceRoot,
		SettaHome:          settaHome,
		SettaFilesLocation: &location,
		RuntimeRoot:        runtimeRoot,
		ServerMode:         config.ModeIDE,
	}
	cfg, err := loadIDELaunchConfig(input)
	if err != nil {
		t.Fatalf("load launch config: %v", err)
	}

	current := time.Date(2026, time.March, 19, 12, 0, 0, 0, time.UTC)
	registry, err := localsessions.NewRegistry(localsessions.RegistryOptions{
		SessionsRoot: filepath.Join(cfg.Paths.RuntimeRoot, "sessions"),
		Now: func() time.Time {
			return current
		},
		PIDCreateTime: func(int) *float64 { return nil },
	})
	if err != nil {
		t.Fatalf("new session registry: %v", err)
	}

	reservedListener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("reserve listener port: %v", err)
	}
	port := reservedListener.Addr().(*net.TCPAddr).Port
	if err := reservedListener.Close(); err != nil {
		t.Fatalf("close reserved listener: %v", err)
	}

	session, err := registry.CreateSession(localsessions.CreateSessionInput{
		WorkspaceRoot:      cfg.Paths.WorkspaceRoot,
		Host:               "127.0.0.1",
		Port:               port,
		PID:                os.Getpid(),
		SettaFilesLocation: cfg.Paths.ActiveSettaFilesLocation(),
		SettaFilesRoot:     cfg.Paths.SettaFilesRoot,
		RuntimeRoot:        cfg.Paths.RuntimeRoot,
		SettaHome:          cfg.Paths.SettaHome,
		Profile:            cfg.Paths.ProfileName,
		ServerMode:         string(config.ModeIDE),
	})
	if err != nil {
		t.Fatalf("create recent session: %v", err)
	}

	var connectableListener net.Listener
	t.Cleanup(func() {
		if connectableListener != nil {
			_ = connectableListener.Close()
		}
	})

	processStarterCalled := 0
	launcher, err := NewLocalIDESessionLauncher(LocalIDESessionLauncherOptions{
		ExecutablePath:      "/tmp/setta-server",
		Now:                 func() time.Time { return current },
		ExistingSessionWait: defaultExistingSessionWait,
		LaunchTimeout:       12 * time.Second,
		ConnectTimeout:      50 * time.Millisecond,
		Sleep: func(duration time.Duration) {
			current = current.Add(duration)
			if connectableListener == nil && current.Sub(session.StartedAt) > defaultExistingSessionWait {
				listener, listenErr := net.Listen("tcp", net.JoinHostPort("127.0.0.1", strconv.Itoa(port)))
				if listenErr != nil {
					t.Fatalf("start delayed session listener: %v", listenErr)
				}
				connectableListener = listener
			}
		},
		RegistryFactory: func(string) (*localsessions.Registry, error) {
			return registry, nil
		},
		ProcessStarter: func(processStartRequest) (startedProcess, error) {
			processStarterCalled++
			return nil, errors.New("unexpected process start")
		},
	})
	if err != nil {
		t.Fatalf("new local IDE session launcher: %v", err)
	}

	result, err := launcher.EnsureSession(input)
	if err != nil {
		t.Fatalf("ensure session: %v", err)
	}
	if processStarterCalled != 0 {
		t.Fatalf("expected no process spawn while recent session was still within extended grace, got %d starts", processStarterCalled)
	}
	if result.StartedNew {
		t.Fatal("expected recent session reuse, got StartedNew=true")
	}
	if result.Session.ID != session.ID {
		t.Fatalf("expected reused recent session %q, got %q", session.ID, result.Session.ID)
	}
	if current.Sub(session.StartedAt) <= defaultExistingSessionWait {
		t.Fatalf("expected reuse to happen after base wait %s, current age %s", defaultExistingSessionWait, current.Sub(session.StartedAt))
	}
}

func TestLoadIDELaunchConfigUsesProfileRuntimeSettaHomeWhenLookupHomeProvided(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	workspaceRoot := filepath.Join(root, "workspace")
	defaultSettaHome := filepath.Join(root, ".setta")
	profileLookupHome := defaultSettaHome
	profileRuntimeHome := filepath.Join(root, ".setta-development")
	runtimeRoot := filepath.Join(root, "runtime")
	for _, path := range []string{workspaceRoot, defaultSettaHome, profileLookupHome, profileRuntimeHome, runtimeRoot} {
		if err := os.MkdirAll(path, 0o755); err != nil {
			t.Fatalf("mkdir %q: %v", path, err)
		}
	}
	writeSessionLauncherProfile(t, profileLookupHome, workspaceRoot, profileRuntimeHome)

	location := "local"
	cfg, err := loadIDELaunchConfig(IDELaunchInput{
		WorkspaceRoot:      workspaceRoot,
		SettaHome:          defaultSettaHome,
		ProfileLookupHome:  profileLookupHome,
		Profile:            "dev",
		SettaFilesLocation: &location,
		RuntimeRoot:        runtimeRoot,
	})
	if err != nil {
		t.Fatalf("load launch config: %v", err)
	}

	if cfg.Paths.SettaHome != profileRuntimeHome {
		t.Fatalf("expected profile runtime setta home %q, got %q", profileRuntimeHome, cfg.Paths.SettaHome)
	}
	if cfg.Paths.ProfileLookupHome != profileLookupHome {
		t.Fatalf("expected profile lookup home %q, got %q", profileLookupHome, cfg.Paths.ProfileLookupHome)
	}
	if cfg.Paths.ProfileName != "dev" {
		t.Fatalf("expected profile name %q, got %q", "dev", cfg.Paths.ProfileName)
	}
}

func TestLoadIDELaunchConfigIgnoresAmbientSettaEnvOverrides(t *testing.T) {
	root := t.TempDir()
	workspaceRoot := filepath.Join(root, "workspace")
	settaHome := filepath.Join(root, ".setta")
	ambientSettaHome := filepath.Join(root, "ambient-home")
	ambientFilesRoot := filepath.Join(root, "ambient-files")
	ambientRuntimeRoot := filepath.Join(root, "ambient-runtime")
	for _, path := range []string{workspaceRoot, settaHome, ambientSettaHome, ambientFilesRoot, ambientRuntimeRoot} {
		if err := os.MkdirAll(path, 0o755); err != nil {
			t.Fatalf("mkdir %q: %v", path, err)
		}
	}

	t.Setenv("SETTA_HOME", ambientSettaHome)
	t.Setenv("SETTA_FILES_ROOT", ambientFilesRoot)
	t.Setenv("SETTA_FILES_LOCATION", "global")
	t.Setenv("SETTA_RUNTIME_ROOT", ambientRuntimeRoot)
	t.Setenv("SETTA_PROFILE", "ambient-profile")

	cfg, err := loadIDELaunchConfig(IDELaunchInput{
		WorkspaceRoot: workspaceRoot,
		SettaHome:     settaHome,
	})
	if err != nil {
		t.Fatalf("load launch config: %v", err)
	}

	// Config resolution must come only from the requested launch input, not ambient SETTA_* state.
	if cfg.Paths.SettaHome != settaHome {
		t.Fatalf("expected requested setta home %q, got %q", settaHome, cfg.Paths.SettaHome)
	}
	if cfg.Paths.SettaFilesRoot == ambientFilesRoot {
		t.Fatalf("expected ambient setta files root to be ignored, got %#v", cfg.Paths)
	}
	if cfg.Paths.RuntimeRoot == ambientRuntimeRoot {
		t.Fatalf("expected ambient runtime root to be ignored, got %#v", cfg.Paths)
	}
	if cfg.Paths.ProfileName != "" {
		t.Fatalf("expected ambient profile to be ignored, got %#v", cfg.Paths)
	}
}

func TestLocalIDESessionLauncherEnsureSessionSurfacesLaunchFailureTailAndLogPath(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	workspaceRoot := filepath.Join(root, "workspace")
	settaHome := filepath.Join(root, ".setta")
	runtimeRoot := filepath.Join(root, "runtime")
	for _, path := range []string{workspaceRoot, settaHome, runtimeRoot} {
		if err := os.MkdirAll(path, 0o755); err != nil {
			t.Fatalf("mkdir %q: %v", path, err)
		}
	}

	sessionsRoot := filepath.Join(runtimeRoot, "sessions")
	registry, err := localsessions.NewRegistry(localsessions.RegistryOptions{
		SessionsRoot:  sessionsRoot,
		PIDCreateTime: func(int) *float64 { return nil },
	})
	if err != nil {
		t.Fatalf("new session registry: %v", err)
	}

	logPath := filepath.Join(root, "launch.log")
	logContent := "HEAD-MARKER\n" + strings.Repeat("x", 9000) + "\nTAIL-MARKER\n"
	if err := os.WriteFile(logPath, []byte(logContent), 0o644); err != nil {
		t.Fatalf("write launch log: %v", err)
	}

	launcher, err := NewLocalIDESessionLauncher(LocalIDESessionLauncherOptions{
		ExecutablePath: "/tmp/setta-server",
		RegistryFactory: func(string) (*localsessions.Registry, error) {
			return registry, nil
		},
		ProcessStarter: func(processStartRequest) (startedProcess, error) {
			return &testStartedProcess{exited: true, logPath: logPath}, nil
		},
	})
	if err != nil {
		t.Fatalf("new local IDE session launcher: %v", err)
	}

	location := "local"
	_, err = launcher.EnsureSession(IDELaunchInput{
		WorkspaceRoot:      workspaceRoot,
		SettaHome:          settaHome,
		SettaFilesLocation: &location,
		RuntimeRoot:        runtimeRoot,
	})
	if err == nil {
		t.Fatal("expected launch failure")
	}
	var launchErr *SessionLaunchError
	if !errors.As(err, &launchErr) {
		t.Fatalf("expected SessionLaunchError, got %T: %v", err, err)
	}
	if launchErr.Code != "LaunchFailed" {
		t.Fatalf("expected LaunchFailed, got %q (%v)", launchErr.Code, err)
	}
	if strings.Contains(launchErr.Message, "HEAD-MARKER") {
		t.Fatalf("expected truncated log tail to omit head marker, got %q", launchErr.Message)
	}
	if !strings.Contains(launchErr.Message, "TAIL-MARKER") {
		t.Fatalf("expected tail marker in launch failure, got %q", launchErr.Message)
	}
	if !strings.Contains(launchErr.Message, logPath) {
		t.Fatalf("expected log path in launch failure, got %q", launchErr.Message)
	}
}

func TestLocalIDESessionLauncherEnsureSessionReturnsInvalidRuntimeRootWhenRuntimeLogInitFails(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	workspaceRoot := filepath.Join(root, "workspace")
	settaHome := filepath.Join(root, ".setta")
	for _, path := range []string{workspaceRoot, settaHome} {
		if err := os.MkdirAll(path, 0o755); err != nil {
			t.Fatalf("mkdir %q: %v", path, err)
		}
	}

	runtimeRoot := filepath.Join(root, "runtime")
	if err := os.MkdirAll(runtimeRoot, 0o755); err != nil {
		t.Fatalf("mkdir runtime root: %v", err)
	}
	if err := os.WriteFile(filepath.Join(runtimeRoot, "logs"), []byte("not-a-directory"), 0o644); err != nil {
		t.Fatalf("write conflicting logs file: %v", err)
	}

	registry, err := localsessions.NewRegistry(localsessions.RegistryOptions{
		SessionsRoot:  filepath.Join(root, "registry"),
		PIDCreateTime: func(int) *float64 { return nil },
	})
	if err != nil {
		t.Fatalf("new session registry: %v", err)
	}

	launcher, err := NewLocalIDESessionLauncher(LocalIDESessionLauncherOptions{
		ExecutablePath: "/tmp/setta-server",
		RegistryFactory: func(string) (*localsessions.Registry, error) {
			return registry, nil
		},
		ProcessStarter: startLauncherProcess,
	})
	if err != nil {
		t.Fatalf("new local IDE session launcher: %v", err)
	}

	location := "local"
	_, err = launcher.EnsureSession(IDELaunchInput{
		WorkspaceRoot:      workspaceRoot,
		SettaHome:          settaHome,
		SettaFilesLocation: &location,
		RuntimeRoot:        runtimeRoot,
	})
	if err == nil {
		t.Fatal("expected invalid runtime root launch failure")
	}
	var launchErr *SessionLaunchError
	if !errors.As(err, &launchErr) {
		t.Fatalf("expected SessionLaunchError, got %T: %v", err, err)
	}
	if launchErr.Code != "InvalidRuntimeRoot" {
		t.Fatalf("expected InvalidRuntimeRoot, got %q (%v)", launchErr.Code, err)
	}
	expectedLogsPath := filepath.Join(runtimeRoot, "logs")
	if !strings.Contains(launchErr.Message, expectedLogsPath) {
		t.Fatalf("expected runtime logs path %q in message, got %q", expectedLogsPath, launchErr.Message)
	}
}

func TestLocalIDESessionLauncherEnsureSessionReturnsTypedOutdatedSettingsError(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	workspaceRoot := filepath.Join(root, "workspace")
	settaHome := filepath.Join(root, ".setta")
	runtimeRoot := filepath.Join(root, "runtime")
	for _, path := range []string{workspaceRoot, settaHome, runtimeRoot} {
		if err := os.MkdirAll(path, 0o755); err != nil {
			t.Fatalf("mkdir %q: %v", path, err)
		}
	}

	location := "local"
	input := IDELaunchInput{
		WorkspaceRoot:      workspaceRoot,
		SettaHome:          settaHome,
		SettaFilesLocation: &location,
		RuntimeRoot:        runtimeRoot,
	}
	cfg, err := loadIDELaunchConfig(input)
	if err != nil {
		t.Fatalf("load launch config: %v", err)
	}
	writeCorruptedSettingsProjectForLauncher(t, cfg.Paths.SettaFilesRoot)

	processStarterCalled := false
	launcher, err := NewLocalIDESessionLauncher(LocalIDESessionLauncherOptions{
		ExecutablePath: "/tmp/setta-server",
		ProcessStarter: func(processStartRequest) (startedProcess, error) {
			processStarterCalled = true
			return nil, errors.New("unexpected process start")
		},
	})
	if err != nil {
		t.Fatalf("new local IDE session launcher: %v", err)
	}

	_, err = launcher.EnsureSession(input)
	if err == nil {
		t.Fatal("expected outdated settings launch failure")
	}
	var launchErr *SessionLaunchError
	if !errors.As(err, &launchErr) {
		t.Fatalf("expected SessionLaunchError, got %T: %v", err, err)
	}
	if launchErr.Code != "OutdatedProjectSettings" {
		t.Fatalf("expected OutdatedProjectSettings, got %q (%v)", launchErr.Code, err)
	}
	if !strings.Contains(launchErr.Message, "older Setta settings/project format") {
		t.Fatalf("expected migration guidance, got %q", launchErr.Message)
	}
	if !strings.Contains(launchErr.Message, "spreadsheetSectionDefault") {
		t.Fatalf("expected missing section name in message, got %q", launchErr.Message)
	}
	if processStarterCalled {
		t.Fatal("expected outdated settings preflight to stop before process start")
	}
}

func TestLocalIDESessionLauncherEnsureSessionIgnoresMalformedSettingsProjectPreflightErrors(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	workspaceRoot := filepath.Join(root, "workspace")
	settaHome := filepath.Join(root, ".setta")
	runtimeRoot := filepath.Join(root, "runtime")
	for _, path := range []string{workspaceRoot, settaHome, runtimeRoot} {
		if err := os.MkdirAll(path, 0o755); err != nil {
			t.Fatalf("mkdir %q: %v", path, err)
		}
	}

	location := "local"
	input := IDELaunchInput{
		WorkspaceRoot:      workspaceRoot,
		SettaHome:          settaHome,
		SettaFilesLocation: &location,
		RuntimeRoot:        runtimeRoot,
	}
	cfg, err := loadIDELaunchConfig(input)
	if err != nil {
		t.Fatalf("load launch config: %v", err)
	}
	projectPaths, err := projectstate.ResolvePaths(cfg.Paths.SettaFilesRoot)
	if err != nil {
		t.Fatalf("resolve project paths: %v", err)
	}
	if err := os.MkdirAll(filepath.Dir(projectPaths.Settings), 0o755); err != nil {
		t.Fatalf("mkdir settings project dir: %v", err)
	}
	if err := os.WriteFile(projectPaths.Settings, []byte("{not-json"), 0o644); err != nil {
		t.Fatalf("write malformed settings project payload: %v", err)
	}

	processStarterCalled := false
	launcher, err := NewLocalIDESessionLauncher(LocalIDESessionLauncherOptions{
		ExecutablePath: "/tmp/setta-server",
		ProcessStarter: func(processStartRequest) (startedProcess, error) {
			processStarterCalled = true
			return &testStartedProcess{exited: true, logPath: filepath.Join(root, "launch.log")}, nil
		},
	})
	if err != nil {
		t.Fatalf("new local IDE session launcher: %v", err)
	}

	_, err = launcher.EnsureSession(input)
	if err == nil {
		t.Fatal("expected launch failure after process start")
	}
	var launchErr *SessionLaunchError
	if !errors.As(err, &launchErr) {
		t.Fatalf("expected SessionLaunchError, got %T: %v", err, err)
	}
	if launchErr.Code == "OutdatedProjectSettings" {
		t.Fatalf("expected malformed settings project errors to be ignored, got %q", launchErr.Code)
	}
	if !processStarterCalled {
		t.Fatal("expected malformed settings project preflight to allow process start")
	}
}

func TestStartLauncherProcessCreatesRuntimeLogFile(t *testing.T) {
	t.Parallel()

	runtimeRoot := filepath.Join(t.TempDir(), "runtime")
	process, err := startLauncherProcess(processStartRequest{
		Args:        launchLogTestCommand(t),
		CWD:         t.TempDir(),
		RuntimeRoot: runtimeRoot,
	})
	if err != nil {
		t.Fatalf("start launcher process: %v", err)
	}

	deadline := time.Now().Add(5 * time.Second)
	for !process.Exited() && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	if !process.Exited() {
		_ = process.Kill()
		t.Fatal("expected launch process to exit")
	}

	logPath := process.LogPath()
	expectedDir := filepath.Join(runtimeRoot, "logs") + string(os.PathSeparator)
	if !strings.HasPrefix(logPath, expectedDir) {
		t.Fatalf("expected launch log under %q, got %q", expectedDir, logPath)
	}
	content, err := os.ReadFile(logPath)
	if err != nil {
		t.Fatalf("read launch log: %v", err)
	}
	logOutput := string(content)
	if !strings.Contains(logOutput, "stdout-line") {
		t.Fatalf("expected stdout in launch log, got %q", logOutput)
	}
	if !strings.Contains(logOutput, "stderr-line") {
		t.Fatalf("expected stderr in launch log, got %q", logOutput)
	}
}

func TestStartLauncherProcessReturnsInvalidRuntimeRootForRuntimeLogInitFailure(t *testing.T) {
	t.Parallel()

	runtimeRoot := filepath.Join(t.TempDir(), "runtime")
	if err := os.MkdirAll(runtimeRoot, 0o755); err != nil {
		t.Fatalf("mkdir runtime root: %v", err)
	}
	if err := os.WriteFile(filepath.Join(runtimeRoot, "logs"), []byte("not-a-directory"), 0o644); err != nil {
		t.Fatalf("write conflicting logs file: %v", err)
	}

	_, err := startLauncherProcess(processStartRequest{
		Args:        []string{"/tmp/setta-server"},
		CWD:         t.TempDir(),
		RuntimeRoot: runtimeRoot,
	})
	if err == nil {
		t.Fatal("expected invalid runtime root error")
	}
	var invalidRuntimeErr *invalidRuntimeRootError
	if !errors.As(err, &invalidRuntimeErr) {
		t.Fatalf("expected invalidRuntimeRootError, got %T: %v", err, err)
	}
	expectedLogsPath := filepath.Join(runtimeRoot, "logs")
	if !strings.Contains(invalidRuntimeErr.Error(), expectedLogsPath) {
		t.Fatalf("expected runtime logs path %q in message, got %q", expectedLogsPath, invalidRuntimeErr.Error())
	}
}

func TestExecStartedProcessKillTerminatesSpawnedProcessTree(t *testing.T) {
	t.Parallel()

	runtimeRoot := filepath.Join(t.TempDir(), "runtime")
	childPIDPath := filepath.Join(t.TempDir(), "child.pid")
	process, err := startLauncherProcess(processStartRequest{
		Args:        launchCleanupTestCommand(t, childPIDPath),
		CWD:         t.TempDir(),
		RuntimeRoot: runtimeRoot,
	})
	if err != nil {
		t.Fatalf("start launcher process: %v", err)
	}

	childPID := waitForLauncherChildPID(t, childPIDPath)
	if !waitForProcessRunning(childPID, 5*time.Second) {
		t.Fatalf("expected spawned child process %d to be running before cleanup", childPID)
	}
	if err := process.Kill(); err != nil {
		t.Fatalf("kill launcher process tree: %v", err)
	}
	if !waitForProcessStopped(childPID, 5*time.Second) {
		t.Fatalf("expected child process %d to stop after process tree kill", childPID)
	}
}

func TestLocalIDESessionLauncherEnsureSessionTimeoutTerminatesSpawnedProcessTree(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	workspaceRoot := filepath.Join(root, "workspace")
	settaHome := filepath.Join(root, ".setta")
	runtimeRoot := filepath.Join(root, "runtime")
	for _, path := range []string{workspaceRoot, settaHome, runtimeRoot} {
		if err := os.MkdirAll(path, 0o755); err != nil {
			t.Fatalf("mkdir %q: %v", path, err)
		}
	}

	location := "local"
	input := IDELaunchInput{
		WorkspaceRoot:      workspaceRoot,
		SettaHome:          settaHome,
		SettaFilesLocation: &location,
		RuntimeRoot:        runtimeRoot,
		ServerMode:         config.ModeIDE,
	}
	cfg, err := loadIDELaunchConfig(input)
	if err != nil {
		t.Fatalf("load launch config: %v", err)
	}
	registry, err := localsessions.NewRegistry(localsessions.RegistryOptions{
		SessionsRoot:  filepath.Join(cfg.Paths.RuntimeRoot, "sessions"),
		PIDCreateTime: func(int) *float64 { return nil },
	})
	if err != nil {
		t.Fatalf("new session registry: %v", err)
	}

	childPIDPath := filepath.Join(root, "timeout-child.pid")
	launcher, err := NewLocalIDESessionLauncher(LocalIDESessionLauncherOptions{
		ExecutablePath: "/tmp/setta-server",
		LaunchTimeout:  250 * time.Millisecond,
		PollInterval:   10 * time.Millisecond,
		RegistryFactory: func(string) (*localsessions.Registry, error) {
			return registry, nil
		},
		ProcessStarter: func(request processStartRequest) (startedProcess, error) {
			return startLauncherProcess(processStartRequest{
				Args:        launchCleanupTestCommand(t, childPIDPath),
				CWD:         request.CWD,
				RuntimeRoot: request.RuntimeRoot,
			})
		},
	})
	if err != nil {
		t.Fatalf("new local IDE session launcher: %v", err)
	}

	_, err = launcher.EnsureSession(input)
	if err == nil {
		t.Fatal("expected launch timeout")
	}
	var launchErr *SessionLaunchError
	if !errors.As(err, &launchErr) {
		t.Fatalf("expected SessionLaunchError, got %T: %v", err, err)
	}
	if launchErr.Code != "LaunchTimeout" {
		t.Fatalf("expected LaunchTimeout, got %q (%v)", launchErr.Code, err)
	}

	childPID := waitForLauncherChildPID(t, childPIDPath)
	if !waitForProcessStopped(childPID, 5*time.Second) {
		t.Fatalf("expected timed-out launcher cleanup to stop child process %d", childPID)
	}
}

type testStartedProcess struct {
	exited  bool
	logPath string
}

func (p *testStartedProcess) Exited() bool {
	return p.exited
}

func (p *testStartedProcess) Kill() error {
	return nil
}

func (p *testStartedProcess) LogPath() string {
	return p.logPath
}

func createConnectableLauncherSession(t *testing.T, registry *localsessions.Registry, input localsessions.CreateSessionInput) auth.SessionMetadata {
	t.Helper()

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen for test session: %v", err)
	}
	t.Cleanup(func() {
		_ = listener.Close()
	})
	addr := listener.Addr().(*net.TCPAddr)

	input.Host = "127.0.0.1"
	input.Port = addr.Port
	input.PID = os.Getpid()
	session, err := registry.CreateSession(input)
	if err != nil {
		t.Fatalf("create session: %v", err)
	}
	return session
}

func launchLogTestCommand(t *testing.T) []string {
	t.Helper()

	switch runtime.GOOS {
	case "windows":
		return []string{"cmd.exe", "/c", "(echo stdout-line) & (echo stderr-line 1>&2)"}
	default:
		return []string{"/bin/sh", "-c", "printf 'stdout-line\\n'; printf 'stderr-line\\n' >&2"}
	}
}

func launchCleanupTestCommand(t *testing.T, childPIDPath string) []string {
	t.Helper()

	switch runtime.GOOS {
	case "windows":
		return []string{
			"powershell.exe",
			"-NoProfile",
			"-NonInteractive",
			"-Command",
			fmt.Sprintf(
				"$child = Start-Process powershell -ArgumentList '-NoProfile','-NonInteractive','-Command','Start-Sleep -Seconds 60' -PassThru; Set-Content -Path '%s' -Value $child.Id; Start-Sleep -Seconds 60",
				escapePowerShellSingleQuotedString(childPIDPath),
			),
		}
	default:
		return []string{
			"/bin/sh",
			"-c",
			fmt.Sprintf("(sleep 60) & child=$!; printf '%%s\\n' \"$child\" > %s; sleep 60", shellSingleQuote(childPIDPath)),
		}
	}
}

func waitForLauncherChildPID(t *testing.T, path string) int {
	t.Helper()

	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		content, err := os.ReadFile(path)
		if err == nil {
			trimmedContent := strings.TrimSpace(string(content))
			if trimmedContent == "" {
				time.Sleep(10 * time.Millisecond)
				continue
			}
			pid, parseErr := strconv.Atoi(trimmedContent)
			if parseErr != nil {
				t.Fatalf("parse child pid %q: %v", string(content), parseErr)
			}
			if pid <= 0 {
				t.Fatalf("expected positive child pid, got %d", pid)
			}
			return pid
		}
		if !errors.Is(err, os.ErrNotExist) {
			t.Fatalf("read child pid file %q: %v", path, err)
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for child pid file %q", path)
	return 0
}

func waitForProcessRunning(pid int, timeout time.Duration) bool {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if processRunning(pid) {
			return true
		}
		time.Sleep(10 * time.Millisecond)
	}
	return processRunning(pid)
}

func waitForProcessStopped(pid int, timeout time.Duration) bool {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if !processRunning(pid) {
			return true
		}
		time.Sleep(10 * time.Millisecond)
	}
	return !processRunning(pid)
}

func processRunning(pid int) bool {
	proc, err := process.NewProcess(int32(pid))
	if err != nil {
		return false
	}
	running, err := proc.IsRunning()
	return err == nil && running
}

func shellSingleQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "'\"'\"'") + "'"
}

func escapePowerShellSingleQuotedString(value string) string {
	return strings.ReplaceAll(value, "'", "''")
}

func writeSessionLauncherProfile(t *testing.T, profileLookupHome string, workspaceRoot string, settaHome string) {
	t.Helper()

	profilesDir := filepath.Join(profileLookupHome, "profiles")
	if err := os.MkdirAll(profilesDir, 0o755); err != nil {
		t.Fatalf("mkdir profiles dir: %v", err)
	}
	payload, err := json.Marshal(map[string]any{
		"name":               "dev",
		"workspaceRoot":      workspaceRoot,
		"settaHome":          settaHome,
		"settaFilesLocation": "local",
	})
	if err != nil {
		t.Fatalf("marshal profile payload: %v", err)
	}
	if err := os.WriteFile(filepath.Join(profilesDir, "dev.json"), payload, 0o644); err != nil {
		t.Fatalf("write profile config: %v", err)
	}
}

func writeCorruptedSettingsProjectForLauncher(t *testing.T, settaFilesRoot string) {
	t.Helper()

	settingsDocument, err := settingsstate.DefaultDocument()
	if err != nil {
		t.Fatalf("default settings document: %v", err)
	}
	projectDocument, err := settingsstate.BuildProjectDocument(settingsDocument)
	if err != nil {
		t.Fatalf("build settings project document: %v", err)
	}
	settingsProject := projectDocument.Projects[settingsstate.SettingsProjectID]
	removeLauncherSettingsProjectSectionByName(&settingsProject, "spreadsheetSectionDefault")
	projectDocument.Projects[settingsstate.SettingsProjectID] = settingsProject

	projectPaths, err := projectstate.ResolvePaths(settaFilesRoot)
	if err != nil {
		t.Fatalf("resolve project paths: %v", err)
	}
	store, err := projectstate.NewStore(projectPaths.Settings, projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("new settings project store: %v", err)
	}
	if err := store.Save(t.Context(), projectDocument); err != nil {
		t.Fatalf("save corrupted settings project document: %v", err)
	}
}

func removeLauncherSettingsProjectSectionByName(project *projectstate.Project, sectionName string) {
	sectionID := ""
	for candidateID, section := range project.Sections {
		if section.Name == sectionName {
			sectionID = candidateID
			break
		}
	}
	if sectionID == "" {
		return
	}

	variantID := project.SectionVariantMap[sectionID]
	delete(project.SectionVariantMap, sectionID)
	delete(project.Sections, sectionID)
	delete(project.TopLevelSections, sectionID)

	filteredSectionIDs := make([]string, 0, len(project.TopLevelSectionIDs))
	for _, topLevelSectionID := range project.TopLevelSectionIDs {
		if topLevelSectionID == sectionID {
			continue
		}
		filteredSectionIDs = append(filteredSectionIDs, topLevelSectionID)
	}
	project.TopLevelSectionIDs = filteredSectionIDs

	if variantID != "" {
		sectionVariant := project.SectionVariants[variantID]
		delete(project.SectionVariants, variantID)
		if sectionVariant.ImplID != "" {
			delete(project.SectionImpls, sectionVariant.ImplID)
		}
	}

	for viewModeID, viewMode := range project.ViewModes {
		delete(viewMode.VisibilityBySectionID, sectionID)
		delete(viewMode.TopLevelSections, sectionID)
		project.ViewModes[viewModeID] = viewMode
	}
}
