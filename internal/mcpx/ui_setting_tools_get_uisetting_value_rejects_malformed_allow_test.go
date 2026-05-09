package mcpx

import (
	"context"
	"fmt"
	"reflect"
	"strings"
	"testing"

	"setta/internal/projectstate"
	"setta/internal/realtime"
	"setta/internal/uisettings"

	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestServerGetUISettingValueRejectsMalformedAllowUnscopedMetaWithoutFallbackToProjectArgument(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Meta: sdkmcp.Meta{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   "sometimes",
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-watch-code-provider::files",
		},
	})
	if err != nil {
		t.Fatalf("call get_ui_setting_value with malformed allowUnscoped meta: %v", err)
	}
	if !result.IsError {
		t.Fatalf("expected malformed allowUnscoped meta to fail, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
	}
	if payload["message"] != "allowUnscoped metadata must be true or false" {
		t.Fatalf("expected malformed allowUnscoped meta message, got %#v", payload["message"])
	}
}

func TestServerUISettingToolsDefaultProjectConfigIDFromAgenticContext(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSessionWithBackendWatchCodeSettings(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	searchResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "search_ui_settings",
		Arguments: map[string]any{
			"query": "watch files",
			"limit": 3,
		},
	})
	if err != nil {
		t.Fatalf("call search_ui_settings without projectConfigId: %v", err)
	}
	if searchResult.IsError {
		t.Fatalf("expected search_ui_settings without projectConfigId success, got %#v", searchResult.StructuredContent)
	}
	searchPayload := mustStructuredMap(t, searchResult.StructuredContent)
	searchResults := mustStructuredList(t, searchPayload["results"])
	if len(searchResults) == 0 || mustStructuredMap(t, searchResults[0])["settingId"] != "plugin::setta-fixture-watch-code-provider::files" {
		t.Fatalf("expected watch-code search result without projectConfigId, got %#v", searchResults)
	}

	getResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"settingId": "core.project.name",
		},
	})
	if err != nil {
		t.Fatalf("call get_ui_setting_value without projectConfigId: %v", err)
	}
	if getResult.IsError {
		t.Fatalf("expected get_ui_setting_value without projectConfigId success, got %#v", getResult.StructuredContent)
	}
	getPayload := mustStructuredMap(t, getResult.StructuredContent)
	if getPayload["value"] != "Alpha" {
		t.Fatalf("expected project name Alpha, got %#v", getPayload["value"])
	}

	setResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"settingId": "core.project.show_param_display_names",
			"value":     true,
		},
	})
	if err != nil {
		t.Fatalf("call set_ui_setting_value without projectConfigId: %v", err)
	}
	if setResult.IsError {
		t.Fatalf("expected set_ui_setting_value without projectConfigId success, got %#v", setResult.StructuredContent)
	}
	setPayload := mustStructuredMap(t, setResult.StructuredContent)
	if setPayload["changed"] != true {
		t.Fatalf("expected changed=true, got %#v", setPayload["changed"])
	}
}

