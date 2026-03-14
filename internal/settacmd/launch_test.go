package settacmd

import (
	"bytes"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"setta/internal/auth"
	"setta/internal/config"
	"setta/internal/launcher"
)

func TestRunLaunchRequiresJSON(t *testing.T) {
	t.Parallel()

	_, _, err := runSettaCommand(t, "launch")
	if err == nil {
		t.Fatal("expected launch to require --json")
	}
	if code := ExitCode(err); code != 2 {
		t.Fatalf("expected exit code 2, got %d", code)
	}
	if got := DisplayError(err); got != "use --json with launch" {
		t.Fatalf("expected launch json guidance, got %q", got)
	}
}

func TestRunLaunchEmitsJSONPayloadAndUsesSessionLauncher(t *testing.T) {
	t.Parallel()

	workspaceRoot := filepath.Join(t.TempDir(), "workspace")
	settaHome := filepath.Join(t.TempDir(), ".setta")
	runtimeRoot := filepath.Join(t.TempDir(), "runtime")
	profileLookupHome := filepath.Join(t.TempDir(), ".setta-profiles")
	startedAt := time.Date(2026, time.March, 8, 12, 30, 0, 0, time.UTC)
	currentExecutable := filepath.Join(t.TempDir(), "bin", "setta")
	serverExecutable := filepath.Join(t.TempDir(), "bin", "setta-server")

	var capturedServerExecutable string
	var capturedTimeout time.Duration
	var capturedInput launcher.IDELaunchInput
	deps := testLaunchDependencies(t, launchTestOptions{
		resolveCurrentExecutable: func() (string, error) {
			return currentExecutable, nil
		},
		resolveServerExecutable: func(resolvedCurrentExecutable string, envLookup func(string) (string, bool)) (string, error) {
			if resolvedCurrentExecutable != currentExecutable {
				t.Fatalf("expected current executable %q, got %q", currentExecutable, resolvedCurrentExecutable)
			}
			return serverExecutable, nil
		},
		newSessionLauncher: func(serverExecutable string, launchTimeout time.Duration) (launcher.IDEWorkspaceSessionLauncher, error) {
			capturedServerExecutable = serverExecutable
			capturedTimeout = launchTimeout
			return launcherRootSessionLauncherFunc(func(input launcher.IDELaunchInput) (launcher.IDELaunchResult, error) {
				capturedInput = input
				return launchResultForTest(input, startedAt, false), nil
			}), nil
		},
		now: func() time.Time {
			return startedAt
		},
	})

	stdout, stderr, err := runLaunchCommandWithDeps(
		t,
		[]string{
			"--json",
			"--workspace", workspaceRoot,
			"--profile", "dev",
			"--setta-home", settaHome,
			"--setta-files-location", "local",
			"--runtime-root", runtimeRoot,
			"--timeout", "12.5",
		},
		globalFlags{profileLookupHome: profileLookupHome},
		t.TempDir(),
		deps,
	)
	if err != nil {
		t.Fatalf("run launch: %v", err)
	}
	if stderr != "" {
		t.Fatalf("expected empty stderr, got %q", stderr)
	}

	payload := decodeJSONPayload(t, stdout)
	if got := payload["ok"]; got != true {
		t.Fatalf("expected ok payload, got %#v", payload)
	}
	if got := payload["bootstrapUrlFragment"]; got != "http://127.0.0.1:61234/__setta__/bootstrap#token=tok" {
		t.Fatalf("unexpected bootstrap url fragment %#v", got)
	}
	if got := payload["workspaceRoot"]; got != workspaceRoot {
		t.Fatalf("expected workspaceRoot %q, got %#v", workspaceRoot, got)
	}
	if got := payload["settaFilesLocation"]; got != "local" {
		t.Fatalf("expected settaFilesLocation local, got %#v", got)
	}
	if got := payload["runtimeRoot"]; got != runtimeRoot {
		t.Fatalf("expected runtimeRoot %q, got %#v", runtimeRoot, got)
	}
	if got := payload["settaHome"]; got != settaHome {
		t.Fatalf("expected settaHome %q, got %#v", settaHome, got)
	}
	if got := payload["profile"]; got != "dev" {
		t.Fatalf("expected profile dev, got %#v", got)
	}
	if got := payload["sessionId"]; got != "session-1" {
		t.Fatalf("expected sessionId session-1, got %#v", got)
	}
	if got := payload["startedNew"]; got != false {
		t.Fatalf("expected startedNew false, got %#v", got)
	}

	sessionPayload, ok := payload["session"].(map[string]any)
	if !ok {
		t.Fatalf("expected nested session payload, got %#v", payload["session"])
	}
	if got := sessionPayload["workspacePath"]; got != workspaceRoot {
		t.Fatalf("expected workspacePath %q, got %#v", workspaceRoot, got)
	}
	if got := sessionPayload["serverMode"]; got != "ide" {
		t.Fatalf("expected serverMode ide, got %#v", got)
	}

	if capturedServerExecutable != serverExecutable {
		t.Fatalf("expected server executable %q, got %q", serverExecutable, capturedServerExecutable)
	}
	if capturedTimeout != 12500*time.Millisecond {
		t.Fatalf("expected launch timeout 12.5s, got %v", capturedTimeout)
	}
	if capturedInput.WorkspaceRoot != workspaceRoot {
		t.Fatalf("expected workspace input %q, got %q", workspaceRoot, capturedInput.WorkspaceRoot)
	}
	if capturedInput.Profile != "dev" {
		t.Fatalf("expected profile input dev, got %q", capturedInput.Profile)
	}
	if capturedInput.SettaHome != settaHome {
		t.Fatalf("expected settaHome input %q, got %q", settaHome, capturedInput.SettaHome)
	}
	if capturedInput.ProfileLookupHome != profileLookupHome {
		t.Fatalf("expected profileLookupHome %q, got %q", profileLookupHome, capturedInput.ProfileLookupHome)
	}
	if capturedInput.SettaFilesLocation == nil || *capturedInput.SettaFilesLocation != "local" {
		t.Fatalf("expected settaFilesLocation local, got %#v", capturedInput.SettaFilesLocation)
	}
	if capturedInput.RuntimeRoot != runtimeRoot {
		t.Fatalf("expected runtimeRoot input %q, got %q", runtimeRoot, capturedInput.RuntimeRoot)
	}
	if capturedInput.ServerMode != config.ModeIDE {
		t.Fatalf("expected ide server mode, got %q", capturedInput.ServerMode)
	}
}

