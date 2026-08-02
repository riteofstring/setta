package mcpx

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"runtime"
	"slices"
	"sort"
	"strings"
	"testing"
	"time"

	"setta/internal/agentprofiles"
	"setta/internal/appsubsystem/appspec"
	"setta/internal/projectstate"
	"setta/internal/terminals"
	"setta/internal/tools"

	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestServerRegisterToolAddsRuntimePluginTools(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	server, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	_, err := server.RegisterTool(ToolRegistration{
		Spec: tools.Spec{
			Name:        "setta_plugin_runtime_tool",
			Description: "Runtime-registered plugin tool.",
			Metadata: tools.Metadata{
				Kind:       tools.KindDiscoverable,
				AccessType: tools.AccessTypeRead,
				SearchTags: []string{"plugin", "runtime"},
			},
			Handler: func(_ context.Context, arguments map[string]any) (any, error) {
				return map[string]any{
					"value": arguments["value"],
				}, nil
			},
		},
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"value": map[string]any{
					"type": "string",
				},
			},
			"required": []string{"value"},
		},
	})
	if err != nil {
		t.Fatalf("register runtime plugin tool: %v", err)
	}

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-section", "chat-section")

	toolsResult, err := clientSession.ListTools(context.Background(), nil)
	if err != nil {
		t.Fatalf("list tools after runtime registration: %v", err)
	}
	if !slices.ContainsFunc(toolsResult.Tools, func(tool *sdkmcp.Tool) bool {
		return tool != nil && tool.Name == "setta_plugin_runtime_tool"
	}) {
		t.Fatalf("expected runtime plugin tool in tool list, got %#v", toolsResult.Tools)
	}

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "setta_plugin_runtime_tool",
		Arguments: map[string]any{
			"value": "alpha",
		},
	})
	if err != nil {
		t.Fatalf("call runtime plugin tool: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected runtime plugin tool success, got %#v", result.StructuredContent)
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["value"] != "alpha" {
		t.Fatalf("expected value alpha, got %#v", payload["value"])
	}

	searchResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "search_mcp_tools",
		Arguments: map[string]any{
			"query": "plugin runtime",
			"limit": 5,
		},
	})
	if err != nil {
		t.Fatalf("search tools after runtime registration: %v", err)
	}
	if searchResult.IsError {
		t.Fatalf("expected runtime search success, got %#v", searchResult.StructuredContent)
	}
	searchPayload := mustStructuredMap(t, searchResult.StructuredContent)
	results := mustStructuredList(t, searchPayload["results"])
	if len(results) == 0 {
		t.Fatal("expected runtime search results")
	}
	first := mustStructuredMap(t, results[0])
	if first["name"] != "setta_plugin_runtime_tool" {
		t.Fatalf("expected runtime plugin tool search result, got %#v", results)
	}
}

func TestServerRemoveToolsDropsRuntimePluginTools(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	server, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	if _, err := server.RegisterTool(ToolRegistration{
		Spec: tools.Spec{
			Name:        "setta_plugin_runtime_tool",
			Description: "Runtime-registered plugin tool.",
			Metadata: tools.Metadata{
				Kind:       tools.KindDiscoverable,
				AccessType: tools.AccessTypeRead,
			},
			Handler: func(_ context.Context, arguments map[string]any) (any, error) {
				return arguments, nil
			},
		},
		InputSchema: map[string]any{
			"type": "object",
		},
	}); err != nil {
		t.Fatalf("register runtime plugin tool: %v", err)
	}

	server.RemoveTools("setta_plugin_runtime_tool")

	toolsResult, err := clientSession.ListTools(context.Background(), nil)
	if err != nil {
		t.Fatalf("list tools after removal: %v", err)
	}
	if slices.ContainsFunc(toolsResult.Tools, func(tool *sdkmcp.Tool) bool {
		return tool != nil && tool.Name == "setta_plugin_runtime_tool"
	}) {
		t.Fatalf("expected runtime plugin tool to be removed, got %#v", toolsResult.Tools)
	}
	if _, ok := server.Registry().Lookup("setta_plugin_runtime_tool"); ok {
		t.Fatal("expected removed runtime plugin tool to be absent from registry")
	}
}

