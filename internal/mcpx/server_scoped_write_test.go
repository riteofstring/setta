package mcpx

import (
	"context"
	"fmt"
	"net/http"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"testing"

	appdefinition "setta/internal/appsubsystem/appdefinition"
	"setta/internal/appsubsystem/appspec"
	"setta/internal/projectstate"

	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestServerSetAgenticContextRejectsBlankFrontendAffinityToken(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_agentic_context",
		Arguments: map[string]any{
			"projectConfigId":       "project-alpha",
			"chatId":                "chat-1",
			"sectionId":             "chat-section",
			"frontendAffinityToken": "   ",
		},
	})
	if err != nil {
		t.Fatalf("call set_agentic_context: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected blank frontend affinity token to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
	}
	message, _ := payload["message"].(string)
	if !strings.Contains(message, "frontendAffinityToken must be a non-empty string when provided") {
		t.Fatalf("expected blank frontend affinity token message, got %#v", payload)
	}
}

func TestServerScopedReadToolsRejectEmptyReadableScope(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	if _, err := projectRuntime.Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		project := document.Projects["project-alpha"]
		project.AgenticEdges = nil
		document.Projects["project-alpha"] = project
		return document, nil
	}); err != nil {
		t.Fatalf("remove scoped read edges: %v", err)
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:  t.TempDir(),
		ProjectState:   projectRuntime,
		LSPDiagnostics: openScopedTestLSPDiagnosticsRegistry(),
	})
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	for _, toolName := range []string{
		"get_latest_project_state_summary",
		"get_latest_lsp_diagnostics",
	} {
		result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
			Name:      toolName,
			Arguments: map[string]any{"projectConfigId": "project-alpha"},
		})
		if err != nil {
			t.Fatalf("call %s: %v", toolName, err)
		}
		if !result.IsError {
			t.Fatalf("expected %s empty-scope failure, got %#v", toolName, result.StructuredContent)
		}
		payload := mustStructuredMap(t, result.StructuredContent)
		if payload["code"] != scopeViolationErrorCode {
			t.Fatalf("expected scope_violation code for %s, got %#v", toolName, payload["code"])
		}
		if payload["reason"] != "empty_scope" {
			t.Fatalf("expected empty_scope reason for %s, got %#v", toolName, payload["reason"])
		}
		message, ok := payload["message"].(string)
		if !ok || !strings.Contains(message, "no readable sections") {
			t.Fatalf("expected no-readable-sections message for %s, got %#v", toolName, payload["message"])
		}
	}
}

func TestServerScopedReadToolsRequireAgenticContextAndSectionContext(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	server, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	testCases := []struct {
		name         string
		request      ToolRequestContext
		expectedCode string
	}{
		{
			name:         "missing context",
			request:      ToolRequestContext{},
			expectedCode: "missing_context",
		},
		{
			name: "missing section id",
			request: ToolRequestContext{
				Meta: map[string]any{
					"projectConfigId": "project-alpha",
					"chatId":          "chat-1",
				},
			},
			expectedCode: "missing_section_id",
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			for _, toolName := range []string{
				"get_latest_project_state_summary",
				"get_latest_lsp_diagnostics",
			} {
				result, err := server.InvokeTool(context.Background(), toolName, map[string]any{
					"projectConfigId": "project-alpha",
				}, testCase.request)
				if err != nil {
					t.Fatalf("invoke %s: %v", toolName, err)
				}
				if !result.IsError {
					t.Fatalf("expected %s %s failure, got %#v", toolName, testCase.expectedCode, result.StructuredContent)
				}
				payload := mustStructuredMap(t, result.StructuredContent)
				if payload["code"] != scopeViolationErrorCode {
					t.Fatalf("expected scope_violation code for %s, got %#v", toolName, payload["code"])
				}
				if payload["reason"] != testCase.expectedCode {
					t.Fatalf("expected %s reason for %s, got %#v", testCase.expectedCode, toolName, payload["reason"])
				}
			}
		})
	}
}

func TestServerSetCodeSectionDiagnosticsMuteRespectsScopedWriteTargets(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	diagnostics := openScopedTestLSPDiagnosticsRegistry()
	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:  t.TempDir(),
		ProjectState:   projectRuntime,
		LSPDiagnostics: diagnostics,
	})
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_code_section_diagnostics_mute",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-section",
			"mute":            true,
		},
	})
	if err != nil {
		t.Fatalf("call set_code_section_diagnostics_mute allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected allowed mute success, got %#v", allowedResult.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after mute: %v", err)
	}
	ignoreState, err := project.CodeSectionDiagnosticsIgnoreStateForSection("allowed-section")
	if err != nil {
		t.Fatalf("ignore state for allowed-section: %v", err)
	}
	if !ignoreState.Muted {
		t.Fatalf("expected allowed-section to be muted, got %#v", ignoreState)
	}

	filteredDiagnostics := diagnostics.Snapshot("project-alpha")
	if _, ok := filteredDiagnostics.CodeSections["allowed-section"]; ok {
		t.Fatalf("expected allowed-section diagnostics to be filtered after mute, got %#v", filteredDiagnostics.CodeSections)
	}
	if _, ok := filteredDiagnostics.CodeSections["blocked-section"]; !ok {
		t.Fatalf("expected blocked-section diagnostics to remain, got %#v", filteredDiagnostics.CodeSections)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_code_section_diagnostics_mute",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "blocked-section",
			"mute":            true,
		},
	})
	if err != nil {
		t.Fatalf("call set_code_section_diagnostics_mute blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked mute call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if blockedPayload["code"] != scopeViolationErrorCode {
		t.Fatalf("expected scope_violation code, got %#v", blockedPayload["code"])
	}
	if blockedPayload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", blockedPayload["reason"])
	}
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "blocked-section" {
		t.Fatalf("unexpected blockedSectionIds %#v", ids)
	}
	if ids := mustStringList(t, blockedPayload["targetSectionIds"]); len(ids) != 1 || ids[0] != "blocked-section" {
		t.Fatalf("unexpected targetSectionIds %#v", ids)
	}
}

func TestServerSetCodeSectionDiagnosticCodeSuppressionRespectsScopedWriteTargets(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	diagnostics := openScopedTestLSPDiagnosticsRegistry()
	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:  t.TempDir(),
		ProjectState:   projectRuntime,
		LSPDiagnostics: diagnostics,
	})
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_code_section_diagnostic_code_suppression",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-section",
			"code":            "reportFoo",
			"suppress":        true,
		},
	})
	if err != nil {
		t.Fatalf("call set_code_section_diagnostic_code_suppression allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected allowed suppression success, got %#v", allowedResult.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after suppression: %v", err)
	}
	ignoreState, err := project.CodeSectionDiagnosticsIgnoreStateForSection("allowed-section")
	if err != nil {
		t.Fatalf("ignore state for allowed-section after suppression: %v", err)
	}
	if len(ignoreState.SuppressedCodes) != 1 || ignoreState.SuppressedCodes[0] != "reportFoo" {
		t.Fatalf("expected reportFoo suppression, got %#v", ignoreState.SuppressedCodes)
	}

	filteredDiagnostics := diagnostics.Snapshot("project-alpha")
	if _, ok := filteredDiagnostics.CodeSections["allowed-section"]; ok {
		t.Fatalf("expected allowed-section diagnostics to be filtered after suppression, got %#v", filteredDiagnostics.CodeSections)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_code_section_diagnostic_code_suppression",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "blocked-section",
			"code":            "reportFoo",
			"suppress":        true,
		},
	})
	if err != nil {
		t.Fatalf("call set_code_section_diagnostic_code_suppression blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked suppression call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if blockedPayload["code"] != scopeViolationErrorCode {
		t.Fatalf("expected scope_violation code, got %#v", blockedPayload["code"])
	}
	if blockedPayload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", blockedPayload["reason"])
	}
}

func TestServerSetParamEnteredValueRespectsScopedWriteTargets(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_param_entered_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-params-section",
			"paramInfoId":     "allowed-param",
			"value":           "updated",
		},
	})
	if err != nil {
		t.Fatalf("call set_param_entered_value allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected allowed set_param_entered_value success, got %#v", allowedResult.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_param_entered_value: %v", err)
	}
	payload, _, _, _, err := project.ResolveSectionCodeObject("allowed-params-section", "allowed-param")
	if err != nil {
		t.Fatalf("resolve allowed-param after update: %v", err)
	}
	if got := payloadRawStringField(payload, "value"); got != "updated" {
		t.Fatalf("expected updated param value, got %q", got)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_param_entered_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "blocked-params-section",
			"paramInfoId":     "blocked-param",
			"value":           "blocked",
		},
	})
	if err != nil {
		t.Fatalf("call set_param_entered_value blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked set_param_entered_value call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if blockedPayload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", blockedPayload["reason"])
	}
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "blocked-params-section" {
		t.Fatalf("unexpected blockedSectionIds %#v", ids)
	}
}

func TestServerSetParamNameAndValueRespectsScopedWriteTargets(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_param_name_and_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-params-section",
			"codeObjId":       "allowed-param",
			"name":            "user-id@v2",
			"value":           "updated",
		},
	})
	if err != nil {
		t.Fatalf("call set_param_name_and_value allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected allowed set_param_name_and_value success, got %#v", allowedResult.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_param_name_and_value: %v", err)
	}
	if got := project.CodeObjs["allowed-param"].Name; got != "user-id@v2" {
		t.Fatalf("expected code object name user-id@v2, got %q", got)
	}
	payload, _, _, _, err := project.ResolveSectionCodeObject("allowed-params-section", "allowed-param")
	if err != nil {
		t.Fatalf("resolve allowed-param after combined update: %v", err)
	}
	if got := payloadRawStringField(payload, "value"); got != "updated" {
		t.Fatalf("expected updated param value, got %q", got)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_param_name_and_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "blocked-params-section",
			"codeObjId":       "blocked-param",
			"name":            "blocked_name",
			"value":           "blocked",
		},
	})
	if err != nil {
		t.Fatalf("call set_param_name_and_value blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked set_param_name_and_value call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if blockedPayload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", blockedPayload["reason"])
	}
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "blocked-params-section" {
		t.Fatalf("unexpected blockedSectionIds %#v", ids)
	}
}

func TestServerSetParamNameAndValueReturnsInvalidArgumentsForInvalidName(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_param_name_and_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-params-section",
			"codeObjId":       "allowed-param",
			"name":            "bad\nname",
			"value":           "updated",
		},
	})
	if err != nil {
		t.Fatalf("call set_param_name_and_value invalid name: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected invalid set_param_name_and_value call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
	}
	if payload["message"] != "Param name cannot include control characters." {
		t.Fatalf("expected control-character validation message, got %#v", payload["message"])
	}
}

func TestServerSetCallableRespectsScopedWriteTargets(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_callable",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-callable-section",
			"callableName":    "sorted",
			"refetchParams":   false,
		},
	})
	if err != nil {
		t.Fatalf("call set_callable allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected allowed set_callable success, got %#v", allowedResult.StructuredContent)
	}

	allowedPayload := mustStructuredMap(t, allowedResult.StructuredContent)
	if allowedPayload["callableId"] != "allowed-callable-2" {
		t.Fatalf("expected callable id allowed-callable-2, got %#v", allowedPayload["callableId"])
	}
	if allowedPayload["lspStatus"] != string(projectstate.SignatureHelpStatusSkipped) {
		t.Fatalf("expected skipped lsp status, got %#v", allowedPayload["lspStatus"])
	}
	childCodeObjs := mustStructuredList(t, allowedPayload["childCodeObjs"])
	if len(childCodeObjs) != 1 {
		t.Fatalf("expected one returned callable child, got %#v", childCodeObjs)
	}
	childCodeObj := mustStructuredMap(t, childCodeObjs[0])
	if childCodeObj["codeObjId"] != "allowed-param-existing" {
		t.Fatalf("expected allowed-param-existing child id, got %#v", childCodeObj["codeObjId"])
	}
	if childCodeObj["name"] != "iterable" {
		t.Fatalf("expected iterable child name, got %#v", childCodeObj["name"])
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_callable: %v", err)
	}
	_, _, impl, err := project.ResolveSection("allowed-callable-section")
	if err != nil {
		t.Fatalf("resolve allowed-callable-section after set_callable: %v", err)
	}
	sectionPayload := mustDecodedProjectPayload(t, impl.Payload)
	if got := sectionPayload["callable"]; got != "allowed-callable-2" {
		t.Fatalf("expected persisted callable allowed-callable-2, got %#v", got)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_callable",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "blocked-callable-section",
			"callableName":    "sorted",
			"refetchParams":   false,
		},
	})
	if err != nil {
		t.Fatalf("call set_callable blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked set_callable call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if blockedPayload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", blockedPayload["reason"])
	}
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "blocked-callable-section" {
		t.Fatalf("unexpected blockedSectionIds %#v", ids)
	}
}

