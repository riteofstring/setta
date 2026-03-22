package settacmd

import (
	"bytes"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"setta/internal/auth"
	"setta/internal/config"
	"setta/internal/launcher"
)

func TestRunLauncherSetupStatusAndRemoveRoundTrip(t *testing.T) {
	t.Parallel()

	settaHome := filepath.Join(t.TempDir(), ".setta")

	setupStdout, _, setupErr := runSettaCommand(t,
		"--setta-home", settaHome,
		"launcher", "setup",
		"--json",
		"--channel", "uv-tool",
		"--install-source", "uv-tool",
		"--open-mode", "chrome-app",
		"--workspace-behavior", "always-prompt",
		"--no-install-artifacts",
	)
	if setupErr != nil {
		t.Fatalf("run launcher setup: %v", setupErr)
	}
	setupPayload := decodeJSONPayload(t, setupStdout)
	if ok := setupPayload["ok"].(bool); !ok {
		t.Fatalf("expected setup ok payload, got %#v", setupPayload)
	}
	if got := setupPayload["openMode"]; got != "chrome-app" {
		t.Fatalf("expected openMode chrome-app, got %#v", got)
	}
	if got := setupPayload["workspaceBehavior"]; got != "always_prompt" {
		t.Fatalf("expected workspaceBehavior always_prompt, got %#v", got)
	}
	if got := setupPayload["managedArtifacts"]; got == nil {
		t.Fatalf("expected managedArtifacts map, got %#v", got)
	}

	statusStdout, _, statusErr := runSettaCommand(t,
		"--setta-home", settaHome,
		"launcher", "status", "--json",
	)
	if statusErr != nil {
		t.Fatalf("run launcher status: %v", statusErr)
	}
	statusPayload := decodeJSONPayload(t, statusStdout)
	if ok := statusPayload["ok"].(bool); !ok {
		t.Fatalf("expected status ok payload, got %#v", statusPayload)
	}
	if installed := statusPayload["installed"].(bool); !installed {
		t.Fatalf("expected installed launcher, got %#v", statusPayload)
	}
	expectedMetadataPath, err := launcher.ResolveLauncherMetadataPath(settaHome)
	if err != nil {
		t.Fatalf("resolve launcher metadata path: %v", err)
	}
	if got := statusPayload["metadataPath"]; got != expectedMetadataPath {
		t.Fatalf("expected metadataPath %q, got %#v", expectedMetadataPath, got)
	}
	if got := statusPayload["channel"]; got != "uv-tool" {
		t.Fatalf("expected channel uv-tool, got %#v", got)
	}
	if got := statusPayload["updateCapability"]; got != "in_app" {
		t.Fatalf("expected updateCapability in_app, got %#v", got)
	}

	removeStdout, _, removeErr := runSettaCommand(t,
		"--setta-home", settaHome,
		"launcher", "remove", "--json",
	)
	if removeErr != nil {
		t.Fatalf("run launcher remove: %v", removeErr)
	}
	removePayload := decodeJSONPayload(t, removeStdout)
	if ok := removePayload["ok"].(bool); !ok {
		t.Fatalf("expected remove ok payload, got %#v", removePayload)
	}
	if removed := removePayload["metadataRemoved"].(bool); !removed {
		t.Fatalf("expected metadataRemoved true, got %#v", removePayload)
	}
	if removedPaths, ok := removePayload["removedPaths"].([]any); !ok || len(removedPaths) != 0 {
		t.Fatalf("expected empty removedPaths, got %#v", removePayload["removedPaths"])
	}
	if _, err := os.Stat(expectedMetadataPath); !os.IsNotExist(err) {
		t.Fatalf("expected launcher metadata to be removed, stat err=%v", err)
	}
}

