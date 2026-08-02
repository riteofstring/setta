package app

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"strings"
	"testing"
	"time"

	"setta/internal/config"
	"setta/internal/httpapi"
	"setta/internal/mcpx"
	"setta/internal/observability"

	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestAppIDEMCPRuntimeStatusRouteReportsConnectedSelfClient(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	cfg.Server.Host = "127.0.0.1"
	prepareAppCurrentSession(t, cfg)

	app, serverURL := startMCPRuntimeStatusTestServer(t, cfg)
	waitForAppMCPClientState(t, app, mcpx.RuntimeStateConnected)

	mcpSession := connectMCPRuntimeStatusClient(t, app, serverURL)
	defer mcpSession.Close()

	toolCount := listMCPRuntimeStatusToolCount(t, mcpSession)
	payload := readMCPRuntimeStatus(t, app, serverURL)
	assertMCPRuntimeStatusConnectedSelfClient(t, payload, cfg, toolCount)
}

func startMCPRuntimeStatusTestServer(t *testing.T, cfg config.Config) (*App, string) {
	t.Helper()

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
		stopMCPRuntimeStatusTestServer(t, app, server, serverErrors)
	})
	return app, serverURL
}

func stopMCPRuntimeStatusTestServer(t *testing.T, app *App, server *http.Server, serverErrors <-chan error) {
	t.Helper()

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
}

func connectMCPRuntimeStatusClient(t *testing.T, app *App, serverURL string) *sdkmcp.ClientSession {
	t.Helper()

	mcpClient := sdkmcp.NewClient(&sdkmcp.Implementation{Name: "test-client", Version: "0.1.0"}, nil)
	mcpSession, err := mcpClient.Connect(context.Background(), &sdkmcp.StreamableClientTransport{
		Endpoint:   serverURL + "/mcp",
		HTTPClient: mustAuthenticatedMCPHTTPClient(t, app, serverURL),
	}, nil)
	if err != nil {
		t.Fatalf("connect authenticated mcp client: %v", err)
	}
	return mcpSession
}

func listMCPRuntimeStatusToolCount(t *testing.T, mcpSession *sdkmcp.ClientSession) int {
	t.Helper()

	toolsResult, err := mcpSession.ListTools(context.Background(), nil)
	if err != nil {
		t.Fatalf("list tools: %v", err)
	}
	return len(toolsResult.Tools)
}

func readMCPRuntimeStatus(t *testing.T, app *App, serverURL string) httpapi.MCPRuntimeStatusResponse {
	t.Helper()

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
	return payload
}

func assertMCPRuntimeStatusConnectedSelfClient(
	t *testing.T,
	payload httpapi.MCPRuntimeStatusResponse,
	cfg config.Config,
	toolCount int,
) {
	t.Helper()

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
	if payload.Servers[0].ToolCount != toolCount {
		t.Fatalf("expected tool count %d, got %d", toolCount, payload.Servers[0].ToolCount)
	}
	if len(payload.ExternalServers) != 0 {
		t.Fatalf("expected no external servers, got %d", len(payload.ExternalServers))
	}
}
