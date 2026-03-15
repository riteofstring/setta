package mcpx

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"
	"setta/internal/appspec"
	"setta/internal/plugins"
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

type stubUISettingRevealTransport struct {
	registry *realtime.Registry
	sendJSON func(context.Context, any, string) (bool, error)
}

func (s *stubUISettingRevealTransport) Registry() *realtime.Registry {
	return s.registry
}

func (s *stubUISettingRevealTransport) SendJSON(ctx context.Context, message any, connectionID string) (bool, error) {
	if s.sendJSON != nil {
		return s.sendJSON(ctx, message, connectionID)
	}
	return true, nil
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

func setUISettingAgenticContextWithShareSession(
	t *testing.T,
	clientSession *sdkmcp.ClientSession,
	projectConfigID string,
	chatID string,
	sectionID string,
	shareSessionID string,
	allowUnscoped bool,
) {
	t.Helper()

	arguments := map[string]any{
		"projectConfigId": projectConfigID,
		"shareSessionId":  shareSessionID,
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

func setUISettingAgenticContextWithShareSessionAndFrontendAffinity(
	t *testing.T,
	clientSession *sdkmcp.ClientSession,
	projectConfigID string,
	chatID string,
	sectionID string,
	shareSessionID string,
	frontendAffinityToken string,
	allowUnscoped bool,
) {
	t.Helper()

	arguments := map[string]any{
		"projectConfigId":       projectConfigID,
		"shareSessionId":        shareSessionID,
		"frontendAffinityToken": frontendAffinityToken,
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

func TestServerRevealUISettingForwardsShareSessionID(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	revealService := &recordingRevealService{
		result: uisettings.RevealResult{
			RequestID:       "request-1",
			ProjectConfigID: "project-alpha",
			Statuses: []uisettings.RevealStatus{
				{
					SettingID: "core.project.show_param_display_names",
					Status:    "failed",
					Error: &uisettings.SettingError{
						Code:    uisettings.ErrorCodeMutationFailed,
						Message: "expected test failure",
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

	setUISettingAgenticContextWithShareSession(
		t,
		clientSession,
		"project-alpha",
		"chat-1",
		"chat-section",
		"share-session-1",
		false,
	)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "reveal_ui_setting",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "core.project.show_param_display_names",
		},
	})
	if err != nil {
		t.Fatalf("call reveal_ui_setting: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected reveal_ui_setting success, got %#v", result.StructuredContent)
	}
	if revealService.input.ShareSessionID != "share-session-1" {
		t.Fatalf("expected shareSessionID share-session-1, got %q", revealService.input.ShareSessionID)
	}
}

func TestServerRevealUISettingShareScopePrefersAgenticFrontendAffinityTokenOverRequestMeta(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	revealService := &recordingRevealService{
		result: uisettings.RevealResult{
			RequestID:       "request-1",
			ProjectConfigID: "project-alpha",
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

	setUISettingAgenticContextWithShareSessionAndFrontendAffinity(
		t,
		clientSession,
		"project-alpha",
		"chat-1",
		"chat-section",
		"share-session-1",
		"frontend-from-context",
		false,
	)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "reveal_ui_setting",
		Meta: sdkmcp.Meta{
			"frontendAffinityToken": "frontend-from-request",
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "core.project.show_param_display_names",
		},
	})
	if err != nil {
		t.Fatalf("call reveal_ui_setting: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected reveal_ui_setting success, got %#v", result.StructuredContent)
	}
	if revealService.input.ShareSessionID != "share-session-1" {
		t.Fatalf("expected shareSessionID share-session-1, got %q", revealService.input.ShareSessionID)
	}
	if revealService.input.FrontendAffinityToken != "frontend-from-context" {
		t.Fatalf("expected session frontend affinity token, got %q", revealService.input.FrontendAffinityToken)
	}
}

func TestServerRevealUISettingShareScopeIgnoresMalformedMetaFrontendAffinityWhenAgenticAffinityExists(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	revealService := &recordingRevealService{
		result: uisettings.RevealResult{
			RequestID:       "request-1",
			ProjectConfigID: "project-alpha",
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

	setUISettingAgenticContextWithShareSessionAndFrontendAffinity(
		t,
		clientSession,
		"project-alpha",
		"chat-1",
		"chat-section",
		"share-session-1",
		"frontend-from-context",
		false,
	)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "reveal_ui_setting",
		Meta: sdkmcp.Meta{
			"frontendAffinityToken": []any{"frontend-from-request"},
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "core.project.show_param_display_names",
		},
	})
	if err != nil {
		t.Fatalf("call reveal_ui_setting: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected reveal_ui_setting success, got %#v", result.StructuredContent)
	}
	if revealService.input.FrontendAffinityToken != "frontend-from-context" {
		t.Fatalf("expected session frontend affinity token, got %q", revealService.input.FrontendAffinityToken)
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
					SettingID: "core.watch_code.enabled",
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
			"settingId":       "core.watch_code.enabled",
			"value":           true,
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

func TestServerUISettingToolsSupportSchemaBackedPluginSettings(t *testing.T) {
	t.Parallel()

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
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	searchResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "search_ui_settings",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"query":           "fixture label",
			"sourceFilter":    "plugin",
		},
	})
	if err != nil {
		t.Fatalf("call plugin search_ui_settings: %v", err)
	}
	if searchResult.IsError {
		t.Fatalf("expected plugin search_ui_settings success, got %#v", searchResult.StructuredContent)
	}
	searchPayload := mustStructuredMap(t, searchResult.StructuredContent)
	searchResults := mustStructuredList(t, searchPayload["results"])
	if len(searchResults) == 0 {
		t.Fatal("expected plugin UI setting search results")
	}
	firstResult := mustStructuredMap(t, searchResults[0])
	if firstResult["settingId"] != "plugin::setta-fixture-full::label" {
		t.Fatalf("expected plugin label search result, got %#v", firstResult)
	}
	if firstResult["source"] != "plugin" {
		t.Fatalf("expected plugin search result source, got %#v", firstResult["source"])
	}

	getResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::label",
		},
	})
	if err != nil {
		t.Fatalf("call get_ui_setting_value for plugin label: %v", err)
	}
	if getResult.IsError {
		t.Fatalf("expected plugin get_ui_setting_value success, got %#v", getResult.StructuredContent)
	}
	getPayload := mustStructuredMap(t, getResult.StructuredContent)
	if getPayload["value"] != "unset" {
		t.Fatalf("expected default plugin label value, got %#v", getPayload["value"])
	}

	setResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::enabled",
			"value":           true,
		},
	})
	if err != nil {
		t.Fatalf("call set_ui_setting_value for plugin enabled: %v", err)
	}
	if setResult.IsError {
		t.Fatalf("expected plugin set_ui_setting_value success, got %#v", setResult.StructuredContent)
	}
	setPayload := mustStructuredMap(t, setResult.StructuredContent)
	if setPayload["oldValue"] != false || setPayload["newValue"] != true || setPayload["changed"] != true {
		t.Fatalf("expected plugin write false -> true, got %#v", setPayload)
	}

	runtimeResponse, err := service.Runtime(plugins.RuntimeOptions{})
	if err != nil {
		t.Fatalf("plugin runtime after write: %v", err)
	}
	pluginEntry := mustFindPluginListEntry(t, runtimeResponse.List.Plugins, "setta-fixture-full")
	if pluginEntry.Config.CurrentConfig["enabled"] != true {
		t.Fatalf("expected plugin config enabled=true, got %#v", pluginEntry.Config.CurrentConfig)
	}
}