func TestRunLauncherRepairRebindsMissingTarget(t *testing.T) {
	t.Parallel()

	settaHome := filepath.Join(t.TempDir(), ".setta")
	missingTarget := filepath.Join(t.TempDir(), "missing-setta")

	metadata, err := launcher.BuildLauncherInstallMetadata(launcher.LauncherInstallMetadataInput{
		TargetCommand:          []string{missingTarget},
		Channel:                "manual",
		InstallSource:          launcher.LauncherInstallSourceUnsupported,
		ArtifactOwnershipToken: "repair-cli-token",
		SettaVersion:           "1.2.3",
		SettaHome:              settaHome,
		OpenMode:               launcher.LauncherOpenModeBrowser,
		WorkspaceBehavior:      launcher.LauncherWorkspaceBehaviorDefault,
		ArtifactOptions:        map[string]string{},
		ManagedArtifacts:       map[string]string{},
	})
	if err != nil {
		t.Fatalf("build launcher metadata: %v", err)
	}
	if _, err := launcher.WriteLauncherInstallMetadata(settaHome, metadata); err != nil {
		t.Fatalf("write launcher metadata: %v", err)
	}

	stdout, _, runErr := runSettaCommand(t,
		"--setta-home", settaHome,
		"launcher", "repair", "--json",
	)
	if runErr != nil {
		t.Fatalf("run launcher repair: %v", runErr)
	}
	payload := decodeJSONPayload(t, stdout)
	status, ok := payload["status"].(map[string]any)
	if !ok {
		t.Fatalf("expected nested status payload, got %#v", payload)
	}
	if statusOK := status["ok"].(bool); !statusOK {
		t.Fatalf("expected nested status ok=true, got %#v", status)
	}
	if targetValid := status["targetValid"].(bool); !targetValid {
		t.Fatalf("expected repaired targetValid true, got %#v", status)
	}
	targetCommand, ok := status["targetCommand"].([]any)
	if !ok || len(targetCommand) == 0 {
		t.Fatalf("expected targetCommand in repaired status, got %#v", status["targetCommand"])
	}
	currentExecutable, err := os.Executable()
	if err != nil {
		t.Fatalf("resolve current executable: %v", err)
	}
	resolvedCurrentExecutable, err := filepath.EvalSymlinks(currentExecutable)
	if err != nil {
		resolvedCurrentExecutable = currentExecutable
	}
	targetPath, ok := targetCommand[0].(string)
	if !ok {
		t.Fatalf("expected target command string, got %#v", targetCommand[0])
	}
	resolvedTargetPath, err := filepath.EvalSymlinks(targetPath)
	if err != nil {
		resolvedTargetPath = targetPath
	}
	if resolvedTargetPath != resolvedCurrentExecutable {
		t.Fatalf("expected repaired target command %q, got %q", resolvedCurrentExecutable, resolvedTargetPath)
	}
}

func TestRunLauncherUpdateReportsNotInstalled(t *testing.T) {
	t.Parallel()

	settaHome := filepath.Join(t.TempDir(), ".setta")

	stdout, _, runErr := runSettaCommand(t,
		"--setta-home", settaHome,
		"launcher", "update", "--json",
	)
	if runErr == nil {
		t.Fatal("expected launcher update failure when not installed")
	}
	if code := ExitCode(runErr); code != 2 {
		t.Fatalf("expected exit code 2, got %d", code)
	}
	payload := decodeJSONPayload(t, stdout)
	errorPayload, ok := payload["error"].(map[string]any)
	if !ok {
		t.Fatalf("expected error payload, got %#v", payload)
	}
	if got := errorPayload["code"]; got != "LauncherNotInstalled" {
		t.Fatalf("expected LauncherNotInstalled error, got %#v", got)
	}
}

func TestRunLauncherSetupRejectsClearAndArtifactOptionsTogether(t *testing.T) {
	t.Parallel()

	settaHome := filepath.Join(t.TempDir(), ".setta")

	stdout, _, runErr := runSettaCommand(t,
		"--setta-home", settaHome,
		"launcher", "setup",
		"--json",
		"--artifact-option", "app_name=Setta Custom",
		"--clear-artifact-options",
	)
	if runErr == nil {
		t.Fatal("expected launcher setup validation error")
	}
	if code := ExitCode(runErr); code != 2 {
		t.Fatalf("expected exit code 2, got %d", code)
	}
	payload := decodeJSONPayload(t, stdout)
	errorPayload, ok := payload["error"].(map[string]any)
	if !ok {
		t.Fatalf("expected error payload, got %#v", payload)
	}
	if got := errorPayload["code"]; got != "BadRequest" {
		t.Fatalf("expected BadRequest error, got %#v", got)
	}
}

func decodeJSONPayload(t *testing.T, raw string) map[string]any {
	t.Helper()

	var payload map[string]any
	if err := json.Unmarshal([]byte(raw), &payload); err != nil {
		t.Fatalf("decode json payload: %v\nraw=%q", err, raw)
	}
	return payload
}

