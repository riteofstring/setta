package app

import (
	"bufio"
	"bytes"
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
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"
	"setta/internal/agentprofiles"
	appdefinition "setta/internal/appsubsystem/appdefinition"
	"setta/internal/appsubsystem/appspec"
	"setta/internal/config"
	"setta/internal/httpapi"
	"setta/internal/mcpx"
	"setta/internal/observability"
	"setta/internal/projectstate"
	"setta/internal/realtime"
	"setta/internal/terminals"
	"setta/internal/wsapi"
)

func assertInstalledPythonPackages(t *testing.T, packages []string) {
	t.Helper()

	if len(packages) == 0 {
		t.Fatal("expected at least one installed Python package")
	}
	for index, pkg := range packages {
		if !strings.Contains(pkg, "=") {
			t.Fatalf("expected name=version package entry, got %q", pkg)
		}
		parts := strings.SplitN(pkg, "=", 2)
		if strings.TrimSpace(parts[0]) == "" || strings.TrimSpace(parts[1]) == "" {
			t.Fatalf("expected non-empty name and version, got %q", pkg)
		}
		if index > 0 && strings.ToLower(packages[index-1]) > strings.ToLower(pkg) {
			t.Fatalf("expected case-insensitive sorted package list, got %#v", packages)
		}
	}
}

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
	saveAppScopedMCPProject(t, cfg)
	enableAppSubsystemPluginForTest(t, cfg)

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
	if len(toolsResult.Tools) != 74 {
		t.Fatalf("expected 74 tools, got %d", len(toolsResult.Tools))
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
	if len(rawNames) != 74 {
		t.Fatalf("expected 74 registered tool names, got %d", len(rawNames))
	}
	if !containsStructuredStringValue(rawNames, "getInstalledPythonPackages") {
		t.Fatalf("expected getInstalledPythonPackages in registered tool names, got %#v", rawNames)
	}
	if !containsStructuredStringValue(rawNames, "get_app_definition") {
		t.Fatalf("expected get_app_definition in registered tool names, got %#v", rawNames)
	}
	if !containsStructuredStringValue(rawNames, "set_app_definition") {
		t.Fatalf("expected set_app_definition in registered tool names, got %#v", rawNames)
	}
	if !containsStructuredStringValue(rawNames, "stream_app_definition") {
		t.Fatalf("expected stream_app_definition in registered tool names, got %#v", rawNames)
	}
	if !containsStructuredStringValue(rawNames, "format_code") {
		t.Fatalf("expected format_code in registered tool names, got %#v", rawNames)
	}
	if !containsStructuredStringValue(rawNames, "getProjectConfigNamesAndIds") {
		t.Fatalf("expected getProjectConfigNamesAndIds in registered tool names, got %#v", rawNames)
	}
	if !containsStructuredStringValue(rawNames, "set_gen_code_prefix") {
		t.Fatalf("expected set_gen_code_prefix in registered tool names, got %#v", rawNames)
	}
	if !containsStructuredStringValue(rawNames, "set_gen_code_suffix") {
		t.Fatalf("expected set_gen_code_suffix in registered tool names, got %#v", rawNames)
	}
	if !containsStructuredStringValue(rawNames, "getTerminalOutput") {
		t.Fatalf("expected getTerminalOutput in registered tool names, got %#v", rawNames)
	}
	if !containsStructuredStringValue(rawNames, "get_agent_profile") {
		t.Fatalf("expected get_agent_profile in registered tool names, got %#v", rawNames)
	}
	if !containsStructuredStringValue(rawNames, "get_app_catalog") {
		t.Fatalf("expected get_app_catalog in registered tool names, got %#v", rawNames)
	}
	if !containsStructuredStringValue(rawNames, "get_mcp_server_runtime_status") {
		t.Fatalf("expected get_mcp_server_runtime_status in registered tool names, got %#v", rawNames)
	}
	if !containsStructuredStringValue(rawNames, "get_setta_docs") {
		t.Fatalf("expected get_setta_docs in registered tool names, got %#v", rawNames)
	}
	if !containsStructuredStringValue(rawNames, "get_ui_setting_value") {
		t.Fatalf("expected get_ui_setting_value in registered tool names, got %#v", rawNames)
	}
	if !containsStructuredStringValue(rawNames, "install_plugin") {
		t.Fatalf("expected install_plugin in registered tool names, got %#v", rawNames)
	}
	if !containsStructuredStringValue(rawNames, "list_app_components") {
		t.Fatalf("expected list_app_components in registered tool names, got %#v", rawNames)
	}
	if !containsStructuredStringValue(rawNames, "list_agent_profiles") {
		t.Fatalf("expected list_agent_profiles in registered tool names, got %#v", rawNames)
	}
	if !containsStructuredStringValue(rawNames, "report_completion_status") {
		t.Fatalf("expected report_completion_status in registered tool names, got %#v", rawNames)
	}
	if !containsStructuredStringValue(rawNames, "rescan_plugins") {
		t.Fatalf("expected rescan_plugins in registered tool names, got %#v", rawNames)
	}
	if !containsStructuredStringValue(rawNames, "reveal_ui_setting") {
		t.Fatalf("expected reveal_ui_setting in registered tool names, got %#v", rawNames)
	}
	if !containsStructuredStringValue(rawNames, "rollback_plugin") {
		t.Fatalf("expected rollback_plugin in registered tool names, got %#v", rawNames)
	}
	if !containsStructuredStringValue(rawNames, "run_agent_profile") {
		t.Fatalf("expected run_agent_profile in registered tool names, got %#v", rawNames)
	}
	if !containsStructuredStringValue(rawNames, "set_group_overflow_mode") {
		t.Fatalf("expected set_group_overflow_mode in registered tool names, got %#v", rawNames)
	}
	if !containsStructuredStringValue(rawNames, "set_default_section_variant") {
		t.Fatalf("expected set_default_section_variant in registered tool names, got %#v", rawNames)
	}
	if !containsStructuredStringValue(rawNames, "set_section_variant") {
		t.Fatalf("expected set_section_variant in registered tool names, got %#v", rawNames)
	}
	if !containsStructuredStringValue(rawNames, "set_section_variant_sort_order") {
		t.Fatalf("expected set_section_variant_sort_order in registered tool names, got %#v", rawNames)
	}
	if !containsStructuredStringValue(rawNames, "update_app_definition") {
		t.Fatalf("expected update_app_definition in registered tool names, got %#v", rawNames)
	}
	if !containsStructuredStringValue(rawNames, "validate_app_definition") {
		t.Fatalf("expected validate_app_definition in registered tool names, got %#v", rawNames)
	}
	if !containsStructuredStringValue(rawNames, "search_mcp_tools") {
		t.Fatalf("expected search_mcp_tools in registered tool names, got %#v", rawNames)
	}
	if !containsStructuredStringValue(rawNames, "search_ui_settings") {
		t.Fatalf("expected search_ui_settings in registered tool names, got %#v", rawNames)
	}
	if !containsStructuredStringValue(rawNames, "toggle_group_orientation") {
		t.Fatalf("expected toggle_group_orientation in registered tool names, got %#v", rawNames)
	}
	if !containsStructuredStringValue(rawNames, "uninstall_plugin") {
		t.Fatalf("expected uninstall_plugin in registered tool names, got %#v", rawNames)
	}
	if !containsStructuredStringValue(rawNames, "set_ui_setting_value") {
		t.Fatalf("expected set_ui_setting_value in registered tool names, got %#v", rawNames)
	}
	if !containsStructuredStringValue(rawNames, "update_plugin") {
		t.Fatalf("expected update_plugin in registered tool names, got %#v", rawNames)
	}
	for _, removedTool := range []string{
		"set_watch_code_enabled",
		"set_watch_code_inputs",
		"compare_and_set_watch_code_enabled",
		"compare_and_set_watch_code_folders",
		"compare_and_set_watch_code_files",
	} {
		if containsStructuredStringValue(rawNames, removedTool) {
			t.Fatalf("expected removed Watch Code MCP tool %q to be absent, got %#v", removedTool, rawNames)
		}
	}

	missingContextResult, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name:      "read_file_range",
		Arguments: map[string]any{"path": "example.txt"},
	})
	if err != nil {
		t.Fatalf("call read_file_range missing context: %v", err)
	}
	if !missingContextResult.IsError {
		t.Fatal("expected read_file_range missing context to fail")
	}
	missingContextPayload := mustStructuredMapValue(t, missingContextResult.StructuredContent)
	if missingContextPayload["code"] != "scope_violation" {
		t.Fatalf("expected scope_violation code, got %#v", missingContextPayload["code"])
	}
	if missingContextPayload["reason"] != "missing_context" {
		t.Fatalf("expected missing_context reason, got %#v", missingContextPayload["reason"])
	}

	setContextResult, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_agentic_context",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"chatId":          "chat-1",
			"sectionId":       "chat-section",
		},
	})
	if err != nil {
		t.Fatalf("call set_agentic_context: %v", err)
	}
	if setContextResult.IsError {
		t.Fatalf("expected set_agentic_context success, got %#v", setContextResult.StructuredContent)
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
		t.Fatalf("call read_file_range after context: %v", err)
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

	summaryResult, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name:      "get_latest_project_state_summary",
		Arguments: map[string]any{"projectConfigId": "project-alpha"},
	})
	if err != nil {
		t.Fatalf("call get_latest_project_state_summary: %v", err)
	}
	if summaryResult.IsError {
		t.Fatalf("expected summary success, got %#v", summaryResult.StructuredContent)
	}
	summaryPayload := mustStructuredMapValue(t, summaryResult.StructuredContent)
	sections := mustStructuredListValue(t, summaryPayload["sections"])
	if len(sections) != 4 {
		t.Fatalf("expected four scoped sections in summary, got %#v", sections)
	}
	projectConfig := mustStructuredMapValue(t, summaryPayload["projectConfig"])
	sectionVariantMap := mustStructuredMapValue(t, projectConfig["sectionVariantMap"])
	if len(sectionVariantMap) != 4 {
		t.Fatalf("expected four scoped section variants, got %#v", sectionVariantMap)
	}
	if _, ok := sectionVariantMap["blocked-section"]; ok {
		t.Fatalf("did not expect blocked-section in scoped summary, got %#v", sectionVariantMap)
	}
	if _, ok := sectionVariantMap["blocked-callable-section"]; ok {
		t.Fatalf("did not expect blocked-callable-section in scoped summary, got %#v", sectionVariantMap)
	}
	if _, ok := sectionVariantMap["blocked-params-section"]; ok {
		t.Fatalf("did not expect blocked-params-section in scoped summary, got %#v", sectionVariantMap)
	}

	diagnosticsResult, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name:      "get_latest_lsp_diagnostics",
		Arguments: map[string]any{"projectConfigId": "project-alpha"},
	})
	if err != nil {
		t.Fatalf("call get_latest_lsp_diagnostics: %v", err)
	}
	if diagnosticsResult.IsError {
		t.Fatalf("expected diagnostics success, got %#v", diagnosticsResult.StructuredContent)
	}
	diagnosticsPayload := mustStructuredMapValue(t, diagnosticsResult.StructuredContent)
	codeSections := mustStructuredMapValue(t, diagnosticsPayload["codeSections"])
	if len(codeSections) != 0 {
		t.Fatalf("expected no diagnostics before registry population, got %#v", codeSections)
	}
}

