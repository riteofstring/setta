package settacli

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"setta/internal/auth"
	"setta/internal/frontendorigins"
	"setta/internal/httpapi"
	"setta/internal/localsessions"
	"setta/internal/mcpx"
)

func TestSettacliHelperProcess(t *testing.T) {
	if os.Getenv("GO_WANT_SETTACLI_HELPER") != "1" {
		return
	}
	select {}
}

func TestRunStatusConnectInfoJSONEmitsPayload(t *testing.T) {
	t.Parallel()

	fixture := newCLIFixture(t)
	proc := fixture.startProcess(t, "setta.server:app")
	session := fixture.createSession(t, proc, 61234, time.Date(2026, time.March, 8, 12, 0, 0, 0, time.UTC), "ide")

	stdout, _, err := fixture.run("--workspace", fixture.workspaceRoot, "--setta-home", fixture.settaHome, "status", "--connect-info", "--json")
	if err != nil {
		t.Fatalf("run status connect-info: %v", err)
	}
	payload := decodeConnectInfoJSON(t, stdout)

	sessionPayload, ok := payload["session"].(map[string]any)
	if !ok {
		t.Fatalf("expected session payload, got %#v", payload["session"])
	}
	if sessionPayload["id"] != session.ID {
		t.Fatalf("expected session id %q, got %#v", session.ID, sessionPayload["id"])
	}
	if sessionPayload["port"] != float64(61234) {
		t.Fatalf("expected session port 61234, got %#v", sessionPayload["port"])
	}
	if sessionPayload["serverMode"] != "ide" {
		t.Fatalf("expected ide session mode, got %#v", sessionPayload["serverMode"])
	}
	if payload["bootstrapUrlPlain"] != "http://127.0.0.1:61234/__setta__/bootstrap" {
		t.Fatalf("unexpected bootstrapUrlPlain %#v", payload["bootstrapUrlPlain"])
	}
	fragment, ok := payload["bootstrapUrlFragment"].(string)
	if !ok || !strings.HasPrefix(fragment, "http://127.0.0.1:61234/__setta__/bootstrap#token=") {
		t.Fatalf("unexpected bootstrapUrlFragment %#v", payload["bootstrapUrlFragment"])
	}
	if payload["sshTunnelCommand"] != "ssh -N -L ${LOCAL_PORT}:127.0.0.1:61234 <user@host> -o ExitOnForwardFailure=yes" {
		t.Fatalf("unexpected sshTunnelCommand %#v", payload["sshTunnelCommand"])
	}
	if payload["runtimeRoot"] != fixture.runtimeRoot {
		t.Fatalf("expected runtimeRoot %q, got %#v", fixture.runtimeRoot, payload["runtimeRoot"])
	}
	if payload["settaFilesLocation"] != "local" {
		t.Fatalf("expected local settaFilesLocation, got %#v", payload["settaFilesLocation"])
	}
}

func TestRunStatusConnectInfoJSONAcceptsWorkspaceShortAlias(t *testing.T) {
	t.Parallel()

	fixture := newCLIFixture(t)
	proc := fixture.startProcess(t, "setta.server:app")
	session := fixture.createSession(t, proc, 61234, time.Date(2026, time.March, 8, 12, 0, 0, 0, time.UTC), "ide")

	stdout, _, err := fixture.run("--setta-home", fixture.settaHome, "status", "--connect-info", "--json", "-w", fixture.workspaceRoot)
	if err != nil {
		t.Fatalf("run status connect-info with -w: %v", err)
	}
	payload := decodeConnectInfoJSON(t, stdout)
	sessionPayload := payload["session"].(map[string]any)
	if sessionPayload["id"] != session.ID {
		t.Fatalf("expected session id %q, got %#v", session.ID, sessionPayload["id"])
	}
}

func TestRunStatusConnectInfoJSONIncludesOptionalSessionMetadataFields(t *testing.T) {
	t.Parallel()

	fixture := newCLIFixture(t)
	proc := fixture.startProcess(t, "setta.server:app")
	session := fixture.createSession(t, proc, 61234, time.Date(2026, time.March, 8, 12, 0, 0, 0, time.UTC), "ide")
	session.Profile = "dev"
	if err := rewriteSessionMetadata(session); err != nil {
		t.Fatalf("rewrite session metadata: %v", err)
	}

	stdout, _, err := fixture.run("--workspace", fixture.workspaceRoot, "--setta-home", fixture.settaHome, "status", "--connect-info", "--json")
	if err != nil {
		t.Fatalf("run status connect-info: %v", err)
	}
	payload := decodeConnectInfoJSON(t, stdout)

	if payload["settaFilesRoot"] != fixture.settaFilesRoot {
		t.Fatalf("expected settaFilesRoot %q, got %#v", fixture.settaFilesRoot, payload["settaFilesRoot"])
	}
	if payload["settaHome"] != fixture.settaHome {
		t.Fatalf("expected settaHome %q, got %#v", fixture.settaHome, payload["settaHome"])
	}
	if payload["profile"] != "dev" {
		t.Fatalf("expected profile dev, got %#v", payload["profile"])
	}
}

func TestRunStatusConnectInfoJSONOmitsAbsentOptionalMetadataFields(t *testing.T) {
	t.Parallel()

	fixture := newCLIFixture(t)
	proc := fixture.startProcess(t, "setta.server:app")
	session := fixture.createSession(t, proc, 61234, time.Date(2026, time.March, 8, 12, 0, 0, 0, time.UTC), "ide")
	session.SettaFilesLocation = ""
	session.SettaFilesRoot = ""
	session.RuntimeRoot = ""
	session.SettaHome = ""
	session.Profile = ""
	if err := rewriteSessionMetadata(session); err != nil {
		t.Fatalf("rewrite session metadata: %v", err)
	}

	stdout, _, err := fixture.run("--workspace", fixture.workspaceRoot, "--setta-home", fixture.settaHome, "status", "--connect-info", "--json")
	if err != nil {
		t.Fatalf("run status connect-info: %v", err)
	}
	payload := decodeConnectInfoJSON(t, stdout)

	for _, key := range []string{"settaFilesLocation", "settaFilesRoot", "runtimeRoot", "settaHome", "profile"} {
		if _, ok := payload[key]; ok {
			t.Fatalf("expected %q to be omitted from connect-info JSON, got %#v", key, payload[key])
		}
	}
}

func TestRunStatusConnectInfoReportsMissingSession(t *testing.T) {
	t.Parallel()

	fixture := newCLIFixture(t)
	proc := fixture.startProcess(t, "setta.server:app")
	_ = fixture.createSession(t, proc, 61234, time.Date(2026, time.March, 8, 12, 0, 0, 0, time.UTC), "ide")

	stdout, stderr, err := fixture.run(
		"--workspace", fixture.workspaceRoot,
		"--setta-home", fixture.settaHome,
		"status",
		"--connect-info",
		"--json",
		"--session", "missing-session",
	)
	if err == nil {
		t.Fatal("expected missing-session error")
	}
	if strings.TrimSpace(stdout) != "" {
		t.Fatalf("expected empty stdout, got %q", stdout)
	}
	if strings.TrimSpace(stderr) != "" {
		t.Fatalf("expected empty stderr, got %q", stderr)
	}
	if err.Error() != "session missing-session not found" {
		t.Fatalf("unexpected error %q", err.Error())
	}
}