func TestServerUISettingToolsReturnSettingNotFoundForUnknownActivePluginSetting(t *testing.T) {
	t.Parallel()

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
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	searchResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "search_ui_settings",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"query":           "full fixture enabled",
			"sourceFilter":    "plugin",
		},
	})
	if err != nil {
		t.Fatalf("call disabled plugin search_ui_settings: %v", err)
	}
	if searchResult.IsError {
		t.Fatalf("expected structured disabled-plugin search response, got %#v", searchResult.StructuredContent)
	}
	searchPayload := mustStructuredMap(t, searchResult.StructuredContent)
	if got := mustStructuredList(t, searchPayload["results"]); len(got) != 0 {
		t.Fatalf("expected disabled plugin search results to be empty, got %#v", got)
	}

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::missing",
		},
	})
	if err != nil {
		t.Fatalf("call unknown active plugin get_ui_setting_value: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected structured plugin missing-setting response, got %#v", result.StructuredContent)
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	errorPayload := mustStructuredMap(t, payload["error"])
	if errorPayload["code"] != string(uisettings.ErrorCodeSettingNotFound) {
		t.Fatalf("expected setting_not_found for unknown active plugin setting, got %#v", errorPayload["code"])
	}
}

func TestServerUISettingToolsReturnPluginUnavailableForDisabledPlugin(t *testing.T) {
	t.Parallel()

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
	if _, err := service.Disable(context.Background(), plugins.EnableDisableOptions{
		PluginID: "setta-fixture-full",
	}); err != nil {
		t.Fatalf("disable full fixture plugin: %v", err)
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, roots.workspaceRoot, projectRuntime, ServerOptions{
		WorkspaceRoot:   roots.workspaceRoot,
		ProjectState:    projectRuntime,
		LSPDiagnostics:  openScopedTestLSPDiagnosticsRegistry(),
		PluginMutations: service,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::enabled",
		},
	})
	if err != nil {
		t.Fatalf("call disabled plugin get_ui_setting_value: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected structured disabled plugin response, got %#v", result.StructuredContent)
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	errorPayload := mustStructuredMap(t, payload["error"])
	if errorPayload["code"] != string(uisettings.ErrorCodePluginUnavailable) {
		t.Fatalf("expected plugin_unavailable for disabled plugin setting, got %#v", errorPayload["code"])
	}
}

