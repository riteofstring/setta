package app

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"
	"setta/internal/appsubsystem/appspec"
	"setta/internal/config"
	"setta/internal/httpapi"
	"setta/internal/observability"
	"setta/internal/realtime"
	appsubsystemprovider "setta/internal/testutil/appsubsystemprovider"
	"setta/internal/testutil/firstpartyplugin"
	"setta/internal/wsapi"
)

func TestAppIDEMCPServerSupportsUISettingSearchReadWriteOverAuthenticatedSSE(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
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

	client := sdkmcp.NewClient(&sdkmcp.Implementation{Name: "test-client", Version: "0.1.0"}, nil)
	session, err := client.Connect(context.Background(), &sdkmcp.SSEClientTransport{
		Endpoint:   server.URL + "/mcp",
		HTTPClient: mustAuthenticatedMCPHTTPClient(t, app, server.URL),
	}, nil)
	if err != nil {
		t.Fatalf("connect authenticated mcp client: %v", err)
	}
	defer session.Close()

	setContextResult, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_agentic_context",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   true,
		},
	})
	if err != nil {
		t.Fatalf("call set_agentic_context: %v", err)
	}
	if setContextResult.IsError {
		t.Fatalf("expected set_agentic_context success, got %#v", setContextResult.StructuredContent)
	}

	searchResult, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "search_ui_settings",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"query":           "watch toggle",
			"limit":           3,
		},
	})
	if err != nil {
		t.Fatalf("call search_ui_settings: %v", err)
	}
	if searchResult.IsError {
		t.Fatalf("expected search_ui_settings success, got %#v", searchResult.StructuredContent)
	}
	searchPayload := mustStructuredMapValue(t, searchResult.StructuredContent)
	searchResults := mustStructuredListValue(t, searchPayload["results"])
	if len(searchResults) == 0 || mustStructuredMapValue(t, searchResults[0])["settingId"] != "core.watch_code.enabled" {
		t.Fatalf("expected watch-code UI setting search result, got %#v", searchResults)
	}

	getResult, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "core.project.name",
		},
	})
	if err != nil {
		t.Fatalf("call get_ui_setting_value: %v", err)
	}
	if getResult.IsError {
		t.Fatalf("expected get_ui_setting_value success, got %#v", getResult.StructuredContent)
	}
	getPayload := mustStructuredMapValue(t, getResult.StructuredContent)
	if getPayload["value"] != "Alpha" {
		t.Fatalf("expected project name Alpha, got %#v", getPayload["value"])
	}

	setResult, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "core.project.show_param_display_names",
			"value":           true,
		},
	})
	if err != nil {
		t.Fatalf("call set_ui_setting_value: %v", err)
	}
	if setResult.IsError {
		t.Fatalf("expected set_ui_setting_value success, got %#v", setResult.StructuredContent)
	}
	setPayload := mustStructuredMapValue(t, setResult.StructuredContent)
	if _, ok := setPayload["error"]; ok {
		t.Fatalf("did not expect structured set_ui_setting_value error, got %#v", setPayload)
	}
	if setPayload["changed"] != true {
		t.Fatalf("expected changed=true, got %#v", setPayload["changed"])
	}

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_ui_setting_value: %v", err)
	}
	if !project.ShowParamDisplayNames {
		t.Fatal("expected authenticated SSE write to persist showParamDisplayNames")
	}
}

func TestAppIDEMCPServerExposesAppUISettingsWhenUnknownAppProviderEnabled(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)
	installAppFixturePlugin(t, cfg, "app-subsystem-unknown-id")
	writeEnabledAppPluginState(t, cfg, appsubsystemprovider.PluginID)

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

	setContextResult, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_agentic_context",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   true,
		},
	})
	if err != nil {
		t.Fatalf("call set_agentic_context: %v", err)
	}
	if setContextResult.IsError {
		t.Fatalf("expected set_agentic_context success, got %#v", setContextResult.StructuredContent)
	}

	getResult, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "core.app.spec_path",
		},
	})
	if err != nil {
		t.Fatalf("call get_ui_setting_value: %v", err)
	}
	if getResult.IsError {
		t.Fatalf("expected get_ui_setting_value success, got %#v", getResult.StructuredContent)
	}
	getPayload := mustStructuredMapValue(t, getResult.StructuredContent)
	if getPayload["value"] != appspec.MustForPlugin(appsubsystemprovider.PluginID).DefaultPath() {
		t.Fatalf("expected default app spec path, got %#v", getPayload["value"])
	}
}