func TestServerSetCallableUsesResolverWhenRefetchRequested(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:  t.TempDir(),
		ProjectState:   projectRuntime,
		LSPDiagnostics: openScopedTestLSPDiagnosticsRegistry(),
		CallableSignatures: stubCallableSignatureResolver{ok: true, result: projectstate.CallableSignatureResult{
			Status: projectstate.SignatureHelpStatusMatched,
			Params: []projectstate.CallableParamProposal{
				{Name: "iterable", PassingStyle: "DEFAULT"},
				{Name: "key", DefaultValue: "None", PassingStyle: "DEFAULT"},
			},
		}},
	})
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_callable",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-callable-section",
			"callableName":    "sorted",
			"refetchParams":   true,
		},
	})
	if err != nil {
		t.Fatalf("call set_callable resolver-backed: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected resolver-backed set_callable success, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["callableId"] != "allowed-callable-2" {
		t.Fatalf("expected callable id allowed-callable-2, got %#v", payload["callableId"])
	}
	if payload["lspStatus"] != string(projectstate.SignatureHelpStatusMatched) {
		t.Fatalf("expected matched lsp status, got %#v", payload["lspStatus"])
	}
	childCodeObjs := mustStructuredList(t, payload["childCodeObjs"])
	if len(childCodeObjs) != 2 {
		t.Fatalf("expected two returned callable children, got %#v", childCodeObjs)
	}
	firstChild := mustStructuredMap(t, childCodeObjs[0])
	if firstChild["codeObjId"] != "allowed-param-existing" || firstChild["name"] != "iterable" {
		t.Fatalf("unexpected first child payload %#v", firstChild)
	}
	secondChild := mustStructuredMap(t, childCodeObjs[1])
	if secondChild["name"] != "key" {
		t.Fatalf("expected synthesized key child, got %#v", secondChild)
	}
	if secondChild["codeObjId"] == "" || secondChild["codeObjId"] == "allowed-param-existing" {
		t.Fatalf("expected synthesized child id, got %#v", secondChild["codeObjId"])
	}
}

func TestServerAddKwargRespectsScopedWriteTargets(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "add_kwarg",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-callable-section",
		},
	})
	if err != nil {
		t.Fatalf("call add_kwarg allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected allowed add_kwarg success, got %#v", allowedResult.StructuredContent)
	}

	allowedPayload := mustStructuredMap(t, allowedResult.StructuredContent)
	codeObjID, ok := allowedPayload["codeObjId"].(string)
	if !ok || codeObjID == "" {
		t.Fatalf("expected created codeObjId string, got %#v", allowedPayload["codeObjId"])
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after add_kwarg: %v", err)
	}
	callablePayload, _, _, _, err := project.ResolveSectionCodeObject("allowed-callable-section", "allowed-callable-1")
	if err != nil {
		t.Fatalf("resolve active callable after add_kwarg: %v", err)
	}
	children := mustStringList(t, callablePayload["children"])
	if len(children) != 1 || children[0] != codeObjID {
		t.Fatalf("expected created callable child [%q], got %#v", codeObjID, children)
	}
	paramPayload, codeObj, _, paramImpl, err := project.ResolveSectionCodeObject("allowed-callable-section", codeObjID)
	if err != nil {
		t.Fatalf("resolve created callable param after add_kwarg: %v", err)
	}
	if codeObj.Name != "" {
		t.Fatalf("expected placeholder callable param name to start empty, got %q", codeObj.Name)
	}
	if paramImpl.Type != "CodeParam" {
		t.Fatalf("expected created callable param type CodeParam, got %q", paramImpl.Type)
	}
	if got := payloadRawStringField(paramPayload, "value"); got != "" {
		t.Fatalf("expected created callable param value to start empty, got %q", got)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "add_kwarg",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "blocked-callable-section",
		},
	})
	if err != nil {
		t.Fatalf("call add_kwarg blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked add_kwarg call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if blockedPayload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", blockedPayload["reason"])
	}
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "blocked-callable-section" {
		t.Fatalf("unexpected blockedSectionIds %#v", ids)
	}
}

func TestServerDeleteKwargRespectsScopedWriteTargets(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, addResult, err := projectRuntime.AddKwarg(context.Background(), "project-alpha", "allowed-callable-section")
	if err != nil {
		t.Fatalf("prepare callable param for delete_kwarg: %v", err)
	}

	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "delete_kwarg",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-callable-section",
		},
	})
	if err != nil {
		t.Fatalf("call delete_kwarg allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected allowed delete_kwarg success, got %#v", allowedResult.StructuredContent)
	}
	allowedPayload := mustStructuredMap(t, allowedResult.StructuredContent)
	if got := allowedPayload["codeObjId"]; got != addResult.CodeObjID {
		t.Fatalf("expected deleted codeObjId %q, got %#v", addResult.CodeObjID, got)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after delete_kwarg: %v", err)
	}
	callablePayload, _, _, _, err := project.ResolveSectionCodeObject("allowed-callable-section", "allowed-callable-1")
	if err != nil {
		t.Fatalf("resolve allowed-callable-1 after delete_kwarg: %v", err)
	}
	if children := mustStringList(t, callablePayload["children"]); len(children) != 0 {
		t.Fatalf("expected allowed-callable-1 children to be empty, got %#v", children)
	}
	if _, ok := project.CodeObjs[addResult.CodeObjID]; ok {
		t.Fatalf("expected deleted callable param %q to be pruned, got %#v", addResult.CodeObjID, project.CodeObjs[addResult.CodeObjID])
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "delete_kwarg",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "blocked-callable-section",
		},
	})
	if err != nil {
		t.Fatalf("call delete_kwarg blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked delete_kwarg call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if blockedPayload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", blockedPayload["reason"])
	}
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "blocked-callable-section" {
		t.Fatalf("unexpected blockedSectionIds %#v", ids)
	}
}

func TestServerChangeParamImplRespectsScopedWriteTargets(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "change_param_impl",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-params-section",
			"paramInfoId":     "allowed-param",
			"selectedId":      "PasswordParam",
		},
	})
	if err != nil {
		t.Fatalf("call change_param_impl allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected allowed change_param_impl success, got %#v", allowedResult.StructuredContent)
	}
	allowedPayload := mustStructuredMap(t, allowedResult.StructuredContent)
	if allowedPayload["status"] != "ok" {
		t.Fatalf("expected change_param_impl status ok, got %#v", allowedPayload["status"])
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after change_param_impl: %v", err)
	}
	paramPayload, _, _, paramImpl, err := project.ResolveSectionCodeObject("allowed-params-section", "allowed-param")
	if err != nil {
		t.Fatalf("resolve allowed param after change_param_impl: %v", err)
	}
	if paramImpl.Type != "PasswordParam" {
		t.Fatalf("expected PasswordParam impl after change_param_impl, got %q", paramImpl.Type)
	}
	if got := payloadRawStringField(paramPayload, "value"); got != "" {
		t.Fatalf("expected password param value to stay blank, got %q", got)
	}
	if !payloadBoolField(paramPayload, "hasSecret") {
		t.Fatalf("expected password param hasSecret true, got %#v", paramPayload)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "change_param_impl",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "blocked-params-section",
			"paramInfoId":     "blocked-param",
			"selectedId":      "PasswordParam",
		},
	})
	if err != nil {
		t.Fatalf("call change_param_impl blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked change_param_impl call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if blockedPayload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", blockedPayload["reason"])
	}
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "blocked-params-section" {
		t.Fatalf("unexpected blockedSectionIds %#v", ids)
	}
}

func TestServerUpdateParamImplConfigRespectsScopedWriteTargets(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	if _, err := projectRuntime.ChangeParamImpl(context.Background(), "project-alpha", "allowed-params-section", "allowed-param", "SliderParam"); err != nil {
		t.Fatalf("prepare slider param impl: %v", err)
	}
	if _, err := projectRuntime.SetSectionCodeObjectValue(context.Background(), "project-alpha", "allowed-params-section", "allowed-param", "75"); err != nil {
		t.Fatalf("prepare slider param value: %v", err)
	}

	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "update_param_impl_config",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-params-section",
			"paramInfoId":     "allowed-param",
			"newConfig": map[string]any{
				"max": 10,
			},
		},
	})
	if err != nil {
		t.Fatalf("call update_param_impl_config allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected allowed update_param_impl_config success, got %#v", allowedResult.StructuredContent)
	}
	allowedPayload := mustStructuredMap(t, allowedResult.StructuredContent)
	if allowedPayload["status"] != "ok" {
		t.Fatalf("expected update_param_impl_config status ok, got %#v", allowedPayload["status"])
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after update_param_impl_config: %v", err)
	}
	paramPayload, _, _, paramImpl, err := project.ResolveSectionCodeObject("allowed-params-section", "allowed-param")
	if err != nil {
		t.Fatalf("resolve allowed param after update_param_impl_config: %v", err)
	}
	if paramImpl.Type != "SliderParam" {
		t.Fatalf("expected SliderParam impl after update_param_impl_config, got %q", paramImpl.Type)
	}
	if got := payloadRawStringField(paramPayload, "value"); got != "10" {
		t.Fatalf("expected slider value to clamp to 10, got %q", got)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "update_param_impl_config",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "blocked-params-section",
			"paramInfoId":     "blocked-param",
			"newConfig": map[string]any{
				"description": "Blocked",
			},
		},
	})
	if err != nil {
		t.Fatalf("call update_param_impl_config blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked update_param_impl_config call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if blockedPayload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", blockedPayload["reason"])
	}
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "blocked-params-section" {
		t.Fatalf("unexpected blockedSectionIds %#v", ids)
	}
}

func TestServerDeleteSelectedParamsRespectsScopedWriteTargets(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, addResult, err := projectRuntime.AddKwarg(context.Background(), "project-alpha", "allowed-callable-section")
	if err != nil {
		t.Fatalf("prepare callable param for delete_selected_params: %v", err)
	}

	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "delete_selected_params",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-callable-section",
			"paramInfoIds":    []any{addResult.CodeObjID},
		},
	})
	if err != nil {
		t.Fatalf("call delete_selected_params allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected allowed delete_selected_params success, got %#v", allowedResult.StructuredContent)
	}
	allowedPayload := mustStructuredMap(t, allowedResult.StructuredContent)
	if ids := mustStringList(t, allowedPayload["paramInfoIds"]); len(ids) != 1 || ids[0] != addResult.CodeObjID {
		t.Fatalf("expected deleted paramInfoIds [%s], got %#v", addResult.CodeObjID, ids)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after delete_selected_params: %v", err)
	}
	callablePayload, _, _, _, err := project.ResolveSectionCodeObject("allowed-callable-section", "allowed-callable-1")
	if err != nil {
		t.Fatalf("resolve allowed-callable-1 after delete_selected_params: %v", err)
	}
	if children := mustStringList(t, callablePayload["children"]); len(children) != 0 {
		t.Fatalf("expected allowed-callable-1 children to be empty, got %#v", children)
	}
	if _, ok := project.CodeObjs[addResult.CodeObjID]; ok {
		t.Fatalf("expected deleted callable param %q to be pruned, got %#v", addResult.CodeObjID, project.CodeObjs[addResult.CodeObjID])
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "delete_selected_params",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "blocked-params-section",
			"paramInfoIds":    []any{"blocked-param"},
		},
	})
	if err != nil {
		t.Fatalf("call delete_selected_params blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked delete_selected_params call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if blockedPayload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", blockedPayload["reason"])
	}
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "blocked-params-section" {
		t.Fatalf("unexpected blockedSectionIds %#v", ids)
	}
}

func TestServerAddKwargTranslatesTemporaryIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha":            "11",
		"chat-1":                   "12",
		"chat-section":             "13",
		"allowed-callable-section": "24",
		"blocked-callable-section": "25",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "add_kwarg",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"chatId":          "12",
			"sectionId":       "13",
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "24",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id add_kwarg allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected temp-id add_kwarg success, got %#v", allowedResult.StructuredContent)
	}

	allowedPayload := mustStructuredMap(t, allowedResult.StructuredContent)
	temporaryCodeObjID, ok := allowedPayload["codeObjId"].(string)
	if !ok || temporaryCodeObjID == "" {
		t.Fatalf("expected translated codeObjId string, got %#v", allowedPayload["codeObjId"])
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id add_kwarg: %v", err)
	}
	callablePayload, _, _, _, err := project.ResolveSectionCodeObject("allowed-callable-section", "allowed-callable-1")
	if err != nil {
		t.Fatalf("resolve active callable after temp-id add_kwarg: %v", err)
	}
	children := mustStringList(t, callablePayload["children"])
	if len(children) != 1 {
		t.Fatalf("expected one canonical callable child after temp-id add_kwarg, got %#v", children)
	}
	canonicalCodeObjID := children[0]
	if temporaryCodeObjID == canonicalCodeObjID {
		t.Fatalf("expected translated codeObjId distinct from canonical id %q", canonicalCodeObjID)
	}
	temporaryMap := readTemporaryIDMapForTest(t, temporaryIDMapPath)
	if got := temporaryMap[canonicalCodeObjID]; got != temporaryCodeObjID {
		t.Fatalf("expected temporary map %q -> %q, got %q", canonicalCodeObjID, temporaryCodeObjID, got)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "add_kwarg",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"chatId":          "12",
			"sectionId":       "13",
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "25",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id add_kwarg blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked temp-id add_kwarg call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "25" {
		t.Fatalf("expected translated blockedSectionIds [25], got %#v", ids)
	}
}

