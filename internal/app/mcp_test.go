package app

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"setta/internal/agentprofiles"
	"setta/internal/appsubsystem/appspec"
	"setta/internal/config"
	"setta/internal/mcpx"
	"setta/internal/observability"
	"setta/internal/realtime"
	"setta/internal/terminals"
	"setta/internal/wsapi"

	"github.com/coder/websocket"
	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"
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

func callAppMCPTool(
	t *testing.T,
	session *sdkmcp.ClientSession,
	name string,
	arguments map[string]any,
) *sdkmcp.CallToolResult {
	t.Helper()

	result := callAppMCPToolAllowError(t, session, name, arguments)
	if result.IsError {
		t.Fatalf("expected %s success, got %#v", name, result.StructuredContent)
	}
	return result
}

func callAppMCPToolAllowError(
	t *testing.T,
	session *sdkmcp.ClientSession,
	name string,
	arguments map[string]any,
) *sdkmcp.CallToolResult {
	t.Helper()

	result, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name:      name,
		Arguments: arguments,
	})
	if err != nil {
		t.Fatalf("call %s: %v", name, err)
	}
	return result
}

func assertAuthenticatedMCPToolListing(t *testing.T, session *sdkmcp.ClientSession) {
	t.Helper()

	toolsResult, err := session.ListTools(context.Background(), nil)
	if err != nil {
		t.Fatalf("list tools: %v", err)
	}
	if len(toolsResult.Tools) != 74 {
		t.Fatalf("expected 74 tools, got %d", len(toolsResult.Tools))
	}

	listResult := callAppMCPTool(t, session, "list_mcp_tools", map[string]any{})
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
	assertAuthenticatedMCPRegisteredToolNames(t, rawNames)
}

func assertAuthenticatedMCPRegisteredToolNames(t *testing.T, rawNames []any) {
	t.Helper()

	for _, toolName := range []string{
		"getInstalledPythonPackages",
		"get_app_definition",
		"set_app_definition",
		"stream_app_definition",
		"format_code",
		"getProjectConfigNamesAndIds",
		"set_gen_code_prefix",
		"set_gen_code_suffix",
		"getTerminalOutput",
		"get_agent_profile",
		"get_app_catalog",
		"get_mcp_server_runtime_status",
		"get_setta_docs",
		"get_ui_setting_value",
		"install_plugin",
		"list_app_components",
		"list_agent_profiles",
		"report_completion_status",
		"rescan_plugins",
		"reveal_ui_setting",
		"rollback_plugin",
		"run_agent_profile",
		"set_group_overflow_mode",
		"set_default_section_variant",
		"set_section_variant",
		"set_section_variant_sort_order",
		"update_app_definition",
		"validate_app_definition",
		"search_mcp_tools",
		"search_ui_settings",
		"toggle_group_orientation",
		"uninstall_plugin",
		"set_ui_setting_value",
		"update_plugin",
	} {
		if !containsStructuredStringValue(rawNames, toolName) {
			t.Fatalf("expected %s in registered tool names, got %#v", toolName, rawNames)
		}
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
}

func assertAuthenticatedMCPMissingContext(t *testing.T, session *sdkmcp.ClientSession) {
	t.Helper()

	missingContextResult := callAppMCPToolAllowError(t, session, "read_file_range", map[string]any{"path": "example.txt"})
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
}

func setAuthenticatedMCPAgenticContext(t *testing.T, session *sdkmcp.ClientSession) {
	t.Helper()

	callAppMCPTool(t, session, "set_agentic_context", map[string]any{
		"projectConfigId": "project-alpha",
		"chatId":          "chat-1",
		"sectionId":       "chat-section",
	})
}

func assertAuthenticatedMCPReadFileRange(t *testing.T, session *sdkmcp.ClientSession) {
	t.Helper()

	readResult := callAppMCPTool(t, session, "read_file_range", map[string]any{
		"path":       "example.txt",
		"start_line": 2,
		"end_line":   3,
	})
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
}

func assertAuthenticatedMCPProjectSummary(t *testing.T, session *sdkmcp.ClientSession) {
	t.Helper()

	summaryResult := callAppMCPTool(t, session, "get_latest_project_state_summary", map[string]any{"projectConfigId": "project-alpha"})
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
	for _, blockedSectionID := range []string{"blocked-section", "blocked-callable-section", "blocked-params-section"} {
		if _, ok := sectionVariantMap[blockedSectionID]; ok {
			t.Fatalf("did not expect %s in scoped summary, got %#v", blockedSectionID, sectionVariantMap)
		}
	}
}

func assertAuthenticatedMCPDiagnostics(t *testing.T, session *sdkmcp.ClientSession) {
	t.Helper()

	diagnosticsResult := callAppMCPTool(t, session, "get_latest_lsp_diagnostics", map[string]any{"projectConfigId": "project-alpha"})
	diagnosticsPayload := mustStructuredMapValue(t, diagnosticsResult.StructuredContent)
	codeSections := mustStructuredMapValue(t, diagnosticsPayload["codeSections"])
	if len(codeSections) != 0 {
		t.Fatalf("expected no diagnostics before registry population, got %#v", codeSections)
	}
}

func startAppMCPTestServer(t *testing.T, cfg config.Config) (*App, *httptest.Server, *sdkmcp.ClientSession) {
	t.Helper()

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
	t.Cleanup(server.Close)

	session := connectAuthenticatedAppMCPSession(t, app, server.URL)
	t.Cleanup(func() {
		_ = session.Close()
	})
	return app, server, session
}

func dialAuthenticatedAppFrontend(t *testing.T, app *App, serverURL string, maxIdentityReads int) *websocket.Conn {
	t.Helper()

	authCookie := newAppTestAuthCookie(t, app)
	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(serverURL, "http")+wsapi.RouteFrontend, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{authCookie.Name + "=" + authCookie.Value},
		},
	})
	if err != nil {
		t.Fatalf("dial frontend websocket route: %v", err)
	}
	t.Cleanup(func() {
		_ = conn.CloseNow()
	})

	_ = readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeFrontendIdentity, maxIdentityReads)
	return conn
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
	_, err = client.Connect(context.Background(), &sdkmcp.StreamableClientTransport{
		Endpoint: server.URL + "/mcp",
	}, nil)
	if err == nil {
		t.Fatal("expected unauthorized MCP connect to fail")
	}
	if !strings.Contains(err.Error(), "Unauthorized") {
		t.Fatalf("expected unauthorized error, got %v", err)
	}
}

