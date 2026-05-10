package mcpx

import (
	"context"
	"testing"

	"setta/internal/realtime"
	"setta/internal/uisettings"

	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"
)

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

	_, clientSession := newScopedTestServerSessionWithBackendWatchCodeSettingsAndOptions(t, t.TempDir(), projectRuntime, ServerOptions{
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

func TestServerRevealUISettingFailsClosedWhenRevealRuntimeUnavailable(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot: t.TempDir(),
		ProjectState:  projectRuntime,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", false)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "reveal_ui_setting",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "core.project.show_param_display_names",
		},
	})
	if err != nil {
		t.Fatalf("call reveal_ui_setting without runtime: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected reveal_ui_setting without runtime to fail")
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "internal_error" {
		t.Fatalf("expected internal_error code, got %#v", payload["code"])
	}
	if payload["message"] != "UI setting reveal runtime is unavailable." {
		t.Fatalf("expected unavailable message, got %#v", payload["message"])
	}
}

func TestServerRevealUISettingUsesRequestMetaProjectAndSectionWhenSessionMissing(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	mustCloneScopedTestProject(t, projectRuntime, "project-beta", "project-alpha")

	revealService := &recordingRevealService{
		result: uisettings.RevealResult{
			RequestID:          "request-meta-project",
			ProjectConfigID:    "project-beta",
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

	_, clientSession := newScopedTestServerSessionWithBackendWatchCodeSettingsAndOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:    t.TempDir(),
		ProjectState:     projectRuntime,
		UISettingReveals: revealService,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "reveal_ui_setting",
		Meta: sdkmcp.Meta{
			"projectConfigId": "project-beta",
			"sectionId":       "chat-section",
		},
		Arguments: map[string]any{
			"settingId":           "core.project.show_param_display_names",
			"sectionIdToActivate": "allowed-callable-section",
			"durationMs":          1500,
		},
	})
	if err != nil {
		t.Fatalf("call reveal_ui_setting with request-meta project/section context: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected reveal_ui_setting with request-meta project/section context success, got %#v", result.StructuredContent)
	}

	if revealService.input.ProjectConfigID != "project-beta" {
		t.Fatalf("expected request-meta projectConfigId project-beta, got %q", revealService.input.ProjectConfigID)
	}
	if revealService.input.ContextSectionID != "chat-section" {
		t.Fatalf("expected request-meta sectionId chat-section, got %q", revealService.input.ContextSectionID)
	}
	if revealService.input.SectionIDToActivate != "allowed-callable-section" {
		t.Fatalf("expected explicit section override allowed-callable-section, got %q", revealService.input.SectionIDToActivate)
	}
}

