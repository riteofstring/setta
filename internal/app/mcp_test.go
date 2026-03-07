package app

import (
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
	"strings"
	"testing"
	"time"

	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"
	"setta/internal/config"
	"setta/internal/httpapi"
	"setta/internal/mcpx"
	"setta/internal/observability"
	"setta/internal/projectstate"
)

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
	if len(toolsResult.Tools) != 32 {
		t.Fatalf("expected 32 tools, got %d", len(toolsResult.Tools))
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
	if len(rawNames) != 32 {
		t.Fatalf("expected 32 registered tool names, got %d", len(rawNames))
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

func TestAppIDEMCPServerSupportsScopedWriteMutationOverAuthenticatedSSE(t *testing.T) {
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

	result, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
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
	if result.IsError {
		t.Fatalf("expected set_agentic_context success, got %#v", result.StructuredContent)
	}

	result, err = session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_code_section_diagnostics_mute",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-section",
			"mute":            true,
		},
	})
	if err != nil {
		t.Fatalf("call set_code_section_diagnostics_mute: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected scoped write success, got %#v", result.StructuredContent)
	}

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after scoped mute: %v", err)
	}
	ignoreState, err := project.CodeSectionDiagnosticsIgnoreStateForSection("allowed-section")
	if err != nil {
		t.Fatalf("ignore state after scoped mute: %v", err)
	}
	if !ignoreState.Muted {
		t.Fatalf("expected allowed-section to be muted, got %#v", ignoreState)
	}

	result, err = session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_code_section_diagnostic_code_suppression",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-section",
			"code":            "reportFoo",
			"suppress":        true,
		},
	})
	if err != nil {
		t.Fatalf("call set_code_section_diagnostic_code_suppression: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected scoped suppression success, got %#v", result.StructuredContent)
	}

	project, err = app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after scoped suppression: %v", err)
	}
	ignoreState, err = project.CodeSectionDiagnosticsIgnoreStateForSection("allowed-section")
	if err != nil {
		t.Fatalf("ignore state after scoped suppression: %v", err)
	}
	if len(ignoreState.SuppressedCodes) != 1 || ignoreState.SuppressedCodes[0] != "reportFoo" {
		t.Fatalf("expected reportFoo suppression, got %#v", ignoreState.SuppressedCodes)
	}

	result, err = session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_name",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-section",
			"name":            "Allowed Renamed",
		},
	})
	if err != nil {
		t.Fatalf("call set_section_name: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected set_section_name success, got %#v", result.StructuredContent)
	}

	project, err = app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_section_name: %v", err)
	}
	if got := project.Sections["allowed-section"].Name; got != "Allowed Renamed" {
		t.Fatalf("expected renamed section name, got %q", got)
	}

	result, err = session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_param_entered_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-params-section",
			"paramInfoId":     "allowed-param",
			"value":           "updated",
		},
	})
	if err != nil {
		t.Fatalf("call set_param_entered_value: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected set_param_entered_value success, got %#v", result.StructuredContent)
	}

	project, err = app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_param_entered_value: %v", err)
	}
	paramPayload, _, _, _, err := project.ResolveSectionCodeObject("allowed-params-section", "allowed-param")
	if err != nil {
		t.Fatalf("resolve allowed-param after set_param_entered_value: %v", err)
	}
	if got := paramPayload["value"]; got != "updated" {
		t.Fatalf("expected updated param value, got %#v", got)
	}

	result, err = session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_type_error_ignore",
		Arguments: map[string]any{
			"projectConfigId":  "project-alpha",
			"sectionId":        "allowed-params-section",
			"paramInfoId":      "allowed-param",
			"ignoreTypeErrors": true,
		},
	})
	if err != nil {
		t.Fatalf("call set_type_error_ignore: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected set_type_error_ignore success, got %#v", result.StructuredContent)
	}

	project, err = app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_type_error_ignore: %v", err)
	}
	typeErrorIgnoreState, err := project.TypeErrorIgnoreStateForSection("allowed-params-section")
	if err != nil {
		t.Fatalf("type error ignore state after set_type_error_ignore: %v", err)
	}
	if !typeErrorIgnoreState.Params["allowed-param"] {
		t.Fatalf("expected allowed-param type-error ignore state, got %#v", typeErrorIgnoreState)
	}

	result, err = session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_code_obj_name",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"codeObjId":       "allowed-param",
			"name":            "user-id@v2",
		},
	})
	if err != nil {
		t.Fatalf("call set_code_obj_name: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected set_code_obj_name success, got %#v", result.StructuredContent)
	}

	project, err = app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_code_obj_name: %v", err)
	}
	if got := project.CodeObjs["allowed-param"].Name; got != "user-id@v2" {
		t.Fatalf("expected code object name user-id@v2, got %q", got)
	}

	result, err = session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_param_name_and_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-params-section",
			"codeObjId":       "allowed-param",
			"name":            "user-id@v3",
			"value":           "combined",
		},
	})
	if err != nil {
		t.Fatalf("call set_param_name_and_value: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected set_param_name_and_value success, got %#v", result.StructuredContent)
	}

	project, err = app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_param_name_and_value: %v", err)
	}
	if got := project.CodeObjs["allowed-param"].Name; got != "user-id@v3" {
		t.Fatalf("expected code object name user-id@v3, got %q", got)
	}
	paramPayload, _, _, _, err = project.ResolveSectionCodeObject("allowed-params-section", "allowed-param")
	if err != nil {
		t.Fatalf("resolve allowed-param after set_param_name_and_value: %v", err)
	}
	if got := paramPayload["value"]; got != "combined" {
		t.Fatalf("expected combined param value, got %#v", got)
	}

	if _, err := app.ProjectStates().Main().ChangeParamImpl(context.Background(), "project-alpha", "allowed-params-section", "allowed-param", "SliderParam"); err != nil {
		t.Fatalf("prepare slider impl before update_param_impl_config: %v", err)
	}
	if _, err := app.ProjectStates().Main().SetSectionCodeObjectValue(context.Background(), "project-alpha", "allowed-params-section", "allowed-param", "75"); err != nil {
		t.Fatalf("prepare slider value before update_param_impl_config: %v", err)
	}

	result, err = session.CallTool(context.Background(), &sdkmcp.CallToolParams{
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
		t.Fatalf("call update_param_impl_config: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected update_param_impl_config success, got %#v", result.StructuredContent)
	}
	updateParamImplConfigPayload := mustStructuredMapValue(t, result.StructuredContent)
	if updateParamImplConfigPayload["status"] != "ok" {
		t.Fatalf("expected update_param_impl_config status ok, got %#v", updateParamImplConfigPayload["status"])
	}

	project, err = app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after update_param_impl_config: %v", err)
	}
	paramPayload, _, _, updatedParamImpl, err := project.ResolveSectionCodeObject("allowed-params-section", "allowed-param")
	if err != nil {
		t.Fatalf("resolve allowed-param after update_param_impl_config: %v", err)
	}
	if updatedParamImpl.Type != "SliderParam" {
		t.Fatalf("expected SliderParam impl after update_param_impl_config, got %q", updatedParamImpl.Type)
	}
	if got := paramPayload["value"]; got != "10" {
		t.Fatalf("expected slider value to clamp to 10, got %#v", got)
	}

	result, err = session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "change_param_impl",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-params-section",
			"paramInfoId":     "allowed-param",
			"selectedId":      "PasswordParam",
		},
	})
	if err != nil {
		t.Fatalf("call change_param_impl: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected change_param_impl success, got %#v", result.StructuredContent)
	}
	changeParamImplPayload := mustStructuredMapValue(t, result.StructuredContent)
	if changeParamImplPayload["status"] != "ok" {
		t.Fatalf("expected change_param_impl status ok, got %#v", changeParamImplPayload["status"])
	}

	project, err = app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after change_param_impl: %v", err)
	}
	paramPayload, _, _, paramImpl, err := project.ResolveSectionCodeObject("allowed-params-section", "allowed-param")
	if err != nil {
		t.Fatalf("resolve allowed-param after change_param_impl: %v", err)
	}
	if paramImpl.Type != "PasswordParam" {
		t.Fatalf("expected PasswordParam impl after change_param_impl, got %q", paramImpl.Type)
	}
	if got := paramPayload["value"]; got != "" {
		t.Fatalf("expected password param value to stay blank, got %#v", got)
	}
	if got := paramPayload["hasSecret"]; got != true {
		t.Fatalf("expected hasSecret true after change_param_impl, got %#v", got)
	}

	result, err = session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_callable",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-callable-section",
			"callableName":    "sorted",
			"refetchParams":   false,
		},
	})
	if err != nil {
		t.Fatalf("call set_callable: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected set_callable success, got %#v", result.StructuredContent)
	}
	callableResultPayload := mustStructuredMapValue(t, result.StructuredContent)
	if callableResultPayload["callableId"] == "" {
		t.Fatalf("expected non-empty callable id result, got %#v", callableResultPayload["callableId"])
	}

	project, err = app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_callable: %v", err)
	}
	_, _, callableImpl, err := project.ResolveSection("allowed-callable-section")
	if err != nil {
		t.Fatalf("resolve allowed-callable-section after set_callable: %v", err)
	}
	callableSectionPayload := mustDecodedProjectPayloadValue(t, callableImpl.Payload)
	if got := callableSectionPayload["callable"]; got != "allowed-callable-2" {
		t.Fatalf("expected persisted callable allowed-callable-2, got %#v", got)
	}

	result, err = session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "add_kwarg",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-callable-section",
		},
	})
	if err != nil {
		t.Fatalf("call add_kwarg: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected add_kwarg success, got %#v", result.StructuredContent)
	}
	addKwargPayload := mustStructuredMapValue(t, result.StructuredContent)
	addedCallableParamID, ok := addKwargPayload["codeObjId"].(string)
	if !ok || addedCallableParamID == "" {
		t.Fatalf("expected add_kwarg codeObjId string, got %#v", addKwargPayload["codeObjId"])
	}

	project, err = app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after add_kwarg: %v", err)
	}
	callableRootPayload, _, _, _, err := project.ResolveSectionCodeObject("allowed-callable-section", "allowed-callable-2")
	if err != nil {
		t.Fatalf("resolve allowed-callable-2 after add_kwarg: %v", err)
	}
	callableChildren := mustStringSliceValue(t, callableRootPayload["children"])
	if len(callableChildren) != 2 {
		t.Fatalf("expected two callable children after add_kwarg, got %#v", callableChildren)
	}
	canonicalAddedCallableParamID := callableChildren[1]
	temporaryMap := readAppTemporaryIDMap(t, filepath.Join(cfg.Paths.RuntimeRoot, "temporary_id_map.json"))
	if got := temporaryMap[canonicalAddedCallableParamID]; got != addedCallableParamID {
		t.Fatalf("expected temporary map %q -> %q, got %q", canonicalAddedCallableParamID, addedCallableParamID, got)
	}
	addedCallableParamPayload, addedCallableParam, _, _, err := project.ResolveSectionCodeObject("allowed-callable-section", canonicalAddedCallableParamID)
	if err != nil {
		t.Fatalf("resolve added callable param after add_kwarg: %v", err)
	}
	if addedCallableParam.Name != "param" {
		t.Fatalf("expected added callable param placeholder name param, got %q", addedCallableParam.Name)
	}
	if got := addedCallableParamPayload["value"]; got != "" {
		t.Fatalf("expected added callable param value to start empty, got %#v", got)
	}

	result, err = session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_param_name_and_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-callable-section",
			"codeObjId":       addedCallableParamID,
			"name":            "key",
			"value":           "None",
		},
	})
	if err != nil {
		t.Fatalf("call callable set_param_name_and_value: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected callable set_param_name_and_value success, got %#v", result.StructuredContent)
	}

	project, err = app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after callable set_param_name_and_value: %v", err)
	}
	if got := project.CodeObjs[canonicalAddedCallableParamID].Name; got != "key" {
		t.Fatalf("expected added callable param name key, got %q", got)
	}
	addedCallableParamPayload, _, _, _, err = project.ResolveSectionCodeObject("allowed-callable-section", canonicalAddedCallableParamID)
	if err != nil {
		t.Fatalf("resolve added callable param after callable rename/value: %v", err)
	}
	if got := addedCallableParamPayload["value"]; got != "None" {
		t.Fatalf("expected added callable param value None, got %#v", got)
	}

	result, err = session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "delete_kwarg",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-callable-section",
		},
	})
	if err != nil {
		t.Fatalf("call delete_kwarg: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected delete_kwarg success, got %#v", result.StructuredContent)
	}
	deleteKwargPayload := mustStructuredMapValue(t, result.StructuredContent)
	if got := deleteKwargPayload["codeObjId"]; got != addedCallableParamID {
		t.Fatalf("expected deleted codeObjId %q, got %#v", addedCallableParamID, got)
	}

	project, err = app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after delete_kwarg: %v", err)
	}
	callableRootPayload, _, _, _, err = project.ResolveSectionCodeObject("allowed-callable-section", "allowed-callable-2")
	if err != nil {
		t.Fatalf("resolve allowed-callable-2 after delete_kwarg: %v", err)
	}
	callableChildren = mustStringSliceValue(t, callableRootPayload["children"])
	if len(callableChildren) != 1 || callableChildren[0] != "allowed-param-existing" {
		t.Fatalf("expected callable children [allowed-param-existing] after delete_kwarg, got %#v", callableChildren)
	}
	if _, ok := project.CodeObjs[canonicalAddedCallableParamID]; ok {
		t.Fatalf("expected deleted callable param %q to be pruned after delete_kwarg, got %#v", canonicalAddedCallableParamID, project.CodeObjs[canonicalAddedCallableParamID])
	}

	result, err = session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "add_kwarg",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-callable-section",
		},
	})
	if err != nil {
		t.Fatalf("call second add_kwarg: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected second add_kwarg success, got %#v", result.StructuredContent)
	}
	addKwargPayload = mustStructuredMapValue(t, result.StructuredContent)
	secondAddedCallableParamID, ok := addKwargPayload["codeObjId"].(string)
	if !ok || secondAddedCallableParamID == "" {
		t.Fatalf("expected second add_kwarg codeObjId string, got %#v", addKwargPayload["codeObjId"])
	}

	project, err = app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after second add_kwarg: %v", err)
	}
	callableRootPayload, _, _, _, err = project.ResolveSectionCodeObject("allowed-callable-section", "allowed-callable-2")
	if err != nil {
		t.Fatalf("resolve allowed-callable-2 after second add_kwarg: %v", err)
	}
	callableChildren = mustStringSliceValue(t, callableRootPayload["children"])
	if len(callableChildren) != 2 {
		t.Fatalf("expected two callable children after second add_kwarg, got %#v", callableChildren)
	}
	secondCanonicalAddedCallableParamID := callableChildren[1]
	temporaryMap = readAppTemporaryIDMap(t, filepath.Join(cfg.Paths.RuntimeRoot, "temporary_id_map.json"))
	if got := temporaryMap[secondCanonicalAddedCallableParamID]; got != secondAddedCallableParamID {
		t.Fatalf("expected temporary map %q -> %q after second add, got %q", secondCanonicalAddedCallableParamID, secondAddedCallableParamID, got)
	}

	result, err = session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "delete_selected_params",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-callable-section",
			"paramInfoIds":    []any{secondAddedCallableParamID},
		},
	})
	if err != nil {
		t.Fatalf("call delete_selected_params: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected delete_selected_params success, got %#v", result.StructuredContent)
	}
	deleteSelectedParamsPayload := mustStructuredMapValue(t, result.StructuredContent)
	deletedParamIDs := mustStringSliceValue(t, deleteSelectedParamsPayload["paramInfoIds"])
	if len(deletedParamIDs) != 1 || deletedParamIDs[0] != secondAddedCallableParamID {
		t.Fatalf("expected deleted paramInfoIds [%s], got %#v", secondAddedCallableParamID, deletedParamIDs)
	}

	project, err = app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after delete_selected_params: %v", err)
	}
	callableRootPayload, _, _, _, err = project.ResolveSectionCodeObject("allowed-callable-section", "allowed-callable-2")
	if err != nil {
		t.Fatalf("resolve allowed-callable-2 after delete_selected_params: %v", err)
	}
	callableChildren = mustStringSliceValue(t, callableRootPayload["children"])
	if len(callableChildren) != 1 || callableChildren[0] != "allowed-param-existing" {
		t.Fatalf("expected callable children [allowed-param-existing] after delete_selected_params, got %#v", callableChildren)
	}
	if _, ok := project.CodeObjs[secondCanonicalAddedCallableParamID]; ok {
		t.Fatalf("expected deleted callable param %q to be pruned, got %#v", secondCanonicalAddedCallableParamID, project.CodeObjs[secondCanonicalAddedCallableParamID])
	}

	result, err = session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_code_obj_display_name",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"codeObjId":       "allowed-param",
			"displayName":     "Height",
		},
	})
	if err != nil {
		t.Fatalf("call set_code_obj_display_name: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected set_code_obj_display_name success, got %#v", result.StructuredContent)
	}

	project, err = app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_code_obj_display_name: %v", err)
	}
	if got := project.CodeObjs["allowed-param"].DisplayName; got != "Height" {
		t.Fatalf("expected display name Height, got %q", got)
	}
}