func TestAppIDEMCPServerSupportsAuthenticatedStreamableHTTPCalls(t *testing.T) {
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

	session := connectAuthenticatedAppMCPSession(t, app, server.URL)
	defer session.Close()

	assertAuthenticatedMCPToolListing(t, session)
	assertAuthenticatedMCPMissingContext(t, session)
	setAuthenticatedMCPAgenticContext(t, session)
	assertAuthenticatedMCPReadFileRange(t, session)
	assertAuthenticatedMCPProjectSummary(t, session)
	assertAuthenticatedMCPDiagnostics(t, session)
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

	app, server, session := startAppMCPTestServer(t, cfg)
	conn := dialAuthenticatedAppFrontend(t, app, server.URL, 2)

	setAuthenticatedMCPAgenticContextAllowUnscoped(t, session)
	callAppMCPTool(t, session, "getProjectConfigNamesAndIds", map[string]any{})
	callAppMCPTool(t, session, "get_latest_project_state_summary", map[string]any{"projectConfigId": "project-alpha"})

	beforeSectionIDs := appMCPProjectSectionIDs(t, app, "project-alpha")
	createdSectionID := createAppMCPTopLevelCallableSection(t, session)
	canonicalSectionID := appMCPNewCanonicalSectionID(t, app, "project-alpha", beforeSectionIDs)
	if createdSectionID == canonicalSectionID {
		t.Fatalf("expected translated section id to differ from canonical %q", canonicalSectionID)
	}
	assertAppMCPProjectStateBroadcastIncludesSection(t, conn, canonicalSectionID)
}

func setAuthenticatedMCPAgenticContextAllowUnscoped(t *testing.T, session *sdkmcp.ClientSession) {
	t.Helper()

	callAppMCPTool(t, session, "set_agentic_context", map[string]any{
		"projectConfigId": "project-alpha",
		"allowUnscoped":   true,
	})
}

func appMCPProjectSectionIDs(t *testing.T, app *App, projectID string) map[string]struct{} {
	t.Helper()

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID(projectID)
	if err != nil {
		t.Fatalf("project by id %s: %v", projectID, err)
	}
	sectionIDs := map[string]struct{}{}
	for sectionID := range project.Sections {
		sectionIDs[sectionID] = struct{}{}
	}
	return sectionIDs
}