func TestServerUISettingToolsPreferSessionProjectConfigIDOverRequestMeta(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSessionWithBackendWatchCodeSettings(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "search_ui_settings",
		Meta: sdkmcp.Meta{
			"projectConfigId": "missing-project",
		},
		Arguments: map[string]any{
			"query": "watch files",
			"limit": 3,
		},
	})
	if err != nil {
		t.Fatalf("call search_ui_settings with conflicting projectConfigId meta: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected session projectConfigId to stay authoritative, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	results := mustStructuredList(t, payload["results"])
	if len(results) == 0 || mustStructuredMap(t, results[0])["settingId"] != "plugin::setta-fixture-watch-code-provider::files" {
		t.Fatalf("expected watch-code search result, got %#v", results)
	}
}

func TestServerUISettingToolsRejectProjectArgumentMismatchingAgenticContext(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	mustCloneScopedTestProject(t, projectRuntime, "project-beta", "project-alpha")

	testCases := []struct {
		name          string
		toolName      string
		arguments     map[string]any
		revealService *recordingRevealService
	}{
		{
			name:     "search",
			toolName: "search_ui_settings",
			arguments: map[string]any{
				"projectConfigId": "project-beta",
				"query":           "watch code",
			},
		},
		{
			name:     "get",
			toolName: "get_ui_setting_value",
			arguments: map[string]any{
				"projectConfigId": "project-beta",
				"settingId":       "plugin::setta-fixture-watch-code-provider::files",
			},
		},
		{
			name:     "set",
			toolName: "set_ui_setting_value",
			arguments: map[string]any{
				"projectConfigId": "project-beta",
				"settingId":       "plugin::setta-fixture-watch-code-provider::files",
				"value":           []any{"pkg/watch.py"},
			},
		},
		{
			name:     "reveal",
			toolName: "reveal_ui_setting",
			arguments: map[string]any{
				"projectConfigId": "project-beta",
				"settingId":       "core.project.show_param_display_names",
			},
			revealService: &recordingRevealService{
				result: uisettings.RevealResult{
					RequestID:       "unexpected",
					ProjectConfigID: "project-alpha",
					Statuses: []uisettings.RevealStatus{
						{SettingID: "core.project.show_param_display_names", Status: "revealed"},
					},
				},
			},
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
				WorkspaceRoot:    t.TempDir(),
				ProjectState:     projectRuntime,
				UISettingReveals: tc.revealService,
			})
			defer clientSession.Close()

			setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

			beforeSnapshot := projectRuntime.Snapshot()
			if _, err := beforeSnapshot.Document.ProjectByID("project-alpha"); err != nil {
				t.Fatalf("project-alpha before mismatched UI-setting call: %v", err)
			}
			if _, err := beforeSnapshot.Document.ProjectByID("project-beta"); err != nil {
				t.Fatalf("project-beta before mismatched UI-setting call: %v", err)
			}
			beforeAlpha := readScopedTestWatchCodeProjectData(t, beforeSnapshot.Document, "project-alpha")
			beforeBeta := readScopedTestWatchCodeProjectData(t, beforeSnapshot.Document, "project-beta")

			result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
				Name:      tc.toolName,
				Arguments: tc.arguments,
			})
			if err != nil {
				t.Fatalf("call %s with mismatched projectConfigId: %v", tc.toolName, err)
			}
			if !result.IsError {
				t.Fatalf("expected %s with mismatched projectConfigId to fail, got %#v", tc.toolName, result.StructuredContent)
			}

			payload := mustStructuredMap(t, result.StructuredContent)
			if payload["code"] != "invalid_arguments" {
				t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
			}
			message, _ := payload["message"].(string)
			if !strings.Contains(message, "projectConfigId argument") || !strings.Contains(message, "does not match agentic context projectConfigId") {
				t.Fatalf("expected project mismatch message, got %#v", payload["message"])
			}

			afterSnapshot := projectRuntime.Snapshot()
			if _, err := afterSnapshot.Document.ProjectByID("project-alpha"); err != nil {
				t.Fatalf("project-alpha after mismatched UI-setting call: %v", err)
			}
			if _, err := afterSnapshot.Document.ProjectByID("project-beta"); err != nil {
				t.Fatalf("project-beta after mismatched UI-setting call: %v", err)
			}
			afterAlpha := readScopedTestWatchCodeProjectData(t, afterSnapshot.Document, "project-alpha")
			afterBeta := readScopedTestWatchCodeProjectData(t, afterSnapshot.Document, "project-beta")
			if !reflect.DeepEqual(beforeAlpha.Files, afterAlpha.Files) || !reflect.DeepEqual(beforeAlpha.Folders, afterAlpha.Folders) {
				t.Fatalf("expected project-alpha Watch Code inputs to remain unchanged, before=%#v after=%#v", beforeAlpha, afterAlpha)
			}
			if !reflect.DeepEqual(beforeBeta.Files, afterBeta.Files) || !reflect.DeepEqual(beforeBeta.Folders, afterBeta.Folders) {
				t.Fatalf("expected project-beta Watch Code inputs to remain unchanged, before=%#v after=%#v", beforeBeta, afterBeta)
			}
			if tc.revealService != nil && tc.revealService.input.ProjectConfigID != "" {
				t.Fatalf("expected reveal service not to be invoked on project mismatch, got %#v", tc.revealService.input)
			}
		})
	}
}