func TestServerReplaceToolsSwapsRuntimePluginTools(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	server, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	if _, err := server.RegisterTool(ToolRegistration{
		Spec: tools.Spec{
			Name:        "setta_plugin_runtime_tool",
			Description: "Runtime-registered plugin tool.",
			Metadata: tools.Metadata{
				Kind:       tools.KindDiscoverable,
				AccessType: tools.AccessTypeRead,
			},
			Handler: func(_ context.Context, arguments map[string]any) (any, error) {
				return arguments, nil
			},
		},
		InputSchema: map[string]any{
			"type": "object",
		},
	}); err != nil {
		t.Fatalf("register initial runtime plugin tool: %v", err)
	}

	if err := server.ReplaceTools(
		[]string{"setta_plugin_runtime_tool"},
		[]ToolRegistration{
			{
				Spec: tools.Spec{
					Name:        "setta_plugin_runtime_tool_replacement",
					Description: "Replacement runtime plugin tool.",
					Metadata: tools.Metadata{
						Kind:       tools.KindDiscoverable,
						AccessType: tools.AccessTypeRead,
					},
					Handler: func(_ context.Context, arguments map[string]any) (any, error) {
						return map[string]any{"value": arguments["value"]}, nil
					},
				},
				InputSchema: map[string]any{
					"type": "object",
				},
			},
		},
	); err != nil {
		t.Fatalf("replace runtime plugin tools: %v", err)
	}

	toolsResult, err := clientSession.ListTools(context.Background(), nil)
	if err != nil {
		t.Fatalf("list tools after replacement: %v", err)
	}
	if slices.ContainsFunc(toolsResult.Tools, func(tool *sdkmcp.Tool) bool {
		return tool != nil && tool.Name == "setta_plugin_runtime_tool"
	}) {
		t.Fatalf("expected old runtime tool to be removed, got %#v", toolsResult.Tools)
	}
	if !slices.ContainsFunc(toolsResult.Tools, func(tool *sdkmcp.Tool) bool {
		return tool != nil && tool.Name == "setta_plugin_runtime_tool_replacement"
	}) {
		t.Fatalf("expected replacement runtime tool in list, got %#v", toolsResult.Tools)
	}
}

func TestServerSearchMCPToolsUsesDiscoverableToolsAndServerFilters(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "search_mcp_tools",
		Arguments: map[string]any{
			"query": "section size settings",
			"limit": 2,
		},
	})
	if err != nil {
		t.Fatalf("call search_mcp_tools: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected search_mcp_tools success, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	results := mustStructuredList(t, payload["results"])
	if len(results) == 0 {
		t.Fatal("expected at least one search result")
	}
	first := mustStructuredMap(t, results[0])
	if first["name"] != "set_section_sizes" {
		t.Fatalf("expected set_section_sizes as top search result, got %#v", first)
	}
	for _, rawResult := range results {
		entry := mustStructuredMap(t, rawResult)
		if entry["name"] == "search_mcp_tools" {
			t.Fatalf("expected init search tool to be excluded from search results, got %#v", results)
		}
	}

	filtered, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "search_mcp_tools",
		Arguments: map[string]any{
			"query":     "section size settings",
			"serverIds": []any{"filesystem"},
		},
	})
	if err != nil {
		t.Fatalf("call filtered search_mcp_tools: %v", err)
	}
	if filtered.IsError {
		t.Fatalf("expected filtered search_mcp_tools success, got %#v", filtered.StructuredContent)
	}
	filteredPayload := mustStructuredMap(t, filtered.StructuredContent)
	if got := mustStructuredList(t, filteredPayload["results"]); len(got) != 0 {
		t.Fatalf("expected non-setta server filter to return no results, got %#v", got)
	}
}