func createAppMCPTopLevelCallableSection(t *testing.T, session *sdkmcp.ClientSession) string {
	t.Helper()

	result := callAppMCPTool(t, session, "create_top_level_section", map[string]any{
		"projectConfigId": "project-alpha",
		"implType":        "Callable",
	})
	payload := mustStructuredMapValue(t, result.StructuredContent)
	sectionID, ok := payload["sectionId"].(string)
	if !ok || strings.TrimSpace(sectionID) == "" {
		t.Fatalf("expected created section id, got %#v", payload["sectionId"])
	}
	return sectionID
}

func appMCPNewCanonicalSectionID(t *testing.T, app *App, projectID string, beforeSectionIDs map[string]struct{}) string {
	t.Helper()

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID(projectID)
	if err != nil {
		t.Fatalf("project by id after create_top_level_section: %v", err)
	}
	for currentSectionID := range project.Sections {
		if _, existed := beforeSectionIDs[currentSectionID]; !existed {
			return currentSectionID
		}
	}
	t.Fatalf("expected one new canonical section after create_top_level_section, got %#v", project.Sections)
	return ""
}

func assertAppMCPProjectStateBroadcastIncludesSection(t *testing.T, conn *websocket.Conn, sectionID string) {
	t.Helper()

	envelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeUpdateFrontendProjectState, 6)
	var update realtime.ProjectStateUpdateContent
	if err := json.Unmarshal(envelope.Content, &update); err != nil {
		t.Fatalf("decode project state update content: %v", err)
	}
	if update.ProjectState.ProjectConfig.ID != "project-alpha" {
		t.Fatalf("expected project-alpha state update, got %q", update.ProjectState.ProjectConfig.ID)
	}
	if _, ok := update.ProjectState.Sections[sectionID]; !ok {
		t.Fatalf("expected websocket update to include created canonical section %q", sectionID)
	}
}

func TestAppIDEMCPServerSupportsUtilityReadToolsOverAuthenticatedStreamableHTTP(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)
	enableAppSubsystemPluginForTest(t, cfg)
	seedAppSettaDocsBundle(t, cfg.Paths.WorkspaceRoot)

	_, _, session := startAppMCPTestServer(t, cfg)

	assertAppMCPToolSearch(t, session)
	assertAppMCPProjectConfigNames(t, session)
	assertAppMCPInstalledPythonPackages(t, session)
	assertAppMCPAppCatalog(t, session)
	assertAppMCPAppComponents(t, session)
	assertAppMCPSettaDocs(t, session)
}

func assertAppMCPToolSearch(t *testing.T, session *sdkmcp.ClientSession) {
	t.Helper()

	searchResult := callAppMCPTool(t, session, "search_mcp_tools", map[string]any{
		"query": "section size settings",
		"limit": 2,
	})
	searchPayload := mustStructuredMapValue(t, searchResult.StructuredContent)
	searchEntries := mustStructuredListValue(t, searchPayload["results"])
	if len(searchEntries) == 0 || mustStructuredMapValue(t, searchEntries[0])["name"] != "set_section_sizes" {
		t.Fatalf("expected set_section_sizes search result, got %#v", searchEntries)
	}
}

func assertAppMCPProjectConfigNames(t *testing.T, session *sdkmcp.ClientSession) {
	t.Helper()

	projectsResult := callAppMCPTool(t, session, "getProjectConfigNamesAndIds", map[string]any{})
	projectsPayload := mustStructuredMapValue(t, projectsResult.StructuredContent)
	projectConfigs := mustStructuredListValue(t, projectsPayload["projectConfigs"])
	if len(projectConfigs) != 1 || mustStructuredMapValue(t, projectConfigs[0])["id"] != "project-alpha" {
		t.Fatalf("expected one project-alpha metadata entry, got %#v", projectConfigs)
	}
}

func assertAppMCPInstalledPythonPackages(t *testing.T, session *sdkmcp.ClientSession) {
	t.Helper()

	packagesResult := callAppMCPTool(t, session, "getInstalledPythonPackages", map[string]any{})
	packagesPayload := mustStructuredMapValue(t, packagesResult.StructuredContent)
	packages := mustStringSliceValue(t, packagesPayload["packages"])
	assertInstalledPythonPackages(t, packages)
}

func assertAppMCPAppCatalog(t *testing.T, session *sdkmcp.ClientSession) {
	t.Helper()

	catalogResult := callAppMCPTool(t, session, "get_app_catalog", map[string]any{})
	catalogPayload := mustStructuredMapValue(t, catalogResult.StructuredContent)
	catalog := mustStructuredMapValue(t, catalogPayload["catalog"])
	if catalog["id"] != appspec.DefaultCatalogID {
		t.Fatalf("expected catalog id %q, got %#v", appspec.DefaultCatalogID, catalog["id"])
	}
}

