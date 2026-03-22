package sshx

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/shirou/gopsutil/v4/process"
	"setta/internal/auth"
	"setta/internal/localsessions"
)

func TestServiceConnectWorkspaceSessionReturnsBootstrapURLAndReusesTunnel(t *testing.T) {
	repoRoot := testRepoRoot(t)
	stubPath := filepath.Join(repoRoot, "scripts", "test", "ssh")
	runtimeRoot := filepath.Join(t.TempDir(), "runtime")
	sessionsRoot := filepath.Join(t.TempDir(), "sessions")
	session := createSSHStubSession(t, sessionsRoot, "/remote/workspace")
	pidFile := filepath.Join(t.TempDir(), "ssh-tunnel.pid")

	configureSSHStubEnv(t, repoRoot, sessionsRoot, session.ID)
	t.Setenv("SETTA_SSH_STUB_DISABLE_FORWARD", "1")
	t.Setenv("SETTA_SSH_STUB_PID_FILE", pidFile)

	service, err := NewService(ServiceOptions{
		RuntimeRoot: runtimeRoot,
		SSHBin:      stubPath,
	})
	if err != nil {
		t.Fatalf("new sshx service: %v", err)
	}

	localPort := 61000
	input := ConnectWorkspaceInput{
		SSHTarget:      "user@host",
		Workspace:      "/remote/workspace",
		LocalPort:      &localPort,
		LauncherOrigin: "http://launcher.example:7999",
	}

	firstResult, err := service.ConnectWorkspaceSession(input)
	if err != nil {
		t.Fatalf("connect remote workspace session: %v", err)
	}
	if !strings.HasPrefix(firstResult.BootstrapURLFragment, "http://127.0.0.1:61000/__setta__/bootstrap#token=") {
		t.Fatalf("unexpected bootstrap URL fragment %q", firstResult.BootstrapURLFragment)
	}
	if firstResult.Session.ID != session.ID {
		t.Fatalf("expected remote session id %q, got %q", session.ID, firstResult.Session.ID)
	}
	if firstResult.StartedNew {
		t.Fatal("expected existing remote session to be reused")
	}
	if firstResult.RemoteCommand != "setta" {
		t.Fatalf("expected resolved remote command \"setta\", got %q", firstResult.RemoteCommand)
	}
	if firstResult.SettaFilesLocation != "local" {
		t.Fatalf("expected remote settaFilesLocation local, got %q", firstResult.SettaFilesLocation)
	}
	if firstResult.RuntimeRoot != "/remote/runtime" {
		t.Fatalf("expected remote runtime root /remote/runtime, got %q", firstResult.RuntimeRoot)
	}
	if strings.TrimSpace(firstResult.LauncherOriginProof) == "" {
		t.Fatal("expected launcher origin proof to be returned")
	}

	firstPID := readPIDFile(t, pidFile)
	secondResult, err := service.ConnectWorkspaceSession(input)
	if err != nil {
		t.Fatalf("connect remote workspace session again: %v", err)
	}
	secondPID := readPIDFile(t, pidFile)
	if secondPID != firstPID {
		t.Fatalf("expected tunnel reuse to keep pid %d, got %d", firstPID, secondPID)
	}
	if secondResult.Session.ID != session.ID {
		t.Fatalf("expected reused remote session id %q, got %q", session.ID, secondResult.Session.ID)
	}

	if err := service.RollbackLocalSSHTunnel(RollbackTunnelInput{
		SSHTarget:  "user@host",
		RemoteHost: "127.0.0.1",
		RemotePort: 61234,
	}); err != nil {
		t.Fatalf("rollback local ssh tunnel: %v", err)
	}
	assertNoTunnelMetadata(t, runtimeRoot)
	waitForProcessExit(t, firstPID)
}