func TestServerSearchMCPToolsFindsCreateTopLevelSectionForCreateQueries(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	testCases := []struct {
		name  string
		query string
		limit int
	}{
		{name: "singular query", query: "create section", limit: 2},
		{name: "plural query", query: "create sections", limit: 3},
	}

	for _, testCase := range testCases {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
				Name: "search_mcp_tools",
				Arguments: map[string]any{
					"query": testCase.query,
					"limit": testCase.limit,
				},
			})
			if err != nil {
				t.Fatalf("call search_mcp_tools: %v", err)
			}
			if result.IsError {
				t.Fatalf("expected search_mcp_tools success, got %#v", result.StructuredContent)
			}

			payload := mustStructuredMap(t, result.StructuredContent)
			results := mustStructuredList(t, payload["results"])
			if !slices.ContainsFunc(results, func(rawResult any) bool {
				entry := mustStructuredMap(t, rawResult)
				return entry["name"] == "create_top_level_section"
			}) {
				t.Fatalf("expected create_top_level_section in search results for %q, got %#v", testCase.query, results)
			}
		})
	}
}

func TestServerToolCatalogIncludesTerminalSectionDescription(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	toolsResult, err := clientSession.ListTools(context.Background(), nil)
	if err != nil {
		t.Fatalf("list tools: %v", err)
	}

	var terminalTool *sdkmcp.Tool
	for _, tool := range toolsResult.Tools {
		if tool != nil && tool.Name == "getTerminalOutput" {
			terminalTool = tool
			break
		}
	}
	if terminalTool == nil {
		t.Fatal("expected getTerminalOutput tool")
	}

	inputSchema := mustStructuredMap(t, terminalTool.InputSchema)
	properties := mustStructuredMap(t, inputSchema["properties"])
	sectionSchema := mustStructuredMap(t, properties["sectionId"])
	if sectionSchema["description"] != "Top-level terminal section id whose buffered output should be returned." {
		t.Fatalf("unexpected getTerminalOutput sectionId description %#v", sectionSchema["description"])
	}
}

func TestReadRequiredFiniteNumberFieldAcceptsSupportedNumericTypes(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name  string
		value any
		want  float64
	}{
		{name: "float64", value: 1.5, want: 1.5},
		{name: "float32", value: float32(2.5), want: 2.5},
		{name: "int", value: 3, want: 3},
		{name: "int16", value: int16(4), want: 4},
		{name: "int64", value: int64(5), want: 5},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			value, err := readRequiredFiniteNumberField(map[string]any{"value": tc.value}, "layout", "value")
			if err != nil {
				t.Fatalf("read required number: %v", err)
			}
			if value != tc.want {
				t.Fatalf("expected %v, got %v", tc.want, value)
			}
		})
	}
}

func TestReadRequiredFiniteNumberFieldRejectsInvalidValues(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name        string
		value       any
		wantMessage string
	}{
		{name: "bool", value: true, wantMessage: "layout.value must be a number"},
		{name: "inf", value: math.Inf(1), wantMessage: "layout.value must be a finite number"},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			_, err := readRequiredFiniteNumberField(map[string]any{"value": tc.value}, "layout", "value")
			if err == nil {
				t.Fatal("expected number read to fail")
			}
			if !strings.Contains(err.Error(), tc.wantMessage) {
				t.Fatalf("expected error containing %q, got %v", tc.wantMessage, err)
			}
		})
	}
}

func TestServerSearchMCPToolsRejectsNonIntegerLimit(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "search_mcp_tools",
		Arguments: map[string]any{
			"query": "section size settings",
			"limit": "two",
		},
	})
	if err != nil {
		t.Fatalf("call invalid search_mcp_tools: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected invalid search_mcp_tools limit to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
	}
	message, _ := payload["message"].(string)
	if !strings.Contains(message, "limit must be an integer") {
		t.Fatalf("expected integer validation message, got %#v", payload["message"])
	}
}

