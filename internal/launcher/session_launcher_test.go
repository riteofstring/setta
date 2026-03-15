package launcher

import (
	"strings"
	"testing"

	"setta/internal/config"
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