func TestServiceConnectWorkspaceSessionStartsRemoteSettaWhenNoSessionExists(t *testing.T) {
	repoRoot := testRepoRoot(t)
	stubPath := filepath.Join(repoRoot, "scripts", "test", "ssh")
	runtimeRoot := filepath.Join(t.TempDir(), "runtime")
	sessionsRoot := filepath.Join(t.TempDir(), "sessions")
	session := createSSHStubSession(t, sessionsRoot, "/remote/workspace")
	pidFile := filepath.Join(t.TempDir(), "ssh-tunnel.pid")
	startMarker := filepath.Join(t.TempDir(), "remote-started.txt")

	configureSSHStubEnv(t, repoRoot, sessionsRoot, session.ID)
	t.Setenv("SETTA_SSH_STUB_DISABLE_FORWARD", "1")
	t.Setenv("SETTA_SSH_STUB_PID_FILE", pidFile)
	t.Setenv("SETTA_SSH_STUB_START_MARKER_FILE", startMarker)
	t.Setenv("SETTA_SSH_STUB_NO_SESSIONS_BEFORE_START", "1")

	service, err := NewService(ServiceOptions{
		RuntimeRoot: runtimeRoot,
		SSHBin:      stubPath,
	})
	if err != nil {
		t.Fatalf("new sshx service: %v", err)
	}

	localPort := 61001
	result, err := service.ConnectWorkspaceSession(ConnectWorkspaceInput{
		SSHTarget: "user@host",
		Workspace: "/remote/workspace",
		LocalPort: &localPort,
		Timeout:   5 * time.Second,
	})
	if err != nil {
		t.Fatalf("connect remote workspace session after remote start: %v", err)
	}
	if !result.StartedNew {
		t.Fatal("expected remote session to be started when none existed initially")
	}
	if _, err := os.Stat(startMarker); err != nil {
		t.Fatalf("expected remote start marker to exist: %v", err)
	}
	if result.Session.ID != session.ID {
		t.Fatalf("expected started session id %q, got %q", session.ID, result.Session.ID)
	}

	if err := service.RollbackLocalSSHTunnel(RollbackTunnelInput{
		SSHTarget:  "user@host",
		RemoteHost: "127.0.0.1",
		RemotePort: 61234,
	}); err != nil {
		t.Fatalf("rollback local ssh tunnel: %v", err)
	}
	waitForProcessExit(t, readPIDFile(t, pidFile))
}

func TestServicePrepareConnectWorkspaceSessionLatestSelectsNewestSessionAfterStartWait(t *testing.T) {
	repoRoot := testRepoRoot(t)
	stubPath := filepath.Join(repoRoot, "scripts", "test", "ssh")
	sessionsRoot := filepath.Join(t.TempDir(), "sessions")
	commandLogPath := filepath.Join(t.TempDir(), "ssh-command.log")
	startMarker := filepath.Join(t.TempDir(), "remote-started.txt")
	older := createSSHStubSessionWithModeAt(
		t,
		sessionsRoot,
		"/remote/workspace",
		string(RemoteServerModeIDE),
		time.Date(2026, time.January, 1, 0, 0, 0, 0, time.UTC),
	)
	newer := createSSHStubSessionWithModeAt(
		t,
		sessionsRoot,
		"/remote/workspace",
		string(RemoteServerModeIDE),
		time.Date(2026, time.January, 2, 0, 0, 0, 0, time.UTC),
	)

	configureSSHStubEnv(t, repoRoot, sessionsRoot, "")
	t.Setenv("SETTA_SSH_STUB_COMMAND_LOG_FILE", commandLogPath)
	t.Setenv("SETTA_SSH_STUB_START_MARKER_FILE", startMarker)
	t.Setenv("SETTA_SSH_STUB_NO_SESSIONS_BEFORE_START", "1")

	service, err := NewService(ServiceOptions{
		RuntimeRoot: t.TempDir(),
		SSHBin:      stubPath,
	})
	if err != nil {
		t.Fatalf("new sshx service: %v", err)
	}

	result, err := service.PrepareConnectWorkspaceSession(PrepareConnectWorkspaceInput{
		SSHTarget: "user@host",
		Workspace: "/remote/workspace",
		Latest:    true,
		Timeout:   5 * time.Second,
	})
	if err != nil {
		t.Fatalf("prepare connect workspace session with latest selection: %v", err)
	}
	if !result.StartedNew {
		t.Fatal("expected prepare-connect to start remote Setta when no sessions were visible initially")
	}
	if result.InitialSessionCount != 0 {
		t.Fatalf("expected initial session count 0 after wait path, got %d", result.InitialSessionCount)
	}
	if _, err := os.Stat(startMarker); err != nil {
		t.Fatalf("expected remote start marker to exist: %v", err)
	}
	if result.Session.ID != newer.ID {
		t.Fatalf("expected newest session id %q after wait, got %q (older session was %q)", newer.ID, result.Session.ID, older.ID)
	}

	commandLog := readCommandLog(t, commandLogPath)
	if !strings.Contains(commandLog, "status --connect-info --json --workspace /remote/workspace --session "+newer.ID) {
		t.Fatalf("expected connect-info lookup for newest session %q, got %q", newer.ID, commandLog)
	}
}