func TestServerGetMCPServerRuntimeStatusReturnsClientStatuses(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	statusClient, err := NewClient(ClientOptions{
		Servers: map[string]ServerConfig{
			DefaultServerID: {
				Transport: TransportStreamableHTTP,
				URL:       "http://127.0.0.1:8000/mcp",
			},
		},
	})
	if err != nil {
		t.Fatalf("new status client: %v", err)
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:  t.TempDir(),
		ProjectState:   projectRuntime,
		LSPDiagnostics: openScopedTestLSPDiagnosticsRegistry(),
		MCPStatuses:    statusClient,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name:      "get_mcp_server_runtime_status",
		Arguments: map[string]any{},
	})
	if err != nil {
		t.Fatalf("call get_mcp_server_runtime_status: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected get_mcp_server_runtime_status success, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	servers := mustStructuredList(t, payload["servers"])
	if len(servers) != 1 {
		t.Fatalf("expected one runtime status, got %#v", servers)
	}
	serverStatus := mustStructuredMap(t, servers[0])
	if serverStatus["serverId"] != DefaultServerID {
		t.Fatalf("expected default server id, got %#v", serverStatus["serverId"])
	}
	if serverStatus["state"] != string(RuntimeStateUnknown) {
		t.Fatalf("expected unknown runtime state before client start, got %#v", serverStatus["state"])
	}
	if serverStatus["toolCount"] != float64(0) {
		t.Fatalf("expected zero tool count before client start, got %#v", serverStatus["toolCount"])
	}
}

func TestServerGetProjectConfigNamesAndIDsReturnsSortedMetadata(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, err := projectRuntime.MutateAndSave(context.Background(), func(document projectstate.Document) (projectstate.Document, error) {
		document.Projects["project-zeta"] = projectstate.Project{
			ID:   "project-zeta",
			Name: "Zeta",
		}
		document.Projects["project-beta"] = projectstate.Project{
			ID:   "project-beta",
			Name: "beta",
		}
		return document, nil
	})
	if err != nil {
		t.Fatalf("seed additional project metadata: %v", err)
	}

	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name:      "getProjectConfigNamesAndIds",
		Arguments: map[string]any{},
	})
	if err != nil {
		t.Fatalf("call getProjectConfigNamesAndIds: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected getProjectConfigNamesAndIds success, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	projectConfigs := mustStructuredList(t, payload["projectConfigs"])
	if len(projectConfigs) != 3 {
		t.Fatalf("expected three project configs, got %#v", projectConfigs)
	}
	first := mustStructuredMap(t, projectConfigs[0])
	second := mustStructuredMap(t, projectConfigs[1])
	third := mustStructuredMap(t, projectConfigs[2])
	if first["name"] != "Alpha" || second["name"] != "beta" || third["name"] != "Zeta" {
		t.Fatalf("expected sorted project metadata, got %#v", projectConfigs)
	}
}

func TestServerGetInstalledPythonPackagesReturnsProviderPayload(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:  t.TempDir(),
		ProjectState:   projectRuntime,
		LSPDiagnostics: openScopedTestLSPDiagnosticsRegistry(),
		PythonPackages: stubPythonPackageProvider{packages: []string{"Alpha=1.0.0", "beta=2.0.0", "zeta=3.0.0"}},
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name:      "getInstalledPythonPackages",
		Arguments: map[string]any{},
	})
	if err != nil {
		t.Fatalf("call getInstalledPythonPackages: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected getInstalledPythonPackages success, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	packages := mustStringList(t, payload["packages"])
	if !reflect.DeepEqual(packages, []string{"Alpha=1.0.0", "beta=2.0.0", "zeta=3.0.0"}) {
		t.Fatalf("expected forwarded package list, got %#v", packages)
	}
}

func TestServerGetTerminalOutputReturnsBufferedHistory(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("PTY-backed terminal history tests currently target macOS and Linux")
	}

	projectRuntime := openScopedTestProjectRuntime(t)
	terminalService := openScopedTestTerminalService(t)
	sessionID := terminals.BuildTerminalID("allowed-section", "")
	if _, _, err := terminalService.Open(terminals.OpenOptions{
		ID:         sessionID,
		ProjectID:  "project-alpha",
		AllowInput: true,
		Command:    quietScopedTestCatCommand(t),
	}); err != nil {
		t.Fatalf("open scoped test terminal: %v", err)
	}

	attachment := attachScopedTestTerminal(t, terminalService, sessionID)
	if err := terminalService.Write(sessionID, []byte("tool history line\n")); err != nil {
		t.Fatalf("write terminal history: %v", err)
	}
	output := waitForScopedTestOutputContains(t, attachment, "tool history line")
	if !strings.Contains(output, "tool history line") {
		t.Fatalf("expected written terminal output, got %q", output)
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:  t.TempDir(),
		ProjectState:   projectRuntime,
		LSPDiagnostics: openScopedTestLSPDiagnosticsRegistry(),
		Terminals:      terminalService,
	})
	defer clientSession.Close()
	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
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
		t.Fatalf("expected string terminal output payload, got %#v", result.StructuredContent)
	}
	if !strings.Contains(history, "tool history line") {
		t.Fatalf("expected terminal history to include written line, got %q", history)
	}
}