func TestServerDeleteKwargTranslatesTemporaryIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, addResult, err := projectRuntime.AddKwarg(context.Background(), "project-alpha", "allowed-callable-section")
	if err != nil {
		t.Fatalf("prepare callable param for temp-id delete_kwarg: %v", err)
	}

	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha":            "11",
		"chat-1":                   "12",
		"chat-section":             "13",
		"allowed-callable-section": "24",
		addResult.CodeObjID:        "28",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "delete_kwarg",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"chatId":          "12",
			"sectionId":       "13",
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "24",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id delete_kwarg allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected temp-id delete_kwarg success, got %#v", allowedResult.StructuredContent)
	}
	allowedPayload := mustStructuredMap(t, allowedResult.StructuredContent)
	if got := allowedPayload["codeObjId"]; got != "28" {
		t.Fatalf("expected translated deleted codeObjId 28, got %#v", got)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id delete_kwarg: %v", err)
	}
	callablePayload, _, _, _, err := project.ResolveSectionCodeObject("allowed-callable-section", "allowed-callable-1")
	if err != nil {
		t.Fatalf("resolve allowed-callable-1 after temp-id delete_kwarg: %v", err)
	}
	if children := mustStringList(t, callablePayload["children"]); len(children) != 0 {
		t.Fatalf("expected callable children to be empty after temp-id delete_kwarg, got %#v", children)
	}
	if _, ok := project.CodeObjs[addResult.CodeObjID]; ok {
		t.Fatalf("expected canonical deleted callable param %q to be pruned", addResult.CodeObjID)
	}
}

func TestServerChangeParamImplTranslatesTemporaryIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha":          "11",
		"chat-1":                 "12",
		"chat-section":           "13",
		"allowed-params-section": "26",
		"allowed-param":          "27",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "change_param_impl",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"chatId":          "12",
			"sectionId":       "13",
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "26",
			"paramInfoId":     "27",
			"selectedId":      "PasswordParam",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id change_param_impl allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected temp-id change_param_impl success, got %#v", allowedResult.StructuredContent)
	}
	allowedPayload := mustStructuredMap(t, allowedResult.StructuredContent)
	if allowedPayload["status"] != "ok" {
		t.Fatalf("expected temp-id change_param_impl status ok, got %#v", allowedPayload["status"])
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id change_param_impl: %v", err)
	}
	paramPayload, _, _, paramImpl, err := project.ResolveSectionCodeObject("allowed-params-section", "allowed-param")
	if err != nil {
		t.Fatalf("resolve allowed param after temp-id change_param_impl: %v", err)
	}
	if paramImpl.Type != "PasswordParam" {
		t.Fatalf("expected PasswordParam impl after temp-id change_param_impl, got %q", paramImpl.Type)
	}
	if !payloadBoolField(paramPayload, "hasSecret") {
		t.Fatalf("expected password param hasSecret true after temp-id change_param_impl, got %#v", paramPayload)
	}
}

func TestServerUpdateParamImplConfigTranslatesTemporaryIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	if _, err := projectRuntime.ChangeParamImpl(context.Background(), "project-alpha", "allowed-params-section", "allowed-param", "SliderParam"); err != nil {
		t.Fatalf("prepare slider param impl: %v", err)
	}
	if _, err := projectRuntime.SetSectionCodeObjectValue(context.Background(), "project-alpha", "allowed-params-section", "allowed-param", "75"); err != nil {
		t.Fatalf("prepare slider param value: %v", err)
	}

	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha":          "11",
		"chat-1":                 "12",
		"chat-section":           "13",
		"allowed-params-section": "26",
		"allowed-param":          "27",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "update_param_impl_config",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"chatId":          "12",
			"sectionId":       "13",
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "26",
			"paramInfoId":     "27",
			"newConfig": map[string]any{
				"max": 10,
			},
		},
	})
	if err != nil {
		t.Fatalf("call temp-id update_param_impl_config allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected temp-id update_param_impl_config success, got %#v", allowedResult.StructuredContent)
	}
	allowedPayload := mustStructuredMap(t, allowedResult.StructuredContent)
	if allowedPayload["status"] != "ok" {
		t.Fatalf("expected temp-id update_param_impl_config status ok, got %#v", allowedPayload["status"])
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id update_param_impl_config: %v", err)
	}
	paramPayload, _, _, _, err := project.ResolveSectionCodeObject("allowed-params-section", "allowed-param")
	if err != nil {
		t.Fatalf("resolve allowed param after temp-id update_param_impl_config: %v", err)
	}
	if got := payloadRawStringField(paramPayload, "value"); got != "10" {
		t.Fatalf("expected slider value to clamp to 10 after temp-id update, got %q", got)
	}
}

func TestServerDeleteSelectedParamsTranslatesTemporaryIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, addResult, err := projectRuntime.AddKwarg(context.Background(), "project-alpha", "allowed-callable-section")
	if err != nil {
		t.Fatalf("prepare callable param for temp-id delete_selected_params: %v", err)
	}

	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha":            "11",
		"chat-1":                   "12",
		"chat-section":             "13",
		"allowed-callable-section": "24",
		addResult.CodeObjID:        "28",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "delete_selected_params",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"chatId":          "12",
			"sectionId":       "13",
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "24",
			"paramInfoIds":    []any{"28"},
		},
	})
	if err != nil {
		t.Fatalf("call temp-id delete_selected_params allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected temp-id delete_selected_params success, got %#v", allowedResult.StructuredContent)
	}
	allowedPayload := mustStructuredMap(t, allowedResult.StructuredContent)
	if ids := mustStringList(t, allowedPayload["paramInfoIds"]); len(ids) != 1 || ids[0] != "28" {
		t.Fatalf("expected translated deleted paramInfoIds [28], got %#v", ids)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id delete_selected_params: %v", err)
	}
	callablePayload, _, _, _, err := project.ResolveSectionCodeObject("allowed-callable-section", "allowed-callable-1")
	if err != nil {
		t.Fatalf("resolve allowed-callable-1 after temp-id delete_selected_params: %v", err)
	}
	if children := mustStringList(t, callablePayload["children"]); len(children) != 0 {
		t.Fatalf("expected callable children to be empty after temp-id delete_selected_params, got %#v", children)
	}
	if _, ok := project.CodeObjs[addResult.CodeObjID]; ok {
		t.Fatalf("expected canonical deleted callable param %q to be pruned", addResult.CodeObjID)
	}
}

func TestServerSetSectionNameRespectsScopedWriteTargets(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_name",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-section",
			"name":            "Allowed Renamed",
		},
	})
	if err != nil {
		t.Fatalf("call set_section_name allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected allowed set_section_name success, got %#v", allowedResult.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_section_name: %v", err)
	}
	if got := project.Sections["allowed-section"].Name; got != "Allowed Renamed" {
		t.Fatalf("expected renamed section name, got %q", got)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_name",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "blocked-section",
			"name":            "Blocked Renamed",
		},
	})
	if err != nil {
		t.Fatalf("call set_section_name blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked set_section_name call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if blockedPayload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", blockedPayload["reason"])
	}
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "blocked-section" {
		t.Fatalf("unexpected blockedSectionIds %#v", ids)
	}
	missingEdgesCanonical := mustStructuredList(t, blockedPayload["missingEdgesCanonical"])
	if len(missingEdgesCanonical) != 1 {
		t.Fatalf("expected one canonical missing edge, got %#v", missingEdgesCanonical)
	}
	missingEdgeCanonical := mustStructuredMap(t, missingEdgesCanonical[0])
	if missingEdgeCanonical["sourceSectionId"] != "chat-section" ||
		missingEdgeCanonical["targetSectionId"] != "blocked-section" ||
		missingEdgeCanonical["kind"] != agenticEdgeKindChatSection {
		t.Fatalf("unexpected canonical missing edge %#v", missingEdgeCanonical)
	}
}

func TestServerSetSectionTagColorRespectsScopedWriteTargets(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_tag_color",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-section",
			"tagColor":        "#123456",
		},
	})
	if err != nil {
		t.Fatalf("call set_section_tag_color allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected allowed set_section_tag_color success, got %#v", allowedResult.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_section_tag_color: %v", err)
	}
	allowedPayload := mustDecodedProjectPayload(t, project.Sections["allowed-section"].SharedModifier)
	if got := allowedPayload["tagColor"]; got != "#123456" {
		t.Fatalf("expected allowed-section tagColor #123456, got %#v", got)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_tag_color",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "blocked-section",
			"tagColor":        "#654321",
		},
	})
	if err != nil {
		t.Fatalf("call set_section_tag_color blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked set_section_tag_color call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if blockedPayload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", blockedPayload["reason"])
	}
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "blocked-section" {
		t.Fatalf("unexpected blockedSectionIds %#v", ids)
	}
	if ids := mustStringList(t, blockedPayload["targetSectionIds"]); len(ids) != 1 || ids[0] != "blocked-section" {
		t.Fatalf("unexpected targetSectionIds %#v", ids)
	}
}

func TestServerSetSectionTagColorClearsNull(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	tagColor := "#123456"
	if _, err := projectRuntime.SetSectionTagColor(context.Background(), "project-alpha", "allowed-section", &tagColor); err != nil {
		t.Fatalf("seed tag color: %v", err)
	}

	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_tag_color",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-section",
			"tagColor":        nil,
		},
	})
	if err != nil {
		t.Fatalf("call set_section_tag_color clear: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected tag-color clear success, got %#v", result.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after clearing tag color: %v", err)
	}
	allowedPayload := mustDecodedProjectPayload(t, project.Sections["allowed-section"].SharedModifier)
	got, ok := allowedPayload["tagColor"]
	if !ok || got != nil {
		t.Fatalf("expected allowed-section tagColor to clear to null, got %#v", allowedPayload["tagColor"])
	}
}

func TestServerSetSectionTagColorFailsClosedForUnknownSectionTarget(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_tag_color",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "missing-section",
			"tagColor":        "#123456",
		},
	})
	if err != nil {
		t.Fatalf("call missing-target set_section_tag_color: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected missing-target set_section_tag_color call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != scopeViolationErrorCode {
		t.Fatalf("expected scope_violation code, got %#v", payload["code"])
	}
	if payload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", payload["reason"])
	}
	if ids := mustStringList(t, payload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "missing-section" {
		t.Fatalf("expected blockedSectionIds [missing-section], got %#v", ids)
	}
	if ids := mustStringList(t, payload["targetSectionIds"]); len(ids) != 1 || ids[0] != "missing-section" {
		t.Fatalf("expected targetSectionIds [missing-section], got %#v", ids)
	}
}

func TestServerSetSectionStyleColorRespectsScopedWriteTargets(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_style_color",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-section",
			"styleColor":      "#654321",
		},
	})
	if err != nil {
		t.Fatalf("call set_section_style_color allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected allowed set_section_style_color success, got %#v", allowedResult.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_section_style_color: %v", err)
	}
	allowedPayload := mustDecodedProjectPayload(t, project.Sections["allowed-section"].SharedModifier)
	if got := allowedPayload["styleColor"]; got != "#654321" {
		t.Fatalf("expected allowed-section styleColor #654321, got %#v", got)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_style_color",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "blocked-section",
			"styleColor":      "#123456",
		},
	})
	if err != nil {
		t.Fatalf("call set_section_style_color blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked set_section_style_color call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if blockedPayload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", blockedPayload["reason"])
	}
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "blocked-section" {
		t.Fatalf("unexpected blockedSectionIds %#v", ids)
	}
	if ids := mustStringList(t, blockedPayload["targetSectionIds"]); len(ids) != 1 || ids[0] != "blocked-section" {
		t.Fatalf("unexpected targetSectionIds %#v", ids)
	}
}

func TestServerSetSectionStyleColorClearsNull(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	styleColor := "#654321"
	if _, err := projectRuntime.SetSectionStyleColor(context.Background(), "project-alpha", "allowed-section", &styleColor); err != nil {
		t.Fatalf("seed style color: %v", err)
	}

	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_style_color",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-section",
			"styleColor":      nil,
		},
	})
	if err != nil {
		t.Fatalf("call set_section_style_color clear: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected style-color clear success, got %#v", result.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after clearing style color: %v", err)
	}
	allowedPayload := mustDecodedProjectPayload(t, project.Sections["allowed-section"].SharedModifier)
	got, ok := allowedPayload["styleColor"]
	if !ok || got != nil {
		t.Fatalf("expected allowed-section styleColor to clear to null, got %#v", allowedPayload["styleColor"])
	}
}

func TestServerSetSectionStyleColorFailsClosedForUnknownSectionTarget(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_style_color",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "missing-section",
			"styleColor":      "#654321",
		},
	})
	if err != nil {
		t.Fatalf("call missing-target set_section_style_color: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected missing-target set_section_style_color call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != scopeViolationErrorCode {
		t.Fatalf("expected scope_violation code, got %#v", payload["code"])
	}
	if payload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", payload["reason"])
	}
	if ids := mustStringList(t, payload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "missing-section" {
		t.Fatalf("expected blockedSectionIds [missing-section], got %#v", ids)
	}
	if ids := mustStringList(t, payload["targetSectionIds"]); len(ids) != 1 || ids[0] != "missing-section" {
		t.Fatalf("expected targetSectionIds [missing-section], got %#v", ids)
	}
}

