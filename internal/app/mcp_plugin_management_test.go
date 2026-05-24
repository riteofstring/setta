package app

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"
	"setta/internal/config"
	"setta/internal/httpapi"
	"setta/internal/observability"
)

func TestAppIDEMCPServerSupportsPluginManagementToolsOverAuthenticatedStreamableHTTP(t *testing.T) {
	sourceSpec := configureAppLocalPyPIFixture(t, "backend", "setta-fixture-backend", "0.1.0")

	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)
	seedAppPluginFixture(t, cfg.Paths.WorkspaceRoot, "backend")

	_, _, session := startAppMCPTestServer(t, cfg)

	assertAppMCPPluginRescan(t, session)
	assertAppMCPPluginManagementMissingHistoryErrors(t, session)
	assertAppMCPPluginUninstall(t, session)
	assertAppMCPPluginInstall(t, session, sourceSpec)
}

func assertAppMCPPluginRescan(t *testing.T, session *sdkmcp.ClientSession) {
	t.Helper()

	rescanResult := callAppMCPTool(t, session, "rescan_plugins", map[string]any{})
	rescanPayload := mustStructuredMapValue(t, rescanResult.StructuredContent)
	assertAppPluginManagementRescanInstalledPlugins(t, rescanPayload["installedPlugins"])
}

func assertAppMCPPluginManagementMissingHistoryErrors(t *testing.T, session *sdkmcp.ClientSession) {
	t.Helper()

	updateResult := callAppMCPToolAllowError(t, session, "update_plugin", map[string]any{
		"pluginId": "setta-fixture-backend",
		"scope":    "workspace",
	})
	if !updateResult.IsError {
		t.Fatal("expected update_plugin without metadata to fail")
	}
	updatePayload := mustStructuredMapValue(t, updateResult.StructuredContent)
	if updatePayload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments for update_plugin, got %#v", updatePayload["code"])
	}

	rollbackResult := callAppMCPToolAllowError(t, session, "rollback_plugin", map[string]any{
		"pluginId": "setta-fixture-backend",
		"scope":    "workspace",
	})
	if !rollbackResult.IsError {
		t.Fatal("expected rollback_plugin without history to fail")
	}
	rollbackPayload := mustStructuredMapValue(t, rollbackResult.StructuredContent)
	if rollbackPayload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments for rollback_plugin, got %#v", rollbackPayload["code"])
	}
}

func assertAppMCPPluginUninstall(t *testing.T, session *sdkmcp.ClientSession) {
	t.Helper()

	uninstallResult := callAppMCPTool(t, session, "uninstall_plugin", map[string]any{
		"pluginId": "setta-fixture-backend",
		"scope":    "workspace",
	})
	uninstallPayload := mustStructuredMapValue(t, uninstallResult.StructuredContent)
	if uninstallPayload["pluginId"] != "setta-fixture-backend" {
		t.Fatalf("expected setta-fixture-backend plugin id, got %#v", uninstallPayload["pluginId"])
	}
	if uninstallPayload["restartRequired"] != false {
		t.Fatalf("expected restartRequired=false after IDE auto-refresh backend uninstall, got %#v", uninstallPayload["restartRequired"])
	}
}

func assertAppMCPPluginInstall(t *testing.T, session *sdkmcp.ClientSession, sourceSpec string) {
	t.Helper()

	installResult := callAppMCPTool(t, session, "install_plugin", map[string]any{
		"sourceSpec": sourceSpec,
		"installer":  "pip",
	})
	installPayload := mustStructuredMapValue(t, installResult.StructuredContent)
	if installPayload["pluginId"] != "setta-fixture-backend" {
		t.Fatalf("expected setta-fixture-backend plugin id, got %#v", installPayload["pluginId"])
	}
	if installPayload["restartRequired"] != false {
		t.Fatalf("expected restartRequired=false after IDE auto-refresh backend install, got %#v", installPayload["restartRequired"])
	}
}

