package mcpx

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sort"
	"testing"

	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"
	"setta/internal/projectstate"
	"setta/internal/tools"
)

func TestReadFileRangeHandlerMirrorsPythonBehavior(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	sourcePath := filepath.Join(workspaceRoot, "example.txt")
	if err := os.WriteFile(sourcePath, []byte("alpha\nbeta\ngamma\n"), 0o644); err != nil {
		t.Fatalf("write source file: %v", err)
	}

	handler := newReadFileRangeHandler(workspaceRoot)

	t.Run("reads entire file when range unspecified", func(t *testing.T) {
		result := mustReadFileRangeResult(t, handler, map[string]any{
			"path": "example.txt",
		})

		if result.Path != "example.txt" {
			t.Fatalf("expected relative path example.txt, got %q", result.Path)
		}
		if result.AbsolutePath != sourcePath {
			t.Fatalf("expected absolute path %q, got %q", sourcePath, result.AbsolutePath)
		}
		if result.StartLine != 1 {
			t.Fatalf("expected start line 1, got %d", result.StartLine)
		}
		if result.EndLine != 3 {
			t.Fatalf("expected end line 3, got %d", result.EndLine)
		}
		if result.Content != "alpha\nbeta\ngamma" {
			t.Fatalf("unexpected file content %q", result.Content)
		}
	})

	t.Run("reads specified range", func(t *testing.T) {
		result := mustReadFileRangeResult(t, handler, map[string]any{
			"path":       "example.txt",
			"start_line": 2,
			"end_line":   3,
		})

		if result.StartLine != 2 {
			t.Fatalf("expected start line 2, got %d", result.StartLine)
		}
		if result.EndLine != 3 {
			t.Fatalf("expected end line 3, got %d", result.EndLine)
		}
		if result.Content != "beta\ngamma" {
			t.Fatalf("unexpected ranged content %q", result.Content)
		}
	})

	t.Run("handles start beyond end of file", func(t *testing.T) {
		result := mustReadFileRangeResult(t, handler, map[string]any{
			"path":       "example.txt",
			"start_line": 10,
		})

		if result.StartLine != 10 {
			t.Fatalf("expected start line 10, got %d", result.StartLine)
		}
		if result.EndLine != 9 {
			t.Fatalf("expected realized end line 9, got %d", result.EndLine)
		}
		if result.Content != "" {
			t.Fatalf("expected empty content, got %q", result.Content)
		}
	})

	t.Run("missing file returns structured tool error", func(t *testing.T) {
		err := mustToolError(t, handler, map[string]any{
			"path": "missing.txt",
		})

		if err.code != "file_not_found" {
			t.Fatalf("expected file_not_found, got %q", err.code)
		}
	})

	t.Run("rejects non utf8 files", func(t *testing.T) {
		binaryPath := filepath.Join(workspaceRoot, "binary.dat")
		if err := os.WriteFile(binaryPath, []byte{0xff, 0xfe, 0xfa}, 0o644); err != nil {
			t.Fatalf("write binary file: %v", err)
		}

		err := mustToolError(t, handler, map[string]any{
			"path": "binary.dat",
		})

		if err.code != "invalid_arguments" {
			t.Fatalf("expected invalid_arguments, got %q", err.code)
		}
	})

	t.Run("rejects path escapes outside workspace", func(t *testing.T) {
		err := mustToolError(t, handler, map[string]any{
			"path": "../outside.txt",
		})

		if err.code != "invalid_arguments" {
			t.Fatalf("expected invalid_arguments, got %q", err.code)
		}
	})
}