func TestServerSetSectionParamFilterRespectsScopedWriteTargets(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_param_filter",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-params-section",
			"paramFilter":     "   ",
		},
	})
	if err != nil {
		t.Fatalf("call set_section_param_filter allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected allowed set_section_param_filter success, got %#v", allowedResult.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_section_param_filter: %v", err)
	}
	allowedPayload := mustDecodedProjectPayload(t, project.Sections["allowed-params-section"].SharedModifier)
	if got := allowedPayload["paramFilter"]; got != "   " {
		t.Fatalf("expected allowed-params-section raw paramFilter whitespace, got %#v", got)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_param_filter",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "blocked-params-section",
			"paramFilter":     "blocked",
		},
	})
	if err != nil {
		t.Fatalf("call set_section_param_filter blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked set_section_param_filter call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if blockedPayload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", blockedPayload["reason"])
	}
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "blocked-params-section" {
		t.Fatalf("unexpected blockedSectionIds %#v", ids)
	}
	if ids := mustStringList(t, blockedPayload["targetSectionIds"]); len(ids) != 1 || ids[0] != "blocked-params-section" {
		t.Fatalf("unexpected targetSectionIds %#v", ids)
	}
}

func TestServerSetSectionParamFilterRejectsUnsupportedSectionType(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_param_filter",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-section",
			"paramFilter":     "alpha",
		},
	})
	if err != nil {
		t.Fatalf("call invalid set_section_param_filter: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected invalid set_section_param_filter call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
	}
	if message, ok := payload["message"].(string); !ok || !strings.Contains(message, "section does not support param filter") {
		t.Fatalf("expected unsupported param filter message, got %#v", payload["message"])
	}
}

func TestServerSetMetaControlShowSectionTitleRespectsScopedWriteTargets(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	mustAddScopedTestMetaControlSections(t, projectRuntime)

	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_meta_control_show_section_title",
		Arguments: map[string]any{
			"projectConfigId":  "project-alpha",
			"sectionId":        "allowed-meta-section",
			"showSectionTitle": true,
		},
	})
	if err != nil {
		t.Fatalf("call set_meta_control_show_section_title allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected allowed set_meta_control_show_section_title success, got %#v", allowedResult.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_meta_control_show_section_title: %v", err)
	}
	allowedPayload := mustDecodedProjectPayload(t, project.Sections["allowed-meta-section"].SharedModifier)
	if got := allowedPayload["showSectionTitle"]; got != true {
		t.Fatalf("expected allowed-meta-section showSectionTitle=true, got %#v", got)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_meta_control_show_section_title",
		Arguments: map[string]any{
			"projectConfigId":  "project-alpha",
			"sectionId":        "blocked-meta-section",
			"showSectionTitle": true,
		},
	})
	if err != nil {
		t.Fatalf("call set_meta_control_show_section_title blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked set_meta_control_show_section_title call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if blockedPayload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", blockedPayload["reason"])
	}
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "blocked-meta-section" {
		t.Fatalf("unexpected blockedSectionIds %#v", ids)
	}
	if ids := mustStringList(t, blockedPayload["targetSectionIds"]); len(ids) != 1 || ids[0] != "blocked-meta-section" {
		t.Fatalf("unexpected targetSectionIds %#v", ids)
	}
}

func TestServerSetMetaControlShowSectionTitleRejectsNonMetaControlSection(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_meta_control_show_section_title",
		Arguments: map[string]any{
			"projectConfigId":  "project-alpha",
			"sectionId":        "allowed-params-section",
			"showSectionTitle": true,
		},
	})
	if err != nil {
		t.Fatalf("call invalid set_meta_control_show_section_title: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected invalid set_meta_control_show_section_title call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
	}
	if message, ok := payload["message"].(string); !ok || !strings.Contains(message, "section must resolve to a meta control section") {
		t.Fatalf("expected non-meta-control message, got %#v", payload["message"])
	}
}

func TestServerSetCodeRespectsScopedWriteTargets(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_code",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-section",
			"code":            "print('updated by set_code')\n",
		},
	})
	if err != nil {
		t.Fatalf("call set_code allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected allowed set_code success, got %#v", allowedResult.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_code: %v", err)
	}
	payload := mustDecodedProjectPayload(t, project.Sections["allowed-section"].SharedModifier)
	if got := payload["code"]; got != "print('updated by set_code')\n" {
		t.Fatalf("expected updated code payload, got %#v", got)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_code",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "blocked-section",
			"code":            "print('blocked')\n",
		},
	})
	if err != nil {
		t.Fatalf("call set_code blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked set_code call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if blockedPayload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", blockedPayload["reason"])
	}
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "blocked-section" {
		t.Fatalf("unexpected blockedSectionIds %#v", ids)
	}
}

func TestServerFormatCodeRespectsScopedWriteTargets(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	var capturedProjectID string
	var capturedSectionID string
	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:  t.TempDir(),
		ProjectState:   projectRuntime,
		LSPDiagnostics: openScopedTestLSPDiagnosticsRegistry(),
		CodeUpdates: testCodeUpdateService{
			formatCode: func(_ context.Context, projectID string, sectionID string) error {
				capturedProjectID = projectID
				capturedSectionID = sectionID
				return nil
			},
		},
	})
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "format_code",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-section",
		},
	})
	if err != nil {
		t.Fatalf("call format_code allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected allowed format_code success, got %#v", allowedResult.StructuredContent)
	}
	if capturedProjectID != "project-alpha" || capturedSectionID != "allowed-section" {
		t.Fatalf("unexpected allowed format_code call project=%q section=%q", capturedProjectID, capturedSectionID)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "format_code",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "blocked-section",
		},
	})
	if err != nil {
		t.Fatalf("call format_code blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked format_code call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if blockedPayload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", blockedPayload["reason"])
	}
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "blocked-section" {
		t.Fatalf("unexpected blockedSectionIds %#v", ids)
	}
	if capturedProjectID != "project-alpha" || capturedSectionID != "allowed-section" {
		t.Fatalf("expected blocked format_code not to reach provider, got project=%q section=%q", capturedProjectID, capturedSectionID)
	}
}

func TestServerSetTopLevelSectionLayoutRespectsScopedStructuralTargets(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	if _, _, err := projectRuntime.CreateViewMode(context.Background(), "project-alpha"); err != nil {
		t.Fatalf("seed view mode: %v", err)
	}
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	allowedLayout := map[string]any{
		"x":      345.5,
		"y":      210.25,
		"zIndex": 7,
		"w":      640.0,
		"h":      320.0,
	}
	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_top_level_section_layout",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"topLevelSections": map[string]any{
				"allowed-section": allowedLayout,
			},
		},
	})
	if err != nil {
		t.Fatalf("call set_top_level_section_layout allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected allowed set_top_level_section_layout success, got %#v", allowedResult.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_top_level_section_layout: %v", err)
	}
	layout := project.TopLevelSections["allowed-section"]
	if layout.X != 345.5 || layout.Y != 210.25 || layout.ZIndex != 7 {
		t.Fatalf("unexpected persisted top-level layout %#v", layout)
	}
	if layout.W == nil || *layout.W != 640.0 {
		t.Fatalf("expected persisted width 640, got %#v", layout.W)
	}
	if layout.H == nil || *layout.H != 320.0 {
		t.Fatalf("expected persisted height 320, got %#v", layout.H)
	}
	viewMode := project.ViewModes[project.ActiveViewModeID]
	activeLayout := viewMode.TopLevelSections["allowed-section"]
	if activeLayout.X != layout.X || activeLayout.Y != layout.Y || activeLayout.ZIndex != layout.ZIndex {
		t.Fatalf("expected active view-mode layout %#v, got %#v", layout, activeLayout)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_top_level_section_layout",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"topLevelSections": map[string]any{
				"blocked-section": map[string]any{"x": 1.0, "y": 2.0},
			},
		},
	})
	if err != nil {
		t.Fatalf("call set_top_level_section_layout blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked set_top_level_section_layout call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if blockedPayload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", blockedPayload["reason"])
	}
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "blocked-section" {
		t.Fatalf("unexpected blockedSectionIds %#v", ids)
	}
}

func TestServerAutoLayoutTopLevelSectionsRequiresStructuralScope(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	if _, _, err := projectRuntime.CreateViewMode(context.Background(), "project-alpha"); err != nil {
		t.Fatalf("seed view mode: %v", err)
	}
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "auto_layout_top_level_sections",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"margin":          10,
		},
	})
	if err != nil {
		t.Fatalf("call auto_layout_top_level_sections blocked: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected blocked auto_layout_top_level_sections call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["reason"] != "structural_denied" {
		t.Fatalf("expected structural_denied reason, got %#v", payload["reason"])
	}
}

func TestServerAutoLayoutTopLevelSectionsAllowsUnscopedStructuralCallsAndTranslatesTemporaryProjectID(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	if _, _, err := projectRuntime.CreateViewMode(context.Background(), "project-alpha"); err != nil {
		t.Fatalf("seed view mode: %v", err)
	}
	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before auto layout: %v", err)
	}
	beforeAllowed := project.TopLevelSections["allowed-section"]
	beforeBlocked := project.TopLevelSections["blocked-section"]

	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha": "11",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "auto_layout_top_level_sections",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"margin":          10,
		},
	})
	if err != nil {
		t.Fatalf("call temp-id auto_layout_top_level_sections: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id auto_layout_top_level_sections success, got %#v", result.StructuredContent)
	}

	project, err = projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after auto layout: %v", err)
	}
	afterAllowed := project.TopLevelSections["allowed-section"]
	afterBlocked := project.TopLevelSections["blocked-section"]
	if afterAllowed == beforeAllowed && afterBlocked == beforeBlocked {
		t.Fatalf(
			"expected auto layout to rewrite top-level layouts, allowed before=%#v after=%#v blocked before=%#v after=%#v",
			beforeAllowed,
			afterAllowed,
			beforeBlocked,
			afterBlocked,
		)
	}
}

func TestServerAutoLayoutTopLevelSectionsRejectsInvalidMargin(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	if _, _, err := projectRuntime.CreateViewMode(context.Background(), "project-alpha"); err != nil {
		t.Fatalf("seed view mode: %v", err)
	}
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "auto_layout_top_level_sections",
		Meta: sdkmcp.Meta{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"margin":          -1,
		},
	})
	if err != nil {
		t.Fatalf("call invalid-margin auto_layout_top_level_sections: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected invalid-margin auto_layout_top_level_sections call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
	}
	if message, ok := payload["message"].(string); !ok || !strings.Contains(message, "Auto layout margin must be non-negative.") {
		t.Fatalf("expected invalid margin message, got %#v", payload["message"])
	}
}

func TestServerSetShowParamDisplayNamesRequiresStructuralScope(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_show_param_display_names",
		Arguments: map[string]any{
			"projectConfigId":       "project-alpha",
			"showParamDisplayNames": true,
		},
	})
	if err != nil {
		t.Fatalf("call set_show_param_display_names blocked: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected blocked set_show_param_display_names call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["reason"] != "structural_denied" {
		t.Fatalf("expected structural_denied reason, got %#v", payload["reason"])
	}
}

func TestServerSetShowParamDisplayNamesAllowsUnscopedStructuralCallsAndTranslatesTemporaryProjectID(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before show-param toggle: %v", err)
	}
	if project.ShowParamDisplayNames {
		t.Fatal("expected ShowParamDisplayNames=false before mutation")
	}

	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha": "11",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_show_param_display_names",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId":       "11",
			"showParamDisplayNames": true,
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_show_param_display_names: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id set_show_param_display_names success, got %#v", result.StructuredContent)
	}

	project, err = projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after show-param toggle: %v", err)
	}
	if !project.ShowParamDisplayNames {
		t.Fatal("expected ShowParamDisplayNames=true after mutation")
	}
}

func TestServerSetAppDefinitionRequiresStructuralScope(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_app_definition",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"appSpec": map[string]any{
				"root":     map[string]any{"key": "root", "type": "Stack"},
				"elements": map[string]any{},
			},
		},
	})
	if err != nil {
		t.Fatalf("call set_app_definition blocked: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected blocked set_app_definition call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["reason"] != "structural_denied" {
		t.Fatalf("expected structural_denied reason, got %#v", payload["reason"])
	}
}

func TestServerGetAppDefinitionAllowsUnscopedStructuralCallsAndTranslatesTemporaryProjectID(t *testing.T) {
	t.Parallel()

	root, projectRuntime := openPersistedAppDefinitionTestProjectRuntime(t)
	setTestAppDefinition(t, projectRuntime, appdefinition.SetInput{
		AppSpec: map[string]any{
			"root":     map[string]any{"key": "root", "type": "Stack"},
			"elements": map[string]any{},
		},
	})

	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha": "11",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_app_definition",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id get_app_definition: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id get_app_definition success, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	appDefinition := mustStructuredMap(t, payload["appDefinition"])
	if appDefinition["appSpecPath"] != appspec.MustForPlugin("setta-json-render-app-gen").DefaultPath() {
		t.Fatalf("expected default app spec path %q, got %#v", appspec.MustForPlugin("setta-json-render-app-gen").DefaultPath(), appDefinition["appSpecPath"])
	}
	storedSpec, err := appspec.MustForPlugin("setta-json-render-app-gen").Read(root, appspec.MustForPlugin("setta-json-render-app-gen").DefaultPath())
	if err != nil {
		t.Fatalf("read stored app spec: %v", err)
	}
	if !reflect.DeepEqual(storedSpec, payload["appSpec"]) {
		t.Fatalf("expected stored app spec %#v, got %#v", storedSpec, payload["appSpec"])
	}
}

