package workspacelaunch

import (
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"setta/internal/auth"
	"setta/internal/config"
	"setta/internal/frontendorigins"
	"setta/internal/launcher"
	"setta/internal/sshx"
)

type stubLocalLaunchSessions struct {
	captured []launcher.IDELaunchInput
	result   launcher.IDELaunchResult
	err      error
}

func (s *stubLocalLaunchSessions) EnsureSession(input launcher.IDELaunchInput) (launcher.IDELaunchResult, error) {
	s.captured = append(s.captured, input)
	if s.err != nil {
		return launcher.IDELaunchResult{}, s.err
	}
	return s.result, nil
}

type stubRemoteLaunchRuntime struct {
	connectInputs  []sshx.ConnectWorkspaceInput
	connectResult  sshx.RemoteConnectResult
	connectErr     error
	rollbackInputs []sshx.RollbackRemoteWorkspaceInput
	rollbackErr    error
}

func (s *stubRemoteLaunchRuntime) ConnectWorkspaceSession(input sshx.ConnectWorkspaceInput) (sshx.RemoteConnectResult, error) {
	s.connectInputs = append(s.connectInputs, input)
	if s.connectErr != nil {
		return sshx.RemoteConnectResult{}, s.connectErr
	}
	return s.connectResult, nil
}

func (s *stubRemoteLaunchRuntime) RollbackRemoteWorkspaceLaunch(input sshx.RollbackRemoteWorkspaceInput) error {
	s.rollbackInputs = append(s.rollbackInputs, input)
	return s.rollbackErr
}

func TestLocalLaunchServiceLaunchesLocalWorkspaceAndTrustsLaunchedOrigin(t *testing.T) {
	t.Parallel()

	fixture := newLocalLaunchFixture(t)
	intent := fixture.createIntent(t, decodeLaunchRequest(t, `{"workspaceRoot":"/tmp/workspace"}`), "http://launcher.example:7999/home")

	result, err := fixture.service.Launch(LocalLaunchInput{
		Request:        decodeLaunchRequest(t, `{"launchIntentToken":"`+intent+`"}`),
		RequestOrigin:  "http://launcher.example:7999",
		CurrentSession: fixture.currentSession,
	})
	if err != nil {
		t.Fatalf("launch workspace: %v", err)
	}

	if len(fixture.sessions.captured) != 1 {
		t.Fatalf("expected one session launch call, got %d", len(fixture.sessions.captured))
	}
	if fixture.sessions.captured[0].SettaHome != fixture.defaultSettaHome {
		t.Fatalf("expected default setta home %q, got %q", fixture.defaultSettaHome, fixture.sessions.captured[0].SettaHome)
	}
	if fixture.sessions.captured[0].SettaFilesLocation == nil || *fixture.sessions.captured[0].SettaFilesLocation != "auto" {
		t.Fatalf("expected auto setta files location, got %#v", fixture.sessions.captured[0].SettaFilesLocation)
	}
	if result.ReturnURL != "http://launcher.example:7999/home" {
		t.Fatalf("expected stored return URL, got %q", result.ReturnURL)
	}
	if result.WorkspaceRoot != fixture.sessions.result.Paths.WorkspaceRoot {
		t.Fatalf("expected workspace root %q, got %q", fixture.sessions.result.Paths.WorkspaceRoot, result.WorkspaceRoot)
	}
	if result.SettaFilesLocation != "local" {
		t.Fatalf("expected local setta files location, got %q", result.SettaFilesLocation)
	}

	parsedURL, err := url.Parse(result.BootstrapURLFragment)
	if err != nil {
		t.Fatalf("parse bootstrap URL fragment: %v", err)
	}
	hashParams, err := url.ParseQuery(strings.TrimPrefix(parsedURL.Fragment, "#"))
	if err != nil {
		t.Fatalf("parse bootstrap URL hash: %v", err)
	}
	if hashParams.Get("token") != "tok" {
		t.Fatalf("expected bootstrap token hash param, got %q", hashParams.Get("token"))
	}
	if hashParams.Get("lo") != "http://launcher.example:7999" {
		t.Fatalf("expected launcher origin handoff, got %q", hashParams.Get("lo"))
	}
	if strings.TrimSpace(hashParams.Get("lop")) == "" {
		t.Fatalf("expected launcher origin proof, got %q", hashParams.Get("lop"))
	}
	if !fixture.trustedOrigins.IsTrustedOrigin("http://127.0.0.1:61234", fixture.currentSession.Metadata.ID) {
		t.Fatal("expected launched workspace origin to be trusted for launcher session")
	}
}