func TestAppIDEMCPServerAuthenticatedSSEHandshakeEmitsEndpointEvent(t *testing.T) {
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

	request, err := http.NewRequest(http.MethodGet, server.URL+"/mcp", nil)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	response, err := mustAuthenticatedMCPHTTPClient(t, app, server.URL).Do(request)
	if err != nil {
		t.Fatalf("connect raw authenticated sse client: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}
	if contentType := response.Header.Get("Content-Type"); !strings.Contains(contentType, "text/event-stream") {
		t.Fatalf("expected SSE content type, got %q", contentType)
	}

	reader := bufio.NewReader(response.Body)
	eventLine, err := reader.ReadString('\n')
	if err != nil {
		t.Fatalf("read endpoint event line: %v", err)
	}
	dataLine, err := reader.ReadString('\n')
	if err != nil {
		t.Fatalf("read endpoint data line: %v", err)
	}
	if strings.TrimSpace(eventLine) != "event: endpoint" {
		t.Fatalf("expected first SSE event to be endpoint, got %q", eventLine)
	}
	if !strings.HasPrefix(strings.TrimSpace(dataLine), "data: /mcp?sessionid=") {
		t.Fatalf("expected endpoint data to expose /mcp?sessionid=..., got %q", dataLine)
	}
}

func TestAppIDEMCPServerSupportsAuthenticatedStreamableHTTPToolListing(t *testing.T) {
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
	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+wsapi.RouteFrontend, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{authCookie.Name + "=" + authCookie.Value},
		},
	})
	if err != nil {
		t.Fatalf("dial frontend websocket route: %v", err)
	}
	defer conn.CloseNow()

	_ = readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeFrontendIdentity, 2)

	client := sdkmcp.NewClient(&sdkmcp.Implementation{Name: "test-client", Version: "0.1.0"}, nil)
	session, err := client.Connect(context.Background(), &sdkmcp.StreamableClientTransport{
		Endpoint:   server.URL + "/mcp",
		HTTPClient: mustAuthenticatedMCPHTTPClient(t, app, server.URL),
	}, nil)
	if err != nil {
		t.Fatalf("connect authenticated streamable-http mcp client: %v", err)
	}
	defer session.Close()

	toolsResult, err := session.ListTools(context.Background(), nil)
	if err != nil {
		t.Fatalf("list tools over streamable-http: %v", err)
	}
	if len(toolsResult.Tools) == 0 {
		t.Fatal("expected streamable-http tool listing to return Setta tools")
	}

	foundListMCPTools := false
	for _, tool := range toolsResult.Tools {
		if tool.Name == "list_mcp_tools" {
			foundListMCPTools = true
			break
		}
	}
	if !foundListMCPTools {
		t.Fatalf("expected list_mcp_tools in streamable-http tool listing, got %#v", toolsResult.Tools)
	}
}

func TestAppIDEMCPServerSupportsCreateTopLevelSectionAfterProjectSummaryOverAuthenticatedStreamableHTTP(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)
	mustEnableAppSavedPythonCodegen(t, cfg)

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
	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+wsapi.RouteFrontend, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{authCookie.Name + "=" + authCookie.Value},
		},
	})
	if err != nil {
		t.Fatalf("dial frontend websocket route: %v", err)
	}
	defer conn.CloseNow()

	_ = readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeFrontendIdentity, 2)

	client := sdkmcp.NewClient(&sdkmcp.Implementation{Name: "test-client", Version: "0.1.0"}, nil)
	session, err := client.Connect(context.Background(), &sdkmcp.StreamableClientTransport{
		Endpoint:   server.URL + "/mcp",
		HTTPClient: mustAuthenticatedMCPHTTPClient(t, app, server.URL),
	}, nil)
	if err != nil {
		t.Fatalf("connect authenticated streamable-http mcp client: %v", err)
	}
	defer session.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	result, err := session.CallTool(ctx, &sdkmcp.CallToolParams{
		Name: "set_agentic_context",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   true,
		},
	})
	if err != nil {
		t.Fatalf("call set_agentic_context over streamable-http: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected set_agentic_context success, got %#v", result.StructuredContent)
	}

	result, err = session.CallTool(ctx, &sdkmcp.CallToolParams{
		Name:      "getProjectConfigNamesAndIds",
		Arguments: map[string]any{},
	})
	if err != nil {
		t.Fatalf("call getProjectConfigNamesAndIds over streamable-http: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected getProjectConfigNamesAndIds success, got %#v", result.StructuredContent)
	}

	result, err = session.CallTool(ctx, &sdkmcp.CallToolParams{
		Name: "get_latest_project_state_summary",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
		},
	})
	if err != nil {
		t.Fatalf("call get_latest_project_state_summary over streamable-http: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected get_latest_project_state_summary success, got %#v", result.StructuredContent)
	}

	beforeProject, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before create_top_level_section: %v", err)
	}
	beforeSectionIDs := map[string]struct{}{}
	for sectionID := range beforeProject.Sections {
		beforeSectionIDs[sectionID] = struct{}{}
	}

	result, err = session.CallTool(ctx, &sdkmcp.CallToolParams{
		Name: "create_top_level_section",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"implType":        "Callable",
		},
	})
	if err != nil {
		t.Fatalf("call create_top_level_section over streamable-http after summary: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected create_top_level_section success, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMapValue(t, result.StructuredContent)
	sectionID, ok := payload["sectionId"].(string)
	if !ok || strings.TrimSpace(sectionID) == "" {
		t.Fatalf("expected created section id, got %#v", payload["sectionId"])
	}

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after create_top_level_section: %v", err)
	}
	var canonicalSectionID string
	for currentSectionID := range project.Sections {
		if _, existed := beforeSectionIDs[currentSectionID]; !existed {
			canonicalSectionID = currentSectionID
			break
		}
	}
	if canonicalSectionID == "" {
		t.Fatalf("expected one new canonical section after create_top_level_section, got %#v", project.Sections)
	}
	if sectionID == canonicalSectionID {
		t.Fatalf("expected translated section id to differ from canonical %q", canonicalSectionID)
	}

	envelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeUpdateFrontendProjectState, 6)
	var update realtime.ProjectStateUpdateContent
	if err := json.Unmarshal(envelope.Content, &update); err != nil {
		t.Fatalf("decode project state update content: %v", err)
	}
	if update.ProjectState.ProjectConfig.ID != "project-alpha" {
		t.Fatalf("expected project-alpha state update, got %q", update.ProjectState.ProjectConfig.ID)
	}
	if _, ok := update.ProjectState.Sections[canonicalSectionID]; !ok {
		t.Fatalf("expected websocket update to include created canonical section %q", canonicalSectionID)
	}
}

func TestAppIDEMCPServerSupportsUtilityReadToolsOverAuthenticatedSSE(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)
	enableAppSubsystemPluginForTest(t, cfg)
	seedAppSettaDocsBundle(t, cfg.Paths.WorkspaceRoot)

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

	searchResult, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "search_mcp_tools",
		Arguments: map[string]any{
			"query": "section size settings",
			"limit": 2,
		},
	})
	if err != nil {
		t.Fatalf("call search_mcp_tools: %v", err)
	}
	if searchResult.IsError {
		t.Fatalf("expected search_mcp_tools success, got %#v", searchResult.StructuredContent)
	}
	searchPayload := mustStructuredMapValue(t, searchResult.StructuredContent)
	searchEntries := mustStructuredListValue(t, searchPayload["results"])
	if len(searchEntries) == 0 || mustStructuredMapValue(t, searchEntries[0])["name"] != "set_section_sizes" {
		t.Fatalf("expected set_section_sizes search result, got %#v", searchEntries)
	}

	projectsResult, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name:      "getProjectConfigNamesAndIds",
		Arguments: map[string]any{},
	})
	if err != nil {
		t.Fatalf("call getProjectConfigNamesAndIds: %v", err)
	}
	if projectsResult.IsError {
		t.Fatalf("expected getProjectConfigNamesAndIds success, got %#v", projectsResult.StructuredContent)
	}
	projectsPayload := mustStructuredMapValue(t, projectsResult.StructuredContent)
	projectConfigs := mustStructuredListValue(t, projectsPayload["projectConfigs"])
	if len(projectConfigs) != 1 || mustStructuredMapValue(t, projectConfigs[0])["id"] != "project-alpha" {
		t.Fatalf("expected one project-alpha metadata entry, got %#v", projectConfigs)
	}

	packagesResult, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name:      "getInstalledPythonPackages",
		Arguments: map[string]any{},
	})
	if err != nil {
		t.Fatalf("call getInstalledPythonPackages: %v", err)
	}
	if packagesResult.IsError {
		t.Fatalf("expected getInstalledPythonPackages success, got %#v", packagesResult.StructuredContent)
	}
	packagesPayload := mustStructuredMapValue(t, packagesResult.StructuredContent)
	packages := mustStringSliceValue(t, packagesPayload["packages"])
	assertInstalledPythonPackages(t, packages)

	catalogResult, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name:      "get_app_catalog",
		Arguments: map[string]any{},
	})
	if err != nil {
		t.Fatalf("call get_app_catalog: %v", err)
	}
	if catalogResult.IsError {
		t.Fatalf("expected get_app_catalog success, got %#v", catalogResult.StructuredContent)
	}
	catalogPayload := mustStructuredMapValue(t, catalogResult.StructuredContent)
	catalog := mustStructuredMapValue(t, catalogPayload["catalog"])
	if catalog["id"] != appspec.DefaultCatalogID {
		t.Fatalf("expected catalog id %q, got %#v", appspec.DefaultCatalogID, catalog["id"])
	}

	componentsResult, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name:      "list_app_components",
		Arguments: map[string]any{},
	})
	if err != nil {
		t.Fatalf("call list_app_components: %v", err)
	}
	if componentsResult.IsError {
		t.Fatalf("expected list_app_components success, got %#v", componentsResult.StructuredContent)
	}
	componentsPayload := mustStructuredMapValue(t, componentsResult.StructuredContent)
	componentTypes := mustStringSliceValue(t, componentsPayload["components"])
	if len(componentTypes) == 0 || componentTypes[0] != "Stack" {
		t.Fatalf("expected ordered component list, got %#v", componentTypes)
	}

	docsResult, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name:      "get_setta_docs",
		Arguments: map[string]any{},
	})
	if err != nil {
		t.Fatalf("call get_setta_docs: %v", err)
	}
	if docsResult.IsError {
		t.Fatalf("expected get_setta_docs success, got %#v", docsResult.StructuredContent)
	}
	docsPayload := mustStructuredMapValue(t, docsResult.StructuredContent)
	docs := mustStructuredListValue(t, docsPayload["docs"])
	if len(docs) != 4 {
		t.Fatalf("expected four default docs, got %#v", docs)
	}
}