func TestServerGetUISettingValueRejectsProjectArgumentMismatchInShareSession(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	mustCloneScopedTestProject(t, projectRuntime, "project-beta", "project-alpha")

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot: t.TempDir(),
		ProjectState:  projectRuntime,
	})
	defer clientSession.Close()

	setUISettingAgenticContextWithShareSession(
		t,
		clientSession,
		"project-alpha",
		"chat-1",
		"chat-section",
		"share-session-1",
		true,
	)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-beta",
			"settingId":       "plugin::setta-fixture-watch-code-provider::files",
		},
	})
	if err != nil {
		t.Fatalf("call get_ui_setting_value with mismatched share-session projectConfigId: %v", err)
	}
	if !result.IsError {
		t.Fatalf("expected get_ui_setting_value with mismatched share-session projectConfigId to fail, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
	}
	message, _ := payload["message"].(string)
	if !strings.Contains(message, "projectConfigId argument") || !strings.Contains(message, "does not match agentic context projectConfigId") {
		t.Fatalf("expected project mismatch message, got %#v", payload["message"])
	}
}

func TestServerUISettingToolsRoundTripProjectNameAndPythonCodegenEnabled(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	assertUISettingSearchFirstSetting(t, clientSession, "project name", "core.project.name")
	assertUISettingValue(t, clientSession, "core.project.name", "Alpha")
	assertUISettingChanged(t, clientSession, "core.project.name", "Renamed Project")
	assertUISettingValue(t, clientSession, "core.run_instructions.python_codegen_enabled", false)
	assertUISettingChanged(t, clientSession, "core.run_instructions.python_codegen_enabled", true)

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after UI setting writes: %v", err)
	}
	if project.Name != "Renamed Project" {
		t.Fatalf("expected persisted project name Renamed Project, got %#v", project.Name)
	}
	if !project.HasPythonCodegenTarget() {
		t.Fatal("expected python codegen target to be enabled after UI setting write")
	}
}

func TestServerUISettingToolsRejectMissingScopedProjectContextWhenProjectIDOmitted(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"settingId": "core.project.name",
		},
	})
	if err != nil {
		t.Fatalf("call get_ui_setting_value without scoped project context: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected missing scoped project context to return structured tool error")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != scopeViolationErrorCode {
		t.Fatalf("expected scope violation code, got %#v", payload["code"])
	}
	if payload["reason"] != "missing_context" {
		t.Fatalf("expected missing_context reason, got %#v", payload["reason"])
	}
}

func TestServerGetUISettingValueReturnsStructuredPayload(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", false)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "core.project.name",
		},
	})
	if err != nil {
		t.Fatalf("call get_ui_setting_value: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected get_ui_setting_value success, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	setting := mustStructuredMap(t, payload["setting"])
	if setting["settingId"] != "core.project.name" {
		t.Fatalf("expected core.project.name summary, got %#v", setting)
	}
	if payload["value"] != "Alpha" {
		t.Fatalf("expected project name Alpha, got %#v", payload["value"])
	}
	if _, ok := payload["error"]; ok {
		t.Fatalf("did not expect structured error, got %#v", payload["error"])
	}
}

func TestServerSetUISettingValueWritesAndValidates(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSessionWithBackendWatchCodeSettings(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "core.project.show_param_display_names",
			"value":           true,
		},
	})
	if err != nil {
		t.Fatalf("call set_ui_setting_value: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected set_ui_setting_value success, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["changed"] != true {
		t.Fatalf("expected changed=true, got %#v", payload["changed"])
	}
	if payload["oldValue"] != false {
		t.Fatalf("expected oldValue=false, got %#v", payload["oldValue"])
	}
	if payload["newValue"] != true {
		t.Fatalf("expected newValue=true, got %#v", payload["newValue"])
	}
	if _, ok := payload["error"]; ok {
		t.Fatalf("did not expect structured error, got %#v", payload["error"])
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_ui_setting_value: %v", err)
	}
	if !project.ShowParamDisplayNames {
		t.Fatal("expected showParamDisplayNames to be persisted")
	}

	invalidResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-watch-code-provider::folders",
			"value": []any{
				map[string]any{
					"path":      "./backend",
					"recursive": "nope",
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("call invalid set_ui_setting_value: %v", err)
	}
	if invalidResult.IsError {
		t.Fatalf("expected structured invalid set_ui_setting_value failure, got %#v", invalidResult.StructuredContent)
	}

	invalidPayload := mustStructuredMap(t, invalidResult.StructuredContent)
	errorPayload := mustStructuredMap(t, invalidPayload["error"])
	if errorPayload["code"] != string(uisettings.ErrorCodeInvalidValueType) {
		t.Fatalf("expected invalid_value_type error code, got %#v", errorPayload["code"])
	}
}

func TestServerSetUISettingValueRejectsUnsupportedWatchCodeFolderPropertiesWithoutMutation(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSessionWithBackendWatchCodeSettings(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	initialResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-watch-code-provider::folders",
		},
	})
	if err != nil {
		t.Fatalf("call get_ui_setting_value before invalid watch folders write: %v", err)
	}
	if initialResult.IsError {
		t.Fatalf("expected initial get_ui_setting_value success, got %#v", initialResult.StructuredContent)
	}
	initialPayload := mustStructuredMap(t, initialResult.StructuredContent)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-watch-code-provider::folders",
			"value": []any{
				map[string]any{
					"path":      "./backend",
					"recursive": true,
					"extra":     "not-allowed",
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("call set_ui_setting_value with unsupported watch folder properties: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected structured unsupported-property failure, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["changed"] != false {
		t.Fatalf("expected changed=false, got %#v", payload["changed"])
	}
	errorPayload := mustStructuredMap(t, payload["error"])
	if errorPayload["code"] != string(uisettings.ErrorCodeInvalidValueType) {
		t.Fatalf("expected invalid_value_type error code, got %#v", errorPayload["code"])
	}
	if !strings.Contains(fmt.Sprint(errorPayload["message"]), "unsupported properties") {
		t.Fatalf("expected unsupported-properties message, got %#v", errorPayload["message"])
	}

	unchangedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-watch-code-provider::folders",
		},
	})
	if err != nil {
		t.Fatalf("call get_ui_setting_value after invalid watch folders write: %v", err)
	}
	if unchangedResult.IsError {
		t.Fatalf("expected unchanged get_ui_setting_value success, got %#v", unchangedResult.StructuredContent)
	}
	unchangedPayload := mustStructuredMap(t, unchangedResult.StructuredContent)
	if !reflect.DeepEqual(unchangedPayload["value"], initialPayload["value"]) {
		t.Fatalf("expected watch code folders to remain unchanged, got before=%#v after=%#v", initialPayload["value"], unchangedPayload["value"])
	}
}

