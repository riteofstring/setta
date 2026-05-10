package settacli

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"setta/internal/httpapi"
	"setta/internal/mcpx"
)

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

func TestBuildSSHTunnelCommandNormalizesWildcardAndIPv6Hosts(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		host string
		port int
		want string
	}{
		{
			host: "0.0.0.0",
			port: 61234,
			want: "ssh -N -L ${LOCAL_PORT}:127.0.0.1:61234 <user@host> -o ExitOnForwardFailure=yes",
		},
		{
			host: "::",
			port: 61234,
			want: "ssh -N -L ${LOCAL_PORT}:[::1]:61234 <user@host> -o ExitOnForwardFailure=yes",
		},
		{
			host: "2001:db8::1",
			port: 61235,
			want: "ssh -N -L ${LOCAL_PORT}:[2001:db8::1]:61235 <user@host> -o ExitOnForwardFailure=yes",
		},
		{
			host: "[2001:db8::2]",
			port: 61235,
			want: "ssh -N -L ${LOCAL_PORT}:[2001:db8::2]:61235 <user@host> -o ExitOnForwardFailure=yes",
		},
	}

	for _, testCase := range testCases {
		if got := buildSSHTunnelCommand(testCase.host, testCase.port); got != testCase.want {
			t.Fatalf("buildSSHTunnelCommand(%q, %d) = %q, want %q", testCase.host, testCase.port, got, testCase.want)
		}
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