func TestRunStatusValidationRejectsInvalidCommandShapes(t *testing.T) {
	t.Parallel()

	fixture := newCLIFixture(t)

	testCases := []struct {
		name           string
		args           []string
		wantErrMessage string
	}{
		{
			name:           "missing_mode_selection",
			args:           []string{"status"},
			wantErrMessage: "use --connect-info to print session details",
		},
		{
			name:           "list_sessions_requires_json",
			args:           []string{"status", "--list-sessions"},
			wantErrMessage: "use --json with --list-sessions",
		},
		{
			name:           "conflicting_session_and_latest",
			args:           []string{"status", "--connect-info", "--session", "session-a", "--latest"},
			wantErrMessage: "use either --session or --latest, not both",
		},
		{
			name: "invalid_server_mode",
			args: []string{
				"--workspace", fixture.workspaceRoot,
				"--setta-home", fixture.settaHome,
				"status",
				"--connect-info",
				"--server-mode", "share",
			},
			wantErrMessage: `invalid --server-mode "share"`,
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			stdout, stderr, err := fixture.run(testCase.args...)
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

func TestRunStatusConnectInfoJSONLauncherOriginIncludesNormalizedOriginAndProof(t *testing.T) {
	t.Parallel()

	fixture := newCLIFixture(t)
	proc := fixture.startProcess(t, "setta.server:app")
	session := fixture.createSession(t, proc, 61234, time.Date(2026, time.March, 8, 12, 0, 0, 0, time.UTC), "ide")

	stdout, _, err := fixture.run(
		"--workspace", fixture.workspaceRoot,
		"--setta-home", fixture.settaHome,
		"status",
		"--connect-info",
		"--json",
		"--launcher-origin", "http://127.0.0.1:9001/launch?ignored=1",
	)
	if err != nil {
		t.Fatalf("run status connect-info with launcher origin: %v", err)
	}
	payload := decodeConnectInfoJSON(t, stdout)
	if payload["launcherOrigin"] != "http://127.0.0.1:9001" {
		t.Fatalf("unexpected normalized launcher origin %#v", payload["launcherOrigin"])
	}
	proof, ok := payload["launcherOriginProof"].(string)
	if !ok || strings.TrimSpace(proof) == "" {
		t.Fatalf("expected launcher origin proof, got %#v", payload["launcherOriginProof"])
	}

	secret, err := fixture.registry.LoadSecret(session)
	if err != nil {
		t.Fatalf("load session secret: %v", err)
	}
	if !frontendorigins.ValidateLauncherOriginHandoffProof(session.ID, "http://127.0.0.1:9001", proof, secret) {
		t.Fatalf("expected launcher origin proof to validate for session %q", session.ID)
	}
}

func TestRunStatusRejectsInvalidLauncherOrigin(t *testing.T) {
	t.Parallel()

	fixture := newCLIFixture(t)
	proc := fixture.startProcess(t, "setta.server:app")
	_ = fixture.createSession(t, proc, 61234, time.Date(2026, time.March, 8, 12, 0, 0, 0, time.UTC), "ide")

	stdout, stderr, err := fixture.run(
		"--workspace", fixture.workspaceRoot,
		"--setta-home", fixture.settaHome,
		"status",
		"--connect-info",
		"--json",
		"--launcher-origin", "not-an-origin",
	)
	if err == nil {
		t.Fatal("expected invalid launcher-origin error")
	}
	if strings.TrimSpace(stdout) != "" {
		t.Fatalf("expected empty stdout, got %q", stdout)
	}
	if strings.TrimSpace(stderr) != "" {
		t.Fatalf("expected empty stderr, got %q", stderr)
	}
	if err.Error() != "--launcher-origin must be an absolute http(s) origin" {
		t.Fatalf("unexpected error %q", err.Error())
	}
}

func TestRunStatusIgnoresStaleSessionsAndDefaultsToIDE(t *testing.T) {
	t.Parallel()

	fixture := newCLIFixture(t)
	ideProc := fixture.startProcess(t, "setta.server:app")
	fixture.createSession(t, ideProc, 61234, time.Date(2026, time.March, 8, 12, 0, 0, 0, time.UTC), "ide")
	launcherProc := fixture.startProcess(t, "setta.server:app")
	fixture.createSession(t, launcherProc, 61235, time.Date(2026, time.March, 8, 12, 1, 0, 0, time.UTC), "launcher")
	staleProc := fixture.startProcess(t, "unit-test")
	fixture.createSession(t, staleProc, 61236, time.Date(2026, time.March, 8, 12, 2, 0, 0, time.UTC), "ide")

	stdout, _, err := fixture.run("--workspace", fixture.workspaceRoot, "--setta-home", fixture.settaHome, "status", "--connect-info", "--json", "--latest")
	if err != nil {
		t.Fatalf("run latest status: %v", err)
	}
	payload := decodeConnectInfoJSON(t, stdout)
	sessionPayload := payload["session"].(map[string]any)
	if sessionPayload["port"] != float64(61234) {
		t.Fatalf("expected IDE session port 61234, got %#v", sessionPayload["port"])
	}
	if sessionPayload["serverMode"] != "ide" {
		t.Fatalf("expected ide session mode, got %#v", sessionPayload["serverMode"])
	}
}

func TestRunStatusConnectInfoLatestRespectsServerModeFilter(t *testing.T) {
	t.Parallel()

	fixture := newCLIFixture(t)
	launcherProc := fixture.startProcess(t, "setta.server:app")
	ideProc := fixture.startProcess(t, "setta.server:app")
	launcherSession := fixture.createSession(t, launcherProc, 61235, time.Date(2026, time.March, 8, 12, 0, 0, 0, time.UTC), "launcher")
	fixture.createSession(t, ideProc, 61234, time.Date(2026, time.March, 8, 12, 1, 0, 0, time.UTC), "ide")

	stdout, _, err := fixture.run(
		"--workspace", fixture.workspaceRoot,
		"--setta-home", fixture.settaHome,
		"status",
		"--connect-info",
		"--json",
		"--latest",
		"--server-mode", "launcher",
	)
	if err != nil {
		t.Fatalf("run launcher-filtered latest status: %v", err)
	}
	payload := decodeConnectInfoJSON(t, stdout)
	sessionPayload := payload["session"].(map[string]any)
	if sessionPayload["id"] != launcherSession.ID {
		t.Fatalf("expected launcher session %q, got %#v", launcherSession.ID, sessionPayload["id"])
	}
	if sessionPayload["serverMode"] != "launcher" {
		t.Fatalf("expected launcher serverMode, got %#v", sessionPayload["serverMode"])
	}
}

func TestRunStatusConnectInfoRequiresSelectorWhenMultipleIDESessionsMatch(t *testing.T) {
	t.Parallel()

	fixture := newCLIFixture(t)
	firstProc := fixture.startProcess(t, "setta.server:app")
	secondProc := fixture.startProcess(t, "setta.server:app")
	fixture.createSession(t, firstProc, 61234, time.Date(2026, time.March, 8, 12, 0, 0, 0, time.UTC), "ide")
	fixture.createSession(t, secondProc, 61235, time.Date(2026, time.March, 8, 12, 1, 0, 0, time.UTC), "ide")

	stdout, stderr, err := fixture.run("--workspace", fixture.workspaceRoot, "--setta-home", fixture.settaHome, "status", "--connect-info", "--json")
	if err == nil {
		t.Fatal("expected multi-match selector error")
	}
	if strings.TrimSpace(stdout) != "" {
		t.Fatalf("expected empty stdout, got %q", stdout)
	}
	if strings.TrimSpace(stderr) != "" {
		t.Fatalf("expected empty stderr, got %q", stderr)
	}
	if err.Error() != "multiple sessions found; use --session <id> or --latest" {
		t.Fatalf("unexpected error %q", err.Error())
	}
}

func TestRunStatusConnectInfoWorkspaceFlagSelectsWorkspaceOutsideCurrentDirectory(t *testing.T) {
	t.Parallel()

	fixture := newCLIFixture(t)
	proc := fixture.startProcess(t, "setta.server:app")
	session := fixture.createSession(t, proc, 61234, time.Date(2026, time.March, 8, 12, 0, 0, 0, time.UTC), "ide")
	otherCWD := t.TempDir()

	stdout, _, err := fixture.runFromCWD(
		otherCWD,
		"--workspace", fixture.workspaceRoot,
		"--setta-home", fixture.settaHome,
		"status",
		"--connect-info",
		"--json",
	)
	if err != nil {
		t.Fatalf("run status connect-info from outside cwd: %v", err)
	}
	payload := decodeConnectInfoJSON(t, stdout)
	sessionPayload := payload["session"].(map[string]any)
	if sessionPayload["id"] != session.ID {
		t.Fatalf("expected workspace-selected session %q, got %#v", session.ID, sessionPayload["id"])
	}
}

func TestRunStatusListSessionsJSONIncludesLauncherWithoutDefaultFilter(t *testing.T) {
	t.Parallel()

	fixture := newCLIFixture(t)
	firstProc := fixture.startProcess(t, "setta.server:app")
	fixture.createSession(t, firstProc, 61234, time.Date(2026, time.March, 8, 12, 0, 0, 0, time.UTC), "ide")
	secondProc := fixture.startProcess(t, "setta.server:app")
	fixture.createSession(t, secondProc, 61235, time.Date(2026, time.March, 8, 12, 1, 0, 0, time.UTC), "launcher")

	stdout, _, err := fixture.run("--workspace", fixture.workspaceRoot, "--setta-home", fixture.settaHome, "status", "--list-sessions", "--json")
	if err != nil {
		t.Fatalf("run list-sessions: %v", err)
	}
	payload := decodeConnectInfoJSON(t, stdout)
	sessions, ok := payload["sessions"].([]any)
	if !ok {
		t.Fatalf("expected sessions payload, got %#v", payload["sessions"])
	}
	if len(sessions) != 2 {
		t.Fatalf("expected two sessions, got %#v", sessions)
	}
	ports := map[float64]bool{}
	serverModes := map[string]bool{}
	for _, entry := range sessions {
		session := entry.(map[string]any)
		ports[session["port"].(float64)] = true
		serverModes[session["serverMode"].(string)] = true
	}
	if !ports[61234] || !ports[61235] {
		t.Fatalf("expected ports 61234 and 61235, got %#v", ports)
	}
	if !serverModes["ide"] || !serverModes["launcher"] {
		t.Fatalf("expected ide and launcher sessions, got %#v", serverModes)
	}
}

func TestRunStatusListSessionsJSONFiltersByServerMode(t *testing.T) {
	t.Parallel()

	fixture := newCLIFixture(t)
	firstProc := fixture.startProcess(t, "setta.server:app")
	fixture.createSession(t, firstProc, 61234, time.Date(2026, time.March, 8, 12, 0, 0, 0, time.UTC), "ide")
	secondProc := fixture.startProcess(t, "setta.server:app")
	fixture.createSession(t, secondProc, 61235, time.Date(2026, time.March, 8, 12, 1, 0, 0, time.UTC), "launcher")

	stdout, _, err := fixture.run(
		"--workspace",
		fixture.workspaceRoot,
		"--setta-home",
		fixture.settaHome,
		"status",
		"--list-sessions",
		"--json",
		"--server-mode",
		"launcher",
	)
	if err != nil {
		t.Fatalf("run filtered list-sessions: %v", err)
	}
	payload := decodeConnectInfoJSON(t, stdout)
	sessions, ok := payload["sessions"].([]any)
	if !ok {
		t.Fatalf("expected sessions payload, got %#v", payload["sessions"])
	}
	if len(sessions) != 1 {
		t.Fatalf("expected one filtered session, got %#v", sessions)
	}
	session := sessions[0].(map[string]any)
	if session["port"] != float64(61235) {
		t.Fatalf("expected launcher session port 61235, got %#v", session["port"])
	}
	if session["serverMode"] != "launcher" {
		t.Fatalf("expected launcher server mode, got %#v", session["serverMode"])
	}
}

func TestRunStatusDeleteSessionStopsOwnedSettaProcessAndRemovesMetadata(t *testing.T) {
	t.Parallel()

	fixture := newCLIFixture(t)
	proc := fixture.startProcess(t, "setta.server:app")
	session := fixture.createSession(t, proc, 61234, time.Date(2026, time.March, 8, 12, 0, 0, 0, time.UTC), "ide")

	stdout, stderr, err := fixture.run(
		"--workspace",
		fixture.workspaceRoot,
		"--setta-home",
		fixture.settaHome,
		"status",
		"--delete-session",
		session.ID,
	)
	if err != nil {
		t.Fatalf("run delete-session: %v", err)
	}
	if strings.TrimSpace(stderr) != "" {
		t.Fatalf("expected empty stderr, got %q", stderr)
	}
	if strings.TrimSpace(stdout) != "Deleted session "+session.ID+"." {
		t.Fatalf("unexpected stdout %q", stdout)
	}

	waitDone := make(chan error, 1)
	go func() {
		waitDone <- proc.Wait()
	}()
	select {
	case err := <-waitDone:
		if err == nil {
			t.Fatal("expected helper process to exit via kill signal")
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for Setta session process to exit")
	}

	if _, err := os.Stat(filepath.Join(fixture.runtimeRoot, "sessions", session.ID)); !os.IsNotExist(err) {
		t.Fatalf("expected session metadata directory to be removed, stat err=%v", err)
	}
}

func TestRunStatusDeleteSessionSkipsKillingNonSettaProcess(t *testing.T) {
	t.Parallel()

	fixture := newCLIFixture(t)
	proc := fixture.startProcess(t, "unit-test")
	session := fixture.createSession(t, proc, 61234, time.Date(2026, time.March, 8, 12, 0, 0, 0, time.UTC), "ide")

	stdout, stderr, err := fixture.run(
		"--workspace",
		fixture.workspaceRoot,
		"--setta-home",
		fixture.settaHome,
		"status",
		"--delete-session",
		session.ID,
	)
	if err != nil {
		t.Fatalf("run delete-session: %v", err)
	}
	if strings.TrimSpace(stderr) != "" {
		t.Fatalf("expected empty stderr, got %q", stderr)
	}
	if strings.TrimSpace(stdout) != "Deleted session "+session.ID+"." {
		t.Fatalf("unexpected stdout %q", stdout)
	}

	waitDone := make(chan error, 1)
	go func() {
		waitDone <- proc.Wait()
	}()
	select {
	case err := <-waitDone:
		t.Fatalf("expected non-Setta helper process to keep running, wait returned %v", err)
	case <-time.After(200 * time.Millisecond):
	}

	if _, err := os.Stat(filepath.Join(fixture.runtimeRoot, "sessions", session.ID)); !os.IsNotExist(err) {
		t.Fatalf("expected session metadata directory to be removed, stat err=%v", err)
	}
}

func TestRunStatusDeleteSessionReportsMissingSession(t *testing.T) {
	t.Parallel()

	fixture := newCLIFixture(t)
	proc := fixture.startProcess(t, "setta.server:app")
	_ = fixture.createSession(t, proc, 61234, time.Date(2026, time.March, 8, 12, 0, 0, 0, time.UTC), "ide")

	stdout, stderr, err := fixture.run(
		"--workspace",
		fixture.workspaceRoot,
		"--setta-home",
		fixture.settaHome,
		"status",
		"--delete-session",
		"missing-session",
	)
	if err == nil {
		t.Fatal("expected missing-session error")
	}
	if strings.TrimSpace(stdout) != "" {
		t.Fatalf("expected empty stdout, got %q", stdout)
	}
	if strings.TrimSpace(stderr) != "" {
		t.Fatalf("expected empty stderr, got %q", stderr)
	}
	if err.Error() != "session missing-session not found" {
		t.Fatalf("unexpected error %q", err.Error())
	}
}

func TestRunAuthJSONEmitsPayload(t *testing.T) {
	t.Parallel()

	fixture := newCLIFixture(t)
	proc := fixture.startProcess(t, "setta.server:app")
	session := fixture.createSession(t, proc, 61234, time.Date(2026, time.March, 8, 12, 0, 0, 0, time.UTC), "ide")

	stdout, _, err := fixture.run("--workspace", fixture.workspaceRoot, "--setta-home", fixture.settaHome, "auth", "--json", "--session", session.ID)
	if err != nil {
		t.Fatalf("run auth --json: %v", err)
	}
	var payload map[string]any
	if err := json.Unmarshal([]byte(strings.TrimSpace(stdout)), &payload); err != nil {
		t.Fatalf("decode auth payload: %v", err)
	}
	if payload["baseUrl"] != "http://127.0.0.1:61234" {
		t.Fatalf("unexpected baseUrl %#v", payload["baseUrl"])
	}
	if payload["apiBaseUrl"] != "http://127.0.0.1:61234/api" {
		t.Fatalf("unexpected apiBaseUrl %#v", payload["apiBaseUrl"])
	}
	cookieName, ok := payload["cookieName"].(string)
	if !ok || !strings.HasSuffix(cookieName, "_"+session.ID) {
		t.Fatalf("unexpected cookieName %#v", payload["cookieName"])
	}
	cookieHeader, ok := payload["cookieHeader"].(string)
	if !ok || !strings.HasPrefix(cookieHeader, "Cookie: "+cookieName+"=") {
		t.Fatalf("unexpected cookieHeader %#v", payload["cookieHeader"])
	}
	if payload["bootstrapUrlPlain"] != "http://127.0.0.1:61234/__setta__/bootstrap" {
		t.Fatalf("unexpected bootstrapUrlPlain %#v", payload["bootstrapUrlPlain"])
	}
	fragment, ok := payload["bootstrapUrlFragment"].(string)
	if !ok || !strings.HasPrefix(fragment, "http://127.0.0.1:61234/__setta__/bootstrap#token=") {
		t.Fatalf("unexpected bootstrapUrlFragment %#v", payload["bootstrapUrlFragment"])
	}
	sessionPayload := payload["session"].(map[string]any)
	if sessionPayload["id"] != session.ID {
		t.Fatalf("expected session id %q, got %#v", session.ID, sessionPayload["id"])
	}
	if payload["source"] != "bootstrap" {
		t.Fatalf("expected source bootstrap, got %#v", payload["source"])
	}
}

func TestRunAuthJSONAcceptsWorkspaceShortAlias(t *testing.T) {
	t.Parallel()

	fixture := newCLIFixture(t)
	proc := fixture.startProcess(t, "setta.server:app")
	session := fixture.createSession(t, proc, 61234, time.Date(2026, time.March, 8, 12, 0, 0, 0, time.UTC), "ide")

	stdout, _, err := fixture.run("--setta-home", fixture.settaHome, "auth", "--json", "-w", fixture.workspaceRoot, "--session", session.ID)
	if err != nil {
		t.Fatalf("run auth --json with -w: %v", err)
	}
	var payload map[string]any
	if err := json.Unmarshal([]byte(strings.TrimSpace(stdout)), &payload); err != nil {
		t.Fatalf("decode auth payload: %v", err)
	}
	sessionPayload := payload["session"].(map[string]any)
	if sessionPayload["id"] != session.ID {
		t.Fatalf("expected session id %q, got %#v", session.ID, sessionPayload["id"])
	}
}

func TestRunAuthRejectsConflictingSessionAndLatestSelectors(t *testing.T) {
	t.Parallel()

	fixture := newCLIFixture(t)

	stdout, stderr, err := fixture.run("auth", "--session", "session-a", "--latest")
	if err == nil {
		t.Fatal("expected selector conflict")
	}
	if strings.TrimSpace(stdout) != "" {
		t.Fatalf("expected empty stdout, got %q", stdout)
	}
	if strings.TrimSpace(stderr) != "" {
		t.Fatalf("expected empty stderr, got %q", stderr)
	}
	if err.Error() != "use either --session or --latest, not both" {
		t.Fatalf("unexpected error %q", err.Error())
	}
}

func TestRunAuthLatestDefaultsToIDESessionAndNormalizesBaseURL(t *testing.T) {
	t.Parallel()

	fixture := newCLIFixture(t)
	ideProc := fixture.startProcess(t, "setta.server:app")
	ideSession := fixture.createSession(t, ideProc, 61234, time.Date(2026, time.March, 8, 12, 0, 0, 0, time.UTC), "ide")
	launcherProc := fixture.startProcess(t, "setta.server:app")
	fixture.createSession(t, launcherProc, 61235, time.Date(2026, time.March, 8, 12, 1, 0, 0, time.UTC), "launcher")

	stdout, _, err := fixture.run("--workspace", fixture.workspaceRoot, "--setta-home", fixture.settaHome, "auth", "--json", "--latest", "--base-url", "example.com:9999/api")
	if err != nil {
		t.Fatalf("run auth latest: %v", err)
	}
	var payload map[string]any
	if err := json.Unmarshal([]byte(strings.TrimSpace(stdout)), &payload); err != nil {
		t.Fatalf("decode auth payload: %v", err)
	}
	if payload["baseUrl"] != "http://example.com:9999" {
		t.Fatalf("unexpected normalized baseUrl %#v", payload["baseUrl"])
	}
	if payload["apiBaseUrl"] != "http://example.com:9999/api" {
		t.Fatalf("unexpected normalized apiBaseUrl %#v", payload["apiBaseUrl"])
	}
	sessionPayload := payload["session"].(map[string]any)
	if sessionPayload["id"] != ideSession.ID {
		t.Fatalf("expected ide session %q, got %#v", ideSession.ID, sessionPayload["id"])
	}
	if sessionPayload["serverMode"] != "ide" {
		t.Fatalf("expected ide serverMode, got %#v", sessionPayload["serverMode"])
	}
}

func TestRunToolsEmitsCatalog(t *testing.T) {
	t.Parallel()

	fixture := newCLIFixture(t)

	stdout, _, err := fixture.run("tools")
	if err != nil {
		t.Fatalf("run tools: %v", err)
	}

	var payload []map[string]any
	if err := json.Unmarshal([]byte(strings.TrimSpace(stdout)), &payload); err != nil {
		t.Fatalf("decode tools payload: %v", err)
	}
	expected, err := mcpx.BuildToolPayloads()
	if err != nil {
		t.Fatalf("build tool payloads: %v", err)
	}
	if len(payload) != len(expected) {
		t.Fatalf("expected %d tools, got %d", len(expected), len(payload))
	}
	if payload[0]["name"] != expected[0].Name {
		t.Fatalf("expected first tool %q, got %#v", expected[0].Name, payload[0]["name"])
	}
}

func TestRunAPIAutoAuthDefaultsToIDESession(t *testing.T) {
	t.Parallel()

	fixture := newCLIFixture(t)
	ideProc := fixture.startProcess(t, "setta.server:app")
	launcherProc := fixture.startProcess(t, "setta.server:app")
	captured := map[string]any{}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer r.Body.Close()
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatalf("read request body: %v", err)
		}
		captured["url"] = r.URL.String()
		captured["cookie"] = r.Header.Get("Cookie")
		captured["body"] = string(body)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer server.Close()

	fixture.createSessionForURL(t, ideProc, server.URL, time.Date(2026, time.March, 8, 12, 0, 0, 0, time.UTC), "ide")
	fixture.createSession(t, launcherProc, 61235, time.Date(2026, time.March, 8, 12, 1, 0, 0, time.UTC), "launcher")

	stdout, stderr, err := fixture.run("--workspace", fixture.workspaceRoot, "--setta-home", fixture.settaHome, "api", "getProjectConfigNamesAndIds", "--json-output")
	if err != nil {
		t.Fatalf("run api auto-auth: %v", err)
	}
	if strings.TrimSpace(stderr) != "" {
		t.Fatalf("expected empty stderr, got %q", stderr)
	}
	if strings.TrimSpace(stdout) != `{"ok":true}` {
		t.Fatalf("unexpected stdout %q", stdout)
	}
	if captured["url"] != httpapi.RouteMCPToolCall {
		t.Fatalf("expected request path %q, got %#v", httpapi.RouteMCPToolCall, captured["url"])
	}
	cookieHeader, ok := captured["cookie"].(string)
	if !ok || !strings.Contains(cookieHeader, "setta_auth_") {
		t.Fatalf("expected auth cookie header, got %#v", captured["cookie"])
	}
}

func TestRunAPIAutoAuthUsesLatestWorkspaceIDESession(t *testing.T) {
	t.Parallel()

	fixture := newCLIFixture(t)
	oldProc := fixture.startProcess(t, "setta.server:app")
	newProc := fixture.startProcess(t, "setta.server:app")

	oldServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"server":"old"}`))
	}))
	defer oldServer.Close()

	newServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"server":"new"}`))
	}))
	defer newServer.Close()

	fixture.createSessionForURL(t, oldProc, oldServer.URL, time.Date(2026, time.March, 8, 12, 0, 0, 0, time.UTC), "ide")
	fixture.createSessionForURL(t, newProc, newServer.URL, time.Date(2026, time.March, 8, 12, 2, 0, 0, time.UTC), "ide")

	stdout, stderr, err := fixture.run("--workspace", fixture.workspaceRoot, "--setta-home", fixture.settaHome, "api", "getProjectConfigNamesAndIds", "--json-output")
	if err != nil {
		t.Fatalf("run api auto-auth latest ide session: %v", err)
	}
	if strings.TrimSpace(stderr) != "" {
		t.Fatalf("expected empty stderr, got %q", stderr)
	}
	if strings.TrimSpace(stdout) != `{"server":"new"}` {
		t.Fatalf("expected latest ide session response, got %q", stdout)
	}
}