func TestAppIDEMCPServerRejectsReadOnlySetCodeOverAuthenticatedSSE(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
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
	seedAppWatchCodeBoundSectionProject(t, app)
	mustSetAppCodeSectionReadOnly(t, app.ProjectStates().Main(), "project-alpha", "section-main")

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
		Name: "set_agentic_context",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   true,
		},
	})
	if err != nil {
		t.Fatalf("call set_agentic_context: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected set_agentic_context success, got %#v", result.StructuredContent)
	}

	result, err = session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_code",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "section-main",
			"code":            "def readonly(value):\n    return value\n",
		},
	})
	if err != nil {
		t.Fatalf("call set_code readonly: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected readonly set_code to fail")
	}
	payload := mustStructuredMapValue(t, result.StructuredContent)
	if payload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
	}
	if payload["message"] != `code section is read-only: "section-main"` {
		t.Fatalf("unexpected readonly set_code message %#v", payload["message"])
	}
}

func TestAppIDEMCPServerSupportsSetCodeOverAuthenticatedSSE(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
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
	seedAppWatchCodeBoundSectionProject(t, app)

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
		Name: "set_agentic_context",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   true,
		},
	})
	if err != nil {
		t.Fatalf("call set_agentic_context: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected set_agentic_context success, got %#v", result.StructuredContent)
	}

	result, err = session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_code",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "section-main",
			"code":            "def sorted(iterable):\n    return iterable\n",
		},
	})
	if err != nil {
		t.Fatalf("call set_code: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected set_code success, got %#v", result.StructuredContent)
	}

	assertAppBoundSetCodeState(t, app, "def sorted(iterable):\n    return iterable\n")
}

func TestAppIDEMCPServerSupportsTemporaryIDsForSetCodeOverAuthenticatedSSE(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
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
	seedAppWatchCodeBoundSectionProject(t, app)
	writeAppTemporaryIDMap(t, filepath.Join(cfg.Paths.RuntimeRoot, "temporary_id_map.json"), map[string]string{
		"project-alpha": "11",
		"section-main":  "14",
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
			"allowUnscoped":   true,
		},
		Name: "set_code",
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "14",
			"code":            "def sorted(iterable):\n    return iterable\n",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_code: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id set_code success, got %#v", result.StructuredContent)
	}

	assertAppBoundSetCodeState(t, app, "def sorted(iterable):\n    return iterable\n")
}