func TestAppIDEMCPToolCallRouteSupportsPluginManagementTools(t *testing.T) {
	sourceSpec := configureAppLocalPyPIFixture(t, "backend", "setta-fixture-backend", "0.1.0")

	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)
	seedAppPluginFixture(t, cfg.Paths.WorkspaceRoot, "backend")

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

	client := mustAuthenticatedMCPHTTPClient(t, app, server.URL)

	rescanResponse, err := client.Post(
		server.URL+httpapi.RouteMCPToolCall,
		"application/json",
		strings.NewReader(`{"tool":"rescan_plugins","arguments":{}}`),
	)
	if err != nil {
		t.Fatalf("post rescan_plugins tool call route: %v", err)
	}
	defer rescanResponse.Body.Close()
	if rescanResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(rescanResponse.Body)
		t.Fatalf("expected 200, got %d with body %q", rescanResponse.StatusCode, string(body))
	}
	rescanPayload := decodeAppToolCallRoutePayload(t, rescanResponse.Body)
	if rescanPayload.IsError {
		t.Fatalf("expected rescan_plugins success, got %#v", rescanPayload.StructuredContent)
	}
	rescanResult := mustStructuredMapValue(t, rescanPayload.StructuredContent)
	assertAppPluginManagementRescanInstalledPlugins(t, rescanResult["installedPlugins"])

	rollbackResponse, err := client.Post(
		server.URL+httpapi.RouteMCPToolCall,
		"application/json",
		strings.NewReader(`{
			"tool":"rollback_plugin",
			"arguments":{"pluginId":"setta-fixture-backend","scope":"workspace"}
		}`),
	)
	if err != nil {
		t.Fatalf("post rollback_plugin tool call route: %v", err)
	}
	defer rollbackResponse.Body.Close()
	if rollbackResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(rollbackResponse.Body)
		t.Fatalf("expected 200, got %d with body %q", rollbackResponse.StatusCode, string(body))
	}
	rollbackPayload := decodeAppToolCallRoutePayload(t, rollbackResponse.Body)
	if !rollbackPayload.IsError {
		t.Fatal("expected rollback_plugin without history to fail")
	}
	if mustStructuredMapValue(t, rollbackPayload.StructuredContent)["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments rollback payload, got %#v", rollbackPayload.StructuredContent)
	}

	uninstallResponse, err := client.Post(
		server.URL+httpapi.RouteMCPToolCall,
		"application/json",
		strings.NewReader(`{
			"tool":"uninstall_plugin",
			"arguments":{"pluginId":"setta-fixture-backend","scope":"workspace"}
		}`),
	)
	if err != nil {
		t.Fatalf("post uninstall_plugin tool call route: %v", err)
	}
	defer uninstallResponse.Body.Close()
	if uninstallResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(uninstallResponse.Body)
		t.Fatalf("expected 200, got %d with body %q", uninstallResponse.StatusCode, string(body))
	}
	uninstallPayload := decodeAppToolCallRoutePayload(t, uninstallResponse.Body)
	if uninstallPayload.IsError {
		t.Fatalf("expected uninstall_plugin success, got %#v", uninstallPayload.StructuredContent)
	}
	if mustStructuredMapValue(t, uninstallPayload.StructuredContent)["restartRequired"] != false {
		t.Fatalf("expected backend uninstall restartRequired=false after IDE auto-refresh, got %#v", uninstallPayload.StructuredContent)
	}

	installResponse, err := client.Post(
		server.URL+httpapi.RouteMCPToolCall,
		"application/json",
		strings.NewReader(`{
			"tool":"install_plugin",
			"arguments":{"sourceSpec":"`+sourceSpec+`","installer":"pip"}
		}`),
	)
	if err != nil {
		t.Fatalf("post install_plugin tool call route: %v", err)
	}
	defer installResponse.Body.Close()
	if installResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(installResponse.Body)
		t.Fatalf("expected 200, got %d with body %q", installResponse.StatusCode, string(body))
	}
	installPayload := decodeAppToolCallRoutePayload(t, installResponse.Body)
	if installPayload.IsError {
		t.Fatalf("expected install_plugin success, got %#v", installPayload.StructuredContent)
	}
	if mustStructuredMapValue(t, installPayload.StructuredContent)["pluginId"] != "setta-fixture-backend" {
		t.Fatalf("expected successful install payload, got %#v", installPayload.StructuredContent)
	}
}