func TestServerListsToolsAndScopesToolCalls(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	if err := os.WriteFile(filepath.Join(workspaceRoot, "example.txt"), []byte("alpha\nbeta\ngamma\n"), 0o644); err != nil {
		t.Fatalf("write source file: %v", err)
	}

	projectRuntime := openScopedTestProjectRuntime(t)
	server, clientSession := newScopedTestServerSession(t, workspaceRoot, projectRuntime)
	defer clientSession.Close()

	toolsResult, err := clientSession.ListTools(context.Background(), nil)
	if err != nil {
		t.Fatalf("list tools: %v", err)
	}
	if len(toolsResult.Tools) != 4 {
		t.Fatalf("expected 4 tools, got %d", len(toolsResult.Tools))
	}

	names := make([]string, 0, len(toolsResult.Tools))
	var summaryTool *sdkmcp.Tool
	for _, tool := range toolsResult.Tools {
		names = append(names, tool.Name)
		if tool.Name == "get_latest_project_state_summary" {
			summaryTool = tool
		}
	}
	sort.Strings(names)
	expectedNames := []string{
		"get_latest_project_state_summary",
		"list_mcp_tools",
		"read_file_range",
		"set_agentic_context",
	}
	for index, name := range expectedNames {
		if names[index] != name {
			t.Fatalf("unexpected tool names %#v", names)
		}
	}

	if summaryTool == nil {
		t.Fatal("expected get_latest_project_state_summary tool")
	}
	settaMeta := mustStructuredMap(t, summaryTool.Meta[toolMetaNamespace])
	if settaMeta["resultFilter"] != string(tools.ResultFilterProjectStateSummary) {
		t.Fatalf("expected project-state result filter, got %#v", settaMeta["resultFilter"])
	}

	listResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{Name: "list_mcp_tools"})
	if err != nil {
		t.Fatalf("call list_mcp_tools: %v", err)
	}
	listPayload := mustStructuredMap(t, listResult.StructuredContent)
	listNames := mustStringList(t, listPayload["tools"])
	if len(listNames) != 4 {
		t.Fatalf("expected 4 registered tool names, got %#v", listNames)
	}

	scopeResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name:      "read_file_range",
		Arguments: map[string]any{"path": "example.txt"},
	})
	if err != nil {
		t.Fatalf("call read_file_range missing context: %v", err)
	}
	if !scopeResult.IsError {
		t.Fatal("expected missing context to return structured tool error")
	}
	scopePayload := mustStructuredMap(t, scopeResult.StructuredContent)
	if scopePayload["code"] != scopeViolationErrorCode {
		t.Fatalf("expected scope violation code, got %#v", scopePayload["code"])
	}
	if scopePayload["reason"] != "missing_context" {
		t.Fatalf("expected missing_context reason, got %#v", scopePayload["reason"])
	}

	blankAffinityResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_agentic_context",
		Arguments: map[string]any{
			"projectConfigId":       "project-alpha",
			"chatId":                "chat-1",
			"sectionId":             "chat-section",
			"frontendAffinityToken": "   ",
		},
	})
	if err != nil {
		t.Fatalf("call set_agentic_context blank affinity: %v", err)
	}
	if !blankAffinityResult.IsError {
		t.Fatal("expected blank affinity token to fail")
	}

	setContextResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_agentic_context",
		Arguments: map[string]any{
			"projectConfigId":       "project-alpha",
			"chatId":                "chat-1",
			"sectionId":             "chat-section",
			"frontendAffinityToken": "frontend-1",
		},
	})
	if err != nil {
		t.Fatalf("call set_agentic_context: %v", err)
	}
	if setContextResult.IsError {
		t.Fatalf("expected set_agentic_context success, got %#v", setContextResult.StructuredContent)
	}

	readResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
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
	readPayload := mustStructuredMap(t, readResult.StructuredContent)
	if readPayload["content"] != "beta\ngamma" {
		t.Fatalf("expected ranged file content, got %#v", readPayload["content"])
	}

	summaryResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name:      "get_latest_project_state_summary",
		Arguments: map[string]any{"projectConfigId": "project-alpha"},
	})
	if err != nil {
		t.Fatalf("call get_latest_project_state_summary: %v", err)
	}
	if summaryResult.IsError {
		t.Fatalf("expected project summary success, got %#v", summaryResult.StructuredContent)
	}
	assertSummaryPayload(t, summaryResult.StructuredContent)

	mismatchResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name:      "get_latest_project_state_summary",
		Arguments: map[string]any{"projectConfigId": "project-beta"},
	})
	if err != nil {
		t.Fatalf("call get_latest_project_state_summary mismatch: %v", err)
	}
	if !mismatchResult.IsError {
		t.Fatal("expected mismatched project config id to fail")
	}
	mismatchPayload := mustStructuredMap(t, mismatchResult.StructuredContent)
	if mismatchPayload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments, got %#v", mismatchPayload["code"])
	}
	if mismatchPayload["message"] == nil {
		t.Fatalf("expected mismatch message, got %#v", mismatchPayload)
	}

	if server.sessionAgenticContext("missing-session") != nil {
		t.Fatal("expected missing session agentic context lookup to return nil")
	}
}