func TestAppIDEMCPServerRegistersPluginBackendMCPTools(t *testing.T) {
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

	var readTool *sdkmcp.Tool
	var writeTool *sdkmcp.Tool
	for _, tool := range toolsResult.Tools {
		if tool.Name == "setta_fixture_mcp_read" {
			readTool = tool
		}
		if tool.Name == "setta_fixture_mcp_write" {
			writeTool = tool
		}
	}
	if readTool == nil || writeTool == nil {
		t.Fatalf("expected plugin backend MCP tools in list, got %#v", toolsResult.Tools)
	}
	if readTool.Annotations == nil || !readTool.Annotations.ReadOnlyHint {
		t.Fatalf("expected read-only hint on backend read tool, got %#v", readTool.Annotations)
	}
	if writeTool.Annotations != nil && writeTool.Annotations.ReadOnlyHint {
		t.Fatalf("expected write tool to omit read-only hint, got %#v", writeTool.Annotations)
	}
	readMeta, ok := readTool.Meta["setta"].(map[string]any)
	if !ok {
		t.Fatalf("expected setta metadata on backend read tool, got %#v", readTool.Meta)
	}
	writeMeta, ok := writeTool.Meta["setta"].(map[string]any)
	if !ok {
		t.Fatalf("expected setta metadata on backend write tool, got %#v", writeTool.Meta)
	}
	if readMeta["accessType"] != "read" {
		t.Fatalf("expected read access type on backend read tool, got %#v", readMeta["accessType"])
	}
	if writeMeta["accessType"] != "write" {
		t.Fatalf("expected write access type on backend write tool, got %#v", writeMeta["accessType"])
	}

	setContextResult, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_agentic_context",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"chatId":          "chat-1",
			"sectionId":       "chat-section",
		},
	})
	if err != nil {
		t.Fatalf("call set_agentic_context: %v", err)
	}
	if setContextResult.IsError {
		t.Fatalf("expected set_agentic_context success, got %#v", setContextResult.StructuredContent)
	}

	readResult, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "setta_fixture_mcp_read",
		Arguments: map[string]any{
			"value": "alpha",
		},
	})
	if err != nil {
		t.Fatalf("call plugin backend read tool: %v", err)
	}
	if readResult.IsError {
		t.Fatalf("expected plugin backend read tool success, got %#v", readResult.StructuredContent)
	}
	readPayload, ok := readResult.StructuredContent.(string)
	if !ok {
		t.Fatalf("expected string read payload, got %#v", readResult.StructuredContent)
	}
	if readPayload != "read:setta-fixture-backend-mcp-tools:alpha" {
		t.Fatalf("unexpected plugin backend read payload %q", readPayload)
	}

	searchResult, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "search_mcp_tools",
		Arguments: map[string]any{
			"query": "fixture mcp read",
			"limit": 5,
		},
	})
	if err != nil {
		t.Fatalf("call search_mcp_tools: %v", err)
	}
	if searchResult.IsError {
		t.Fatalf("expected search_mcp_tools success, got %#v", searchResult.StructuredContent)
	}
	searchPayload := mustStructuredMapValue(t, searchResult.StructuredContent)
	results := mustStructuredListValue(t, searchPayload["results"])
	if len(results) == 0 {
		t.Fatalf("expected search results, got %#v", searchPayload["results"])
	}

	foundReadTool := false
	for _, entry := range results {
		result := mustStructuredMapValue(t, entry)
		if result["name"] == "setta_fixture_mcp_read" {
			foundReadTool = true
			break
		}
	}
	if !foundReadTool {
		t.Fatalf("expected plugin backend read tool in search results, got %#v", results)
	}
}

func TestAppIDEMCPServerSupportsReportCompletionStatusOverAuthenticatedSSE(t *testing.T) {
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
			"chatId":          "chat-1",
			"sectionId":       "chat-section",
		},
	})
	if err != nil {
		t.Fatalf("call set_agentic_context: %v", err)
	}
	if setContextResult.IsError {
		t.Fatalf("expected set_agentic_context success, got %#v", setContextResult.StructuredContent)
	}

	result, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "report_completion_status",
		Arguments: map[string]any{
			"taskId":               " task-a ",
			"completionIntent":     true,
			"requiresVerification": true,
			"checkResults": []any{
				map[string]any{
					"checkName": "pytest",
					"status":    "passed",
					"details":   "  ok  ",
					"source":    "  go test  ",
				},
				map[string]any{
					"checkName": "lint",
					"required":  false,
					"status":    "failed",
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("call report_completion_status: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected report_completion_status success, got %#v", result.StructuredContent)
	}
	payload := mustStructuredMapValue(t, result.StructuredContent)
	if payload["taskId"] != "task-a" {
		t.Fatalf("expected trimmed taskId, got %#v", payload["taskId"])
	}
	if payload["verificationStatus"] != "passed" {
		t.Fatalf("expected verificationStatus passed, got %#v", payload["verificationStatus"])
	}
	checkResults := mustStructuredListValue(t, payload["checkResults"])
	if len(checkResults) != 2 {
		t.Fatalf("expected two check results, got %#v", checkResults)
	}
	firstCheck := mustStructuredMapValue(t, checkResults[0])
	if firstCheck["details"] != "ok" {
		t.Fatalf("expected trimmed details, got %#v", firstCheck["details"])
	}
	if firstCheck["source"] != "go test" {
		t.Fatalf("expected trimmed source, got %#v", firstCheck["source"])
	}
}

func TestAppIDEMCPServerSupportsAgentProfileReadToolsOverAuthenticatedSSE(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)
	saveAppAgentProfiles(t, cfg, []agentprofiles.Profile{
		{
			ID:                          "profile-alpha",
			Name:                        "Alpha",
			Description:                 "Primary profile",
			SystemPrompt:                "You are alpha.",
			EnableBackgroundSummaryFill: true,
			EnableLlmChatTitles:         true,
			ToolAllowlist:               []string{"tool.a"},
		},
		{
			ID:           "profile-beta",
			Name:         "Beta",
			SystemPrompt: "You are beta.",
		},
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

	listResult, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name:      "list_agent_profiles",
		Arguments: map[string]any{},
	})
	if err != nil {
		t.Fatalf("call list_agent_profiles: %v", err)
	}
	if listResult.IsError {
		t.Fatalf("expected list_agent_profiles success, got %#v", listResult.StructuredContent)
	}
	listPayload := mustStructuredMapValue(t, listResult.StructuredContent)
	profiles := mustStructuredListValue(t, listPayload["profiles"])
	if len(profiles) != 2 {
		t.Fatalf("expected two agent profiles, got %#v", profiles)
	}

	getResult, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_agent_profile",
		Arguments: map[string]any{
			"profileId": "profile-alpha",
		},
	})
	if err != nil {
		t.Fatalf("call get_agent_profile: %v", err)
	}
	if getResult.IsError {
		t.Fatalf("expected get_agent_profile success, got %#v", getResult.StructuredContent)
	}
	profile := mustStructuredMapValue(t, getResult.StructuredContent)
	if profile["name"] != "Alpha" {
		t.Fatalf("expected Alpha profile, got %#v", profile)
	}
}

func TestAppIDEMCPServerSupportsRunAgentProfileOverAuthenticatedSSE(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)
	engineConfigID := "engine-primary"
	saveAppAgentProfiles(t, cfg, []agentprofiles.Profile{
		{
			ID:             "profile-alpha",
			Name:           "Alpha",
			Description:    "Primary profile",
			SystemPrompt:   "You are alpha.",
			EngineConfigID: &engineConfigID,
			ToolAllowlist:  []string{},
		},
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

	result, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "run_agent_profile",
		Arguments: map[string]any{
			"profileId": "profile-alpha",
			"inputs": map[string]any{
				"allowUnscoped": true,
			},
		},
	})
	if err != nil {
		t.Fatalf("call run_agent_profile: %v", err)
	}
	if !result.IsError {
		t.Fatalf("expected disabled run_agent_profile to fail, got %#v", result.StructuredContent)
	}
	payload := mustStructuredMapValue(t, result.StructuredContent)
	if payload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
	}
	if payload["message"] != `engine config not found: "engine-primary"` {
		t.Fatalf("expected missing engine-config message, got %#v", payload["message"])
	}
}

func TestAppIDEMCPServerSupportsGetMCPServerRuntimeStatusOverAuthenticatedSSE(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	cfg.Server.Host = "127.0.0.1"
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)

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

	client := sdkmcp.NewClient(&sdkmcp.Implementation{Name: "test-client", Version: "0.1.0"}, nil)
	session, err := client.Connect(context.Background(), &sdkmcp.SSEClientTransport{
		Endpoint:   serverURL + "/mcp",
		HTTPClient: mustAuthenticatedMCPHTTPClient(t, app, serverURL),
	}, nil)
	if err != nil {
		t.Fatalf("connect authenticated mcp client: %v", err)
	}
	defer session.Close()

	toolsResult, err := session.ListTools(context.Background(), nil)
	if err != nil {
		t.Fatalf("list tools: %v", err)
	}

	result, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name:      "get_mcp_server_runtime_status",
		Arguments: map[string]any{},
	})
	if err != nil {
		t.Fatalf("call get_mcp_server_runtime_status: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected get_mcp_server_runtime_status success, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMapValue(t, result.StructuredContent)
	servers := mustStructuredListValue(t, payload["servers"])
	if len(servers) != 1 {
		t.Fatalf("expected one server status, got %#v", servers)
	}
	serverStatus := mustStructuredMapValue(t, servers[0])
	if serverStatus["serverId"] != mcpx.DefaultServerID {
		t.Fatalf("expected default server id, got %#v", serverStatus["serverId"])
	}
	if serverStatus["state"] != string(mcpx.RuntimeStateConnected) {
		t.Fatalf("expected connected runtime state, got %#v", serverStatus["state"])
	}
	if toolCount, ok := serverStatus["toolCount"].(float64); !ok || int(toolCount) != len(toolsResult.Tools) {
		t.Fatalf("expected toolCount %d, got %#v", len(toolsResult.Tools), serverStatus["toolCount"])
	}
}

func TestAppIDEMCPServerSupportsGetTerminalOutputOverAuthenticatedSSE(t *testing.T) {
	skipIfAppTerminalPTYUnsupported(t)

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

	sessionID := terminals.BuildTerminalID("allowed-section", "")
	if _, _, err := app.Terminals().Open(terminals.OpenOptions{
		ID:         sessionID,
		ProjectID:  "project-alpha",
		AllowInput: true,
		Command:    quietAppTestCatCommand(t),
	}); err != nil {
		t.Fatalf("open app terminal: %v", err)
	}
	attachment := attachAppTestTerminal(t, app.Terminals(), sessionID)
	if err := app.Terminals().Write(sessionID, []byte("authenticated sse terminal output\n")); err != nil {
		t.Fatalf("write terminal output: %v", err)
	}
	waitForAppTestOutputContains(t, app.Terminals(), sessionID, attachment, "authenticated sse terminal output")

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
			"chatId":          "chat-1",
			"sectionId":       "chat-section",
		},
	})
	if err != nil {
		t.Fatalf("call set_agentic_context: %v", err)
	}
	if setContextResult.IsError {
		t.Fatalf("expected set_agentic_context success, got %#v", setContextResult.StructuredContent)
	}

	result, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "getTerminalOutput",
		Arguments: map[string]any{
			"sectionId": "allowed-section",
		},
	})
	if err != nil {
		t.Fatalf("call getTerminalOutput: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected getTerminalOutput success, got %#v", result.StructuredContent)
	}
	history, ok := result.StructuredContent.(string)
	if !ok {
		t.Fatalf("expected string terminal history, got %#v", result.StructuredContent)
	}
	if !strings.Contains(history, "authenticated sse terminal output") {
		t.Fatalf("expected terminal history to include written output, got %q", history)
	}
}