func TestAppIDEMCPServerSupportsSetTopLevelSectionLayoutOverAuthenticatedSSE(t *testing.T) {
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
	if _, _, err := app.ProjectStates().Main().CreateViewMode(context.Background(), "project-alpha"); err != nil {
		t.Fatalf("seed view mode: %v", err)
	}

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
		Name: "set_top_level_section_layout",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"topLevelSections": map[string]any{
				"allowed-section": map[string]any{
					"x":      420.5,
					"y":      205.25,
					"zIndex": 5,
					"w":      680.0,
					"h":      340.0,
				},
			},
		},
		Meta: sdkmcp.Meta{
			"projectConfigId": "project-alpha",
			"chatId":          "chat-1",
			"sectionId":       "chat-section",
		},
	})
	if err != nil {
		t.Fatalf("call set_top_level_section_layout: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected set_top_level_section_layout success, got %#v", result.StructuredContent)
	}

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_top_level_section_layout: %v", err)
	}
	layout := project.TopLevelSections["allowed-section"]
	if layout.X != 420.5 || layout.Y != 205.25 || layout.ZIndex != 5 {
		t.Fatalf("unexpected persisted app layout %#v", layout)
	}
	if layout.W == nil || *layout.W != 680.0 {
		t.Fatalf("expected persisted width 680, got %#v", layout.W)
	}
	if layout.H == nil || *layout.H != 340.0 {
		t.Fatalf("expected persisted height 340, got %#v", layout.H)
	}

	result, err = session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_top_level_section_layout",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"topLevelSections": map[string]any{
				"blocked-section": map[string]any{
					"x": 1.0,
					"y": 2.0,
				},
			},
		},
		Meta: sdkmcp.Meta{
			"projectConfigId": "project-alpha",
			"chatId":          "chat-1",
			"sectionId":       "chat-section",
		},
	})
	if err != nil {
		t.Fatalf("call blocked set_top_level_section_layout: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected blocked set_top_level_section_layout to fail")
	}
	payload := mustStructuredMapValue(t, result.StructuredContent)
	if payload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", payload["reason"])
	}
	temporaryMap := readAppTemporaryIDMap(t, filepath.Join(cfg.Paths.RuntimeRoot, "temporary_id_map.json"))
	if ids := mustStructuredStringListValue(t, payload["blockedSectionIds"]); len(ids) != 1 || ids[0] != temporaryMap["blocked-section"] {
		t.Fatalf("expected blockedSectionIds [%q], got %#v", temporaryMap["blocked-section"], ids)
	}
}

func TestAppIDEMCPServerSupportsTemporaryIDsForSetTopLevelSectionLayoutOverAuthenticatedSSE(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)
	writeAppTemporaryIDMap(t, filepath.Join(cfg.Paths.RuntimeRoot, "temporary_id_map.json"), map[string]string{
		"project-alpha":   "11",
		"chat-1":          "12",
		"chat-section":    "13",
		"allowed-section": "14",
		"blocked-section": "16",
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
	if _, _, err := app.ProjectStates().Main().CreateViewMode(context.Background(), "project-alpha"); err != nil {
		t.Fatalf("seed view mode: %v", err)
	}

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
		Name: "set_top_level_section_layout",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"chatId":          "12",
			"sectionId":       "13",
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"topLevelSections": map[string]any{
				"14": map[string]any{
					"x":      515.0,
					"y":      245.0,
					"zIndex": 8,
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_top_level_section_layout: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id set_top_level_section_layout success, got %#v", result.StructuredContent)
	}

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id set_top_level_section_layout: %v", err)
	}
	layout := project.TopLevelSections["allowed-section"]
	if layout.X != 515.0 || layout.Y != 245.0 || layout.ZIndex != 8 {
		t.Fatalf("expected translated app layout update, got %#v", layout)
	}
}

func TestAppIDEMCPServerSupportsAutoLayoutTopLevelSectionsOverAuthenticatedSSE(t *testing.T) {
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
	if _, _, err := app.ProjectStates().Main().CreateViewMode(context.Background(), "project-alpha"); err != nil {
		t.Fatalf("seed view mode: %v", err)
	}
	if _, err := app.ProjectStates().Main().SetTopLevelSectionLayout(context.Background(), "project-alpha", map[string]projectstate.TopLevelSectionLayout{
		"chat-section":    {X: 10, Y: 10, ZIndex: 0},
		"allowed-section": {X: 15, Y: 15, ZIndex: 1},
		"blocked-section": {X: 20, Y: 20, ZIndex: 2},
	}); err != nil {
		t.Fatalf("seed app auto-layout top-level layouts: %v", err)
	}

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before app auto layout: %v", err)
	}
	beforeAllowed := project.TopLevelSections["allowed-section"]
	beforeBlocked := project.TopLevelSections["blocked-section"]

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
		Name: "auto_layout_top_level_sections",
		Meta: sdkmcp.Meta{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"margin":          10,
		},
	})
	if err != nil {
		t.Fatalf("call auto_layout_top_level_sections: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected auto_layout_top_level_sections success, got %#v", result.StructuredContent)
	}

	project, err = app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after app auto layout: %v", err)
	}
	afterAllowed := project.TopLevelSections["allowed-section"]
	afterBlocked := project.TopLevelSections["blocked-section"]
	if afterAllowed == beforeAllowed && afterBlocked == beforeBlocked {
		t.Fatalf(
			"expected app auto layout to rewrite layouts, allowed before=%#v after=%#v blocked before=%#v after=%#v",
			beforeAllowed,
			afterAllowed,
			beforeBlocked,
			afterBlocked,
		)
	}
}

func TestAppIDEMCPServerSupportsTemporaryIDsForAutoLayoutTopLevelSectionsOverAuthenticatedSSE(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)
	writeAppTemporaryIDMap(t, filepath.Join(cfg.Paths.RuntimeRoot, "temporary_id_map.json"), map[string]string{
		"project-alpha": "11",
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
	if _, _, err := app.ProjectStates().Main().CreateViewMode(context.Background(), "project-alpha"); err != nil {
		t.Fatalf("seed view mode: %v", err)
	}
	if _, err := app.ProjectStates().Main().SetTopLevelSectionLayout(context.Background(), "project-alpha", map[string]projectstate.TopLevelSectionLayout{
		"chat-section":    {X: 10, Y: 10, ZIndex: 0},
		"allowed-section": {X: 15, Y: 15, ZIndex: 1},
		"blocked-section": {X: 20, Y: 20, ZIndex: 2},
	}); err != nil {
		t.Fatalf("seed temp-id app auto-layout top-level layouts: %v", err)
	}

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before temp-id app auto layout: %v", err)
	}
	beforeAllowed := project.TopLevelSections["allowed-section"]
	beforeBlocked := project.TopLevelSections["blocked-section"]

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

	project, err = app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id app auto layout: %v", err)
	}
	afterAllowed := project.TopLevelSections["allowed-section"]
	afterBlocked := project.TopLevelSections["blocked-section"]
	if afterAllowed == beforeAllowed && afterBlocked == beforeBlocked {
		t.Fatalf(
			"expected temp-id app auto layout to rewrite layouts, allowed before=%#v after=%#v blocked before=%#v after=%#v",
			beforeAllowed,
			afterAllowed,
			beforeBlocked,
			afterBlocked,
		)
	}
}

func TestAppIDEMCPServerSupportsSetShowParamDisplayNamesOverAuthenticatedSSE(t *testing.T) {
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

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before app show-param toggle: %v", err)
	}
	if project.ShowParamDisplayNames {
		t.Fatal("expected ShowParamDisplayNames=false before app mutation")
	}

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
		Name: "set_show_param_display_names",
		Meta: sdkmcp.Meta{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId":       "project-alpha",
			"showParamDisplayNames": true,
		},
	})
	if err != nil {
		t.Fatalf("call set_show_param_display_names: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected set_show_param_display_names success, got %#v", result.StructuredContent)
	}

	project, err = app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after app show-param toggle: %v", err)
	}
	if !project.ShowParamDisplayNames {
		t.Fatal("expected ShowParamDisplayNames=true after app mutation")
	}
}

func TestAppIDEMCPServerSupportsTemporaryIDsForSetShowParamDisplayNamesOverAuthenticatedSSE(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)
	writeAppTemporaryIDMap(t, filepath.Join(cfg.Paths.RuntimeRoot, "temporary_id_map.json"), map[string]string{
		"project-alpha": "11",
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

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before temp-id app show-param toggle: %v", err)
	}
	if project.ShowParamDisplayNames {
		t.Fatal("expected ShowParamDisplayNames=false before temp-id app mutation")
	}

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

	project, err = app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id app show-param toggle: %v", err)
	}
	if !project.ShowParamDisplayNames {
		t.Fatal("expected ShowParamDisplayNames=true after temp-id app mutation")
	}
}

func TestAppIDEMCPServerSupportsSetSectionTagColorOverAuthenticatedSSE(t *testing.T) {
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

	result, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_tag_color",
		Meta: sdkmcp.Meta{
			"projectConfigId": "project-alpha",
			"chatId":          "chat-1",
			"sectionId":       "chat-section",
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-section",
			"tagColor":        "#123456",
		},
	})
	if err != nil {
		t.Fatalf("call set_section_tag_color: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected set_section_tag_color success, got %#v", result.StructuredContent)
	}

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after app set_section_tag_color: %v", err)
	}
	allowedPayload := mustDecodedProjectPayloadValue(t, project.Sections["allowed-section"].SharedModifier)
	if got := allowedPayload["tagColor"]; got != "#123456" {
		t.Fatalf("expected allowed-section tagColor #123456 after app mutation, got %#v", got)
	}
}

