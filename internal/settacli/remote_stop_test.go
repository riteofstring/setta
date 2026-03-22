package settacli

import (
	"bytes"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"testing"
	"time"

	"setta/internal/auth"
	"setta/internal/localsessions"
	"setta/internal/sshx"
)

func TestRunStopLocalAllScopesByWorkspaceAndDefaultsToIDE(t *testing.T) {
	t.Parallel()

	fixture := newCLIFixture(t)
	olderIDEProc := fixture.startProcess(t, "setta.server:app")
	olderIDE := fixture.createSession(t, olderIDEProc, 61234, time.Date(2026, time.March, 8, 12, 0, 0, 0, time.UTC), "ide")
	newerIDEProc := fixture.startProcess(t, "setta.server:app")
	newerIDE := fixture.createSession(t, newerIDEProc, 61235, time.Date(2026, time.March, 8, 12, 5, 0, 0, time.UTC), "ide")
	launcherProc := fixture.startProcess(t, "setta.server:app")
	launcherSession := fixture.createSession(t, launcherProc, 61236, time.Date(2026, time.March, 8, 12, 10, 0, 0, time.UTC), "launcher")

	otherWorkspace := filepath.Join(filepath.Dir(fixture.workspaceRoot), "other-workspace")
	if err := os.MkdirAll(otherWorkspace, 0o755); err != nil {
		t.Fatalf("mkdir other workspace: %v", err)
	}
	otherWorkspaceProc := fixture.startProcess(t, "setta.server:app")
	otherWorkspaceSession := createLocalStopSessionForWorkspace(
		t,
		fixture,
		otherWorkspaceProc,
		otherWorkspace,
		61237,
		time.Date(2026, time.March, 8, 12, 15, 0, 0, time.UTC),
		"ide",
	)

	stdout, stderr, err := fixture.run(
		"stop",
		"--workspace",
		fixture.workspaceRoot,
		"--all",
	)
	if err != nil {
		t.Fatalf("run local stop --all: %v", err)
	}
	if strings.TrimSpace(stderr) != "" {
		t.Fatalf("expected empty stderr, got %q", stderr)
	}
	gotLines := strings.Split(strings.TrimSpace(stdout), "\n")
	wantLines := []string{
		"Stopped session " + olderIDE.ID + ".",
		"Stopped session " + newerIDE.ID + ".",
	}
	sort.Strings(gotLines)
	sort.Strings(wantLines)
	if strings.Join(gotLines, "\n") != strings.Join(wantLines, "\n") {
		t.Fatalf("unexpected stdout %q", stdout)
	}

	waitForSettacliHelperExit(t, olderIDEProc, 2*time.Second)
	waitForSettacliHelperExit(t, newerIDEProc, 2*time.Second)

	if _, err := os.Stat(filepath.Join(fixture.runtimeRoot, "sessions", olderIDE.ID)); !os.IsNotExist(err) {
		t.Fatalf("expected session %q metadata to be removed, stat err=%v", olderIDE.ID, err)
	}
	if _, err := os.Stat(filepath.Join(fixture.runtimeRoot, "sessions", newerIDE.ID)); !os.IsNotExist(err) {
		t.Fatalf("expected session %q metadata to be removed, stat err=%v", newerIDE.ID, err)
	}
	if _, err := os.Stat(filepath.Join(fixture.runtimeRoot, "sessions", launcherSession.ID)); err != nil {
		t.Fatalf("expected launcher session %q to remain, stat err=%v", launcherSession.ID, err)
	}
	if _, err := os.Stat(filepath.Join(fixture.runtimeRoot, "sessions", otherWorkspaceSession.ID)); err != nil {
		t.Fatalf("expected other-workspace session %q to remain, stat err=%v", otherWorkspaceSession.ID, err)
	}
}

