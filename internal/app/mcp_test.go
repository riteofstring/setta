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
	"net/http/httptest"
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
	"setta/internal/mcpx"
	"setta/internal/observability"
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