func TestAppIDEMCPServerSupportsTemporaryIDsForGetTerminalOutputOverAuthenticatedSSE(t *testing.T) {
	skipIfAppTerminalPTYUnsupported(t)

	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)
	writeAppTemporaryIDMap(t, filepath.Join(cfg.Paths.RuntimeRoot, "temporary_id_map.json"), map[string]string{
		"project-alpha":   "11",
		"chat-1":          "12",
		"chat-section":    "13",
		"allowed-section": "14",
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

	sessionID := terminals.BuildTerminalID("allowed-section", "")
	if _, _, err := app.Terminals().Open(terminals.OpenOptions{
		ID:         sessionID,
		ProjectID:  "project-alpha",
		AllowInput: true,
		Command:    quietAppTestCatCommand(t),
	}); err != nil {
		t.Fatalf("open app terminal: %v", err)
	}
	attachment := attachAppTestTerminal(t, app.Terminals(), sessionID)
	if err := app.Terminals().Write(sessionID, []byte("temporary terminal output\n")); err != nil {
		t.Fatalf("write terminal output: %v", err)
	}
	waitForAppTestOutputContains(t, app.Terminals(), sessionID, attachment, "temporary terminal output")

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
			"chatId":          "12",
			"sectionId":       "13",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_agentic_context: %v", err)
	}
	if setContextResult.IsError {
		t.Fatalf("expected temp-id set_agentic_context success, got %#v", setContextResult.StructuredContent)
	}

	result, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "getTerminalOutput",
		Arguments: map[string]any{
			"sectionId": "14",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id getTerminalOutput: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id getTerminalOutput success, got %#v", result.StructuredContent)
	}
	history, ok := result.StructuredContent.(string)
	if !ok {
		t.Fatalf("expected string terminal history, got %#v", result.StructuredContent)
	}
	if !strings.Contains(history, "temporary terminal output") {
		t.Fatalf("expected terminal history to include written output, got %q", history)
	}
}

