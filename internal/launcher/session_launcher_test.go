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
