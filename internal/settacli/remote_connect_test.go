package settacli

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/shirou/gopsutil/v4/process"
	"setta/internal/sshx"
)

func TestRunConnectAliasPrintOnlyForwardsProfileWithoutLocalValidation(t *testing.T) {
	repoRoot := testRepoRootForSettacli(t)
	sessionsRoot := filepath.Join(t.TempDir(), "sessions")
	session := createRemoteSSHStubSession(
		t,
		sessionsRoot,
		"/remote/workspace",
		61234,
		time.Date(2026, time.March, 8, 12, 0, 0, 0, time.UTC),
		string(sshx.RemoteServerModeIDE),
	)
	commandLogPath := filepath.Join(t.TempDir(), "ssh-command.log")
	configureSSHStubEnvForSettacli(t, repoRoot, sessionsRoot, commandLogPath)
	cwd := t.TempDir()

	stdout, stderr, err := runCLIWithOSEnv(cwd,
		"--profile", "missing",
		"c", "user@host",
		"--workspace", "/remote/workspace",
		"--latest",
		"--print-only",
	)
	if err != nil {
		t.Fatalf("run connect alias --print-only: %v", err)
	}
	if strings.TrimSpace(stderr) != "" {
		t.Fatalf("expected empty stderr, got %q", stderr)
	}
	lines := strings.Split(strings.TrimSpace(stdout), "\n")
	if len(lines) != 3 {
		t.Fatalf("expected tunnel command, bootstrap url, and token lines; got %q", stdout)
	}
	if !strings.Contains(lines[0], "user@host") || !strings.Contains(lines[0], "127.0.0.1:61234") {
		t.Fatalf("unexpected tunnel command %q", lines[0])
	}
	if !strings.HasPrefix(lines[1], "http://127.0.0.1:") || !strings.Contains(lines[1], "/__setta__/bootstrap#token=") {
		t.Fatalf("unexpected local bootstrap url %q", lines[1])
	}
	if strings.TrimSpace(lines[2]) == "" {
		t.Fatal("expected token line")
	}

	runtimeRoot, err := resolveLocalConnectRuntimeRoot(cwd)
	if err != nil {
		t.Fatalf("resolve local connect runtime root: %v", err)
	}
	metadataFiles, err := filepath.Glob(filepath.Join(runtimeRoot, "ssh_tunnels", "*.json"))
	if err != nil {
		t.Fatalf("glob tunnel metadata: %v", err)
	}
	if len(metadataFiles) != 0 {
		t.Fatalf("expected print-only mode to avoid tunnel metadata, got %#v", metadataFiles)
	}

	commandLog := readSettacliCommandLog(t, commandLogPath)
	if !strings.Contains(commandLog, "--profile missing status --list-sessions --json --workspace /remote/workspace --server-mode ide") {
		t.Fatalf("expected profile forwarding in list command, got %q", commandLog)
	}
	if !strings.Contains(commandLog, "--profile missing status --connect-info --json --workspace /remote/workspace --session "+session.ID) {
		t.Fatalf("expected profile forwarding in connect-info command, got %q", commandLog)
	}
}

func TestRunConnectAcceptsWorkspaceShortAlias(t *testing.T) {
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
	createRemoteSSHStubSession(
		t,
		sessionsRoot,
		"/remote/workspace",
		61235,
		time.Date(2026, time.March, 8, 12, 1, 0, 0, time.UTC),
		string(sshx.RemoteServerModeIDE),
	)
	commandLogPath := filepath.Join(t.TempDir(), "ssh-command.log")
	configureSSHStubEnvForSettacli(t, repoRoot, sessionsRoot, commandLogPath)

	stdout, stderr, err := runCLIWithOSEnv(t.TempDir(),
		"connect", "user@host",
		"-w", "/remote/workspace",
		"--print-only",
	)
	if err == nil {
		t.Fatal("expected multi-session selection error")
	}
	if strings.TrimSpace(stderr) != "" {
		t.Fatalf("expected empty stderr, got %q", stderr)
	}
	if strings.TrimSpace(stdout) != "" {
		t.Fatalf("expected empty stdout, got %q", stdout)
	}
	if err.Error() != "Use --session or --latest for remote connect." {
		t.Fatalf("unexpected error %q", err.Error())
	}
	commandLog := readSettacliCommandLog(t, commandLogPath)
	if !strings.Contains(commandLog, "--workspace /remote/workspace") {
		t.Fatalf("expected workspace forwarding in command log, got %q", commandLog)
	}
	if !strings.Contains(commandLog, "status --list-sessions --json --workspace /remote/workspace --server-mode ide") {
		t.Fatalf("expected list command with forwarded workspace, got %q", commandLog)
	}
}

func TestRunConnectRejectsMultipleSessionsWithoutSelector(t *testing.T) {
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
	createRemoteSSHStubSession(
		t,
		sessionsRoot,
		"/remote/workspace",
		61235,
		time.Date(2026, time.March, 8, 12, 1, 0, 0, time.UTC),
		string(sshx.RemoteServerModeIDE),
	)
	configureSSHStubEnvForSettacli(t, repoRoot, sessionsRoot, filepath.Join(t.TempDir(), "ssh-command.log"))

	_, stderr, err := runCLIWithOSEnv(t.TempDir(),
		"connect", "user@host",
		"--workspace", "/remote/workspace",
		"--print-only",
	)
	if err == nil {
		t.Fatal("expected multi-session selection error")
	}
	if strings.TrimSpace(stderr) != "" {
		t.Fatalf("expected empty stderr, got %q", stderr)
	}
	if err.Error() != "Use --session or --latest for remote connect." {
		t.Fatalf("unexpected error %q", err.Error())
	}
}

