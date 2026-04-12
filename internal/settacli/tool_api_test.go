package settacli

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"setta/internal/auth"
	"setta/internal/httpapi"
	"setta/internal/mcpx"
	"setta/internal/sshx"
)

func mustAPIToolName(t *testing.T) string {
	t.Helper()

	payloads, err := mcpx.BuildToolPayloads()
	if err != nil {
		t.Fatalf("build tool payloads: %v", err)
	}
	if len(payloads) == 0 {
		t.Fatal("expected at least one tool payload")
	}
	return payloads[0].Name
}

func decodeAPIToolJSONOutput(t *testing.T, stdout *bytes.Buffer) map[string]any {
	t.Helper()

	var payload map[string]any
	if err := json.Unmarshal(stdout.Bytes(), &payload); err != nil {
		t.Fatalf("decode api tool json output: %v", err)
	}
	return payload
}

func TestParseAPIInvocationSupportsToolBeforeOrAfterFlags(t *testing.T) {
	t.Parallel()

	for _, testCase := range []struct {
		name string
		args []string
	}{
		{
			name: "tool before flags",
			args: []string{"testTool", "--json-output", "--base-url", "http://localhost:8000"},
		},
		{
			name: "tool after flags",
			args: []string{"--json-output", "--base-url", "http://localhost:8000", "testTool"},
		},
	} {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			invocation, err := parseAPIInvocation(testCase.args, &bytes.Buffer{})
			if err != nil {
				t.Fatalf("parse api invocation: %v", err)
			}
			if invocation.toolName != "testTool" {
				t.Fatalf("unexpected tool name %q", invocation.toolName)
			}
			if !invocation.flags.jsonOutput {
				t.Fatal("expected json output flag to be set")
			}
			if invocation.flags.baseURL != "http://localhost:8000" {
				t.Fatalf("unexpected base url %q", invocation.flags.baseURL)
			}
		})
	}
}

func TestEmitAPIToolResultRequestErrorJSON(t *testing.T) {
	t.Parallel()

	requestErr := errors.New("dial tcp timeout")
	var stdout bytes.Buffer
	err := emitAPIToolResult(&stdout, true, "testTool", 0, nil, requestErr)

	var exitErr *ExitError
	if !errors.As(err, &exitErr) {
		t.Fatalf("expected exit error, got %v", err)
	}
	if exitErr.Code != 1 || !exitErr.Silent || !errors.Is(exitErr.Err, requestErr) {
		t.Fatalf("unexpected exit error %#v", exitErr)
	}

	payload := decodeAPIToolJSONOutput(t, &stdout)
	if payload["error"] != "RequestError" || payload["message"] != requestErr.Error() || payload["tool"] != "testTool" {
		t.Fatalf("unexpected request error payload %#v", payload)
	}
}

func TestEmitAPIToolResultHTTPErrorJSON(t *testing.T) {
	t.Parallel()

	var stdout bytes.Buffer
	err := emitAPIToolResult(&stdout, true, "testTool", http.StatusBadRequest, []byte(`{"reason":"bad input"}`), nil)

	var exitErr *ExitError
	if !errors.As(err, &exitErr) {
		t.Fatalf("expected exit error, got %v", err)
	}
	if exitErr.Code != 1 || !exitErr.Silent {
		t.Fatalf("unexpected exit error %#v", exitErr)
	}

	payload := decodeAPIToolJSONOutput(t, &stdout)
	if payload["error"] != "HTTPError" || payload["tool"] != "testTool" {
		t.Fatalf("unexpected http error payload %#v", payload)
	}
	status, ok := payload["status"].(float64)
	if !ok || status != http.StatusBadRequest {
		t.Fatalf("unexpected http status payload %#v", payload)
	}
	body, ok := payload["body"].(map[string]any)
	if !ok || body["reason"] != "bad input" {
		t.Fatalf("unexpected http error body %#v", payload)
	}
}