func TestLocalLaunchServiceLaunchesRemoteWorkspaceAndTrustsLaunchedOrigin(t *testing.T) {
	t.Parallel()

	fixture := newLocalLaunchFixture(t)
	fixture.ssh.connectResult = remoteLaunchConnectResult()
	intent := fixture.createIntent(t, decodeLaunchRequest(t, `{"workspaceRoot":"/tmp/workspace","sshTarget":"user@host","sshArgs":"-p 2222","localPort":61000}`), "http://launcher.example:7999/home")

	result, err := fixture.service.Launch(LocalLaunchInput{
		Request:        decodeLaunchRequest(t, `{"launchIntentToken":"`+intent+`"}`),
		RequestOrigin:  "http://launcher.example:7999",
		CurrentSession: fixture.currentSession,
	})
	if err != nil {
		t.Fatalf("launch remote workspace: %v", err)
	}
	if len(fixture.sessions.captured) != 0 {
		t.Fatalf("expected no local session launch call, got %d", len(fixture.sessions.captured))
	}
	if len(fixture.ssh.connectInputs) != 1 {
		t.Fatalf("expected one remote connect call, got %d", len(fixture.ssh.connectInputs))
	}
	if fixture.ssh.connectInputs[0].SSHTarget != "user@host" {
		t.Fatalf("expected ssh target user@host, got %#v", fixture.ssh.connectInputs[0])
	}
	if fixture.ssh.connectInputs[0].SSHArgs != "-p 2222" {
		t.Fatalf("expected ssh args -p 2222, got %#v", fixture.ssh.connectInputs[0])
	}
	if fixture.ssh.connectInputs[0].LocalPort == nil || *fixture.ssh.connectInputs[0].LocalPort != 61000 {
		t.Fatalf("expected local port 61000, got %#v", fixture.ssh.connectInputs[0].LocalPort)
	}
	if result.RemoteCmdResolved == nil || *result.RemoteCmdResolved != "setta" {
		t.Fatalf("expected resolved remote command, got %#v", result.RemoteCmdResolved)
	}
	if result.WorkspaceRoot != "/remote/workspace" {
		t.Fatalf("expected remote canonical workspace root, got %q", result.WorkspaceRoot)
	}
	if result.SettaFilesLocation != "global" {
		t.Fatalf("expected global setta files location, got %q", result.SettaFilesLocation)
	}
	parsedURL, err := url.Parse(result.BootstrapURLFragment)
	if err != nil {
		t.Fatalf("parse bootstrap URL fragment: %v", err)
	}
	hashParams, err := url.ParseQuery(strings.TrimPrefix(parsedURL.Fragment, "#"))
	if err != nil {
		t.Fatalf("parse bootstrap URL hash: %v", err)
	}
	if hashParams.Get("lo") != "http://launcher.example:7999" {
		t.Fatalf("expected launcher origin handoff, got %q", hashParams.Get("lo"))
	}
	if hashParams.Get("lop") != "proof" {
		t.Fatalf("expected launcher origin proof, got %q", hashParams.Get("lop"))
	}
	if !fixture.trustedOrigins.IsTrustedOrigin("http://127.0.0.1:61000", fixture.currentSession.Metadata.ID) {
		t.Fatal("expected launched remote workspace origin to be trusted for launcher session")
	}
}