func TestRunStopLocalLatestDefaultsToIDEWithinWorkspace(t *testing.T) {
	t.Parallel()

	fixture := newCLIFixture(t)
	olderIDEProc := fixture.startProcess(t, "setta.server:app")
	olderIDE := fixture.createSession(t, olderIDEProc, 61234, time.Date(2026, time.March, 8, 12, 0, 0, 0, time.UTC), "ide")
	latestIDEProc := fixture.startProcess(t, "setta.server:app")
	latestIDE := fixture.createSession(t, latestIDEProc, 61235, time.Date(2026, time.March, 8, 12, 5, 0, 0, time.UTC), "ide")
	launcherProc := fixture.startProcess(t, "setta.server:app")
	launcherSession := fixture.createSession(t, launcherProc, 61236, time.Date(2026, time.March, 8, 12, 10, 0, 0, time.UTC), "launcher")

	otherWorkspace := filepath.Join(filepath.Dir(fixture.workspaceRoot), "other-workspace-latest")
	if err := os.MkdirAll(otherWorkspace, 0o755); err != nil {
		t.Fatalf("mkdir other workspace: %v", err)
	}
	otherWorkspaceProc := fixture.startProcess(t, "setta.server:app")
	otherWorkspaceSession := createLocalStopSessionForWorkspace(
		t,
		fixture,
		otherWorkspaceProc,
		otherWorkspace,
		61237,
		time.Date(2026, time.March, 8, 12, 15, 0, 0, time.UTC),
		"ide",
	)

	stdout, stderr, err := fixture.run(
		"stop",
		"--workspace",
		fixture.workspaceRoot,
		"--latest",
	)
	if err != nil {
		t.Fatalf("run local stop --latest: %v", err)
	}
	if strings.TrimSpace(stderr) != "" {
		t.Fatalf("expected empty stderr, got %q", stderr)
	}
	if strings.TrimSpace(stdout) != "Stopped session "+latestIDE.ID+"." {
		t.Fatalf("unexpected stdout %q", stdout)
	}

	waitForSettacliHelperExit(t, latestIDEProc, 2*time.Second)

	if _, err := os.Stat(filepath.Join(fixture.runtimeRoot, "sessions", latestIDE.ID)); !os.IsNotExist(err) {
		t.Fatalf("expected session %q metadata to be removed, stat err=%v", latestIDE.ID, err)
	}
	if _, err := os.Stat(filepath.Join(fixture.runtimeRoot, "sessions", olderIDE.ID)); err != nil {
		t.Fatalf("expected older IDE session %q to remain, stat err=%v", olderIDE.ID, err)
	}
	if _, err := os.Stat(filepath.Join(fixture.runtimeRoot, "sessions", launcherSession.ID)); err != nil {
		t.Fatalf("expected launcher session %q to remain, stat err=%v", launcherSession.ID, err)
	}
	if _, err := os.Stat(filepath.Join(fixture.runtimeRoot, "sessions", otherWorkspaceSession.ID)); err != nil {
		t.Fatalf("expected other-workspace session %q to remain, stat err=%v", otherWorkspaceSession.ID, err)
	}
}

func TestRunStopLocalSessionSelectorStopsRequestedSession(t *testing.T) {
	t.Parallel()

	fixture := newCLIFixture(t)
	firstProc := fixture.startProcess(t, "setta.server:app")
	firstSession := fixture.createSession(t, firstProc, 61234, time.Date(2026, time.March, 8, 12, 0, 0, 0, time.UTC), "ide")
	secondProc := fixture.startProcess(t, "setta.server:app")
	secondSession := fixture.createSession(t, secondProc, 61235, time.Date(2026, time.March, 8, 12, 5, 0, 0, time.UTC), "ide")

	stdout, stderr, err := fixture.run(
		"stop",
		"--workspace",
		fixture.workspaceRoot,
		"--session",
		firstSession.ID,
	)
	if err != nil {
		t.Fatalf("run local stop --session: %v", err)
	}
	if strings.TrimSpace(stderr) != "" {
		t.Fatalf("expected empty stderr, got %q", stderr)
	}
	if strings.TrimSpace(stdout) != "Stopped session "+firstSession.ID+"." {
		t.Fatalf("unexpected stdout %q", stdout)
	}

	waitForSettacliHelperExit(t, firstProc, 2*time.Second)

	if _, err := os.Stat(filepath.Join(fixture.runtimeRoot, "sessions", firstSession.ID)); !os.IsNotExist(err) {
		t.Fatalf("expected session %q metadata to be removed, stat err=%v", firstSession.ID, err)
	}
	if _, err := os.Stat(filepath.Join(fixture.runtimeRoot, "sessions", secondSession.ID)); err != nil {
		t.Fatalf("expected non-selected session %q to remain, stat err=%v", secondSession.ID, err)
	}
}