func TestEmitAPIToolResultJSONOutputHandlesEmptyAndRawBodies(t *testing.T) {
	t.Parallel()

	t.Run("empty body", func(t *testing.T) {
		t.Parallel()

		var stdout bytes.Buffer
		if err := emitAPIToolResult(&stdout, true, "testTool", http.StatusOK, nil, nil); err != nil {
			t.Fatalf("emit empty body: %v", err)
		}
		if stdout.String() != "null\n" {
			t.Fatalf("unexpected empty body output %q", stdout.String())
		}
	})

	t.Run("raw body", func(t *testing.T) {
		t.Parallel()

		var stdout bytes.Buffer
		if err := emitAPIToolResult(&stdout, true, "testTool", http.StatusOK, []byte("plain text"), nil); err != nil {
			t.Fatalf("emit raw body: %v", err)
		}
		payload := decodeAPIToolJSONOutput(t, &stdout)
		if payload["raw"] != "plain text" {
			t.Fatalf("unexpected raw body payload %#v", payload)
		}
	})
}

func TestEmitAPIToolResultPrettyPrintsDecodedJSONWithoutJSONOutput(t *testing.T) {
	t.Parallel()

	var stdout bytes.Buffer
	if err := emitAPIToolResult(&stdout, false, "testTool", http.StatusOK, []byte(`{"beta":2,"alpha":1}`), nil); err != nil {
		t.Fatalf("emit decoded json: %v", err)
	}
	if stdout.String() != "{\n  \"alpha\": 1,\n  \"beta\": 2\n}\n" {
		t.Fatalf("unexpected pretty output %q", stdout.String())
	}
}

func TestRunAPIInvokesToolEndpointWithExplicitAuth(t *testing.T) {
	t.Parallel()

	toolName := mustAPIToolName(t)
	captured := struct {
		toolName  string
		arguments map[string]any
		cookie    string
		projectID string
		chatID    string
		sectionID string
	}{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != httpapi.RouteMCPToolCall {
			http.Error(w, "unexpected path", http.StatusBadRequest)
			return
		}
		captured.cookie = r.Header.Get("Cookie")
		captured.projectID = r.Header.Get(mcpx.AgenticContextProjectConfigIDHeader)
		captured.chatID = r.Header.Get(mcpx.AgenticContextChatIDHeader)
		captured.sectionID = r.Header.Get(mcpx.AgenticContextSectionIDHeader)

		var payload struct {
			Tool      string         `json:"tool"`
			Arguments map[string]any `json:"arguments"`
		}
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		captured.toolName = payload.Tool
		captured.arguments = payload.Arguments

		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(map[string]any{"ok": true}); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
	}))
	defer server.Close()

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	err := runAPI(
		[]string{
			toolName,
			"--cookie-header", "Cookie: settaAuth=abc123",
			"--base-url", server.URL + "/api",
			"--json", `{"count":2}`,
			"--json-output",
			"--agentic-project-config-id", "project-1",
			"--agentic-chat-id", "chat-2",
			"--agentic-section-id", "section-3",
		},
		globalFlags{},
		&stdout,
		&stderr,
		strings.NewReader(""),
		os.LookupEnv,
		time.Now,
		t.TempDir(),
	)
	if err != nil {
		t.Fatalf("run api: %v", err)
	}
	if captured.toolName != toolName {
		t.Fatalf("unexpected tool name %q", captured.toolName)
	}
	if captured.cookie != "settaAuth=abc123" {
		t.Fatalf("unexpected cookie header %q", captured.cookie)
	}
	if captured.projectID != "project-1" || captured.chatID != "chat-2" || captured.sectionID != "section-3" {
		t.Fatalf("unexpected agentic headers %#v", captured)
	}
	count, ok := captured.arguments["count"].(float64)
	if !ok || count != 2 {
		t.Fatalf("unexpected arguments %#v", captured.arguments)
	}
	if stdout.String() != "{\"ok\":true}\n" {
		t.Fatalf("unexpected stdout %q", stdout.String())
	}
	if stderr.Len() != 0 {
		t.Fatalf("expected empty stderr, got %q", stderr.String())
	}
}