func TestServerSetUISettingValueDefaultsProjectConfigIDFromShareScope(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	revealService := &recordingRevealService{
		result: uisettings.RevealResult{
			RequestID:          "share-request",
			ProjectConfigID:    "project-alpha",
			EmittedRevealCount: 1,
			Statuses: []uisettings.RevealStatus{
				{
					SettingID: "plugin::setta-fixture-watch-code-provider::files",
					Status:    "revealed",
				},
			},
		},
	}

	_, clientSession := newScopedTestServerSessionWithBackendWatchCodeSettingsAndOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:    t.TempDir(),
		ProjectState:     projectRuntime,
		UISettingReveals: revealService,
	})
	defer clientSession.Close()

	setUISettingAgenticContextWithShareSessionAndFrontendAffinity(
		t,
		clientSession,
		"project-alpha",
		"",
		"",
		"share-session-1",
		"frontend-from-context",
		true,
	)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Meta: sdkmcp.Meta{
			"frontendAffinityToken": "frontend-from-request",
		},
		Arguments: map[string]any{
			"settingId":      "plugin::setta-fixture-watch-code-provider::files",
			"value":          []any{"pkg/share.py"},
			"revealAfterSet": true,
		},
	})
	if err != nil {
		t.Fatalf("call share-scope set_ui_setting_value without projectConfigId: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected share-scope set_ui_setting_value without projectConfigId success, got %#v", result.StructuredContent)
	}
	if revealService.input.ProjectConfigID != "project-alpha" {
		t.Fatalf("expected projectConfigID project-alpha, got %q", revealService.input.ProjectConfigID)
	}
	if revealService.input.ShareSessionID != "share-session-1" {
		t.Fatalf("expected shareSessionID share-session-1, got %q", revealService.input.ShareSessionID)
	}
}