func TestRunLaunchDefaultsWorkspaceToCWD(t *testing.T) {
	t.Parallel()

	cwd := t.TempDir()
	var capturedInput launcher.IDELaunchInput
	deps := testLaunchDependencies(t, launchTestOptions{
		newSessionLauncher: func(string, time.Duration) (launcher.IDEWorkspaceSessionLauncher, error) {
			return launcherRootSessionLauncherFunc(func(input launcher.IDELaunchInput) (launcher.IDELaunchResult, error) {
				capturedInput = input
				return launchResultForTest(input, time.Date(2026, time.March, 8, 12, 30, 0, 0, time.UTC), true), nil
			}), nil
		},
	})

	stdout, stderr, err := runLaunchCommandWithDeps(t, []string{"--json"}, globalFlags{}, cwd, deps)
	if err != nil {
		t.Fatalf("run launch: %v", err)
	}
	if stderr != "" {
		t.Fatalf("expected empty stderr, got %q", stderr)
	}

	payload := decodeJSONPayload(t, stdout)
	if got := payload["workspaceRoot"]; got != cwd {
		t.Fatalf("expected workspaceRoot %q, got %#v", cwd, got)
	}
	if capturedInput.WorkspaceRoot != cwd {
		t.Fatalf("expected workspace input %q, got %q", cwd, capturedInput.WorkspaceRoot)
	}
}

func TestRunLaunchRejectsConflictingWorkspaceBetweenGlobalAndSubcommand(t *testing.T) {
	t.Parallel()

	globalWorkspace := filepath.Join(t.TempDir(), "workspace-a")
	commandWorkspace := filepath.Join(t.TempDir(), "workspace-b")

	stdout, stderr, err := runLaunchCommandWithDeps(
		t,
		[]string{"--json", "--workspace", commandWorkspace},
		globalFlags{workspaceRoot: globalWorkspace},
		t.TempDir(),
		launchDependencies{},
	)
	if err == nil {
		t.Fatal("expected conflicting workspace error")
	}
	if code := ExitCode(err); code != 2 {
		t.Fatalf("expected exit code 2, got %d", code)
	}
	if stderr != "" {
		t.Fatalf("expected empty stderr, got %q", stderr)
	}

	payload := decodeJSONPayload(t, stdout)
	errorPayload, ok := payload["error"].(map[string]any)
	if !ok {
		t.Fatalf("expected error payload, got %#v", payload)
	}
	if got := errorPayload["code"]; got != "BadRequest" {
		t.Fatalf("expected BadRequest error, got %#v", got)
	}
	message, ok := errorPayload["message"].(string)
	if !ok {
		t.Fatalf("expected string error message, got %#v", errorPayload["message"])
	}
	if !strings.Contains(message, "Conflicting --workspace") {
		t.Fatalf("expected conflicting workspace message, got %q", message)
	}
}