func TestRunLauncherRootUsesHomeFallbackWorkspaceAndRequestsSwitcher(t *testing.T) {
	t.Parallel()

	homeDir := t.TempDir()
	captured := launcher.IDELaunchInput{}
	deps := testLauncherRootDependencies(t, launcherRootTestOptions{
		settaHome: settaHomeForTest(t),
		resolveUserHome: func() (string, error) {
			return homeDir, nil
		},
		newSessionLauncher: func(string, time.Duration) (launcher.IDEWorkspaceSessionLauncher, error) {
			return launcherRootSessionLauncherFunc(func(input launcher.IDELaunchInput) (launcher.IDELaunchResult, error) {
				captured = input
				return launcherRootLaunchResult(input.WorkspaceRoot, input.SettaHome, nil), nil
			}), nil
		},
	})

	stdout, stderr, err := runLauncherRootWithDeps(t, []string{"--json"}, globalFlags{}, deps)
	if err != nil {
		t.Fatalf("run launcher root: %v", err)
	}
	if stderr != "" {
		t.Fatalf("expected empty stderr, got %q", stderr)
	}
	payload := decodeJSONPayload(t, stdout)
	if got := payload["ok"]; got != true {
		t.Fatalf("expected ok payload, got %#v", payload)
	}
	if got := payload["openWorkspaceSwitcher"]; got != true {
		t.Fatalf("expected openWorkspaceSwitcher true, got %#v", got)
	}
	if got := payload["sessionServerMode"]; got != "launcher" {
		t.Fatalf("expected launcher session mode, got %#v", got)
	}
	if got := payload["openMode"]; got != "chrome-app" {
		t.Fatalf("expected default chrome-app open mode, got %#v", got)
	}
	if got := payload["bootstrapUrl"]; got != "http://127.0.0.1:61234/__setta__/bootstrap#osw=1&token=tok" &&
		got != "http://127.0.0.1:61234/__setta__/bootstrap#token=tok&osw=1" {
		t.Fatalf("unexpected bootstrapUrl %#v", got)
	}
	if got := payload["workspaceRoot"]; got != homeDir {
		t.Fatalf("expected home workspace %q, got %#v", homeDir, got)
	}
	if captured.ServerMode != config.ModeLauncher {
		t.Fatalf("expected launcher server mode, got %q", captured.ServerMode)
	}
	if captured.SettaFilesLocation == nil || *captured.SettaFilesLocation != string(config.FilesLocationGlobal) {
		t.Fatalf("expected global setta_files location, got %#v", captured.SettaFilesLocation)
	}
}

func TestRunLauncherRootPrefersLastUsedWorkspaceFromMetadata(t *testing.T) {
	t.Parallel()

	lastUsedWorkspace := t.TempDir()
	metadata := &launcher.LauncherInstallMetadata{
		OpenMode:          string(launcher.LauncherOpenModeChromeApp),
		WorkspaceBehavior: string(launcher.LauncherWorkspaceBehaviorDefault),
		LastUsedWorkspace: stringPointer(lastUsedWorkspace),
	}
	captured := launcher.IDELaunchInput{}
	deps := testLauncherRootDependencies(t, launcherRootTestOptions{
		settaHome: settaHomeForTest(t),
		metadata:  metadata,
		newSessionLauncher: func(string, time.Duration) (launcher.IDEWorkspaceSessionLauncher, error) {
			return launcherRootSessionLauncherFunc(func(input launcher.IDELaunchInput) (launcher.IDELaunchResult, error) {
				captured = input
				return launcherRootLaunchResult(input.WorkspaceRoot, input.SettaHome, nil), nil
			}), nil
		},
	})

	stdout, _, err := runLauncherRootWithDeps(t, []string{"--json"}, globalFlags{}, deps)
	if err != nil {
		t.Fatalf("run launcher root: %v", err)
	}
	payload := decodeJSONPayload(t, stdout)
	if got := payload["openWorkspaceSwitcher"]; got != false {
		t.Fatalf("expected openWorkspaceSwitcher false, got %#v", got)
	}
	if got := payload["sessionServerMode"]; got != "ide" {
		t.Fatalf("expected ide session mode, got %#v", got)
	}
	if got := payload["workspaceRoot"]; got != lastUsedWorkspace {
		t.Fatalf("expected last used workspace %q, got %#v", lastUsedWorkspace, got)
	}
	if captured.ServerMode != config.ModeIDE {
		t.Fatalf("expected ide server mode, got %q", captured.ServerMode)
	}
}

