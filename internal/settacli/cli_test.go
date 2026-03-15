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
	return f.runWithInput("", args...)
}

func (f *cliFixture) runWithInput(input string, args ...string) (string, string, error) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	err := Run(args, RunOptions{
		Stdout:    &stdout,
		Stderr:    &stderr,
		Stdin:     strings.NewReader(input),
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
