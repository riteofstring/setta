package app

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"
	"setta/internal/config"
	"setta/internal/httpapi"
	"setta/internal/mcpx"
	"setta/internal/observability"
)

func TestAppIDEMCPServerRejectsUnauthorizedClients(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := sdkmcp.NewClient(&sdkmcp.Implementation{Name: "test-client", Version: "0.1.0"}, nil)
	_, err = client.Connect(context.Background(), &sdkmcp.SSEClientTransport{
		Endpoint: server.URL + "/mcp",
	}, nil)
	if err == nil {
		t.Fatal("expected unauthorized MCP connect to fail")
	}
	if !strings.Contains(err.Error(), "Unauthorized") {
		t.Fatalf("expected unauthorized error, got %v", err)
	}
}

func TestAppIDEMCPServerSupportsAuthenticatedSSECalls(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	if err := os.MkdirAll(cfg.Paths.WorkspaceRoot, 0o755); err != nil {
		t.Fatalf("mkdir workspace root: %v", err)
	}
	sourcePath := filepath.Join(cfg.Paths.WorkspaceRoot, "example.txt")
	if err := os.WriteFile(sourcePath, []byte("alpha\nbeta\ngamma\n"), 0o644); err != nil {
		t.Fatalf("write source file: %v", err)
	}

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := sdkmcp.NewClient(&sdkmcp.Implementation{Name: "test-client", Version: "0.1.0"}, nil)
	session, err := client.Connect(context.Background(), &sdkmcp.SSEClientTransport{
		Endpoint:   server.URL + "/mcp",
		HTTPClient: mustAuthenticatedMCPHTTPClient(t, app, server.URL),
	}, nil)
	if err != nil {
		t.Fatalf("connect authenticated mcp client: %v", err)
	}
	defer session.Close()

	toolsResult, err := session.ListTools(context.Background(), nil)
	if err != nil {
		t.Fatalf("list tools: %v", err)
	}
	if len(toolsResult.Tools) != 2 {
		t.Fatalf("expected 2 tools, got %d", len(toolsResult.Tools))
	}

	listResult, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name:      "list_mcp_tools",
		Arguments: map[string]any{},
	})
	if err != nil {
		t.Fatalf("call list_mcp_tools: %v", err)
	}
	listPayload, ok := listResult.StructuredContent.(map[string]any)
	if !ok {
		t.Fatalf("expected structured list payload, got %#v", listResult.StructuredContent)
	}
	rawNames, ok := listPayload["tools"].([]any)
	if !ok {
		t.Fatalf("expected tool list array, got %#v", listPayload["tools"])
	}
	if len(rawNames) != 2 {
		t.Fatalf("expected 2 registered tool names, got %d", len(rawNames))
	}

	readResult, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "read_file_range",
		Arguments: map[string]any{
			"path":       "example.txt",
			"start_line": 2,
			"end_line":   3,
		},
	})
	if err != nil {
		t.Fatalf("call read_file_range: %v", err)
	}
	if readResult.IsError {
		t.Fatalf("expected read_file_range success, got %#v", readResult.StructuredContent)
	}
	readPayload, ok := readResult.StructuredContent.(map[string]any)
	if !ok {
		t.Fatalf("expected structured read payload, got %#v", readResult.StructuredContent)
	}
	if readPayload["path"] != "example.txt" {
		t.Fatalf("expected relative path example.txt, got %#v", readPayload["path"])
	}
	if readPayload["content"] != "beta\ngamma" {
		t.Fatalf("expected ranged file content, got %#v", readPayload["content"])
	}

	errorResult, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name:      "read_file_range",
		Arguments: map[string]any{"path": "missing.txt"},
	})
	if err != nil {
		t.Fatalf("call read_file_range missing file: %v", err)
	}
	if !errorResult.IsError {
		t.Fatal("expected missing file to return structured tool error")
	}
	errorPayload, ok := errorResult.StructuredContent.(map[string]any)
	if !ok {
		t.Fatalf("expected structured error payload, got %#v", errorResult.StructuredContent)
	}
	if errorPayload["code"] != "file_not_found" {
		t.Fatalf("expected file_not_found code, got %#v", errorPayload["code"])
	}
}