func TestRunLauncherRootHonorsAlwaysPromptWorkspaceBehavior(t *testing.T) {
	t.Parallel()

	homeDir := t.TempDir()
	lastUsedWorkspace := t.TempDir()
	metadata := &launcher.LauncherInstallMetadata{
		OpenMode:          string(launcher.LauncherOpenModeBrowser),
		WorkspaceBehavior: string(launcher.LauncherWorkspaceBehaviorAlwaysPrompt),
		LastUsedWorkspace: stringPointer(lastUsedWorkspace),
	}
	captured := launcher.IDELaunchInput{}
	deps := testLauncherRootDependencies(t, launcherRootTestOptions{
		settaHome: settaHomeForTest(t),
		metadata:  metadata,
		resolveUserHome: func() (string, error) {
			return homeDir, nil
		},
		newSessionLauncher: func(string, time.Duration) (launcher.IDEWorkspaceSessionLauncher, error) {
			return launcherRootSessionLauncherFunc(func(input launcher.IDELaunchInput) (launcher.IDELaunchResult, error) {
				captured = input
				return launcherRootLaunchResult(input.WorkspaceRoot, input.SettaHome, nil), nil
			}), nil
		},
	})

	stdout, _, err := runLauncherRootWithDeps(t, []string{"--json"}, globalFlags{}, deps)
	if err != nil {
		t.Fatalf("run launcher root: %v", err)
	}
	payload := decodeJSONPayload(t, stdout)
	if got := payload["workspaceBehavior"]; got != "always_prompt" {
		t.Fatalf("expected always_prompt workspace behavior, got %#v", got)
	}
	if got := payload["openWorkspaceSwitcher"]; got != true {
		t.Fatalf("expected workspace switcher to open, got %#v", got)
	}
	if got := payload["sessionServerMode"]; got != "launcher" {
		t.Fatalf("expected launcher session mode, got %#v", got)
	}
	if got := payload["workspaceRoot"]; got != homeDir {
		t.Fatalf("expected home directory workspace %q, got %#v", homeDir, got)
	}
	if captured.ServerMode != config.ModeLauncher {
		t.Fatalf("expected launcher server mode, got %q", captured.ServerMode)
	}
}

func TestRunLauncherRootReportsMissingBoundTarget(t *testing.T) {
	t.Parallel()

	deps := testLauncherRootDependencies(t, launcherRootTestOptions{
		settaHome: settaHomeForTest(t),
		metadata:  &launcher.LauncherInstallMetadata{},
		validateMetadataTarget: func(launcher.LauncherInstallMetadata) string {
			return "Configured launcher target is missing: /tmp/missing. Re-run `setta launcher setup`."
		},
	})

	stdout, _, err := runLauncherRootWithDeps(t, []string{"--json"}, globalFlags{}, deps)
	if err == nil {
		t.Fatal("expected launcher target error")
	}
	if code := ExitCode(err); code != 2 {
		t.Fatalf("expected exit code 2, got %d", code)
	}
	payload := decodeJSONPayload(t, stdout)
	errorPayload := payload["error"].(map[string]any)
	if got := errorPayload["code"]; got != "LauncherTargetMissing" {
		t.Fatalf("expected LauncherTargetMissing, got %#v", got)
	}
}

func TestRunLauncherRootFallsBackToBrowserWhenChromeAppOpenUnavailable(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	capturedRequestedMode := launcher.LauncherOpenMode("")
	capturedURL := ""
	deps := testLauncherRootDependencies(t, launcherRootTestOptions{
		settaHome: settaHomeForTest(t),
		openURLWithMode: func(rawURL string, requested launcher.LauncherOpenMode, _ io.Writer) launcher.LauncherOpenMode {
			capturedRequestedMode = requested
			capturedURL = rawURL
			return launcher.LauncherOpenModeBrowser
		},
	})

	stdout, stderr, err := runLauncherRootWithDeps(t, []string{"--workspace", workspaceRoot}, globalFlags{}, deps)
	if err != nil {
		t.Fatalf("run launcher root: %v", err)
	}
	if stderr != "" {
		t.Fatalf("expected empty stderr, got %q", stderr)
	}
	if capturedRequestedMode != launcher.LauncherOpenModeChromeApp {
		t.Fatalf("expected requested open mode chrome-app, got %q", capturedRequestedMode)
	}
	if !strings.Contains(capturedURL, "/__setta__/bootstrap") {
		t.Fatalf("expected bootstrap URL to be opened, got %q", capturedURL)
	}
	expectedLine := "Opened Setta (browser) for workspace " + workspaceRoot
	if strings.TrimSpace(stdout) != expectedLine {
		t.Fatalf("expected fallback browser output %q, got %q", expectedLine, stdout)
	}
}