func TestAppIDEMCPServerSupportsTemporaryIDsOverAuthenticatedSSE(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)
	writeAppTemporaryIDMap(t, filepath.Join(cfg.Paths.RuntimeRoot, "temporary_id_map.json"), map[string]string{
		"project-alpha":            "11",
		"chat-1":                   "12",
		"chat-section":             "13",
		"allowed-section":          "14",
		"peer-chat-section":        "15",
		"allowed-variant":          "16",
		"peer-chat-variant":        "17",
		"blocked-section":          "18",
		"blocked-variant":          "19",
		"allowed-params-section":   "20",
		"allowed-params-variant":   "21",
		"allowed-param":            "22",
		"blocked-params-section":   "23",
		"blocked-param":            "24",
		"allowed-callable-section": "25",
		"blocked-callable-section": "26",
		"allowed-callable-2":       "27",
		"allowed-param-existing":   "28",
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

	result, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"chatId":          "12",
			"sectionId":       "13",
		},
		Name:      "get_latest_project_state_summary",
		Arguments: map[string]any{"projectConfigId": "11"},
	})
	if err != nil {
		t.Fatalf("call temp-id project summary: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id summary success, got %#v", result.StructuredContent)
	}

	summaryPayload := mustStructuredMapValue(t, result.StructuredContent)
	projectConfig := mustStructuredMapValue(t, summaryPayload["projectConfig"])
	if projectConfig["id"] != "11" {
		t.Fatalf("expected translated project id 11, got %#v", projectConfig["id"])
	}
	sectionVariantMap := mustStructuredMapValue(t, projectConfig["sectionVariantMap"])
	if _, ok := sectionVariantMap["14"]; !ok {
		t.Fatalf("expected translated allowed-section key 14, got %#v", sectionVariantMap)
	}
	if _, ok := sectionVariantMap["15"]; !ok {
		t.Fatalf("expected translated peer-chat-section key 15, got %#v", sectionVariantMap)
	}
	if _, ok := sectionVariantMap["20"]; !ok {
		t.Fatalf("expected translated allowed-params-section key 20, got %#v", sectionVariantMap)
	}
	if _, ok := sectionVariantMap["blocked-section"]; ok {
		t.Fatalf("did not expect canonical blocked-section key, got %#v", sectionVariantMap)
	}

	diagnosticsResult, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"chatId":          "12",
			"sectionId":       "13",
		},
		Name:      "get_latest_lsp_diagnostics",
		Arguments: map[string]any{"projectConfigId": "11"},
	})
	if err != nil {
		t.Fatalf("call temp-id diagnostics: %v", err)
	}
	if diagnosticsResult.IsError {
		t.Fatalf("expected temp-id diagnostics success, got %#v", diagnosticsResult.StructuredContent)
	}
	diagnosticsPayload := mustStructuredMapValue(t, diagnosticsResult.StructuredContent)
	if codeSections := mustStructuredMapValue(t, diagnosticsPayload["codeSections"]); len(codeSections) != 0 {
		t.Fatalf("expected no diagnostics before registry population, got %#v", codeSections)
	}

	writeResult, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"chatId":          "12",
			"sectionId":       "13",
		},
		Name: "set_code_section_diagnostics_mute",
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "14",
			"mute":            true,
		},
	})
	if err != nil {
		t.Fatalf("call temp-id scoped write: %v", err)
	}
	if writeResult.IsError {
		t.Fatalf("expected temp-id scoped write success, got %#v", writeResult.StructuredContent)
	}

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id scoped write: %v", err)
	}
	ignoreState, err := project.CodeSectionDiagnosticsIgnoreStateForSection("allowed-section")
	if err != nil {
		t.Fatalf("ignore state after temp-id scoped write: %v", err)
	}
	if !ignoreState.Muted {
		t.Fatalf("expected allowed-section to be muted, got %#v", ignoreState)
	}

	writeResult, err = session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"chatId":          "12",
			"sectionId":       "13",
		},
		Name: "set_code_obj_name",
		Arguments: map[string]any{
			"projectConfigId": "11",
			"codeObjId":       "22",
			"name":            "translated_name",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_code_obj_name: %v", err)
	}
	if writeResult.IsError {
		t.Fatalf("expected temp-id set_code_obj_name success, got %#v", writeResult.StructuredContent)
	}

	project, err = app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id set_code_obj_name: %v", err)
	}
	if got := project.CodeObjs["allowed-param"].Name; got != "translated_name" {
		t.Fatalf("expected translated code object name, got %q", got)
	}

	writeResult, err = session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"chatId":          "12",
			"sectionId":       "13",
		},
		Name: "set_param_name_and_value",
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "20",
			"codeObjId":       "22",
			"name":            "combined_name",
			"value":           "combined",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_param_name_and_value: %v", err)
	}
	if writeResult.IsError {
		t.Fatalf("expected temp-id set_param_name_and_value success, got %#v", writeResult.StructuredContent)
	}

	project, err = app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id set_param_name_and_value: %v", err)
	}
	if got := project.CodeObjs["allowed-param"].Name; got != "combined_name" {
		t.Fatalf("expected combined code object name, got %q", got)
	}
	paramPayload, _, _, _, err := project.ResolveSectionCodeObject("allowed-params-section", "allowed-param")
	if err != nil {
		t.Fatalf("resolve allowed-param after temp-id set_param_name_and_value: %v", err)
	}
	if got := paramPayload["value"]; got != "combined" {
		t.Fatalf("expected combined param value, got %#v", got)
	}

	writeResult, err = session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"chatId":          "12",
			"sectionId":       "13",
		},
		Name: "set_callable",
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "25",
			"callableName":    "sorted",
			"refetchParams":   false,
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_callable: %v", err)
	}
	if writeResult.IsError {
		t.Fatalf("expected temp-id set_callable success, got %#v", writeResult.StructuredContent)
	}
	callablePayload := mustStructuredMapValue(t, writeResult.StructuredContent)
	if callablePayload["callableId"] != "27" {
		t.Fatalf("expected translated callable id 27, got %#v", callablePayload["callableId"])
	}
	childCodeObjs := mustStructuredListValue(t, callablePayload["childCodeObjs"])
	if len(childCodeObjs) != 1 {
		t.Fatalf("expected one translated callable child, got %#v", childCodeObjs)
	}
	firstChild := mustStructuredMapValue(t, childCodeObjs[0])
	if firstChild["codeObjId"] != "28" {
		t.Fatalf("expected translated child code-object id 28, got %#v", firstChild["codeObjId"])
	}

	writeResult, err = session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"chatId":          "12",
			"sectionId":       "13",
		},
		Name: "add_kwarg",
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "25",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id add_kwarg: %v", err)
	}
	if writeResult.IsError {
		t.Fatalf("expected temp-id add_kwarg success, got %#v", writeResult.StructuredContent)
	}
	addKwargPayload := mustStructuredMapValue(t, writeResult.StructuredContent)
	addedTempCodeObjID, ok := addKwargPayload["codeObjId"].(string)
	if !ok || addedTempCodeObjID == "" {
		t.Fatalf("expected temp-id add_kwarg codeObjId string, got %#v", addKwargPayload["codeObjId"])
	}

	writeResult, err = session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"chatId":          "12",
			"sectionId":       "13",
		},
		Name: "set_param_name_and_value",
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "25",
			"codeObjId":       addedTempCodeObjID,
			"name":            "temp_key",
			"value":           "None",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id callable set_param_name_and_value: %v", err)
	}
	if writeResult.IsError {
		t.Fatalf("expected temp-id callable set_param_name_and_value success, got %#v", writeResult.StructuredContent)
	}

	project, err = app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id add_kwarg rename/value: %v", err)
	}
	callableRootPayload, _, _, _, err := project.ResolveSectionCodeObject("allowed-callable-section", "allowed-callable-2")
	if err != nil {
		t.Fatalf("resolve allowed-callable-2 after temp-id add_kwarg: %v", err)
	}
	callableChildren := mustStringSliceValue(t, callableRootPayload["children"])
	if len(callableChildren) != 2 {
		t.Fatalf("expected two callable children after temp-id add_kwarg, got %#v", callableChildren)
	}
	canonicalAddedCodeObjID := callableChildren[1]
	temporaryMap := readAppTemporaryIDMap(t, filepath.Join(cfg.Paths.RuntimeRoot, "temporary_id_map.json"))
	if got := temporaryMap[canonicalAddedCodeObjID]; got != addedTempCodeObjID {
		t.Fatalf("expected temporary map %q -> %q, got %q", canonicalAddedCodeObjID, addedTempCodeObjID, got)
	}
	callableParamPayload, addedCallableParam, _, _, err := project.ResolveSectionCodeObject("allowed-callable-section", canonicalAddedCodeObjID)
	if err != nil {
		t.Fatalf("resolve added callable param after temp-id rename/value: %v", err)
	}
	if addedCallableParam.Name != "temp_key" {
		t.Fatalf("expected added callable param name temp_key, got %q", addedCallableParam.Name)
	}
	if got := callableParamPayload["value"]; got != "None" {
		t.Fatalf("expected added callable param value None, got %#v", got)
	}

	writeResult, err = session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"chatId":          "12",
			"sectionId":       "13",
		},
		Name: "delete_kwarg",
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "25",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id delete_kwarg: %v", err)
	}
	if writeResult.IsError {
		t.Fatalf("expected temp-id delete_kwarg success, got %#v", writeResult.StructuredContent)
	}
	deleteKwargPayload := mustStructuredMapValue(t, writeResult.StructuredContent)
	if got := deleteKwargPayload["codeObjId"]; got != addedTempCodeObjID {
		t.Fatalf("expected translated deleted codeObjId %q, got %#v", addedTempCodeObjID, got)
	}

	project, err = app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id delete_kwarg: %v", err)
	}
	callableRootPayload, _, _, _, err = project.ResolveSectionCodeObject("allowed-callable-section", "allowed-callable-2")
	if err != nil {
		t.Fatalf("resolve allowed-callable-2 after temp-id delete_kwarg: %v", err)
	}
	callableChildren = mustStringSliceValue(t, callableRootPayload["children"])
	if len(callableChildren) != 1 || callableChildren[0] != "allowed-param-existing" {
		t.Fatalf("expected callable children [allowed-param-existing] after temp-id delete_kwarg, got %#v", callableChildren)
	}
	if _, ok := project.CodeObjs[canonicalAddedCodeObjID]; ok {
		t.Fatalf("expected canonical deleted callable param %q to be pruned after temp-id delete_kwarg", canonicalAddedCodeObjID)
	}

	writeResult, err = session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"chatId":          "12",
			"sectionId":       "13",
		},
		Name: "add_kwarg",
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "25",
		},
	})
	if err != nil {
		t.Fatalf("call second temp-id add_kwarg: %v", err)
	}
	if writeResult.IsError {
		t.Fatalf("expected second temp-id add_kwarg success, got %#v", writeResult.StructuredContent)
	}
	addKwargPayload = mustStructuredMapValue(t, writeResult.StructuredContent)
	secondAddedTempCodeObjID, ok := addKwargPayload["codeObjId"].(string)
	if !ok || secondAddedTempCodeObjID == "" {
		t.Fatalf("expected second temp-id add_kwarg codeObjId string, got %#v", addKwargPayload["codeObjId"])
	}

	project, err = app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after second temp-id add_kwarg: %v", err)
	}
	callableRootPayload, _, _, _, err = project.ResolveSectionCodeObject("allowed-callable-section", "allowed-callable-2")
	if err != nil {
		t.Fatalf("resolve allowed-callable-2 after second temp-id add_kwarg: %v", err)
	}
	callableChildren = mustStringSliceValue(t, callableRootPayload["children"])
	if len(callableChildren) != 2 {
		t.Fatalf("expected two callable children after second temp-id add_kwarg, got %#v", callableChildren)
	}
	secondCanonicalAddedCodeObjID := callableChildren[1]
	temporaryMap = readAppTemporaryIDMap(t, filepath.Join(cfg.Paths.RuntimeRoot, "temporary_id_map.json"))
	if got := temporaryMap[secondCanonicalAddedCodeObjID]; got != secondAddedTempCodeObjID {
		t.Fatalf("expected temporary map %q -> %q after second temp-id add, got %q", secondCanonicalAddedCodeObjID, secondAddedTempCodeObjID, got)
	}

	writeResult, err = session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"chatId":          "12",
			"sectionId":       "13",
		},
		Name: "delete_selected_params",
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "25",
			"paramInfoIds":    []any{secondAddedTempCodeObjID},
		},
	})
	if err != nil {
		t.Fatalf("call temp-id delete_selected_params: %v", err)
	}
	if writeResult.IsError {
		t.Fatalf("expected temp-id delete_selected_params success, got %#v", writeResult.StructuredContent)
	}
	deleteSelectedParamsPayload := mustStructuredMapValue(t, writeResult.StructuredContent)
	deletedParamIDs := mustStringSliceValue(t, deleteSelectedParamsPayload["paramInfoIds"])
	if len(deletedParamIDs) != 1 || deletedParamIDs[0] != secondAddedTempCodeObjID {
		t.Fatalf("expected translated deleted paramInfoIds [%s], got %#v", secondAddedTempCodeObjID, deletedParamIDs)
	}

	project, err = app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id delete_selected_params: %v", err)
	}
	callableRootPayload, _, _, _, err = project.ResolveSectionCodeObject("allowed-callable-section", "allowed-callable-2")
	if err != nil {
		t.Fatalf("resolve allowed-callable-2 after temp-id delete_selected_params: %v", err)
	}
	callableChildren = mustStringSliceValue(t, callableRootPayload["children"])
	if len(callableChildren) != 1 || callableChildren[0] != "allowed-param-existing" {
		t.Fatalf("expected callable children [allowed-param-existing] after temp-id delete_selected_params, got %#v", callableChildren)
	}
	if _, ok := project.CodeObjs[secondCanonicalAddedCodeObjID]; ok {
		t.Fatalf("expected canonical deleted callable param %q to be pruned", secondCanonicalAddedCodeObjID)
	}

	writeResult, err = session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"chatId":          "12",
			"sectionId":       "13",
		},
		Name: "set_code_section_diagnostic_code_suppression",
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "14",
			"code":            "reportFoo",
			"suppress":        true,
		},
	})
	if err != nil {
		t.Fatalf("call temp-id scoped suppression: %v", err)
	}
	if writeResult.IsError {
		t.Fatalf("expected temp-id scoped suppression success, got %#v", writeResult.StructuredContent)
	}

	project, err = app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id scoped suppression: %v", err)
	}
	ignoreState, err = project.CodeSectionDiagnosticsIgnoreStateForSection("allowed-section")
	if err != nil {
		t.Fatalf("ignore state after temp-id scoped suppression: %v", err)
	}
	if len(ignoreState.SuppressedCodes) != 1 || ignoreState.SuppressedCodes[0] != "reportFoo" {
		t.Fatalf("expected reportFoo suppression, got %#v", ignoreState.SuppressedCodes)
	}

	writeResult, err = session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"chatId":          "12",
			"sectionId":       "13",
		},
		Name: "set_section_name",
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "14",
			"name":            "Translated Section",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_section_name: %v", err)
	}
	if writeResult.IsError {
		t.Fatalf("expected temp-id set_section_name success, got %#v", writeResult.StructuredContent)
	}

	project, err = app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id set_section_name: %v", err)
	}
	if got := project.Sections["allowed-section"].Name; got != "Translated Section" {
		t.Fatalf("expected translated section name, got %q", got)
	}

	writeResult, err = session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"chatId":          "12",
			"sectionId":       "13",
		},
		Name: "set_param_entered_value",
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "20",
			"paramInfoId":     "22",
			"value":           "translated",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_param_entered_value: %v", err)
	}
	if writeResult.IsError {
		t.Fatalf("expected temp-id set_param_entered_value success, got %#v", writeResult.StructuredContent)
	}

	project, err = app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id set_param_entered_value: %v", err)
	}
	paramPayload, _, _, _, err = project.ResolveSectionCodeObject("allowed-params-section", "allowed-param")
	if err != nil {
		t.Fatalf("resolve allowed-param after temp-id set_param_entered_value: %v", err)
	}
	if got := paramPayload["value"]; got != "translated" {
		t.Fatalf("expected translated param value, got %#v", got)
	}

	writeResult, err = session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"chatId":          "12",
			"sectionId":       "13",
		},
		Name: "set_type_error_ignore",
		Arguments: map[string]any{
			"projectConfigId":  "11",
			"sectionId":        "20",
			"paramInfoId":      "22",
			"ignoreTypeErrors": true,
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_type_error_ignore: %v", err)
	}
	if writeResult.IsError {
		t.Fatalf("expected temp-id set_type_error_ignore success, got %#v", writeResult.StructuredContent)
	}

	project, err = app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id set_type_error_ignore: %v", err)
	}
	typeErrorIgnoreState, err := project.TypeErrorIgnoreStateForSection("allowed-params-section")
	if err != nil {
		t.Fatalf("type error ignore state after temp-id set_type_error_ignore: %v", err)
	}
	if !typeErrorIgnoreState.Params["allowed-param"] {
		t.Fatalf("expected translated allowed-param type-error ignore state, got %#v", typeErrorIgnoreState)
	}

	writeResult, err = session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"chatId":          "12",
			"sectionId":       "13",
		},
		Name: "set_code_obj_display_name",
		Arguments: map[string]any{
			"projectConfigId": "11",
			"codeObjId":       "22",
			"displayName":     "Translated",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_code_obj_display_name: %v", err)
	}
	if writeResult.IsError {
		t.Fatalf("expected temp-id set_code_obj_display_name success, got %#v", writeResult.StructuredContent)
	}

	project, err = app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id set_code_obj_display_name: %v", err)
	}
	if got := project.CodeObjs["allowed-param"].DisplayName; got != "Translated" {
		t.Fatalf("expected translated display name, got %q", got)
	}

	if _, err := app.ProjectStates().Main().ChangeParamImpl(context.Background(), "project-alpha", "allowed-params-section", "allowed-param", "SliderParam"); err != nil {
		t.Fatalf("prepare slider impl before temp-id update_param_impl_config: %v", err)
	}
	if _, err := app.ProjectStates().Main().SetSectionCodeObjectValue(context.Background(), "project-alpha", "allowed-params-section", "allowed-param", "75"); err != nil {
		t.Fatalf("prepare slider value before temp-id update_param_impl_config: %v", err)
	}

	writeResult, err = session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"chatId":          "12",
			"sectionId":       "13",
		},
		Name: "update_param_impl_config",
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "20",
			"paramInfoId":     "22",
			"newConfig": map[string]any{
				"max": 10,
			},
		},
	})
	if err != nil {
		t.Fatalf("call temp-id update_param_impl_config: %v", err)
	}
	if writeResult.IsError {
		t.Fatalf("expected temp-id update_param_impl_config success, got %#v", writeResult.StructuredContent)
	}
	updateParamImplConfigPayload := mustStructuredMapValue(t, writeResult.StructuredContent)
	if updateParamImplConfigPayload["status"] != "ok" {
		t.Fatalf("expected temp-id update_param_impl_config status ok, got %#v", updateParamImplConfigPayload["status"])
	}

	project, err = app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id update_param_impl_config: %v", err)
	}
	paramPayload, _, _, _, err = project.ResolveSectionCodeObject("allowed-params-section", "allowed-param")
	if err != nil {
		t.Fatalf("resolve allowed-param after temp-id update_param_impl_config: %v", err)
	}
	if got := paramPayload["value"]; got != "10" {
		t.Fatalf("expected slider value to clamp to 10 after temp-id update, got %#v", got)
	}

	writeResult, err = session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"chatId":          "12",
			"sectionId":       "13",
		},
		Name: "change_param_impl",
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "20",
			"paramInfoId":     "22",
			"selectedId":      "PasswordParam",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id change_param_impl: %v", err)
	}
	if writeResult.IsError {
		t.Fatalf("expected temp-id change_param_impl success, got %#v", writeResult.StructuredContent)
	}
	changeParamImplPayload := mustStructuredMapValue(t, writeResult.StructuredContent)
	if changeParamImplPayload["status"] != "ok" {
		t.Fatalf("expected temp-id change_param_impl status ok, got %#v", changeParamImplPayload["status"])
	}

	project, err = app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id change_param_impl: %v", err)
	}
	paramPayload, _, _, paramImpl, err := project.ResolveSectionCodeObject("allowed-params-section", "allowed-param")
	if err != nil {
		t.Fatalf("resolve allowed-param after temp-id change_param_impl: %v", err)
	}
	if paramImpl.Type != "PasswordParam" {
		t.Fatalf("expected PasswordParam impl after temp-id change_param_impl, got %q", paramImpl.Type)
	}
	if got := paramPayload["hasSecret"]; got != true {
		t.Fatalf("expected hasSecret true after temp-id change_param_impl, got %#v", got)
	}

	blockedWriteResult, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"chatId":          "12",
			"sectionId":       "13",
		},
		Name: "set_code_section_diagnostics_mute",
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "18",
			"mute":            true,
		},
	})
	if err != nil {
		t.Fatalf("call temp-id blocked scoped write: %v", err)
	}
	if !blockedWriteResult.IsError {
		t.Fatal("expected blocked temp-id scoped write to fail")
	}
	blockedPayload := mustStructuredMapValue(t, blockedWriteResult.StructuredContent)
	if blockedPayload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", blockedPayload["reason"])
	}
	if ids := mustStructuredListValue(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "18" {
		t.Fatalf("expected translated blockedSectionIds [18], got %#v", ids)
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

	mcpClient := sdkmcp.NewClient(&sdkmcp.Implementation{Name: "test-client", Version: "0.1.0"}, nil)
	mcpSession, err := mcpClient.Connect(context.Background(), &sdkmcp.SSEClientTransport{
		Endpoint:   serverURL + "/mcp",
		HTTPClient: mustAuthenticatedMCPHTTPClient(t, app, serverURL),
	}, nil)
	if err != nil {
		t.Fatalf("connect authenticated mcp client: %v", err)
	}
	defer mcpSession.Close()

	toolsResult, err := mcpSession.ListTools(context.Background(), nil)
	if err != nil {
		t.Fatalf("list tools: %v", err)
	}

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
	if payload.Servers[0].ToolCount != len(toolsResult.Tools) {
		t.Fatalf("expected tool count %d, got %d", len(toolsResult.Tools), payload.Servers[0].ToolCount)
	}
	if len(payload.ExternalServers) != 0 {
		t.Fatalf("expected no external servers, got %d", len(payload.ExternalServers))
	}
}

func saveAppScopedMCPProject(t *testing.T, cfg config.Config) {
	t.Helper()

	if err := saveAppMainProjectDocument(t, cfg, projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
				TopLevelSectionIDs: []string{
					"chat-section",
					"peer-chat-section",
					"allowed-section",
					"allowed-callable-section",
					"blocked-section",
					"blocked-callable-section",
					"allowed-params-section",
					"blocked-params-section",
				},
				SectionVariantMap: map[string]string{
					"chat-section":             "chat-variant",
					"peer-chat-section":        "peer-chat-variant",
					"allowed-section":          "allowed-variant",
					"allowed-callable-section": "allowed-callable-variant",
					"blocked-section":          "blocked-variant",
					"blocked-callable-section": "blocked-callable-variant",
					"allowed-params-section":   "allowed-params-variant",
					"blocked-params-section":   "blocked-params-variant",
				},
				AgenticEdges: []projectstate.AgenticEdge{
					{
						ID:              "edge-context",
						SourceSectionID: "allowed-section",
						TargetSectionID: "chat-section",
						Kind:            "section_chat",
					},
					{
						ID:              "edge-peer",
						SourceSectionID: "chat-section",
						TargetSectionID: "peer-chat-section",
						Kind:            "chat_chat",
					},
					{
						ID:              "edge-write",
						SourceSectionID: "chat-section",
						TargetSectionID: "allowed-section",
						Kind:            "chat_section",
					},
					{
						ID:              "edge-callable-context",
						SourceSectionID: "allowed-callable-section",
						TargetSectionID: "chat-section",
						Kind:            "section_chat",
					},
					{
						ID:              "edge-callable-write",
						SourceSectionID: "chat-section",
						TargetSectionID: "allowed-callable-section",
						Kind:            "chat_section",
					},
					{
						ID:              "edge-params-context",
						SourceSectionID: "allowed-params-section",
						TargetSectionID: "chat-section",
						Kind:            "section_chat",
					},
					{
						ID:              "edge-params-write",
						SourceSectionID: "chat-section",
						TargetSectionID: "allowed-params-section",
						Kind:            "chat_section",
					},
				},
				Sections: map[string]projectstate.Section{
					"chat-section": {
						ID:               "chat-section",
						Name:             "Chat",
						VariantIDs:       []string{"chat-variant"},
						DefaultVariantID: "chat-variant",
					},
					"peer-chat-section": {
						ID:               "peer-chat-section",
						Name:             "Peer Chat",
						VariantIDs:       []string{"peer-chat-variant"},
						DefaultVariantID: "peer-chat-variant",
					},
					"allowed-section": {
						ID:               "allowed-section",
						Name:             "Allowed",
						VariantIDs:       []string{"allowed-variant"},
						DefaultVariantID: "allowed-variant",
					},
					"allowed-callable-section": {
						ID:               "allowed-callable-section",
						Name:             "Allowed Callable",
						VariantIDs:       []string{"allowed-callable-variant"},
						DefaultVariantID: "allowed-callable-variant",
						UnsharedKeys:     []string{"callable", "codeObjVariantMap"},
					},
					"blocked-section": {
						ID:               "blocked-section",
						Name:             "Blocked",
						VariantIDs:       []string{"blocked-variant"},
						DefaultVariantID: "blocked-variant",
					},
					"blocked-callable-section": {
						ID:               "blocked-callable-section",
						Name:             "Blocked Callable",
						VariantIDs:       []string{"blocked-callable-variant"},
						DefaultVariantID: "blocked-callable-variant",
						UnsharedKeys:     []string{"callable", "codeObjVariantMap"},
					},
					"allowed-params-section": {
						ID:               "allowed-params-section",
						Name:             "Allowed Params",
						VariantIDs:       []string{"allowed-params-variant"},
						DefaultVariantID: "allowed-params-variant",
					},
					"blocked-params-section": {
						ID:               "blocked-params-section",
						Name:             "Blocked Params",
						VariantIDs:       []string{"blocked-params-variant"},
						DefaultVariantID: "blocked-params-variant",
					},
				},
				SectionVariants: map[string]projectstate.SectionVariant{
					"chat-variant":             {ID: "chat-variant", ImplID: "chat-impl"},
					"peer-chat-variant":        {ID: "peer-chat-variant", ImplID: "peer-chat-impl"},
					"allowed-variant":          {ID: "allowed-variant", ImplID: "allowed-impl"},
					"allowed-callable-variant": {ID: "allowed-callable-variant", ImplID: "allowed-callable-impl"},
					"blocked-variant":          {ID: "blocked-variant", ImplID: "blocked-impl"},
					"blocked-callable-variant": {ID: "blocked-callable-variant", ImplID: "blocked-callable-impl"},
					"allowed-params-variant":   {ID: "allowed-params-variant", ImplID: "allowed-params-impl"},
					"blocked-params-variant":   {ID: "blocked-params-variant", ImplID: "blocked-params-impl"},
				},
				SectionImpls: map[string]projectstate.SectionImpl{
					"chat-impl": {
						ID:      "chat-impl",
						Kind:    projectstate.SectionKind("frontend"),
						Payload: mustRawJSONValue(t, map[string]any{"id": "chat-impl", "type": "Chat"}),
					},
					"peer-chat-impl": {
						ID:      "peer-chat-impl",
						Kind:    projectstate.SectionKind("frontend"),
						Payload: mustRawJSONValue(t, map[string]any{"id": "peer-chat-impl", "type": "Chat"}),
					},
					"allowed-impl": {
						ID:   "allowed-impl",
						Kind: projectstate.SectionKindCode,
						Code: &projectstate.CodeSectionImpl{
							Language: projectstate.CodeLanguagePython,
						},
						Payload: mustRawJSONValue(t, map[string]any{
							"id":           "allowed-impl",
							"type":         "Code",
							"codeLanguage": "python",
							"code":         "print('allowed')\n",
							"children":     []any{},
						}),
					},
					"allowed-callable-impl": {
						ID:   "allowed-callable-impl",
						Kind: projectstate.SectionKind("callable"),
						Payload: mustRawJSONValue(t, map[string]any{
							"id":       "allowed-callable-impl",
							"type":     "Callable",
							"callable": "allowed-callable-1",
							"codeObjVariantMap": map[string]string{
								"allowed-callable-1":     "allowed-callable-variant-a",
								"allowed-callable-2":     "allowed-callable-variant-b",
								"allowed-param-existing": "allowed-param-existing-variant",
							},
						}),
					},
					"blocked-impl": {
						ID:   "blocked-impl",
						Kind: projectstate.SectionKindCode,
						Code: &projectstate.CodeSectionImpl{
							Language: projectstate.CodeLanguagePython,
						},
						Payload: mustRawJSONValue(t, map[string]any{
							"id":           "blocked-impl",
							"type":         "Code",
							"codeLanguage": "python",
							"code":         "print('blocked')\n",
							"children":     []any{},
						}),
					},
					"blocked-callable-impl": {
						ID:   "blocked-callable-impl",
						Kind: projectstate.SectionKind("callable"),
						Payload: mustRawJSONValue(t, map[string]any{
							"id":                "blocked-callable-impl",
							"type":              "Callable",
							"callable":          nil,
							"codeObjVariantMap": map[string]string{},
						}),
					},
					"allowed-params-impl": {
						ID:      "allowed-params-impl",
						Kind:    projectstate.SectionKind("dict"),
						Payload: mustRawJSONValue(t, map[string]any{"id": "allowed-params-impl", "type": "Dict", "topLevelParamId": "allowed-param", "codeObjVariantMap": map[string]string{"allowed-param": "allowed-param-variant"}, "ignoreTypeErrors": map[string]any{"callable": false, "params": map[string]any{}}}),
					},
					"blocked-params-impl": {
						ID:      "blocked-params-impl",
						Kind:    projectstate.SectionKind("dict"),
						Payload: mustRawJSONValue(t, map[string]any{"id": "blocked-params-impl", "type": "Dict", "topLevelParamId": "blocked-param", "codeObjVariantMap": map[string]string{"blocked-param": "blocked-param-variant"}, "ignoreTypeErrors": map[string]any{"callable": false, "params": map[string]any{}}}),
					},
				},
				CodeObjs: map[string]projectstate.CodeObject{
					"allowed-callable-1": {
						ID:               "allowed-callable-1",
						Name:             "existing_callable",
						VariantIDs:       []string{"allowed-callable-variant-a"},
						DefaultVariantID: "allowed-callable-variant-a",
					},
					"allowed-callable-2": {
						ID:               "allowed-callable-2",
						Name:             "sorted",
						VariantIDs:       []string{"allowed-callable-variant-b"},
						DefaultVariantID: "allowed-callable-variant-b",
					},
					"allowed-param-existing": {
						ID:               "allowed-param-existing",
						Name:             "iterable",
						VariantIDs:       []string{"allowed-param-existing-variant"},
						DefaultVariantID: "allowed-param-existing-variant",
					},
					"allowed-param": {
						ID:               "allowed-param",
						Name:             "allowed_param",
						VariantIDs:       []string{"allowed-param-variant"},
						DefaultVariantID: "allowed-param-variant",
					},
					"blocked-param": {
						ID:               "blocked-param",
						Name:             "blocked_param",
						VariantIDs:       []string{"blocked-param-variant"},
						DefaultVariantID: "blocked-param-variant",
					},
				},
				CodeObjVariants: map[string]projectstate.CodeObjectVariant{
					"allowed-callable-variant-a": {
						ID:     "allowed-callable-variant-a",
						ImplID: "allowed-callable-impl-a",
					},
					"allowed-callable-variant-b": {
						ID:     "allowed-callable-variant-b",
						ImplID: "allowed-callable-impl-b",
					},
					"allowed-param-existing-variant": {
						ID:     "allowed-param-existing-variant",
						ImplID: "allowed-param-existing-impl",
					},
					"allowed-param-variant": {
						ID:     "allowed-param-variant",
						ImplID: "allowed-param-impl",
					},
					"blocked-param-variant": {
						ID:     "blocked-param-variant",
						ImplID: "blocked-param-impl",
					},
				},
				CodeObjImpls: map[string]projectstate.CodeObjectImpl{
					"allowed-callable-impl-a": {
						ID:      "allowed-callable-impl-a",
						Type:    "CodeCallable",
						Payload: mustRawJSONValue(t, map[string]any{"id": "allowed-callable-impl-a", "type": "CodeCallable", "children": []any{}}),
					},
					"allowed-callable-impl-b": {
						ID:      "allowed-callable-impl-b",
						Type:    "CodeCallable",
						Payload: mustRawJSONValue(t, map[string]any{"id": "allowed-callable-impl-b", "type": "CodeCallable", "children": []any{"allowed-param-existing"}}),
					},
					"allowed-param-existing-impl": {
						ID:      "allowed-param-existing-impl",
						Type:    "CodeParam",
						Payload: mustRawJSONValue(t, map[string]any{"id": "allowed-param-existing-impl", "type": "CodeParam", "value": "user_value", "passingStyle": "DEFAULT"}),
					},
					"allowed-param-impl": {
						ID:      "allowed-param-impl",
						Type:    "TextParam",
						Payload: mustRawJSONValue(t, map[string]any{"id": "allowed-param-impl", "type": "TextParam", "value": "1"}),
					},
					"blocked-param-impl": {
						ID:      "blocked-param-impl",
						Type:    "TextParam",
						Payload: mustRawJSONValue(t, map[string]any{"id": "blocked-param-impl", "type": "TextParam", "value": "2"}),
					},
				},
			},
		},
	}); err != nil {
		t.Fatalf("save scoped MCP project: %v", err)
	}
}

