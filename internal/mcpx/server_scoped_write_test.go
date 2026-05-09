package mcpx

import (
	"context"
	"path/filepath"
	"strings"
	"testing"

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
