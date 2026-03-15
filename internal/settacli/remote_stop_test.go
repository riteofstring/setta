package settacli

import (
	"bytes"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"setta/internal/auth"
	"setta/internal/localsessions"
	"setta/internal/sshx"
)

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
			name:           "missing_ssh_target",
			args:           []string{"stop", "--workspace", "/remote/workspace"},
			wantErrMessage: "local stop is not implemented in cmd/setta-cli yet; provide <ssh_target> for remote stop",
		},
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
