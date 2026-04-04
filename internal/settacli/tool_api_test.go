package settacli

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"setta/internal/auth"
	"setta/internal/httpapi"
	"setta/internal/mcpx"
	"setta/internal/sshx"
)

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