func TestAppIDEMCPServerExposesAppUISettingsWhenUnknownAppPackageManagerProviderEnabled(
	t *testing.T,
) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)

	sitePackages := filepath.Join(t.TempDir(), "site-packages")
	installAppPackageManagerFixturePlugin(t, sitePackages, "app-subsystem-unknown-id")
	t.Setenv("SETTA_PYTHON", firstpartyplugin.EmptyPython(t))
	t.Setenv("PYTHONPATH", appendAppPythonPath(sitePackages))
	writeEnabledAppPluginState(t, cfg, appsubsystemprovider.PluginID)

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

	setContextResult, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_agentic_context",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   true,
		},
	})
	if err != nil {
		t.Fatalf("call set_agentic_context: %v", err)
	}
	if setContextResult.IsError {
		t.Fatalf("expected set_agentic_context success, got %#v", setContextResult.StructuredContent)
	}

	getResult, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "core.app.spec_path",
		},
	})
	if err != nil {
		t.Fatalf("call get_ui_setting_value: %v", err)
	}
	if getResult.IsError {
		t.Fatalf("expected get_ui_setting_value success, got %#v", getResult.StructuredContent)
	}
	getPayload := mustStructuredMapValue(t, getResult.StructuredContent)
	if getPayload["value"] != appspec.MustForPlugin(appsubsystemprovider.PluginID).DefaultPath() {
		t.Fatalf("expected default app spec path, got %#v", getPayload["value"])
	}
}

func TestAppIDEMCPServerSupportsTemporaryIDsForUISettingReadWriteOverAuthenticatedSSE(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)
	writeAppTemporaryIDMap(t, filepath.Join(cfg.Paths.RuntimeRoot, "temporary_id_map.json"), map[string]string{
		"project-alpha": "11",
		"chat-1":        "12",
		"chat-section":  "13",
	})

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

	setContextResult, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_agentic_context",
		Arguments: map[string]any{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_agentic_context: %v", err)
	}
	if setContextResult.IsError {
		t.Fatalf("expected temp-id set_agentic_context success, got %#v", setContextResult.StructuredContent)
	}

	getResult, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "11",
			"settingId":       "core.project.show_param_display_names",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id get_ui_setting_value: %v", err)
	}
	if getResult.IsError {
		t.Fatalf("expected temp-id get_ui_setting_value success, got %#v", getResult.StructuredContent)
	}

	setResult, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "11",
			"settingId":       "core.project.show_param_display_names",
			"value":           true,
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_ui_setting_value: %v", err)
	}
	if setResult.IsError {
		t.Fatalf("expected temp-id set_ui_setting_value success, got %#v", setResult.StructuredContent)
	}
	setPayload := mustStructuredMapValue(t, setResult.StructuredContent)
	if _, ok := setPayload["error"]; ok {
		t.Fatalf("did not expect structured temp-id set_ui_setting_value error, got %#v", setPayload)
	}
	if setPayload["changed"] != true {
		t.Fatalf("expected temp-id changed=true, got %#v", setPayload["changed"])
	}

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id set_ui_setting_value: %v", err)
	}
	if !project.ShowParamDisplayNames {
		t.Fatal("expected temporary-id authenticated SSE write to persist showParamDisplayNames")
	}
}