func TestRunAPIWithExplicitAuthAndPayloadFile(t *testing.T) {
	t.Parallel()

	fixture := newCLIFixture(t)
	captured := map[string]any{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer r.Body.Close()
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatalf("read request body: %v", err)
		}
		captured["cookie"] = r.Header.Get("Cookie")
		captured["project"] = r.Header.Get(mcpx.AgenticContextProjectConfigIDHeader)
		captured["chat"] = r.Header.Get(mcpx.AgenticContextChatIDHeader)
		captured["section"] = r.Header.Get(mcpx.AgenticContextSectionIDHeader)
		captured["body"] = string(body)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"isError":false}`))
	}))
	defer server.Close()

	authPath := filepath.Join(t.TempDir(), "auth.json")
	if err := os.WriteFile(authPath, []byte(`{"cookieHeader":"Cookie: session=value","baseUrl":"`+server.URL+`"}`), 0o644); err != nil {
		t.Fatalf("write auth payload: %v", err)
	}
	payloadPath := filepath.Join(t.TempDir(), "payload.json")
	if err := os.WriteFile(payloadPath, []byte(`{"ok":true}`), 0o644); err != nil {
		t.Fatalf("write payload file: %v", err)
	}

	stdout, stderr, err := fixture.run(
		"api",
		"getProjectConfigNamesAndIds",
		"--auth-json",
		authPath,
		"--file",
		payloadPath,
		"--agentic-project-config-id",
		"project-a",
		"--agentic-chat-id",
		"chat-a",
		"--agentic-section-id",
		"section-a",
		"--json-output",
	)
	if err != nil {
		t.Fatalf("run api explicit auth: %v", err)
	}
	if strings.TrimSpace(stderr) != "" {
		t.Fatalf("expected empty stderr, got %q", stderr)
	}
	if strings.TrimSpace(stdout) != `{"isError":false}` {
		t.Fatalf("unexpected stdout %q", stdout)
	}
	if captured["cookie"] != "session=value" {
		t.Fatalf("unexpected cookie header %#v", captured["cookie"])
	}
	if captured["project"] != "project-a" || captured["chat"] != "chat-a" || captured["section"] != "section-a" {
		t.Fatalf("unexpected agentic headers %#v", captured)
	}
	if captured["body"] != `{"arguments":{"ok":true},"tool":"getProjectConfigNamesAndIds"}` {
		t.Fatalf("unexpected request body %#v", captured["body"])
	}
}

func TestRunAPIWithExplicitAuthStdin(t *testing.T) {
	t.Parallel()

	fixture := newCLIFixture(t)
	captured := map[string]any{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer r.Body.Close()
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatalf("read request body: %v", err)
		}
		captured["cookie"] = r.Header.Get("Cookie")
		captured["body"] = string(body)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"via":"stdin"}`))
	}))
	defer server.Close()

	authPayload := `{"cookieHeader":"Cookie: session=stdin","baseUrl":"` + server.URL + `"}`
	stdout, stderr, err := fixture.runWithInput(
		authPayload,
		"api",
		"getProjectConfigNamesAndIds",
		"--auth-stdin",
		"--json-output",
	)
	if err != nil {
		t.Fatalf("run api explicit auth stdin: %v", err)
	}
	if strings.TrimSpace(stderr) != "" {
		t.Fatalf("expected empty stderr, got %q", stderr)
	}
	if strings.TrimSpace(stdout) != `{"via":"stdin"}` {
		t.Fatalf("unexpected stdout %q", stdout)
	}
	if captured["cookie"] != "session=stdin" {
		t.Fatalf("unexpected cookie header %#v", captured["cookie"])
	}
	if captured["body"] != `{"arguments":{},"tool":"getProjectConfigNamesAndIds"}` {
		t.Fatalf("unexpected request body %#v", captured["body"])
	}
}