func TestServerGetAppCatalogAndListAppComponentsReturnDefaultCatalog(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	catalogResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name:      "get_app_catalog",
		Arguments: map[string]any{},
	})
	if err != nil {
		t.Fatalf("call get_app_catalog: %v", err)
	}
	if catalogResult.IsError {
		t.Fatalf("expected get_app_catalog success, got %#v", catalogResult.StructuredContent)
	}
	catalogPayload := mustStructuredMap(t, catalogResult.StructuredContent)
	catalog := mustStructuredMap(t, catalogPayload["catalog"])
	if catalog["id"] != appspec.DefaultCatalogID {
		t.Fatalf("expected catalog id %q, got %#v", appspec.DefaultCatalogID, catalog["id"])
	}
	components := mustStructuredList(t, catalog["components"])
	if len(components) == 0 || mustStructuredMap(t, components[0])["type"] != "Stack" {
		t.Fatalf("expected catalog to start with Stack, got %#v", components)
	}
	actions := mustStructuredList(t, catalog["actions"])
	if len(actions) != 5 {
		t.Fatalf("expected five catalog actions, got %#v", actions)
	}

	componentResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name:      "list_app_components",
		Arguments: map[string]any{},
	})
	if err != nil {
		t.Fatalf("call list_app_components: %v", err)
	}
	if componentResult.IsError {
		t.Fatalf("expected list_app_components success, got %#v", componentResult.StructuredContent)
	}
	componentPayload := mustStructuredMap(t, componentResult.StructuredContent)
	componentTypes := mustStructuredList(t, componentPayload["components"])
	if len(componentTypes) == 0 || componentTypes[0] != "Stack" {
		t.Fatalf("expected ordered component list, got %#v", componentTypes)
	}
}

func TestServerGetSettaDocsLoadsDefaultBundleAndRejectsEscapes(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	writeScopedTestDocsFile(t, filepath.Join(workspaceRoot, "docs", "reference", "setta-listener-examples.md"), "# Examples\n")
	writeScopedTestDocsFile(t, filepath.Join(workspaceRoot, "docs", "reference", "emit_to_frontend.md"), "# Emit\n")
	writeScopedTestDocsFile(t, filepath.Join(workspaceRoot, "docs", "reference", "setta-listener-hot-reload.md"), "# Hot Reload\n")
	writeScopedTestDocsFile(t, filepath.Join(workspaceRoot, "docs", "reference", "setta-realtime-behavior.md"), "# Realtime\n")
	writeScopedTestDocsFile(t, filepath.Join(workspaceRoot, "docs", "reference", "listener-flows.md"), "# Listener Flows\n")

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSessionWithOptions(t, workspaceRoot, projectRuntime, ServerOptions{
		WorkspaceRoot:  workspaceRoot,
		ProjectState:   projectRuntime,
		LSPDiagnostics: openScopedTestLSPDiagnosticsRegistry(),
		DocsRoot:       filepath.Join(workspaceRoot, "docs"),
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name:      "get_setta_docs",
		Arguments: map[string]any{},
	})
	if err != nil {
		t.Fatalf("call get_setta_docs: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected get_setta_docs success, got %#v", result.StructuredContent)
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	docs := mustStructuredList(t, payload["docs"])
	if len(docs) != 4 {
		t.Fatalf("expected four default docs, got %#v", docs)
	}
	availableDocs := mustStringList(t, payload["available_docs"])
	if !slices.Contains(availableDocs, "listener_flows") {
		t.Fatalf("expected listener_flows alias in available docs, got %#v", availableDocs)
	}

	invalid, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_setta_docs",
		Arguments: map[string]any{
			"docIds": []any{"../outside"},
		},
	})
	if err != nil {
		t.Fatalf("call invalid get_setta_docs: %v", err)
	}
	if !invalid.IsError {
		t.Fatal("expected get_setta_docs path escape to fail")
	}
	invalidPayload := mustStructuredMap(t, invalid.StructuredContent)
	if invalidPayload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments for invalid docs path, got %#v", invalidPayload)
	}
}