func TestRunAPIConflictingStdinModesReturnJSONInputError(t *testing.T) {
	t.Parallel()

	var stdout bytes.Buffer
	err := runAPI(
		[]string{mustAPIToolName(t), "--stdin", "--auth-stdin", "--json-output"},
		globalFlags{},
		&stdout,
		&bytes.Buffer{},
		strings.NewReader("{}"),
		os.LookupEnv,
		time.Now,
		t.TempDir(),
	)
	var exitErr *ExitError
	if !errors.As(err, &exitErr) {
		t.Fatalf("expected exit error, got %v", err)
	}

	var payload map[string]any
	if err := json.Unmarshal(stdout.Bytes(), &payload); err != nil {
		t.Fatalf("decode json output: %v", err)
	}
	if payload["error"] != "InputError" {
		t.Fatalf("unexpected error payload %#v", payload)
	}
	if payload["message"] != "use --auth-stdin or --stdin, not both" {
		t.Fatalf("unexpected message %#v", payload)
	}
}

func TestNormalizeBaseURLStripsAPIAddsSchemeAndRejectsEmpty(t *testing.T) {
	t.Parallel()

	normalized, err := normalizeBaseURL("example.com:1234/api")
	if err != nil {
		t.Fatalf("normalize base url with api suffix: %v", err)
	}
	if normalized != "http://example.com:1234" {
		t.Fatalf("expected stripped api suffix, got %q", normalized)
	}

	normalized, err = normalizeBaseURL("localhost:8000")
	if err != nil {
		t.Fatalf("normalize base url without scheme: %v", err)
	}
	if normalized != "http://localhost:8000" {
		t.Fatalf("expected http scheme to be added, got %q", normalized)
	}

	if _, err := normalizeBaseURL("   "); err == nil {
		t.Fatal("expected empty base url to fail")
	}
}

func TestBuildToolCallURLUsesToolsCallRoute(t *testing.T) {
	t.Parallel()

	requestURL, err := buildToolCallURL("example.com:1234/api/")
	if err != nil {
		t.Fatalf("build tool call url: %v", err)
	}
	if requestURL != "http://example.com:1234"+httpapi.RouteMCPToolCall {
		t.Fatalf("unexpected tool call url %q", requestURL)
	}
}

func TestLoadJSONPayloadSupportsInlineFileAndStdinAndRejectsMultipleSources(t *testing.T) {
	t.Parallel()

	payload, err := loadJSONPayload(`{"a":1}`, false, "", strings.NewReader(""))
	if err != nil {
		t.Fatalf("load inline json payload: %v", err)
	}
	inlineObject, ok := payload.(map[string]any)
	if !ok || inlineObject["a"] != float64(1) {
		t.Fatalf("unexpected inline payload %#v", payload)
	}

	payloadPath := filepath.Join(t.TempDir(), "payload.json")
	if err := os.WriteFile(payloadPath, []byte(`{"ok":true}`), 0o644); err != nil {
		t.Fatalf("write payload file: %v", err)
	}
	payload, err = loadJSONPayload("", false, payloadPath, strings.NewReader(""))
	if err != nil {
		t.Fatalf("load json payload from file: %v", err)
	}
	fileObject, ok := payload.(map[string]any)
	if !ok || fileObject["ok"] != true {
		t.Fatalf("unexpected file payload %#v", payload)
	}

	payload, err = loadJSONPayload("", true, "", strings.NewReader("{}"))
	if err != nil {
		t.Fatalf("load json payload from stdin: %v", err)
	}
	stdinObject, ok := payload.(map[string]any)
	if !ok || len(stdinObject) != 0 {
		t.Fatalf("unexpected stdin payload %#v", payload)
	}

	if _, err := loadJSONPayload("{}", true, "", strings.NewReader("{}")); err == nil {
		t.Fatal("expected multiple payload sources to fail")
	}
}

