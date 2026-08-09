package settacmd

import (
	"bytes"
	"os"
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

	assertLaunchSuccessPayload(t, decodeJSONPayload(t, stdout), launchSuccessPayloadExpectation{
		WorkspaceRoot:        workspaceRoot,
		SettaHome:            settaHome,
		SettaFilesLocation:   "local",
		RuntimeRoot:          runtimeRoot,
		Profile:              "dev",
		BootstrapURLFragment: "http://127.0.0.1:61234/__setta__/bootstrap#token=tok",
		SessionID:            "session-1",
		StartedNew:           false,
	})
	assertLaunchCapturedInput(t, capturedInput, launchCapturedInputExpectation{
		ServerExecutable:         serverExecutable,
		CapturedServerExecutable: capturedServerExecutable,
		CapturedTimeout:          capturedTimeout,
		WorkspaceRoot:            workspaceRoot,
		Profile:                  "dev",
		SettaHome:                settaHome,
		ProfileLookupHome:        profileLookupHome,
		SettaFilesLocation:       "local",
		RuntimeRoot:              runtimeRoot,
		ServerMode:               config.ModeIDE,
	})
}

type launchSuccessPayloadExpectation struct {
	WorkspaceRoot        string
	SettaHome            string
	SettaFilesLocation   string
	RuntimeRoot          string
	Profile              string
	BootstrapURLFragment string
	SessionID            string
	StartedNew           bool
}

func assertLaunchSuccessPayload(t *testing.T, payload map[string]any, want launchSuccessPayloadExpectation) {
	t.Helper()

	if got := payload["ok"]; got != true {
		t.Fatalf("expected ok payload, got %#v", payload)
	}
	if got := payload["bootstrapUrlFragment"]; got != want.BootstrapURLFragment {
		t.Fatalf("unexpected bootstrap url fragment %#v", got)
	}
	if got := payload["workspaceRoot"]; got != want.WorkspaceRoot {
		t.Fatalf("expected workspaceRoot %q, got %#v", want.WorkspaceRoot, got)
	}
	if got := payload["settaFilesLocation"]; got != want.SettaFilesLocation {
		t.Fatalf("expected settaFilesLocation %q, got %#v", want.SettaFilesLocation, got)
	}
	if got := payload["runtimeRoot"]; got != want.RuntimeRoot {
		t.Fatalf("expected runtimeRoot %q, got %#v", want.RuntimeRoot, got)
	}
	if got := payload["settaHome"]; got != want.SettaHome {
		t.Fatalf("expected settaHome %q, got %#v", want.SettaHome, got)
	}
	if got := payload["profile"]; got != want.Profile {
		t.Fatalf("expected profile %q, got %#v", want.Profile, got)
	}
	if got := payload["sessionId"]; got != want.SessionID {
		t.Fatalf("expected sessionId %q, got %#v", want.SessionID, got)
	}
	if got := payload["startedNew"]; got != want.StartedNew {
		t.Fatalf("expected startedNew %v, got %#v", want.StartedNew, got)
	}

	sessionPayload, ok := payload["session"].(map[string]any)
	if !ok {
		t.Fatalf("expected nested session payload, got %#v", payload["session"])
	}
	if got := sessionPayload["workspacePath"]; got != want.WorkspaceRoot {
		t.Fatalf("expected workspacePath %q, got %#v", want.WorkspaceRoot, got)
	}
	if got := sessionPayload["serverMode"]; got != "ide" {
		t.Fatalf("expected serverMode ide, got %#v", got)
	}
}

type launchCapturedInputExpectation struct {
	ServerExecutable         string
	CapturedServerExecutable string
	CapturedTimeout          time.Duration
	WorkspaceRoot            string
	Profile                  string
	SettaHome                string
	ProfileLookupHome        string
	SettaFilesLocation       string
	RuntimeRoot              string
	ServerMode               config.Mode
}