func TestServerValidateAppDefinitionAllowsUnscopedStructuralCallsAndTranslatesTemporaryProjectID(t *testing.T) {
	t.Parallel()

	_, projectRuntime := openPersistedAppDefinitionTestProjectRuntime(t)
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha": "11",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "validate_app_definition",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"appSpec": map[string]any{
				"root": map[string]any{
					"key":  "run-btn",
					"type": "ActionButton",
					"props": map[string]any{
						"label":  "Run",
						"action": "run",
					},
				},
				"elements": map[string]any{},
			},
			"theme": map[string]any{
				"vars": map[string]any{
					"accent":       "#fff",
					"--app-accent": "#fff",
				},
			},
			"assets": []any{
				map[string]any{"href": "https://example.com/app.css"},
			},
		},
	})
	if err != nil {
		t.Fatalf("call temp-id validate_app_definition: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id validate_app_definition success, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	errors, ok := payload["errors"].([]any)
	if !ok {
		t.Fatalf("expected errors array, got %#v", payload["errors"])
	}
	if len(errors) != 0 {
		t.Fatalf("expected no validation errors, got %#v", errors)
	}
	warnings, ok := payload["warnings"].([]any)
	if !ok {
		t.Fatalf("expected warnings array, got %#v", payload["warnings"])
	}
	if len(warnings) < 3 {
		t.Fatalf("expected multiple warnings, got %#v", warnings)
	}
	capabilities := mustStructuredMap(t, payload["capabilities"])
	if capabilities["catalogId"] != appspec.DefaultCatalogID {
		t.Fatalf("expected catalog id %q, got %#v", appspec.DefaultCatalogID, capabilities["catalogId"])
	}
	features := mustStructuredMap(t, capabilities["features"])
	if features["responsive"] != true || features["motion"] != true {
		t.Fatalf("expected responsive and motion feature flags, got %#v", features)
	}
}

func TestServerSetAppDefinitionAllowsUnscopedStructuralCallsAndTranslatesTemporaryProjectID(t *testing.T) {
	t.Parallel()

	root, projectRuntime := openPersistedAppDefinitionTestProjectRuntime(t)
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha": "11",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_app_definition",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"appSpec": map[string]any{
				"root":     map[string]any{"key": "root", "type": "Stack"},
				"elements": map[string]any{},
			},
			"appSpecPath":    appspec.MustForPlugin("setta-json-render-app-gen").JoinPath("custom.json"),
			"appSpecVersion": "v2",
			"catalogId":      appspec.DefaultCatalogID,
			"routes": []any{
				map[string]any{"path": "/", "name": "Home", "rootKey": "root"},
			},
			"theme": map[string]any{"mode": "dark"},
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_app_definition: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id set_app_definition success, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	appDefinition := mustStructuredMap(t, payload["appDefinition"])
	if appDefinition["appSpecPath"] != appspec.MustForPlugin("setta-json-render-app-gen").JoinPath("custom.json") {
		t.Fatalf("expected normalized app spec path, got %#v", appDefinition["appSpecPath"])
	}
	if appDefinition["appSpecVersion"] != "v2" {
		t.Fatalf("expected app spec version v2, got %#v", appDefinition["appSpecVersion"])
	}

	storedSpec, err := appspec.MustForPlugin("setta-json-render-app-gen").Read(root, appspec.MustForPlugin("setta-json-render-app-gen").JoinPath("custom.json"))
	if err != nil {
		t.Fatalf("read stored app spec: %v", err)
	}
	if !reflect.DeepEqual(storedSpec, payload["appSpec"]) {
		t.Fatalf("expected stored app spec %#v, got %#v", payload["appSpec"], storedSpec)
	}
	storedAppDefinition := mustDecodeStoredAppDefinition(
		t,
		appdefinition.MustStorageForPlugin("setta-json-render-app-gen").StoredDocumentAppDefinitionRaw(projectRuntime.Snapshot().Document),
	)
	if storedAppDefinition.AppSpecPath != appspec.MustForPlugin("setta-json-render-app-gen").JoinPath("custom.json") {
		t.Fatalf("expected runtime app definition after mutation, got %#v", storedAppDefinition)
	}
}

func TestServerUpdateAppDefinitionAllowsUnscopedStructuralCallsAndTranslatesTemporaryProjectID(t *testing.T) {
	t.Parallel()

	root, projectRuntime := openPersistedAppDefinitionTestProjectRuntime(t)
	setTestAppDefinition(t, projectRuntime, appdefinition.SetInput{
		AppSpec: map[string]any{
			"root": map[string]any{
				"key":  "root",
				"type": "Stack",
				"props": map[string]any{
					"gap":       float64(8),
					"direction": "column",
				},
			},
			"elements": map[string]any{},
		},
	})

	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha": "11",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "update_app_definition",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"patch": map[string]any{
				"root": map[string]any{
					"props": map[string]any{
						"gap": float64(12),
					},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("call temp-id update_app_definition: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id update_app_definition success, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	appSpec := mustStructuredMap(t, payload["appSpec"])
	rootSpec := mustStructuredMap(t, appSpec["root"])
	props := mustStructuredMap(t, rootSpec["props"])
	if props["gap"] != float64(12) {
		t.Fatalf("expected merged gap 12, got %#v", props["gap"])
	}
	if props["direction"] != "column" {
		t.Fatalf("expected preserved direction column, got %#v", props["direction"])
	}

	storedSpec, err := appspec.MustForPlugin("setta-json-render-app-gen").Read(root, appspec.MustForPlugin("setta-json-render-app-gen").DefaultPath())
	if err != nil {
		t.Fatalf("read stored app spec: %v", err)
	}
	if !reflect.DeepEqual(storedSpec, payload["appSpec"]) {
		t.Fatalf("expected stored app spec %#v, got %#v", payload["appSpec"], storedSpec)
	}
}

func TestServerUpdateAppDefinitionReturnsFileNotFoundWhenStoredSpecIsMissing(t *testing.T) {
	t.Parallel()

	_, projectRuntime := openPersistedAppDefinitionTestProjectRuntime(t)
	if _, err := projectRuntime.Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document = appdefinition.MustStorageForPlugin("setta-json-render-app-gen").WithStoredDocumentAppDefinition(document, mustMarshalStoredAppDefinition(t, appdefinition.AppDefinition{
			AppSpecPath:    appspec.MustForPlugin("setta-json-render-app-gen").DefaultPath(),
			AppSpecVersion: "v1",
			CatalogID:      appspec.DefaultCatalogID,
		}))
		return document, nil
	}); err != nil {
		t.Fatalf("seed missing app definition metadata: %v", err)
	}
	if _, err := projectRuntime.Save(context.Background()); err != nil {
		t.Fatalf("save missing app definition metadata: %v", err)
	}

	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "update_app_definition",
		Meta: sdkmcp.Meta{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"patch": map[string]any{
				"root": map[string]any{"type": "Stack"},
			},
		},
	})
	if err != nil {
		t.Fatalf("call missing-spec update_app_definition: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected missing-spec update_app_definition call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "file_not_found" {
		t.Fatalf("expected file_not_found code, got %#v", payload["code"])
	}
}

func TestServerCompareAndSetShowParamDisplayNamesRequiresStructuralScope(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "compare_and_set_show_param_display_names",
		Arguments: map[string]any{
			"projectConfigId":       "project-alpha",
			"showParamDisplayNames": true,
			"expectedOldValue":      false,
		},
	})
	if err != nil {
		t.Fatalf("call compare_and_set_show_param_display_names blocked: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected blocked compare_and_set_show_param_display_names call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["reason"] != "structural_denied" {
		t.Fatalf("expected structural_denied reason, got %#v", payload["reason"])
	}
}

func TestServerCompareAndSetShowParamDisplayNamesAllowsUnscopedStructuralCallsAndTranslatesTemporaryProjectID(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before CAS show-param toggle: %v", err)
	}
	if project.ShowParamDisplayNames {
		t.Fatal("expected ShowParamDisplayNames=false before mutation")
	}

	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha": "11",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "compare_and_set_show_param_display_names",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId":       "11",
			"showParamDisplayNames": true,
			"expectedOldValue":      false,
		},
	})
	if err != nil {
		t.Fatalf("call temp-id compare_and_set_show_param_display_names: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id compare_and_set_show_param_display_names success, got %#v", result.StructuredContent)
	}

	project, err = projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after CAS show-param toggle: %v", err)
	}
	if !project.ShowParamDisplayNames {
		t.Fatal("expected ShowParamDisplayNames=true after mutation")
	}
}

func TestServerSetProjectConfigCodegenTargetsRejectsPluginTargetsBeforeScopeCheck(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_project_config_codegen_targets",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"codegenTargets": []any{
				map[string]any{
					"language": "setta-fixture-backend-codegen:typescript",
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("call set_project_config_codegen_targets blocked: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected invalid set_project_config_codegen_targets call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "scope_violation" {
		t.Fatalf("expected scope_violation code, got %#v", payload["code"])
	}
	if payload["reason"] != "structural_denied" {
		t.Fatalf("expected structural_denied reason, got %#v", payload["reason"])
	}
}

func TestServerSetProjectConfigCodegenTargetsSupportsPluginTargetsWithTemporaryProjectID(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha": "11",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
		CodegenTargetValidator: projectstate.CodegenTargetValidatorFunc(func(context.Context, projectstate.ProjectCodegenTarget) error {
			return nil
		}),
		PythonCodegenSectionReconciler: projectstate.PythonCodegenSectionReconcilerFunc(func(context.Context, *projectstate.Project) error {
			return nil
		}),
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_project_config_codegen_targets",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"codegenTargets": []any{
				map[string]any{
					"language": "setta-fixture-backend-codegen:typescript",
					"options":  map[string]any{"className": "ScopedMCPState"},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_project_config_codegen_targets: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id set_project_config_codegen_targets success, got %#v", result.StructuredContent)
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["status"] != "ok" {
		t.Fatalf("expected ok status, got %#v", payload)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id set_project_config_codegen_targets: %v", err)
	}
	if len(project.CodegenTargets) != 1 || project.CodegenTargets[0].Language != "setta-fixture-backend-codegen:typescript" {
		t.Fatalf("expected persisted plugin codegen target, got %#v", project.CodegenTargets)
	}
}

func TestServerSetProjectConfigCodegenTargetsRejectsDuplicateLanguages(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot: t.TempDir(),
		ProjectState:  projectRuntime,
		CodegenTargetValidator: projectstate.CodegenTargetValidatorFunc(func(context.Context, projectstate.ProjectCodegenTarget) error {
			return nil
		}),
		PythonCodegenSectionReconciler: projectstate.PythonCodegenSectionReconcilerFunc(func(context.Context, *projectstate.Project) error {
			return nil
		}),
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_project_config_codegen_targets",
		Meta: sdkmcp.Meta{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"codegenTargets": []any{
				map[string]any{"language": "python"},
				map[string]any{"language": "python", "generateMetadata": true},
			},
		},
	})
	if err != nil {
		t.Fatalf("call invalid set_project_config_codegen_targets: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected invalid set_project_config_codegen_targets call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
	}
	if message, ok := payload["message"].(string); !ok || !strings.Contains(message, "project codegen target language must be unique") {
		t.Fatalf("expected duplicate codegen target message, got %#v", payload["message"])
	}
}

func TestServerSetGenCodePrefixRespectsScopedWriteTargets(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	enableScopedTestPythonCodegenTarget(t, projectRuntime)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_gen_code_prefix",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"genCodePrefix":   "import math\n",
		},
	})
	if err != nil {
		t.Fatalf("call set_gen_code_prefix blocked: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected blocked set_gen_code_prefix call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", payload["reason"])
	}
	if ids := mustStringList(t, payload["targetSectionIds"]); len(ids) != 1 || ids[0] != projectstate.GeneratedPythonCodeSectionID {
		t.Fatalf("expected generated python targetSectionIds, got %#v", ids)
	}
	if ids := mustStringList(t, payload["blockedSectionIds"]); len(ids) != 1 || ids[0] != projectstate.GeneratedPythonCodeSectionID {
		t.Fatalf("expected generated python blockedSectionIds, got %#v", ids)
	}
}

func TestServerSetGenCodePrefixAllowsUnscopedCallsAndTranslatesTemporaryProjectID(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	enableScopedTestPythonCodegenTarget(t, projectRuntime)
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha": "11",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_gen_code_prefix",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"genCodePrefix":   "import math\n",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_gen_code_prefix: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id set_gen_code_prefix success, got %#v", result.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_gen_code_prefix: %v", err)
	}
	config, ok, err := project.PythonCodegenTarget()
	if err != nil {
		t.Fatalf("decode python target after set_gen_code_prefix: %v", err)
	}
	if !ok {
		t.Fatal("expected python target after set_gen_code_prefix")
	}
	if config.GenCodePrefix != "import math\n" {
		t.Fatalf("expected persisted gen code prefix, got %q", config.GenCodePrefix)
	}
}

func TestServerSetGenCodePrefixRejectsProjectsWithoutPythonCodegen(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_gen_code_prefix",
		Meta: sdkmcp.Meta{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"genCodePrefix":   "import math\n",
		},
	})
	if err != nil {
		t.Fatalf("call invalid set_gen_code_prefix: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected invalid set_gen_code_prefix call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
	}
	if message, ok := payload["message"].(string); !ok || !strings.Contains(message, "project python codegen target was not found") {
		t.Fatalf("expected missing python target message, got %#v", payload["message"])
	}
}