func TestRunLauncherRootReportsInternalErrorForUnexpectedFailures(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	deps := testLauncherRootDependencies(t, launcherRootTestOptions{
		settaHome: settaHomeForTest(t),
		newSessionLauncher: func(string, time.Duration) (launcher.IDEWorkspaceSessionLauncher, error) {
			return launcherRootSessionLauncherFunc(func(input launcher.IDELaunchInput) (launcher.IDELaunchResult, error) {
				return launcherRootLaunchResult(input.WorkspaceRoot, input.SettaHome, nil), nil
			}), nil
		},
		mintBootstrapToken: func(string, []byte, time.Time) (string, error) {
			return "", assertiveError("boom")
		},
	})

	stdout, _, err := runLauncherRootWithDeps(t, []string{"--json", "--workspace", workspaceRoot}, globalFlags{}, deps)
	if err == nil {
		t.Fatal("expected internal error")
	}
	if code := ExitCode(err); code != 1 {
		t.Fatalf("expected exit code 1, got %d", code)
	}
	payload := decodeJSONPayload(t, stdout)
	errorPayload := payload["error"].(map[string]any)
	if got := errorPayload["code"]; got != "InternalError" {
		t.Fatalf("expected InternalError, got %#v", got)
	}
}

func TestRunLauncherRootPassesTimeoutToSessionLauncher(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	var capturedTimeout time.Duration
	deps := testLauncherRootDependencies(t, launcherRootTestOptions{
		settaHome: settaHomeForTest(t),
		newSessionLauncher: func(_ string, launchTimeout time.Duration) (launcher.IDEWorkspaceSessionLauncher, error) {
			capturedTimeout = launchTimeout
			return launcherRootSessionLauncherFunc(func(input launcher.IDELaunchInput) (launcher.IDELaunchResult, error) {
				return launcherRootLaunchResult(input.WorkspaceRoot, input.SettaHome, nil), nil
			}), nil
		},
	})

	stdout, _, err := runLauncherRootWithDeps(t, []string{"--json", "--workspace", workspaceRoot, "--timeout", "12.5"}, globalFlags{}, deps)
	if err != nil {
		t.Fatalf("run launcher root: %v", err)
	}
	payload := decodeJSONPayload(t, stdout)
	if got := payload["ok"]; got != true {
		t.Fatalf("expected ok payload, got %#v", payload)
	}
	if capturedTimeout != 12500*time.Millisecond {
		t.Fatalf("expected launch timeout 12.5s, got %v", capturedTimeout)
	}
}

func TestRunLauncherRootIgnoresMetadataPersistenceErrors(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	deps := testLauncherRootDependencies(t, launcherRootTestOptions{
		settaHome: settaHomeForTest(t),
		newSessionLauncher: func(string, time.Duration) (launcher.IDEWorkspaceSessionLauncher, error) {
			return launcherRootSessionLauncherFunc(func(input launcher.IDELaunchInput) (launcher.IDELaunchResult, error) {
				return launcherRootLaunchResult(input.WorkspaceRoot, input.SettaHome, nil), nil
			}), nil
		},
		updateLastUsedWorkspace: func(string, string) error {
			return assertiveError("disk full")
		},
	})

	stdout, _, err := runLauncherRootWithDeps(t, []string{"--json", "--workspace", workspaceRoot}, globalFlags{}, deps)
	if err != nil {
		t.Fatalf("expected success despite metadata persistence error: %v", err)
	}
	payload := decodeJSONPayload(t, stdout)
	if got := payload["ok"]; got != true {
		t.Fatalf("expected ok payload, got %#v", payload)
	}
	if got := payload["workspaceRoot"]; got != workspaceRoot {
		t.Fatalf("expected workspaceRoot %q, got %#v", workspaceRoot, got)
	}
}