func TestServerUISettingToolsSkipDuplicatePluginSettingIDsAndKeepUnknownSettingDistinct(t *testing.T) {
	t.Parallel()

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

	schemaPath := filepath.Join(
		roots.workspaceRoot,
		".setta_plugins",
		"setta-fixture-full",
		"content",
		"config",
		"schema.json",
	)
	schemaPayload, err := os.ReadFile(schemaPath)
	if err != nil {
		t.Fatalf("read plugin schema: %v", err)
	}
	var schema map[string]any
	if err := json.Unmarshal(schemaPayload, &schema); err != nil {
		t.Fatalf("decode plugin schema: %v", err)
	}
	rawEntries, ok := schema["x-setta-ui-settings"].([]any)
	if !ok || len(rawEntries) == 0 {
		t.Fatalf("expected x-setta-ui-settings entries, got %#v", schema["x-setta-ui-settings"])
	}
	firstEntry, ok := rawEntries[0].(map[string]any)
	if !ok {
		t.Fatalf("expected first ui setting entry to be an object, got %#v", rawEntries[0])
	}
	duplicateEntry := make(map[string]any, len(firstEntry))
	for key, value := range firstEntry {
		duplicateEntry[key] = value
	}
	schema["x-setta-ui-settings"] = append(rawEntries, duplicateEntry)
	encodedSchema, err := json.MarshalIndent(schema, "", "  ")
	if err != nil {
		t.Fatalf("encode plugin schema: %v", err)
	}
	encodedSchema = append(encodedSchema, '\n')
	if err := os.WriteFile(schemaPath, encodedSchema, 0o644); err != nil {
		t.Fatalf("write plugin schema: %v", err)
	}
	if _, err := service.Rescan(); err != nil {
		t.Fatalf("rescan plugin runtime after duplicate setting injection: %v", err)
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, roots.workspaceRoot, projectRuntime, ServerOptions{
		WorkspaceRoot:   roots.workspaceRoot,
		ProjectState:    projectRuntime,
		LSPDiagnostics:  openScopedTestLSPDiagnosticsRegistry(),
		PluginMutations: service,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	searchResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "search_ui_settings",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"query":           "full fixture enabled",
			"sourceFilter":    "plugin",
		},
	})
	if err != nil {
		t.Fatalf("call duplicate-setting search_ui_settings: %v", err)
	}
	if searchResult.IsError {
		t.Fatalf("expected duplicate-setting search_ui_settings success, got %#v", searchResult.StructuredContent)
	}
	searchPayload := mustStructuredMap(t, searchResult.StructuredContent)
	searchResults := mustStructuredList(t, searchPayload["results"])
	searchResultIDs := make([]string, 0, len(searchResults))
	for _, rawResult := range searchResults {
		searchResultIDs = append(searchResultIDs, mustStructuredMap(t, rawResult)["settingId"].(string))
	}
	for _, settingID := range searchResultIDs {
		if settingID == "plugin::setta-fixture-full::enabled" {
			t.Fatalf("expected duplicated setting id to be omitted from search results, got %#v", searchResultIDs)
		}
	}
	foundLabel := false
	for _, settingID := range searchResultIDs {
		if settingID == "plugin::setta-fixture-full::label" {
			foundLabel = true
			break
		}
	}
	if !foundLabel {
		t.Fatalf("expected healthy plugin setting to remain searchable, got %#v", searchResultIDs)
	}

	knownInvalidResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::enabled",
		},
	})
	if err != nil {
		t.Fatalf("call duplicated plugin setting get_ui_setting_value: %v", err)
	}
	if knownInvalidResult.IsError {
		t.Fatalf("expected structured duplicated-setting response, got %#v", knownInvalidResult.StructuredContent)
	}
	knownInvalidPayload := mustStructuredMap(t, knownInvalidResult.StructuredContent)
	knownInvalidError := mustStructuredMap(t, knownInvalidPayload["error"])
	if knownInvalidError["code"] != string(uisettings.ErrorCodePluginUnavailable) {
		t.Fatalf("expected plugin_unavailable for duplicated plugin setting, got %#v", knownInvalidError["code"])
	}

	unknownResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::unknown_setting",
		},
	})
	if err != nil {
		t.Fatalf("call unknown plugin setting get_ui_setting_value: %v", err)
	}
	if unknownResult.IsError {
		t.Fatalf("expected structured unknown-setting response, got %#v", unknownResult.StructuredContent)
	}
	unknownPayload := mustStructuredMap(t, unknownResult.StructuredContent)
	unknownError := mustStructuredMap(t, unknownPayload["error"])
	if unknownError["code"] != string(uisettings.ErrorCodeSettingNotFound) {
		t.Fatalf("expected setting_not_found for unknown plugin setting, got %#v", unknownError["code"])
	}
}