func containsAppString(values []string, needle string) bool {
	for _, value := range values {
		if value == needle {
			return true
		}
	}
	return false
}

func mustAddAppScopedMCPGroupSection(t *testing.T, cfg config.Config) {
	t.Helper()

	paths, err := projectstate.ResolvePaths(cfg.Paths.SettaFilesRoot)
	if err != nil {
		t.Fatalf("resolve app project paths: %v", err)
	}
	store, err := projectstate.NewStore(paths.Main, projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("open app project store: %v", err)
	}
	document, err := store.Load(context.Background())
	if err != nil {
		t.Fatalf("load app project document: %v", err)
	}
	project, err := document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before adding group section: %v", err)
	}
	if _, ok := project.Sections["group-section"]; ok {
		return
	}

	project.TopLevelSectionIDs = append(project.TopLevelSectionIDs, "group-section")
	project.SectionVariantMap["group-section"] = "group-variant"
	project.Sections["group-section"] = projectstate.Section{
		ID:               "group-section",
		Name:             "Group",
		VariantIDs:       []string{"group-variant"},
		DefaultVariantID: "group-variant",
	}
	project.SectionVariants["group-variant"] = projectstate.SectionVariant{
		ID:     "group-variant",
		ImplID: "group-impl",
	}
	project.SectionImpls["group-impl"] = projectstate.SectionImpl{
		ID:   "group-impl",
		Kind: projectstate.SectionKind("frontend"),
		Payload: mustRawJSONValue(t, map[string]any{
			"id":                      "group-impl",
			"type":                    "Group",
			"isHorizontalOrientation": false,
			"overflowMode":            false,
		}),
	}

	normalizedProject, err := project.Normalized()
	if err != nil {
		t.Fatalf("normalize app group section project: %v", err)
	}
	document.Projects[normalizedProject.ID] = normalizedProject
	if err := saveAppMainProjectDocument(t, cfg, document); err != nil {
		t.Fatalf("save app project document with group section: %v", err)
	}
}