func TestServiceRollbackRemoteWorkspaceLaunchDeletesRemoteSessionAndTunnel(t *testing.T) {
	repoRoot := testRepoRoot(t)
	stubPath := filepath.Join(repoRoot, "scripts", "test", "ssh")
	runtimeRoot := filepath.Join(t.TempDir(), "runtime")
	sessionsRoot := filepath.Join(t.TempDir(), "sessions")
	session := createSSHStubSession(t, sessionsRoot, "/remote/workspace")
	pidFile := filepath.Join(t.TempDir(), "ssh-tunnel.pid")

	configureSSHStubEnv(t, repoRoot, sessionsRoot, session.ID)
	t.Setenv("SETTA_SSH_STUB_DISABLE_FORWARD", "1")
	t.Setenv("SETTA_SSH_STUB_PID_FILE", pidFile)

	service, err := NewService(ServiceOptions{
		RuntimeRoot: runtimeRoot,
		SSHBin:      stubPath,
	})
	if err != nil {
		t.Fatalf("new sshx service: %v", err)
	}

	localPort := 61002
	result, err := service.ConnectWorkspaceSession(ConnectWorkspaceInput{
		SSHTarget: "user@host",
		Workspace: "/remote/workspace",
		LocalPort: &localPort,
	})
	if err != nil {
		t.Fatalf("connect remote workspace session: %v", err)
	}
	pid := readPIDFile(t, pidFile)
	sessionDir := filepath.Join(sessionsRoot, session.ID)
	if _, err := os.Stat(sessionDir); err != nil {
		t.Fatalf("expected session dir to exist before rollback: %v", err)
	}

	if err := service.RollbackRemoteWorkspaceLaunch(RollbackRemoteWorkspaceInput{
		SSHTarget:          "user@host",
		Workspace:          "/remote/workspace",
		SessionID:          result.Session.ID,
		RemoteCommand:      result.RemoteCommand,
		RemoteHost:         result.Session.Host,
		RemotePort:         result.Session.Port,
		SettaFilesLocation: "local",
	}); err != nil {
		t.Fatalf("rollback remote workspace launch: %v", err)
	}
	if _, err := os.Stat(sessionDir); !os.IsNotExist(err) {
		t.Fatalf("expected session dir %q to be removed, stat err=%v", sessionDir, err)
	}
	assertNoTunnelMetadata(t, runtimeRoot)
	waitForProcessExit(t, pid)
}

func TestServiceListRemoteWorkspaceSessionsForwardsProfileAndServerMode(t *testing.T) {
	repoRoot := testRepoRoot(t)
	stubPath := filepath.Join(repoRoot, "scripts", "test", "ssh")
	sessionsRoot := filepath.Join(t.TempDir(), "sessions")
	session := createSSHStubSessionWithMode(t, sessionsRoot, "/remote/workspace", string(RemoteServerModeLauncher))
	commandLogPath := filepath.Join(t.TempDir(), "ssh-command.log")

	configureSSHStubEnv(t, repoRoot, sessionsRoot, session.ID)
	t.Setenv("SETTA_SSH_STUB_COMMAND_LOG_FILE", commandLogPath)

	service, err := NewService(ServiceOptions{
		RuntimeRoot: t.TempDir(),
		SSHBin:      stubPath,
	})
	if err != nil {
		t.Fatalf("new sshx service: %v", err)
	}

	sessions, err := service.ListRemoteWorkspaceSessions(ListRemoteWorkspaceSessionsInput{
		SSHTarget:      "user@host",
		Workspace:      "/remote/workspace",
		Profile:        "missing",
		ServerMode:     RemoteServerModeLauncher,
		RemoteCommand:  "setta",
		SettaHome:      "",
		SettaFilesRoot: "",
	})
	if err != nil {
		t.Fatalf("list remote workspace sessions: %v", err)
	}
	if len(sessions) != 1 {
		t.Fatalf("expected one remote session, got %#v", sessions)
	}
	commandLog := readCommandLog(t, commandLogPath)
	if !strings.Contains(commandLog, "--profile missing status --list-sessions --json --workspace /remote/workspace --server-mode launcher") {
		t.Fatalf("expected profile and server-mode forwarding in command log, got %q", commandLog)
	}
}

func TestServiceDeleteRemoteWorkspaceSessionDeletesSession(t *testing.T) {
	repoRoot := testRepoRoot(t)
	stubPath := filepath.Join(repoRoot, "scripts", "test", "ssh")
	sessionsRoot := filepath.Join(t.TempDir(), "sessions")
	session := createSSHStubSession(t, sessionsRoot, "/remote/workspace")
	commandLogPath := filepath.Join(t.TempDir(), "ssh-command.log")

	configureSSHStubEnv(t, repoRoot, sessionsRoot, session.ID)
	t.Setenv("SETTA_SSH_STUB_COMMAND_LOG_FILE", commandLogPath)

	service, err := NewService(ServiceOptions{
		RuntimeRoot: t.TempDir(),
		SSHBin:      stubPath,
	})
	if err != nil {
		t.Fatalf("new sshx service: %v", err)
	}

	if err := service.DeleteRemoteWorkspaceSession(DeleteRemoteWorkspaceSessionInput{
		SSHTarget:     "user@host",
		Workspace:     "/remote/workspace",
		SessionID:     session.ID,
		RemoteCommand: "setta",
		SSHArgs:       "-i ~/.ssh/id_ed25519",
		Profile:       "dev",
	}); err != nil {
		t.Fatalf("delete remote workspace session: %v", err)
	}

	sessionDir := filepath.Join(sessionsRoot, session.ID)
	if _, err := os.Stat(sessionDir); !os.IsNotExist(err) {
		t.Fatalf("expected session dir %q to be removed, stat err=%v", sessionDir, err)
	}
	commandLog := readCommandLog(t, commandLogPath)
	if !strings.Contains(commandLog, "--profile dev status --delete-session "+session.ID) {
		t.Fatalf("expected delete command in command log, got %q", commandLog)
	}
}

