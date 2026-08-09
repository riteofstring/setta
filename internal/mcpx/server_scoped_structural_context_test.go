package mcpx

import (
	"context"
	"net/http"
	"path/filepath"
	"reflect"
	"sort"
	"testing"

	"setta/internal/projectstate"

	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestServerSetCodeObjectDisplayNameRespectsScopedWriteTargets(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_code_obj_display_name",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"codeObjId":       "allowed-param",
			"displayName":     "Height",
		},
	})
	if err != nil {
		t.Fatalf("call set_code_obj_display_name allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected allowed set_code_obj_display_name success, got %#v", allowedResult.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_code_obj_display_name: %v", err)
	}
	if got := project.CodeObjs["allowed-param"].DisplayName; got != "Height" {
		t.Fatalf("expected display name Height, got %q", got)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_code_obj_display_name",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"codeObjId":       "blocked-param",
			"displayName":     "Blocked",
		},
	})
	if err != nil {
		t.Fatalf("call set_code_obj_display_name blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked set_code_obj_display_name call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if blockedPayload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", blockedPayload["reason"])
	}
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "blocked-params-section" {
		t.Fatalf("unexpected blockedSectionIds %#v", ids)
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

func TestServerSetAgenticContextPersistsSessionScopeForLaterToolCalls(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	server, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	requestContext := ToolRequestContext{SessionKey: "session-alpha"}
	result, err := server.InvokeTool(context.Background(), "set_agentic_context", map[string]any{
		"projectConfigId":       "project-alpha",
		"chatId":                "chat-1",
		"sectionId":             "chat-section",
		"runId":                 "run-child",
		"frontendAffinityToken": "frontend-1",
	}, requestContext)
	if err != nil {
		t.Fatalf("invoke set_agentic_context: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected set_agentic_context success, got %#v", result.StructuredContent)
	}

	stored := server.sessionAgenticContext(requestContext.SessionKey)
	if stored == nil {
		t.Fatal("expected session agentic context to be stored")
	}
	if stored.ProjectConfigID != "project-alpha" {
		t.Fatalf("expected stored projectConfigId project-alpha, got %q", stored.ProjectConfigID)
	}
	if stored.ChatID != "chat-1" {
		t.Fatalf("expected stored chatId chat-1, got %q", stored.ChatID)
	}
	if stored.SectionID != "chat-section" {
		t.Fatalf("expected stored sectionId chat-section, got %q", stored.SectionID)
	}
	if stored.RunID != "run-child" {
		t.Fatalf("expected stored runId run-child, got %q", stored.RunID)
	}
	if stored.FrontendAffinityToken != "frontend-1" {
		t.Fatalf("expected stored frontend affinity frontend-1, got %q", stored.FrontendAffinityToken)
	}

	summaryResult, err := server.InvokeTool(context.Background(), "get_latest_project_state_summary", map[string]any{
		"projectConfigId": "project-alpha",
	}, requestContext)
	if err != nil {
		t.Fatalf("invoke get_latest_project_state_summary after set_agentic_context: %v", err)
	}
	if summaryResult.IsError {
		t.Fatalf("expected session-scoped project summary success, got %#v", summaryResult.StructuredContent)
	}
	assertSummaryPayload(t, summaryResult.StructuredContent)
}

func TestServerScopedReadToolsRecomputeScopeAfterEdgeMutation(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	server, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	requestContext := ToolRequestContext{SessionKey: "session-scope-refresh"}
	setContextResult, err := server.InvokeTool(context.Background(), "set_agentic_context", map[string]any{
		"projectConfigId": "project-alpha",
		"chatId":          "chat-1",
		"sectionId":       "chat-section",
	}, requestContext)
	if err != nil {
		t.Fatalf("invoke set_agentic_context: %v", err)
	}
	if setContextResult.IsError {
		t.Fatalf("expected set_agentic_context success, got %#v", setContextResult.StructuredContent)
	}

	firstResult, err := server.InvokeTool(context.Background(), "get_latest_project_state_summary", map[string]any{
		"projectConfigId": "project-alpha",
	}, requestContext)
	if err != nil {
		t.Fatalf("invoke first get_latest_project_state_summary: %v", err)
	}
	if firstResult.IsError {
		t.Fatalf("expected first project summary success, got %#v", firstResult.StructuredContent)
	}
	firstSummary := mustStructuredMap(t, firstResult.StructuredContent)
	firstProjectConfig := mustStructuredMap(t, firstSummary["projectConfig"])
	firstSectionVariantMap := mustStructuredMap(t, firstProjectConfig["sectionVariantMap"])
	if _, ok := firstSectionVariantMap["blocked-section"]; ok {
		t.Fatalf("did not expect blocked-section before edge mutation, got %#v", firstSectionVariantMap)
	}

	if _, err := projectRuntime.Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		project := document.Projects["project-alpha"]
		project.AgenticEdges = append(project.AgenticEdges, projectstate.AgenticEdge{
			ID:              "edge-unblocked",
			SourceSectionID: "chat-section",
			TargetSectionID: "blocked-section",
			Kind:            "chat_section",
		})
		document.Projects["project-alpha"] = project
		return document, nil
	}); err != nil {
		t.Fatalf("mutate agentic edges: %v", err)
	}

	secondResult, err := server.InvokeTool(context.Background(), "get_latest_project_state_summary", map[string]any{
		"projectConfigId": "project-alpha",
	}, requestContext)
	if err != nil {
		t.Fatalf("invoke second get_latest_project_state_summary: %v", err)
	}
	if secondResult.IsError {
		t.Fatalf("expected second project summary success, got %#v", secondResult.StructuredContent)
	}
	secondSummary := mustStructuredMap(t, secondResult.StructuredContent)
	secondProjectConfig := mustStructuredMap(t, secondSummary["projectConfig"])
	secondSectionVariantMap := mustStructuredMap(t, secondProjectConfig["sectionVariantMap"])
	if _, ok := secondSectionVariantMap["blocked-section"]; !ok {
		t.Fatalf("expected blocked-section after edge mutation, got %#v", secondSectionVariantMap)
	}
}