func TestServerProjectStateSummaryCanUsePerCallMeta(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Meta: sdkmcp.Meta{
			"projectConfigId": "project-alpha",
			"chatId":          "chat-1",
			"sectionId":       "chat-section",
		},
		Name:      "get_latest_project_state_summary",
		Arguments: map[string]any{"projectConfigId": "project-alpha"},
	})
	if err != nil {
		t.Fatalf("call get_latest_project_state_summary with meta: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected summary success via request meta, got %#v", result.StructuredContent)
	}
	assertSummaryPayload(t, result.StructuredContent)
}

func TestServerHandlerServesSSETransport(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	server, err := NewServer(ServerOptions{WorkspaceRoot: workspaceRoot})
	if err != nil {
		t.Fatalf("new server: %v", err)
	}

	httpServer := httptest.NewServer(server.Handler())
	defer httpServer.Close()

	client := sdkmcp.NewClient(&sdkmcp.Implementation{Name: "test-client", Version: "0.1.0"}, nil)
	session, err := client.Connect(context.Background(), &sdkmcp.SSEClientTransport{
		Endpoint: httpServer.URL,
	}, nil)
	if err != nil {
		t.Fatalf("connect sse client: %v", err)
	}
	defer session.Close()

	result, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name:      "list_mcp_tools",
		Arguments: map[string]any{},
	})
	if err != nil {
		t.Fatalf("call list_mcp_tools over sse: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected success result, got error %#v", result.StructuredContent)
	}
}

func openScopedTestProjectRuntime(t *testing.T) *projectstate.Runtime {
	t.Helper()

	runtime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
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
					"blocked-section",
				},
				TopLevelSections: map[string]projectstate.TopLevelSectionLayout{
					"chat-section":      {X: 10, Y: 20},
					"peer-chat-section": {X: 20, Y: 30},
					"allowed-section":   {X: 30, Y: 40},
					"blocked-section":   {X: 40, Y: 50},
				},
				SectionVariantMap: map[string]string{
					"chat-section":      "chat-variant",
					"peer-chat-section": "peer-chat-variant",
					"allowed-section":   "allowed-variant",
					"blocked-section":   "blocked-variant",
				},
				AgenticEdges: []projectstate.AgenticEdge{
					{
						ID:              "edge-context",
						SourceSectionID: "allowed-section",
						TargetSectionID: "chat-section",
						Kind:            agenticEdgeKindSectionChat,
					},
					{
						ID:              "edge-peer",
						SourceSectionID: "chat-section",
						TargetSectionID: "peer-chat-section",
						Kind:            agenticEdgeKindChatChat,
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
					"blocked-section": {
						ID:               "blocked-section",
						Name:             "Blocked",
						VariantIDs:       []string{"blocked-variant"},
						DefaultVariantID: "blocked-variant",
					},
				},
				SectionVariants: map[string]projectstate.SectionVariant{
					"chat-variant":      {ID: "chat-variant", ImplID: "chat-impl"},
					"peer-chat-variant": {ID: "peer-chat-variant", ImplID: "peer-chat-impl"},
					"allowed-variant":   {ID: "allowed-variant", ImplID: "allowed-impl"},
					"blocked-variant":   {ID: "blocked-variant", ImplID: "blocked-impl"},
				},
				SectionImpls: map[string]projectstate.SectionImpl{
					"chat-impl": {
						ID:      "chat-impl",
						Kind:    projectstate.SectionKind("frontend"),
						Payload: mustRawJSON(t, map[string]any{"id": "chat-impl", "type": "Chat"}),
					},
					"peer-chat-impl": {
						ID:      "peer-chat-impl",
						Kind:    projectstate.SectionKind("frontend"),
						Payload: mustRawJSON(t, map[string]any{"id": "peer-chat-impl", "type": "Chat"}),
					},
					"allowed-impl": {
						ID:      "allowed-impl",
						Kind:    projectstate.SectionKind("frontend"),
						Payload: mustRawJSON(t, map[string]any{"id": "allowed-impl", "type": "TextBlock"}),
					},
					"blocked-impl": {
						ID:      "blocked-impl",
						Kind:    projectstate.SectionKind("frontend"),
						Payload: mustRawJSON(t, map[string]any{"id": "blocked-impl", "type": "Dict"}),
					},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})
	return runtime
}