func TestServerSetGenCodeSuffixRespectsScopedWriteTargets(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	enableScopedTestPythonCodegenTarget(t, projectRuntime)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_gen_code_suffix",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"genCodeSuffix":   "state = CustomState()\n",
		},
	})
	if err != nil {
		t.Fatalf("call set_gen_code_suffix blocked: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected blocked set_gen_code_suffix call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", payload["reason"])
	}
	if ids := mustStringList(t, payload["targetSectionIds"]); len(ids) != 1 || ids[0] != projectstate.GeneratedPythonCodeSectionID {
		t.Fatalf("expected generated python targetSectionIds, got %#v", ids)
	}
	if ids := mustStringList(t, payload["blockedSectionIds"]); len(ids) != 1 || ids[0] != projectstate.GeneratedPythonCodeSectionID {
		t.Fatalf("expected generated python blockedSectionIds, got %#v", ids)
	}
}

func TestServerSetGenCodeSuffixAllowsUnscopedCallsAndTranslatesTemporaryProjectID(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	enableScopedTestPythonCodegenTarget(t, projectRuntime)
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha": "11",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_gen_code_suffix",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"genCodeSuffix":   "state = CustomState()\n",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_gen_code_suffix: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id set_gen_code_suffix success, got %#v", result.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_gen_code_suffix: %v", err)
	}
	config, ok, err := project.PythonCodegenTarget()
	if err != nil {
		t.Fatalf("decode python target after set_gen_code_suffix: %v", err)
	}
	if !ok {
		t.Fatal("expected python target after set_gen_code_suffix")
	}
	if config.GenCodeSuffix != "state = CustomState()\n" {
		t.Fatalf("expected persisted gen code suffix, got %q", config.GenCodeSuffix)
	}
}

func TestServerSetGenCodeSuffixRejectsProjectsWithoutPythonCodegen(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_gen_code_suffix",
		Meta: sdkmcp.Meta{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"genCodeSuffix":   "state = CustomState()\n",
		},
	})
	if err != nil {
		t.Fatalf("call invalid set_gen_code_suffix: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected invalid set_gen_code_suffix call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
	}
	if message, ok := payload["message"].(string); !ok || !strings.Contains(message, "project python codegen target was not found") {
		t.Fatalf("expected missing python target message, got %#v", payload["message"])
	}
}

func TestServerTogglePositionLocksRequiresStructuralScope(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "toggle_position_locks",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionIds":      []string{"blocked-section"},
		},
	})
	if err != nil {
		t.Fatalf("call toggle_position_locks blocked: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected blocked toggle_position_locks call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["reason"] != "structural_denied" {
		t.Fatalf("expected structural_denied reason, got %#v", payload["reason"])
	}
	if ids := mustStringList(t, payload["targetSectionIds"]); len(ids) != 1 || ids[0] != "blocked-section" {
		t.Fatalf("expected targetSectionIds [blocked-section], got %#v", ids)
	}
	if ids := mustStringList(t, payload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "blocked-section" {
		t.Fatalf("expected blockedSectionIds [blocked-section], got %#v", ids)
	}
}

func TestServerTogglePositionLocksAllowsUnscopedStructuralCallsAndTranslatesTemporaryIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before toggle_position_locks: %v", err)
	}
	if len(project.Sections["allowed-section"].SharedModifier) != 0 &&
		payloadBoolField(mustDecodedProjectPayload(t, project.Sections["allowed-section"].SharedModifier), "positionAndSizeLocked") {
		t.Fatal("expected allowed-section to start unlocked")
	}
	if len(project.Sections["blocked-section"].SharedModifier) != 0 &&
		payloadBoolField(mustDecodedProjectPayload(t, project.Sections["blocked-section"].SharedModifier), "positionAndSizeLocked") {
		t.Fatal("expected blocked-section to start unlocked")
	}

	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha":   "11",
		"allowed-section": "14",
		"blocked-section": "16",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "toggle_position_locks",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionIds":      []string{"14", "16"},
		},
	})
	if err != nil {
		t.Fatalf("call temp-id toggle_position_locks: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id toggle_position_locks success, got %#v", result.StructuredContent)
	}

	project, err = projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after toggle_position_locks: %v", err)
	}
	if !payloadBoolField(mustDecodedProjectPayload(t, project.Sections["allowed-section"].SharedModifier), "positionAndSizeLocked") {
		t.Fatal("expected allowed-section to be locked after mutation")
	}
	if !payloadBoolField(mustDecodedProjectPayload(t, project.Sections["blocked-section"].SharedModifier), "positionAndSizeLocked") {
		t.Fatal("expected blocked-section to be locked after mutation")
	}
}

func TestServerTogglePositionLocksRejectsUnknownSection(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "toggle_position_locks",
		Meta: sdkmcp.Meta{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionIds":      []string{"missing-section"},
		},
	})
	if err != nil {
		t.Fatalf("call invalid toggle_position_locks: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected invalid toggle_position_locks call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
	}
	if message, ok := payload["message"].(string); !ok || !strings.Contains(message, "missing-section") {
		t.Fatalf("expected missing-section message, got %#v", payload["message"])
	}
}

func TestServerToggleMinimizedRequiresStructuralScope(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "toggle_minimized",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "blocked-section",
		},
	})
	if err != nil {
		t.Fatalf("call toggle_minimized blocked: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected blocked toggle_minimized call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["reason"] != "structural_denied" {
		t.Fatalf("expected structural_denied reason, got %#v", payload["reason"])
	}
	if ids := mustStringList(t, payload["targetSectionIds"]); len(ids) != 1 || ids[0] != "blocked-section" {
		t.Fatalf("expected targetSectionIds [blocked-section], got %#v", ids)
	}
	if ids := mustStringList(t, payload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "blocked-section" {
		t.Fatalf("expected blockedSectionIds [blocked-section], got %#v", ids)
	}
}

func TestServerToggleMinimizedAllowsUnscopedStructuralCallsAndTranslatesTemporaryIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before toggle_minimized: %v", err)
	}
	if len(project.Sections["allowed-section"].SharedModifier) != 0 &&
		payloadBoolField(mustDecodedProjectPayload(t, project.Sections["allowed-section"].SharedModifier), "isMinimized") {
		t.Fatal("expected allowed-section to start unminimized")
	}

	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha":   "11",
		"allowed-section": "14",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "toggle_minimized",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "14",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id toggle_minimized: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id toggle_minimized success, got %#v", result.StructuredContent)
	}

	project, err = projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after toggle_minimized: %v", err)
	}
	if !payloadBoolField(mustDecodedProjectPayload(t, project.Sections["allowed-section"].SharedModifier), "isMinimized") {
		t.Fatal("expected allowed-section to be minimized after mutation")
	}
}

func TestServerToggleMinimizedRejectsUnknownSection(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "toggle_minimized",
		Meta: sdkmcp.Meta{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "missing-section",
		},
	})
	if err != nil {
		t.Fatalf("call invalid toggle_minimized: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected invalid toggle_minimized call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
	}
	if message, ok := payload["message"].(string); !ok || !strings.Contains(message, "missing-section") {
		t.Fatalf("expected missing-section message, got %#v", payload["message"])
	}
}

func TestServerToggleGroupOrientationRequiresStructuralScope(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	mustAddScopedTestGroupSection(t, projectRuntime)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "toggle_group_orientation",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "group-section",
		},
	})
	if err != nil {
		t.Fatalf("call toggle_group_orientation blocked: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected blocked toggle_group_orientation call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["reason"] != "structural_denied" {
		t.Fatalf("expected structural_denied reason, got %#v", payload["reason"])
	}
	if ids := mustStringList(t, payload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "group-section" {
		t.Fatalf("expected blockedSectionIds [group-section], got %#v", ids)
	}
}

func TestServerToggleGroupOrientationAllowsUnscopedStructuralCallsAndTranslatesTemporaryIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	mustAddScopedTestGroupSection(t, projectRuntime)
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha": "11",
		"group-section": "41",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "toggle_group_orientation",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "41",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id toggle_group_orientation: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id toggle_group_orientation success, got %#v", result.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after toggle_group_orientation: %v", err)
	}
	if !payloadBoolField(mustDecodedProjectPayload(t, project.Sections["group-section"].SharedModifier), "isHorizontalOrientation") {
		t.Fatal("expected group-section isHorizontalOrientation=true after mutation")
	}
}

func TestServerSetCodeRejectsReadOnlyCodeSections(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	mustSetTestCodeSectionReadOnly(t, projectRuntime, "project-alpha", "allowed-section")
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_code",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-section",
			"code":            "print('blocked by readonly')\n",
		},
	})
	if err != nil {
		t.Fatalf("call set_code readonly: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected readonly set_code call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
	}
	if payload["message"] != `code section is read-only: "allowed-section"` {
		t.Fatalf("unexpected readonly set_code message %#v", payload["message"])
	}
}

func TestServerFormatCodeRejectsReadOnlyCodeSections(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:  t.TempDir(),
		ProjectState:   projectRuntime,
		LSPDiagnostics: openScopedTestLSPDiagnosticsRegistry(),
		CodeUpdates: testCodeUpdateService{
			formatCode: func(context.Context, string, string) error {
				return fmt.Errorf("%w: %q", projectstate.ErrCodeSectionReadOnly, "allowed-section")
			},
		},
	})
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "format_code",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-section",
		},
	})
	if err != nil {
		t.Fatalf("call format_code readonly: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected readonly format_code call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
	}
	if payload["message"] != `code section is read-only: "allowed-section"` {
		t.Fatalf("unexpected readonly format_code message %#v", payload["message"])
	}
}

func TestServerSetSectionNameRejectsInvalidNames(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_name",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-section",
			"name":            "bad/name",
		},
	})
	if err != nil {
		t.Fatalf("call set_section_name invalid: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected invalid set_section_name call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
	}
	if payload["message"] != "Section name cannot include path separators." {
		t.Fatalf("unexpected invalid section-name message %#v", payload["message"])
	}
}

func TestServerCreateTopLevelSectionRequiresStructuralScope(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "create_top_level_section",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"implType":        "Dict",
		},
	})
	if err != nil {
		t.Fatalf("call create_top_level_section blocked: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected blocked create_top_level_section call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["reason"] != "structural_denied" {
		t.Fatalf("expected structural_denied reason, got %#v", payload["reason"])
	}
}

func TestServerDeleteSectionsRequiresStructuralScope(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "delete_sections",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionIds":      []string{"blocked-section"},
		},
	})
	if err != nil {
		t.Fatalf("call delete_sections blocked: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected blocked delete_sections call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["reason"] != "structural_denied" {
		t.Fatalf("expected structural_denied reason, got %#v", payload["reason"])
	}
	if ids := mustStringList(t, payload["targetSectionIds"]); len(ids) != 1 || ids[0] != "blocked-section" {
		t.Fatalf("expected targetSectionIds [blocked-section], got %#v", ids)
	}
}

func TestServerCreateNewSectionVariantRequiresStructuralScope(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "create_new_section_variant",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "blocked-section",
		},
	})
	if err != nil {
		t.Fatalf("call create_new_section_variant blocked: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected blocked create_new_section_variant call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["reason"] != "structural_denied" {
		t.Fatalf("expected structural_denied reason, got %#v", payload["reason"])
	}
	if ids := mustStringList(t, payload["targetSectionIds"]); len(ids) != 1 || ids[0] != "blocked-section" {
		t.Fatalf("expected targetSectionIds [blocked-section], got %#v", ids)
	}
}

func TestServerCreateTopLevelSectionAllowsUnscopedStructuralCallsAndTranslatesResultIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha": "11",
	})

	beforeProject, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before structural create: %v", err)
	}
	beforeSectionIDs := map[string]struct{}{}
	for sectionID := range beforeProject.Sections {
		beforeSectionIDs[sectionID] = struct{}{}
	}
	beforeCodeObjIDs := map[string]struct{}{}
	for codeObjID := range beforeProject.CodeObjs {
		beforeCodeObjIDs[codeObjID] = struct{}{}
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Name: "create_top_level_section",
		Arguments: map[string]any{
			"projectConfigId":    "11",
			"implType":           "MetaControl",
			"controlCodeObjType": "TextParam",
		},
	})
	if err != nil {
		t.Fatalf("call create_top_level_section allowed: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected create_top_level_section success, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	tempSectionID, ok := payload["sectionId"].(string)
	if !ok || strings.TrimSpace(tempSectionID) == "" {
		t.Fatalf("expected translated sectionId string, got %#v", payload["sectionId"])
	}
	tempParamID, ok := payload["metaControlParamId"].(string)
	if !ok || strings.TrimSpace(tempParamID) == "" {
		t.Fatalf("expected translated metaControlParamId string, got %#v", payload["metaControlParamId"])
	}

	afterProject, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after structural create: %v", err)
	}
	var canonicalSectionID string
	for sectionID := range afterProject.Sections {
		if _, existed := beforeSectionIDs[sectionID]; !existed {
			canonicalSectionID = sectionID
			break
		}
	}
	if canonicalSectionID == "" {
		t.Fatalf("expected one new canonical section id, got %#v", afterProject.Sections)
	}
	var canonicalParamID string
	for codeObjID := range afterProject.CodeObjs {
		if _, existed := beforeCodeObjIDs[codeObjID]; !existed {
			canonicalParamID = codeObjID
			break
		}
	}
	if canonicalParamID == "" {
		t.Fatalf("expected one new canonical code-object id, got %#v", afterProject.CodeObjs)
	}
	if tempSectionID == canonicalSectionID {
		t.Fatalf("expected translated section id to differ from canonical %q", canonicalSectionID)
	}
	if tempParamID == canonicalParamID {
		t.Fatalf("expected translated code-object id to differ from canonical %q", canonicalParamID)
	}
	if _, ok := afterProject.Sections[tempSectionID]; ok {
		t.Fatalf("did not expect translated section id %q to be a canonical project key", tempSectionID)
	}
	if _, ok := afterProject.CodeObjs[tempParamID]; ok {
		t.Fatalf("did not expect translated code-object id %q to be a canonical project key", tempParamID)
	}
}