func TestRunStopLocalProfileUsesProfileRuntimeSessionsRoot(t *testing.T) {
	t.Parallel()

	fixture := newCLIFixture(t)
	defaultProc := fixture.startProcess(t, "setta.server:app")
	defaultSession := fixture.createSession(t, defaultProc, 61234, time.Date(2026, time.March, 8, 12, 0, 0, 0, time.UTC), "ide")

	root := filepath.Dir(fixture.workspaceRoot)
	lookupHome := filepath.Join(root, ".setta")
	profileSettaHome := filepath.Join(root, "profile-home", ".setta-development")
	profileRuntimeRoot := filepath.Join(root, "profile-runtime")
	if err := os.MkdirAll(filepath.Join(lookupHome, "profiles"), 0o755); err != nil {
		t.Fatalf("mkdir lookup profiles: %v", err)
	}
	if err := os.MkdirAll(profileSettaHome, 0o755); err != nil {
		t.Fatalf("mkdir profile setta home: %v", err)
	}
	writeSettacliJSONFile(t, filepath.Join(lookupHome, "profiles", "dev.json"), map[string]any{
		"name":               "dev",
		"workspaceRoot":      fixture.workspaceRoot,
		"settaHome":          profileSettaHome,
		"runtimeRoot":        profileRuntimeRoot,
		"settaFilesLocation": "local",
	})

	profileRegistry, err := localsessions.NewRegistry(localsessions.RegistryOptions{
		SessionsRoot: filepath.Join(profileRuntimeRoot, "sessions"),
	})
	if err != nil {
		t.Fatalf("new profile registry: %v", err)
	}
	profileProc := fixture.startProcess(t, "setta.server:app")
	profileSession, err := profileRegistry.CreateSession(localsessions.CreateSessionInput{
		WorkspaceRoot:      fixture.workspaceRoot,
		Host:               "127.0.0.1",
		Port:               61235,
		PID:                profileProc.Process.Pid,
		SettaFilesLocation: "local",
		SettaFilesRoot:     fixture.settaFilesRoot,
		RuntimeRoot:        profileRuntimeRoot,
		SettaHome:          profileSettaHome,
		ServerMode:         "ide",
	})
	if err != nil {
		t.Fatalf("create profile session: %v", err)
	}
	profileSession.StartedAt = time.Date(2026, time.March, 8, 12, 5, 0, 0, time.UTC)
	if err := rewriteSessionMetadata(profileSession); err != nil {
		t.Fatalf("rewrite profile session metadata: %v", err)
	}

	stdout, stderr, err := fixture.runFromCWD(
		root,
		"--profile-lookup-home",
		lookupHome,
		"--profile",
		"dev",
		"stop",
		"--workspace",
		fixture.workspaceRoot,
		"--latest",
	)
	if err != nil {
		t.Fatalf("run local stop with profile runtime root: %v", err)
	}
	if strings.TrimSpace(stderr) != "" {
		t.Fatalf("expected empty stderr, got %q", stderr)
	}
	if strings.TrimSpace(stdout) != "Stopped session "+profileSession.ID+"." {
		t.Fatalf("unexpected stdout %q", stdout)
	}

	waitForSettacliHelperExit(t, profileProc, 2*time.Second)

	if _, err := os.Stat(filepath.Join(profileRuntimeRoot, "sessions", profileSession.ID)); !os.IsNotExist(err) {
		t.Fatalf("expected profile session %q metadata to be removed, stat err=%v", profileSession.ID, err)
	}
	if _, err := os.Stat(filepath.Join(fixture.runtimeRoot, "sessions", defaultSession.ID)); err != nil {
		t.Fatalf("expected default runtime session %q to remain, stat err=%v", defaultSession.ID, err)
	}
}