func TestServerReportCompletionStatusBuildsStructuredReportAndRejectsInvalidChecks(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "report_completion_status",
		Arguments: map[string]any{
			"taskId":               " task-a ",
			"completionIntent":     true,
			"requiresVerification": true,
			"checkResults": []any{
				map[string]any{
					"checkName": "pytest",
					"status":    "passed",
					"details":   "  verified  ",
					"source":    "  go test  ",
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

	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["taskId"] != "task-a" {
		t.Fatalf("expected trimmed taskId, got %#v", payload["taskId"])
	}
	if payload["completionIntent"] != true {
		t.Fatalf("expected completionIntent true, got %#v", payload["completionIntent"])
	}
	if payload["requiresVerification"] != true {
		t.Fatalf("expected requiresVerification true, got %#v", payload["requiresVerification"])
	}
	if payload["verificationStatus"] != string(verificationStatusPassed) {
		t.Fatalf("expected verificationStatus passed, got %#v", payload["verificationStatus"])
	}
	checkResults := mustStructuredList(t, payload["checkResults"])
	if len(checkResults) != 1 {
		t.Fatalf("expected one check result, got %#v", checkResults)
	}
	firstCheck := mustStructuredMap(t, checkResults[0])
	if firstCheck["details"] != "verified" {
		t.Fatalf("expected trimmed details, got %#v", firstCheck["details"])
	}
	if firstCheck["source"] != "go test" {
		t.Fatalf("expected trimmed source, got %#v", firstCheck["source"])
	}

	invalid, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "report_completion_status",
		Arguments: map[string]any{
			"completionIntent":     true,
			"requiresVerification": true,
			"checkResults": []any{
				map[string]any{
					"checkName": " ",
					"status":    "passed",
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("call invalid report_completion_status: %v", err)
	}
	if !invalid.IsError {
		t.Fatal("expected invalid report_completion_status call to fail")
	}
	invalidPayload := mustStructuredMap(t, invalid.StructuredContent)
	if invalidPayload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", invalidPayload["code"])
	}
	if invalidPayload["message"] != "checkResults[0].checkName must be non-empty" {
		t.Fatalf("unexpected invalid message %#v", invalidPayload["message"])
	}
}

func TestServerReportCompletionStatusCanUsePerCallMeta(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	server, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	result, err := server.InvokeTool(context.Background(), "report_completion_status", map[string]any{
		"taskId":               " task-a ",
		"completionIntent":     true,
		"requiresVerification": true,
		"checkResults": []any{
			map[string]any{
				"checkName": "pytest",
				"status":    "passed",
			},
		},
	}, ToolRequestContext{
		Meta: map[string]any{
			"projectConfigId": "project-alpha",
			"chatId":          "chat-1",
			"sectionId":       "chat-section",
		},
	})
	if err != nil {
		t.Fatalf("invoke report_completion_status with per-call meta: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected report_completion_status success via per-call meta, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["taskId"] != "task-a" {
		t.Fatalf("expected trimmed taskId, got %#v", payload["taskId"])
	}
	if payload["verificationStatus"] != string(verificationStatusPassed) {
		t.Fatalf("expected verificationStatus passed, got %#v", payload["verificationStatus"])
	}
}

func TestServerListAgentProfilesAndGetAgentProfile(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	store, err := agentprofiles.NewStore(root)
	if err != nil {
		t.Fatalf("new agent profile store: %v", err)
	}
	engineConfigID := "engine-alpha"
	memoryScope := "workspace"
	if err := store.Write([]agentprofiles.Profile{
		{
			ID:                          "profile-alpha",
			Name:                        "Alpha",
			Description:                 "Primary profile",
			SystemPrompt:                "You are alpha.",
			EnableBackgroundSummaryFill: true,
			EnableLlmChatTitles:         true,
			EngineConfigID:              &engineConfigID,
			ToolAllowlist:               []string{"tool.a"},
			MemoryScope:                 &memoryScope,
		},
		{
			ID:            "profile-beta",
			Name:          "Beta",
			Description:   "",
			SystemPrompt:  "You are beta.",
			ToolAllowlist: []string{},
		},
	}); err != nil {
		t.Fatalf("seed agent profiles: %v", err)
	}

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:  t.TempDir(),
		ProjectState:   projectRuntime,
		LSPDiagnostics: openScopedTestLSPDiagnosticsRegistry(),
		AgentProfiles:  store,
	})
	defer clientSession.Close()

	listResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name:      "list_agent_profiles",
		Arguments: map[string]any{},
	})
	if err != nil {
		t.Fatalf("call list_agent_profiles: %v", err)
	}
	if listResult.IsError {
		t.Fatalf("expected list_agent_profiles success, got %#v", listResult.StructuredContent)
	}
	listPayload := mustStructuredMap(t, listResult.StructuredContent)
	profiles := mustStructuredList(t, listPayload["profiles"])
	if len(profiles) != 2 {
		t.Fatalf("expected two agent profiles, got %#v", profiles)
	}
	firstProfile := mustStructuredMap(t, profiles[0])
	if firstProfile["id"] != "profile-alpha" {
		t.Fatalf("expected first profile-alpha entry, got %#v", firstProfile)
	}

	getResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
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
	profile := mustStructuredMap(t, getResult.StructuredContent)
	if profile["name"] != "Alpha" {
		t.Fatalf("expected Alpha profile, got %#v", profile)
	}
	if profile["memoryScope"] != "workspace" {
		t.Fatalf("expected workspace memoryScope, got %#v", profile["memoryScope"])
	}

	missingResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_agent_profile",
		Arguments: map[string]any{
			"profileId": "missing-profile",
		},
	})
	if err != nil {
		t.Fatalf("call missing get_agent_profile: %v", err)
	}
	if !missingResult.IsError {
		t.Fatal("expected missing get_agent_profile to fail")
	}
	missingPayload := mustStructuredMap(t, missingResult.StructuredContent)
	if missingPayload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments for missing profile, got %#v", missingPayload["code"])
	}
}