func assertAppMCPAppComponents(t *testing.T, session *sdkmcp.ClientSession) {
	t.Helper()

	componentsResult := callAppMCPTool(t, session, "list_app_components", map[string]any{})
	componentsPayload := mustStructuredMapValue(t, componentsResult.StructuredContent)
	componentTypes := mustStringSliceValue(t, componentsPayload["components"])
	if len(componentTypes) == 0 || componentTypes[0] != "Stack" {
		t.Fatalf("expected ordered component list, got %#v", componentTypes)
	}
}

func assertAppMCPSettaDocs(t *testing.T, session *sdkmcp.ClientSession) {
	t.Helper()

	docsResult := callAppMCPTool(t, session, "get_setta_docs", map[string]any{})
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

	_, _, session := startAppMCPTestServer(t, cfg)

	toolsResult, err := session.ListTools(context.Background(), nil)
	if err != nil {
		t.Fatalf("list tools: %v", err)
	}
	assertAppMCPPluginBackendToolMetadata(t, toolsResult.Tools)

	setAuthenticatedMCPAgenticContext(t, session)
	assertAppMCPPluginBackendReadTool(t, session)
	assertAppMCPPluginBackendSearch(t, session)
}

func assertAppMCPPluginBackendToolMetadata(t *testing.T, tools []*sdkmcp.Tool) {
	t.Helper()

	readTool := appMCPToolByName(tools, "setta_fixture_mcp_read")
	writeTool := appMCPToolByName(tools, "setta_fixture_mcp_write")
	if readTool == nil || writeTool == nil {
		t.Fatalf("expected plugin backend MCP tools in list, got %#v", tools)
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
}

func appMCPToolByName(tools []*sdkmcp.Tool, name string) *sdkmcp.Tool {
	for _, tool := range tools {
		if tool.Name == name {
			return tool
		}
	}
	return nil
}

func assertAppMCPPluginBackendReadTool(t *testing.T, session *sdkmcp.ClientSession) {
	t.Helper()

	readResult := callAppMCPTool(t, session, "setta_fixture_mcp_read", map[string]any{
		"value": "alpha",
	})
	readPayload, ok := readResult.StructuredContent.(string)
	if !ok {
		t.Fatalf("expected string read payload, got %#v", readResult.StructuredContent)
	}
	if readPayload != "read:setta-fixture-backend-mcp-tools:alpha" {
		t.Fatalf("unexpected plugin backend read payload %q", readPayload)
	}
}

func assertAppMCPPluginBackendSearch(t *testing.T, session *sdkmcp.ClientSession) {
	t.Helper()

	searchResult := callAppMCPTool(t, session, "search_mcp_tools", map[string]any{
		"query": "fixture mcp read",
		"limit": 5,
	})
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

func TestAppIDEMCPServerSupportsReportCompletionStatusOverAuthenticatedStreamableHTTP(t *testing.T) {
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
	session, err := client.Connect(context.Background(), &sdkmcp.StreamableClientTransport{
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

func TestAppIDEMCPServerSupportsAgentProfileReadToolsOverAuthenticatedStreamableHTTP(t *testing.T) {
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
	session, err := client.Connect(context.Background(), &sdkmcp.StreamableClientTransport{
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

func TestAppIDEMCPServerSupportsRunAgentProfileOverAuthenticatedStreamableHTTP(t *testing.T) {
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
	session, err := client.Connect(context.Background(), &sdkmcp.StreamableClientTransport{
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

func TestAppIDEMCPServerSupportsGetMCPServerRuntimeStatusOverAuthenticatedStreamableHTTP(t *testing.T) {
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
	session, err := client.Connect(context.Background(), &sdkmcp.StreamableClientTransport{
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

func TestAppIDEMCPServerSupportsGetTerminalOutputOverAuthenticatedStreamableHTTP(t *testing.T) {
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
	session, err := client.Connect(context.Background(), &sdkmcp.StreamableClientTransport{
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

func TestAppIDEMCPServerSupportsTemporaryIDsForGetTerminalOutputOverAuthenticatedStreamableHTTP(t *testing.T) {
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
	session, err := client.Connect(context.Background(), &sdkmcp.StreamableClientTransport{
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