func TestRunLauncherRejectsLegacyInstallAndUninstallCommands(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name        string
		args        []string
		expectedErr string
	}{
		{
			name:        "install",
			args:        []string{"install", "--json"},
			expectedErr: "No such command 'install'",
		},
		{
			name:        "uninstall",
			args:        []string{"uninstall", "--json"},
			expectedErr: "No such command 'uninstall'",
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			var stdout bytes.Buffer
			var stderr bytes.Buffer
			err := runLauncherWithDeps(testCase.args, globalFlags{}, &stdout, &stderr, func(string) (string, bool) {
				return "", false
			}, t.TempDir(), testLauncherRootDependencies(t, launcherRootTestOptions{}))
			if err == nil {
				t.Fatal("expected legacy launcher command to fail")
			}
			if err.Error() != testCase.expectedErr {
				t.Fatalf("expected error %q, got %q", testCase.expectedErr, err.Error())
			}
			if stdout.Len() != 0 {
				t.Fatalf("expected empty stdout, got %q", stdout.String())
			}
		})
	}
}

func TestOpenURLInChromeAppMacOSRetriesWithNewInstance(t *testing.T) {
	if runtime.GOOS != "darwin" {
		t.Skip("macOS-specific chrome-app behavior")
	}

	stubDir := t.TempDir()
	openLogPath := filepath.Join(stubDir, "open.log")
	psCountPath := filepath.Join(stubDir, "ps-count.txt")
	writeShellCommandStub(t, stubDir, "open", "printf '%s\\n' \"$*\" >> \"$OPEN_LOG_PATH\"\n")
	writeShellCommandStub(t, stubDir, "ps", "count=0\nif [ -f \"$PS_COUNT_PATH\" ]; then count=$(cat \"$PS_COUNT_PATH\"); fi\ncount=$((count + 1))\nprintf '%s' \"$count\" > \"$PS_COUNT_PATH\"\nif [ \"$count\" -ge 11 ]; then\n  printf '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --app=https://example.com\\n'\nfi\n")
	t.Setenv("OPEN_LOG_PATH", openLogPath)
	t.Setenv("PS_COUNT_PATH", psCountPath)
	t.Setenv("PATH", stubDir+string(os.PathListSeparator)+os.Getenv("PATH"))

	if !openURLInChromeApp("https://example.com") {
		t.Fatal("expected chrome app launch to succeed on retry")
	}

	content, err := os.ReadFile(openLogPath)
	if err != nil {
		t.Fatalf("read open log: %v", err)
	}
	lines := strings.Split(strings.TrimSpace(string(content)), "\n")
	if len(lines) != 2 {
		t.Fatalf("expected two open invocations, got %#v", lines)
	}
	if lines[0] != "-a Google Chrome --args --app=https://example.com" {
		t.Fatalf("unexpected first open invocation %q", lines[0])
	}
	if lines[1] != "-n -a Google Chrome --args --app=https://example.com" {
		t.Fatalf("unexpected second open invocation %q", lines[1])
	}
}

func TestOpenURLInChromeAppMacOSReturnsFalseWhenNotVisible(t *testing.T) {
	if runtime.GOOS != "darwin" {
		t.Skip("macOS-specific chrome-app behavior")
	}

	stubDir := t.TempDir()
	openLogPath := filepath.Join(stubDir, "open.log")
	writeShellCommandStub(t, stubDir, "open", "printf '%s\\n' \"$*\" >> \"$OPEN_LOG_PATH\"\n")
	writeShellCommandStub(t, stubDir, "ps", "exit 0\n")
	t.Setenv("OPEN_LOG_PATH", openLogPath)
	t.Setenv("PATH", stubDir+string(os.PathListSeparator)+os.Getenv("PATH"))

	if openURLInChromeApp("https://example.com") {
		t.Fatal("expected chrome app launch to fail when no visible app process appears")
	}

	content, err := os.ReadFile(openLogPath)
	if err != nil {
		t.Fatalf("read open log: %v", err)
	}
	lines := strings.Split(strings.TrimSpace(string(content)), "\n")
	if len(lines) != 4 {
		t.Fatalf("expected four open attempts across Google Chrome and Chromium, got %#v", lines)
	}
}

