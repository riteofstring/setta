package app

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"

	"setta/internal/config"
	"setta/internal/observability"
	"setta/internal/plugins"
)

func TestAppPluginRescanRegistersExternallyInstalledBackendMCPTools(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)

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
	authCookie := newAppTestAuthCookie(t, app)
	session := connectAuthenticatedAppMCPSession(t, app, server.URL)
	defer session.Close()

	assertPluginBackendToolPresence(t, session, false)

	installAppPluginFixture(t, cfg, "backend-mcp-tools", "setta-fixture-backend-mcp-tools")

	rescanResponse := rescanAppPlugins(t, server.URL, authCookie)
	defer rescanResponse.Body.Close()
	if rescanResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(rescanResponse.Body)
		t.Fatalf("expected plugins rescan 200 after external backend MCP install, got %d with body %q", rescanResponse.StatusCode, string(body))
	}

	assertPluginBackendToolPresence(t, session, true)

	status := fetchAppPluginRuntimeStatus(t, server.URL, authCookie)
	entry := mustFindAppPluginStatusEntry(t, status, "setta-fixture-backend-mcp-tools")
	if entry.State != plugins.PluginRuntimeStateActive || entry.RestartRequired {
		t.Fatalf("expected externally installed backend MCP plugin to become active without restart, got %#v", entry)
	}
}

func TestAppPluginRescanRemovesExternallyDeletedBackendMCPTools(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)
	installAppPluginFixture(t, cfg, "backend-mcp-tools", "setta-fixture-backend-mcp-tools")

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
	authCookie := newAppTestAuthCookie(t, app)
	session := connectAuthenticatedAppMCPSession(t, app, server.URL)
	defer session.Close()

	assertPluginBackendToolPresence(t, session, true)

	if err := os.RemoveAll(filepath.Join(cfg.Paths.WorkspaceRoot, ".setta_plugins", "setta-fixture-backend-mcp-tools")); err != nil {
		t.Fatalf("remove backend MCP plugin root: %v", err)
	}

	rescanResponse := rescanAppPlugins(t, server.URL, authCookie)
	defer rescanResponse.Body.Close()
	if rescanResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(rescanResponse.Body)
		t.Fatalf("expected plugins rescan 200 after external backend MCP delete, got %d with body %q", rescanResponse.StatusCode, string(body))
	}

	assertPluginBackendToolPresence(t, session, false)

	status := fetchAppPluginRuntimeStatus(t, server.URL, authCookie)
	if entries := mcpPluginStatusEntriesForID(status, "setta-fixture-backend-mcp-tools"); len(entries) != 0 {
		t.Fatalf("expected deleted backend MCP plugin to disappear from runtime status, got %#v", entries)
	}
}

func connectAuthenticatedAppMCPSession(t *testing.T, app *App, serverURL string) *sdkmcp.ClientSession {
	t.Helper()

	sessionClient := sdkmcp.NewClient(&sdkmcp.Implementation{Name: "test-client", Version: "0.1.0"}, nil)
	session, err := sessionClient.Connect(context.Background(), &sdkmcp.SSEClientTransport{
		Endpoint:   serverURL + "/mcp",
		HTTPClient: mustAuthenticatedMCPHTTPClient(t, app, serverURL),
	}, nil)
	if err != nil {
		t.Fatalf("connect authenticated mcp client: %v", err)
	}
	return session
}

func mcpPluginStatusEntriesForID(entries []plugins.PluginStatusEntry, pluginID string) []plugins.PluginStatusEntry {
	matches := make([]plugins.PluginStatusEntry, 0, len(entries))
	for _, entry := range entries {
		if entry.PluginID == pluginID {
			matches = append(matches, entry)
		}
	}
	return matches
}