func TestAppIDEMCPServerSupportsTemporaryIDsForSetSectionTagColorOverAuthenticatedSSE(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
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
		Name: "set_section_tag_color",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"chatId":          "12",
			"sectionId":       "13",
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "14",
			"tagColor":        "#123456",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_section_tag_color: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id set_section_tag_color success, got %#v", result.StructuredContent)
	}

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id app set_section_tag_color: %v", err)
	}
	allowedPayload := mustDecodedProjectPayloadValue(t, project.Sections["allowed-section"].SharedModifier)
	if got := allowedPayload["tagColor"]; got != "#123456" {
		t.Fatalf("expected allowed-section tagColor #123456 after temp-id app mutation, got %#v", got)
	}
}

func TestAppIDEMCPServerSupportsTogglePositionLocksOverAuthenticatedSSE(t *testing.T) {
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

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before app toggle_position_locks: %v", err)
	}
	if len(project.Sections["allowed-section"].SharedModifier) != 0 {
		allowedPayload := mustDecodedProjectPayloadValue(t, project.Sections["allowed-section"].SharedModifier)
		if locked, _ := allowedPayload["positionAndSizeLocked"].(bool); locked {
			t.Fatal("expected allowed-section to start unlocked")
		}
	}
	if len(project.Sections["blocked-section"].SharedModifier) != 0 {
		blockedPayload := mustDecodedProjectPayloadValue(t, project.Sections["blocked-section"].SharedModifier)
		if locked, _ := blockedPayload["positionAndSizeLocked"].(bool); locked {
			t.Fatal("expected blocked-section to start unlocked")
		}
	}

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
		Name: "toggle_position_locks",
		Meta: sdkmcp.Meta{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionIds":      []string{"allowed-section", "blocked-section"},
		},
	})
	if err != nil {
		t.Fatalf("call toggle_position_locks: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected toggle_position_locks success, got %#v", result.StructuredContent)
	}

	project, err = app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after app toggle_position_locks: %v", err)
	}
	allowedPayload := mustDecodedProjectPayloadValue(t, project.Sections["allowed-section"].SharedModifier)
	blockedPayload := mustDecodedProjectPayloadValue(t, project.Sections["blocked-section"].SharedModifier)
	if locked, _ := allowedPayload["positionAndSizeLocked"].(bool); !locked {
		t.Fatal("expected allowed-section to be locked after app mutation")
	}
	if locked, _ := blockedPayload["positionAndSizeLocked"].(bool); !locked {
		t.Fatal("expected blocked-section to be locked after app mutation")
	}
}

func TestAppIDEMCPServerSupportsTemporaryIDsForTogglePositionLocksOverAuthenticatedSSE(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)
	writeAppTemporaryIDMap(t, filepath.Join(cfg.Paths.RuntimeRoot, "temporary_id_map.json"), map[string]string{
		"project-alpha":   "11",
		"allowed-section": "14",
		"blocked-section": "16",
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

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before temp-id app toggle_position_locks: %v", err)
	}
	if len(project.Sections["allowed-section"].SharedModifier) != 0 {
		allowedPayload := mustDecodedProjectPayloadValue(t, project.Sections["allowed-section"].SharedModifier)
		if locked, _ := allowedPayload["positionAndSizeLocked"].(bool); locked {
			t.Fatal("expected allowed-section to start unlocked")
		}
	}
	if len(project.Sections["blocked-section"].SharedModifier) != 0 {
		blockedPayload := mustDecodedProjectPayloadValue(t, project.Sections["blocked-section"].SharedModifier)
		if locked, _ := blockedPayload["positionAndSizeLocked"].(bool); locked {
			t.Fatal("expected blocked-section to start unlocked")
		}
	}

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

	project, err = app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id app toggle_position_locks: %v", err)
	}
	allowedPayload := mustDecodedProjectPayloadValue(t, project.Sections["allowed-section"].SharedModifier)
	blockedPayload := mustDecodedProjectPayloadValue(t, project.Sections["blocked-section"].SharedModifier)
	if locked, _ := allowedPayload["positionAndSizeLocked"].(bool); !locked {
		t.Fatal("expected allowed-section to be locked after temp-id app mutation")
	}
	if locked, _ := blockedPayload["positionAndSizeLocked"].(bool); !locked {
		t.Fatal("expected blocked-section to be locked after temp-id app mutation")
	}
}

func TestAppIDEMCPServerSupportsToggleMinimizedOverAuthenticatedSSE(t *testing.T) {
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

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before app toggle_minimized: %v", err)
	}
	if len(project.Sections["allowed-section"].SharedModifier) != 0 {
		allowedPayload := mustDecodedProjectPayloadValue(t, project.Sections["allowed-section"].SharedModifier)
		if minimized, _ := allowedPayload["isMinimized"].(bool); minimized {
			t.Fatal("expected allowed-section to start unminimized")
		}
	}

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
		Name: "toggle_minimized",
		Meta: sdkmcp.Meta{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-section",
		},
	})
	if err != nil {
		t.Fatalf("call toggle_minimized: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected toggle_minimized success, got %#v", result.StructuredContent)
	}

	project, err = app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after app toggle_minimized: %v", err)
	}
	allowedPayload := mustDecodedProjectPayloadValue(t, project.Sections["allowed-section"].SharedModifier)
	if minimized, _ := allowedPayload["isMinimized"].(bool); !minimized {
		t.Fatal("expected allowed-section to be minimized after app mutation")
	}
}

func TestAppIDEMCPServerSupportsTemporaryIDsForToggleMinimizedOverAuthenticatedSSE(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)
	writeAppTemporaryIDMap(t, filepath.Join(cfg.Paths.RuntimeRoot, "temporary_id_map.json"), map[string]string{
		"project-alpha":   "11",
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

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before temp-id app toggle_minimized: %v", err)
	}
	if len(project.Sections["allowed-section"].SharedModifier) != 0 {
		allowedPayload := mustDecodedProjectPayloadValue(t, project.Sections["allowed-section"].SharedModifier)
		if minimized, _ := allowedPayload["isMinimized"].(bool); minimized {
			t.Fatal("expected allowed-section to start unminimized")
		}
	}

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

	project, err = app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id app toggle_minimized: %v", err)
	}
	allowedPayload := mustDecodedProjectPayloadValue(t, project.Sections["allowed-section"].SharedModifier)
	if minimized, _ := allowedPayload["isMinimized"].(bool); !minimized {
		t.Fatal("expected allowed-section to be minimized after temp-id app mutation")
	}
}

func TestAppIDEMCPServerSupportsStructuralCreateOverAuthenticatedSSE(t *testing.T) {
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

	result, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_agentic_context",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   true,
		},
	})
	if err != nil {
		t.Fatalf("call set_agentic_context unscoped: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected unscoped set_agentic_context success, got %#v", result.StructuredContent)
	}

	beforeProject, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before structural create: %v", err)
	}
	beforeSectionIDs := map[string]struct{}{}
	for sectionID := range beforeProject.Sections {
		beforeSectionIDs[sectionID] = struct{}{}
	}

	result, err = session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "create_top_level_section",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"implType":        "Dict",
		},
	})
	if err != nil {
		t.Fatalf("call create_top_level_section: %v", err)
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
		t.Fatalf("project by id after structural create: %v", err)
	}
	var canonicalSectionID string
	for currentSectionID := range project.Sections {
		if _, existed := beforeSectionIDs[currentSectionID]; !existed {
			canonicalSectionID = currentSectionID
			break
		}
	}
	if canonicalSectionID == "" {
		t.Fatalf("expected one new canonical section, got %#v", project.Sections)
	}
	if sectionID == canonicalSectionID {
		t.Fatalf("expected translated section id to differ from canonical %q", canonicalSectionID)
	}
	if _, ok := project.Sections[sectionID]; ok {
		t.Fatalf("did not expect translated section id %q to be a canonical project key", sectionID)
	}
}

func TestAppIDEMCPServerSupportsStructuralChildCreateOverAuthenticatedSSE(t *testing.T) {
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

	result, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_agentic_context",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   true,
		},
	})
	if err != nil {
		t.Fatalf("call set_agentic_context unscoped: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected unscoped set_agentic_context success, got %#v", result.StructuredContent)
	}

	beforeProject, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before structural child create: %v", err)
	}
	beforeSectionIDs := map[string]struct{}{}
	for sectionID := range beforeProject.Sections {
		beforeSectionIDs[sectionID] = struct{}{}
	}

	result, err = session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "create_child_sections",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"parentId":        "allowed-section",
			"implType":        "Terminal",
			"numChildren":     1,
		},
	})
	if err != nil {
		t.Fatalf("call create_child_sections: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected create_child_sections success, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMapValue(t, result.StructuredContent)
	sectionIDs := mustStructuredStringListValue(t, payload["sectionIds"])
	if len(sectionIDs) != 1 || strings.TrimSpace(sectionIDs[0]) == "" {
		t.Fatalf("expected one created child section id, got %#v", sectionIDs)
	}

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after structural child create: %v", err)
	}
	var canonicalSectionID string
	for currentSectionID := range project.Sections {
		if _, existed := beforeSectionIDs[currentSectionID]; !existed {
			canonicalSectionID = currentSectionID
			break
		}
	}
	if canonicalSectionID == "" {
		t.Fatalf("expected one new canonical child section, got %#v", project.Sections)
	}
	if sectionIDs[0] == canonicalSectionID {
		t.Fatalf("expected translated child id to differ from canonical %q", canonicalSectionID)
	}
	if _, ok := project.Sections[sectionIDs[0]]; ok {
		t.Fatalf("did not expect translated child id %q to be a canonical project key", sectionIDs[0])
	}
	createdSection := project.Sections[canonicalSectionID]
	if createdSection.ParentSectionID != "allowed-section" {
		t.Fatalf("expected created child parent allowed-section, got %#v", createdSection)
	}
}