func mustAddAppScopedMCPAlternateSectionVariant(t *testing.T, cfg config.Config) {
	t.Helper()

	paths, err := projectstate.ResolvePaths(cfg.Paths.SettaFilesRoot)
	if err != nil {
		t.Fatalf("resolve app project paths: %v", err)
	}
	store, err := projectstate.NewStore(paths.Main, projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("open app project store: %v", err)
	}
	document, err := store.Load(context.Background())
	if err != nil {
		t.Fatalf("load app project document: %v", err)
	}
	project, err := document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before adding alternate section variant: %v", err)
	}
	section, ok := project.Sections["allowed-section"]
	if !ok {
		t.Fatalf("allowed-section missing from app project")
	}
	if containsAppString(section.VariantIDs, "allowed-variant-alt") {
		return
	}

	section.VariantIDs = append(section.VariantIDs, "allowed-variant-alt")
	project.Sections[section.ID] = section
	project.SectionVariants["allowed-variant-alt"] = projectstate.SectionVariant{
		ID:     "allowed-variant-alt",
		ImplID: "allowed-impl-alt",
	}
	project.SectionImpls["allowed-impl-alt"] = projectstate.SectionImpl{
		ID:   "allowed-impl-alt",
		Kind: projectstate.SectionKindCode,
		Code: &projectstate.CodeSectionImpl{
			Language: projectstate.CodeLanguagePython,
		},
		Payload: mustRawJSONValue(t, map[string]any{
			"id":           "allowed-impl-alt",
			"type":         "Code",
			"codeLanguage": "python",
			"code":         "print('allowed alt')\n",
			"children":     []any{},
		}),
	}

	normalizedProject, err := project.Normalized()
	if err != nil {
		t.Fatalf("normalize app alternate section variant project: %v", err)
	}
	document.Projects[normalizedProject.ID] = normalizedProject
	if err := saveAppMainProjectDocument(t, cfg, document); err != nil {
		t.Fatalf("save app project document with alternate section variant: %v", err)
	}
}

func mustEnableAppSavedPythonCodegen(t *testing.T, cfg config.Config) {
	t.Helper()

	paths, err := projectstate.ResolvePaths(cfg.Paths.SettaFilesRoot)
	if err != nil {
		t.Fatalf("resolve project paths: %v", err)
	}
	store, err := projectstate.NewStore(paths.Main, projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("open project store: %v", err)
	}
	document, err := store.Load(context.Background())
	if err != nil {
		t.Fatalf("load scoped MCP project: %v", err)
	}

	project := document.Projects["project-alpha"]
	project.CodegenTargets = []projectstate.ProjectCodegenTarget{
		{
			Language: string(projectstate.CodeLanguagePython),
			Payload:  projectstate.RawJSON(`{"language":"python"}`),
		},
	}
	if err := project.ReconcilePythonGeneratedBindings(); err != nil {
		t.Fatalf("reconcile python generated bindings: %v", err)
	}
	project.Sections[projectstate.GeneratedPythonCodeSectionID] = projectstate.Section{
		ID:               projectstate.GeneratedPythonCodeSectionID,
		Name:             projectstate.GeneratedPythonCodeSectionName,
		VariantIDs:       []string{projectstate.GeneratedPythonCodeVariantID},
		DefaultVariantID: projectstate.GeneratedPythonCodeVariantID,
	}
	project.SectionVariants[projectstate.GeneratedPythonCodeVariantID] = projectstate.SectionVariant{
		ID:     projectstate.GeneratedPythonCodeVariantID,
		ImplID: projectstate.GeneratedPythonCodeImplID,
	}
	project.SectionImpls[projectstate.GeneratedPythonCodeImplID] = projectstate.SectionImpl{
		ID:   projectstate.GeneratedPythonCodeImplID,
		Kind: projectstate.SectionKindGenerated,
		Payload: mustRawJSONValue(t, map[string]any{
			"id":   projectstate.GeneratedPythonCodeImplID,
			"type": "GenPythonCode",
			"codeFileBinding": map[string]any{
				"canonical_path": projectstate.GeneratedPythonCodeRelativePath(project.Name),
				"access_mode":    "write_only",
				"autoBinding":    false,
			},
		}),
		Generated: &projectstate.GeneratedSectionImpl{
			Kind: projectstate.GeneratedSectionKindPythonCode,
		},
	}
	project.SectionVariantMap[projectstate.GeneratedPythonCodeSectionID] = projectstate.GeneratedPythonCodeVariantID
	if !containsAppString(project.TopLevelSectionIDs, projectstate.GeneratedPythonCodeSectionID) {
		project.TopLevelSectionIDs = append(project.TopLevelSectionIDs, projectstate.GeneratedPythonCodeSectionID)
	}
	if _, ok := project.TopLevelSections[projectstate.GeneratedPythonCodeSectionID]; !ok {
		project.TopLevelSections[projectstate.GeneratedPythonCodeSectionID] = projectstate.TopLevelSectionLayout{X: 90, Y: 100}
	}

	document.Projects[project.ID] = project
	if err := store.Save(context.Background(), document); err != nil {
		t.Fatalf("save scoped MCP python codegen project: %v", err)
	}
}

func mustSetAppScopedMCPProjectWatchCodeFiles(t *testing.T, cfg config.Config, files []string) {
	t.Helper()

	mustSetAppScopedMCPProjectWatchCodeState(t, cfg, nil, files, nil)
}

func mustSetAppScopedMCPProjectWatchCodeState(
	t *testing.T,
	cfg config.Config,
	folders []projectstate.WatchCodeFolder,
	files []string,
	baseline map[string][]string,
) {
	t.Helper()

	installAppWatchCodeProviderFixture(t, cfg)
	paths, err := projectstate.ResolvePaths(cfg.Paths.SettaFilesRoot)
	if err != nil {
		t.Fatalf("resolve project paths: %v", err)
	}
	store, err := projectstate.NewStore(paths.Main, projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("open project store: %v", err)
	}
	document, err := store.Load(context.Background())
	if err != nil {
		t.Fatalf("load scoped MCP project: %v", err)
	}
	setAppWatchCodePluginProjectData(t, &document, "project-alpha", projectstate.WatchCodePluginProjectData{
		Folders:        append([]projectstate.WatchCodeFolder(nil), folders...),
		Files:          append([]string(nil), files...),
		BaselineByPath: cloneAppStringSliceMap(baseline),
		Registry:       map[string]projectstate.WatchCodeRegistryEntry{},
	})
	if err := store.Save(context.Background(), document); err != nil {
		t.Fatalf("save scoped MCP watch code project: %v", err)
	}
}

func mustAddAppScopedMCPMetaControlSections(t *testing.T, cfg config.Config) {
	t.Helper()

	paths, err := projectstate.ResolvePaths(cfg.Paths.SettaFilesRoot)
	if err != nil {
		t.Fatalf("resolve project paths: %v", err)
	}
	store, err := projectstate.NewStore(paths.Main, projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("open project store: %v", err)
	}
	document, err := store.Load(context.Background())
	if err != nil {
		t.Fatalf("load scoped MCP project: %v", err)
	}
	project := document.Projects["project-alpha"]
	if _, ok := project.Sections["allowed-meta-section"]; ok {
		return
	}

	project.TopLevelSectionIDs = append(project.TopLevelSectionIDs, "allowed-meta-section", "blocked-meta-section")
	project.SectionVariantMap["allowed-meta-section"] = "allowed-meta-variant"
	project.SectionVariantMap["blocked-meta-section"] = "blocked-meta-variant"
	project.AgenticEdges = append(project.AgenticEdges, projectstate.AgenticEdge{
		ID:              "edge-meta-context",
		SourceSectionID: "allowed-meta-section",
		TargetSectionID: "chat-section",
		Kind:            "section_chat",
	}, projectstate.AgenticEdge{
		ID:              "edge-meta-write",
		SourceSectionID: "chat-section",
		TargetSectionID: "allowed-meta-section",
		Kind:            "chat_section",
	})
	project.Sections["allowed-meta-section"] = projectstate.Section{
		ID:               "allowed-meta-section",
		Name:             "Allowed Meta",
		VariantIDs:       []string{"allowed-meta-variant"},
		DefaultVariantID: "allowed-meta-variant",
	}
	project.Sections["blocked-meta-section"] = projectstate.Section{
		ID:               "blocked-meta-section",
		Name:             "Blocked Meta",
		VariantIDs:       []string{"blocked-meta-variant"},
		DefaultVariantID: "blocked-meta-variant",
	}
	project.SectionVariants["allowed-meta-variant"] = projectstate.SectionVariant{
		ID:     "allowed-meta-variant",
		ImplID: "allowed-meta-impl",
	}
	project.SectionVariants["blocked-meta-variant"] = projectstate.SectionVariant{
		ID:     "blocked-meta-variant",
		ImplID: "blocked-meta-impl",
	}
	project.SectionImpls["allowed-meta-impl"] = projectstate.SectionImpl{
		ID:      "allowed-meta-impl",
		Kind:    projectstate.SectionKind("frontend"),
		Payload: mustRawJSONValue(t, map[string]any{"id": "allowed-meta-impl", "type": "MetaControl", "showSectionTitle": false, "codeObjVariantMap": map[string]any{}}),
	}
	project.SectionImpls["blocked-meta-impl"] = projectstate.SectionImpl{
		ID:      "blocked-meta-impl",
		Kind:    projectstate.SectionKind("frontend"),
		Payload: mustRawJSONValue(t, map[string]any{"id": "blocked-meta-impl", "type": "MetaControl", "showSectionTitle": false, "codeObjVariantMap": map[string]any{}}),
	}

	document.Projects[project.ID] = project
	if err := store.Save(context.Background(), document); err != nil {
		t.Fatalf("save scoped MCP meta control project: %v", err)
	}
}