func TestServerSetUISettingValueForwardsExpectedOldValue(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	successResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId":  "project-alpha",
			"settingId":        "core.project.show_param_display_names",
			"value":            true,
			"expectedOldValue": false,
		},
	})
	if err != nil {
		t.Fatalf("call set_ui_setting_value with matching expectedOldValue: %v", err)
	}
	if successResult.IsError {
		t.Fatalf("expected set_ui_setting_value success with matching expectedOldValue, got %#v", successResult.StructuredContent)
	}

	successPayload := mustStructuredMap(t, successResult.StructuredContent)
	if successPayload["changed"] != true {
		t.Fatalf("expected changed=true, got %#v", successPayload["changed"])
	}

	staleResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId":  "project-alpha",
			"settingId":        "core.project.show_param_display_names",
			"value":            false,
			"expectedOldValue": false,
		},
	})
	if err != nil {
		t.Fatalf("call set_ui_setting_value with stale expectedOldValue: %v", err)
	}
	if staleResult.IsError {
		t.Fatalf("expected structured stale expectedOldValue failure, got %#v", staleResult.StructuredContent)
	}

	stalePayload := mustStructuredMap(t, staleResult.StructuredContent)
	errorPayload := mustStructuredMap(t, stalePayload["error"])
	if errorPayload["code"] != string(uisettings.ErrorCodeMutationFailed) {
		t.Fatalf("expected mutation_failed error code, got %#v", errorPayload["code"])
	}
}

func TestServerSetUISettingValueSuppliesCurrentValueWhenExpectedOldValueOmitted(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	recordingState := &expectedOldValueRecordingProjectState{Runtime: projectRuntime}
	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot: t.TempDir(),
		ProjectState:  recordingState,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	firstResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "core.project.show_param_display_names",
			"value":           true,
		},
	})
	if err != nil {
		t.Fatalf("call set_ui_setting_value without expectedOldValue for first write: %v", err)
	}
	if firstResult.IsError {
		t.Fatalf("expected first set_ui_setting_value success, got %#v", firstResult.StructuredContent)
	}

	secondResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "core.project.show_param_display_names",
			"value":           false,
		},
	})
	if err != nil {
		t.Fatalf("call set_ui_setting_value without expectedOldValue for second write: %v", err)
	}
	if secondResult.IsError {
		t.Fatalf("expected second set_ui_setting_value success, got %#v", secondResult.StructuredContent)
	}

	if len(recordingState.observedShowParamExpectedOldValues) != 2 {
		t.Fatalf("expected two observed expectedOldValue calls, got %d", len(recordingState.observedShowParamExpectedOldValues))
	}
	if recordingState.observedShowParamExpectedOldValues[0] == nil || *recordingState.observedShowParamExpectedOldValues[0] != false {
		t.Fatalf("expected first omitted expectedOldValue to use current false value, got %#v", recordingState.observedShowParamExpectedOldValues[0])
	}
	if recordingState.observedShowParamExpectedOldValues[1] == nil || *recordingState.observedShowParamExpectedOldValues[1] != true {
		t.Fatalf("expected second omitted expectedOldValue to use refreshed true value, got %#v", recordingState.observedShowParamExpectedOldValues[1])
	}
}