func TestServerUISettingToolsReturnPluginUnavailableForSchemaInvalidSettingAndKeepHealthySibling(t *testing.T) {
	t.Parallel()

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

	schemaPath := filepath.Join(
		roots.workspaceRoot,
		".setta_plugins",
		"setta-fixture-full",
		"content",
		"config",
		"schema.json",
	)
	schemaPayload, err := os.ReadFile(schemaPath)
	if err != nil {
		t.Fatalf("read plugin schema: %v", err)
	}
	var schema map[string]any
	if err := json.Unmarshal(schemaPayload, &schema); err != nil {
		t.Fatalf("decode plugin schema: %v", err)
	}
	rawEntries, ok := schema["x-setta-ui-settings"].([]any)
	if !ok || len(rawEntries) == 0 {
		t.Fatalf("expected x-setta-ui-settings entries, got %#v", schema["x-setta-ui-settings"])
	}
	firstEntry, ok := rawEntries[0].(map[string]any)
	if !ok {
		t.Fatalf("expected first ui setting entry to be an object, got %#v", rawEntries[0])
	}
	firstEntry["defaultValue"] = "not-a-boolean-default"
	encodedSchema, err := json.MarshalIndent(schema, "", "  ")
	if err != nil {
		t.Fatalf("encode plugin schema: %v", err)
	}
	encodedSchema = append(encodedSchema, '\n')
	if err := os.WriteFile(schemaPath, encodedSchema, 0o644); err != nil {
		t.Fatalf("write plugin schema: %v", err)
	}
	if _, err := service.Rescan(); err != nil {
		t.Fatalf("rescan plugin runtime after invalid default injection: %v", err)
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, roots.workspaceRoot, projectRuntime, ServerOptions{
		WorkspaceRoot:   roots.workspaceRoot,
		ProjectState:    projectRuntime,
		LSPDiagnostics:  openScopedTestLSPDiagnosticsRegistry(),
		PluginMutations: service,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	invalidResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::enabled",
		},
	})
	if err != nil {
		t.Fatalf("call schema-invalid plugin setting get_ui_setting_value: %v", err)
	}
	if invalidResult.IsError {
		t.Fatalf("expected structured schema-invalid response, got %#v", invalidResult.StructuredContent)
	}
	invalidPayload := mustStructuredMap(t, invalidResult.StructuredContent)
	invalidError := mustStructuredMap(t, invalidPayload["error"])
	if invalidError["code"] != string(uisettings.ErrorCodePluginUnavailable) {
		t.Fatalf("expected plugin_unavailable for schema-invalid plugin setting, got %#v", invalidError["code"])
	}

	healthyResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::label",
		},
	})
	if err != nil {
		t.Fatalf("call healthy sibling plugin get_ui_setting_value: %v", err)
	}
	if healthyResult.IsError {
		t.Fatalf("expected healthy sibling plugin setting success, got %#v", healthyResult.StructuredContent)
	}
	healthyPayload := mustStructuredMap(t, healthyResult.StructuredContent)
	if healthyPayload["value"] != "unset" {
		t.Fatalf("expected healthy sibling plugin setting to remain readable, got %#v", healthyPayload["value"])
	}
}

