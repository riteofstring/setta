package mcpx

import (
	"context"
	"path/filepath"
	"reflect"
	"testing"

	"setta/internal/plugins"
	"setta/internal/projectstate"
	"setta/internal/realtime"
	"setta/internal/uisettings"

	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestServerUISettingToolsTrimSettingIDWhitespace(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	revealService := &recordingRevealService{
		result: uisettings.RevealResult{
			RequestID:          "request-whitespace",
			ProjectConfigID:    "project-alpha",
			DurationMS:         1500,
			EmittedRevealCount: 1,
			Statuses: []uisettings.RevealStatus{
				{
					SettingID: "plugin::setta-fixture-watch-code-provider::files",
					Status:    "revealed",
					Target: &realtime.UISettingRevealTarget{
						SettingID:      "plugin::setta-fixture-watch-code-provider::files",
						Side:           "left",
						OverviewTabKey: testStringPointer("Overview"),
						Strategy:       "dom_anchor",
						AnchorID:       testStringPointer("plugin::setta-fixture-watch-code-provider::files"),
					},
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

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	paddedSettingID := "  plugin::setta-fixture-watch-code-provider::files\t"

	getResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       paddedSettingID,
		},
	})
	if err != nil {
		t.Fatalf("call padded get_ui_setting_value: %v", err)
	}
	if getResult.IsError {
		t.Fatalf("expected padded get_ui_setting_value success, got %#v", getResult.StructuredContent)
	}

	getPayload := mustStructuredMap(t, getResult.StructuredContent)
	if value := mustStructuredList(t, getPayload["value"]); len(value) != 0 {
		t.Fatalf("expected initial watch-code files to be empty, got %#v", value)
	}

	setResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       paddedSettingID,
			"value":           []any{"pkg/padded.py"},
		},
	})
	if err != nil {
		t.Fatalf("call padded set_ui_setting_value: %v", err)
	}
	if setResult.IsError {
		t.Fatalf("expected padded set_ui_setting_value success, got %#v", setResult.StructuredContent)
	}

	setPayload := mustStructuredMap(t, setResult.StructuredContent)
	if setPayload["changed"] != true {
		t.Fatalf("expected padded set_ui_setting_value to change state, got %#v", setPayload)
	}

	revealResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "reveal_ui_setting",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       paddedSettingID,
			"durationMs":      1500,
		},
	})
	if err != nil {
		t.Fatalf("call padded reveal_ui_setting: %v", err)
	}
	if revealResult.IsError {
		t.Fatalf("expected padded reveal_ui_setting success, got %#v", revealResult.StructuredContent)
	}

	snapshot := projectRuntime.Snapshot()
	project, err := snapshot.Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after padded UI-setting writes: %v", err)
	}
	projectData := readScopedTestWatchCodeProjectData(t, snapshot.Document, project.ID)
	if !reflect.DeepEqual(projectData.Files, []string{"pkg/padded.py"}) {
		t.Fatalf("expected padded set_ui_setting_value to persist watch-code files, got %#v", projectData.Files)
	}
	if revealService.input.SettingID != "plugin::setta-fixture-watch-code-provider::files" {
		t.Fatalf("expected trimmed reveal setting id, got %q", revealService.input.SettingID)
	}
}

func TestServerUISettingToolsRejectWhitespaceOnlySettingID(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	testCases := []struct {
		name      string
		toolName  string
		arguments map[string]any
	}{
		{
			name:     "get",
			toolName: "get_ui_setting_value",
			arguments: map[string]any{
				"projectConfigId": "project-alpha",
				"settingId":       " \t ",
			},
		},
		{
			name:     "set",
			toolName: "set_ui_setting_value",
			arguments: map[string]any{
				"projectConfigId": "project-alpha",
				"settingId":       " \t ",
				"value":           true,
			},
		},
		{
			name:     "reveal",
			toolName: "reveal_ui_setting",
			arguments: map[string]any{
				"projectConfigId": "project-alpha",
				"settingId":       " \t ",
			},
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
				Name:      tc.toolName,
				Arguments: tc.arguments,
			})
			if err != nil {
				t.Fatalf("call %s with blank setting id: %v", tc.toolName, err)
			}
			if !result.IsError {
				t.Fatalf("expected %s with blank setting id to fail, got %#v", tc.toolName, result.StructuredContent)
			}

			payload := mustStructuredMap(t, result.StructuredContent)
			if payload["code"] != "invalid_arguments" {
				t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
			}
			if payload["message"] != "settingId must not be empty" {
				t.Fatalf("expected blank setting id message, got %#v", payload["message"])
			}
		})
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