func TestAppIDEMCPServerSupportsIncrementerStructuralChildCreateOverAuthenticatedSSE(t *testing.T) {
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

	result, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_agentic_context",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   true,
		},
	})
	if err != nil {
		t.Fatalf("call set_agentic_context unscoped: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected unscoped set_agentic_context success, got %#v", result.StructuredContent)
	}

	beforeProject, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before incrementer structural child create: %v", err)
	}
	beforeSectionIDs := map[string]struct{}{}
	for sectionID := range beforeProject.Sections {
		beforeSectionIDs[sectionID] = struct{}{}
	}

	result, err = session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "create_child_sections_via_incrementer",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"calledBy":        "allowed-section",
			"implType":        "Terminal",
			"numChildren":     1,
		},
	})
	if err != nil {
		t.Fatalf("call create_child_sections_via_incrementer: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected create_child_sections_via_incrementer success, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMapValue(t, result.StructuredContent)
	sectionIDs := mustStructuredStringListValue(t, payload["sectionIds"])
	if len(sectionIDs) != 1 || strings.TrimSpace(sectionIDs[0]) == "" {
		t.Fatalf("expected one created incrementer child section id, got %#v", sectionIDs)
	}

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after incrementer structural child create: %v", err)
	}
	var canonicalSectionID string
	for currentSectionID := range project.Sections {
		if _, existed := beforeSectionIDs[currentSectionID]; !existed {
			canonicalSectionID = currentSectionID
			break
		}
	}
	if canonicalSectionID == "" {
		t.Fatalf("expected one new canonical incrementer child section, got %#v", project.Sections)
	}
	if sectionIDs[0] == canonicalSectionID {
		t.Fatalf("expected translated incrementer child id to differ from canonical %q", canonicalSectionID)
	}
	if _, ok := project.Sections[sectionIDs[0]]; ok {
		t.Fatalf("did not expect translated incrementer child id %q to be a canonical project key", sectionIDs[0])
	}
	createdSection := project.Sections[canonicalSectionID]
	if createdSection.ParentSectionID != "allowed-section" {
		t.Fatalf("expected created incrementer child parent allowed-section, got %#v", createdSection)
	}
}

func TestAppIDEMCPServerSupportsSectionVariantCreateOverAuthenticatedSSE(t *testing.T) {
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

	result, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_agentic_context",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   true,
		},
	})
	if err != nil {
		t.Fatalf("call set_agentic_context unscoped: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected unscoped set_agentic_context success, got %#v", result.StructuredContent)
	}

	beforeProject, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before section-variant create: %v", err)
	}
	beforeVariantIDs := append([]string(nil), beforeProject.Sections["allowed-params-section"].VariantIDs...)

	result, err = session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "create_new_section_variant",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-params-section",
		},
	})
	if err != nil {
		t.Fatalf("call create_new_section_variant: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected create_new_section_variant success, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMapValue(t, result.StructuredContent)
	variantID, ok := payload["variantId"].(string)
	if !ok || strings.TrimSpace(variantID) == "" {
		t.Fatalf("expected created variant id, got %#v", payload["variantId"])
	}

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after section-variant create: %v", err)
	}
	afterVariantIDs := project.Sections["allowed-params-section"].VariantIDs
	if len(afterVariantIDs) != len(beforeVariantIDs)+1 {
		t.Fatalf("expected one new section variant, got before=%#v after=%#v", beforeVariantIDs, afterVariantIDs)
	}

	var canonicalVariantID string
	for _, currentVariantID := range afterVariantIDs {
		found := false
		for _, beforeVariantID := range beforeVariantIDs {
			if beforeVariantID == currentVariantID {
				found = true
				break
			}
		}
		if !found {
			canonicalVariantID = currentVariantID
			break
		}
	}
	if canonicalVariantID == "" {
		t.Fatalf("expected one new canonical section variant id, got %#v", afterVariantIDs)
	}
	if variantID == canonicalVariantID {
		t.Fatalf("expected translated variant id to differ from canonical %q", canonicalVariantID)
	}
	if _, ok := project.SectionVariants[variantID]; ok {
		t.Fatalf("did not expect translated variant id %q to be a canonical project key", variantID)
	}
	if got := project.SectionVariantMap["allowed-params-section"]; got != canonicalVariantID {
		t.Fatalf("expected active allowed-params-section variant %q, got %q", canonicalVariantID, got)
	}
	if len(project.CodeObjs["allowed-param"].VariantIDs) != 2 {
		t.Fatalf("expected allowed-param to gain one code-object variant, got %#v", project.CodeObjs["allowed-param"].VariantIDs)
	}
}

func TestAppIDEMCPServerSupportsStructuralDeleteOverAuthenticatedSSE(t *testing.T) {
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

	result, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_agentic_context",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   true,
		},
	})
	if err != nil {
		t.Fatalf("call set_agentic_context unscoped: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected unscoped set_agentic_context success, got %#v", result.StructuredContent)
	}

	result, err = session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "delete_sections",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionIds":      []string{"allowed-params-section"},
		},
	})
	if err != nil {
		t.Fatalf("call delete_sections: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected delete_sections success, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMapValue(t, result.StructuredContent)
	sectionIDs := mustStructuredStringListValue(t, payload["sectionIds"])
	if len(sectionIDs) != 1 || strings.TrimSpace(sectionIDs[0]) == "" {
		t.Fatalf("expected one translated deleted section id, got %#v", sectionIDs)
	}
	if sectionIDs[0] == "allowed-params-section" {
		t.Fatalf("expected translated deleted section id to differ from canonical allowed-params-section")
	}

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after structural delete: %v", err)
	}
	if _, ok := project.Sections["allowed-params-section"]; ok {
		t.Fatalf("expected allowed-params-section to be removed, got %#v", project.Sections)
	}
	if _, ok := project.CodeObjs["allowed-param"]; ok {
		t.Fatalf("expected allowed-param to be pruned, got %#v", project.CodeObjs)
	}
}