func TestAppIDEMCPRuntimeStatusRouteReportsConnectedSelfClient(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	cfg.Server.Host = "127.0.0.1"
	prepareAppCurrentSession(t, cfg)

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	cfg.Server.Port = listener.Addr().(*net.TCPAddr).Port

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}

	server := &http.Server{Handler: app.Handler()}
	serverErrors := make(chan error, 1)
	go func() {
		serverErrors <- server.Serve(listener)
	}()

	serverURL := "http://" + listener.Addr().String()
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdownCtx); err != nil && !errors.Is(err, http.ErrServerClosed) {
			t.Fatalf("shutdown http server: %v", err)
		}
		err := <-serverErrors
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			t.Fatalf("serve app: %v", err)
		}
	})

	waitForAppMCPClientState(t, app, mcpx.RuntimeStateConnected)

	client := mustAuthenticatedMCPHTTPClient(t, app, serverURL)
	response, err := client.Post(
		serverURL+"/api/mcpServerRuntimeStatus",
		"application/json",
		strings.NewReader(`{}`),
	)
	if err != nil {
		t.Fatalf("post runtime status: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	var payload httpapi.MCPRuntimeStatusResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode runtime status: %v", err)
	}
	if payload.LLMConfigPath != mcpx.LLMConfigPath(cfg.Paths.SettaFilesRoot) {
		t.Fatalf("unexpected llm config path %q", payload.LLMConfigPath)
	}
	if payload.ActiveSettaFilesLocation != "local" {
		t.Fatalf("expected local files location, got %q", payload.ActiveSettaFilesLocation)
	}
	if len(payload.Servers) != 1 {
		t.Fatalf("expected one server status, got %d", len(payload.Servers))
	}
	if payload.Servers[0].ServerID != mcpx.DefaultServerID {
		t.Fatalf("expected setta server id, got %q", payload.Servers[0].ServerID)
	}
	if payload.Servers[0].State != mcpx.RuntimeStateConnected {
		t.Fatalf("expected connected state, got %q", payload.Servers[0].State)
	}
	if payload.Servers[0].ToolCount != 2 {
		t.Fatalf("expected tool count 2, got %d", payload.Servers[0].ToolCount)
	}
	if len(payload.ExternalServers) != 0 {
		t.Fatalf("expected no external servers, got %d", len(payload.ExternalServers))
	}
}

func mustAuthenticatedMCPHTTPClient(t *testing.T, app *App, serverURL string) *http.Client {
	t.Helper()

	session, ok := app.Auth().CurrentSession()
	if !ok {
		t.Fatal("expected current session")
	}
	token, _, err := app.Auth().MintAuthCookie(time.Now().UTC())
	if err != nil {
		t.Fatalf("mint auth cookie: %v", err)
	}
	cookieName, err := app.Auth().CookieName(session.Metadata.ID)
	if err != nil {
		t.Fatalf("cookie name: %v", err)
	}

	jar, err := cookiejar.New(nil)
	if err != nil {
		t.Fatalf("new cookie jar: %v", err)
	}
	parsedURL, err := url.Parse(serverURL)
	if err != nil {
		t.Fatalf("parse server url: %v", err)
	}
	jar.SetCookies(parsedURL, []*http.Cookie{{
		Name:  cookieName,
		Value: token,
		Path:  "/",
	}})
	return &http.Client{Jar: jar}
}

func waitForAppMCPClientState(t *testing.T, app *App, want mcpx.RuntimeState) {
	t.Helper()

	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		client := app.MCPClient()
		if client != nil {
			statuses := client.RuntimeStatuses()
			if len(statuses) == 1 && statuses[0].State == want {
				return
			}
		}
		time.Sleep(25 * time.Millisecond)
	}

	client := app.MCPClient()
	if client == nil {
		t.Fatal("expected app MCP client")
	}
	statuses := client.RuntimeStatuses()
	t.Fatalf("expected runtime state %q, got %#v", want, statuses)
}
