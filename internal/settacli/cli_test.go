package settacli

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"io"
	"net"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"setta/internal/auth"
	"setta/internal/frontendorigins"
	"setta/internal/localsessions"
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

func TestRunStatusConnectInfoLatestSelectsNewest(t *testing.T) {
	t.Parallel()

	fixture := newCLIFixture(t)
	olderProc := fixture.startProcess(t, "setta.server:app")
	_ = fixture.createSession(t, olderProc, 61234, time.Date(2026, time.March, 8, 12, 0, 0, 0, time.UTC), "ide")
	newerProc := fixture.startProcess(t, "setta.server:app")
	newerSession := fixture.createSession(t, newerProc, 61235, time.Date(2026, time.March, 8, 12, 5, 0, 0, time.UTC), "ide")

	// --latest must pick the newest matching session, not the first one written.
	stdout, _, err := fixture.run(
		"--workspace",
		fixture.workspaceRoot,
		"--setta-home",
		fixture.settaHome,
		"status",
		"--connect-info",
		"--json",
		"--latest",
	)
	if err != nil {
		t.Fatalf("run latest status: %v", err)
	}
	payload := decodeConnectInfoJSON(t, stdout)
	sessionPayload := payload["session"].(map[string]any)
	if sessionPayload["id"] != newerSession.ID {
		t.Fatalf("expected newest session %q, got %#v", newerSession.ID, sessionPayload["id"])
	}
	if sessionPayload["port"] != float64(61235) {
		t.Fatalf("expected newest session port 61235, got %#v", sessionPayload["port"])
	}
	if sessionPayload["startedAt"] != newerSession.StartedAt.Format(time.RFC3339) {
		t.Fatalf("expected startedAt %q, got %#v", newerSession.StartedAt.Format(time.RFC3339), sessionPayload["startedAt"])
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

func TestRunStatusDeleteSessionRejectsInvalidServerMode(t *testing.T) {
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
		"--server-mode",
		"share",
	)
	if err == nil {
		t.Fatal("expected invalid server-mode error")
	}
	if strings.TrimSpace(stdout) != "" {
		t.Fatalf("expected empty stdout, got %q", stdout)
	}
	if strings.TrimSpace(stderr) != "" {
		t.Fatalf("expected empty stderr, got %q", stderr)
	}
	if err.Error() != `invalid --server-mode "share"` {
		t.Fatalf("unexpected error %q", err.Error())
	}
}

func TestSettaCLIDocsDescribeStatusAndStopServerModeSemantics(t *testing.T) {
	t.Parallel()

	docsPath := filepath.Join(testRepoRootForSettacli(t), "docs", "reference", "setta-cli-commands.md")
	content, err := os.ReadFile(docsPath)
	if err != nil {
		t.Fatalf("read CLI docs: %v", err)
	}
	docsContent := string(content)

	// Status docs must keep the default IDE-mode connect-info behavior explicit.
	if !strings.Contains(
		docsContent,
		"--server-mode ide|launcher` filters by mode. For `--connect-info`, default mode is `ide` unless explicitly overridden.",
	) {
		t.Fatalf("expected status server-mode docs in %q", docsPath)
	}
	// Stop docs must keep the default IDE-mode cleanup scope explicit too.
	if !strings.Contains(
		docsContent,
		"--server-mode ide|launcher` selects stop targets by mode (default: `ide`).",
	) {
		t.Fatalf("expected stop server-mode docs in %q", docsPath)
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