func TestAppIDEMCPToolCallRouteSupportsUISettingSearchReadWrite(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
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

	client := mustAuthenticatedMCPHTTPClient(t, app, server.URL)

	searchResponse, err := client.Post(
		server.URL+httpapi.RouteMCPToolCall,
		"application/json",
		strings.NewReader(`{
			"tool":"search_ui_settings",
			"arguments":{"projectConfigId":"project-alpha","query":"watch toggle","limit":3},
			"agenticContext":{"projectConfigId":"project-alpha","allowUnscoped":true}
		}`),
	)
	if err != nil {
		t.Fatalf("post search_ui_settings tool call route: %v", err)
	}
	defer searchResponse.Body.Close()
	if searchResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(searchResponse.Body)
		t.Fatalf("expected 200, got %d with body %q", searchResponse.StatusCode, string(body))
	}
	searchPayload := decodeAppToolCallRoutePayload(t, searchResponse.Body)
	if searchPayload.IsError {
		t.Fatalf("expected search_ui_settings success, got %#v", searchPayload.StructuredContent)
	}
	searchResult := mustStructuredMapValue(t, searchPayload.StructuredContent)
	searchResults := mustStructuredListValue(t, searchResult["results"])
	if len(searchResults) == 0 || mustStructuredMapValue(t, searchResults[0])["settingId"] != "core.watch_code.enabled" {
		t.Fatalf("expected watch-code UI setting search result, got %#v", searchResults)
	}

	getResponse, err := client.Post(
		server.URL+httpapi.RouteMCPToolCall,
		"application/json",
		strings.NewReader(`{
			"tool":"get_ui_setting_value",
			"arguments":{"projectConfigId":"project-alpha","settingId":"core.project.name"},
			"agenticContext":{"projectConfigId":"project-alpha","allowUnscoped":true}
		}`),
	)
	if err != nil {
		t.Fatalf("post get_ui_setting_value tool call route: %v", err)
	}
	defer getResponse.Body.Close()
	if getResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(getResponse.Body)
		t.Fatalf("expected 200, got %d with body %q", getResponse.StatusCode, string(body))
	}
	getPayload := decodeAppToolCallRoutePayload(t, getResponse.Body)
	if getPayload.IsError {
		t.Fatalf("expected get_ui_setting_value success, got %#v", getPayload.StructuredContent)
	}
	getResult := mustStructuredMapValue(t, getPayload.StructuredContent)
	if getResult["value"] != "Alpha" {
		t.Fatalf("expected project name Alpha, got %#v", getResult["value"])
	}

	setResponse, err := client.Post(
		server.URL+httpapi.RouteMCPToolCall,
		"application/json",
		strings.NewReader(`{
			"tool":"set_ui_setting_value",
			"arguments":{"projectConfigId":"project-alpha","settingId":"core.project.show_param_display_names","value":true},
			"agenticContext":{"projectConfigId":"project-alpha","allowUnscoped":true}
		}`),
	)
	if err != nil {
		t.Fatalf("post set_ui_setting_value tool call route: %v", err)
	}
	defer setResponse.Body.Close()
	if setResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(setResponse.Body)
		t.Fatalf("expected 200, got %d with body %q", setResponse.StatusCode, string(body))
	}
	setPayload := decodeAppToolCallRoutePayload(t, setResponse.Body)
	if setPayload.IsError {
		t.Fatalf("expected set_ui_setting_value success, got %#v", setPayload.StructuredContent)
	}
	setResult := mustStructuredMapValue(t, setPayload.StructuredContent)
	if _, ok := setResult["error"]; ok {
		t.Fatalf("did not expect structured route set_ui_setting_value error, got %#v", setResult)
	}
	if setResult["changed"] != true {
		t.Fatalf("expected changed=true, got %#v", setResult["changed"])
	}
}