func TestLocalLaunchServiceRequiresRemoteLauncherOriginProof(t *testing.T) {
	t.Parallel()

	fixture := newLocalLaunchFixture(t)
	remoteResult := remoteLaunchConnectResult()
	remoteResult.LauncherOriginProof = ""
	fixture.ssh.connectResult = remoteResult
	intent := fixture.createIntent(t, decodeLaunchRequest(t, `{"workspaceRoot":"/tmp/workspace","sshTarget":"user@host"}`), "http://launcher.example:7999/home")

	_, err := fixture.service.Launch(LocalLaunchInput{
		Request:        decodeLaunchRequest(t, `{"launchIntentToken":"`+intent+`"}`),
		RequestOrigin:  "http://launcher.example:7999",
		CurrentSession: fixture.currentSession,
	})
	if err == nil {
		t.Fatal("expected missing launcher origin proof to fail")
	}
	launchErr, ok := err.(*LaunchError)
	if !ok {
		t.Fatalf("expected launch error, got %T", err)
	}
	if launchErr.Code != "RemoteConnectInfo" {
		t.Fatalf("expected RemoteConnectInfo, got %#v", launchErr)
	}
	if len(fixture.ssh.rollbackInputs) != 0 {
		t.Fatalf("expected no rollback for missing proof, got %#v", fixture.ssh.rollbackInputs)
	}
}

func TestLocalLaunchServiceUsesDefaultProfileLookupHomeForProfileLaunches(t *testing.T) {
	t.Parallel()

	fixture := newLocalLaunchFixture(t)
	intent := fixture.createIntent(t, decodeLaunchRequest(t, `{"workspaceRoot":"/tmp/workspace","profile":"dev"}`), "http://launcher.example:7999/home")

	_, err := fixture.service.Launch(LocalLaunchInput{
		Request:        decodeLaunchRequest(t, `{"launchIntentToken":"`+intent+`"}`),
		RequestOrigin:  "http://launcher.example:7999",
		CurrentSession: fixture.currentSession,
	})
	if err != nil {
		t.Fatalf("launch workspace: %v", err)
	}

	if len(fixture.sessions.captured) != 1 {
		t.Fatalf("expected one session launch call, got %d", len(fixture.sessions.captured))
	}
	if fixture.sessions.captured[0].ProfileLookupHome != fixture.defaultProfileLookupHome {
		t.Fatalf("expected default profile lookup home %q, got %q", fixture.defaultProfileLookupHome, fixture.sessions.captured[0].ProfileLookupHome)
	}
}

func TestLocalLaunchServiceProfileLaunchOmitsSettaFilesLocationWhenUnset(t *testing.T) {
	t.Parallel()

	fixture := newLocalLaunchFixture(t)
	intent := fixture.createIntent(t, decodeLaunchRequest(t, `{"workspaceRoot":"/tmp/workspace","profile":"dev"}`), "http://launcher.example:7999/home")

	_, err := fixture.service.Launch(LocalLaunchInput{
		Request:        decodeLaunchRequest(t, `{"launchIntentToken":"`+intent+`"}`),
		RequestOrigin:  "http://launcher.example:7999",
		CurrentSession: fixture.currentSession,
	})
	if err != nil {
		t.Fatalf("launch workspace: %v", err)
	}

	if len(fixture.sessions.captured) != 1 {
		t.Fatalf("expected one session launch call, got %d", len(fixture.sessions.captured))
	}
	if fixture.sessions.captured[0].SettaHome != fixture.defaultSettaHome {
		t.Fatalf("expected default setta home %q, got %q", fixture.defaultSettaHome, fixture.sessions.captured[0].SettaHome)
	}
	if fixture.sessions.captured[0].ProfileLookupHome != fixture.defaultProfileLookupHome {
		t.Fatalf("expected default profile lookup home %q, got %q", fixture.defaultProfileLookupHome, fixture.sessions.captured[0].ProfileLookupHome)
	}
	if fixture.sessions.captured[0].SettaFilesLocation != nil {
		t.Fatalf("expected omitted settaFilesLocation for profile launch, got %#v", fixture.sessions.captured[0].SettaFilesLocation)
	}
}

func TestLocalLaunchServiceProfileLaunchKeepsExplicitAutoSettaFilesLocation(t *testing.T) {
	t.Parallel()

	fixture := newLocalLaunchFixture(t)
	intent := fixture.createIntent(t, decodeLaunchRequest(t, `{"workspaceRoot":"/tmp/workspace","profile":"dev","settaFilesLocation":"auto"}`), "http://launcher.example:7999/home")

	_, err := fixture.service.Launch(LocalLaunchInput{
		Request:        decodeLaunchRequest(t, `{"launchIntentToken":"`+intent+`"}`),
		RequestOrigin:  "http://launcher.example:7999",
		CurrentSession: fixture.currentSession,
	})
	if err != nil {
		t.Fatalf("launch workspace: %v", err)
	}

	if len(fixture.sessions.captured) != 1 {
		t.Fatalf("expected one session launch call, got %d", len(fixture.sessions.captured))
	}
	if fixture.sessions.captured[0].SettaFilesLocation == nil || *fixture.sessions.captured[0].SettaFilesLocation != "auto" {
		t.Fatalf("expected explicit auto settaFilesLocation to be preserved, got %#v", fixture.sessions.captured[0].SettaFilesLocation)
	}
}