func TestAppIDEMCPServerSupportsDecrementerStructuralDeleteOverAuthenticatedSSE(t *testing.T) {
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

	canonicalChildID := mustSeedAppChildSection(t, app.ProjectStates().Main(), "allowed-section")

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
		Name: "set_agentic_context",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   true,
		},
	})
	if err != nil {
		t.Fatalf("call set_agentic_context unscoped: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected unscoped set_agentic_context success, got %#v", result.StructuredContent)
	}

	result, err = session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "delete_child_sections_via_decrementer",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"calledBy":        "allowed-section",
			"numChildren":     1,
		},
	})
	if err != nil {
		t.Fatalf("call delete_child_sections_via_decrementer: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected delete_child_sections_via_decrementer success, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMapValue(t, result.StructuredContent)
	sectionIDs := mustStructuredStringListValue(t, payload["sectionIds"])
	if len(sectionIDs) != 1 || strings.TrimSpace(sectionIDs[0]) == "" {
		t.Fatalf("expected one translated deleted child section id, got %#v", sectionIDs)
	}
	if sectionIDs[0] == canonicalChildID {
		t.Fatalf("expected translated deleted child id to differ from canonical %q", canonicalChildID)
	}

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after decrementer structural delete: %v", err)
	}
	if _, ok := project.Sections[canonicalChildID]; ok {
		t.Fatalf("expected %q to be removed, got %#v", canonicalChildID, project.Sections)
	}
	if _, ok := project.Sections[sectionIDs[0]]; ok {
		t.Fatalf("did not expect translated deleted child id %q to be a canonical project key", sectionIDs[0])
	}

	parentPayload := mustStructuredMapValue(t, project.SectionImpls["allowed-impl"].Payload)
	children := mustStructuredStringListValue(t, parentPayload["children"])
	if len(children) != 0 {
		t.Fatalf("expected allowed-section children to be empty after decrementer delete, got %#v", children)
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
	if payload.Servers[0].ToolCount != 32 {
		t.Fatalf("expected tool count 32, got %d", payload.Servers[0].ToolCount)
	}
	if len(payload.ExternalServers) != 0 {
		t.Fatalf("expected no external servers, got %d", len(payload.ExternalServers))
	}
}

func TestAppIDEMCPToolCallRouteSupportsAgenticContextBody(t *testing.T) {
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

	client := mustAuthenticatedMCPHTTPClient(t, app, server.URL)
	beforeProject, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before route structural create: %v", err)
	}
	beforeSectionIDs := map[string]struct{}{}
	for sectionID := range beforeProject.Sections {
		beforeSectionIDs[sectionID] = struct{}{}
	}

	response, err := client.Post(
		server.URL+httpapi.RouteMCPToolCall,
		"application/json",
		strings.NewReader(`{
			"tool":"get_latest_project_state_summary",
			"arguments":{"projectConfigId":"project-alpha"},
			"agenticContext":{
				"projectConfigId":"project-alpha",
				"chatId":"chat-1",
				"sectionId":"chat-section"
			}
		}`),
	)
	if err != nil {
		t.Fatalf("post mcp tool call route: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	var payload struct {
		StructuredContent any  `json:"structuredContent"`
		IsError           bool `json:"isError"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode tool call response: %v", err)
	}
	if payload.IsError {
		t.Fatalf("expected scoped tool call success, got %#v", payload.StructuredContent)
	}
	summary := mustStructuredMapValue(t, payload.StructuredContent)
	projectConfig := mustStructuredMapValue(t, summary["projectConfig"])
	sectionVariantMap := mustStructuredMapValue(t, projectConfig["sectionVariantMap"])
	if _, ok := sectionVariantMap["blocked-section"]; ok {
		t.Fatalf("did not expect blocked-section in scoped summary, got %#v", sectionVariantMap)
	}
	if _, ok := sectionVariantMap["blocked-params-section"]; ok {
		t.Fatalf("did not expect blocked-params-section in scoped summary, got %#v", sectionVariantMap)
	}
}

func TestAppIDEMCPToolCallRouteSupportsScopedWriteMutation(t *testing.T) {
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
	beforeProject, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before route structural create: %v", err)
	}
	beforeSectionIDs := map[string]struct{}{}
	for sectionID := range beforeProject.Sections {
		beforeSectionIDs[sectionID] = struct{}{}
	}

	response, err := client.Post(
		server.URL+httpapi.RouteMCPToolCall,
		"application/json",
		strings.NewReader(`{
			"tool":"set_code_section_diagnostics_mute",
			"arguments":{"projectConfigId":"project-alpha","sectionId":"allowed-section","mute":true},
			"agenticContext":{
				"projectConfigId":"project-alpha",
				"chatId":"chat-1",
				"sectionId":"chat-section"
			}
		}`),
	)
	if err != nil {
		t.Fatalf("post scoped write tool call route: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	var payload struct {
		StructuredContent any  `json:"structuredContent"`
		IsError           bool `json:"isError"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode tool call response: %v", err)
	}
	if payload.IsError {
		t.Fatalf("expected scoped write success, got %#v", payload.StructuredContent)
	}

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route scoped write: %v", err)
	}
	ignoreState, err := project.CodeSectionDiagnosticsIgnoreStateForSection("allowed-section")
	if err != nil {
		t.Fatalf("ignore state after route scoped write: %v", err)
	}
	if !ignoreState.Muted {
		t.Fatalf("expected allowed-section to be muted, got %#v", ignoreState)
	}

	response, err = client.Post(
		server.URL+httpapi.RouteMCPToolCall,
		"application/json",
		strings.NewReader(`{
			"tool":"set_code_obj_name",
			"arguments":{"projectConfigId":"project-alpha","codeObjId":"allowed-param","name":"user-id@v2"},
			"agenticContext":{
				"projectConfigId":"project-alpha",
				"chatId":"chat-1",
				"sectionId":"chat-section"
			}
		}`),
	)
	if err != nil {
		t.Fatalf("post set_code_obj_name tool call route: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode set_code_obj_name tool call response: %v", err)
	}
	if payload.IsError {
		t.Fatalf("expected set_code_obj_name success, got %#v", payload.StructuredContent)
	}

	project, err = app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route set_code_obj_name: %v", err)
	}
	if got := project.CodeObjs["allowed-param"].Name; got != "user-id@v2" {
		t.Fatalf("expected code object name user-id@v2, got %q", got)
	}

	response, err = client.Post(
		server.URL+httpapi.RouteMCPToolCall,
		"application/json",
		strings.NewReader(`{
			"tool":"set_param_name_and_value",
			"arguments":{"projectConfigId":"project-alpha","sectionId":"allowed-params-section","codeObjId":"allowed-param","name":"user-id@v3","value":"combined"},
			"agenticContext":{
				"projectConfigId":"project-alpha",
				"chatId":"chat-1",
				"sectionId":"chat-section"
			}
		}`),
	)
	if err != nil {
		t.Fatalf("post set_param_name_and_value tool call route: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode set_param_name_and_value tool call response: %v", err)
	}
	if payload.IsError {
		t.Fatalf("expected set_param_name_and_value success, got %#v", payload.StructuredContent)
	}

	project, err = app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route set_param_name_and_value: %v", err)
	}
	if got := project.CodeObjs["allowed-param"].Name; got != "user-id@v3" {
		t.Fatalf("expected code object name user-id@v3, got %q", got)
	}
	paramPayload, _, _, _, err := project.ResolveSectionCodeObject("allowed-params-section", "allowed-param")
	if err != nil {
		t.Fatalf("resolve allowed-param after route set_param_name_and_value: %v", err)
	}
	if got := paramPayload["value"]; got != "combined" {
		t.Fatalf("expected combined param value, got %#v", got)
	}

	response, err = client.Post(
		server.URL+httpapi.RouteMCPToolCall,
		"application/json",
		strings.NewReader(`{
			"tool":"set_code_section_diagnostic_code_suppression",
			"arguments":{"projectConfigId":"project-alpha","sectionId":"allowed-section","code":"reportFoo","suppress":true},
			"agenticContext":{
				"projectConfigId":"project-alpha",
				"chatId":"chat-1",
				"sectionId":"chat-section"
			}
		}`),
	)
	if err != nil {
		t.Fatalf("post scoped suppression tool call route: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode scoped suppression tool call response: %v", err)
	}
	if payload.IsError {
		t.Fatalf("expected scoped suppression success, got %#v", payload.StructuredContent)
	}

	project, err = app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route scoped suppression: %v", err)
	}
	ignoreState, err = project.CodeSectionDiagnosticsIgnoreStateForSection("allowed-section")
	if err != nil {
		t.Fatalf("ignore state after route scoped suppression: %v", err)
	}
	if len(ignoreState.SuppressedCodes) != 1 || ignoreState.SuppressedCodes[0] != "reportFoo" {
		t.Fatalf("expected reportFoo suppression, got %#v", ignoreState.SuppressedCodes)
	}

	response, err = client.Post(
		server.URL+httpapi.RouteMCPToolCall,
		"application/json",
		strings.NewReader(`{
			"tool":"set_section_name",
			"arguments":{"projectConfigId":"project-alpha","sectionId":"allowed-section","name":"Allowed Renamed"},
			"agenticContext":{
				"projectConfigId":"project-alpha",
				"chatId":"chat-1",
				"sectionId":"chat-section"
			}
		}`),
	)
	if err != nil {
		t.Fatalf("post set_section_name tool call route: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode set_section_name tool call response: %v", err)
	}
	if payload.IsError {
		t.Fatalf("expected set_section_name success, got %#v", payload.StructuredContent)
	}

	project, err = app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route set_section_name: %v", err)
	}
	if got := project.Sections["allowed-section"].Name; got != "Allowed Renamed" {
		t.Fatalf("expected renamed section name, got %q", got)
	}

	response, err = client.Post(
		server.URL+httpapi.RouteMCPToolCall,
		"application/json",
		strings.NewReader(`{
			"tool":"set_param_entered_value",
			"arguments":{"projectConfigId":"project-alpha","sectionId":"allowed-params-section","paramInfoId":"allowed-param","value":"updated"},
			"agenticContext":{
				"projectConfigId":"project-alpha",
				"chatId":"chat-1",
				"sectionId":"chat-section"
			}
		}`),
	)
	if err != nil {
		t.Fatalf("post set_param_entered_value tool call route: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode set_param_entered_value tool call response: %v", err)
	}
	if payload.IsError {
		t.Fatalf("expected set_param_entered_value success, got %#v", payload.StructuredContent)
	}

	project, err = app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route set_param_entered_value: %v", err)
	}
	paramPayload, _, _, _, err = project.ResolveSectionCodeObject("allowed-params-section", "allowed-param")
	if err != nil {
		t.Fatalf("resolve allowed-param after route set_param_entered_value: %v", err)
	}
	if got := paramPayload["value"]; got != "updated" {
		t.Fatalf("expected updated param value, got %#v", got)
	}

	response, err = client.Post(
		server.URL+httpapi.RouteMCPToolCall,
		"application/json",
		strings.NewReader(`{
			"tool":"set_type_error_ignore",
			"arguments":{"projectConfigId":"project-alpha","sectionId":"allowed-params-section","paramInfoId":"allowed-param","ignoreTypeErrors":true},
			"agenticContext":{
				"projectConfigId":"project-alpha",
				"chatId":"chat-1",
				"sectionId":"chat-section"
			}
		}`),
	)
	if err != nil {
		t.Fatalf("post set_type_error_ignore tool call route: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode set_type_error_ignore tool call response: %v", err)
	}
	if payload.IsError {
		t.Fatalf("expected set_type_error_ignore success, got %#v", payload.StructuredContent)
	}

	project, err = app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route set_type_error_ignore: %v", err)
	}
	typeErrorIgnoreState, err := project.TypeErrorIgnoreStateForSection("allowed-params-section")
	if err != nil {
		t.Fatalf("type error ignore state after route set_type_error_ignore: %v", err)
	}
	if !typeErrorIgnoreState.Params["allowed-param"] {
		t.Fatalf("expected allowed-param type-error ignore state, got %#v", typeErrorIgnoreState)
	}

	response, err = client.Post(
		server.URL+httpapi.RouteMCPToolCall,
		"application/json",
		strings.NewReader(`{
			"tool":"set_code_obj_display_name",
			"arguments":{"projectConfigId":"project-alpha","codeObjId":"allowed-param","displayName":"Height"},
			"agenticContext":{
				"projectConfigId":"project-alpha",
				"chatId":"chat-1",
				"sectionId":"chat-section"
			}
		}`),
	)
	if err != nil {
		t.Fatalf("post set_code_obj_display_name tool call route: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode set_code_obj_display_name tool call response: %v", err)
	}
	if payload.IsError {
		t.Fatalf("expected set_code_obj_display_name success, got %#v", payload.StructuredContent)
	}

	project, err = app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route set_code_obj_display_name: %v", err)
	}
	if got := project.CodeObjs["allowed-param"].DisplayName; got != "Height" {
		t.Fatalf("expected display name Height, got %q", got)
	}
}