func TestIsMacOSChromeProcessCommandAcceptsRelocatedBinaryPaths(t *testing.T) {
	t.Parallel()

	chromeFlag := "--app=https://example.com"
	command := "/Volumes/Apps/Google Chrome.app/Contents/MacOS/Google Chrome " + chromeFlag
	if !isMacOSChromeProcessCommand(command, chromeFlag) {
		t.Fatalf("expected relocated Chrome binary path to match %q", command)
	}
	if isMacOSChromeProcessCommand("open -a Google Chrome --args "+chromeFlag, chromeFlag) {
		t.Fatal("expected wrapper open command to be ignored")
	}
}

func TestResolveLauncherServerExecutablePrefersEnvOverride(t *testing.T) {
	t.Parallel()

	overridePath := writeExecutableForTest(t, filepath.Join(t.TempDir(), "custom", "setta-server"))
	currentExecutable := writeExecutableForTest(t, filepath.Join(t.TempDir(), "bin", "setta"))

	resolved, err := resolveLauncherServerExecutable(currentExecutable, func(key string) (string, bool) {
		if key == "SETTA_SERVER_BIN" {
			return overridePath, true
		}
		return "", false
	})
	if err != nil {
		t.Fatalf("resolve server executable: %v", err)
	}
	if resolved != overridePath {
		t.Fatalf("expected override path %q, got %q", overridePath, resolved)
	}
}

func TestResolveLauncherServerExecutableUsesSiblingBinary(t *testing.T) {
	t.Parallel()

	binDir := filepath.Join(t.TempDir(), "bin")
	currentExecutable := writeExecutableForTest(t, filepath.Join(binDir, "setta"))
	expectedServer := writeExecutableForTest(t, filepath.Join(binDir, "setta-server"))

	resolved, err := resolveLauncherServerExecutable(currentExecutable, func(string) (string, bool) {
		return "", false
	})
	if err != nil {
		t.Fatalf("resolve server executable: %v", err)
	}
	if resolved != expectedServer {
		t.Fatalf("expected sibling server executable %q, got %q", expectedServer, resolved)
	}
}

func TestResolveLauncherServerExecutableUsesSourceCheckoutServerWrapper(t *testing.T) {
	repoRoot := t.TempDir()
	t.Chdir(repoRoot)

	currentExecutable := writeExecutableForTest(t, filepath.Join(t.TempDir(), "bin", "setta"))
	expectedServer := writeExecutableForTest(t, filepath.Join(repoRoot, "scripts", "run_setta_server.sh"))
	for _, rel := range []string{
		"go.mod",
		"scripts/go.sh",
		"cmd/setta/main.go",
		"cmd/setta-server/main.go",
	} {
		path := filepath.Join(repoRoot, rel)
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatalf("mkdir source checkout path: %v", err)
		}
		if err := os.WriteFile(path, []byte("placeholder\n"), 0o644); err != nil {
			t.Fatalf("write source checkout file: %v", err)
		}
	}

	resolved, err := resolveLauncherServerExecutable(currentExecutable, func(string) (string, bool) {
		return "", false
	})
	if err != nil {
		t.Fatalf("resolve server executable: %v", err)
	}
	if resolved != expectedServer {
		t.Fatalf("expected source checkout server executable %q, got %q", expectedServer, resolved)
	}
}

type launcherRootTestOptions struct {
	settaHome                string
	metadata                 *launcher.LauncherInstallMetadata
	resolveUserHome          func() (string, error)
	validateMetadataTarget   func(launcher.LauncherInstallMetadata) string
	resolveCurrentExecutable func() (string, error)
	resolveServerExecutable  func(string, func(string) (string, bool)) (string, error)
	newSessionLauncher       func(string, time.Duration) (launcher.IDEWorkspaceSessionLauncher, error)
	mintBootstrapToken       func(string, []byte, time.Time) (string, error)
	updateLastUsedWorkspace  func(string, string) error
	openURLWithMode          func(string, launcher.LauncherOpenMode, io.Writer) launcher.LauncherOpenMode
}

type launcherRootSessionLauncherFunc func(launcher.IDELaunchInput) (launcher.IDELaunchResult, error)

func (f launcherRootSessionLauncherFunc) EnsureSession(input launcher.IDELaunchInput) (launcher.IDELaunchResult, error) {
	return f(input)
}

type assertiveError string

func (e assertiveError) Error() string {
	return string(e)
}