func newScopedTestServerSession(t *testing.T, workspaceRoot string, projectRuntime *projectstate.Runtime) (*Server, *sdkmcp.ClientSession) {
	t.Helper()

	server, err := NewServer(ServerOptions{
		WorkspaceRoot: workspaceRoot,
		ProjectState:  projectRuntime,
	})
	if err != nil {
		t.Fatalf("new server: %v", err)
	}

	ctx := context.Background()
	serverTransport, clientTransport := sdkmcp.NewInMemoryTransports()
	serverSession, err := server.server.Connect(ctx, serverTransport, nil)
	if err != nil {
		t.Fatalf("connect server session: %v", err)
	}
	t.Cleanup(func() {
		if err := serverSession.Close(); err != nil {
			t.Fatalf("close server session: %v", err)
		}
	})

	client := sdkmcp.NewClient(&sdkmcp.Implementation{Name: "test-client", Version: "0.1.0"}, nil)
	clientSession, err := client.Connect(ctx, clientTransport, nil)
	if err != nil {
		t.Fatalf("connect client session: %v", err)
	}
	return server, clientSession
}

func mustReadFileRangeResult(t *testing.T, handler tools.Handler, arguments map[string]any) readFileRangeResult {
	t.Helper()

	result, err := handler(context.Background(), arguments)
	if err != nil {
		t.Fatalf("unexpected handler error: %v", err)
	}
	typed, ok := result.(readFileRangeResult)
	if !ok {
		t.Fatalf("expected readFileRangeResult, got %#v", result)
	}
	return typed
}

func mustToolError(t *testing.T, handler tools.Handler, arguments map[string]any) *toolError {
	t.Helper()

	_, err := handler(context.Background(), arguments)
	if err == nil {
		t.Fatal("expected tool error")
	}
	typed, ok := err.(*toolError)
	if !ok {
		t.Fatalf("expected *toolError, got %T", err)
	}
	return typed
}

func assertSummaryPayload(t *testing.T, payload any) {
	t.Helper()

	summary := mustStructuredMap(t, payload)
	projectConfig := mustStructuredMap(t, summary["projectConfig"])
	sectionVariantMap := mustStructuredMap(t, projectConfig["sectionVariantMap"])
	if len(sectionVariantMap) != 2 {
		t.Fatalf("expected two allowed section variants, got %#v", sectionVariantMap)
	}
	if _, ok := sectionVariantMap["allowed-section"]; !ok {
		t.Fatalf("expected allowed-section in summary, got %#v", sectionVariantMap)
	}
	if _, ok := sectionVariantMap["peer-chat-section"]; !ok {
		t.Fatalf("expected peer-chat-section in summary, got %#v", sectionVariantMap)
	}
	if _, ok := sectionVariantMap["blocked-section"]; ok {
		t.Fatalf("did not expect blocked-section in summary, got %#v", sectionVariantMap)
	}

	parentSectionMap := mustStructuredMap(t, summary["parentSectionMap"])
	if _, ok := parentSectionMap["blocked-section"]; ok {
		t.Fatalf("did not expect blocked-section in parent map, got %#v", parentSectionMap)
	}

	sections := mustStructuredList(t, summary["sections"])
	var sectionIDs []string
	for _, rawSection := range sections {
		section := mustStructuredMap(t, rawSection)
		sectionID, ok := section["sectionId"].(string)
		if !ok {
			t.Fatalf("expected sectionId string, got %#v", section["sectionId"])
		}
		sectionIDs = append(sectionIDs, sectionID)
	}
	sort.Strings(sectionIDs)
	if len(sectionIDs) != 2 || sectionIDs[0] != "allowed-section" || sectionIDs[1] != "peer-chat-section" {
		t.Fatalf("unexpected filtered section ids %#v", sectionIDs)
	}
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

func mustRawJSON(t *testing.T, value any) projectstate.RawJSON {
	t.Helper()
	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal raw json: %v", err)
	}
	return encoded
}
