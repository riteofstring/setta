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

func TestLocalLaunchServiceRejectsSSHIntentForThisSlice(t *testing.T) {
	t.Parallel()

	fixture := newLocalLaunchFixture(t)
	intent := fixture.createIntent(t, decodeLaunchRequest(t, `{"workspaceRoot":"/tmp/workspace","sshTarget":"user@host"}`), "http://launcher.example:7999/home")

	_, err := fixture.service.Launch(LocalLaunchInput{
		Request:        decodeLaunchRequest(t, `{"launchIntentToken":"`+intent+`"}`),
		RequestOrigin:  "http://launcher.example:7999",
		CurrentSession: fixture.currentSession,
	})
	if err == nil {
		t.Fatal("expected SSH launch to fail")
	}
	launchErr, ok := err.(*LaunchError)
	if !ok {
		t.Fatalf("expected launch error, got %T", err)
	}
	if launchErr.Code != "SSHLaunchUnavailable" {
		t.Fatalf("expected SSHLaunchUnavailable, got %#v", launchErr)
	}
	if len(fixture.sessions.captured) != 0 {
		t.Fatalf("expected no session launch call, got %d", len(fixture.sessions.captured))
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

type localLaunchFixture struct {
	runtimeRoot              string
	defaultSettaHome         string
	defaultProfileLookupHome string
	currentSession           *auth.CurrentSession
	trustedOrigins           *frontendorigins.Service
	intentService            *IntentService
	sessions                 *stubLocalLaunchSessions
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

func float64Pointer(value float64) *float64 {
	return &value
}