func TestAppIDEMCPToolCallRouteSupportsSetCode(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
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
	seedAppWatchCodeBoundSectionProject(t, app)

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := mustAuthenticatedMCPHTTPClient(t, app, server.URL)
	response, err := client.Post(
		server.URL+httpapi.RouteMCPToolCall,
		"application/json",
		strings.NewReader(`{
			"tool":"set_code",
			"arguments":{"projectConfigId":"project-alpha","sectionId":"section-main","code":"def sorted(iterable):\n    return iterable\n"},
			"agenticContext":{
				"projectConfigId":"project-alpha",
				"allowUnscoped":true
			}
		}`),
	)
	if err != nil {
		t.Fatalf("post set_code tool call route: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	var payload struct {
		StructuredContent any  `json:"structuredContent"`
		IsError           bool `json:"isError"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode set_code tool call response: %v", err)
	}
	if payload.IsError {
		t.Fatalf("expected set_code success, got %#v", payload.StructuredContent)
	}

	assertAppBoundSetCodeState(t, app, "def sorted(iterable):\n    return iterable\n")
}

func TestAppIDEMCPToolCallRouteSupportsSetTopLevelSectionLayout(t *testing.T) {
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
	if _, _, err := app.ProjectStates().Main().CreateViewMode(context.Background(), "project-alpha"); err != nil {
		t.Fatalf("seed view mode: %v", err)
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := mustAuthenticatedMCPHTTPClient(t, app, server.URL)
	response, err := client.Post(
		server.URL+httpapi.RouteMCPToolCall,
		"application/json",
		strings.NewReader(`{
			"tool":"set_top_level_section_layout",
			"arguments":{
				"projectConfigId":"project-alpha",
				"topLevelSections":{
					"allowed-section":{"x":438,"y":214,"zIndex":4}
				}
			},
			"agenticContext":{
				"projectConfigId":"project-alpha",
				"chatId":"chat-1",
				"sectionId":"chat-section"
			}
		}`),
	)
	if err != nil {
		t.Fatalf("post set_top_level_section_layout tool call route: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	var payload struct {
		StructuredContent any  `json:"structuredContent"`
		IsError           bool `json:"isError"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode set_top_level_section_layout tool call response: %v", err)
	}
	if payload.IsError {
		t.Fatalf("expected set_top_level_section_layout success, got %#v", payload.StructuredContent)
	}

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route set_top_level_section_layout: %v", err)
	}
	layout := project.TopLevelSections["allowed-section"]
	if layout.X != 438 || layout.Y != 214 || layout.ZIndex != 4 {
		t.Fatalf("unexpected route-persisted app layout %#v", layout)
	}
}

func TestAppIDEMCPToolCallRouteSupportsAutoLayoutTopLevelSections(t *testing.T) {
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
	if _, _, err := app.ProjectStates().Main().CreateViewMode(context.Background(), "project-alpha"); err != nil {
		t.Fatalf("seed view mode: %v", err)
	}
	if _, err := app.ProjectStates().Main().SetTopLevelSectionLayout(context.Background(), "project-alpha", map[string]projectstate.TopLevelSectionLayout{
		"chat-section":    {X: 10, Y: 10, ZIndex: 0},
		"allowed-section": {X: 15, Y: 15, ZIndex: 1},
		"blocked-section": {X: 20, Y: 20, ZIndex: 2},
	}); err != nil {
		t.Fatalf("seed route app auto-layout top-level layouts: %v", err)
	}

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before route auto layout: %v", err)
	}
	beforeAllowed := project.TopLevelSections["allowed-section"]
	beforeBlocked := project.TopLevelSections["blocked-section"]

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := mustAuthenticatedMCPHTTPClient(t, app, server.URL)
	response, err := client.Post(
		server.URL+httpapi.RouteMCPToolCall,
		"application/json",
		strings.NewReader(`{
			"tool":"auto_layout_top_level_sections",
			"arguments":{
				"projectConfigId":"project-alpha",
				"margin":10
			},
			"agenticContext":{
				"projectConfigId":"project-alpha",
				"allowUnscoped":true
			}
		}`),
	)
	if err != nil {
		t.Fatalf("post auto_layout_top_level_sections tool call route: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	var payload struct {
		StructuredContent any  `json:"structuredContent"`
		IsError           bool `json:"isError"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode auto_layout_top_level_sections tool call response: %v", err)
	}
	if payload.IsError {
		t.Fatalf("expected auto_layout_top_level_sections success, got %#v", payload.StructuredContent)
	}

	project, err = app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route auto layout: %v", err)
	}
	afterAllowed := project.TopLevelSections["allowed-section"]
	afterBlocked := project.TopLevelSections["blocked-section"]
	if afterAllowed == beforeAllowed && afterBlocked == beforeBlocked {
		t.Fatalf(
			"expected route auto layout to rewrite layouts, allowed before=%#v after=%#v blocked before=%#v after=%#v",
			beforeAllowed,
			afterAllowed,
			beforeBlocked,
			afterBlocked,
		)
	}
}

func TestAppIDEMCPToolCallRouteSupportsSetSectionTagColor(t *testing.T) {
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
	response, err := client.Post(
		server.URL+httpapi.RouteMCPToolCall,
		"application/json",
		strings.NewReader(`{
			"tool":"set_section_tag_color",
			"arguments":{
				"projectConfigId":"project-alpha",
				"sectionId":"allowed-section",
				"tagColor":"#123456"
			},
			"agenticContext":{
				"projectConfigId":"project-alpha",
				"chatId":"chat-1",
				"sectionId":"chat-section"
			}
		}`),
	)
	if err != nil {
		t.Fatalf("post set_section_tag_color tool call route: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	var payload struct {
		StructuredContent any  `json:"structuredContent"`
		IsError           bool `json:"isError"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode set_section_tag_color tool call response: %v", err)
	}
	if payload.IsError {
		t.Fatalf("expected set_section_tag_color success, got %#v", payload.StructuredContent)
	}

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route set_section_tag_color: %v", err)
	}
	allowedPayload := mustDecodedProjectPayloadValue(t, project.Sections["allowed-section"].SharedModifier)
	if got := allowedPayload["tagColor"]; got != "#123456" {
		t.Fatalf("expected allowed-section tagColor #123456 after route mutation, got %#v", got)
	}
}

func TestAppIDEMCPToolCallRouteSupportsSetShowParamDisplayNames(t *testing.T) {
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

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before route show-param toggle: %v", err)
	}
	if project.ShowParamDisplayNames {
		t.Fatal("expected ShowParamDisplayNames=false before route mutation")
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := mustAuthenticatedMCPHTTPClient(t, app, server.URL)
	response, err := client.Post(
		server.URL+httpapi.RouteMCPToolCall,
		"application/json",
		strings.NewReader(`{
			"tool":"set_show_param_display_names",
			"arguments":{
				"projectConfigId":"project-alpha",
				"showParamDisplayNames":true
			},
			"agenticContext":{
				"projectConfigId":"project-alpha",
				"allowUnscoped":true
			}
		}`),
	)
	if err != nil {
		t.Fatalf("post set_show_param_display_names tool call route: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	var payload struct {
		StructuredContent any  `json:"structuredContent"`
		IsError           bool `json:"isError"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode set_show_param_display_names tool call response: %v", err)
	}
	if payload.IsError {
		t.Fatalf("expected set_show_param_display_names success, got %#v", payload.StructuredContent)
	}

	project, err = app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route show-param toggle: %v", err)
	}
	if !project.ShowParamDisplayNames {
		t.Fatal("expected ShowParamDisplayNames=true after route mutation")
	}
}

func TestAppIDEMCPToolCallRouteSupportsTogglePositionLocks(t *testing.T) {
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

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before route toggle_position_locks: %v", err)
	}
	if len(project.Sections["allowed-section"].SharedModifier) != 0 {
		allowedPayload := mustDecodedProjectPayloadValue(t, project.Sections["allowed-section"].SharedModifier)
		if locked, _ := allowedPayload["positionAndSizeLocked"].(bool); locked {
			t.Fatal("expected allowed-section to start unlocked")
		}
	}
	if len(project.Sections["blocked-section"].SharedModifier) != 0 {
		blockedPayload := mustDecodedProjectPayloadValue(t, project.Sections["blocked-section"].SharedModifier)
		if locked, _ := blockedPayload["positionAndSizeLocked"].(bool); locked {
			t.Fatal("expected blocked-section to start unlocked")
		}
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := mustAuthenticatedMCPHTTPClient(t, app, server.URL)
	response, err := client.Post(
		server.URL+httpapi.RouteMCPToolCall,
		"application/json",
		strings.NewReader(`{
			"tool":"toggle_position_locks",
			"arguments":{
				"projectConfigId":"project-alpha",
				"sectionIds":["allowed-section","blocked-section"]
			},
			"agenticContext":{
				"projectConfigId":"project-alpha",
				"allowUnscoped":true
			}
		}`),
	)
	if err != nil {
		t.Fatalf("post toggle_position_locks tool call route: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	var payload struct {
		StructuredContent any  `json:"structuredContent"`
		IsError           bool `json:"isError"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode toggle_position_locks tool call response: %v", err)
	}
	if payload.IsError {
		t.Fatalf("expected toggle_position_locks success, got %#v", payload.StructuredContent)
	}

	project, err = app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route toggle_position_locks: %v", err)
	}
	allowedPayload := mustDecodedProjectPayloadValue(t, project.Sections["allowed-section"].SharedModifier)
	blockedPayload := mustDecodedProjectPayloadValue(t, project.Sections["blocked-section"].SharedModifier)
	if locked, _ := allowedPayload["positionAndSizeLocked"].(bool); !locked {
		t.Fatal("expected allowed-section to be locked after route mutation")
	}
	if locked, _ := blockedPayload["positionAndSizeLocked"].(bool); !locked {
		t.Fatal("expected blocked-section to be locked after route mutation")
	}
}