func TestServerUISettingToolsSupportSchemaBackedPluginSettings(t *testing.T) {
	t.Parallel()

	_, clientSession, service := newSchemaBackedPluginUISettingSession(t)
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	assertPluginUISettingSearch(t, clientSession)
	assertUISettingValue(t, clientSession, "plugin::setta-fixture-full::label", "unset")
	assertUISettingWriteTransition(t, clientSession, "plugin::setta-fixture-full::enabled", false, true)
	assertUISettingWriteTransition(t, clientSession, "plugin::setta-fixture-full::label", "unset", "updated")
	assertSchemaBackedPluginUISettingRuntimeConfig(t, service)
}

func newSchemaBackedPluginUISettingSession(t *testing.T) (*projectstate.Runtime, *sdkmcp.ClientSession, *plugins.Service) {
	t.Helper()

	projectRuntime := openScopedTestProjectRuntime(t)
	roots, service := newTestPluginMutationService(t, map[string]pluginFixtureSpec{
		"pypi:setta-fixture-full==0.1.0": {
			FixtureName:  "full",
			Version:      "0.1.0",
			StripBackend: true,
		},
	})
	if _, err := service.Install(context.Background(), plugins.InstallOptions{
		SourceSpec: "pypi:setta-fixture-full==0.1.0",
		Enable:     true,
	}); err != nil {
		t.Fatalf("install full fixture plugin: %v", err)
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, roots.workspaceRoot, projectRuntime, ServerOptions{
		WorkspaceRoot:   roots.workspaceRoot,
		ProjectState:    projectRuntime,
		LSPDiagnostics:  openScopedTestLSPDiagnosticsRegistry(),
		PluginMutations: service,
	})
	return projectRuntime, clientSession, service
}

func assertPluginUISettingSearch(t *testing.T, clientSession *sdkmcp.ClientSession) {
	t.Helper()

	payload := callUISettingTool(t, clientSession, "search_ui_settings", map[string]any{
		"projectConfigId": "project-alpha",
		"query":           "fixture label",
		"sourceFilter":    "plugin",
	})
	results := mustStructuredList(t, payload["results"])
	if len(results) == 0 {
		t.Fatal("expected plugin UI setting search results")
	}
	firstResult := mustStructuredMap(t, results[0])
	if firstResult["settingId"] != "plugin::setta-fixture-full::label" {
		t.Fatalf("expected plugin label search result, got %#v", firstResult)
	}
	if firstResult["source"] != "plugin" {
		t.Fatalf("expected plugin search result source, got %#v", firstResult["source"])
	}
}

func assertUISettingWriteTransition(t *testing.T, clientSession *sdkmcp.ClientSession, settingID string, expectedOld any, newValue any) {
	t.Helper()

	payload := assertUISettingChanged(t, clientSession, settingID, newValue)
	if !reflect.DeepEqual(payload["oldValue"], expectedOld) || !reflect.DeepEqual(payload["newValue"], newValue) {
		t.Fatalf("expected %s write %#v -> %#v, got %#v", settingID, expectedOld, newValue, payload)
	}
}

func assertSchemaBackedPluginUISettingRuntimeConfig(t *testing.T, service *plugins.Service) {
	t.Helper()

	runtimeResponse, err := service.Runtime(plugins.RuntimeOptions{})
	if err != nil {
		t.Fatalf("plugin runtime after write: %v", err)
	}
	pluginEntry := mustFindPluginListEntry(t, runtimeResponse.List.Plugins, "setta-fixture-full")
	if pluginEntry.Config.CurrentConfig["enabled"] != true {
		t.Fatalf("expected plugin config enabled=true, got %#v", pluginEntry.Config.CurrentConfig)
	}
	if pluginEntry.Config.CurrentConfig["label"] != "updated" {
		t.Fatalf("expected plugin config label=updated, got %#v", pluginEntry.Config.CurrentConfig)
	}
}