func TestRunConnectDetachCreatesTunnelMetadata(t *testing.T) {
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
	t.Setenv("SETTA_SSH_STUB_DISABLE_FORWARD", "1")
	cwd := t.TempDir()

	stdout, stderr, err := runCLIWithOSEnv(cwd,
		"connect", "user@host",
		"--workspace", "/remote/workspace",
		"--latest",
		"--detach",
		"--no-open",
	)
	if err != nil {
		t.Fatalf("run connect --detach: %v", err)
	}
	if strings.TrimSpace(stderr) != "" {
		t.Fatalf("expected empty stderr, got %q", stderr)
	}
	if !strings.Contains(stdout, "Tunnel running in background") {
		t.Fatalf("expected detach output, got %q", stdout)
	}

	runtimeRoot, err := resolveLocalConnectRuntimeRoot(cwd)
	if err != nil {
		t.Fatalf("resolve local connect runtime root: %v", err)
	}
	metadataFiles, err := filepath.Glob(filepath.Join(runtimeRoot, "ssh_tunnels", "*.json"))
	if err != nil {
		t.Fatalf("glob tunnel metadata: %v", err)
	}
	if len(metadataFiles) != 1 {
		t.Fatalf("expected one tunnel metadata file, got %#v", metadataFiles)
	}
	metadata := readTunnelMetadataForSettacli(t, metadataFiles[0])
	if metadata.RemoteHost != "127.0.0.1" || metadata.RemotePort != 61234 {
		t.Fatalf("unexpected tunnel metadata %#v", metadata)
	}
	if metadata.PID <= 0 {
		t.Fatalf("expected positive tunnel pid, got %#v", metadata)
	}

	service, err := sshx.NewService(sshx.ServiceOptions{
		RuntimeRoot: runtimeRoot,
		SSHBin:      filepath.Join(repoRoot, "scripts", "test", "ssh"),
	})
	if err != nil {
		t.Fatalf("new sshx service: %v", err)
	}
	if err := service.RollbackLocalSSHTunnel(sshx.RollbackTunnelInput{
		SSHTarget:  "user@host",
		RemoteHost: metadata.RemoteHost,
		RemotePort: metadata.RemotePort,
	}); err != nil {
		t.Fatalf("rollback local ssh tunnel: %v", err)
	}
	waitForSettacliProcessExit(t, metadata.PID)
}

func TestRunConnectRejectsConflictingSettaFilesInputs(t *testing.T) {
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

	_, stderr, err := runCLIWithOSEnv(t.TempDir(),
		"--setta-files-root", "/tmp/state",
		"--setta-files-location", "local",
		"connect", "user@host",
		"--workspace", "/remote/workspace",
		"--latest",
		"--print-only",
	)
	if err == nil {
		t.Fatal("expected conflicting setta-files error")
	}
	if strings.TrimSpace(stderr) != "" {
		t.Fatalf("expected empty stderr, got %q", stderr)
	}
	if err.Error() != "Cannot pass both --setta-files-root and --setta-files-location for remote commands." {
		t.Fatalf("unexpected error %q", err.Error())
	}
}

func TestRunConnectValidationRejectsInvalidFlagCombinations(t *testing.T) {
	testCases := []struct {
		name           string
		args           []string
		wantErrMessage string
	}{
		{
			name:           "missing_ssh_target",
			args:           []string{"connect", "--workspace", "/remote/workspace"},
			wantErrMessage: "connect requires <ssh_target>",
		},
		{
			name:           "extra_positional_argument",
			args:           []string{"connect", "user@host", "--workspace", "/remote/workspace", "extra"},
			wantErrMessage: "connect accepts flags after a single ssh_target, not additional positional arguments",
		},
		{
			name:           "conflicting_session_and_latest",
			args:           []string{"connect", "user@host", "--workspace", "/remote/workspace", "--session", "session-a", "--latest"},
			wantErrMessage: "Use either --session or --latest, not both.",
		},
		{
			name:           "conflicting_detach_and_print_only",
			args:           []string{"connect", "user@host", "--workspace", "/remote/workspace", "--detach", "--print-only"},
			wantErrMessage: "Use either --detach or --print-only, not both.",
		},
		{
			name:           "invalid_local_port",
			args:           []string{"connect", "user@host", "--workspace", "/remote/workspace", "--local-port", "70000"},
			wantErrMessage: "Invalid local port: 70000",
		},
		{
			name:           "missing_workspace",
			args:           []string{"connect", "user@host", "--latest"},
			wantErrMessage: "--workspace is required for SSH connect",
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

func readTunnelMetadataForSettacli(t *testing.T, path string) sshx.TunnelMetadata {
	t.Helper()

	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read tunnel metadata %q: %v", path, err)
	}
	var metadata sshx.TunnelMetadata
	if err := json.Unmarshal(content, &metadata); err != nil {
		t.Fatalf("decode tunnel metadata %q: %v", path, err)
	}
	return metadata
}

func waitForSettacliProcessExit(t *testing.T, pid int) {
	t.Helper()

	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		proc, err := process.NewProcess(int32(pid))
		if err != nil {
			return
		}
		running, err := proc.IsRunning()
		if err != nil || !running {
			return
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatalf("process %d did not exit", pid)
}