func openScopedTestTerminalService(t *testing.T) *terminals.Service {
	t.Helper()

	service, err := terminals.New(terminals.Options{})
	if err != nil {
		t.Fatalf("new scoped test terminal service: %v", err)
	}
	t.Cleanup(func() {
		if err := service.Close(context.Background()); err != nil {
			t.Fatalf("close scoped test terminal service: %v", err)
		}
	})
	return service
}

func quietScopedTestCatCommand(t *testing.T) []string {
	t.Helper()

	shell := requireScopedTestCommand(t, "sh")
	return []string{shell, "-c", "stty -echo; cat"}
}

func requireScopedTestCommand(t *testing.T, name string) string {
	t.Helper()

	path, err := exec.LookPath(name)
	if err != nil {
		t.Skipf("required command %q not available: %v", name, err)
	}
	return path
}

func attachScopedTestTerminal(t *testing.T, service *terminals.Service, sessionID string) *terminals.Attachment {
	t.Helper()

	attachment, err := service.Attach(sessionID)
	if err != nil {
		t.Fatalf("attach scoped test terminal %q: %v", sessionID, err)
	}
	t.Cleanup(attachment.Close)
	return attachment
}

func waitForScopedTestOutputContains(t *testing.T, attachment *terminals.Attachment, needle string) string {
	t.Helper()

	buffer := strings.Builder{}
	buffer.Write(attachment.History)
	if strings.Contains(buffer.String(), needle) {
		return buffer.String()
	}

	timeout := time.NewTimer(5 * time.Second)
	defer timeout.Stop()

	for {
		select {
		case chunk, ok := <-attachment.Output:
			if !ok {
				t.Fatalf("attachment output closed before %q appeared; collected output: %q", needle, buffer.String())
			}
			buffer.Write(chunk)
			if strings.Contains(buffer.String(), needle) {
				return buffer.String()
			}
		case <-timeout.C:
			t.Fatalf("timed out waiting for %q; collected output: %q", needle, buffer.String())
		}
	}
}