func TestRunStopRemoteLatestForwardsProfileWithoutLocalValidation(t *testing.T) {
	repoRoot := testRepoRootForSettacli(t)
	sessionsRoot := filepath.Join(t.TempDir(), "sessions")
	olderSession := createRemoteSSHStubSession(
		t,
		sessionsRoot,
		"/remote/workspace",
		61234,
		time.Date(2026, time.March, 8, 12, 0, 0, 0, time.UTC),
		string(sshx.RemoteServerModeIDE),
	)
	latestSession := createRemoteSSHStubSession(
		t,
		sessionsRoot,
		"/remote/workspace",
		61235,
		time.Date(2026, time.March, 8, 12, 5, 0, 0, time.UTC),
		string(sshx.RemoteServerModeIDE),
	)
	commandLogPath := filepath.Join(t.TempDir(), "ssh-command.log")
	configureSSHStubEnvForSettacli(t, repoRoot, sessionsRoot, commandLogPath)

	stdout, stderr, err := runCLIWithOSEnv(t.TempDir(),
		"--profile", "missing",
		"stop", "user@host",
		"--workspace", "/remote/workspace",
		"--latest",
	)
	if err != nil {
		t.Fatalf("run remote stop --latest: %v", err)
	}
	if strings.TrimSpace(stderr) != "" {
		t.Fatalf("expected empty stderr, got %q", stderr)
	}
	if stdout != "Stopped session "+latestSession.ID+".\n" {
		t.Fatalf("unexpected stdout %q", stdout)
	}
	if _, err := os.Stat(filepath.Join(sessionsRoot, latestSession.ID)); !os.IsNotExist(err) {
		t.Fatalf("expected latest session %q to be removed, stat err=%v", latestSession.ID, err)
	}
	if _, err := os.Stat(filepath.Join(sessionsRoot, olderSession.ID)); err != nil {
		t.Fatalf("expected older session %q to remain, stat err=%v", olderSession.ID, err)
	}
	commandLog := readSettacliCommandLog(t, commandLogPath)
	if !strings.Contains(commandLog, "--profile missing status --list-sessions --json --workspace /remote/workspace --server-mode ide") {
		t.Fatalf("expected profile forwarding in list command, got %q", commandLog)
	}
	if !strings.Contains(commandLog, "--profile missing status --delete-session "+latestSession.ID) {
		t.Fatalf("expected profile forwarding in delete command, got %q", commandLog)
	}
}

func TestRunStopRemoteAcceptsWorkspaceShortAlias(t *testing.T) {
	repoRoot := testRepoRootForSettacli(t)
	sessionsRoot := filepath.Join(t.TempDir(), "sessions")
	session := createRemoteSSHStubSession(
		t,
		sessionsRoot,
		"/remote/workspace",
		61234,
		time.Date(2026, time.March, 8, 12, 5, 0, 0, time.UTC),
		string(sshx.RemoteServerModeIDE),
	)
	commandLogPath := filepath.Join(t.TempDir(), "ssh-command.log")
	configureSSHStubEnvForSettacli(t, repoRoot, sessionsRoot, commandLogPath)

	stdout, stderr, err := runCLIWithOSEnv(t.TempDir(),
		"stop", "user@host",
		"-w", "/remote/workspace",
		"--session", session.ID,
	)
	if err != nil {
		t.Fatalf("run remote stop with -w: %v", err)
	}
	if strings.TrimSpace(stderr) != "" {
		t.Fatalf("expected empty stderr, got %q", stderr)
	}
	if stdout != "Stopped session "+session.ID+".\n" {
		t.Fatalf("unexpected stdout %q", stdout)
	}
	commandLog := readSettacliCommandLog(t, commandLogPath)
	if !strings.Contains(commandLog, "--workspace /remote/workspace") {
		t.Fatalf("expected workspace forwarding in command log, got %q", commandLog)
	}
}