func saveAppAgentProfiles(t *testing.T, cfg config.Config, profiles []agentprofiles.Profile) {
	t.Helper()

	store, err := agentprofiles.NewStore(cfg.Paths.SettaFilesRoot)
	if err != nil {
		t.Fatalf("new agent profile store: %v", err)
	}
	if err := store.Write(profiles); err != nil {
		t.Fatalf("write agent profiles: %v", err)
	}
}

func cloneAppStringSliceMap(values map[string][]string) map[string][]string {
	if len(values) == 0 {
		return map[string][]string{}
	}
	cloned := make(map[string][]string, len(values))
	for key, current := range values {
		cloned[key] = append([]string(nil), current...)
	}
	return cloned
}

func mustSeedAppChildSection(t *testing.T, runtime *projectstate.Runtime, parentID string) string {
	t.Helper()

	_, result, err := runtime.CreateChildSections(context.Background(), "project-alpha", projectstate.CreateChildSectionsInput{
		ParentID:    parentID,
		ImplType:    "Terminal",
		NumChildren: 1,
	}, projectstate.DefaultStructuralMutationSettings())
	if err != nil {
		t.Fatalf("seed child section under %q: %v", parentID, err)
	}
	if len(result.SectionIDs) != 1 {
		t.Fatalf("expected one seeded child section under %q, got %#v", parentID, result.SectionIDs)
	}
	return result.SectionIDs[0]
}

func mustSeedAppTopLevelTerminal(t *testing.T, runtime *projectstate.Runtime) string {
	t.Helper()

	_, sectionID, err := runtime.CreateTemporaryTerminal("project-alpha", projectstate.TerminalSectionSeed{
		SectionID: "attached-terminal",
		VariantID: "attached-terminal-variant",
		ImplID:    "attached-terminal-impl",
		Name:      "Terminal",
	})
	if err != nil {
		t.Fatalf("seed app top-level terminal: %v", err)
	}
	return sectionID
}

func mustSetAppCodeSectionReadOnly(t *testing.T, runtime *projectstate.Runtime, projectID string, sectionID string) {
	t.Helper()

	_, err := runtime.MutateAndSave(context.Background(), func(document projectstate.Document) (projectstate.Document, error) {
		project, err := document.ProjectByID(projectID)
		if err != nil {
			return document, err
		}
		_, _, impl, err := project.ResolveSection(sectionID)
		if err != nil {
			return document, err
		}
		payload := mustDecodedProjectPayloadValue(t, impl.Payload)
		bindingPayload, ok := payload["codeFileBinding"].(map[string]any)
		if !ok {
			bindingPayload = map[string]any{}
		}
		if _, ok := bindingPayload["canonical_path"].(string); !ok {
			bindingPayload["canonical_path"] = "code/readonly.py"
		}
		bindingPayload["access_mode"] = string(projectstate.CodeFileAccessModeReadOnly)
		payload["codeFileBinding"] = bindingPayload
		impl.Payload = mustRawJSONValue(t, payload)
		impl.Code.Binding = &projectstate.CodeFileBinding{
			Path:       bindingPayload["canonical_path"].(string),
			AccessMode: projectstate.CodeFileAccessModeReadOnly,
		}
		project.SectionImpls[impl.ID] = impl
		document.Projects[project.ID] = project
		return document, nil
	})
	if err != nil {
		t.Fatalf("mark app code section %q read-only: %v", sectionID, err)
	}
}

func assertAppBoundSetCodeState(t *testing.T, app *App, expectedCode string) {
	t.Helper()

	snapshot := app.ProjectStates().Main().Snapshot()
	project, err := snapshot.Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after bound set_code: %v", err)
	}
	sectionPayload := mustDecodedProjectPayloadValue(t, project.SectionImpls["impl-main"].Payload)
	if got := sectionPayload["code"]; got != expectedCode {
		t.Fatalf("expected bound code payload %q, got %#v", expectedCode, got)
	}

	projectData := readAppWatchCodePluginProjectData(t, snapshot.Document, project.ID)
	entry, ok := projectData.Registry["pkg.bound.sorted:function"]
	if !ok {
		t.Fatalf("expected watch code registry entry, got %#v", projectData.Registry)
	}
	if len(entry.SectionIDs) != 1 || entry.SectionsCount != 1 {
		t.Fatalf("expected one callable section binding, got %#v", entry)
	}
	_, _, impl, err := project.ResolveSection(entry.SectionIDs[0])
	if err != nil {
		t.Fatalf("resolve callable section after bound set_code: %v", err)
	}
	if impl.Kind != projectstate.SectionKind("callable") {
		t.Fatalf("expected callable section impl, got %q", impl.Kind)
	}
}

func seedAppSettaDocsBundle(t *testing.T, workspaceRoot string) {
	t.Helper()

	writeAppDocsFile(t, filepath.Join(workspaceRoot, "docs", "reference", "setta-listener-examples.md"), "# Examples\n")
	writeAppDocsFile(t, filepath.Join(workspaceRoot, "docs", "reference", "emit_to_frontend.md"), "# Emit\n")
	writeAppDocsFile(t, filepath.Join(workspaceRoot, "docs", "reference", "setta-listener-hot-reload.md"), "# Hot Reload\n")
	writeAppDocsFile(t, filepath.Join(workspaceRoot, "docs", "reference", "setta-realtime-behavior.md"), "# Realtime\n")
	writeAppDocsFile(t, filepath.Join(workspaceRoot, "docs", "reference", "listener-flows.md"), "# Listener Flows\n")
}

func writeAppDocsFile(t *testing.T, path string, content string) {
	t.Helper()

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir docs parent: %v", err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write docs file %s: %v", path, err)
	}
}

func decodeAppToolCallRoutePayload(t *testing.T, body io.Reader) struct {
	StructuredContent any  `json:"structuredContent"`
	IsError           bool `json:"isError"`
} {
	t.Helper()

	var payload struct {
		StructuredContent any  `json:"structuredContent"`
		IsError           bool `json:"isError"`
	}
	if err := json.NewDecoder(body).Decode(&payload); err != nil {
		t.Fatalf("decode tool call route response: %v", err)
	}
	return payload
}

func writeAppTemporaryIDMap(t *testing.T, path string, payload map[string]string) {
	t.Helper()

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir temporary id map dir: %v", err)
	}
	encoded, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		t.Fatalf("marshal temporary id map: %v", err)
	}
	if err := os.WriteFile(path, encoded, 0o644); err != nil {
		t.Fatalf("write temporary id map: %v", err)
	}
}

func readAppTemporaryIDMap(t *testing.T, path string) map[string]string {
	t.Helper()

	payload, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read temporary id map: %v", err)
	}
	decoded := map[string]string{}
	if err := json.Unmarshal(payload, &decoded); err != nil {
		t.Fatalf("decode temporary id map: %v", err)
	}
	return decoded
}

func mustReadAppGeneratedPythonCode(t *testing.T, cfg config.Config) string {
	t.Helper()

	path := filepath.Join(cfg.Paths.SettaFilesRoot, projectstate.GeneratedPythonCodeRelativePath("Alpha"))
	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read generated python code: %v", err)
	}
	return string(content)
}

func containsStructuredStringValue(values []any, needle string) bool {
	for _, value := range values {
		if raw, ok := value.(string); ok && raw == needle {
			return true
		}
	}
	return false
}

func mustStructuredMapValue(t *testing.T, value any) map[string]any {
	t.Helper()

	typed, ok := value.(map[string]any)
	if ok {
		return typed
	}
	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal structured map value: %v", err)
	}
	var decoded map[string]any
	if err := json.Unmarshal(encoded, &decoded); err != nil {
		t.Fatalf("decode structured map value: %v", err)
	}
	return decoded
}

func mustDecodedProjectPayloadValue(t *testing.T, raw projectstate.RawJSON) map[string]any {
	t.Helper()

	var decoded map[string]any
	if err := json.Unmarshal(raw, &decoded); err != nil {
		t.Fatalf("decode project payload value: %v", err)
	}
	return decoded
}

func mustStructuredListValue(t *testing.T, value any) []any {
	t.Helper()

	typed, ok := value.([]any)
	if ok {
		return typed
	}
	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal structured list value: %v", err)
	}
	var decoded []any
	if err := json.Unmarshal(encoded, &decoded); err != nil {
		t.Fatalf("decode structured list value: %v", err)
	}
	return decoded
}

func mustStringSliceValue(t *testing.T, value any) []string {
	t.Helper()

	switch typed := value.(type) {
	case []string:
		return typed
	case []any:
		output := make([]string, 0, len(typed))
		for _, entry := range typed {
			stringValue, ok := entry.(string)
			if ok {
				output = append(output, stringValue)
			}
		}
		return output
	default:
		encoded, err := json.Marshal(value)
		if err != nil {
			t.Fatalf("marshal string slice value: %v", err)
		}
		var decoded []string
		if err := json.Unmarshal(encoded, &decoded); err != nil {
			t.Fatalf("decode string slice value: %v", err)
		}
		return decoded
	}
}

func mustStructuredStringListValue(t *testing.T, value any) []string {
	t.Helper()

	switch typed := value.(type) {
	case []string:
		return typed
	case []any:
		output := make([]string, 0, len(typed))
		for _, entry := range typed {
			raw, ok := entry.(string)
			if ok {
				output = append(output, raw)
			}
		}
		return output
	default:
		encoded, err := json.Marshal(value)
		if err != nil {
			t.Fatalf("marshal structured string list value: %v", err)
		}
		var decoded []string
		if err := json.Unmarshal(encoded, &decoded); err != nil {
			t.Fatalf("decode structured string list value: %v", err)
		}
		return decoded
	}
}

func mustRawJSONValue(t *testing.T, value any) projectstate.RawJSON {
	t.Helper()

	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal raw json value: %v", err)
	}
	return encoded
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
		client := app.mcpClient
		if client != nil {
			statuses := client.RuntimeStatuses()
			if len(statuses) == 1 && statuses[0].State == want {
				return
			}
		}
		time.Sleep(25 * time.Millisecond)
	}

	client := app.mcpClient
	if client == nil {
		t.Fatal("expected app MCP client")
	}
	statuses := client.RuntimeStatuses()
	t.Fatalf("expected runtime state %q, got %#v", want, statuses)
}