func TestRunLaunchReturnsNilSettaFilesLocationForExplicitRoot(t *testing.T) {
	t.Parallel()

	explicitSettaFilesRoot := filepath.Join(t.TempDir(), "state", "setta_files_custom")
	deps := testLaunchDependencies(t, launchTestOptions{
		newSessionLauncher: func(string, time.Duration) (launcher.IDEWorkspaceSessionLauncher, error) {
			return launcherRootSessionLauncherFunc(func(input launcher.IDELaunchInput) (launcher.IDELaunchResult, error) {
				return launchResultForTest(input, time.Date(2026, time.March, 8, 12, 30, 0, 0, time.UTC), true), nil
			}), nil
		},
	})

	stdout, stderr, err := runLaunchCommandWithDeps(
		t,
		[]string{"--json", "--setta-files-root", explicitSettaFilesRoot},
		globalFlags{},
		t.TempDir(),
		deps,
	)
	if err != nil {
		t.Fatalf("run launch: %v", err)
	}
	if stderr != "" {
		t.Fatalf("expected empty stderr, got %q", stderr)
	}

	payload := decodeJSONPayload(t, stdout)
	if got := payload["settaFilesLocation"]; got != nil {
		t.Fatalf("expected nil settaFilesLocation for explicit root, got %#v", got)
	}
	if got := payload["settaFilesRoot"]; got != explicitSettaFilesRoot {
		t.Fatalf("expected explicit settaFilesRoot %q, got %#v", explicitSettaFilesRoot, got)
	}
}

func TestRunLaunchSurfacesSessionLaunchErrorAsJSON(t *testing.T) {
	t.Parallel()

	deps := testLaunchDependencies(t, launchTestOptions{
		newSessionLauncher: func(string, time.Duration) (launcher.IDEWorkspaceSessionLauncher, error) {
			return launcherRootSessionLauncherFunc(func(launcher.IDELaunchInput) (launcher.IDELaunchResult, error) {
				return launcher.IDELaunchResult{}, &launcher.SessionLaunchError{
					Code:    "LaunchFailed",
					Message: "session bootstrap failed",
				}
			}), nil
		},
	})

	stdout, stderr, err := runLaunchCommandWithDeps(t, []string{"--json"}, globalFlags{}, t.TempDir(), deps)
	if err == nil {
		t.Fatal("expected launch failure")
	}
	if code := ExitCode(err); code != 2 {
		t.Fatalf("expected exit code 2, got %d", code)
	}
	if stderr != "" {
		t.Fatalf("expected empty stderr, got %q", stderr)
	}

	payload := decodeJSONPayload(t, stdout)
	if got := payload["ok"]; got != false {
		t.Fatalf("expected ok=false payload, got %#v", payload)
	}
	errorPayload, ok := payload["error"].(map[string]any)
	if !ok {
		t.Fatalf("expected error payload, got %#v", payload)
	}
	if got := errorPayload["code"]; got != "LaunchFailed" {
		t.Fatalf("expected LaunchFailed error, got %#v", got)
	}
	if got := errorPayload["message"]; got != "session bootstrap failed" {
		t.Fatalf("expected session bootstrap message, got %#v", got)
	}
}

type launchTestOptions struct {
	resolveCurrentExecutable func() (string, error)
	resolveServerExecutable  func(string, func(string) (string, bool)) (string, error)
	newSessionLauncher       func(string, time.Duration) (launcher.IDEWorkspaceSessionLauncher, error)
	now                      func() time.Time
	mintBootstrapToken       func(string, []byte, time.Time) (string, error)
}

