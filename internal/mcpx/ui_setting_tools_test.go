package mcpx

import (
	"context"
	"path/filepath"
	"testing"

	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"
	"setta/internal/appspec"
	"setta/internal/projectstate"
	"setta/internal/realtime"
	"setta/internal/tools"
	"setta/internal/uisettings"
)

type uiSettingDriftProjectState struct {
	*projectstate.Runtime
}

type recordingRevealService struct {
	input  uisettings.RevealInput
	result uisettings.RevealResult
	err    error
}

func setUISettingAgenticContext(
	t *testing.T,
	clientSession *sdkmcp.ClientSession,
	projectConfigID string,
	chatID string,
	sectionID string,
	allowUnscoped bool,
) {
	t.Helper()

	arguments := map[string]any{
		"projectConfigId": projectConfigID,
	}
	if allowUnscoped {
		arguments["allowUnscoped"] = true
	} else {
		arguments["chatId"] = chatID
		arguments["sectionId"] = sectionID
	}
	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name:      "set_agentic_context",
		Arguments: arguments,
	})
	if err != nil {
		t.Fatalf("call set_agentic_context: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected set_agentic_context success, got %#v", result.StructuredContent)
	}
}

func (s uiSettingDriftProjectState) CompareAndSetShowParamDisplayNames(
	ctx context.Context,
	projectID string,
	show bool,
	expectedOldValue *bool,
) (projectstate.Snapshot, projectstate.CompareAndSetResult[bool], error) {
	snapshot, result, err := s.Runtime.CompareAndSetShowParamDisplayNames(ctx, projectID, show, expectedOldValue)
	if err != nil {
		return snapshot, result, err
	}
	result.OldValue = !result.OldValue
	return snapshot, result, nil
}

func (s *recordingRevealService) Reveal(_ context.Context, input uisettings.RevealInput) (uisettings.RevealResult, error) {
	s.input = input
	return s.result, s.err
}

func TestServerUISettingToolsExposeScopedSingletonMetadata(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	toolsResult, err := clientSession.ListTools(context.Background(), nil)
	if err != nil {
		t.Fatalf("list tools: %v", err)
	}

	expected := map[string]tools.AccessType{
		"search_ui_settings":   tools.AccessTypeRead,
		"get_ui_setting_value": tools.AccessTypeRead,
		"reveal_ui_setting":    tools.AccessTypeRead,
		"set_ui_setting_value": tools.AccessTypeWrite,
	}
	for _, tool := range toolsResult.Tools {
		accessType, ok := expected[tool.Name]
		if !ok {
			continue
		}
		meta := mustStructuredMap(t, tool.Meta[toolMetaNamespace])
		if meta["accessType"] != string(accessType) {
			t.Fatalf("expected %s access type for %s, got %#v", accessType, tool.Name, meta["accessType"])
		}
		if meta["defaultTargetSingletonSection"] != "GlobalVariables" {
			t.Fatalf("expected GlobalVariables singleton target for %s, got %#v", tool.Name, meta["defaultTargetSingletonSection"])
		}
	}
}