func TestRunAPIRejectsRouteNameTool(t *testing.T) {
	t.Parallel()

	fixture := newCLIFixture(t)

	stdout, stderr, err := fixture.run("api", "getLatestProjectState", "--json-output")
	if err == nil {
		t.Fatal("expected route-name rejection")
	}
	if strings.TrimSpace(stderr) != "" {
		t.Fatalf("expected empty stderr, got %q", stderr)
	}
	var payload map[string]any
	if err := json.Unmarshal([]byte(strings.TrimSpace(stdout)), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload["error"] != "InputError" {
		t.Fatalf("unexpected error payload %#v", payload)
	}
	if !strings.Contains(payload["message"].(string), "bare MCP tool name") {
		t.Fatalf("unexpected message %#v", payload["message"])
	}
}

func TestRunAPIRejectsNamespacedAndPathToolNames(t *testing.T) {
	t.Parallel()

	fixture := newCLIFixture(t)
	testCases := []struct {
		name    string
		toolArg string
	}{
		{
			name:    "namespaced_tool_name",
			toolArg: "setta__getLatestProjectState",
		},
		{
			name:    "path_style_tool_name",
			toolArg: "/getLatestProjectState",
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			// These branches must fail before auth/session lookup so packaged callers
			// get the same deterministic bare-tool-name validation contract as source.
			stdout, stderr, err := fixture.run("api", testCase.toolArg, "--json-output")
			if err == nil {
				t.Fatal("expected tool-name rejection")
			}
			if strings.TrimSpace(stderr) != "" {
				t.Fatalf("expected empty stderr, got %q", stderr)
			}
			payload := decodeJSONPayload(t, stdout)
			if payload["error"] != "InputError" {
				t.Fatalf("unexpected error payload %#v", payload)
			}
			message, ok := payload["message"].(string)
			if !ok || !strings.Contains(message, "bare MCP tool name") {
				t.Fatalf("unexpected message %#v", payload["message"])
			}
		})
	}
}