func TestLoadAuthPayloadFromFileRejectsEmptyAndRequiresObject(t *testing.T) {
	t.Parallel()

	authPath := filepath.Join(t.TempDir(), "auth.json")
	if err := os.WriteFile(authPath, []byte(`{"cookieHeader":"Cookie: name=value"}`), 0o644); err != nil {
		t.Fatalf("write auth payload: %v", err)
	}
	payload, err := loadAuthPayload(authPath, false, strings.NewReader(""))
	if err != nil {
		t.Fatalf("load auth payload from file: %v", err)
	}
	if payload["cookieHeader"] != "Cookie: name=value" {
		t.Fatalf("unexpected auth payload %#v", payload)
	}

	emptyPath := filepath.Join(t.TempDir(), "empty-auth.json")
	if err := os.WriteFile(emptyPath, []byte("   "), 0o644); err != nil {
		t.Fatalf("write empty auth payload: %v", err)
	}
	if _, err := loadAuthPayload(emptyPath, false, strings.NewReader("")); err == nil {
		t.Fatal("expected empty auth payload to fail")
	}

	arrayPath := filepath.Join(t.TempDir(), "array-auth.json")
	if err := os.WriteFile(arrayPath, []byte("[]"), 0o644); err != nil {
		t.Fatalf("write array auth payload: %v", err)
	}
	if _, err := loadAuthPayload(arrayPath, false, strings.NewReader("")); err == nil {
		t.Fatal("expected non-object auth payload to fail")
	}
}

func TestCookieHeaderHelpersCoverHeaderCookieAndBaseURLForms(t *testing.T) {
	t.Parallel()

	if value := stripCookieHeaderPrefix("Cookie: foo=bar"); value != "foo=bar" {
		t.Fatalf("unexpected stripped cookie header %q", value)
	}
	if value := stripCookieHeaderPrefix("cookie: foo=bar"); value != "foo=bar" {
		t.Fatalf("unexpected stripped lowercase cookie header %q", value)
	}
	if value := stripCookieHeaderPrefix("foo=bar"); value != "foo=bar" {
		t.Fatalf("unexpected stripped bare cookie value %q", value)
	}

	headerValue, err := cookieHeaderFromAuthPayload(map[string]any{
		"cookieHeader": "Cookie: name=value",
		"cookie":       "ignored=1",
	})
	if err != nil {
		t.Fatalf("cookie header from payload with header: %v", err)
	}
	if headerValue != "name=value" {
		t.Fatalf("unexpected cookie header value %q", headerValue)
	}

	headerValue, err = cookieHeaderFromAuthPayload(map[string]any{
		"cookie":     "tokenvalue",
		"cookieName": "settaAuth",
	})
	if err != nil {
		t.Fatalf("cookie header from raw cookie payload: %v", err)
	}
	if headerValue != "settaAuth=tokenvalue" {
		t.Fatalf("unexpected named cookie header %q", headerValue)
	}

	if _, err := cookieHeaderFromAuthPayload(map[string]any{}); err == nil {
		t.Fatal("expected missing cookie fields to fail")
	}

	baseURL, err := baseURLFromAuthPayload(map[string]any{
		"baseUrl": "example.com:9999/api",
	})
	if err != nil {
		t.Fatalf("base url from baseUrl payload: %v", err)
	}
	if baseURL != "http://example.com:9999" {
		t.Fatalf("unexpected normalized baseUrl %q", baseURL)
	}

	baseURL, err = baseURLFromAuthPayload(map[string]any{
		"apiBaseUrl": "http://127.0.0.1:8000/api",
	})
	if err != nil {
		t.Fatalf("base url from apiBaseUrl payload: %v", err)
	}
	if baseURL != "http://127.0.0.1:8000" {
		t.Fatalf("unexpected normalized apiBaseUrl %q", baseURL)
	}

	baseURL, err = baseURLFromAuthPayload(map[string]any{})
	if err != nil {
		t.Fatalf("base url from empty auth payload: %v", err)
	}
	if baseURL != "" {
		t.Fatalf("expected empty base url, got %q", baseURL)
	}
}

func TestResolveAPIRequestTargetUsesExplicitCookieAndNormalizedBaseURL(t *testing.T) {
	t.Parallel()

	target, err := resolveAPIRequestTarget(
		apiFlags{
			baseURL:      "localhost:8123/api",
			cookieHeader: "Cookie: settaAuth=abc123",
		},
		nil,
		globalFlags{},
		time.Now,
		t.TempDir(),
		func(string) (string, bool) { return "", false },
	)
	if err != nil {
		t.Fatalf("resolve api request target with explicit auth: %v", err)
	}
	if target.baseURL != "http://localhost:8123" {
		t.Fatalf("unexpected base url %q", target.baseURL)
	}
	if target.cookieValue != "settaAuth=abc123" {
		t.Fatalf("unexpected cookie value %q", target.cookieValue)
	}
}