func TestServiceDeleteRemoteWorkspaceSessionReturnsRemoteRollbackOnFailure(t *testing.T) {
	repoRoot := testRepoRoot(t)
	stubPath := writeSSHDeleteSessionFailingWrapper(t, filepath.Join(repoRoot, "scripts", "test", "ssh"))
	sessionsRoot := filepath.Join(t.TempDir(), "sessions")
	session := createSSHStubSession(t, sessionsRoot, "/remote/workspace")

	configureSSHStubEnv(t, repoRoot, sessionsRoot, session.ID)

	service, err := NewService(ServiceOptions{
		RuntimeRoot: t.TempDir(),
		SSHBin:      stubPath,
	})
	if err != nil {
		t.Fatalf("new sshx service: %v", err)
	}

	err = service.DeleteRemoteWorkspaceSession(DeleteRemoteWorkspaceSessionInput{
		SSHTarget:     "user@host",
		Workspace:     "/remote/workspace",
		SessionID:     session.ID,
		RemoteCommand: "setta",
	})
	requireSSHErrorCode(t, err, "RemoteRollback")
	if !strings.Contains(err.Error(), session.ID) {
		t.Fatalf("expected session id in rollback failure, got %q", err.Error())
	}
	if !strings.Contains(err.Error(), "permission denied") {
		t.Fatalf("expected delete failure detail, got %q", err.Error())
	}
}

func TestServicePrepareConnectWorkspaceSessionDoesNotCreateTunnelMetadata(t *testing.T) {
	repoRoot := testRepoRoot(t)
	stubPath := filepath.Join(repoRoot, "scripts", "test", "ssh")
	runtimeRoot := filepath.Join(t.TempDir(), "runtime")
	sessionsRoot := filepath.Join(t.TempDir(), "sessions")
	session := createSSHStubSession(t, sessionsRoot, "/remote/workspace")

	configureSSHStubEnv(t, repoRoot, sessionsRoot, session.ID)

	service, err := NewService(ServiceOptions{
		RuntimeRoot: runtimeRoot,
		SSHBin:      stubPath,
	})
	if err != nil {
		t.Fatalf("new sshx service: %v", err)
	}

	result, err := service.PrepareConnectWorkspaceSession(PrepareConnectWorkspaceInput{
		SSHTarget: "user@host",
		Workspace: "/remote/workspace",
		SessionID: session.ID,
	})
	if err != nil {
		t.Fatalf("prepare connect workspace session: %v", err)
	}
	if result.Session.ID != session.ID {
		t.Fatalf("expected session id %q, got %q", session.ID, result.Session.ID)
	}
	if strings.TrimSpace(result.Token) == "" {
		t.Fatal("expected bootstrap token")
	}
	assertNoTunnelMetadata(t, runtimeRoot)
}

func TestServicePrepareConnectWorkspaceSessionPreservesOmittedSettaFilesLocationForProfile(t *testing.T) {
	repoRoot := testRepoRoot(t)
	stubPath := filepath.Join(repoRoot, "scripts", "test", "ssh")
	sessionsRoot := filepath.Join(t.TempDir(), "sessions")
	session := createSSHStubSession(t, sessionsRoot, "/remote/workspace")
	commandLogPath := filepath.Join(t.TempDir(), "ssh-command.log")

	configureSSHStubEnv(t, repoRoot, sessionsRoot, session.ID)
	t.Setenv("SETTA_SSH_STUB_COMMAND_LOG_FILE", commandLogPath)

	service, err := NewService(ServiceOptions{
		RuntimeRoot: t.TempDir(),
		SSHBin:      stubPath,
	})
	if err != nil {
		t.Fatalf("new sshx service: %v", err)
	}

	_, err = service.PrepareConnectWorkspaceSession(PrepareConnectWorkspaceInput{
		SSHTarget: "user@host",
		Workspace: "/remote/workspace",
		SessionID: session.ID,
		Profile:   "dev",
	})
	if err != nil {
		t.Fatalf("prepare connect workspace session with profile: %v", err)
	}

	commandLog := readCommandLog(t, commandLogPath)
	if !strings.Contains(commandLog, "--profile dev status --list-sessions --json --workspace /remote/workspace --server-mode ide") {
		t.Fatalf("expected profile forwarding in list command, got %q", commandLog)
	}
	if !strings.Contains(commandLog, "--profile dev status --connect-info --json --workspace /remote/workspace --session "+session.ID) {
		t.Fatalf("expected profile forwarding in connect-info command, got %q", commandLog)
	}
	if strings.Contains(commandLog, "--setta-files-location auto") {
		t.Fatalf("did not expect auto setta-files location with explicit profile, got %q", commandLog)
	}
}