func TestServerRevealUISettingReturnsStructuredPayload(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	revealService := &recordingRevealService{
		result: uisettings.RevealResult{
			RequestID:          "request-1",
			ProjectConfigID:    "project-alpha",
			DurationMS:         1500,
			EmittedRevealCount: 1,
			Statuses: []uisettings.RevealStatus{
				{
					SettingID: "core.project.show_param_display_names",
					Status:    "revealed",
					Target: &realtime.UISettingRevealTarget{
						SettingID:       "core.project.show_param_display_names",
						Side:            "right",
						UIEditorTabName: testStringPointer("QuickInfoConfig"),
						Strategy:        "dom_anchor",
						AnchorID:        testStringPointer("core.project.show_param_display_names"),
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

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", false)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "reveal_ui_setting",
		Arguments: map[string]any{
			"projectConfigId":     "project-alpha",
			"settingId":           "core.project.show_param_display_names",
			"sectionIdToActivate": "allowed-callable-section",
			"durationMs":          1500,
		},
	})
	if err != nil {
		t.Fatalf("call reveal_ui_setting: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected reveal_ui_setting success, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["requestId"] != "request-1" {
		t.Fatalf("expected requestId=request-1, got %#v", payload["requestId"])
	}
	if payload["emittedRevealCount"] != float64(1) && payload["emittedRevealCount"] != 1 {
		t.Fatalf("expected emittedRevealCount=1, got %#v", payload["emittedRevealCount"])
	}
	statuses := mustStructuredList(t, payload["statuses"])
	if len(statuses) != 1 {
		t.Fatalf("expected one reveal status, got %#v", statuses)
	}
	status := mustStructuredMap(t, statuses[0])
	if status["status"] != "revealed" {
		t.Fatalf("expected revealed status, got %#v", status["status"])
	}

	if revealService.input.ProjectConfigID != "project-alpha" {
		t.Fatalf("expected canonical project id, got %q", revealService.input.ProjectConfigID)
	}
	if revealService.input.SettingID != "core.project.show_param_display_names" {
		t.Fatalf("expected setting id to be forwarded, got %q", revealService.input.SettingID)
	}
	if revealService.input.SectionIDToActivate != "allowed-callable-section" {
		t.Fatalf("expected explicit section id to be forwarded, got %q", revealService.input.SectionIDToActivate)
	}
	if revealService.input.ContextSectionID != "chat-section" {
		t.Fatalf("expected context section id chat-section, got %q", revealService.input.ContextSectionID)
	}
	if revealService.input.ChatID != "chat-1" {
		t.Fatalf("expected chat-1 chat context, got %q", revealService.input.ChatID)
	}
	if revealService.input.ProjectView == nil {
		t.Fatal("expected project view to be forwarded to reveal service")
	}
	if revealService.input.Registry == nil {
		t.Fatal("expected scoped registry to be forwarded to reveal service")
	}
}

func TestServerSearchUISettingsReturnsRankedCoreResults(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", false)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "search_ui_settings",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"query":           "watch toggle",
			"limit":           3,
			"sourceFilter":    "core",
		},
	})
	if err != nil {
		t.Fatalf("call search_ui_settings: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected search_ui_settings success, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	results := mustStructuredList(t, payload["results"])
	if len(results) == 0 {
		t.Fatal("expected ranked UI setting results")
	}
	first := mustStructuredMap(t, results[0])
	if first["settingId"] != "core.watch_code.enabled" {
		t.Fatalf("expected top result core.watch_code.enabled, got %#v", first)
	}

	pluginOnly, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "search_ui_settings",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"query":           "watch toggle",
			"sourceFilter":    "plugin",
		},
	})
	if err != nil {
		t.Fatalf("call plugin-only search_ui_settings: %v", err)
	}
	if pluginOnly.IsError {
		t.Fatalf("expected plugin-only search_ui_settings success, got %#v", pluginOnly.StructuredContent)
	}
	pluginPayload := mustStructuredMap(t, pluginOnly.StructuredContent)
	if got := len(mustStructuredList(t, pluginPayload["results"])); got != 0 {
		t.Fatalf("expected no plugin UI setting results, got %#v", pluginPayload["results"])
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
			"settingId":       "core.app.spec_path",
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
	if setting["settingId"] != "core.app.spec_path" {
		t.Fatalf("expected core.app.spec_path summary, got %#v", setting)
	}
	if payload["value"] != appspec.DefaultPath() {
		t.Fatalf("expected default app spec path %q, got %#v", appspec.DefaultPath(), payload["value"])
	}
	if _, ok := payload["error"]; ok {
		t.Fatalf("did not expect structured error, got %#v", payload["error"])
	}
}

func TestServerSetUISettingValueWritesAndValidates(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
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
			"settingId":       "core.watch_code.folders",
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

func TestServerUISettingToolsTranslateTemporaryProjectIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	temporaryIDMapPath := filepath.Join(t.TempDir(), "temporary_id_map.json")
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha": "11",
		"chat-1":        "12",
		"chat-section":  "13",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "11", "12", "13", true)

	getResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "11",
			"settingId":       "core.project.show_param_display_names",
		},
	})
	if err != nil {
		t.Fatalf("call temporary get_ui_setting_value: %v", err)
	}
	if getResult.IsError {
		t.Fatalf("expected temporary get_ui_setting_value success, got %#v", getResult.StructuredContent)
	}

	setResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "11",
			"settingId":       "core.project.show_param_display_names",
			"value":           true,
		},
	})
	if err != nil {
		t.Fatalf("call temporary set_ui_setting_value: %v", err)
	}
	if setResult.IsError {
		t.Fatalf("expected temporary set_ui_setting_value success, got %#v", setResult.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temporary set_ui_setting_value: %v", err)
	}
	if !project.ShowParamDisplayNames {
		t.Fatal("expected temporary-id write to persist to canonical project")
	}
}

func TestServerRevealUISettingTranslatesTemporaryIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	temporaryIDMapPath := filepath.Join(t.TempDir(), "temporary_id_map.json")
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha":            "11",
		"chat-1":                   "12",
		"chat-section":             "13",
		"allowed-callable-section": "14",
	})

	revealService := &recordingRevealService{
		result: uisettings.RevealResult{
			RequestID:          "request-temp",
			ProjectConfigID:    "project-alpha",
			DurationMS:         3000,
			EmittedRevealCount: 0,
			Statuses: []uisettings.RevealStatus{
				{
					SettingID: "core.project.show_param_display_names",
					Status:    "failed",
					Error: &uisettings.SettingError{
						Code:    uisettings.ErrorCodeMutationFailed,
						Message: "test failure",
					},
				},
			},
		},
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		UISettingReveals:   revealService,
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "11", "12", "13", true)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "reveal_ui_setting",
		Arguments: map[string]any{
			"projectConfigId":     "11",
			"settingId":           "core.project.show_param_display_names",
			"sectionIdToActivate": "14",
		},
	})
	if err != nil {
		t.Fatalf("call temporary reveal_ui_setting: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temporary reveal_ui_setting success, got %#v", result.StructuredContent)
	}

	if revealService.input.ProjectConfigID != "project-alpha" {
		t.Fatalf("expected canonical project id, got %q", revealService.input.ProjectConfigID)
	}
	if revealService.input.SectionIDToActivate != "allowed-callable-section" {
		t.Fatalf("expected canonical section id, got %q", revealService.input.SectionIDToActivate)
	}
}

func testStringPointer(value string) *string {
	return &value
}