func TestServerSetUISettingValueRejectsStaleProjectNamePreconditionWithoutClobber(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	projectState := &concurrentCoreSettingProjectState{Runtime: projectRuntime}
	projectState.beforeCompareProjectName = func(ctx context.Context, projectID string, _ string, _ *string) error {
		_, err := projectRuntime.SetProjectName(ctx, projectID, "Alpha Concurrent")
		return err
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot: t.TempDir(),
		ProjectState:  projectState,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "core.project.name",
			"value":           "Alpha",
		},
	})
	if err != nil {
		t.Fatalf("call stale project-name set_ui_setting_value: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected structured stale project-name response, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	errorPayload := mustStructuredMap(t, payload["error"])
	if errorPayload["code"] != string(uisettings.ErrorCodeMutationFailed) {
		t.Fatalf("expected mutation_failed error code, got %#v", errorPayload["code"])
	}
	if !strings.Contains(fmt.Sprint(errorPayload["message"]), "changed since pre-write validation") {
		t.Fatalf("expected stale-precondition message, got %#v", errorPayload["message"])
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after stale project-name write: %v", err)
	}
	if project.Name != "Alpha Concurrent" {
		t.Fatalf("expected concurrent project name to remain, got %q", project.Name)
	}
}

func TestServerSetUISettingValueRejectsStalePythonCodegenPreconditionWithoutClobber(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	projectState := &concurrentCoreSettingProjectState{Runtime: projectRuntime}
	projectState.beforeComparePythonCodegenEnabled = func(ctx context.Context, projectID string, _ bool, _ *bool) error {
		_, err := projectRuntime.SetProjectCodegenTargets(
			ctx,
			projectID,
			[]projectstate.ProjectCodegenTarget{{Language: string(projectstate.CodeLanguagePython)}},
			nil,
			projectstate.PythonCodegenSectionReconcilerFunc(func(context.Context, *projectstate.Project) error {
				return nil
			}),
		)
		return err
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot: t.TempDir(),
		ProjectState:  projectState,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "core.run_instructions.python_codegen_enabled",
			"value":           false,
		},
	})
	if err != nil {
		t.Fatalf("call stale python-codegen set_ui_setting_value: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected structured stale python-codegen response, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	errorPayload := mustStructuredMap(t, payload["error"])
	if errorPayload["code"] != string(uisettings.ErrorCodeMutationFailed) {
		t.Fatalf("expected mutation_failed error code, got %#v", errorPayload["code"])
	}
	if !strings.Contains(fmt.Sprint(errorPayload["message"]), "changed since pre-write validation") {
		t.Fatalf("expected stale-precondition message, got %#v", errorPayload["message"])
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after stale python-codegen write: %v", err)
	}
	if !project.HasPythonCodegenTarget() {
		t.Fatal("expected concurrent python codegen value to remain enabled")
	}
}

func TestServerSetUISettingValueRevealAfterSetReturnsNestedRevealAndUsesMetaSectionContext(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	revealService := &recordingRevealService{
		result: uisettings.RevealResult{
			RequestID:          "request-reveal-after-set",
			ProjectConfigID:    "project-alpha",
			DurationMS:         1500,
			EmittedRevealCount: 1,
			Statuses: []uisettings.RevealStatus{
				{
					SettingID: "core.project.show_param_display_names",
					Status:    "revealed",
				},
			},
		},
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:    t.TempDir(),
		ProjectState:     projectRuntime,
		UISettingReveals: revealService,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "", "", true)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Meta: sdkmcp.Meta{
			"sectionId": "allowed-callable-section",
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "core.project.show_param_display_names",
			"value":           true,
			"revealAfterSet":  true,
			"durationMs":      1500,
		},
	})
	if err != nil {
		t.Fatalf("call set_ui_setting_value with revealAfterSet: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected set_ui_setting_value with revealAfterSet success, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["changed"] != true {
		t.Fatalf("expected changed=true, got %#v", payload["changed"])
	}
	revealPayload := mustStructuredMap(t, payload["reveal"])
	if revealPayload["requestId"] != "request-reveal-after-set" {
		t.Fatalf("expected nested reveal request id, got %#v", revealPayload["requestId"])
	}
	if revealService.input.ContextSectionID != "allowed-callable-section" {
		t.Fatalf("expected request-meta section context to be reused, got %q", revealService.input.ContextSectionID)
	}
	if revealService.input.SectionIDToActivate != "" {
		t.Fatalf("expected no explicit section override, got %q", revealService.input.SectionIDToActivate)
	}
	if revealService.input.DurationMS != 1500 {
		t.Fatalf("expected reveal duration 1500, got %d", revealService.input.DurationMS)
	}
}

func TestServerSetUISettingValueRevealAfterSetShareScopePrefersAgenticFrontendAffinityTokenOverRequestMeta(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	revealService := &recordingRevealService{
		result: uisettings.RevealResult{
			RequestID:          "request-reveal-after-set",
			ProjectConfigID:    "project-alpha",
			EmittedRevealCount: 1,
			Statuses: []uisettings.RevealStatus{
				{
					SettingID: "plugin::setta-fixture-watch-code-provider::files",
					Status:    "revealed",
				},
			},
		},
	}

	_, clientSession := newScopedTestServerSessionWithBackendWatchCodeSettingsAndOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:    t.TempDir(),
		ProjectState:     projectRuntime,
		UISettingReveals: revealService,
	})
	defer clientSession.Close()

	setUISettingAgenticContextWithShareSessionAndFrontendAffinity(
		t,
		clientSession,
		"project-alpha",
		"",
		"",
		"share-session-1",
		"frontend-from-context",
		true,
	)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Meta: sdkmcp.Meta{
			"frontendAffinityToken": "frontend-from-request",
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-watch-code-provider::files",
			"value":           []any{"pkg/reveal.py"},
			"revealAfterSet":  true,
		},
	})
	if err != nil {
		t.Fatalf("call share-scope set_ui_setting_value with revealAfterSet: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected share-scope set_ui_setting_value with revealAfterSet success, got %#v", result.StructuredContent)
	}
	if revealService.input.ShareSessionID != "share-session-1" {
		t.Fatalf("expected shareSessionID share-session-1, got %q", revealService.input.ShareSessionID)
	}
	if revealService.input.FrontendAffinityToken != "frontend-from-context" {
		t.Fatalf("expected session frontend affinity token, got %q", revealService.input.FrontendAffinityToken)
	}
}