func TestRunStopRemoteAddsHintForLocallyExpandedRemoteWorkspaceError(t *testing.T) {
	homeDir, err := os.UserHomeDir()
	if err != nil || strings.TrimSpace(homeDir) == "" {
		t.Skip("missing local home directory for expanded-home hint test")
	}

	repoRoot := testRepoRootForSettacli(t)
	t.Setenv("SETTA_SSH_BIN", writeSettacliWorkspaceResolutionFailingSSHWrapper(t, repoRoot, "remote workspace missing"))

	stdout, stderr, err := runCLIWithOSEnv(
		t.TempDir(),
		"stop", "user@host",
		"--workspace", filepath.Join(homeDir, "repo"),
		"--latest",
	)
	if err == nil {
		t.Fatal("expected remote workspace resolution failure")
	}
	if strings.TrimSpace(stdout) != "" {
		t.Fatalf("expected empty stdout, got %q", stdout)
	}
	if strings.TrimSpace(stderr) != "" {
		t.Fatalf("expected empty stderr, got %q", stderr)
	}
	if !strings.Contains(err.Error(), "expanded '~'") {
		t.Fatalf("expected expanded-home hint, got %q", err.Error())
	}
	if !strings.Contains(err.Error(), "--workspace") {
		t.Fatalf("expected workspace flag hint, got %q", err.Error())
	}
}

func TestRunStopRemoteForwardsLauncherServerMode(t *testing.T) {
	repoRoot := testRepoRootForSettacli(t)
	sessionsRoot := filepath.Join(t.TempDir(), "sessions")
	ideSession := createRemoteSSHStubSession(
		t,
		sessionsRoot,
		"/remote/workspace",
		61234,
		time.Date(2026, time.March, 8, 12, 0, 0, 0, time.UTC),
		string(sshx.RemoteServerModeIDE),
	)
	launcherSession := createRemoteSSHStubSession(
		t,
		sessionsRoot,
		"/remote/workspace",
		61235,
		time.Date(2026, time.March, 8, 12, 1, 0, 0, time.UTC),
		string(sshx.RemoteServerModeLauncher),
	)
	commandLogPath := filepath.Join(t.TempDir(), "ssh-command.log")
	configureSSHStubEnvForSettacli(t, repoRoot, sessionsRoot, commandLogPath)

	stdout, stderr, err := runCLIWithOSEnv(t.TempDir(),
		"stop", "user@host",
		"--workspace", "/remote/workspace",
		"--server-mode", "launcher",
	)
	if err != nil {
		t.Fatalf("run remote stop --server-mode launcher: %v", err)
	}
	if strings.TrimSpace(stderr) != "" {
		t.Fatalf("expected empty stderr, got %q", stderr)
	}
	if stdout != "Stopped session "+launcherSession.ID+".\n" {
		t.Fatalf("unexpected stdout %q", stdout)
	}
	if _, err := os.Stat(filepath.Join(sessionsRoot, launcherSession.ID)); !os.IsNotExist(err) {
		t.Fatalf("expected launcher session %q to be removed, stat err=%v", launcherSession.ID, err)
	}
	if _, err := os.Stat(filepath.Join(sessionsRoot, ideSession.ID)); err != nil {
		t.Fatalf("expected IDE session %q to remain, stat err=%v", ideSession.ID, err)
	}
	commandLog := readSettacliCommandLog(t, commandLogPath)
	if !strings.Contains(commandLog, "--server-mode launcher") {
		t.Fatalf("expected launcher server mode forwarding, got %q", commandLog)
	}
}

func TestRunStopRemoteRejectsConflictingSettaFilesInputs(t *testing.T) {
	repoRoot := testRepoRootForSettacli(t)
	sessionsRoot := filepath.Join(t.TempDir(), "sessions")
	createRemoteSSHStubSession(
		t,
		sessionsRoot,
		"/remote/workspace",
		61234,
		time.Date(2026, time.March, 8, 12, 0, 0, 0, time.UTC),
		string(sshx.RemoteServerModeIDE),
	)
	configureSSHStubEnvForSettacli(t, repoRoot, sessionsRoot, filepath.Join(t.TempDir(), "ssh-command.log"))

	stdout, stderr, err := runCLIWithOSEnv(t.TempDir(),
		"--setta-files-root", "/tmp/state",
		"--setta-files-location", "local",
		"stop", "user@host",
		"--workspace", "/remote/workspace",
		"--latest",
	)
	if err == nil {
		t.Fatal("expected conflicting setta-files error")
	}
	if strings.TrimSpace(stdout) != "" {
		t.Fatalf("expected empty stdout, got %q", stdout)
	}
	if strings.TrimSpace(stderr) != "" {
		t.Fatalf("expected empty stderr, got %q", stderr)
	}
	if err.Error() != "Cannot pass both --setta-files-root and --setta-files-location for remote commands." {
		t.Fatalf("unexpected error %q", err.Error())
	}
}