func TestRunAPIRejectsUnknownToolWithoutExplicitAuth(t *testing.T) {
	t.Parallel()

	fixture := newCLIFixture(t)

	stdout, stderr, err := fixture.run("api", "unknownTool", "--json-output")
	if err == nil {
		t.Fatal("expected unknown-tool error")
	}
	if strings.TrimSpace(stderr) != "" {
		t.Fatalf("expected empty stderr, got %q", stderr)
	}
	var payload map[string]any
	if err := json.Unmarshal([]byte(strings.TrimSpace(stdout)), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload["error"] != "InputError" {
		t.Fatalf("unexpected error payload %#v", payload)
	}
	if !strings.Contains(payload["message"].(string), "Provide auth") {
		t.Fatalf("unexpected message %#v", payload["message"])
	}
}

func TestRunAPIUnknownToolWithExplicitAuthUsesDedicatedJSONContract(t *testing.T) {
	t.Parallel()

	fixture := newCLIFixture(t)
	authPath := filepath.Join(t.TempDir(), "auth.json")
	if err := os.WriteFile(authPath, []byte(`{"cookieHeader":"Cookie: session=value","baseUrl":"http://127.0.0.1:8000"}`), 0o644); err != nil {
		t.Fatalf("write auth payload: %v", err)
	}

	// Once auth is explicit, unknown tools should use the dedicated packaged-CLI
	// error payload instead of the missing-auth InputError contract.
	stdout, stderr, err := fixture.run("api", "unknownTool", "--auth-json", authPath, "--json-output")
	if err == nil {
		t.Fatal("expected unknown-tool error")
	}
	if strings.TrimSpace(stderr) != "" {
		t.Fatalf("expected empty stderr, got %q", stderr)
	}
	payload := decodeJSONPayload(t, stdout)
	if payload["error"] != "UnknownTool" {
		t.Fatalf("unexpected error payload %#v", payload)
	}
	if payload["tool"] != "unknownTool" {
		t.Fatalf("unexpected unknown tool payload %#v", payload)
	}
}

func TestRunAPIExplicitCookieAuthTakesPriorityAndUsesSessionBaseURLFallback(t *testing.T) {
	t.Parallel()

	fixture := newCLIFixture(t)
	proc := fixture.startProcess(t, "setta.server:app")
	sessionServerCalls := 0
	authServerCalls := 0
	capturedCookie := ""
	sessionServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sessionServerCalls++
		capturedCookie = r.Header.Get("Cookie")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"server":"session"}`))
	}))
	defer sessionServer.Close()
	authServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authServerCalls++
		t.Fatalf("explicit auth-json base URL should not be used when cookie auth falls back to the selected session base URL")
	}))
	defer authServer.Close()

	fixture.createSessionForURL(t, proc, sessionServer.URL, time.Date(2026, time.March, 8, 12, 0, 0, 0, time.UTC), "ide")
	authPath := filepath.Join(t.TempDir(), "auth.json")
	if err := os.WriteFile(authPath, []byte(`{"cookieHeader":"Cookie: session=auth-json","baseUrl":"`+authServer.URL+`"}`), 0o644); err != nil {
		t.Fatalf("write auth payload: %v", err)
	}

	// Explicit cookie auth should win over lower-priority auth JSON, while the
	// selected session still supplies the default base URL when callers omit it.
	stdout, stderr, err := fixture.run(
		"--workspace",
		fixture.workspaceRoot,
		"--setta-home",
		fixture.settaHome,
		"api",
		"getProjectConfigNamesAndIds",
		"--cookie-header",
		"Cookie: session=explicit-cookie",
		"--auth-json",
		authPath,
		"--json-output",
	)
	if err != nil {
		t.Fatalf("run api explicit cookie precedence: %v", err)
	}
	if strings.TrimSpace(stderr) != "" {
		t.Fatalf("expected empty stderr, got %q", stderr)
	}
	if strings.TrimSpace(stdout) != `{"server":"session"}` {
		t.Fatalf("unexpected stdout %q", stdout)
	}
	if sessionServerCalls != 1 {
		t.Fatalf("expected one session-server request, got %d", sessionServerCalls)
	}
	if authServerCalls != 0 {
		t.Fatalf("expected no auth-server requests, got %d", authServerCalls)
	}
	if capturedCookie != "session=explicit-cookie" {
		t.Fatalf("unexpected cookie header %q", capturedCookie)
	}
}

func TestRunAPIWithExplicitCookieValueUsesSelectedSessionBaseURL(t *testing.T) {
	t.Parallel()

	fixture := newCLIFixture(t)
	proc := fixture.startProcess(t, "setta.server:app")
	captured := map[string]any{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer r.Body.Close()
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatalf("read request body: %v", err)
		}
		captured["cookie"] = r.Header.Get("Cookie")
		captured["project"] = r.Header.Get(mcpx.AgenticContextProjectConfigIDHeader)
		captured["body"] = string(body)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"isError":false}`))
	}))
	defer server.Close()

	fixture.createSessionForURL(t, proc, server.URL, time.Date(2026, time.March, 8, 12, 0, 0, 0, time.UTC), "ide")

	stdout, stderr, err := fixture.run(
		"--workspace",
		fixture.workspaceRoot,
		"--setta-home",
		fixture.settaHome,
		"api",
		"getProjectConfigNamesAndIds",
		"--cookie",
		"session=explicit-cookie",
		"--agentic-project-config-id",
		"project-a",
		"--json-output",
	)
	if err != nil {
		t.Fatalf("run api with explicit cookie value: %v", err)
	}
	if strings.TrimSpace(stderr) != "" {
		t.Fatalf("expected empty stderr, got %q", stderr)
	}
	if strings.TrimSpace(stdout) != `{"isError":false}` {
		t.Fatalf("unexpected stdout %q", stdout)
	}
	if captured["cookie"] != "session=explicit-cookie" {
		t.Fatalf("unexpected cookie header %#v", captured["cookie"])
	}
	if captured["project"] != "project-a" {
		t.Fatalf("unexpected project header %#v", captured["project"])
	}
	if captured["body"] != `{"arguments":{},"tool":"getProjectConfigNamesAndIds"}` {
		t.Fatalf("unexpected request body %#v", captured["body"])
	}
}