func TestServerUISettingToolsRejectPersistedCorruptPluginConfigRootWithoutRewrite(t *testing.T) {
	t.Parallel()

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

	pluginsStatePath := filepath.Join(roots.settaFilesRoot, "plugins_state.json")
	pluginsStatePayload, err := os.ReadFile(pluginsStatePath)
	if err != nil {
		t.Fatalf("read plugins state: %v", err)
	}
	var pluginsState map[string]any
	if err := json.Unmarshal(pluginsStatePayload, &pluginsState); err != nil {
		t.Fatalf("decode plugins state: %v", err)
	}
	pluginsState["pluginConfigById"] = map[string]any{
		string(plugins.PluginScopeWorkspace) + ":setta-fixture-full": "invalid-root",
	}
	encodedState, err := json.MarshalIndent(pluginsState, "", "  ")
	if err != nil {
		t.Fatalf("encode plugins state: %v", err)
	}
	encodedState = append(encodedState, '\n')
	if err := os.WriteFile(pluginsStatePath, encodedState, 0o644); err != nil {
		t.Fatalf("write corrupt plugins state: %v", err)
	}
	if _, err := service.Rescan(); err != nil {
		t.Fatalf("rescan plugin runtime after corrupt config root injection: %v", err)
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, roots.workspaceRoot, projectRuntime, ServerOptions{
		WorkspaceRoot:   roots.workspaceRoot,
		ProjectState:    projectRuntime,
		LSPDiagnostics:  openScopedTestLSPDiagnosticsRegistry(),
		PluginMutations: service,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	getResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::enabled",
		},
	})
	if err != nil {
		t.Fatalf("call corrupt-root plugin get_ui_setting_value: %v", err)
	}
	if getResult.IsError {
		t.Fatalf("expected structured corrupt-root get response, got %#v", getResult.StructuredContent)
	}
	getPayload := mustStructuredMap(t, getResult.StructuredContent)
	getError := mustStructuredMap(t, getPayload["error"])
	if getError["code"] != string(uisettings.ErrorCodePluginUnavailable) {
		t.Fatalf("expected plugin_unavailable for corrupt-root get, got %#v", getError["code"])
	}
	if getError["message"] != "Plugin setta-fixture-full is unavailable (state=invalid)." {
		t.Fatalf("expected invalid-state message for corrupt-root get, got %#v", getError["message"])
	}

	setResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::enabled",
			"value":           true,
		},
	})
	if err != nil {
		t.Fatalf("call corrupt-root plugin set_ui_setting_value: %v", err)
	}
	if setResult.IsError {
		t.Fatalf("expected structured corrupt-root set response, got %#v", setResult.StructuredContent)
	}
	setPayload := mustStructuredMap(t, setResult.StructuredContent)
	setError := mustStructuredMap(t, setPayload["error"])
	if setError["code"] != string(uisettings.ErrorCodePluginUnavailable) {
		t.Fatalf("expected plugin_unavailable for corrupt-root set, got %#v", setError["code"])
	}
	if setError["message"] != getError["message"] {
		t.Fatalf("expected corrupt-root get/set to share the same error, got get=%#v set=%#v", getError, setError)
	}

	persistedStatePayload, err := os.ReadFile(pluginsStatePath)
	if err != nil {
		t.Fatalf("read plugins state after failed write: %v", err)
	}
	var persistedState map[string]any
	if err := json.Unmarshal(persistedStatePayload, &persistedState); err != nil {
		t.Fatalf("decode plugins state after failed write: %v", err)
	}
	pluginConfigByID, ok := persistedState["pluginConfigById"].(map[string]any)
	if !ok {
		t.Fatalf("expected pluginConfigById object after failed write, got %#v", persistedState["pluginConfigById"])
	}
	if pluginConfigByID[string(plugins.PluginScopeWorkspace)+":setta-fixture-full"] != "invalid-root" {
		t.Fatalf("expected corrupt persisted root to remain unchanged, got %#v", pluginConfigByID)
	}
}