func TestRunStopRemoteForwardsDocumentedRemoteCommandAndPathFlags(t *testing.T) {
	testCases := []struct {
		name         string
		pathArgs     []string
		wantPathFlag string
	}{
		{
			name:         "setta_files_root",
			pathArgs:     []string{"--setta-files-root", "/remote/state-root"},
			wantPathFlag: "--setta-files-root /remote/state-root",
		},
		{
			name:         "setta_files_location",
			pathArgs:     []string{"--setta-files-location", "global"},
			wantPathFlag: "--setta-files-location global",
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			repoRoot := testRepoRootForSettacli(t)
			sessionsRoot := filepath.Join(t.TempDir(), "sessions")
			session := createRemoteSSHStubSession(
				t,
				sessionsRoot,
				"/remote/workspace",
				61234,
				time.Date(2026, time.March, 8, 12, 5, 0, 0, time.UTC),
				string(sshx.RemoteServerModeIDE),
			)
			commandLogPath := filepath.Join(t.TempDir(), "ssh-command.log")
			configureSSHStubEnvForSettacli(t, repoRoot, sessionsRoot, commandLogPath)
			argvLogPath := filepath.Join(t.TempDir(), "ssh-argv.log")
			t.Setenv("SETTA_SSH_BIN", writeSettacliSSHArgLoggingWrapper(t, repoRoot, argvLogPath))

			args := []string{
				"--profile", "missing",
				"--setta-home", "/remote/setta-home",
				"--runtime-root", "/remote/runtime-root",
			}
			args = append(args, testCase.pathArgs...)
			args = append(args,
				"stop", "user@host",
				"--workspace", "/remote/workspace",
				"--session", session.ID,
				"--ssh-args", "-p 2222 -o StrictHostKeyChecking=no",
				"--remote-cmd", "custom-setta",
			)

			stdout, stderr, err := runCLIWithOSEnv(t.TempDir(), args...)
			if err != nil {
				t.Fatalf("run remote stop with forwarded flags: %v", err)
			}
			if strings.TrimSpace(stderr) != "" {
				t.Fatalf("expected empty stderr, got %q", stderr)
			}
			if stdout != "Stopped session "+session.ID+".\n" {
				t.Fatalf("unexpected stdout %q", stdout)
			}

			commandLog := readSettacliCommandLog(t, commandLogPath)
			if !strings.Contains(commandLog, "custom-setta --profile missing --setta-home /remote/setta-home") {
				t.Fatalf("expected remote command and setta-home forwarding, got %q", commandLog)
			}
			if !strings.Contains(commandLog, testCase.wantPathFlag) {
				t.Fatalf("expected remote path forwarding %q, got %q", testCase.wantPathFlag, commandLog)
			}
			if !strings.Contains(commandLog, "--runtime-root /remote/runtime-root") {
				t.Fatalf("expected runtime-root forwarding, got %q", commandLog)
			}

			argvLog := readSettacliCommandLog(t, argvLogPath)
			if !strings.Contains(argvLog, "-p 2222 -o StrictHostKeyChecking=no") {
				t.Fatalf("expected ssh-args forwarding, got %q", argvLog)
			}
			if !strings.Contains(argvLog, "user@host") {
				t.Fatalf("expected ssh target in argv log, got %q", argvLog)
			}
		})
	}
}

func TestSelectRemoteStopTargetsRequiresSelectorForMultipleSessions(t *testing.T) {
	_, err := selectRemoteStopTargets([]sshx.RemoteSessionSummary{
		{
			ID:        "older",
			StartedAt: time.Date(2026, time.March, 8, 12, 0, 0, 0, time.UTC),
		},
		{
			ID:        "newer",
			StartedAt: time.Date(2026, time.March, 8, 12, 1, 0, 0, time.UTC),
		},
	}, "", false, false)
	if err == nil {
		t.Fatal("expected selector error")
	}
	if err.Error() != "Multiple sessions found; use --session <id>, --latest, or --all." {
		t.Fatalf("unexpected error %q", err.Error())
	}
}