func TestServerRevealUISettingDefaultsProjectAndSectionFromAgenticContext(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	mustCloneScopedTestProject(t, projectRuntime, "project-beta", "project-alpha")

	revealService := &recordingRevealService{
		result: uisettings.RevealResult{
			RequestID:          "request-agentic-project",
			ProjectConfigID:    "project-beta",
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

	_, clientSession := newScopedTestServerSessionWithBackendWatchCodeSettingsAndOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:    t.TempDir(),
		ProjectState:     projectRuntime,
		UISettingReveals: revealService,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-beta", "chat-1", "chat-section", false)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "reveal_ui_setting",
		Arguments: map[string]any{
			"settingId":  "core.project.show_param_display_names",
			"durationMs": 1500,
		},
	})
	if err != nil {
		t.Fatalf("call reveal_ui_setting with agentic-context defaults: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected reveal_ui_setting with agentic-context defaults success, got %#v", result.StructuredContent)
	}

	if revealService.input.ProjectConfigID != "project-beta" {
		t.Fatalf("expected agentic-context projectConfigId project-beta, got %q", revealService.input.ProjectConfigID)
	}
	if revealService.input.ContextSectionID != "chat-section" {
		t.Fatalf("expected agentic-context sectionId chat-section, got %q", revealService.input.ContextSectionID)
	}
	if revealService.input.SectionIDToActivate != "" {
		t.Fatalf("expected no explicit section override, got %q", revealService.input.SectionIDToActivate)
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

	_, clientSession := newScopedTestServerSessionWithBackendWatchCodeSettingsAndOptions(t, t.TempDir(), projectRuntime, ServerOptions{
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

func TestServerRevealUISettingPrefersSessionShareSessionIDOverRequestMeta(t *testing.T) {
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

	_, clientSession := newScopedTestServerSessionWithBackendWatchCodeSettingsAndOptions(t, t.TempDir(), projectRuntime, ServerOptions{
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
		"share-session-from-context",
		false,
	)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "reveal_ui_setting",
		Meta: sdkmcp.Meta{
			"shareSessionId": "share-session-from-request",
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "core.project.show_param_display_names",
		},
	})
	if err != nil {
		t.Fatalf("call reveal_ui_setting with conflicting shareSessionId meta: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected reveal_ui_setting success, got %#v", result.StructuredContent)
	}
	if revealService.input.ShareSessionID != "share-session-from-context" {
		t.Fatalf("expected session shareSessionID, got %q", revealService.input.ShareSessionID)
	}
}

func TestServerRevealUISettingIgnoresRequestMetaShareSessionIDWithoutSessionShareScope(t *testing.T) {
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

	_, clientSession := newScopedTestServerSessionWithBackendWatchCodeSettingsAndOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:    t.TempDir(),
		ProjectState:     projectRuntime,
		UISettingReveals: revealService,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", false)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "reveal_ui_setting",
		Meta: sdkmcp.Meta{
			"shareSessionId":        "share-session-from-request",
			"frontendAffinityToken": "frontend-from-request",
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "core.project.show_param_display_names",
		},
	})
	if err != nil {
		t.Fatalf("call reveal_ui_setting with request shareSessionId: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected reveal_ui_setting success, got %#v", result.StructuredContent)
	}
	if revealService.input.ShareSessionID != "" {
		t.Fatalf("expected request shareSessionId to be ignored, got %q", revealService.input.ShareSessionID)
	}
	if revealService.input.FrontendAffinityToken != "frontend-from-request" {
		t.Fatalf("expected request frontend affinity token to be preserved, got %q", revealService.input.FrontendAffinityToken)
	}
}

func TestServerRevealUISettingShareScopeKeepsRequestMetaFrontendAffinityWhenSessionAffinityMissing(t *testing.T) {
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

	_, clientSession := newScopedTestServerSessionWithBackendWatchCodeSettingsAndOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:    t.TempDir(),
		ProjectState:     projectRuntime,
		UISettingReveals: revealService,
	})
	defer clientSession.Close()

	setUISettingAgenticContextWithShareSession(
		t,
		clientSession,
		"project-alpha",
		"",
		"",
		"share-session-1",
		true,
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
		t.Fatalf("call share-scope reveal_ui_setting with request frontend affinity: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected share-scope reveal_ui_setting success, got %#v", result.StructuredContent)
	}
	if revealService.input.ShareSessionID != "share-session-1" {
		t.Fatalf("expected shareSessionID share-session-1, got %q", revealService.input.ShareSessionID)
	}
	if revealService.input.FrontendAffinityToken != "frontend-from-request" {
		t.Fatalf("expected request frontend affinity token in share scope, got %q", revealService.input.FrontendAffinityToken)
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

func TestServerRevealUISettingPrefersSessionSectionContextOverRequestMeta(t *testing.T) {
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

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", false)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "reveal_ui_setting",
		Meta: sdkmcp.Meta{
			"sectionId": "missing-section",
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "core.project.show_param_display_names",
		},
	})
	if err != nil {
		t.Fatalf("call reveal_ui_setting with conflicting sectionId meta: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected reveal_ui_setting success, got %#v", result.StructuredContent)
	}
	if revealService.input.ContextSectionID != "chat-section" {
		t.Fatalf("expected session sectionId chat-section, got %q", revealService.input.ContextSectionID)
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

func TestServerRevealUISettingShareScopeIgnoresMalformedMetaFrontendAffinityWhenSessionAffinityMissing(t *testing.T) {
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

	setUISettingAgenticContextWithShareSession(
		t,
		clientSession,
		"project-alpha",
		"",
		"",
		"share-session-1",
		true,
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
	if revealService.input.ShareSessionID != "share-session-1" {
		t.Fatalf("expected shareSessionID share-session-1, got %q", revealService.input.ShareSessionID)
	}
	if revealService.input.FrontendAffinityToken != "" {
		t.Fatalf("expected malformed request frontend affinity token to be ignored, got %q", revealService.input.FrontendAffinityToken)
	}
}

func TestServerSearchUISettingsReturnsRankedWatchCodePluginResults(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSessionWithBackendWatchCodeSettings(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", false)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "search_ui_settings",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"query":           "watch files",
			"limit":           3,
			"sourceFilter":    "plugin",
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
	if first["settingId"] != "plugin::setta-fixture-watch-code-provider::files" {
		t.Fatalf("expected top result plugin::setta-fixture-watch-code-provider::files, got %#v", first)
	}
	if first["source"] != "plugin" {
		t.Fatalf("expected plugin-sourced watch-code setting, got %#v", first)
	}

	coreOnly, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "search_ui_settings",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"query":           "watch files",
			"sourceFilter":    "core",
		},
	})
	if err != nil {
		t.Fatalf("call core-only search_ui_settings: %v", err)
	}
	if coreOnly.IsError {
		t.Fatalf("expected core-only search_ui_settings success, got %#v", coreOnly.StructuredContent)
	}
	corePayload := mustStructuredMap(t, coreOnly.StructuredContent)
	for _, rawResult := range mustStructuredList(t, corePayload["results"]) {
		resultMap := mustStructuredMap(t, rawResult)
		if resultMap["settingId"] == "plugin::setta-fixture-watch-code-provider::files" {
			t.Fatalf("expected no core watch-code UI setting results, got %#v", corePayload["results"])
		}
	}
}

func TestServerSearchUISettingsRejectsBlankQuery(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", false)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "search_ui_settings",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"query":           "   ",
		},
	})
	if err != nil {
		t.Fatalf("call blank search_ui_settings: %v", err)
	}
	if !result.IsError {
		t.Fatalf("expected blank search_ui_settings to fail, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
	}
	if payload["message"] != "query must not be empty" {
		t.Fatalf("expected blank-query message, got %#v", payload["message"])
	}
}

func TestServerGetUISettingValueRejectsMalformedProjectConfigIDMetaWithoutFallbackToArgument(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Meta: sdkmcp.Meta{
			"projectConfigId": 123,
			"sectionId":       "chat-section",
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-watch-code-provider::files",
		},
	})
	if err != nil {
		t.Fatalf("call get_ui_setting_value with malformed projectConfigId meta: %v", err)
	}
	if !result.IsError {
		t.Fatalf("expected malformed projectConfigId meta to fail, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
	}
	if payload["message"] != "projectConfigId metadata must be a string" {
		t.Fatalf("expected malformed projectConfigId meta message, got %#v", payload["message"])
	}
}