func TestServicePrepareConnectWorkspaceSessionDefaultsToAutoWithoutProfileAndRequestsIDEServerMode(t *testing.T) {
	repoRoot := testRepoRoot(t)
	stubPath := filepath.Join(repoRoot, "scripts", "test", "ssh")
	sessionsRoot := filepath.Join(t.TempDir(), "sessions")
	session := createSSHStubSession(t, sessionsRoot, "/remote/workspace")
	commandLogPath := filepath.Join(t.TempDir(), "ssh-command.log")

	configureSSHStubEnv(t, repoRoot, sessionsRoot, session.ID)
	t.Setenv("SETTA_SSH_STUB_COMMAND_LOG_FILE", commandLogPath)

	service, err := NewService(ServiceOptions{
		RuntimeRoot: t.TempDir(),
		SSHBin:      stubPath,
	})
	if err != nil {
		t.Fatalf("new sshx service: %v", err)
	}

	_, err = service.PrepareConnectWorkspaceSession(PrepareConnectWorkspaceInput{
		SSHTarget: "user@host",
		Workspace: "/remote/workspace",
		SessionID: session.ID,
	})
	if err != nil {
		t.Fatalf("prepare connect workspace session: %v", err)
	}

	commandLog := readCommandLog(t, commandLogPath)
	if !strings.Contains(commandLog, "setta --setta-files-location auto status --list-sessions --json --workspace /remote/workspace --server-mode ide") {
		t.Fatalf("expected auto location and ide server-mode in list command, got %q", commandLog)
	}
	if !strings.Contains(commandLog, "setta --setta-files-location auto status --connect-info --json --workspace /remote/workspace --session "+session.ID) {
		t.Fatalf("expected auto location in connect-info command, got %q", commandLog)
	}
}

func TestServicePrepareConnectWorkspaceSessionTreatsWhitespaceProfileAsOmitted(t *testing.T) {
	repoRoot := testRepoRoot(t)
	stubPath := filepath.Join(repoRoot, "scripts", "test", "ssh")
	sessionsRoot := filepath.Join(t.TempDir(), "sessions")
	session := createSSHStubSession(t, sessionsRoot, "/remote/workspace")
	commandLogPath := filepath.Join(t.TempDir(), "ssh-command.log")

	configureSSHStubEnv(t, repoRoot, sessionsRoot, session.ID)
	t.Setenv("SETTA_SSH_STUB_COMMAND_LOG_FILE", commandLogPath)

	service, err := NewService(ServiceOptions{
		RuntimeRoot: t.TempDir(),
		SSHBin:      stubPath,
	})
	if err != nil {
		t.Fatalf("new sshx service: %v", err)
	}

	_, err = service.PrepareConnectWorkspaceSession(PrepareConnectWorkspaceInput{
		SSHTarget: "user@host",
		Workspace: "/remote/workspace",
		SessionID: session.ID,
		Profile:   "   ",
	})
	if err != nil {
		t.Fatalf("prepare connect workspace session with whitespace profile: %v", err)
	}

	commandLog := readCommandLog(t, commandLogPath)
	if strings.Contains(commandLog, "--profile") {
		t.Fatalf("did not expect blank profile to be forwarded, got %q", commandLog)
	}
	if !strings.Contains(commandLog, "setta --setta-files-location auto status --list-sessions --json --workspace /remote/workspace --server-mode ide") {
		t.Fatalf("expected whitespace profile to fall back to auto/ide list command, got %q", commandLog)
	}
}

func TestServicePrepareConnectWorkspaceSessionRejectsMultipleSessionsWithoutSelector(t *testing.T) {
	repoRoot := testRepoRoot(t)
	stubPath := filepath.Join(repoRoot, "scripts", "test", "ssh")
	sessionsRoot := filepath.Join(t.TempDir(), "sessions")
	createSSHStubSession(t, sessionsRoot, "/remote/workspace")
	createSSHStubSession(t, sessionsRoot, "/remote/workspace")

	configureSSHStubEnv(t, repoRoot, sessionsRoot, "")

	service, err := NewService(ServiceOptions{
		RuntimeRoot: t.TempDir(),
		SSHBin:      stubPath,
	})
	if err != nil {
		t.Fatalf("new sshx service: %v", err)
	}

	_, err = service.PrepareConnectWorkspaceSession(PrepareConnectWorkspaceInput{
		SSHTarget: "user@host",
		Workspace: "/remote/workspace",
	})
	requireSSHErrorCode(t, err, "RemoteConnectSelection")
	if err.Error() != "Use --session or --latest for remote connect." {
		t.Fatalf("unexpected error %q", err.Error())
	}
}

func TestBuildRemoteSettaPathArgsRejectsConflictingSettaFilesInputs(t *testing.T) {
	_, err := buildRemoteSettaPathArgs("", "", "/tmp/state", "local", "")
	requireSSHErrorCode(t, err, "InvalidSettaFilesConfig")
}