func testLauncherRootDependencies(t *testing.T, options launcherRootTestOptions) launcherRootDependencies {
	t.Helper()

	settaHome := options.settaHome
	if settaHome == "" {
		settaHome = settaHomeForTest(t)
	}
	resolveUserHome := options.resolveUserHome
	if resolveUserHome == nil {
		resolveUserHome = func() (string, error) {
			return t.TempDir(), nil
		}
	}
	validateMetadataTarget := options.validateMetadataTarget
	if validateMetadataTarget == nil {
		validateMetadataTarget = func(launcher.LauncherInstallMetadata) string {
			return ""
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
				return launcherRootLaunchResult(input.WorkspaceRoot, input.SettaHome, nil), nil
			}), nil
		}
	}
	mintBootstrapToken := options.mintBootstrapToken
	if mintBootstrapToken == nil {
		mintBootstrapToken = func(string, []byte, time.Time) (string, error) {
			return "tok", nil
		}
	}
	updateLastUsedWorkspace := options.updateLastUsedWorkspace
	if updateLastUsedWorkspace == nil {
		updateLastUsedWorkspace = func(string, string) error { return nil }
	}
	openURLWithMode := options.openURLWithMode
	if openURLWithMode == nil {
		openURLWithMode = func(string, launcher.LauncherOpenMode, io.Writer) launcher.LauncherOpenMode {
			return launcher.LauncherOpenModeBrowser
		}
	}

	return launcherRootDependencies{
		loadBaseConfig: func(global globalFlags, cwd string, envLookup func(string) (string, bool)) (config.Config, error) {
			return config.Config{
				Paths: config.Paths{
					SettaHome:         settaHome,
					ProfileLookupHome: settaHome,
				},
			}, nil
		},
		loadMetadata: func(string) (*launcher.LauncherInstallMetadata, error) {
			return options.metadata, nil
		},
		resolveUserHome:          resolveUserHome,
		validateMetadataTarget:   validateMetadataTarget,
		resolveCurrentExecutable: resolveCurrentExecutable,
		resolveServerExecutable:  resolveServerExecutable,
		newSessionLauncher:       newSessionLauncher,
		now: func() time.Time {
			return time.Date(2026, time.March, 8, 12, 30, 0, 0, time.UTC)
		},
		mintBootstrapToken:      mintBootstrapToken,
		updateLastUsedWorkspace: updateLastUsedWorkspace,
		openURLWithMode:         openURLWithMode,
	}
}

func runLauncherRootWithDeps(t *testing.T, args []string, global globalFlags, deps launcherRootDependencies) (string, string, error) {
	t.Helper()

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	err := runLauncherWithDeps(args, global, &stdout, &stderr, func(string) (string, bool) {
		return "", false
	}, t.TempDir(), deps)
	return stdout.String(), stderr.String(), err
}

func launcherRootLaunchResult(workspaceRoot string, settaHome string, profile *string) launcher.IDELaunchResult {
	return launcher.IDELaunchResult{
		Session: auth.SessionMetadata{
			ID:   "session-1",
			Host: "127.0.0.1",
			Port: 61234,
		},
		Secret:     []byte("secret"),
		StartedNew: false,
		Paths: config.Paths{
			WorkspaceRoot: workspaceRoot,
			SettaHome:     settaHome,
			ProfileName:   stringPointerValue(profile),
		},
	}
}

func settaHomeForTest(t *testing.T) string {
	t.Helper()
	return filepath.Join(t.TempDir(), ".setta")
}

func writeExecutableForTest(t *testing.T, path string) string {
	t.Helper()

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir executable dir: %v", err)
	}
	content := "#!/usr/bin/env bash\nexit 0\n"
	if runtime.GOOS == "windows" {
		content = "@echo off\r\nexit /b 0\r\n"
		path += ".exe"
	}
	if err := os.WriteFile(path, []byte(content), 0o755); err != nil {
		t.Fatalf("write executable: %v", err)
	}
	return path
}

func writeShellCommandStub(t *testing.T, dir string, name string, scriptBody string) string {
	t.Helper()

	path := filepath.Join(dir, name)
	content := "#!/bin/sh\nset -eu\n" + scriptBody
	if err := os.WriteFile(path, []byte(content), 0o755); err != nil {
		t.Fatalf("write command stub %q: %v", name, err)
	}
	return path
}