func writeScopedTestDocsFile(t *testing.T, path string, content string) {
	t.Helper()

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir docs parent: %v", err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write docs file: %v", err)
	}
}

func openScopedTestLSPDiagnosticsRegistry() *projectstate.LSPDiagnosticsRegistry {
	diagnostics := projectstate.NewLSPDiagnosticsRegistry(projectstate.LSPDiagnosticsRegistryOptions{})
	diag := projectstate.LSPDiagnostic{
		Message: "error",
		Code:    "reportFoo",
		Range: projectstate.LSPDiagnosticRange{
			Start: projectstate.LSPDiagnosticPosition{Line: 0, Character: 0},
			End:   projectstate.LSPDiagnosticPosition{Line: 0, Character: 1},
		},
	}
	diagnostics.UpdateCodeSection("project-alpha", "allowed-section", []projectstate.LSPDiagnostic{diag})
	diagnostics.UpdateCodeSection("project-alpha", "blocked-section", []projectstate.LSPDiagnostic{diag})
	diagnostics.UpdateGeneratedDocument(
		"project-alpha",
		projectstate.GeneratedDiagnosticsDocumentCode,
		projectstate.ProjectConfigDiagnostics{
			ProjectID: "project-alpha",
			IsGenCode: true,
			Errors: map[string]projectstate.SectionTypeErrors{
				"allowed-section": {Callable: []string{"ok"}},
				"blocked-section": {Callable: []string{"nope"}},
			},
		},
		[]projectstate.LSPDiagnostic{diag},
	)
	return diagnostics
}

func mustStructuredMap(t *testing.T, value any) map[string]any {
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

func payloadRawStringField(object map[string]any, key string) string {
	value, ok := object[key]
	if !ok || value == nil {
		return ""
	}
	switch typed := value.(type) {
	case string:
		return typed
	default:
		return fmt.Sprint(typed)
	}
}

func payloadBoolField(object map[string]any, key string) bool {
	value, ok := object[key]
	if !ok {
		return false
	}
	typed, ok := value.(bool)
	return ok && typed
}

func mustStructuredList(t *testing.T, value any) []any {
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

func mustDecodedProjectPayload(t *testing.T, raw projectstate.RawJSON) map[string]any {
	t.Helper()

	var decoded map[string]any
	if err := json.Unmarshal(raw, &decoded); err != nil {
		t.Fatalf("decode project payload: %v", err)
	}
	return decoded
}

func mustStringList(t *testing.T, value any) []string {
	t.Helper()
	items := mustStructuredList(t, value)
	result := make([]string, 0, len(items))
	for _, item := range items {
		typed, ok := item.(string)
		if !ok {
			t.Fatalf("expected string list item, got %#v", item)
		}
		result = append(result, typed)
	}
	sort.Strings(result)
	return result
}

func containsString(values []string, needle string) bool {
	for _, value := range values {
		if value == needle {
			return true
		}
	}
	return false
}

func mustRawJSON(t *testing.T, value any) projectstate.RawJSON {
	t.Helper()
	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal raw json: %v", err)
	}
	return encoded
}