func TestLocalLaunchServiceRollsBackNewSessionWhenTrustPersistenceFails(t *testing.T) {
	t.Parallel()

	fixture := newLocalLaunchFixture(t)
	intent := fixture.createIntent(t, decodeLaunchRequest(t, `{"workspaceRoot":"/tmp/workspace"}`), "http://launcher.example:7999/home")
	if err := os.WriteFile(filepath.Join(fixture.runtimeRoot, "trusted_frontend_origins.json"), []byte("{not-json"), 0o644); err != nil {
		t.Fatalf("write invalid trusted origins store: %v", err)
	}

	var rollbackCalls []string
	fixture.service.rollbackLocalSession = func(session auth.SessionMetadata, runtimeRoot string) error {
		rollbackCalls = append(rollbackCalls, session.ID+"@"+runtimeRoot)
		return nil
	}

	_, err := fixture.service.Launch(LocalLaunchInput{
		Request:        decodeLaunchRequest(t, `{"launchIntentToken":"`+intent+`"}`),
		RequestOrigin:  "http://launcher.example:7999",
		CurrentSession: fixture.currentSession,
	})
	if err == nil {
		t.Fatal("expected trust persistence failure")
	}
	launchErr, ok := err.(*LaunchError)
	if !ok {
		t.Fatalf("expected launch error, got %T", err)
	}
	if launchErr.Code != "TrustedFrontendOriginStoreInvalid" {
		t.Fatalf("expected TrustedFrontendOriginStoreInvalid, got %#v", launchErr)
	}
	expectedRollbackCall := fixture.sessions.result.Session.ID + "@" + fixture.sessions.result.Paths.RuntimeRoot
	if len(rollbackCalls) != 1 || rollbackCalls[0] != expectedRollbackCall {
		t.Fatalf("expected rollback call %q, got %#v", expectedRollbackCall, rollbackCalls)
	}
}

func TestLocalLaunchServiceRollsBackNewRemoteSessionWhenTrustPersistenceFails(t *testing.T) {
	t.Parallel()

	fixture := newLocalLaunchFixture(t)
	remoteResult := remoteLaunchConnectResult()
	remoteResult.StartedNew = true
	fixture.ssh.connectResult = remoteResult
	intent := fixture.createIntent(t, decodeLaunchRequest(t, `{"workspaceRoot":"/tmp/workspace","sshTarget":"user@host","sshArgs":"-p 2222"}`), "http://launcher.example:7999/home")
	if err := os.WriteFile(filepath.Join(fixture.runtimeRoot, "trusted_frontend_origins.json"), []byte("{not-json"), 0o644); err != nil {
		t.Fatalf("write invalid trusted origins store: %v", err)
	}

	_, err := fixture.service.Launch(LocalLaunchInput{
		Request:        decodeLaunchRequest(t, `{"launchIntentToken":"`+intent+`"}`),
		RequestOrigin:  "http://launcher.example:7999",
		CurrentSession: fixture.currentSession,
	})
	if err == nil {
		t.Fatal("expected trust persistence failure")
	}
	launchErr, ok := err.(*LaunchError)
	if !ok {
		t.Fatalf("expected launch error, got %T", err)
	}
	if launchErr.Code != "TrustedFrontendOriginStoreInvalid" {
		t.Fatalf("expected TrustedFrontendOriginStoreInvalid, got %#v", launchErr)
	}
	if len(fixture.ssh.rollbackInputs) != 1 {
		t.Fatalf("expected one remote rollback call, got %#v", fixture.ssh.rollbackInputs)
	}
	if fixture.ssh.rollbackInputs[0].SessionID != remoteResult.Session.ID {
		t.Fatalf("expected rollback for session %q, got %#v", remoteResult.Session.ID, fixture.ssh.rollbackInputs[0])
	}
	if fixture.ssh.rollbackInputs[0].RemoteCommand != "setta" {
		t.Fatalf("expected rollback to use resolved remote command, got %#v", fixture.ssh.rollbackInputs[0])
	}
}