func assertLaunchCapturedInput(t *testing.T, input launcher.IDELaunchInput, want launchCapturedInputExpectation) {
	t.Helper()

	if want.CapturedServerExecutable != want.ServerExecutable {
		t.Fatalf("expected server executable %q, got %q", want.ServerExecutable, want.CapturedServerExecutable)
	}
	if want.CapturedTimeout != 12500*time.Millisecond {
		t.Fatalf("expected launch timeout 12.5s, got %v", want.CapturedTimeout)
	}
	if input.WorkspaceRoot != want.WorkspaceRoot {
		t.Fatalf("expected workspace input %q, got %q", want.WorkspaceRoot, input.WorkspaceRoot)
	}
	if input.Profile != want.Profile {
		t.Fatalf("expected profile input %q, got %q", want.Profile, input.Profile)
	}
	if input.SettaHome != want.SettaHome {
		t.Fatalf("expected settaHome input %q, got %q", want.SettaHome, input.SettaHome)
	}
	if input.ProfileLookupHome != want.ProfileLookupHome {
		t.Fatalf("expected profileLookupHome %q, got %q", want.ProfileLookupHome, input.ProfileLookupHome)
	}
	if input.SettaFilesLocation == nil || *input.SettaFilesLocation != want.SettaFilesLocation {
		t.Fatalf("expected settaFilesLocation %q, got %#v", want.SettaFilesLocation, input.SettaFilesLocation)
	}
	if input.RuntimeRoot != want.RuntimeRoot {
		t.Fatalf("expected runtimeRoot input %q, got %q", want.RuntimeRoot, input.RuntimeRoot)
	}
	if input.ServerMode != want.ServerMode {
		t.Fatalf("expected server mode %q, got %q", want.ServerMode, input.ServerMode)
	}
}

