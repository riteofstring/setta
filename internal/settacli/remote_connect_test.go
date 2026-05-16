package settacli

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"syscall"
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

func TestRunConnectAddsHintForLocallyExpandedRemoteWorkspaceError(t *testing.T) {
	homeDir, err := os.UserHomeDir()
	if err != nil || strings.TrimSpace(homeDir) == "" {
		t.Skip("missing local home directory for expanded-home hint test")
	}

	repoRoot := testRepoRootForSettacli(t)
	t.Setenv("SETTA_SSH_BIN", writeSettacliWorkspaceResolutionFailingSSHWrapper(t, repoRoot, "remote workspace missing"))

	stdout, stderr, err := runCLIWithOSEnv(
		t.TempDir(),
		"connect", "user@host",
		"--workspace", filepath.Join(homeDir, "repo"),
		"--print-only",
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

func TestRunConnectForwardsDocumentedRemoteCommandAndPathFlags(t *testing.T) {
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
				time.Date(2026, time.March, 8, 12, 0, 0, 0, time.UTC),
				string(sshx.RemoteServerModeIDE),
			)
			commandLogPath := filepath.Join(t.TempDir(), "ssh-command.log")
			configureSSHStubEnvForSettacli(t, repoRoot, sessionsRoot, commandLogPath)
			argvLogPath := filepath.Join(t.TempDir(), "ssh-argv.log")
			t.Setenv("SETTA_SSH_BIN", writeSettacliSSHArgLoggingWrapper(t, repoRoot, argvLogPath))

			cwd := t.TempDir()
			args := []string{
				"--profile", "missing",
				"--setta-home", "/remote/setta-home",
				"--runtime-root", "/remote/runtime-root",
			}
			args = append(args, testCase.pathArgs...)
			args = append(args,
				"connect", "user@host",
				"--workspace", "/remote/workspace",
				"--session", session.ID,
				"--ssh-args", "-p 2222 -o StrictHostKeyChecking=no",
				"--remote-cmd", "custom-setta",
				"--print-only",
			)

			stdout, stderr, err := runCLIWithOSEnv(cwd, args...)
			if err != nil {
				t.Fatalf("run connect with forwarded flags: %v", err)
			}
			if strings.TrimSpace(stderr) != "" {
				t.Fatalf("expected empty stderr, got %q", stderr)
			}

			lines := strings.Split(strings.TrimSpace(stdout), "\n")
			if len(lines) != 3 {
				t.Fatalf("expected tunnel command, bootstrap url, and token lines; got %q", stdout)
			}
			if !strings.Contains(lines[0], "-p 2222 -o StrictHostKeyChecking=no") {
				t.Fatalf("expected ssh args in tunnel command, got %q", lines[0])
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
			if !strings.Contains(commandLog, "status --list-sessions --json --workspace /remote/workspace --server-mode ide") {
				t.Fatalf("expected list-sessions call, got %q", commandLog)
			}
			if !strings.Contains(commandLog, "status --connect-info --json --workspace /remote/workspace --session "+session.ID) {
				t.Fatalf("expected connect-info call, got %q", commandLog)
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

func TestRunConnectForegroundOpensBrowserAndPrintsKeepaliveHints(t *testing.T) {
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
	tunnelArgvLogPath := filepath.Join(t.TempDir(), "ssh-tunnel-argv.log")
	t.Setenv("SETTA_SSH_BIN", writeSettacliForegroundSSHWrapper(t, repoRoot, tunnelArgvLogPath))
	t.Setenv("SETTA_SSH_STUB_DISABLE_FORWARD", "1")
	t.Setenv("SETTA_SETTACLI_TUNNEL_MODE", "persist")
	tunnelPIDPath := filepath.Join(t.TempDir(), "ssh-tunnel.pid")
	t.Setenv("SETTA_SETTACLI_TUNNEL_PID_FILE", tunnelPIDPath)
	browserLogPath := filepath.Join(t.TempDir(), "browser.log")
	addSettacliBrowserWrapperToPath(t, browserLogPath)

	stdoutBuffer := &lockedBuffer{}
	stderrBuffer := &lockedBuffer{}
	resultCh := runAsyncCLIWithBuffers(t.TempDir(), stdoutBuffer, stderrBuffer,
		"connect", "user@host",
		"--workspace", "/remote/workspace",
		"--session", session.ID,
		"--local-port", "61321",
	)
	pid := waitForSettacliPIDFile(t, tunnelPIDPath)
	waitForSettacliOutput(t, stdoutBuffer, "Tunnel active (Ctrl+C to stop).")
	process, err := os.FindProcess(pid)
	if err != nil {
		t.Fatalf("find tunnel process: %v", err)
	}
	if err := process.Signal(syscall.SIGTERM); err != nil {
		t.Fatalf("signal tunnel process: %v", err)
	}
	result := <-resultCh
	stdout, stderr, err := stdoutBuffer.String(), stderrBuffer.String(), result.err
	if err != nil {
		t.Fatalf("run foreground connect: %v", err)
	}
	if strings.TrimSpace(stderr) != "" {
		t.Fatalf("expected empty stderr, got %q", stderr)
	}
	if !strings.Contains(stdout, "Using session "+session.ID+" (port 61234).") {
		t.Fatalf("expected session banner, got %q", stdout)
	}
	if !strings.Contains(stdout, "Opening local tunnel on 61321 (keep this terminal open).") {
		t.Fatalf("expected foreground tunnel banner, got %q", stdout)
	}
	if !strings.Contains(stdout, "Opening browser...") {
		t.Fatalf("expected browser open banner, got %q", stdout)
	}
	if !strings.Contains(stdout, "Tunnel active (Ctrl+C to stop).") {
		t.Fatalf("expected active tunnel hint, got %q", stdout)
	}
	if !strings.Contains(stdout, "Tip: use --detach to background the tunnel or --print-only to copy commands.") {
		t.Fatalf("expected keepalive hint, got %q", stdout)
	}

	tunnelArgvLog := readSettacliCommandLog(t, tunnelArgvLogPath)
	if !strings.Contains(tunnelArgvLog, "-L 61321:127.0.0.1:61234") {
		t.Fatalf("expected foreground tunnel args, got %q", tunnelArgvLog)
	}
	if !strings.Contains(tunnelArgvLog, "user@host") {
		t.Fatalf("expected ssh target in tunnel args, got %q", tunnelArgvLog)
	}

	browserLog := readSettacliCommandLog(t, browserLogPath)
	if !strings.Contains(browserLog, "http://127.0.0.1:61321/__setta__/bootstrap#token=") {
		t.Fatalf("expected bootstrap url in browser log, got %q", browserLog)
	}
}

func TestRunConnectForegroundNoOpenSkipsBrowserLaunch(t *testing.T) {
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
	tunnelArgvLogPath := filepath.Join(t.TempDir(), "ssh-tunnel-argv.log")
	t.Setenv("SETTA_SSH_BIN", writeSettacliForegroundSSHWrapper(t, repoRoot, tunnelArgvLogPath))
	t.Setenv("SETTA_SSH_STUB_DISABLE_FORWARD", "1")
	t.Setenv("SETTA_SETTACLI_TUNNEL_MODE", "persist")
	tunnelPIDPath := filepath.Join(t.TempDir(), "ssh-tunnel.pid")
	t.Setenv("SETTA_SETTACLI_TUNNEL_PID_FILE", tunnelPIDPath)
	browserLogPath := filepath.Join(t.TempDir(), "browser.log")
	addSettacliBrowserWrapperToPath(t, browserLogPath)

	stdoutBuffer := &lockedBuffer{}
	stderrBuffer := &lockedBuffer{}
	resultCh := runAsyncCLIWithBuffers(t.TempDir(), stdoutBuffer, stderrBuffer,
		"connect", "user@host",
		"--workspace", "/remote/workspace",
		"--session", session.ID,
		"--local-port", "61322",
		"--no-open",
	)
	pid := waitForSettacliPIDFile(t, tunnelPIDPath)
	waitForSettacliOutput(t, stdoutBuffer, "Tunnel active (Ctrl+C to stop).")
	process, err := os.FindProcess(pid)
	if err != nil {
		t.Fatalf("find tunnel process: %v", err)
	}
	if err := process.Signal(syscall.SIGTERM); err != nil {
		t.Fatalf("signal tunnel process: %v", err)
	}
	result := <-resultCh
	stdout, stderr, err := stdoutBuffer.String(), stderrBuffer.String(), result.err
	if err != nil {
		t.Fatalf("run foreground connect --no-open: %v", err)
	}
	if strings.TrimSpace(stderr) != "" {
		t.Fatalf("expected empty stderr, got %q", stderr)
	}
	if strings.Contains(stdout, "Opening browser...") {
		t.Fatalf("expected no browser banner, got %q", stdout)
	}
	if _, err := os.Stat(browserLogPath); !os.IsNotExist(err) {
		t.Fatalf("expected browser log to stay absent, stat err=%v", err)
	}
}

func TestRunConnectForegroundFailsClosedWhenTunnelNeverBinds(t *testing.T) {
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
	tunnelArgvLogPath := filepath.Join(t.TempDir(), "ssh-tunnel-argv.log")
	t.Setenv("SETTA_SSH_BIN", writeSettacliForegroundSSHWrapper(t, repoRoot, tunnelArgvLogPath))

	stdout, stderr, err := runCLIWithOSEnv(t.TempDir(),
		"connect", "user@host",
		"--workspace", "/remote/workspace",
		"--session", session.ID,
		"--local-port", "61323",
		"--no-open",
	)
	if err == nil {
		t.Fatal("expected bind failure")
	}
	if strings.TrimSpace(stderr) != "" {
		t.Fatalf("expected empty stderr, got %q", stderr)
	}
	if err.Error() != "SSH tunnel did not bind local port 61323 within 2 seconds." {
		t.Fatalf("unexpected error %q", err.Error())
	}
	if !strings.Contains(stdout, "Using session "+session.ID+" (port 61234).") {
		t.Fatalf("expected session banner before failure, got %q", stdout)
	}
	if !strings.Contains(stdout, "Opening local tunnel on 61323 (keep this terminal open).") {
		t.Fatalf("expected tunnel banner before failure, got %q", stdout)
	}
	if strings.Contains(stdout, "Tunnel active (Ctrl+C to stop).") {
		t.Fatalf("did not expect success hint on failure, got %q", stdout)
	}
}

func TestRunConnectDetachVerbosePrintsResolutionDetailsAndBootstrapURL(t *testing.T) {
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
		"--local-port", "61324",
		"--verbose",
		"--ssh-args", "-p 2222",
		"--remote-cmd", "custom-setta",
	)
	if err != nil {
		t.Fatalf("run connect --detach --verbose: %v", err)
	}
	if strings.TrimSpace(stderr) != "" {
		t.Fatalf("expected empty stderr, got %q", stderr)
	}
	if !strings.Contains(stdout, "SSH args: -p 2222") {
		t.Fatalf("expected ssh args line, got %q", stdout)
	}
	if !strings.Contains(stdout, "Remote shell: bash") {
		t.Fatalf("expected remote shell line, got %q", stdout)
	}
	if !strings.Contains(stdout, "Remote workspace: /remote/workspace") {
		t.Fatalf("expected remote workspace line, got %q", stdout)
	}
	if !strings.Contains(stdout, "Remote Setta command: custom-setta") {
		t.Fatalf("expected remote command line, got %q", stdout)
	}
	if !strings.Contains(stdout, "Remote sessions found: 1") {
		t.Fatalf("expected session-count line, got %q", stdout)
	}
	if !strings.Contains(stdout, "Local bootstrap URL: http://127.0.0.1:61324/__setta__/bootstrap#token=") {
		t.Fatalf("expected local bootstrap url, got %q", stdout)
	}
	if !strings.Contains(stdout, "Ensuring local tunnel is running (background).") {
		t.Fatalf("expected detach banner, got %q", stdout)
	}
	if !strings.Contains(stdout, "Tunnel running in background") {
		t.Fatalf("expected detach result, got %q", stdout)
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
	stopSettacliProcessIfRunning(t, metadata.PID)
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

type settacliRunResult struct {
	err error
}

type lockedBuffer struct {
	mu  sync.Mutex
	buf bytes.Buffer
}

func (b *lockedBuffer) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.Write(p)
}

func (b *lockedBuffer) String() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.String()
}

func runAsyncCLIWithBuffers(cwd string, stdout *lockedBuffer, stderr *lockedBuffer, args ...string) <-chan settacliRunResult {
	resultCh := make(chan settacliRunResult, 1)
	go func() {
		err := Run(args, RunOptions{
			Stdout:    stdout,
			Stderr:    stderr,
			Stdin:     strings.NewReader(""),
			CWD:       cwd,
			EnvLookup: os.LookupEnv,
			Now:       func() time.Time { return time.Date(2026, time.March, 8, 12, 30, 0, 0, time.UTC) },
		})
		resultCh <- settacliRunResult{err: err}
	}()
	return resultCh
}

func waitForSettacliOutput(t *testing.T, stdout *lockedBuffer, needle string) {
	t.Helper()

	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if strings.Contains(stdout.String(), needle) {
			return
		}
		time.Sleep(25 * time.Millisecond)
	}
	t.Fatalf("stdout never contained %q; got %q", needle, stdout.String())
}

func waitForSettacliPIDFile(t *testing.T, path string) int {
	t.Helper()

	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		content, err := os.ReadFile(path)
		if err == nil {
			pidString := strings.TrimSpace(string(content))
			if pidString != "" {
				pid, convErr := strconv.Atoi(pidString)
				if convErr != nil {
					t.Fatalf("decode pid file %q: %v", path, convErr)
				}
				return pid
			}
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatalf("pid file %q was not created", path)
	return 0
}

func writeSettacliForegroundSSHWrapper(t *testing.T, repoRoot string, argvLogPath string) string {
	t.Helper()

	wrapperPath := filepath.Join(t.TempDir(), "ssh-foreground-wrapper.sh")
	script := "#!/bin/sh\n" +
		"has_n=0\n" +
		"has_l=0\n" +
		"for arg in \"$@\"; do\n" +
		"  if [ \"$arg\" = \"-N\" ]; then has_n=1; fi\n" +
		"  if [ \"$arg\" = \"-L\" ]; then has_l=1; fi\n" +
		"done\n" +
		"if [ \"$has_n$has_l\" = \"11\" ]; then\n" +
		"  printf '%s\\n' \"$*\" >> \"$SETTA_SSH_STUB_ARGV_LOG_FILE\"\n" +
		"  if [ \"$SETTA_SETTACLI_TUNNEL_MODE\" = \"persist\" ]; then\n" +
		"    trap 'exit 0' TERM INT\n" +
		"    if [ -n \"$SETTA_SETTACLI_TUNNEL_PID_FILE\" ]; then printf '%s\\n' \"$$\" > \"$SETTA_SETTACLI_TUNNEL_PID_FILE\"; fi\n" +
		"    while :; do sleep 1; done\n" +
		"  fi\n" +
		"  exit \"${SETTA_SETTACLI_TUNNEL_EXIT_CODE:-0}\"\n" +
		"fi\n" +
		"exec \"" + filepath.Join(repoRoot, "scripts", "test", "ssh") + "\" \"$@\"\n"
	if err := os.WriteFile(wrapperPath, []byte(script), 0o755); err != nil {
		t.Fatalf("write foreground ssh wrapper: %v", err)
	}
	t.Setenv("SETTA_SSH_STUB_ARGV_LOG_FILE", argvLogPath)
	return wrapperPath
}

func addSettacliBrowserWrapperToPath(t *testing.T, browserLogPath string) {
	t.Helper()

	commandName := "xdg-open"
	if runtime.GOOS == "darwin" {
		commandName = "open"
	}
	wrapperDir := t.TempDir()
	wrapperPath := filepath.Join(wrapperDir, commandName)
	script := "#!/bin/sh\n" +
		"printf '%s\\n' \"$*\" >> \"" + browserLogPath + "\"\n"
	if err := os.WriteFile(wrapperPath, []byte(script), 0o755); err != nil {
		t.Fatalf("write browser wrapper: %v", err)
	}
	existingPath := os.Getenv("PATH")
	if existingPath == "" {
		t.Setenv("PATH", wrapperDir)
		return
	}
	t.Setenv("PATH", wrapperDir+string(os.PathListSeparator)+existingPath)
}

func writeSettacliWorkspaceResolutionFailingSSHWrapper(t *testing.T, repoRoot string, message string) string {
	t.Helper()

	wrapperPath := filepath.Join(t.TempDir(), "ssh-failing-wrapper.sh")
	script := "#!/bin/sh\n" +
		"case \"$*\" in\n" +
		"  *\"pwd -P\"*)\n" +
		"    printf '%s\\n' '" + strings.ReplaceAll(message, "'", `'"'"'`) + "' >&2\n" +
		"    exit 1\n" +
		"    ;;\n" +
		"esac\n" +
		"exec \"" + filepath.Join(repoRoot, "scripts", "test", "ssh") + "\" \"$@\"\n"
	if err := os.WriteFile(wrapperPath, []byte(script), 0o755); err != nil {
		t.Fatalf("write failing ssh wrapper: %v", err)
	}
	return wrapperPath
}

func stopSettacliProcessIfRunning(t *testing.T, pid int) {
	t.Helper()

	deadline := time.Now().Add(3 * time.Second)
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
	processHandle, err := os.FindProcess(pid)
	if err == nil {
		_ = processHandle.Signal(syscall.SIGTERM)
	}
}