func TestServiceResolveRemoteWorkspaceRejectsInvalidTildePrefix(t *testing.T) {
	service, err := NewService(ServiceOptions{RuntimeRoot: t.TempDir()})
	if err != nil {
		t.Fatalf("new sshx service: %v", err)
	}

	_, err = service.resolveRemoteWorkspace("user@host", nil, "bash", "~bad!user/project", SSHCommandPrefix(true, "ssh"))
	requireSSHErrorCode(t, err, "RemoteWorkspace")
	if !strings.Contains(err.Error(), "Unsupported tilde prefix") {
		t.Fatalf("expected unsupported tilde prefix error, got %q", err.Error())
	}
}

func TestServiceListRemoteWorkspaceSessionsIgnoresWhitespaceRemoteCommand(t *testing.T) {
	repoRoot := testRepoRoot(t)
	stubPath := filepath.Join(repoRoot, "scripts", "test", "ssh")
	sessionsRoot := filepath.Join(t.TempDir(), "sessions")
	session := createSSHStubSession(t, sessionsRoot, "/remote/workspace")
	commandLogPath := filepath.Join(t.TempDir(), "ssh-command.log")
	configureSSHStubEnv(t, repoRoot, sessionsRoot, "")
	t.Setenv("SETTA_SSH_STUB_COMMAND_LOG_FILE", commandLogPath)

	service, err := NewService(ServiceOptions{
		RuntimeRoot: t.TempDir(),
		SSHBin:      stubPath,
	})
	if err != nil {
		t.Fatalf("new sshx service: %v", err)
	}

	sessions, err := service.ListRemoteWorkspaceSessions(ListRemoteWorkspaceSessionsInput{
		SSHTarget:      "user@host",
		Workspace:      "/remote/workspace",
		RemoteCommand:  "   ",
		ServerMode:     RemoteServerModeIDE,
		SettaHome:      "",
		SettaFilesRoot: "",
	})
	if err != nil {
		t.Fatalf("list remote workspace sessions: %v", err)
	}
	if len(sessions) != 1 || sessions[0].ID != session.ID {
		t.Fatalf("expected stub session %#v, got %#v", session, sessions)
	}
	commandLog := readCommandLog(t, commandLogPath)
	if !strings.Contains(commandLog, "setta --setta-files-location auto status --list-sessions --json --workspace /remote/workspace --server-mode ide") {
		t.Fatalf("expected resolved default remote command in command log, got %q", commandLog)
	}
}

func TestServiceStartRemoteSettaUsesUniqueNohupLogFile(t *testing.T) {
	repoRoot := testRepoRoot(t)
	stubPath := filepath.Join(repoRoot, "scripts", "test", "ssh")
	sessionsRoot := filepath.Join(t.TempDir(), "sessions")
	commandLogPath := filepath.Join(t.TempDir(), "ssh-command.log")
	configureSSHStubEnv(t, repoRoot, sessionsRoot, "")
	t.Setenv("SETTA_SSH_STUB_COMMAND_LOG_FILE", commandLogPath)

	service, err := NewService(ServiceOptions{
		RuntimeRoot: t.TempDir(),
		SSHBin:      stubPath,
	})
	if err != nil {
		t.Fatalf("new sshx service: %v", err)
	}

	if err := service.startRemoteSetta(
		"user@host",
		nil,
		"bash",
		"/remote/workspace",
		"setta",
		"",
		SSHCommandPrefix(true, stubPath),
		"local",
		"",
		"",
	); err != nil {
		t.Fatalf("start remote setta: %v", err)
	}

	commandLog := readCommandLog(t, commandLogPath)
	if !strings.Contains(commandLog, "/nohup-") {
		t.Fatalf("expected unique nohup log path, got %q", commandLog)
	}
	if strings.Contains(commandLog, "/nohup.out") {
		t.Fatalf("did not expect default nohup.out path, got %q", commandLog)
	}
	if !strings.Contains(commandLog, "/remote/workspace/setta_files/runtime/logs/nohup-") {
		t.Fatalf("expected workspace-local logs dir in command log, got %q", commandLog)
	}
	if !strings.Contains(commandLog, ".out") {
		t.Fatalf("expected nohup log file suffix in command log, got %q", commandLog)
	}
}