func TestAppIDEMCPToolCallRouteSupportsToggleMinimized(t *testing.T) {
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

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before route toggle_minimized: %v", err)
	}
	if len(project.Sections["allowed-section"].SharedModifier) != 0 {
		allowedPayload := mustDecodedProjectPayloadValue(t, project.Sections["allowed-section"].SharedModifier)
		if minimized, _ := allowedPayload["isMinimized"].(bool); minimized {
			t.Fatal("expected allowed-section to start unminimized")
		}
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := mustAuthenticatedMCPHTTPClient(t, app, server.URL)
	response, err := client.Post(
		server.URL+httpapi.RouteMCPToolCall,
		"application/json",
		strings.NewReader(`{
			"tool":"toggle_minimized",
			"arguments":{
				"projectConfigId":"project-alpha",
				"sectionId":"allowed-section"
			},
			"agenticContext":{
				"projectConfigId":"project-alpha",
				"allowUnscoped":true
			}
		}`),
	)
	if err != nil {
		t.Fatalf("post toggle_minimized tool call route: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	var payload struct {
		StructuredContent any  `json:"structuredContent"`
		IsError           bool `json:"isError"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode toggle_minimized tool call response: %v", err)
	}
	if payload.IsError {
		t.Fatalf("expected toggle_minimized success, got %#v", payload.StructuredContent)
	}

	project, err = app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route toggle_minimized: %v", err)
	}
	allowedPayload := mustDecodedProjectPayloadValue(t, project.Sections["allowed-section"].SharedModifier)
	if minimized, _ := allowedPayload["isMinimized"].(bool); !minimized {
		t.Fatal("expected allowed-section to be minimized after route mutation")
	}
}

func TestAppIDEMCPToolCallRouteSupportsStructuralCreate(t *testing.T) {
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
	beforeProject, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before route structural create: %v", err)
	}
	beforeSectionIDs := map[string]struct{}{}
	for sectionID := range beforeProject.Sections {
		beforeSectionIDs[sectionID] = struct{}{}
	}
	response, err := client.Post(
		server.URL+httpapi.RouteMCPToolCall,
		"application/json",
		strings.NewReader(`{
			"tool":"create_top_level_section",
			"arguments":{"projectConfigId":"project-alpha","implType":"Dict"},
			"agenticContext":{
				"projectConfigId":"project-alpha",
				"allowUnscoped":true
			}
		}`),
	)
	if err != nil {
		t.Fatalf("post structural create tool call route: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	var payload struct {
		StructuredContent any  `json:"structuredContent"`
		IsError           bool `json:"isError"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode structural create tool call response: %v", err)
	}
	if payload.IsError {
		t.Fatalf("expected structural create success, got %#v", payload.StructuredContent)
	}

	structured := mustStructuredMapValue(t, payload.StructuredContent)
	sectionID, ok := structured["sectionId"].(string)
	if !ok || strings.TrimSpace(sectionID) == "" {
		t.Fatalf("expected created section id, got %#v", structured["sectionId"])
	}

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route structural create: %v", err)
	}
	var canonicalSectionID string
	for currentSectionID := range project.Sections {
		if _, existed := beforeSectionIDs[currentSectionID]; !existed {
			canonicalSectionID = currentSectionID
			break
		}
	}
	if canonicalSectionID == "" {
		t.Fatalf("expected one new canonical section, got %#v", project.Sections)
	}
	if sectionID == canonicalSectionID {
		t.Fatalf("expected translated section id to differ from canonical %q", canonicalSectionID)
	}
	if _, ok := project.Sections[sectionID]; ok {
		t.Fatalf("did not expect translated section id %q to be a canonical project key", sectionID)
	}
}

func TestAppIDEMCPToolCallRouteSupportsStructuralChildCreate(t *testing.T) {
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
	beforeProject, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before route structural child create: %v", err)
	}
	beforeSectionIDs := map[string]struct{}{}
	for sectionID := range beforeProject.Sections {
		beforeSectionIDs[sectionID] = struct{}{}
	}

	response, err := client.Post(
		server.URL+httpapi.RouteMCPToolCall,
		"application/json",
		strings.NewReader(`{
			"tool":"create_child_sections",
			"arguments":{"projectConfigId":"project-alpha","parentId":"allowed-section","implType":"Terminal","numChildren":1},
			"agenticContext":{
				"projectConfigId":"project-alpha",
				"allowUnscoped":true
			}
		}`),
	)
	if err != nil {
		t.Fatalf("post structural child create tool call route: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	var payload struct {
		StructuredContent any  `json:"structuredContent"`
		IsError           bool `json:"isError"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode structural child create tool call response: %v", err)
	}
	if payload.IsError {
		t.Fatalf("expected structural child create success, got %#v", payload.StructuredContent)
	}

	structured := mustStructuredMapValue(t, payload.StructuredContent)
	sectionIDs := mustStructuredStringListValue(t, structured["sectionIds"])
	if len(sectionIDs) != 1 || strings.TrimSpace(sectionIDs[0]) == "" {
		t.Fatalf("expected one created child id, got %#v", sectionIDs)
	}

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route structural child create: %v", err)
	}
	var canonicalSectionID string
	for currentSectionID := range project.Sections {
		if _, existed := beforeSectionIDs[currentSectionID]; !existed {
			canonicalSectionID = currentSectionID
			break
		}
	}
	if canonicalSectionID == "" {
		t.Fatalf("expected one new canonical child section, got %#v", project.Sections)
	}
	if sectionIDs[0] == canonicalSectionID {
		t.Fatalf("expected translated child id to differ from canonical %q", canonicalSectionID)
	}
	if _, ok := project.Sections[sectionIDs[0]]; ok {
		t.Fatalf("did not expect translated child id %q to be a canonical project key", sectionIDs[0])
	}
	createdSection := project.Sections[canonicalSectionID]
	if createdSection.ParentSectionID != "allowed-section" {
		t.Fatalf("expected created child parent allowed-section, got %#v", createdSection)
	}
}

func TestAppIDEMCPToolCallRouteSupportsIncrementerStructuralChildCreate(t *testing.T) {
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
	beforeProject, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before route incrementer structural child create: %v", err)
	}
	beforeSectionIDs := map[string]struct{}{}
	for sectionID := range beforeProject.Sections {
		beforeSectionIDs[sectionID] = struct{}{}
	}

	response, err := client.Post(
		server.URL+httpapi.RouteMCPToolCall,
		"application/json",
		strings.NewReader(`{
			"tool":"create_child_sections_via_incrementer",
			"arguments":{"projectConfigId":"project-alpha","calledBy":"allowed-section","implType":"Terminal","numChildren":1},
			"agenticContext":{
				"projectConfigId":"project-alpha",
				"allowUnscoped":true
			}
		}`),
	)
	if err != nil {
		t.Fatalf("post incrementer structural child create tool call route: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	var payload struct {
		StructuredContent any  `json:"structuredContent"`
		IsError           bool `json:"isError"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode incrementer structural child create tool call response: %v", err)
	}
	if payload.IsError {
		t.Fatalf("expected incrementer structural child create success, got %#v", payload.StructuredContent)
	}

	structured := mustStructuredMapValue(t, payload.StructuredContent)
	sectionIDs := mustStructuredStringListValue(t, structured["sectionIds"])
	if len(sectionIDs) != 1 || strings.TrimSpace(sectionIDs[0]) == "" {
		t.Fatalf("expected one created incrementer child id, got %#v", sectionIDs)
	}

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route incrementer structural child create: %v", err)
	}
	var canonicalSectionID string
	for currentSectionID := range project.Sections {
		if _, existed := beforeSectionIDs[currentSectionID]; !existed {
			canonicalSectionID = currentSectionID
			break
		}
	}
	if canonicalSectionID == "" {
		t.Fatalf("expected one new canonical incrementer child section, got %#v", project.Sections)
	}
	if sectionIDs[0] == canonicalSectionID {
		t.Fatalf("expected translated incrementer child id to differ from canonical %q", canonicalSectionID)
	}
	if _, ok := project.Sections[sectionIDs[0]]; ok {
		t.Fatalf("did not expect translated incrementer child id %q to be a canonical project key", sectionIDs[0])
	}
	createdSection := project.Sections[canonicalSectionID]
	if createdSection.ParentSectionID != "allowed-section" {
		t.Fatalf("expected created incrementer child parent allowed-section, got %#v", createdSection)
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

func mustSeedAppChildSection(t *testing.T, runtime *projectstate.Runtime, parentID string) string {
	t.Helper()

	_, result, err := runtime.CreateChildSections(context.Background(), "project-alpha", projectstate.CreateChildSectionsInput{
		ParentID:    parentID,
		ImplType:    "Terminal",
		NumChildren: 1,
	}, projectstate.Document{})
	if err != nil {
		t.Fatalf("seed child section under %q: %v", parentID, err)
	}
	if len(result.SectionIDs) != 1 {
		t.Fatalf("expected one seeded child section under %q, got %#v", parentID, result.SectionIDs)
	}
	return result.SectionIDs[0]
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
		if _, ok := bindingPayload["path"].(string); !ok {
			bindingPayload["path"] = "code/readonly.py"
		}
		bindingPayload["access_mode"] = string(projectstate.CodeFileAccessModeReadOnly)
		payload["codeFileBinding"] = bindingPayload
		impl.Payload = mustRawJSONValue(t, payload)
		impl.Code.Binding = &projectstate.CodeFileBinding{
			Path:       bindingPayload["path"].(string),
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

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after bound set_code: %v", err)
	}
	sectionPayload := mustDecodedProjectPayloadValue(t, project.SectionImpls["impl-main"].Payload)
	if got := sectionPayload["code"]; got != expectedCode {
		t.Fatalf("expected bound code payload %q, got %#v", expectedCode, got)
	}

	entry, ok := project.WatchCodeRegistry["pkg.bound.sorted:function"]
	if !ok {
		t.Fatalf("expected watch code registry entry, got %#v", project.WatchCodeRegistry)
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
		client := app.MCPClient()
		if client != nil {
			statuses := client.RuntimeStatuses()
			if len(statuses) == 1 && statuses[0].State == want {
				return
			}
		}
		time.Sleep(25 * time.Millisecond)
	}

	client := app.MCPClient()
	if client == nil {
		t.Fatal("expected app MCP client")
	}
	statuses := client.RuntimeStatuses()
	t.Fatalf("expected runtime state %q, got %#v", want, statuses)
}