func TestSelectRemoteStopTargetsReturnsSessionNotFoundError(t *testing.T) {
	_, err := selectRemoteStopTargets([]sshx.RemoteSessionSummary{
		{ID: "known"},
	}, "missing", false, false)
	if err == nil {
		t.Fatal("expected missing session error")
	}
	if err.Error() != "Session missing not found." {
		t.Fatalf("unexpected error %q", err.Error())
	}
}

func TestRunStopRemoteValidationRejectsInvalidFlagCombinations(t *testing.T) {
	testCases := []struct {
		name           string
		args           []string
		wantErrMessage string
	}{
		{
			name:           "extra_positional_argument",
			args:           []string{"stop", "user@host", "--workspace", "/remote/workspace", "extra"},
			wantErrMessage: "stop accepts flags after a single ssh_target, not additional positional arguments",
		},
		{
			name:           "conflicting_session_and_latest",
			args:           []string{"stop", "user@host", "--workspace", "/remote/workspace", "--session", "session-a", "--latest"},
			wantErrMessage: "use either --session or --latest, not both",
		},
		{
			name:           "all_with_selector",
			args:           []string{"stop", "user@host", "--workspace", "/remote/workspace", "--all", "--session", "session-a"},
			wantErrMessage: "use --all by itself",
		},
		{
			name:           "missing_workspace",
			args:           []string{"stop", "user@host", "--latest"},
			wantErrMessage: "--workspace is required for remote stop",
		},
		{
			name:           "invalid_server_mode",
			args:           []string{"stop", "user@host", "--workspace", "/remote/workspace", "--server-mode", "share"},
			wantErrMessage: `invalid --server-mode "share"`,
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			stdout, stderr, err := runCLIWithOSEnv(t.TempDir(), testCase.args...)
			if err == nil {
				t.Fatal("expected validation error")
			}
			if strings.TrimSpace(stdout) != "" {
				t.Fatalf("expected empty stdout, got %q", stdout)
			}
			if strings.TrimSpace(stderr) != "" {
				t.Fatalf("expected empty stderr, got %q", stderr)
			}
			if err.Error() != testCase.wantErrMessage {
				t.Fatalf("expected %q, got %q", testCase.wantErrMessage, err.Error())
			}
		})
	}
}

func createLocalStopSessionForWorkspace(
	t *testing.T,
	fixture *cliFixture,
	proc *exec.Cmd,
	workspaceRoot string,
	port int,
	startedAt time.Time,
	serverMode string,
) auth.SessionMetadata {
	t.Helper()

	if proc == nil || proc.Process == nil {
		t.Fatal("process is required")
	}
	metadata, err := fixture.registry.CreateSession(localsessions.CreateSessionInput{
		WorkspaceRoot:      workspaceRoot,
		Host:               "127.0.0.1",
		Port:               port,
		PID:                proc.Process.Pid,
		SettaFilesLocation: "local",
		SettaFilesRoot:     fixture.settaFilesRoot,
		RuntimeRoot:        fixture.runtimeRoot,
		SettaHome:          fixture.settaHome,
		ServerMode:         serverMode,
	})
	if err != nil {
		t.Fatalf("create session for workspace: %v", err)
	}
	metadata.StartedAt = startedAt.UTC()
	if err := rewriteSessionMetadata(metadata); err != nil {
		t.Fatalf("rewrite session metadata: %v", err)
	}
	return metadata
}

func waitForSettacliHelperExit(t *testing.T, proc *exec.Cmd, timeout time.Duration) {
	t.Helper()

	waitDone := make(chan error, 1)
	go func() {
		waitDone <- proc.Wait()
	}()
	select {
	case err := <-waitDone:
		if err == nil {
			t.Fatal("expected helper process to exit via kill signal")
		}
	case <-time.After(timeout):
		t.Fatal("timed out waiting for helper process to exit")
	}
}