func TestRunAPIHTTPErrorJSONContract(t *testing.T) {
	t.Parallel()

	fixture := newCLIFixture(t)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte(`{"detail":"Unknown tool"}`))
	}))
	defer server.Close()

	authPath := filepath.Join(t.TempDir(), "auth.json")
	if err := os.WriteFile(authPath, []byte(`{"cookieHeader":"Cookie: session=value","baseUrl":"`+server.URL+`"}`), 0o644); err != nil {
		t.Fatalf("write auth payload: %v", err)
	}

	stdout, stderr, err := fixture.run("api", "getProjectConfigNamesAndIds", "--auth-json", authPath, "--json-output")
	if err == nil {
		t.Fatal("expected HTTP error")
	}
	if strings.TrimSpace(stderr) != "" {
		t.Fatalf("expected empty stderr, got %q", stderr)
	}
	var payload map[string]any
	if err := json.Unmarshal([]byte(strings.TrimSpace(stdout)), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload["error"] != "HTTPError" {
		t.Fatalf("unexpected error payload %#v", payload)
	}
	if payload["status"] != float64(http.StatusNotFound) {
		t.Fatalf("unexpected status %#v", payload["status"])
	}
}

func TestRunAPIRequestErrorJSONContract(t *testing.T) {
	t.Parallel()

	fixture := newCLIFixture(t)
	stdout, stderr, err := fixture.run(
		"api",
		"getProjectConfigNamesAndIds",
		"--cookie-header",
		"Cookie: session=value",
		"--base-url",
		"http://127.0.0.1:1",
		"--json-output",
	)
	if err == nil {
		t.Fatal("expected request error")
	}
	if strings.TrimSpace(stderr) != "" {
		t.Fatalf("expected empty stderr, got %q", stderr)
	}
	var payload map[string]any
	if err := json.Unmarshal([]byte(strings.TrimSpace(stdout)), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload["error"] != "RequestError" {
		t.Fatalf("unexpected error payload %#v", payload)
	}
}

func TestRunAPIAutoAuthMissingSessionsReturnsInputError(t *testing.T) {
	t.Parallel()

	fixture := newCLIFixture(t)

	stdout, stderr, err := fixture.run("api", "getProjectConfigNamesAndIds", "--json-output")
	if err == nil {
		t.Fatal("expected missing-session auto-auth error")
	}
	if strings.TrimSpace(stderr) != "" {
		t.Fatalf("expected empty stderr, got %q", stderr)
	}
	payload := decodeJSONPayload(t, stdout)
	if payload["error"] != "InputError" {
		t.Fatalf("unexpected error payload %#v", payload)
	}
	message, ok := payload["message"].(string)
	if !ok || !strings.Contains(message, "no matching Setta sessions found") {
		t.Fatalf("unexpected message %#v", payload["message"])
	}
}

func TestRunAPIValidationRejectsInvalidInputShapesAndIncompleteExplicitAuth(t *testing.T) {
	t.Parallel()

	fixture := newCLIFixture(t)

	testCases := []struct {
		name                 string
		input                string
		args                 []string
		writePayloadFile     string
		writeAuthFile        string
		wantMessageSubstring string
	}{
		{
			name:                 "conflicting_stdin_sources",
			input:                `{}`,
			args:                 []string{"api", "getProjectConfigNamesAndIds", "--stdin", "--auth-stdin", "--json-output"},
			wantMessageSubstring: "use --auth-stdin or --stdin, not both",
		},
		{
			name:                 "multiple_payload_sources",
			args:                 []string{"api", "getProjectConfigNamesAndIds", "--json", `{}`, "--file", "__PAYLOAD__", "--json-output"},
			writePayloadFile:     `{}`,
			wantMessageSubstring: "use only one of --json, --stdin, or --file",
		},
		{
			name:                 "malformed_inline_payload",
			args:                 []string{"api", "getProjectConfigNamesAndIds", "--json", `invalid`, "--json-output"},
			wantMessageSubstring: "invalid payload JSON",
		},
		{
			name:                 "malformed_stdin_payload",
			input:                `invalid`,
			args:                 []string{"api", "getProjectConfigNamesAndIds", "--stdin", "--json-output"},
			wantMessageSubstring: "invalid payload JSON",
		},
		{
			name:                 "malformed_file_payload",
			args:                 []string{"api", "getProjectConfigNamesAndIds", "--file", "__PAYLOAD__", "--json-output"},
			writePayloadFile:     `invalid`,
			wantMessageSubstring: "invalid payload JSON",
		},
		{
			name:                 "non_object_payload",
			args:                 []string{"api", "getProjectConfigNamesAndIds", "--json", `[]`, "--json-output"},
			wantMessageSubstring: "tool arguments must be a JSON object",
		},
		{
			name:                 "malformed_auth_json_file",
			args:                 []string{"api", "getProjectConfigNamesAndIds", "--auth-json", "__AUTH__", "--json-output"},
			writeAuthFile:        `invalid`,
			wantMessageSubstring: "invalid auth JSON",
		},
		{
			name:                 "non_object_auth_json_file",
			args:                 []string{"api", "getProjectConfigNamesAndIds", "--auth-json", "__AUTH__", "--json-output"},
			writeAuthFile:        `[]`,
			wantMessageSubstring: "auth JSON must be an object",
		},
		{
			name:                 "non_object_auth_json",
			input:                `[]`,
			args:                 []string{"api", "getProjectConfigNamesAndIds", "--auth-stdin", "--json-output"},
			wantMessageSubstring: "auth JSON must be an object",
		},
		{
			name:                 "malformed_auth_json_stdin",
			input:                `invalid`,
			args:                 []string{"api", "getProjectConfigNamesAndIds", "--auth-stdin", "--json", `{}`, "--json-output"},
			wantMessageSubstring: "invalid auth JSON",
		},
		{
			name:                 "non_object_auth_json_stdin_with_payload",
			input:                `[]`,
			args:                 []string{"api", "getProjectConfigNamesAndIds", "--auth-stdin", "--json", `{}`, "--json-output"},
			wantMessageSubstring: "auth JSON must be an object",
		},
		{
			name:                 "malformed_cookie_value",
			args:                 []string{"api", "getProjectConfigNamesAndIds", "--cookie", "raw-cookie", "--base-url", "http://127.0.0.1:8000", "--json-output"},
			wantMessageSubstring: "cookie must be provided in name=value form",
		},
		{
			name:                 "auth_json_missing_cookie_fields",
			args:                 []string{"api", "getProjectConfigNamesAndIds", "--auth-json", "__AUTH__", "--json-output"},
			writeAuthFile:        `{"baseUrl":"http://127.0.0.1:8000"}`,
			wantMessageSubstring: "auth JSON missing cookieHeader/cookie fields",
		},
		{
			name:                 "cookie_without_base_url_or_session_fails_closed",
			args:                 []string{"api", "getProjectConfigNamesAndIds", "--cookie-header", "Cookie: session=value", "--json-output"},
			wantMessageSubstring: "no matching Setta sessions found",
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			args := append([]string(nil), testCase.args...)
			if testCase.writePayloadFile != "" {
				payloadPath := filepath.Join(t.TempDir(), "payload.json")
				if err := os.WriteFile(payloadPath, []byte(testCase.writePayloadFile), 0o644); err != nil {
					t.Fatalf("write payload file: %v", err)
				}
				for i, arg := range args {
					if arg == "__PAYLOAD__" {
						args[i] = payloadPath
					}
				}
			}
			if testCase.writeAuthFile != "" {
				authPath := filepath.Join(t.TempDir(), "auth.json")
				if err := os.WriteFile(authPath, []byte(testCase.writeAuthFile), 0o644); err != nil {
					t.Fatalf("write auth file: %v", err)
				}
				for i, arg := range args {
					if arg == "__AUTH__" {
						args[i] = authPath
					}
				}
			}

			stdout, stderr, err := fixture.runWithInput(testCase.input, args...)
			if err == nil {
				t.Fatal("expected input validation error")
			}
			if strings.TrimSpace(stderr) != "" {
				t.Fatalf("expected empty stderr, got %q", stderr)
			}
			payload := decodeJSONPayload(t, stdout)
			if payload["error"] != "InputError" {
				t.Fatalf("unexpected error payload %#v", payload)
			}
			message, ok := payload["message"].(string)
			if !ok || !strings.Contains(message, testCase.wantMessageSubstring) {
				t.Fatalf("expected message containing %q, got %#v", testCase.wantMessageSubstring, payload["message"])
			}
		})
	}
}

