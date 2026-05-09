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

	"setta/internal/agentprofiles"
	"setta/internal/config"
	"setta/internal/httpapi"
	"setta/internal/mcpx"
	"setta/internal/observability"
	"setta/internal/projectstate"

	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestAppIDEMCPServerSupportsTemporaryIDsOverAuthenticatedStreamableHTTP(t *testing.T) {
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
	session, err := client.Connect(context.Background(), &sdkmcp.StreamableClientTransport{
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
	mcpSession, err := mcpClient.Connect(context.Background(), &sdkmcp.StreamableClientTransport{
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