func TestLocalLaunchServiceReturnsRemoteRollbackFailedWhenRemoteCleanupFails(t *testing.T) {
	t.Parallel()

	fixture := newLocalLaunchFixture(t)
	remoteResult := remoteLaunchConnectResult()
	remoteResult.StartedNew = true
	fixture.ssh.connectResult = remoteResult
	fixture.ssh.rollbackErr = &sshx.Error{
		Code:    "RemoteRollback",
		Message: "failed deleting session remotely",
	}
	intent := fixture.createIntent(t, decodeLaunchRequest(t, `{"workspaceRoot":"/tmp/workspace","sshTarget":"user@host"}`), "http://launcher.example:7999/home")
	if err := os.WriteFile(filepath.Join(fixture.runtimeRoot, "trusted_frontend_origins.json"), []byte("{not-json"), 0o644); err != nil {
		t.Fatalf("write invalid trusted origins store: %v", err)
	}

	_, err := fixture.service.Launch(LocalLaunchInput{
		Request:        decodeLaunchRequest(t, `{"launchIntentToken":"`+intent+`"}`),
		RequestOrigin:  "http://launcher.example:7999",
		CurrentSession: fixture.currentSession,
	})
	if err == nil {
		t.Fatal("expected remote rollback failure")
	}
	launchErr, ok := err.(*LaunchError)
	if !ok {
		t.Fatalf("expected launch error, got %T", err)
	}
	if launchErr.Code != "RemoteRollbackFailed" {
		t.Fatalf("expected RemoteRollbackFailed, got %#v", launchErr)
	}
	if !strings.Contains(launchErr.Message, remoteResult.Session.ID) {
		t.Fatalf("expected session id in rollback failure message, got %q", launchErr.Message)
	}
	if !strings.Contains(launchErr.Message, "failed deleting session remotely") {
		t.Fatalf("expected rollback detail in message, got %q", launchErr.Message)
	}
}

func TestLocalLaunchServiceReturnsLocalRollbackFailedWhenCleanupFails(t *testing.T) {
	t.Parallel()

	fixture := newLocalLaunchFixture(t)
	intent := fixture.createIntent(t, decodeLaunchRequest(t, `{"workspaceRoot":"/tmp/workspace"}`), "http://launcher.example:7999/home")
	if err := os.WriteFile(filepath.Join(fixture.runtimeRoot, "trusted_frontend_origins.json"), []byte("{not-json"), 0o644); err != nil {
		t.Fatalf("write invalid trusted origins store: %v", err)
	}

	fixture.service.rollbackLocalSession = func(session auth.SessionMetadata, runtimeRoot string) error {
		return fmt.Errorf("Process identity mismatch for session process %d during rollback of %s.", session.PID, session.ID)
	}

	_, err := fixture.service.Launch(LocalLaunchInput{
		Request:        decodeLaunchRequest(t, `{"launchIntentToken":"`+intent+`"}`),
		RequestOrigin:  "http://launcher.example:7999",
		CurrentSession: fixture.currentSession,
	})
	if err == nil {
		t.Fatal("expected local rollback failure")
	}
	launchErr, ok := err.(*LaunchError)
	if !ok {
		t.Fatalf("expected launch error, got %T", err)
	}
	if launchErr.Code != "LocalRollbackFailed" {
		t.Fatalf("expected LocalRollbackFailed, got %#v", launchErr)
	}
	if !strings.Contains(launchErr.Message, fixture.sessions.result.Session.ID) {
		t.Fatalf("expected session id in rollback failure message, got %q", launchErr.Message)
	}
	if !strings.Contains(launchErr.Message, "Process identity mismatch") {
		t.Fatalf("expected rollback detail in message, got %q", launchErr.Message)
	}
}