func TestServiceStartRemoteSettaThreadsGlobalSettaFilesLocationIntoRemoteLogsDir(t *testing.T) {
	repoRoot := testRepoRoot(t)
	stubPath := filepath.Join(repoRoot, "scripts", "test", "ssh")
	commandLogPath := filepath.Join(t.TempDir(), "ssh-command.log")
	sessionsRoot := filepath.Join(t.TempDir(), "sessions")
	configureSSHStubEnv(t, repoRoot, sessionsRoot, "")
	t.Setenv("SETTA_SSH_STUB_COMMAND_LOG_FILE", commandLogPath)

	service, err := NewService(ServiceOptions{
		RuntimeRoot: t.TempDir(),
		SSHBin:      stubPath,
	})
	if err != nil {
		t.Fatalf("new sshx service: %v", err)
	}

	if err := service.startRemoteSetta(
		"user@host",
		nil,
		"bash",
		"/remote/workspace",
		"setta",
		"",
		SSHCommandPrefix(true, stubPath),
		"global",
		"",
		"",
	); err != nil {
		t.Fatalf("start remote setta with global state: %v", err)
	}

	commandLog := readCommandLog(t, commandLogPath)
	if !strings.Contains(commandLog, "mkdir -p /tmp &&") {
		t.Fatalf("expected global logs dir creation under /tmp, got %q", commandLog)
	}
	if !strings.Contains(commandLog, "> /tmp/nohup-") {
		t.Fatalf("expected nohup log file under /tmp for global state, got %q", commandLog)
	}
}

func TestServiceWaitForRemoteSessionsTimeoutIncludesResolvedRemoteLogsDir(t *testing.T) {
	repoRoot := testRepoRoot(t)
	stubPath := filepath.Join(repoRoot, "scripts", "test", "ssh")
	sessionsRoot := filepath.Join(t.TempDir(), "sessions")
	if err := os.MkdirAll(sessionsRoot, 0o755); err != nil {
		t.Fatalf("create empty sessions root: %v", err)
	}
	configureSSHStubEnv(t, repoRoot, sessionsRoot, "")
	currentTime := time.Date(2026, time.January, 2, 0, 0, 0, 0, time.UTC)

	service, err := NewService(ServiceOptions{
		RuntimeRoot: t.TempDir(),
		SSHBin:      stubPath,
		Now: func() time.Time {
			return currentTime
		},
		Sleep: func(duration time.Duration) {
			currentTime = currentTime.Add(duration)
		},
	})
	if err != nil {
		t.Fatalf("new sshx service: %v", err)
	}

	_, err = service.waitForRemoteSessions(
		"user@host",
		nil,
		"bash",
		"/remote/workspace",
		"setta",
		"",
		SSHCommandPrefix(true, stubPath),
		time.Second,
		"global",
		"",
		"",
		RemoteServerModeIDE,
	)
	requireSSHErrorCode(t, err, "RemoteLaunchTimeout")
	if err.Error() != "Timed out waiting for remote Setta session to start. Check logs under: /tmp" {
		t.Fatalf("unexpected timeout error %q", err.Error())
	}
}

func TestServiceStartRemoteSettaPropagatesSshMissing(t *testing.T) {
	service, err := NewService(ServiceOptions{
		RuntimeRoot: t.TempDir(),
		SSHBin:      "ssh-does-not-exist",
	})
	if err != nil {
		t.Fatalf("new sshx service: %v", err)
	}

	err = service.startRemoteSetta(
		"user@host",
		nil,
		"bash",
		"/tmp/work",
		"setta",
		"",
		SSHCommandPrefix(true, "ssh-does-not-exist"),
		"local",
		"",
		"",
	)
	requireSSHErrorCode(t, err, "SshMissing")
}

func TestServiceRunSSHCommandReportsMissingBinary(t *testing.T) {
	service, err := NewService(ServiceOptions{
		RuntimeRoot: t.TempDir(),
		SSHBin:      "ssh-does-not-exist",
	})
	if err != nil {
		t.Fatalf("new sshx service: %v", err)
	}

	_, err = service.runSSHCommand(
		"user@host",
		nil,
		"echo hi",
		SSHCommandPrefix(true, "ssh-does-not-exist"),
		100*time.Millisecond,
	)
	requireSSHErrorCode(t, err, "SshMissing")
}

func TestServiceRunSSHCommandTimesOut(t *testing.T) {
	wrapperPath := writeSSHSleepWrapper(t, 250*time.Millisecond)
	service, err := NewService(ServiceOptions{
		RuntimeRoot: t.TempDir(),
		SSHBin:      wrapperPath,
	})
	if err != nil {
		t.Fatalf("new sshx service: %v", err)
	}

	_, err = service.runSSHCommand(
		"user@host",
		nil,
		"echo hi",
		SSHCommandPrefix(true, wrapperPath),
		25*time.Millisecond,
	)
	requireSSHErrorCode(t, err, "SshTimeout")
}

func TestExtractTokenFromBootstrapURLIgnoresExtraFragmentParams(t *testing.T) {
	t.Parallel()

	token, err := extractTokenFromBootstrapURL(
		"http://127.0.0.1:8000/__setta__/bootstrap#token=abc123&wh=payload&lo=http%3A%2F%2Fexample.com",
	)
	if err != nil {
		t.Fatalf("extract bootstrap token: %v", err)
	}
	if token != "abc123" {
		t.Fatalf("expected token abc123, got %q", token)
	}
}