type cliFixture struct {
	workspaceRoot  string
	settaHome      string
	runtimeRoot    string
	settaFilesRoot string
	registry       *localsessions.Registry
	processes      []*exec.Cmd
}

func newCLIFixture(t *testing.T) *cliFixture {
	t.Helper()

	root := t.TempDir()
	workspaceRoot := filepath.Join(root, "workspace")
	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		t.Fatalf("mkdir workspace root: %v", err)
	}
	settaHome := filepath.Join(root, ".setta-development")
	if err := os.MkdirAll(filepath.Join(settaHome, "setta_files"), 0o755); err != nil {
		t.Fatalf("mkdir setta home: %v", err)
	}
	settaFilesRoot := filepath.Join(workspaceRoot, "setta_files")
	runtimeRoot := filepath.Join(settaFilesRoot, "runtime")
	registry, err := localsessions.NewRegistry(localsessions.RegistryOptions{
		SessionsRoot: filepath.Join(runtimeRoot, "sessions"),
	})
	if err != nil {
		t.Fatalf("new registry: %v", err)
	}

	fixture := &cliFixture{
		workspaceRoot:  workspaceRoot,
		settaHome:      settaHome,
		runtimeRoot:    runtimeRoot,
		settaFilesRoot: settaFilesRoot,
		registry:       registry,
	}
	t.Cleanup(func() {
		for _, proc := range fixture.processes {
			if proc.Process == nil {
				continue
			}
			_ = proc.Process.Kill()
			_, _ = proc.Process.Wait()
		}
	})
	return fixture
}