func TestLocalLaunchServiceDoesNotRollbackReusedSessionOnTrustFailure(t *testing.T) {
	t.Parallel()

	fixture := newLocalLaunchFixture(t)
	fixture.sessions.result.StartedNew = false
	intent := fixture.createIntent(t, decodeLaunchRequest(t, `{"workspaceRoot":"/tmp/workspace"}`), "http://launcher.example:7999/home")
	if err := os.WriteFile(filepath.Join(fixture.runtimeRoot, "trusted_frontend_origins.json"), []byte("{not-json"), 0o644); err != nil {
		t.Fatalf("write invalid trusted origins store: %v", err)
	}

	rollbackCalls := 0
	fixture.service.rollbackLocalSession = func(auth.SessionMetadata, string) error {
		rollbackCalls++
		return nil
	}

	_, err := fixture.service.Launch(LocalLaunchInput{
		Request:        decodeLaunchRequest(t, `{"launchIntentToken":"`+intent+`"}`),
		RequestOrigin:  "http://launcher.example:7999",
		CurrentSession: fixture.currentSession,
	})
	if err == nil {
		t.Fatal("expected trust persistence failure")
	}
	launchErr, ok := err.(*LaunchError)
	if !ok {
		t.Fatalf("expected launch error, got %T", err)
	}
	if launchErr.Code != "TrustedFrontendOriginStoreInvalid" {
		t.Fatalf("expected TrustedFrontendOriginStoreInvalid, got %#v", launchErr)
	}
	if rollbackCalls != 0 {
		t.Fatalf("expected no rollback calls for reused session, got %d", rollbackCalls)
	}
}

func TestLocalLaunchServiceTrustFailureDoesNotPersistLastUsedWorkspace(t *testing.T) {
	t.Parallel()

	fixture := newLocalLaunchFixture(t)
	writeInstalledLauncherMetadata(t, fixture.defaultSettaHome)
	intent := fixture.createIntent(t, decodeLaunchRequest(t, `{"workspaceRoot":"/tmp/workspace"}`), "http://launcher.example:7999/home")
	if err := os.WriteFile(filepath.Join(fixture.runtimeRoot, "trusted_frontend_origins.json"), []byte("{not-json"), 0o644); err != nil {
		t.Fatalf("write invalid trusted origins store: %v", err)
	}

	_, err := fixture.service.Launch(LocalLaunchInput{
		Request:        decodeLaunchRequest(t, `{"launchIntentToken":"`+intent+`"}`),
		RequestOrigin:  "http://launcher.example:7999",
		CurrentSession: fixture.currentSession,
	})
	if err == nil {
		t.Fatal("expected trust persistence failure")
	}

	metadata, err := launcher.LoadLauncherInstallMetadata(fixture.defaultSettaHome)
	if err != nil {
		t.Fatalf("load launcher metadata: %v", err)
	}
	if metadata == nil {
		t.Fatal("expected launcher metadata to remain installed")
	}
	if metadata.LastUsedWorkspace != nil {
		t.Fatalf("expected last used workspace to remain unset on trust failure, got %#v", metadata.LastUsedWorkspace)
	}
}

func TestLocalLaunchServiceDoesNotRollbackReusedRemoteSessionOnTrustFailure(t *testing.T) {
	t.Parallel()

	fixture := newLocalLaunchFixture(t)
	remoteResult := remoteLaunchConnectResult()
	remoteResult.StartedNew = false
	fixture.ssh.connectResult = remoteResult
	intent := fixture.createIntent(t, decodeLaunchRequest(t, `{"workspaceRoot":"/tmp/workspace","sshTarget":"user@host"}`), "http://launcher.example:7999/home")
	if err := os.WriteFile(filepath.Join(fixture.runtimeRoot, "trusted_frontend_origins.json"), []byte("{not-json"), 0o644); err != nil {
		t.Fatalf("write invalid trusted origins store: %v", err)
	}

	_, err := fixture.service.Launch(LocalLaunchInput{
		Request:        decodeLaunchRequest(t, `{"launchIntentToken":"`+intent+`"}`),
		RequestOrigin:  "http://launcher.example:7999",
		CurrentSession: fixture.currentSession,
	})
	if err == nil {
		t.Fatal("expected trust persistence failure")
	}
	launchErr, ok := err.(*LaunchError)
	if !ok {
		t.Fatalf("expected launch error, got %T", err)
	}
	if launchErr.Code != "TrustedFrontendOriginStoreInvalid" {
		t.Fatalf("expected TrustedFrontendOriginStoreInvalid, got %#v", launchErr)
	}
	if len(fixture.ssh.rollbackInputs) != 0 {
		t.Fatalf("expected no rollback calls for reused remote session, got %#v", fixture.ssh.rollbackInputs)
	}
}