func createSSHStubSession(t *testing.T, sessionsRoot string, workspaceRoot string) auth.SessionMetadata {
	t.Helper()
	return createSSHStubSessionWithMode(t, sessionsRoot, workspaceRoot, string(RemoteServerModeIDE))
}

func createSSHStubSessionWithMode(t *testing.T, sessionsRoot string, workspaceRoot string, serverMode string) auth.SessionMetadata {
	t.Helper()
	return createSSHStubSessionWithModeAt(t, sessionsRoot, workspaceRoot, serverMode, time.Now().UTC())
}

func createSSHStubSessionWithModeAt(t *testing.T, sessionsRoot string, workspaceRoot string, serverMode string, startedAt time.Time) auth.SessionMetadata {
	t.Helper()

	registry, err := localsessions.NewRegistry(localsessions.RegistryOptions{
		SessionsRoot: sessionsRoot,
		Now: func() time.Time {
			return startedAt
		},
	})
	if err != nil {
		t.Fatalf("new session registry: %v", err)
	}
	session, err := registry.CreateSession(localsessions.CreateSessionInput{
		WorkspaceRoot:      workspaceRoot,
		Host:               "127.0.0.1",
		Port:               61234,
		PID:                os.Getpid(),
		SettaFilesLocation: "local",
		RuntimeRoot:        "/remote/runtime",
		ServerMode:         serverMode,
	})
	if err != nil {
		t.Fatalf("create ssh stub session: %v", err)
	}
	return session
}

func configureSSHStubEnv(t *testing.T, repoRoot string, sessionsRoot string, sessionID string) {
	t.Helper()

	backendPath := filepath.Join(repoRoot, "backend")
	existingPythonPath := strings.TrimSpace(os.Getenv("PYTHONPATH"))
	if existingPythonPath == "" {
		t.Setenv("PYTHONPATH", backendPath)
	} else {
		t.Setenv("PYTHONPATH", backendPath+string(os.PathListSeparator)+existingPythonPath)
	}
	t.Setenv("SETTA_SESSIONS_ROOT", sessionsRoot)
	t.Setenv("SETTA_SESSION_ID", sessionID)
	t.Setenv("SETTA_RUNTIME_ROOT", "/remote/runtime")
	t.Setenv("SETTA_FILES_LOCATION", "local")
}

func testRepoRoot(t *testing.T) string {
	t.Helper()

	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("resolve caller path")
	}
	return filepath.Clean(filepath.Join(filepath.Dir(file), "..", ".."))
}

func readPIDFile(t *testing.T, path string) int {
	t.Helper()

	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read pid file %q: %v", path, err)
	}
	pidText := strings.TrimSpace(string(content))
	if pidText == "" {
		t.Fatalf("pid file %q was empty", path)
	}
	pid := 0
	if _, err := fmt.Sscanf(pidText, "%d", &pid); err != nil {
		t.Fatalf("parse pid file %q: %v", path, err)
	}
	if pid <= 0 {
		t.Fatalf("expected positive pid in %q, got %d", path, pid)
	}
	return pid
}

func readCommandLog(t *testing.T, path string) string {
	t.Helper()

	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read command log %q: %v", path, err)
	}
	return string(content)
}

func waitForProcessExit(t *testing.T, pid int) {
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

func assertNoTunnelMetadata(t *testing.T, runtimeRoot string) {
	t.Helper()

	metadataFiles, err := filepath.Glob(filepath.Join(runtimeRoot, "ssh_tunnels", "*.json"))
	if err != nil {
		t.Fatalf("glob tunnel metadata: %v", err)
	}
	if len(metadataFiles) != 0 {
		t.Fatalf("expected tunnel metadata to be removed, got %#v", metadataFiles)
	}
}

func writeSSHSleepWrapper(t *testing.T, sleepDuration time.Duration) string {
	t.Helper()

	wrapperPath := filepath.Join(t.TempDir(), "ssh-sleep-wrapper.sh")
	script := fmt.Sprintf("#!/bin/sh\nsleep %.3f\n", sleepDuration.Seconds())
	if err := os.WriteFile(wrapperPath, []byte(script), 0o755); err != nil {
		t.Fatalf("write ssh sleep wrapper: %v", err)
	}
	return wrapperPath
}

func writeSSHDeleteSessionFailingWrapper(t *testing.T, stubPath string) string {
	t.Helper()

	wrapperPath := filepath.Join(t.TempDir(), "ssh-delete-session-fail.sh")
	script := "#!/bin/sh\n" +
		"case \"$*\" in\n" +
		"  *\"status --delete-session\"*)\n" +
		"    printf '%s\\n' 'permission denied' >&2\n" +
		"    exit 1\n" +
		"    ;;\n" +
		"esac\n" +
		"exec " + shellQuote(stubPath) + " \"$@\"\n"
	if err := os.WriteFile(wrapperPath, []byte(script), 0o755); err != nil {
		t.Fatalf("write ssh delete-session failing wrapper: %v", err)
	}
	return wrapperPath
}