func TestResolveAPIRequestTargetUsesAuthPayloadBaseURLAndCookie(t *testing.T) {
	t.Parallel()

	target, err := resolveAPIRequestTarget(
		apiFlags{},
		map[string]any{
			"cookie":     "token",
			"cookieName": "settaAuth",
			"apiBaseUrl": "127.0.0.1:9999/api",
		},
		globalFlags{},
		time.Now,
		t.TempDir(),
		func(string) (string, bool) { return "", false },
	)
	if err != nil {
		t.Fatalf("resolve api request target with auth payload: %v", err)
	}
	if target.baseURL != "http://127.0.0.1:9999" {
		t.Fatalf("unexpected base url %q", target.baseURL)
	}
	if target.cookieValue != "settaAuth=token" {
		t.Fatalf("unexpected cookie value %q", target.cookieValue)
	}
}

func TestNormalizeToolNameRejectsInvalidValues(t *testing.T) {
	t.Parallel()

	name, err := normalizeToolName(" getProjectConfig ")
	if err != nil {
		t.Fatalf("normalize tool name: %v", err)
	}
	if name != "getProjectConfig" {
		t.Fatalf("unexpected normalized tool name %q", name)
	}

	if _, err := normalizeToolName(""); err == nil {
		t.Fatal("expected empty tool name to fail")
	}
	if _, err := normalizeToolName("/path"); err == nil {
		t.Fatal("expected path-like tool name to fail")
	}
	if _, err := normalizeToolName("setta" + mcpx.ToolNameSeparator + "tool"); err == nil {
		t.Fatal("expected namespaced tool name to fail")
	}
}

func TestFilterSessionsByDefaultModeDefaultsToIDEForAuthAPIStopAndConnectInfo(t *testing.T) {
	t.Parallel()

	sessions := []auth.SessionMetadata{
		{ID: "ide", ServerMode: "ide"},
		{ID: "launcher", ServerMode: "launcher"},
	}

	for _, testCase := range []struct {
		command     string
		connectInfo bool
	}{
		{command: "auth"},
		{command: "api"},
		{command: "stop"},
		{command: "status", connectInfo: true},
	} {
		filtered := filterSessionsByDefaultMode(sessions, testCase.command, testCase.connectInfo, "")
		if len(filtered) != 1 || filtered[0].ServerMode != "ide" {
			t.Fatalf("expected ide-only filtering for %#v, got %#v", testCase, filtered)
		}
	}
}

func TestFilterSessionsByDefaultModeHonorsRequestedModeAndLeavesStatusListUnfiltered(t *testing.T) {
	t.Parallel()

	sessions := []auth.SessionMetadata{
		{ID: "ide", ServerMode: "ide"},
		{ID: "launcher", ServerMode: "launcher"},
	}

	filtered := filterSessionsByDefaultMode(sessions, "auth", false, "launcher")
	if len(filtered) != 1 || filtered[0].ServerMode != "launcher" {
		t.Fatalf("expected requested launcher mode, got %#v", filtered)
	}

	filtered = filterSessionsByDefaultMode(sessions, "status", false, "")
	if len(filtered) != 2 {
		t.Fatalf("expected status list to keep both session modes, got %#v", filtered)
	}
}

func TestAddExpandedLocalHomeWorkspaceHintForLocallyExpandedPath(t *testing.T) {
	t.Parallel()

	homeDir, err := os.UserHomeDir()
	if err != nil || strings.TrimSpace(homeDir) == "" {
		t.Skip("missing local home directory")
	}
	workspace := filepath.Join(homeDir, "repo")
	err = addExpandedLocalHomeWorkspaceHint(&sshx.Error{
		Code:    "RemoteWorkspace",
		Message: "Failed to resolve remote workspace.",
	}, workspace)
	if err == nil {
		t.Fatal("expected decorated remote workspace error")
	}
	if !strings.Contains(err.Error(), "expanded '~'") {
		t.Fatalf("expected expanded-home hint, got %q", err.Error())
	}
	if !strings.Contains(err.Error(), "--workspace") {
		t.Fatalf("expected workspace flag hint, got %q", err.Error())
	}
}