func TestAppIDEMCPToolCallRouteUISettingReadWriteAcceptsTemporaryIDs(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)
	writeAppTemporaryIDMap(t, filepath.Join(cfg.Paths.RuntimeRoot, "temporary_id_map.json"), map[string]string{
		"project-alpha": "11",
		"chat-1":        "12",
		"chat-section":  "13",
	})

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

	getResponse, err := client.Post(
		server.URL+httpapi.RouteMCPToolCall,
		"application/json",
		strings.NewReader(`{
			"tool":"get_ui_setting_value",
			"arguments":{"projectConfigId":"11","settingId":"core.project.show_param_display_names"},
			"agenticContext":{"projectConfigId":"11","allowUnscoped":true}
		}`),
	)
	if err != nil {
		t.Fatalf("post temp-id get_ui_setting_value tool call route: %v", err)
	}
	defer getResponse.Body.Close()
	if getResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(getResponse.Body)
		t.Fatalf("expected 200, got %d with body %q", getResponse.StatusCode, string(body))
	}
	getPayload := decodeAppToolCallRoutePayload(t, getResponse.Body)
	if getPayload.IsError {
		t.Fatalf("expected temp-id get_ui_setting_value success, got %#v", getPayload.StructuredContent)
	}

	setResponse, err := client.Post(
		server.URL+httpapi.RouteMCPToolCall,
		"application/json",
		strings.NewReader(`{
			"tool":"set_ui_setting_value",
			"arguments":{"projectConfigId":"11","settingId":"core.project.show_param_display_names","value":true},
			"agenticContext":{"projectConfigId":"11","allowUnscoped":true}
		}`),
	)
	if err != nil {
		t.Fatalf("post temp-id set_ui_setting_value tool call route: %v", err)
	}
	defer setResponse.Body.Close()
	if setResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(setResponse.Body)
		t.Fatalf("expected 200, got %d with body %q", setResponse.StatusCode, string(body))
	}
	setPayload := decodeAppToolCallRoutePayload(t, setResponse.Body)
	if setPayload.IsError {
		t.Fatalf("expected temp-id set_ui_setting_value success, got %#v", setPayload.StructuredContent)
	}
	setResult := mustStructuredMapValue(t, setPayload.StructuredContent)
	if _, ok := setResult["error"]; ok {
		t.Fatalf("did not expect structured temp-id route set_ui_setting_value error, got %#v", setResult)
	}
	if setResult["changed"] != true {
		t.Fatalf("expected temp-id route changed=true, got %#v", setResult["changed"])
	}
}

func TestAppIDEMCPServerSupportsRevealUISettingOverAuthenticatedSSE(t *testing.T) {
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

	frontendConn, frontendAffinityToken := dialAppRevealFrontend(t, app, server.URL)
	defer frontendConn.CloseNow()

	ackErrCh := make(chan error, 1)
	go func() {
		ackErrCh <- ackNextAppUISettingReveal(t, frontendConn, "allowed-callable-section")
	}()

	client := sdkmcp.NewClient(&sdkmcp.Implementation{Name: "test-client", Version: "0.1.0"}, nil)
	session, err := client.Connect(context.Background(), &sdkmcp.SSEClientTransport{
		Endpoint:   server.URL + "/mcp",
		HTTPClient: mustAuthenticatedMCPHTTPClient(t, app, server.URL),
	}, nil)
	if err != nil {
		t.Fatalf("connect authenticated mcp client: %v", err)
	}
	defer session.Close()

	setContextResult, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_agentic_context",
		Arguments: map[string]any{
			"projectConfigId":       "project-alpha",
			"allowUnscoped":         true,
			"frontendAffinityToken": frontendAffinityToken,
		},
	})
	if err != nil {
		t.Fatalf("call set_agentic_context: %v", err)
	}
	if setContextResult.IsError {
		t.Fatalf("expected set_agentic_context success, got %#v", setContextResult.StructuredContent)
	}

	result, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "reveal_ui_setting",
		Arguments: map[string]any{
			"projectConfigId":     "project-alpha",
			"settingId":           "core.project.show_param_display_names",
			"sectionIdToActivate": "allowed-callable-section",
			"durationMs":          1500,
		},
	})
	if err != nil {
		t.Fatalf("call reveal_ui_setting: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected reveal_ui_setting success, got %#v", result.StructuredContent)
	}
	if err := <-ackErrCh; err != nil {
		t.Fatalf("ack reveal websocket round-trip: %v", err)
	}

	payload := mustStructuredMapValue(t, result.StructuredContent)
	statuses := mustStructuredListValue(t, payload["statuses"])
	if len(statuses) != 1 || mustStructuredMapValue(t, statuses[0])["status"] != "revealed" {
		t.Fatalf("expected single revealed status, got %#v", statuses)
	}
}