// Fresh packaged launches should keep the session launcher's StartedNew signal in JSON output.
func TestRunLaunchSurfacesStartedNewTrueForFreshSession(t *testing.T) {
	t.Parallel()

	workspaceRoot := filepath.Join(t.TempDir(), "workspace")
	settaHome := filepath.Join(t.TempDir(), ".setta")
	startedAt := time.Date(2026, time.March, 8, 12, 30, 0, 0, time.UTC)
	deps := testLaunchDependencies(t, launchTestOptions{
		newSessionLauncher: func(string, time.Duration) (launcher.IDEWorkspaceSessionLauncher, error) {
			return launcherRootSessionLauncherFunc(func(input launcher.IDELaunchInput) (launcher.IDELaunchResult, error) {
				return launchResultForTest(input, startedAt, true), nil
			}), nil
		},
	})

	stdout, stderr, err := runLaunchCommandWithDeps(
		t,
		[]string{"--json", "--workspace", workspaceRoot, "--setta-home", settaHome},
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
	if got := payload["ok"]; got != true {
		t.Fatalf("expected ok payload, got %#v", payload)
	}
	if got := payload["startedNew"]; got != true {
		t.Fatalf("expected startedNew true, got %#v", got)
	}
	if got := payload["workspaceRoot"]; got != workspaceRoot {
		t.Fatalf("expected workspaceRoot %q, got %#v", workspaceRoot, got)
	}
}

// Global launch flags should still shape the reused-session payload when launch is invoked as a subcommand.
func TestRunLaunchUsesGlobalSettaFilesLocationAndSurfacesReusedSession(t *testing.T) {
	t.Parallel()

	workspaceRoot := filepath.Join(t.TempDir(), "workspace")
	settaHome := filepath.Join(t.TempDir(), ".setta")
	startedAt := time.Date(2026, time.March, 8, 12, 30, 0, 0, time.UTC)
	deps := testLaunchDependencies(t, launchTestOptions{
		newSessionLauncher: func(string, time.Duration) (launcher.IDEWorkspaceSessionLauncher, error) {
			return launcherRootSessionLauncherFunc(func(input launcher.IDELaunchInput) (launcher.IDELaunchResult, error) {
				if input.SettaFilesLocation == nil || *input.SettaFilesLocation != "global" {
					t.Fatalf("expected global settaFilesLocation from root flags, got %#v", input.SettaFilesLocation)
				}
				return launchResultForTest(input, startedAt, false), nil
			}), nil
		},
	})

	stdout, stderr, err := runLaunchCommandWithDeps(
		t,
		[]string{"--json"},
		globalFlags{
			workspaceRoot:      workspaceRoot,
			settaHome:          settaHome,
			settaFilesLocation: "global",
		},
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
	if got := payload["startedNew"]; got != false {
		t.Fatalf("expected startedNew false, got %#v", got)
	}
	if got := payload["settaFilesLocation"]; got != "global" {
		t.Fatalf("expected global settaFilesLocation, got %#v", got)
	}
	if got := payload["workspaceRoot"]; got != workspaceRoot {
		t.Fatalf("expected workspaceRoot %q, got %#v", workspaceRoot, got)
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

// Root and subcommand location flags should fail closed before launch resolution.
func TestRunLaunchRejectsConflictingSettaFilesLocationBetweenGlobalAndSubcommand(t *testing.T) {
	t.Parallel()

	stdout, stderr, err := runLaunchCommandWithDeps(
		t,
		[]string{"--json", "--setta-files-location", "global"},
		globalFlags{settaFilesLocation: "local"},
		t.TempDir(),
		launchDependencies{},
	)
	if err == nil {
		t.Fatal("expected conflicting setta-files-location error")
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
	if !strings.Contains(message, "Conflicting --setta-files-location") {
		t.Fatalf("expected conflicting setta-files-location message, got %q", message)
	}
}

// Explicit setta_files roots and location selectors should keep the typed config error branch.
func TestRunLaunchRejectsConflictingSettaFilesRootAndLocationAsInvalidConfig(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	workspaceRoot := filepath.Join(root, "workspace")
	settaHome := filepath.Join(root, ".setta")
	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		t.Fatalf("mkdir workspace: %v", err)
	}
	if err := os.MkdirAll(settaHome, 0o755); err != nil {
		t.Fatalf("mkdir setta home: %v", err)
	}

	deps := testLaunchDependencies(t, launchTestOptions{
		newSessionLauncher: func(string, time.Duration) (launcher.IDEWorkspaceSessionLauncher, error) {
			return launcher.NewLocalIDESessionLauncher(launcher.LocalIDESessionLauncherOptions{
				ExecutablePath: "/tmp/setta-server",
			})
		},
	})

	stdout, stderr, err := runLaunchCommandWithDeps(
		t,
		[]string{"--json", "--setta-files-location", "local"},
		globalFlags{
			workspaceRoot:  workspaceRoot,
			settaHome:      settaHome,
			settaFilesRoot: filepath.Join(root, "state", "setta_files_dev"),
		},
		root,
		deps,
	)
	if err == nil {
		t.Fatal("expected invalid setta files config error")
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
	if got := errorPayload["code"]; got != "InvalidSettaFilesConfig" {
		t.Fatalf("expected InvalidSettaFilesConfig error, got %#v", got)
	}
	message, ok := errorPayload["message"].(string)
	if !ok {
		t.Fatalf("expected string error message, got %#v", errorPayload["message"])
	}
	if !strings.Contains(message, "cannot use --setta-files-root together with --setta-files-location") {
		t.Fatalf("expected conflicting setta files config detail, got %q", message)
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

func TestRunLaunchEmitsTypedJSONConfigErrors(t *testing.T) {
	t.Parallel()

	type launchConfigErrorCase struct {
		name            string
		buildArgs       func(root string) []string
		setup           func(t *testing.T, root string)
		expectedCode    string
		expectedMessage string
	}

	cases := []launchConfigErrorCase{
		{
			name: "invalid workspace",
			buildArgs: func(root string) []string {
				return []string{
					"--json",
					"--workspace", filepath.Join(root, "missing"),
					"--setta-home", filepath.Join(root, ".setta"),
				}
			},
			setup: func(t *testing.T, root string) {
				t.Helper()
				if err := os.MkdirAll(filepath.Join(root, ".setta"), 0o755); err != nil {
					t.Fatalf("mkdir setta home: %v", err)
				}
			},
			expectedCode:    "InvalidWorkspace",
			expectedMessage: "workspace root does not exist",
		},
		{
			name: "invalid local setta files root",
			buildArgs: func(root string) []string {
				return []string{
					"--json",
					"--workspace", filepath.Join(root, "workspace"),
					"--setta-home", filepath.Join(root, ".setta"),
					"--setta-files-location", "local",
				}
			},
			setup: func(t *testing.T, root string) {
				t.Helper()
				if err := os.MkdirAll(filepath.Join(root, "workspace"), 0o755); err != nil {
					t.Fatalf("mkdir workspace: %v", err)
				}
				if err := os.MkdirAll(filepath.Join(root, ".setta"), 0o755); err != nil {
					t.Fatalf("mkdir setta home: %v", err)
				}
				if err := os.WriteFile(filepath.Join(root, "workspace", "setta_files"), []byte("not a directory\n"), 0o644); err != nil {
					t.Fatalf("write invalid local setta_files root: %v", err)
				}
			},
			expectedCode:    "InvalidSettaFilesRoot",
			expectedMessage: "local setta_files path is not a directory",
		},
		{
			name: "invalid runtime root",
			buildArgs: func(root string) []string {
				return []string{
					"--json",
					"--workspace", filepath.Join(root, "workspace"),
					"--setta-home", filepath.Join(root, ".setta"),
					"--setta-files-location", "local",
					"--runtime-root", filepath.Join(root, "runtime-root-file"),
				}
			},
			setup: func(t *testing.T, root string) {
				t.Helper()
				if err := os.MkdirAll(filepath.Join(root, "workspace"), 0o755); err != nil {
					t.Fatalf("mkdir workspace: %v", err)
				}
				if err := os.MkdirAll(filepath.Join(root, ".setta"), 0o755); err != nil {
					t.Fatalf("mkdir setta home: %v", err)
				}
				if err := os.WriteFile(filepath.Join(root, "runtime-root-file"), []byte("not a directory\n"), 0o644); err != nil {
					t.Fatalf("write invalid runtime root file: %v", err)
				}
			},
			expectedCode:    "InvalidRuntimeRoot",
			expectedMessage: "runtime root is not a directory",
		},
		{
			name: "runtime root matching workspace",
			buildArgs: func(root string) []string {
				workspaceRoot := filepath.Join(root, "workspace")
				return []string{
					"--json",
					"--workspace", workspaceRoot,
					"--setta-home", filepath.Join(root, ".setta"),
					"--setta-files-location", "local",
					"--runtime-root", workspaceRoot,
				}
			},
			setup: func(t *testing.T, root string) {
				t.Helper()
				if err := os.MkdirAll(filepath.Join(root, "workspace"), 0o755); err != nil {
					t.Fatalf("mkdir workspace: %v", err)
				}
				if err := os.MkdirAll(filepath.Join(root, ".setta"), 0o755); err != nil {
					t.Fatalf("mkdir setta home: %v", err)
				}
			},
			expectedCode:    "InvalidRuntimeRoot",
			expectedMessage: "runtime root cannot be the workspace root",
		},
		{
			name: "invalid setta home",
			buildArgs: func(root string) []string {
				return []string{
					"--json",
					"--workspace", filepath.Join(root, "workspace"),
					"--setta-home", filepath.Join(root, "custom-home"),
				}
			},
			setup: func(t *testing.T, root string) {
				t.Helper()
				if err := os.MkdirAll(filepath.Join(root, "workspace"), 0o755); err != nil {
					t.Fatalf("mkdir workspace: %v", err)
				}
			},
			expectedCode:    "InvalidSettaHome",
			expectedMessage: "must end with one of",
		},
		{
			name: "invalid user config",
			buildArgs: func(root string) []string {
				return []string{
					"--json",
					"--workspace", filepath.Join(root, "workspace"),
					"--setta-home", filepath.Join(root, ".setta"),
				}
			},
			setup: func(t *testing.T, root string) {
				t.Helper()
				if err := os.MkdirAll(filepath.Join(root, "workspace"), 0o755); err != nil {
					t.Fatalf("mkdir workspace: %v", err)
				}
				if err := os.MkdirAll(filepath.Join(root, ".setta"), 0o755); err != nil {
					t.Fatalf("mkdir setta home: %v", err)
				}
				if err := os.WriteFile(filepath.Join(root, ".setta", "config.json"), []byte("{\n"), 0o644); err != nil {
					t.Fatalf("write malformed config: %v", err)
				}
			},
			expectedCode:    "InvalidSettaUserConfig",
			expectedMessage: "invalid json in setta config",
		},
		{
			name: "unknown profile",
			buildArgs: func(root string) []string {
				return []string{
					"--json",
					"--workspace", filepath.Join(root, "workspace"),
					"--setta-home", filepath.Join(root, ".setta"),
					"--profile", "missing",
				}
			},
			setup: func(t *testing.T, root string) {
				t.Helper()
				if err := os.MkdirAll(filepath.Join(root, "workspace"), 0o755); err != nil {
					t.Fatalf("mkdir workspace: %v", err)
				}
				if err := os.MkdirAll(filepath.Join(root, ".setta"), 0o755); err != nil {
					t.Fatalf("mkdir setta home: %v", err)
				}
			},
			expectedCode:    "UnknownSettaProfile",
			expectedMessage: "unknown setta profile",
		},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			root := t.TempDir()
			tc.setup(t, root)

			deps := testLaunchDependencies(t, launchTestOptions{
				newSessionLauncher: func(string, time.Duration) (launcher.IDEWorkspaceSessionLauncher, error) {
					return launcher.NewLocalIDESessionLauncher(launcher.LocalIDESessionLauncherOptions{
						ExecutablePath: "/tmp/setta-server",
					})
				},
			})

			stdout, stderr, err := runLaunchCommandWithDeps(t, tc.buildArgs(root), globalFlags{}, root, deps)
			assertLaunchTypedConfigError(t, stdout, stderr, err, tc.expectedCode, tc.expectedMessage)
		})
	}
}

func assertLaunchTypedConfigError(t *testing.T, stdout string, stderr string, err error, expectedCode string, expectedMessage string) {
	t.Helper()

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
	errorPayload, ok := payload["error"].(map[string]any)
	if !ok {
		t.Fatalf("expected error payload, got %#v", payload)
	}
	if got := errorPayload["code"]; got != expectedCode {
		t.Fatalf("expected %s error, got %#v", expectedCode, got)
	}
	message, ok := errorPayload["message"].(string)
	if !ok {
		t.Fatalf("expected string error message, got %#v", errorPayload["message"])
	}
	if !strings.Contains(message, expectedMessage) {
		t.Fatalf("expected message containing %q, got %q", expectedMessage, message)
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

func TestRunLaunchSurfacesInvalidRuntimeRootAsJSON(t *testing.T) {
	t.Parallel()

	message := "failed to initialize runtime logs directory: /tmp/runtime/logs: mkdir /tmp/runtime/logs: not a directory"
	deps := testLaunchDependencies(t, launchTestOptions{
		newSessionLauncher: func(string, time.Duration) (launcher.IDEWorkspaceSessionLauncher, error) {
			return launcherRootSessionLauncherFunc(func(launcher.IDELaunchInput) (launcher.IDELaunchResult, error) {
				return launcher.IDELaunchResult{}, &launcher.SessionLaunchError{
					Code:    "InvalidRuntimeRoot",
					Message: message,
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
	if got := errorPayload["code"]; got != "InvalidRuntimeRoot" {
		t.Fatalf("expected InvalidRuntimeRoot error, got %#v", got)
	}
	if got := errorPayload["message"]; got != message {
		t.Fatalf("expected invalid runtime root message, got %#v", got)
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