func TestAppIDEMCPPluginInstallRefreshesBackendMCPTools(t *testing.T) {
	sourceSpec := configureAppLocalPyPIFixture(t, "backend-mcp-tools", "setta-fixture-backend-mcp-tools", "0.1.0")

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

	sessionClient := sdkmcp.NewClient(&sdkmcp.Implementation{Name: "test-client", Version: "0.1.0"}, nil)
	session, err := sessionClient.Connect(context.Background(), &sdkmcp.StreamableClientTransport{
		Endpoint:   server.URL + "/mcp",
		HTTPClient: mustAuthenticatedMCPHTTPClient(t, app, server.URL),
	}, nil)
	if err != nil {
		t.Fatalf("connect authenticated mcp client: %v", err)
	}
	defer session.Close()

	assertPluginBackendToolPresence(t, session, false)

	installResult, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "install_plugin",
		Arguments: map[string]any{
			"sourceSpec": sourceSpec,
			"installer":  "pip",
		},
	})
	if err != nil {
		t.Fatalf("call install_plugin: %v", err)
	}
	if installResult.IsError {
		t.Fatalf("expected install_plugin success, got %#v", installResult.StructuredContent)
	}
	installPayload := mustStructuredMapValue(t, installResult.StructuredContent)
	if installPayload["restartRequired"] != false {
		t.Fatalf("expected restartRequired=false after backend MCP plugin install, got %#v", installPayload["restartRequired"])
	}

	assertPluginBackendToolPresence(t, session, true)

	uninstallResult, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "uninstall_plugin",
		Arguments: map[string]any{
			"pluginId": "setta-fixture-backend-mcp-tools",
			"scope":    "workspace",
		},
	})
	if err != nil {
		t.Fatalf("call uninstall_plugin: %v", err)
	}
	if uninstallResult.IsError {
		t.Fatalf("expected uninstall_plugin success, got %#v", uninstallResult.StructuredContent)
	}
	uninstallPayload := mustStructuredMapValue(t, uninstallResult.StructuredContent)
	if uninstallPayload["restartRequired"] != false {
		t.Fatalf("expected restartRequired=false after backend MCP plugin uninstall, got %#v", uninstallPayload["restartRequired"])
	}

	assertPluginBackendToolPresence(t, session, false)
}

func assertAppPluginManagementRescanInstalledPlugins(t *testing.T, rawCount any) {
	t.Helper()

	count, ok := rawCount.(float64)
	if !ok || count < 1 {
		t.Fatalf("expected at least one installed plugin, got %#v", rawCount)
	}
}

func assertPluginBackendToolPresence(t *testing.T, session *sdkmcp.ClientSession, wantPresent bool) {
	t.Helper()

	toolsResult, err := session.ListTools(context.Background(), nil)
	if err != nil {
		t.Fatalf("list tools: %v", err)
	}

	hasReadTool := false
	hasWriteTool := false
	for _, tool := range toolsResult.Tools {
		if tool.Name == "setta_fixture_mcp_read" {
			hasReadTool = true
		}
		if tool.Name == "setta_fixture_mcp_write" {
			hasWriteTool = true
		}
	}
	if hasReadTool != wantPresent || hasWriteTool != wantPresent {
		t.Fatalf("expected plugin backend MCP tool presence=%t, got read=%t write=%t", wantPresent, hasReadTool, hasWriteTool)
	}
}

func seedAppPluginFixture(t *testing.T, workspaceRoot string, fixtureName string) {
	t.Helper()

	sourceRoot := filepath.Join(appPluginFixtureRepoRoot(t), "tests", "fixtures", "plugins", fixtureName)
	manifestPath := filepath.Join(sourceRoot, "setta.plugin.json")
	payload, err := os.ReadFile(manifestPath)
	if err != nil {
		t.Fatalf("read plugin manifest: %v", err)
	}
	var manifest struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(payload, &manifest); err != nil {
		t.Fatalf("decode plugin manifest: %v", err)
	}
	targetRoot := filepath.Join(workspaceRoot, ".setta_plugins", manifest.ID)
	if err := copyAppPluginFixtureDir(sourceRoot, targetRoot); err != nil {
		t.Fatalf("copy plugin fixture: %v", err)
	}
	materializeAppRuntimeManagedPluginFrontendAssets(t, targetRoot)
}

func appPluginFixtureRepoRoot(t *testing.T) string {
	t.Helper()

	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("resolve caller path")
	}
	return filepath.Dir(filepath.Dir(filepath.Dir(file)))
}

func copyAppPluginFixtureDir(sourceRoot string, targetRoot string) error {
	return filepath.Walk(sourceRoot, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		relativePath, err := filepath.Rel(sourceRoot, path)
		if err != nil {
			return err
		}
		destination := filepath.Join(targetRoot, relativePath)
		if info.IsDir() {
			return os.MkdirAll(destination, info.Mode())
		}
		payload, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		if err := os.MkdirAll(filepath.Dir(destination), 0o755); err != nil {
			return err
		}
		return os.WriteFile(destination, payload, info.Mode())
	})
}