func testLaunchDependencies(t *testing.T, options launchTestOptions) launchDependencies {
	t.Helper()

	now := options.now
	if now == nil {
		now = func() time.Time {
			return time.Date(2026, time.March, 8, 12, 30, 0, 0, time.UTC)
		}
	}
	resolveCurrentExecutable := options.resolveCurrentExecutable
	if resolveCurrentExecutable == nil {
		resolveCurrentExecutable = func() (string, error) {
			return filepath.Join(t.TempDir(), "setta"), nil
		}
	}
	resolveServerExecutable := options.resolveServerExecutable
	if resolveServerExecutable == nil {
		resolveServerExecutable = func(string, func(string) (string, bool)) (string, error) {
			return filepath.Join(t.TempDir(), "setta-server"), nil
		}
	}
	newSessionLauncher := options.newSessionLauncher
	if newSessionLauncher == nil {
		newSessionLauncher = func(string, time.Duration) (launcher.IDEWorkspaceSessionLauncher, error) {
			return launcherRootSessionLauncherFunc(func(input launcher.IDELaunchInput) (launcher.IDELaunchResult, error) {
				return launchResultForTest(input, now(), true), nil
			}), nil
		}
	}
	mintBootstrapToken := options.mintBootstrapToken
	if mintBootstrapToken == nil {
		mintBootstrapToken = func(string, []byte, time.Time) (string, error) {
			return "tok", nil
		}
	}

	return launchDependencies{
		resolveCurrentExecutable: resolveCurrentExecutable,
		resolveServerExecutable:  resolveServerExecutable,
		newSessionLauncher:       newSessionLauncher,
		now:                      now,
		mintBootstrapToken:       mintBootstrapToken,
	}
}

func runLaunchCommandWithDeps(t *testing.T, args []string, global globalFlags, cwd string, deps launchDependencies) (string, string, error) {
	t.Helper()

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	err := runLaunchWithDeps(args, global, &stdout, &stderr, func(string) (string, bool) {
		return "", false
	}, cwd, deps)
	return stdout.String(), stderr.String(), err
}

func launchResultForTest(input launcher.IDELaunchInput, startedAt time.Time, startedNew bool) launcher.IDELaunchResult {
	workspaceRoot := filepath.Clean(input.WorkspaceRoot)
	settaHome := filepath.Clean(input.SettaHome)
	paths := config.Paths{
		WorkspaceRoot: workspaceRoot,
		SettaHome:     settaHome,
		ProfileName:   strings.TrimSpace(input.Profile),
	}
	if strings.TrimSpace(input.SettaFilesRoot) != "" {
		paths.SettaFilesRoot = filepath.Clean(input.SettaFilesRoot)
		paths.UsesExplicitSettaFiles = true
	} else {
		paths.ResolvedFilesLocation = config.ResolvedFilesLocationLocal
		if input.SettaFilesLocation != nil && strings.TrimSpace(*input.SettaFilesLocation) == string(config.FilesLocationGlobal) {
			paths.ResolvedFilesLocation = config.ResolvedFilesLocationGlobal
		}
		if paths.ResolvedFilesLocation == config.ResolvedFilesLocationGlobal {
			paths.SettaFilesRoot = filepath.Join(settaHome, "setta_files")
		} else {
			paths.SettaFilesRoot = filepath.Join(workspaceRoot, "setta_files")
		}
	}
	paths.RuntimeRoot = filepath.Join(paths.SettaFilesRoot, "runtime")
	if strings.TrimSpace(input.RuntimeRoot) != "" {
		paths.RuntimeRoot = filepath.Clean(input.RuntimeRoot)
	}

	session := auth.SessionMetadata{
		ID:                     "session-1",
		WorkspacePath:          workspaceRoot,
		WorkspacePathCanonical: workspaceRoot,
		Host:                   "127.0.0.1",
		Port:                   61234,
		PID:                    4321,
		StartedAt:              startedAt,
		SettaFilesLocation:     paths.ActiveSettaFilesLocation(),
		SettaFilesRoot:         paths.SettaFilesRoot,
		RuntimeRoot:            paths.RuntimeRoot,
		SettaHome:              paths.SettaHome,
		Profile:                paths.ProfileName,
		ServerMode:             string(config.ModeIDE),
	}

	return launcher.IDELaunchResult{
		Session:    session,
		Secret:     []byte("secret"),
		Paths:      paths,
		StartedNew: startedNew,
	}
}