func TestLocalLaunchServiceReturnsRemoteRollbackFailedWithTunnelDetail(t *testing.T) {
	t.Parallel()

	fixture := newLocalLaunchFixture(t)
	remoteResult := remoteLaunchConnectResult()
	remoteResult.StartedNew = true
	fixture.ssh.connectResult = remoteResult
	fixture.ssh.rollbackErr = &sshx.Error{
		Code:    "RemoteRollback",
		Message: "Failed rolling back SSH launch side effects. Tunnel process 999 is still running for user@host.",
	}
	intent := fixture.createIntent(t, decodeLaunchRequest(t, `{"workspaceRoot":"/tmp/workspace","sshTarget":"user@host"}`), "http://launcher.example:7999/home")
	if err := os.WriteFile(filepath.Join(fixture.runtimeRoot, "trusted_frontend_origins.json"), []byte("{not-json"), 0o644); err != nil {
		t.Fatalf("write invalid trusted origins store: %v", err)
	}

	_, err := fixture.service.Launch(LocalLaunchInput{
		Request:        decodeLaunchRequest(t, `{"launchIntentToken":"`+intent+`"}`),
		RequestOrigin:  "http://launcher.example:7999",
		CurrentSession: fixture.currentSession,
	})
	if err == nil {
		t.Fatal("expected remote rollback failure")
	}
	launchErr, ok := err.(*LaunchError)
	if !ok {
		t.Fatalf("expected launch error, got %T", err)
	}
	if launchErr.Code != "RemoteRollbackFailed" {
		t.Fatalf("expected RemoteRollbackFailed, got %#v", launchErr)
	}
	if !strings.Contains(launchErr.Message, remoteResult.Session.ID) {
		t.Fatalf("expected session id in rollback failure message, got %q", launchErr.Message)
	}
	if !strings.Contains(launchErr.Message, "Tunnel process 999 is still running for user@host.") {
		t.Fatalf("expected tunnel rollback detail in message, got %q", launchErr.Message)
	}
}

type localLaunchFixture struct {
	runtimeRoot              string
	defaultSettaHome         string
	defaultProfileLookupHome string
	currentSession           *auth.CurrentSession
	trustedOrigins           *frontendorigins.Service
	intentService            *IntentService
	sessions                 *stubLocalLaunchSessions
	ssh                      *stubRemoteLaunchRuntime
	service                  *LocalLaunchService
}