func TestServerCreateChildSectionsAllowsUnscopedStructuralCallsAndTranslatesResultIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha":   "11",
		"allowed-section": "14",
	})

	beforeProject, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before child create: %v", err)
	}
	beforeSectionIDs := map[string]struct{}{}
	for sectionID := range beforeProject.Sections {
		beforeSectionIDs[sectionID] = struct{}{}
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Name: "create_child_sections",
		Arguments: map[string]any{
			"projectConfigId": "11",
			"parentId":        "14",
			"implType":        "Terminal",
			"numChildren":     1,
		},
	})
	if err != nil {
		t.Fatalf("call create_child_sections allowed: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected create_child_sections success, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	sectionIDs := mustStringList(t, payload["sectionIds"])
	if len(sectionIDs) != 1 || strings.TrimSpace(sectionIDs[0]) == "" {
		t.Fatalf("expected one translated child section id, got %#v", sectionIDs)
	}

	afterProject, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after child create: %v", err)
	}
	var canonicalSectionID string
	for sectionID := range afterProject.Sections {
		if _, existed := beforeSectionIDs[sectionID]; !existed {
			canonicalSectionID = sectionID
			break
		}
	}
	if canonicalSectionID == "" {
		t.Fatalf("expected one new canonical section id, got %#v", afterProject.Sections)
	}
	if sectionIDs[0] == canonicalSectionID {
		t.Fatalf("expected translated child id to differ from canonical %q", canonicalSectionID)
	}
	if _, ok := afterProject.Sections[sectionIDs[0]]; ok {
		t.Fatalf("did not expect translated section id %q to be a canonical project key", sectionIDs[0])
	}
	createdSection := afterProject.Sections[canonicalSectionID]
	if createdSection.ParentSectionID != "allowed-section" {
		t.Fatalf("expected created child parent allowed-section, got %#v", createdSection)
	}

	parentPayload := mustDecodedProjectPayload(t, afterProject.SectionImpls["allowed-impl"].Payload)
	children := mustStringList(t, parentPayload["children"])
	if len(children) != 1 || children[0] != canonicalSectionID {
		t.Fatalf("expected allowed-section children [%q], got %#v", canonicalSectionID, children)
	}
}

func TestServerSetCodeSectionAttachedTerminalRequiresStructuralScope(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	terminalSectionID := mustSeedScopedTestTopLevelTerminal(t, projectRuntime)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_code_section_attached_terminal",
		Arguments: map[string]any{
			"projectConfigId":   "project-alpha",
			"sectionId":         "allowed-section",
			"terminalSectionId": terminalSectionID,
		},
	})
	if err != nil {
		t.Fatalf("call set_code_section_attached_terminal blocked: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected blocked set_code_section_attached_terminal call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["reason"] != "structural_denied" {
		t.Fatalf("expected structural_denied reason, got %#v", payload["reason"])
	}
}

func TestServerSetCodeSectionAttachedTerminalAllowsUnscopedStructuralCallsAndTranslatesTemporaryIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	terminalSectionID := mustSeedScopedTestTopLevelTerminal(t, projectRuntime)
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha":   "11",
		"allowed-section": "14",
		terminalSectionID: "91",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Name: "set_code_section_attached_terminal",
		Arguments: map[string]any{
			"projectConfigId":   "11",
			"sectionId":         "14",
			"terminalSectionId": "91",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_code_section_attached_terminal: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id set_code_section_attached_terminal success, got %#v", result.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_code_section_attached_terminal: %v", err)
	}
	_, _, codeImpl, err := project.ResolveSection("allowed-section")
	if err != nil {
		t.Fatalf("resolve allowed section after attach: %v", err)
	}
	if codeImpl.Code.AttachedTerminalSectionID != terminalSectionID {
		t.Fatalf("expected attached terminal %q, got %q", terminalSectionID, codeImpl.Code.AttachedTerminalSectionID)
	}

	terminalSection, _, _, err := project.ResolveSection(terminalSectionID)
	if err != nil {
		t.Fatalf("resolve attached terminal section: %v", err)
	}
	if terminalSection.ParentSectionID != "allowed-section" {
		t.Fatalf("expected attached terminal parent allowed-section, got %q", terminalSection.ParentSectionID)
	}
	if project.HasTopLevelSection(terminalSectionID) {
		t.Fatalf("did not expect attached terminal %q to remain top-level", terminalSectionID)
	}

	parentPayload := mustDecodedProjectPayload(t, project.SectionImpls["allowed-impl"].Payload)
	children := mustStringList(t, parentPayload["children"])
	if len(children) != 1 || children[0] != terminalSectionID {
		t.Fatalf("expected allowed-section children [%q], got %#v", terminalSectionID, children)
	}
}

func TestServerSetSectionSizesRequiresStructuralScope(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_sizes",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionSizes": map[string]any{
				"allowed-section": map[string]any{"width": 480.0, "height": 220.0},
			},
		},
	})
	if err != nil {
		t.Fatalf("call set_section_sizes blocked: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected blocked set_section_sizes call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["reason"] != "structural_denied" {
		t.Fatalf("expected structural_denied reason, got %#v", payload["reason"])
	}
}

func TestServerSetSectionSizesAllowsUnscopedStructuralCallsAndTranslatesTemporaryIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha":   "11",
		"allowed-section": "14",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Name: "set_section_sizes",
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionSizes": map[string]any{
				"14": map[string]any{"width": 480.0, "height": 220.0},
			},
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_section_sizes: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id set_section_sizes success, got %#v", result.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_section_sizes: %v", err)
	}
	payload := mustDecodedProjectPayload(t, project.SectionImpls["allowed-impl"].Payload)
	size := mustStructuredMap(t, payload["size"])
	if size["width"] != 480.0 || size["height"] != 220.0 {
		t.Fatalf("expected normalized size {480 220}, got %#v", size)
	}
}

func TestServerSetGroupOverflowModeRequiresStructuralScope(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	mustAddScopedTestGroupSection(t, projectRuntime)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_group_overflow_mode",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "group-section",
			"overflowMode":    true,
		},
	})
	if err != nil {
		t.Fatalf("call set_group_overflow_mode blocked: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected blocked set_group_overflow_mode call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["reason"] != "structural_denied" {
		t.Fatalf("expected structural_denied reason, got %#v", payload["reason"])
	}
	if ids := mustStringList(t, payload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "group-section" {
		t.Fatalf("expected blockedSectionIds [group-section], got %#v", ids)
	}
}

func TestServerSetGroupOverflowModeAllowsUnscopedStructuralCallsAndTranslatesTemporaryIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	mustAddScopedTestGroupSection(t, projectRuntime)
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha": "11",
		"group-section": "41",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_group_overflow_mode",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "41",
			"overflowMode":    true,
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_group_overflow_mode: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id set_group_overflow_mode success, got %#v", result.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_group_overflow_mode: %v", err)
	}
	if !payloadBoolField(mustDecodedProjectPayload(t, project.Sections["group-section"].SharedModifier), "overflowMode") {
		t.Fatal("expected group-section overflowMode=true after mutation")
	}
}

func TestServerSetGroupOverflowModeRejectsNonGroupSection(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_group_overflow_mode",
		Meta: sdkmcp.Meta{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-section",
			"overflowMode":    true,
		},
	})
	if err != nil {
		t.Fatalf("call invalid set_group_overflow_mode: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected invalid set_group_overflow_mode call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
	}
	if message, ok := payload["message"].(string); !ok || !strings.Contains(strings.ToLower(message), "group section") {
		t.Fatalf("expected group-section requirement message, got %#v", payload["message"])
	}
}

func TestServerCreateChildSectionsViaIncrementerAllowsUnscopedStructuralCallsAndTranslatesResultIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha":   "11",
		"allowed-section": "14",
	})

	beforeProject, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before incrementer child create: %v", err)
	}
	beforeSectionIDs := map[string]struct{}{}
	for sectionID := range beforeProject.Sections {
		beforeSectionIDs[sectionID] = struct{}{}
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Name: "create_child_sections_via_incrementer",
		Arguments: map[string]any{
			"projectConfigId": "11",
			"calledBy":        "14",
			"implType":        "Terminal",
			"numChildren":     1,
		},
	})
	if err != nil {
		t.Fatalf("call create_child_sections_via_incrementer allowed: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected create_child_sections_via_incrementer success, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	sectionIDs := mustStringList(t, payload["sectionIds"])
	if len(sectionIDs) != 1 || strings.TrimSpace(sectionIDs[0]) == "" {
		t.Fatalf("expected one translated incrementer child section id, got %#v", sectionIDs)
	}

	afterProject, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after incrementer child create: %v", err)
	}
	var canonicalSectionID string
	for sectionID := range afterProject.Sections {
		if _, existed := beforeSectionIDs[sectionID]; !existed {
			canonicalSectionID = sectionID
			break
		}
	}
	if canonicalSectionID == "" {
		t.Fatalf("expected one new canonical section id, got %#v", afterProject.Sections)
	}
	if sectionIDs[0] == canonicalSectionID {
		t.Fatalf("expected translated incrementer child id to differ from canonical %q", canonicalSectionID)
	}
	if _, ok := afterProject.Sections[sectionIDs[0]]; ok {
		t.Fatalf("did not expect translated incrementer child id %q to be a canonical project key", sectionIDs[0])
	}
	createdSection := afterProject.Sections[canonicalSectionID]
	if createdSection.ParentSectionID != "allowed-section" {
		t.Fatalf("expected created incrementer child parent allowed-section, got %#v", createdSection)
	}

	parentPayload := mustDecodedProjectPayload(t, afterProject.SectionImpls["allowed-impl"].Payload)
	children := mustStringList(t, parentPayload["children"])
	if len(children) != 1 || children[0] != canonicalSectionID {
		t.Fatalf("expected allowed-section children [%q], got %#v", canonicalSectionID, children)
	}
}

func TestServerDeleteSectionsAllowsUnscopedStructuralCallsAndTranslatesIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha":          "11",
		"allowed-params-section": "20",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Name: "delete_sections",
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionIds":      []string{"20"},
		},
	})
	if err != nil {
		t.Fatalf("call delete_sections allowed: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected delete_sections success, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	sectionIDs := mustStringList(t, payload["sectionIds"])
	if len(sectionIDs) != 1 || sectionIDs[0] != "20" {
		t.Fatalf("expected translated deleted section ids [20], got %#v", sectionIDs)
	}

	afterProject, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after delete_sections: %v", err)
	}
	if _, ok := afterProject.Sections["allowed-params-section"]; ok {
		t.Fatalf("expected allowed-params-section to be removed, got %#v", afterProject.Sections)
	}
	if _, ok := afterProject.CodeObjs["allowed-param"]; ok {
		t.Fatalf("expected allowed-param to be pruned, got %#v", afterProject.CodeObjs)
	}
}

func TestServerDeleteChildSectionsViaDecrementerAllowsUnscopedStructuralCallsAndTranslatesIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	canonicalChildID := mustSeedScopedTestChildSection(t, projectRuntime, "allowed-section")
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha":   "11",
		"allowed-section": "14",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Name: "delete_child_sections_via_decrementer",
		Arguments: map[string]any{
			"projectConfigId": "11",
			"calledBy":        "14",
			"numChildren":     1,
		},
	})
	if err != nil {
		t.Fatalf("call delete_child_sections_via_decrementer allowed: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected delete_child_sections_via_decrementer success, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	sectionIDs := mustStringList(t, payload["sectionIds"])
	if len(sectionIDs) != 1 || strings.TrimSpace(sectionIDs[0]) == "" {
		t.Fatalf("expected one translated deleted child section id, got %#v", sectionIDs)
	}
	if sectionIDs[0] == canonicalChildID {
		t.Fatalf("expected translated deleted child id to differ from canonical %q", canonicalChildID)
	}

	afterProject, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after delete_child_sections_via_decrementer: %v", err)
	}
	if _, ok := afterProject.Sections[canonicalChildID]; ok {
		t.Fatalf("expected %q to be removed, got %#v", canonicalChildID, afterProject.Sections)
	}
	if _, ok := afterProject.Sections[sectionIDs[0]]; ok {
		t.Fatalf("did not expect translated deleted child id %q to be a canonical project key", sectionIDs[0])
	}

	parentPayload := mustDecodedProjectPayload(t, afterProject.SectionImpls["allowed-impl"].Payload)
	children := mustStringList(t, parentPayload["children"])
	if len(children) != 0 {
		t.Fatalf("expected allowed-section children to be empty after decrementer delete, got %#v", children)
	}
}