func TestAppIDEMCPToolCallRouteSupportsRevealUISetting(t *testing.T) {
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

	frontendConn, frontendAffinityToken := dialAppRevealFrontend(t, app, server.URL)
	defer frontendConn.CloseNow()

	ackErrCh := make(chan error, 1)
	go func() {
		ackErrCh <- ackNextAppUISettingReveal(t, frontendConn, "allowed-callable-section")
	}()

	client := mustAuthenticatedMCPHTTPClient(t, app, server.URL)
	response, err := client.Post(
		server.URL+httpapi.RouteMCPToolCall,
		"application/json",
		strings.NewReader(`{
			"tool":"reveal_ui_setting",
			"arguments":{"projectConfigId":"project-alpha","settingId":"core.project.show_param_display_names","sectionIdToActivate":"allowed-callable-section","durationMs":1500},
			"agenticContext":{"projectConfigId":"project-alpha","allowUnscoped":true,"frontendAffinityToken":"`+frontendAffinityToken+`"}
		}`),
	)
	if err != nil {
		t.Fatalf("post reveal_ui_setting tool call route: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}
	if err := <-ackErrCh; err != nil {
		t.Fatalf("ack reveal websocket round-trip: %v", err)
	}

	payload := decodeAppToolCallRoutePayload(t, response.Body)
	if payload.IsError {
		t.Fatalf("expected reveal_ui_setting success, got %#v", payload.StructuredContent)
	}
	result := mustStructuredMapValue(t, payload.StructuredContent)
	statuses := mustStructuredListValue(t, result["statuses"])
	if len(statuses) != 1 || mustStructuredMapValue(t, statuses[0])["status"] != "revealed" {
		t.Fatalf("expected single revealed status, got %#v", statuses)
	}
}

func dialAppRevealFrontend(t *testing.T, app *App, serverURL string) (*websocket.Conn, string) {
	t.Helper()

	token, _, err := app.Auth().MintAuthCookie(time.Now().UTC())
	if err != nil {
		t.Fatalf("mint auth cookie: %v", err)
	}
	cookieName, err := app.Auth().CookieName("abc123")
	if err != nil {
		t.Fatalf("cookie name: %v", err)
	}

	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(serverURL, "http")+wsapi.RouteFrontend, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{cookieName + "=" + token},
		},
	})
	if err != nil {
		t.Fatalf("dial frontend websocket route: %v", err)
	}

	envelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeFrontendIdentity, 2)
	var identity realtime.FrontendIdentityContent
	if err := json.Unmarshal(envelope.Content, &identity); err != nil {
		t.Fatalf("decode frontend identity: %v", err)
	}
	if strings.TrimSpace(identity.FrontendAffinityToken) == "" {
		t.Fatal("expected frontend affinity token from frontend identity")
	}
	return conn, identity.FrontendAffinityToken
}

func ackNextAppUISettingReveal(t *testing.T, conn *websocket.Conn, expectedSectionID string) error {
	t.Helper()

	envelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeUISettingReveal, 3)
	var content realtime.UISettingRevealContent
	if err := json.Unmarshal(envelope.Content, &content); err != nil {
		return err
	}
	if content.ActiveSectionID == nil || *content.ActiveSectionID != expectedSectionID {
		return io.ErrUnexpectedEOF
	}
	if strings.TrimSpace(content.RequestID) == "" {
		return io.ErrUnexpectedEOF
	}
	if len(content.Reveals) != 1 || content.Reveals[0].SettingID != "core.project.show_param_display_names" {
		return io.ErrUnexpectedEOF
	}
	if content.Reveals[0].Strategy != "dom_anchor" {
		return io.ErrUnexpectedEOF
	}
	if content.Reveals[0].AnchorID == nil || *content.Reveals[0].AnchorID != "core.project.show_param_display_names" {
		return io.ErrUnexpectedEOF
	}

	payload, err := json.Marshal(realtime.UISettingRevealResultMessage{
		MessageType: realtime.MessageTypeUISettingRevealResult,
		Content: realtime.UISettingRevealResultContent{
			ProjectConfigID: content.ProjectConfigID,
			RequestID:       content.RequestID,
			Statuses: []realtime.UISettingRevealResultStatus{
				{
					SettingID:    "core.project.show_param_display_names",
					Status:       "revealed",
					ErrorCode:    nil,
					ErrorMessage: nil,
				},
			},
		},
	})
	if err != nil {
		return err
	}

	writeCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	return conn.Write(writeCtx, websocket.MessageText, payload)
}