func newLocalLaunchFixture(t *testing.T) localLaunchFixture {
	t.Helper()

	now := time.Unix(1_710_000_000, 0).UTC()
	runtimeRoot := filepath.Join(t.TempDir(), "runtime")
	defaultSettaHome := filepath.Join(t.TempDir(), ".setta")
	defaultProfileLookupHome := filepath.Join(t.TempDir(), ".setta-profiles")
	trustedOrigins, err := frontendorigins.NewService(frontendorigins.Options{
		RuntimeRoot: runtimeRoot,
		Now:         func() time.Time { return now },
	})
	if err != nil {
		t.Fatalf("new trusted origins service: %v", err)
	}
	intentService, err := NewIntentService(IntentServiceOptions{
		RuntimeRoot:    runtimeRoot,
		TrustedOrigins: trustedOrigins,
		Now:            func() time.Time { return now },
	})
	if err != nil {
		t.Fatalf("new intent service: %v", err)
	}

	sessions := &stubLocalLaunchSessions{
		result: launcher.IDELaunchResult{
			Session: auth.SessionMetadata{
				ID:                     "workspace-session",
				WorkspacePath:          "/tmp/workspace",
				WorkspacePathCanonical: "/tmp/workspace",
				Host:                   "127.0.0.1",
				Port:                   61234,
				PID:                    12345,
				PIDCreateTime:          float64Pointer(123.456),
				StartedAt:              now,
			},
			Secret: []byte("workspace-secret"),
			Paths: config.Paths{
				WorkspaceRoot:         "/tmp/workspace",
				SettaHome:             defaultSettaHome,
				SettaFilesRoot:        "/tmp/workspace/setta_files",
				ResolvedFilesLocation: config.ResolvedFilesLocationLocal,
				RuntimeRoot:           "/tmp/workspace/setta_files/runtime",
			},
			StartedNew: true,
		},
	}
	ssh := &stubRemoteLaunchRuntime{}
	currentSession := &auth.CurrentSession{
		Metadata: auth.SessionMetadata{
			ID: "launcher-session",
		},
		Secret: []byte("launcher-secret"),
	}

	service, err := NewLocalLaunchService(LocalLaunchServiceOptions{
		DefaultSettaHome:         defaultSettaHome,
		DefaultProfileLookupHome: defaultProfileLookupHome,
		Intents:                  intentService,
		TrustedOrigins:           trustedOrigins,
		Sessions:                 sessions,
		SSH:                      ssh,
		Now:                      func() time.Time { return now },
		MintBootstrapToken: func(sessionID string, secret []byte, issuedAt time.Time) (string, error) {
			if sessionID == "" || len(secret) == 0 || issuedAt.IsZero() {
				return "", fmt.Errorf("invalid bootstrap token input")
			}
			return "tok", nil
		},
		ResolveLauncherSessionAuthExpiry: func(time.Time) (int64, error) {
			return now.Add(12 * time.Hour).Unix(), nil
		},
	})
	if err != nil {
		t.Fatalf("new local launch service: %v", err)
	}

	return localLaunchFixture{
		runtimeRoot:              runtimeRoot,
		defaultSettaHome:         defaultSettaHome,
		defaultProfileLookupHome: defaultProfileLookupHome,
		currentSession:           currentSession,
		trustedOrigins:           trustedOrigins,
		intentService:            intentService,
		sessions:                 sessions,
		ssh:                      ssh,
		service:                  service,
	}
}

func (f localLaunchFixture) createIntent(t *testing.T, request Request, returnURL string) string {
	t.Helper()

	result, err := f.intentService.CreateIntent(CreateIntentInput{
		Request:        request,
		ReturnURL:      returnURL,
		RequestOrigin:  "http://launcher.example:7999",
		CurrentSession: f.currentSession,
	})
	if err != nil {
		t.Fatalf("create intent: %v", err)
	}
	return result.LaunchIntentToken
}

func writeInstalledLauncherMetadata(t *testing.T, settaHome string) {
	t.Helper()

	targetExecutable := filepath.Join(t.TempDir(), "setta")
	if err := os.WriteFile(targetExecutable, []byte("#!/usr/bin/env bash\n"), 0o755); err != nil {
		t.Fatalf("write launcher target executable: %v", err)
	}
	installMetadata, err := launcher.BuildLauncherInstallMetadata(launcher.LauncherInstallMetadataInput{
		TargetCommand:          []string{targetExecutable},
		Channel:                "manual",
		InstallSource:          launcher.LauncherInstallSourceUnsupported,
		ArtifactOwnershipToken: "local-launch-test-token",
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
	if _, err := launcher.WriteLauncherInstallMetadata(settaHome, installMetadata); err != nil {
		t.Fatalf("write launcher metadata: %v", err)
	}
}

func float64Pointer(value float64) *float64 {
	return &value
}

func remoteLaunchConnectResult() sshx.RemoteConnectResult {
	return sshx.RemoteConnectResult{
		BootstrapURLFragment: "http://127.0.0.1:61000/__setta__/bootstrap#token=remote-tok",
		Session: sshx.RemoteSessionSummary{
			ID:                     "remote-session-id",
			WorkspacePath:          "/remote/workspace",
			WorkspacePathCanonical: "/remote/workspace",
			Host:                   "127.0.0.1",
			Port:                   61234,
			PID:                    12345,
			StartedAt:              time.Unix(1_710_000_000, 0).UTC(),
			ServerMode:             sshx.RemoteServerModeIDE,
		},
		StartedNew:          false,
		RemoteCommand:       "setta",
		SettaFilesLocation:  "global",
		SettaFilesRoot:      "/remote/state",
		RuntimeRoot:         "/remote/runtime",
		SettaHome:           "/remote/home/.setta",
		Profile:             "dev",
		LauncherOriginProof: "proof",
	}
}