func TestServerCreateNewSectionVariantAllowsUnscopedStructuralCallsAndTranslatesVariantIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha":          "11",
		"allowed-params-section": "20",
	})

	beforeProject, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before create_new_section_variant: %v", err)
	}
	beforeVariantIDs := append([]string(nil), beforeProject.Sections["allowed-params-section"].VariantIDs...)

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Name: "create_new_section_variant",
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "20",
		},
	})
	if err != nil {
		t.Fatalf("call create_new_section_variant allowed: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected create_new_section_variant success, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	tempVariantID, ok := payload["variantId"].(string)
	if !ok || strings.TrimSpace(tempVariantID) == "" {
		t.Fatalf("expected translated variantId string, got %#v", payload["variantId"])
	}

	afterProject, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after create_new_section_variant: %v", err)
	}
	afterVariantIDs := afterProject.Sections["allowed-params-section"].VariantIDs
	if len(afterVariantIDs) != len(beforeVariantIDs)+1 {
		t.Fatalf("expected one new section variant, got before=%#v after=%#v", beforeVariantIDs, afterVariantIDs)
	}
	var canonicalVariantID string
	for _, variantID := range afterVariantIDs {
		if !containsString(beforeVariantIDs, variantID) {
			canonicalVariantID = variantID
			break
		}
	}
	if canonicalVariantID == "" {
		t.Fatalf("expected one new canonical section variant id, got %#v", afterVariantIDs)
	}
	if tempVariantID == canonicalVariantID {
		t.Fatalf("expected translated variant id to differ from canonical %q", canonicalVariantID)
	}
	if _, ok := afterProject.SectionVariants[tempVariantID]; ok {
		t.Fatalf("did not expect translated variant id %q to be a canonical project key", tempVariantID)
	}
	if got := afterProject.SectionVariantMap["allowed-params-section"]; got != canonicalVariantID {
		t.Fatalf("expected active allowed-params-section variant %q, got %q", canonicalVariantID, got)
	}
	if len(afterProject.CodeObjs["allowed-param"].VariantIDs) != 2 {
		t.Fatalf("expected allowed-param to gain one code-object variant, got %#v", afterProject.CodeObjs["allowed-param"].VariantIDs)
	}
}

func TestServerSetSectionVariantRespectsScopedWriteTargets(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	mustAddScopedTestAlternateSectionVariant(t, projectRuntime)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_variant",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-section",
			"variantId":       "allowed-variant-alt",
		},
	})
	if err != nil {
		t.Fatalf("call set_section_variant allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected allowed set_section_variant success, got %#v", allowedResult.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_section_variant: %v", err)
	}
	if got := project.SectionVariantMap["allowed-section"]; got != "allowed-variant-alt" {
		t.Fatalf("expected allowed-section active variant to be updated, got %q", got)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_variant",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "blocked-section",
			"variantId":       "blocked-variant",
		},
	})
	if err != nil {
		t.Fatalf("call set_section_variant blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked set_section_variant call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if blockedPayload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", blockedPayload["reason"])
	}
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "blocked-section" {
		t.Fatalf("unexpected blockedSectionIds %#v", ids)
	}
}

func TestServerSetSectionVariantAllowsUnscopedCallsAndTranslatesTemporaryIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	mustAddScopedTestAlternateSectionVariant(t, projectRuntime)
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha":       "11",
		"allowed-section":     "14",
		"allowed-variant-alt": "30",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_variant",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "14",
			"variantId":       "30",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_section_variant: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id set_section_variant success, got %#v", result.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id set_section_variant: %v", err)
	}
	if got := project.SectionVariantMap["allowed-section"]; got != "allowed-variant-alt" {
		t.Fatalf("expected translated section variant update, got %q", got)
	}
}

func TestServerSetSectionVariantRejectsVariantOutsideSection(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	mustAddScopedTestAlternateSectionVariant(t, projectRuntime)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_variant",
		Meta: sdkmcp.Meta{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-section",
			"variantId":       "peer-chat-variant",
		},
	})
	if err != nil {
		t.Fatalf("call invalid set_section_variant: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected invalid set_section_variant call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
	}
	if message, ok := payload["message"].(string); !ok || !strings.Contains(message, "section variant must belong to the section") {
		t.Fatalf("expected section variant membership message, got %#v", payload["message"])
	}
}

func TestServerSetDefaultSectionVariantRespectsScopedWriteTargets(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	mustAddScopedTestAlternateSectionVariant(t, projectRuntime)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_default_section_variant",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-section",
			"variantId":       "allowed-variant-alt",
		},
	})
	if err != nil {
		t.Fatalf("call set_default_section_variant allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected allowed set_default_section_variant success, got %#v", allowedResult.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_default_section_variant: %v", err)
	}
	if got := project.Sections["allowed-section"].DefaultVariantID; got != "allowed-variant-alt" {
		t.Fatalf("expected allowed-section default variant to be updated, got %q", got)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_default_section_variant",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "blocked-section",
			"variantId":       "blocked-variant",
		},
	})
	if err != nil {
		t.Fatalf("call set_default_section_variant blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked set_default_section_variant call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if blockedPayload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", blockedPayload["reason"])
	}
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "blocked-section" {
		t.Fatalf("unexpected blockedSectionIds %#v", ids)
	}
}

func TestServerSetDefaultSectionVariantAllowsUnscopedCallsAndTranslatesTemporaryIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	mustAddScopedTestAlternateSectionVariant(t, projectRuntime)
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha":       "11",
		"allowed-section":     "14",
		"allowed-variant-alt": "30",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_default_section_variant",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "14",
			"variantId":       "30",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_default_section_variant: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id set_default_section_variant success, got %#v", result.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id set_default_section_variant: %v", err)
	}
	if got := project.Sections["allowed-section"].DefaultVariantID; got != "allowed-variant-alt" {
		t.Fatalf("expected translated default section variant update, got %q", got)
	}
}

func TestServerSetSectionVariantSortOrderRespectsScopedWriteTargets(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	mustAddScopedTestAlternateSectionVariant(t, projectRuntime)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_variant_sort_order",
		Arguments: map[string]any{
			"projectConfigId":   "project-alpha",
			"sectionId":         "allowed-section",
			"orderedVariantIds": []string{"allowed-variant-alt", "allowed-variant"},
		},
	})
	if err != nil {
		t.Fatalf("call set_section_variant_sort_order allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected allowed set_section_variant_sort_order success, got %#v", allowedResult.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_section_variant_sort_order: %v", err)
	}
	if !reflect.DeepEqual(project.Sections["allowed-section"].VariantIDs, []string{"allowed-variant-alt", "allowed-variant"}) {
		t.Fatalf("expected reordered variants, got %#v", project.Sections["allowed-section"].VariantIDs)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_variant_sort_order",
		Arguments: map[string]any{
			"projectConfigId":   "project-alpha",
			"sectionId":         "blocked-section",
			"orderedVariantIds": []string{"blocked-variant"},
		},
	})
	if err != nil {
		t.Fatalf("call set_section_variant_sort_order blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked set_section_variant_sort_order call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if blockedPayload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", blockedPayload["reason"])
	}
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "blocked-section" {
		t.Fatalf("unexpected blockedSectionIds %#v", ids)
	}
}

func TestServerSetSectionVariantSortOrderAllowsUnscopedCallsAndTranslatesTemporaryIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	mustAddScopedTestAlternateSectionVariant(t, projectRuntime)
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha":       "11",
		"allowed-section":     "14",
		"allowed-variant":     "16",
		"allowed-variant-alt": "30",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_variant_sort_order",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId":   "11",
			"sectionId":         "14",
			"orderedVariantIds": []string{"30", "16"},
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_section_variant_sort_order: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id set_section_variant_sort_order success, got %#v", result.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id set_section_variant_sort_order: %v", err)
	}
	if !reflect.DeepEqual(project.Sections["allowed-section"].VariantIDs, []string{"allowed-variant-alt", "allowed-variant"}) {
		t.Fatalf("expected translated reordered variants, got %#v", project.Sections["allowed-section"].VariantIDs)
	}
}

func TestServerSetSectionVariantSortOrderRejectsDuplicateVariantIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	mustAddScopedTestAlternateSectionVariant(t, projectRuntime)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_variant_sort_order",
		Meta: sdkmcp.Meta{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId":   "project-alpha",
			"sectionId":         "allowed-section",
			"orderedVariantIds": []string{"allowed-variant", "allowed-variant"},
		},
	})
	if err != nil {
		t.Fatalf("call invalid set_section_variant_sort_order: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected invalid set_section_variant_sort_order call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
	}
	if message, ok := payload["message"].(string); !ok || !strings.Contains(message, "orderedVariantIds must not contain duplicate variant IDs.") {
		t.Fatalf("expected duplicate orderedVariantIds message, got %#v", payload["message"])
	}
}

func TestServerSetTypeErrorIgnoreRespectsScopedWriteTargets(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_type_error_ignore",
		Arguments: map[string]any{
			"projectConfigId":  "project-alpha",
			"sectionId":        "allowed-params-section",
			"paramInfoId":      "allowed-param",
			"ignoreTypeErrors": true,
		},
	})
	if err != nil {
		t.Fatalf("call set_type_error_ignore allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected allowed set_type_error_ignore success, got %#v", allowedResult.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_type_error_ignore: %v", err)
	}
	ignoreState, err := project.TypeErrorIgnoreStateForSection("allowed-params-section")
	if err != nil {
		t.Fatalf("type error ignore state after update: %v", err)
	}
	if !ignoreState.Params["allowed-param"] {
		t.Fatalf("expected allowed-param ignore state, got %#v", ignoreState)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_type_error_ignore",
		Arguments: map[string]any{
			"projectConfigId":  "project-alpha",
			"sectionId":        "blocked-params-section",
			"paramInfoId":      "blocked-param",
			"ignoreTypeErrors": true,
		},
	})
	if err != nil {
		t.Fatalf("call set_type_error_ignore blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked set_type_error_ignore call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if blockedPayload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", blockedPayload["reason"])
	}
}

func TestServerSetCodeObjectNameRespectsScopedWriteTargets(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_code_obj_name",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"codeObjId":       "allowed-param",
			"name":            "user-id@v2",
		},
	})
	if err != nil {
		t.Fatalf("call set_code_obj_name allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected allowed set_code_obj_name success, got %#v", allowedResult.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_code_obj_name: %v", err)
	}
	if got := project.CodeObjs["allowed-param"].Name; got != "user-id@v2" {
		t.Fatalf("expected code object name user-id@v2, got %q", got)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_code_obj_name",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"codeObjId":       "blocked-param",
			"name":            "blocked-name",
		},
	})
	if err != nil {
		t.Fatalf("call set_code_obj_name blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked set_code_obj_name call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if blockedPayload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", blockedPayload["reason"])
	}
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "blocked-params-section" {
		t.Fatalf("unexpected blockedSectionIds %#v", ids)
	}
}

func TestServerSetCodeObjectNameReturnsInvalidArgumentsForInvalidName(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_code_obj_name",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"codeObjId":       "allowed-param",
			"name":            "bad\nname",
		},
	})
	if err != nil {
		t.Fatalf("call set_code_obj_name invalid name: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected invalid set_code_obj_name call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
	}
	if payload["message"] != "Param name cannot include control characters." {
		t.Fatalf("expected control-character validation message, got %#v", payload["message"])
	}
}

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
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
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

	summary := mustStructuredMap(t, result.StructuredContent)
	projectConfig := mustStructuredMap(t, summary["projectConfig"])
	if projectConfig["id"] != "11" {
		t.Fatalf("expected translated project id 11, got %#v", projectConfig["id"])
	}
	sectionVariantMap := mustStructuredMap(t, projectConfig["sectionVariantMap"])
	if _, ok := sectionVariantMap["14"]; !ok {
		t.Fatalf("expected translated allowed-section key 14, got %#v", sectionVariantMap)
	}
	if _, ok := sectionVariantMap["15"]; !ok {
		t.Fatalf("expected translated peer-chat-section key 15, got %#v", sectionVariantMap)
	}
	if _, ok := sectionVariantMap["20"]; !ok {
		t.Fatalf("expected translated allowed-params-section key 20, got %#v", sectionVariantMap)
	}
	if _, ok := sectionVariantMap["24"]; !ok {
		t.Fatalf("expected translated allowed-callable-section key 24, got %#v", sectionVariantMap)
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
	if len(sectionIDs) != 4 || sectionIDs[0] != "14" || sectionIDs[1] != "15" || sectionIDs[2] != "20" || sectionIDs[3] != "24" {
		t.Fatalf("unexpected translated section ids %#v", sectionIDs)
	}

	diagnosticsResult, err := server.InvokeTool(context.Background(), "get_latest_lsp_diagnostics", map[string]any{
		"projectConfigId": "11",
	}, requestContext)
	if err != nil {
		t.Fatalf("invoke header-scoped temp-id lsp diagnostics: %v", err)
	}
	if diagnosticsResult.IsError {
		t.Fatalf("expected header-scoped temp-id diagnostics success, got %#v", diagnosticsResult.StructuredContent)
	}
	diagnosticsPayload := mustStructuredMap(t, diagnosticsResult.StructuredContent)
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