func (f *cliFixture) startProcess(t *testing.T, marker string) *exec.Cmd {
	t.Helper()

	command := exec.Command(os.Args[0], "-test.run=TestSettacliHelperProcess", "--", marker)
	command.Env = append(os.Environ(), "GO_WANT_SETTACLI_HELPER=1")
	command.Stdout = io.Discard
	command.Stderr = io.Discard
	if err := command.Start(); err != nil {
		t.Fatalf("start helper process: %v", err)
	}
	time.Sleep(50 * time.Millisecond)
	f.processes = append(f.processes, command)
	return command
}

func (f *cliFixture) createSession(t *testing.T, proc *exec.Cmd, port int, startedAt time.Time, serverMode string) auth.SessionMetadata {
	t.Helper()

	if proc == nil || proc.Process == nil {
		t.Fatal("process is required")
	}
	return f.createSessionWithHost(t, proc, "127.0.0.1", port, startedAt, serverMode)
}

func (f *cliFixture) createSessionForURL(t *testing.T, proc *exec.Cmd, serverURL string, startedAt time.Time, serverMode string) auth.SessionMetadata {
	t.Helper()

	parsed, err := url.Parse(serverURL)
	if err != nil {
		t.Fatalf("parse server url: %v", err)
	}
	host, portString, err := net.SplitHostPort(parsed.Host)
	if err != nil {
		t.Fatalf("split server host: %v", err)
	}
	port, err := net.LookupPort("tcp", portString)
	if err != nil {
		t.Fatalf("parse server port: %v", err)
	}
	return f.createSessionWithHost(t, proc, host, port, startedAt, serverMode)
}

func (f *cliFixture) createSessionWithHost(t *testing.T, proc *exec.Cmd, host string, port int, startedAt time.Time, serverMode string) auth.SessionMetadata {
	t.Helper()

	if proc == nil || proc.Process == nil {
		t.Fatal("process is required")
	}
	metadata, err := f.registry.CreateSession(localsessions.CreateSessionInput{
		WorkspaceRoot:      f.workspaceRoot,
		Host:               host,
		Port:               port,
		PID:                proc.Process.Pid,
		SettaFilesLocation: "local",
		SettaFilesRoot:     f.settaFilesRoot,
		RuntimeRoot:        f.runtimeRoot,
		SettaHome:          f.settaHome,
		ServerMode:         serverMode,
	})
	if err != nil {
		t.Fatalf("create session: %v", err)
	}
	metadata.StartedAt = startedAt.UTC()
	if err := rewriteSessionMetadata(metadata); err != nil {
		t.Fatalf("rewrite session metadata: %v", err)
	}
	return metadata
}

func (f *cliFixture) run(args ...string) (string, string, error) {
	return f.runWithInputFromCWD("", f.workspaceRoot, args...)
}

func (f *cliFixture) runWithInput(input string, args ...string) (string, string, error) {
	return f.runWithInputFromCWD(input, f.workspaceRoot, args...)
}

func (f *cliFixture) runFromCWD(cwd string, args ...string) (string, string, error) {
	return f.runWithInputFromCWD("", cwd, args...)
}

func (f *cliFixture) runWithInputFromCWD(input string, cwd string, args ...string) (string, string, error) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	err := Run(args, RunOptions{
		Stdout:    &stdout,
		Stderr:    &stderr,
		Stdin:     strings.NewReader(input),
		CWD:       cwd,
		EnvLookup: func(string) (string, bool) { return "", false },
		Now:       func() time.Time { return time.Date(2026, time.March, 8, 12, 30, 0, 0, time.UTC) },
	})
	return stdout.String(), stderr.String(), err
}

func rewriteSessionMetadata(metadata auth.SessionMetadata) error {
	path := filepath.Join(filepath.Dir(metadata.SecretPath), "session.json")
	payload, err := json.MarshalIndent(metadata, "", "  ")
	if err != nil {
		return err
	}
	payload = append(payload, '\n')
	return os.WriteFile(path, payload, 0o644)
}

func decodeConnectInfoJSON(t *testing.T, raw string) map[string]any {
	t.Helper()

	line := strings.TrimSpace(raw)
	if !strings.HasPrefix(line, connectInfoJSONPrefix) {
		t.Fatalf("expected %q prefix, got %q", connectInfoJSONPrefix, line)
	}
	decoded, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(line, connectInfoJSONPrefix))
	if err != nil {
		t.Fatalf("decode base64 payload: %v", err)
	}
	var payload map[string]any
	if err := json.Unmarshal(decoded, &payload); err != nil {
		t.Fatalf("decode json payload: %v", err)
	}
	return payload
}

func decodeJSONPayload(t *testing.T, raw string) map[string]any {
	t.Helper()

	var payload map[string]any
	if err := json.Unmarshal([]byte(strings.TrimSpace(raw)), &payload); err != nil {
		t.Fatalf("decode json payload: %v", err)
	}
	return payload
}