func writeSettacliJSONFile(t *testing.T, path string, payload any) {
	t.Helper()

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir json parent: %v", err)
	}
	raw, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		t.Fatalf("marshal json payload: %v", err)
	}
	raw = append(raw, '\n')
	if err := os.WriteFile(path, raw, 0o644); err != nil {
		t.Fatalf("write json payload: %v", err)
	}
}

func runCLIWithOSEnv(cwd string, args ...string) (string, string, error) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	err := Run(args, RunOptions{
		Stdout:    &stdout,
		Stderr:    &stderr,
		Stdin:     strings.NewReader(""),
		CWD:       cwd,
		EnvLookup: os.LookupEnv,
		Now:       func() time.Time { return time.Date(2026, time.March, 8, 12, 30, 0, 0, time.UTC) },
	})
	return stdout.String(), stderr.String(), err
}

func createRemoteSSHStubSession(t *testing.T, sessionsRoot string, workspaceRoot string, port int, startedAt time.Time, serverMode string) auth.SessionMetadata {
	t.Helper()

	registry, err := localsessions.NewRegistry(localsessions.RegistryOptions{
		SessionsRoot: sessionsRoot,
	})
	if err != nil {
		t.Fatalf("new remote ssh stub registry: %v", err)
	}
	session, err := registry.CreateSession(localsessions.CreateSessionInput{
		WorkspaceRoot:      workspaceRoot,
		Host:               "127.0.0.1",
		Port:               port,
		PID:                os.Getpid(),
		SettaFilesLocation: "local",
		RuntimeRoot:        "/remote/runtime",
		ServerMode:         serverMode,
	})
	if err != nil {
		t.Fatalf("create remote ssh stub session: %v", err)
	}
	session.StartedAt = startedAt.UTC()
	if err := rewriteSessionMetadata(session); err != nil {
		t.Fatalf("rewrite remote ssh stub metadata: %v", err)
	}
	return session
}

func configureSSHStubEnvForSettacli(t *testing.T, repoRoot string, sessionsRoot string, commandLogPath string) {
	t.Helper()

	backendPath := filepath.Join(repoRoot, "backend")
	existingPythonPath := strings.TrimSpace(os.Getenv("PYTHONPATH"))
	if existingPythonPath == "" {
		t.Setenv("PYTHONPATH", backendPath)
	} else {
		t.Setenv("PYTHONPATH", backendPath+string(os.PathListSeparator)+existingPythonPath)
	}
	t.Setenv("SETTA_SSH_BIN", filepath.Join(repoRoot, "scripts", "test", "ssh"))
	t.Setenv("SETTA_SESSIONS_ROOT", sessionsRoot)
	t.Setenv("SETTA_RUNTIME_ROOT", "/remote/runtime")
	t.Setenv("SETTA_FILES_LOCATION", "local")
	t.Setenv("SETTA_SSH_STUB_COMMAND_LOG_FILE", commandLogPath)
}

func testRepoRootForSettacli(t *testing.T) string {
	t.Helper()

	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("resolve caller path")
	}
	return filepath.Clean(filepath.Join(filepath.Dir(file), "..", ".."))
}

func readSettacliCommandLog(t *testing.T, path string) string {
	t.Helper()

	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read ssh command log %q: %v", path, err)
	}
	return string(content)
}

func writeSettacliSSHArgLoggingWrapper(t *testing.T, repoRoot string, argvLogPath string) string {
	t.Helper()

	wrapperPath := filepath.Join(t.TempDir(), "ssh-wrapper.sh")
	script := "#!/bin/sh\n" +
		"printf '%s\\n' \"$*\" >> \"$SETTA_SSH_STUB_ARGV_LOG_FILE\"\n" +
		"exec \"" + filepath.Join(repoRoot, "scripts", "test", "ssh") + "\" \"$@\"\n"
	if err := os.WriteFile(wrapperPath, []byte(script), 0o755); err != nil {
		t.Fatalf("write ssh wrapper: %v", err)
	}
	t.Setenv("SETTA_SSH_STUB_ARGV_LOG_FILE", argvLogPath)
	return wrapperPath
}