func TestServerSetUISettingValueRevealAfterSetPreservesWriteWhenRevealFails(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	revealService := &recordingRevealService{
		result: uisettings.RevealResult{
			RequestID:       "request-reveal-failure",
			ProjectConfigID: "project-alpha",
			Statuses: []uisettings.RevealStatus{
				{
					SettingID: "core.project.show_param_display_names",
					Status:    "failed",
					Error: &uisettings.SettingError{
						Code:    uisettings.ErrorCodeMutationFailed,
						Message: "expected reveal failure",
					},
				},
			},
		},
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:    t.TempDir(),
		ProjectState:     projectRuntime,
		UISettingReveals: revealService,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "", "", true)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Meta: sdkmcp.Meta{
			"sectionId": "allowed-callable-section",
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "core.project.show_param_display_names",
			"value":           true,
			"revealAfterSet":  true,
		},
	})
	if err != nil {
		t.Fatalf("call set_ui_setting_value with revealAfterSet failure: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected set_ui_setting_value with revealAfterSet failure to keep write result, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["changed"] != true {
		t.Fatalf("expected changed=true, got %#v", payload["changed"])
	}
	if _, ok := payload["error"]; ok {
		t.Fatalf("did not expect top-level write error, got %#v", payload["error"])
	}
	revealPayload := mustStructuredMap(t, payload["reveal"])
	statuses := mustStructuredList(t, revealPayload["statuses"])
	status := mustStructuredMap(t, statuses[0])
	if status["status"] != "failed" {
		t.Fatalf("expected nested reveal failure, got %#v", status["status"])
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after reveal failure: %v", err)
	}
	if !project.ShowParamDisplayNames {
		t.Fatal("expected write to persist even when nested reveal fails")
	}
}

func TestServerSetUISettingValueRevealAfterSetPreservesWriteWhenFrontendDispatchFails(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	registry := realtime.NewRegistry(realtime.RegistryOptions{})
	if _, err := registry.Register(realtime.RegisterParams{ID: "frontend-1", Type: realtime.ConnectionTypeFrontend}); err != nil {
		t.Fatalf("register frontend: %v", err)
	}
	transport := &stubUISettingRevealTransport{registry: registry}
	transport.sendJSON = func(_ context.Context, _ any, connectionID string) (bool, error) {
		if connectionID != "frontend-1" {
			t.Fatalf("expected reveal dispatch to frontend-1, got %q", connectionID)
		}
		return false, nil
	}
	revealService, err := uisettings.NewRevealService(uisettings.RevealServiceOptions{
		Transport: transport,
		Results:   realtime.NewUISettingRevealResultHub(),
	})
	if err != nil {
		t.Fatalf("new reveal service: %v", err)
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:    t.TempDir(),
		ProjectState:     projectRuntime,
		UISettingReveals: revealService,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "", "", true)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Meta: sdkmcp.Meta{
			"sectionId": "allowed-callable-section",
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "core.project.show_param_display_names",
			"value":           true,
			"revealAfterSet":  true,
		},
	})
	if err != nil {
		t.Fatalf("call set_ui_setting_value with undeliverable revealAfterSet: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected set_ui_setting_value with undeliverable revealAfterSet to keep write result, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["changed"] != true {
		t.Fatalf("expected changed=true, got %#v", payload["changed"])
	}
	revealPayload := mustStructuredMap(t, payload["reveal"])
	statuses := mustStructuredList(t, revealPayload["statuses"])
	status := mustStructuredMap(t, statuses[0])
	if status["status"] != "failed" {
		t.Fatalf("expected nested reveal failure, got %#v", status["status"])
	}
	revealError := mustStructuredMap(t, status["error"])
	if revealError["message"] != "Selected frontend websocket became unavailable before reveal dispatch: frontend-1" {
		t.Fatalf("expected undeliverable dispatch message, got %#v", revealError["message"])
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after undeliverable reveal failure: %v", err)
	}
	if !project.ShowParamDisplayNames {
		t.Fatal("expected write to persist even when reveal dispatch fails before delivery")
	}
}

