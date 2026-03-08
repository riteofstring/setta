package launcher

import "testing"

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
		Profile:            "dev",
		SettaFilesLocation: &auto,
		RuntimeRoot:        "/tmp/runtime",
	})
	if len(args) == 0 || args[0] != "/tmp/setta-server" {
		t.Fatalf("expected executable path to lead launch args, got %#v", args)
	}
}