func TestServerUISettingToolsReturnPluginUnavailableForReadWriteWhenRegisterPaneCapabilityNotEffective(t *testing.T) {
	t.Parallel()

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

	manifestPath := filepath.Join(
		roots.workspaceRoot,
		".setta_plugins",
		"setta-fixture-full",
		"setta.plugin.json",
	)
	manifestPayload, err := os.ReadFile(manifestPath)
	if err != nil {
		t.Fatalf("read plugin manifest: %v", err)
	}
	var manifest map[string]any
	if err := json.Unmarshal(manifestPayload, &manifest); err != nil {
		t.Fatalf("decode plugin manifest: %v", err)
	}
	manifest["capabilities"] = []any{"registerSectionKinds", "registerCommand"}
	encodedManifest, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		t.Fatalf("encode plugin manifest: %v", err)
	}
	encodedManifest = append(encodedManifest, '\n')
	if err := os.WriteFile(manifestPath, encodedManifest, 0o644); err != nil {
		t.Fatalf("write plugin manifest: %v", err)
	}
	if _, err := service.Rescan(); err != nil {
		t.Fatalf("rescan plugin runtime after capability edit: %v", err)
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, roots.workspaceRoot, projectRuntime, ServerOptions{
		WorkspaceRoot:   roots.workspaceRoot,
		ProjectState:    projectRuntime,
		LSPDiagnostics:  openScopedTestLSPDiagnosticsRegistry(),
		PluginMutations: service,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	getResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::enabled",
		},
	})
	if err != nil {
		t.Fatalf("call capability-gated get_ui_setting_value: %v", err)
	}
	if getResult.IsError {
		t.Fatalf("expected structured capability-gated read response, got %#v", getResult.StructuredContent)
	}
	getPayload := mustStructuredMap(t, getResult.StructuredContent)
	getError := mustStructuredMap(t, getPayload["error"])
	if getError["code"] != string(uisettings.ErrorCodePluginUnavailable) {
		t.Fatalf("expected plugin_unavailable for capability-gated read, got %#v", getError["code"])
	}

	setResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::enabled",
			"value":           true,
		},
	})
	if err != nil {
		t.Fatalf("call capability-gated set_ui_setting_value: %v", err)
	}
	if setResult.IsError {
		t.Fatalf("expected structured capability-gated write response, got %#v", setResult.StructuredContent)
	}
	setPayload := mustStructuredMap(t, setResult.StructuredContent)
	setError := mustStructuredMap(t, setPayload["error"])
	if setError["code"] != string(uisettings.ErrorCodePluginUnavailable) {
		t.Fatalf("expected plugin_unavailable for capability-gated write, got %#v", setError["code"])
	}
}

func mustFindPluginListEntry(t *testing.T, entries []plugins.ListEntry, pluginID string) plugins.ListEntry {
	t.Helper()

	for _, entry := range entries {
		if entry.PluginID == pluginID {
			return entry
		}
	}
	t.Fatalf("expected plugin list entry for %s, got %#v", pluginID, entries)
	return plugins.ListEntry{}
}

func testStringPointer(value string) *string {
	return &value
}