func TestServerSetUISettingValueRevealAfterSetNoFrontendDoesNotActivateSection(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	revealService, err := uisettings.NewRevealService(uisettings.RevealServiceOptions{
		Transport: &stubUISettingRevealTransport{registry: realtime.NewRegistry(realtime.RegistryOptions{})},
		Results:   realtime.NewUISettingRevealResultHub(),
	})
	if err != nil {
		t.Fatalf("new reveal service: %v", err)
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:    t.TempDir(),
		ProjectState:     projectRuntime,
		UISettingReveals: revealService,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "", "", true)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Meta: sdkmcp.Meta{
			"sectionId": "allowed-callable-section",
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "core.project.show_param_display_names",
			"value":           true,
			"revealAfterSet":  true,
		},
	})
	if err != nil {
		t.Fatalf("call set_ui_setting_value with revealAfterSet and no frontend: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected set_ui_setting_value with no-frontend reveal failure to keep write result, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["changed"] != true {
		t.Fatalf("expected changed=true, got %#v", payload["changed"])
	}
	revealPayload := mustStructuredMap(t, payload["reveal"])
	status := mustStructuredMap(t, mustStructuredList(t, revealPayload["statuses"])[0])
	if status["status"] != "failed" {
		t.Fatalf("expected nested reveal failure, got %#v", status["status"])
	}
	revealError := mustStructuredMap(t, status["error"])
	if revealError["message"] != "No connected frontend is available for UI setting reveal." {
		t.Fatalf("unexpected no-frontend reveal message, got %#v", revealError["message"])
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after no-frontend reveal failure: %v", err)
	}
	if !project.ShowParamDisplayNames {
		t.Fatal("expected write to persist even when no frontend is connected")
	}
	if len(project.ActiveIDs) != 0 {
		t.Fatalf("expected no active section mutation, got %#v", project.ActiveIDs)
	}
}

func TestServerSetUISettingValueRejectsWriterOldValueDrift(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot: t.TempDir(),
		ProjectState:  uiSettingDriftProjectState{Runtime: projectRuntime},
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "core.project.show_param_display_names",
			"value":           true,
		},
	})
	if err != nil {
		t.Fatalf("call drift set_ui_setting_value: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected structured drift failure, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	errorPayload := mustStructuredMap(t, payload["error"])
	if errorPayload["code"] != string(uisettings.ErrorCodeMutationFailed) {
		t.Fatalf("expected mutation_failed error code, got %#v", errorPayload["code"])
	}
}

func callUISettingTool(t *testing.T, clientSession *sdkmcp.ClientSession, toolName string, arguments map[string]any) map[string]any {
	t.Helper()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name:      toolName,
		Arguments: arguments,
	})
	if err != nil {
		t.Fatalf("call %s: %v", toolName, err)
	}
	if result.IsError {
		t.Fatalf("expected %s success, got %#v", toolName, result.StructuredContent)
	}
	return mustStructuredMap(t, result.StructuredContent)
}

func assertUISettingSearchFirstSetting(t *testing.T, clientSession *sdkmcp.ClientSession, query string, expectedSettingID string) {
	t.Helper()

	payload := callUISettingTool(t, clientSession, "search_ui_settings", map[string]any{
		"projectConfigId": "project-alpha",
		"query":           query,
		"limit":           5,
	})
	results := mustStructuredList(t, payload["results"])
	if len(results) == 0 || mustStructuredMap(t, results[0])["settingId"] != expectedSettingID {
		t.Fatalf("expected first search result %s, got %#v", expectedSettingID, results)
	}
}

func assertUISettingValue(t *testing.T, clientSession *sdkmcp.ClientSession, settingID string, expected any) {
	t.Helper()

	payload := callUISettingTool(t, clientSession, "get_ui_setting_value", map[string]any{
		"projectConfigId": "project-alpha",
		"settingId":       settingID,
	})
	if !reflect.DeepEqual(payload["value"], expected) {
		t.Fatalf("expected %s value %#v, got %#v", settingID, expected, payload["value"])
	}
}

func assertUISettingChanged(t *testing.T, clientSession *sdkmcp.ClientSession, settingID string, value any) map[string]any {
	t.Helper()

	payload := callUISettingTool(t, clientSession, "set_ui_setting_value", map[string]any{
		"projectConfigId": "project-alpha",
		"settingId":       settingID,
		"value":           value,
	})
	if payload["changed"] != true {
		t.Fatalf("expected %s changed=true, got %#v", settingID, payload)
	}
	return payload
}