func TestServerScopedReadToolsCanUseHeaderContextAndTemporaryIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeScopedReadTemporaryIDMap(t, temporaryIDMapPath)

	server, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	headers := http.Header{}
	headers.Set(AgenticContextProjectConfigIDHeader, "11")
	headers.Set(AgenticContextChatIDHeader, "12")
	headers.Set(AgenticContextSectionIDHeader, "13")
	requestContext := ToolRequestContext{Headers: headers}

	result, err := server.InvokeTool(context.Background(), "get_latest_project_state_summary", map[string]any{
		"projectConfigId": "11",
	}, requestContext)
	if err != nil {
		t.Fatalf("invoke header-scoped temp-id project summary: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected header-scoped temp-id summary success, got %#v", result.StructuredContent)
	}
	assertScopedSummaryUsesTranslatedIDs(t, result.StructuredContent)

	diagnosticsResult, err := server.InvokeTool(context.Background(), "get_latest_lsp_diagnostics", map[string]any{
		"projectConfigId": "11",
	}, requestContext)
	if err != nil {
		t.Fatalf("invoke header-scoped temp-id lsp diagnostics: %v", err)
	}
	if diagnosticsResult.IsError {
		t.Fatalf("expected header-scoped temp-id diagnostics success, got %#v", diagnosticsResult.StructuredContent)
	}
	assertScopedDiagnosticsUsesTranslatedIDs(t, diagnosticsResult.StructuredContent)
}

func writeScopedReadTemporaryIDMap(t *testing.T, path string) {
	t.Helper()

	writeTemporaryIDMapForTest(t, path, map[string]string{
		"project-alpha":            "11",
		"chat-1":                   "12",
		"chat-section":             "13",
		"allowed-section":          "14",
		"peer-chat-section":        "15",
		"blocked-section":          "16",
		"allowed-variant":          "17",
		"peer-chat-variant":        "18",
		"blocked-variant":          "19",
		"allowed-params-section":   "20",
		"allowed-params-variant":   "21",
		"edge-context":             "22",
		"edge-peer":                "23",
		"allowed-callable-section": "24",
		"allowed-callable-variant": "25",
	})
}

func assertScopedSummaryUsesTranslatedIDs(t *testing.T, rawSummary any) {
	t.Helper()

	summary := mustStructuredMap(t, rawSummary)
	projectConfig := mustStructuredMap(t, summary["projectConfig"])
	if projectConfig["id"] != "11" {
		t.Fatalf("expected translated project id 11, got %#v", projectConfig["id"])
	}
	sectionVariantMap := mustStructuredMap(t, projectConfig["sectionVariantMap"])
	for _, expectedID := range []string{"14", "15", "20", "24"} {
		if _, ok := sectionVariantMap[expectedID]; !ok {
			t.Fatalf("expected translated section key %s, got %#v", expectedID, sectionVariantMap)
		}
	}
	if _, ok := sectionVariantMap["16"]; ok {
		t.Fatalf("did not expect blocked-section key 16 in scoped summary, got %#v", sectionVariantMap)
	}

	sections := mustStructuredList(t, summary["sections"])
	sectionIDs := make([]string, 0, len(sections))
	for _, rawSection := range sections {
		section := mustStructuredMap(t, rawSection)
		sectionID, ok := section["sectionId"].(string)
		if !ok {
			t.Fatalf("expected translated sectionId string, got %#v", section["sectionId"])
		}
		sectionIDs = append(sectionIDs, sectionID)
	}
	sort.Strings(sectionIDs)
	expectedSectionIDs := []string{"14", "15", "20", "24"}
	if !reflect.DeepEqual(sectionIDs, expectedSectionIDs) {
		t.Fatalf("unexpected translated section ids %#v", sectionIDs)
	}
}

func assertScopedDiagnosticsUsesTranslatedIDs(t *testing.T, rawDiagnostics any) {
	t.Helper()

	diagnosticsPayload := mustStructuredMap(t, rawDiagnostics)
	codeSections := mustStructuredMap(t, diagnosticsPayload["codeSections"])
	if _, ok := codeSections["14"]; !ok {
		t.Fatalf("expected translated allowed-section diagnostics key 14, got %#v", codeSections)
	}
	if _, ok := codeSections["15"]; ok {
		t.Fatalf("did not expect peer-chat-section diagnostics key 15, got %#v", codeSections)
	}
	genCode := mustStructuredMap(t, diagnosticsPayload["genCode"])
	genErrors := mustStructuredMap(t, genCode["errors"])
	if _, ok := genErrors["14"]; !ok {
		t.Fatalf("expected translated allowed-section gen diagnostics key 14, got %#v", genErrors)
	}
	if unmapped := mustStructuredList(t, diagnosticsPayload["unmappedGenCode"]); len(unmapped) != 0 {
		t.Fatalf("expected scoped diagnostics to drop unmapped gen code, got %#v", unmapped)
	}
}
