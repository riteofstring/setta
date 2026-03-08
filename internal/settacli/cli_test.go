package settacli

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"setta/internal/auth"
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
	metadata, err := f.registry.CreateSession(localsessions.CreateSessionInput{
		WorkspaceRoot:      f.workspaceRoot,
		Host:               "127.0.0.1",
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
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	err := Run(args, RunOptions{
		Stdout:    &stdout,
		Stderr:    &stderr,
		CWD:       f.workspaceRoot,
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
