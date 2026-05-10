package externalagents

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"setta/internal/agentprofiles"
	"setta/internal/agentruns"
	appsubsystemchatmodes "setta/internal/appsubsystem/chatmodes"
	"setta/internal/auth"
	"setta/internal/chatattachments"
	"setta/internal/chatmodes"
	"setta/internal/externalagentconfigs"
	"setta/internal/mcpx"
	"setta/internal/projectstate"
	"setta/internal/settingsstate"
)

type stubPreflightChecker struct {
	status externalagentconfigs.Status
	err    error
}

func (s stubPreflightChecker) Check(config externalagentconfigs.Config) (externalagentconfigs.Status, error) {
	if s.err != nil {
		return externalagentconfigs.Status{}, s.err
	}
	status := s.status
	if status.ConfigID == "" {
		status.ConfigID = config.ID
		status.Name = config.Name
		status.ToolType = config.ToolType
		status.RunMode = config.RunMode
		status.Supported = true
		status.Available = true
		status.Issues = []string{}
	}
	return status, nil
}

type stubExternalAgentExecutor struct {
	last      *StartRequest
	response  StartResponse
	err       error
	startCall int
}

func (s *stubExternalAgentExecutor) Start(_ context.Context, request StartRequest) (StartResponse, error) {
	s.startCall++
	cloned := request
	cloned.Inputs = cloneAnyMap(request.Inputs)
	if request.Profile != nil {
		cloned.Profile = cloneProfilePtr(request.Profile)
	}
	s.last = &cloned
	if s.err != nil {
		return StartResponse{}, s.err
	}
	return s.response, nil
}

func testSendAppGenerationModes(t *testing.T) chatmodes.AppGenerationModeResolver {
	t.Helper()

	resolver, err := chatmodes.NewAppGenerationModeRegistry(chatmodes.AppGenerationModeRegistryOptions{
		Available:     func() bool { return true },
		Contributions: appsubsystemchatmodes.BuildChatModeContributions(),
	})
	if err != nil {
		t.Fatalf("new app generation mode resolver: %v", err)
	}
	return resolver
}

func TestSendServiceStartsExternalChatAndPersistsRunningRun(t *testing.T) {
	t.Parallel()

	fixture := newSendServiceFixture(t, sendFixtureOptions{
		completionGuardEnabled: boolPtr(true),
	})
	result, err := fixture.service.StartChat(context.Background(), StartChatRequest{
		Message: map[string]any{
			"id":   "user-1",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Create a new section."},
			},
		},
		EngineConfigID:        fixture.engineID,
		Thinking:              false,
		ProjectConfigID:       "project-alpha",
		AllowUnscoped:         true,
		FrontendAffinityToken: stringPtr("  frontend-external  "),
		PermissionMode:        projectstate.ChatPermissionModeMinimal,
		SearchEnabled:         false,
		AdditionalInputs: map[string]any{
			"stateMachineRunId": "workflow-run-1",
		},
	})
	if err != nil {
		t.Fatalf("start external chat: %v", err)
	}
	if result.ChatID == "" {
		t.Fatal("expected chat id")
	}
	if result.Run.Status != agentruns.RunStatusRunning {
		t.Fatalf("expected running status, got %#v", result.Run)
	}
	if fixture.executor.last == nil {
		t.Fatal("expected executor request")
	}
	inputs := fixture.executor.last.Inputs
	if got := inputs["permissionMode"]; got != "minimal" {
		t.Fatalf("unexpected permissionMode %#v", got)
	}
	if got := inputs["searchEnabled"]; got != false {
		t.Fatalf("unexpected searchEnabled %#v", got)
	}
	if got := inputs["frontendAffinityToken"]; got != "frontend-external" {
		t.Fatalf("unexpected frontendAffinityToken %#v", got)
	}
	if got := inputs["approvalPolicy"]; got != "on-request" {
		t.Fatalf("unexpected approvalPolicy %#v", got)
	}
	if got := inputs["sandboxPolicy"]; got != "workspace-write" {
		t.Fatalf("unexpected sandboxPolicy %#v", got)
	}
	if got := inputs["effort"]; got != "low" {
		t.Fatalf("unexpected effort %#v", got)
	}
	if got := inputs["summary"]; got != "none" {
		t.Fatalf("unexpected summary %#v", got)
	}
	if got := inputs["stateMachineRunId"]; got != "workflow-run-1" {
		t.Fatalf("unexpected additional external input %#v", got)
	}
	systemPrompt, _ := inputs["systemPrompt"].(string)
	if systemPrompt == "" {
		t.Fatal("expected system prompt")
	}
	if want := "## Runtime execution settings"; !containsText(systemPrompt, want) {
		t.Fatalf("expected system prompt to contain %q, got %q", want, systemPrompt)
	}
	if want := "- permissionMode: minimal"; !containsText(systemPrompt, want) {
		t.Fatalf("expected system prompt to contain %q, got %q", want, systemPrompt)
	}
	if want := "## Required completion gate for create/scaffold work"; !containsText(systemPrompt, want) {
		t.Fatalf("expected system prompt to contain %q, got %q", want, systemPrompt)
	}

	persisted, err := fixture.runs.Load(result.Run.ID)
	if err != nil {
		t.Fatalf("load persisted run: %v", err)
	}
	if persisted.Status != agentruns.RunStatusRunning {
		t.Fatalf("expected persisted running status, got %#v", persisted)
	}
	if got := resolveRunInputString(persisted, "chatId"); got != result.ChatID {
		t.Fatalf("expected persisted chat id %q, got %q", result.ChatID, got)
	}
	if len(persisted.Events) == 0 || persisted.Events[len(persisted.Events)-1].Type != "run_started" {
		t.Fatalf("expected run_started event, got %#v", persisted.Events)
	}
	liveState, err := fixture.runtime.GetLiveChatState(result.Run.ID)
	if err != nil {
		t.Fatalf("get live chat state: %v", err)
	}
	if liveState == nil || !liveState.WaitingForResponse {
		t.Fatalf("expected live waiting state, got %#v", liveState)
	}
	if len(liveState.Messages) != 1 {
		t.Fatalf("expected one live message, got %#v", liveState.Messages)
	}
}

func TestSendServiceOmitsCompletionGatePromptWhenGuardDisabled(t *testing.T) {
	t.Parallel()

	fixture := newSendServiceFixture(t, sendFixtureOptions{
		completionGuardEnabled: boolPtr(false),
	})
	_, err := fixture.service.StartChat(context.Background(), StartChatRequest{
		Message: map[string]any{
			"id":   "user-guard-off",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Create a new section."},
			},
		},
		EngineConfigID:  fixture.engineID,
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		PermissionMode:  projectstate.ChatPermissionModeMinimal,
		SearchEnabled:   false,
	})
	if err != nil {
		t.Fatalf("start external chat with guard disabled: %v", err)
	}
	if fixture.executor.last == nil {
		t.Fatal("expected executor request")
	}
	systemPrompt, _ := fixture.executor.last.Inputs["systemPrompt"].(string)
	if containsText(systemPrompt, "## Required completion gate for create/scaffold work") {
		t.Fatalf("expected completion gate prompt to be omitted when guard is disabled, got %q", systemPrompt)
	}
}

func TestSendServiceRejectsUnsupportedAppGenerationModeWhenUnavailable(t *testing.T) {
	t.Parallel()

	fixture := newSendServiceFixture(t, sendFixtureOptions{})
	fixture.service.appGenerationModes = nil

	_, err := fixture.service.StartChat(context.Background(), StartChatRequest{
		Message: map[string]any{
			"id":   "user-app-disabled",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Build the app."},
			},
		},
		EngineConfigID:    fixture.engineID,
		ProjectConfigID:   "project-alpha",
		AllowUnscoped:     true,
		PermissionMode:    projectstate.ChatPermissionModeMinimal,
		SearchEnabled:     false,
		AppGenerationMode: stringPtr(string(agentruns.AppGenerationModeJSONRender)),
	})
	if !errors.Is(err, ErrAppGenerationModeInvalid) {
		t.Fatalf("expected unavailable app-generation mode error, got %v", err)
	}
}

func TestSendServiceSnapshotsCompletionGuardSettingIntoRunInputs(t *testing.T) {
	t.Parallel()

	fixture := newSendServiceFixture(t, sendFixtureOptions{
		completionGuardEnabled: boolPtr(false),
	})
	result, err := fixture.service.StartChat(context.Background(), StartChatRequest{
		Message: map[string]any{
			"id":   "user-guard-snapshot",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Create a new section."},
			},
		},
		EngineConfigID:  fixture.engineID,
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		PermissionMode:  projectstate.ChatPermissionModeMinimal,
		SearchEnabled:   false,
	})
	if err != nil {
		t.Fatalf("start external chat with cached guard setting: %v", err)
	}

	writeSendCompletionGuardSetting(t, fixture.root, true)

	persisted, err := fixture.runs.Load(result.Run.ID)
	if err != nil {
		t.Fatalf("load persisted run: %v", err)
	}
	if got, ok := persisted.Inputs["completionGuardEnabled"].(bool); !ok || got {
		t.Fatalf("expected persisted completionGuardEnabled=false snapshot, got %#v", persisted.Inputs["completionGuardEnabled"])
	}
	if fixture.executor.last == nil {
		t.Fatal("expected executor request")
	}
	systemPrompt, _ := fixture.executor.last.Inputs["systemPrompt"].(string)
	if containsText(systemPrompt, "## Required completion gate for create/scaffold work") {
		t.Fatalf("expected cached system prompt to remain guard-disabled, got %q", systemPrompt)
	}
}

func TestSendServiceBuildsClaudeAllowedToolsFromProfileWhenGuardEnabled(t *testing.T) {
	t.Parallel()

	fixture := newSendServiceFixture(t, sendFixtureOptions{
		externalToolType:       externalagentconfigs.ToolTypeClaudeCode,
		externalRunMode:        externalagentconfigs.RunModeSDK,
		completionGuardEnabled: boolPtr(true),
	})
	profile := agentprofiles.Profile{
		ID:             "profile-claude",
		Name:           "Claude",
		EngineConfigID: &fixture.engineID,
		ToolAllowlist:  []string{"setta__getProjectState"},
	}
	if err := fixture.profiles.Write([]agentprofiles.Profile{profile}); err != nil {
		t.Fatalf("write claude profile: %v", err)
	}

	_, err := fixture.service.StartChat(context.Background(), StartChatRequest{
		Message: map[string]any{
			"id":   "user-claude",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Scaffold the app."},
			},
		},
		EngineConfigID:  fixture.engineID,
		AgentProfileID:  stringPtr(profile.ID),
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		PermissionMode:  projectstate.ChatPermissionModeMinimal,
		SearchEnabled:   false,
	})
	if err != nil {
		t.Fatalf("start claude external chat: %v", err)
	}
	if fixture.executor.last == nil {
		t.Fatal("expected executor request")
	}
	allowedTools := stringSliceValueAny(fixture.executor.last.Inputs["allowedTools"])
	if strings.Join(allowedTools, ",") != strings.Join([]string{
		"mcp__setta__getProjectState",
		"mcp__setta__set_agentic_context",
		"mcp__setta__report_completion_status",
	}, ",") {
		t.Fatalf("expected Claude allowedTools to include required completion tools, got %#v", fixture.executor.last.Inputs["allowedTools"])
	}
}

func TestSendServiceOmitsClaudeCompletionReportToolWhenGuardDisabled(t *testing.T) {
	t.Parallel()

	fixture := newSendServiceFixture(t, sendFixtureOptions{
		externalToolType:       externalagentconfigs.ToolTypeClaudeCode,
		externalRunMode:        externalagentconfigs.RunModeSDK,
		completionGuardEnabled: boolPtr(false),
	})
	profile := agentprofiles.Profile{
		ID:             "profile-claude",
		Name:           "Claude",
		EngineConfigID: &fixture.engineID,
		ToolAllowlist:  []string{"setta__getProjectState"},
	}
	if err := fixture.profiles.Write([]agentprofiles.Profile{profile}); err != nil {
		t.Fatalf("write claude profile: %v", err)
	}

	_, err := fixture.service.StartChat(context.Background(), StartChatRequest{
		Message: map[string]any{
			"id":   "user-claude",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Scaffold the app."},
			},
		},
		EngineConfigID:  fixture.engineID,
		AgentProfileID:  stringPtr(profile.ID),
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		PermissionMode:  projectstate.ChatPermissionModeMinimal,
		SearchEnabled:   false,
	})
	if err != nil {
		t.Fatalf("start claude external chat with guard disabled: %v", err)
	}
	if fixture.executor.last == nil {
		t.Fatal("expected executor request")
	}
	allowedTools := stringSliceValueAny(fixture.executor.last.Inputs["allowedTools"])
	if strings.Join(allowedTools, ",") != strings.Join([]string{
		"mcp__setta__getProjectState",
		"mcp__setta__set_agentic_context",
	}, ",") {
		t.Fatalf("expected Claude allowedTools to omit completion-report tool when guard is disabled, got %#v", fixture.executor.last.Inputs["allowedTools"])
	}
}

func TestSendServiceAppliesCodexThinkingReasoningDefaults(t *testing.T) {
	t.Parallel()

	fixture := newSendServiceFixture(t, sendFixtureOptions{})

	_, err := fixture.service.StartChat(context.Background(), StartChatRequest{
		Message: map[string]any{
			"id":   "user-thinking",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Think carefully through this refactor."},
			},
		},
		EngineConfigID:  fixture.engineID,
		Thinking:        true,
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		PermissionMode:  projectstate.ChatPermissionModeMinimal,
		SearchEnabled:   true,
	})
	if err != nil {
		t.Fatalf("start thinking external chat: %v", err)
	}
	if fixture.executor.last == nil {
		t.Fatal("expected executor request")
	}
	if got := fixture.executor.last.Inputs["effort"]; got != "high" {
		t.Fatalf("expected thinking run to default effort=high, got %#v", got)
	}
	if got := fixture.executor.last.Inputs["summary"]; got != "auto" {
		t.Fatalf("expected thinking run to default summary=auto, got %#v", got)
	}
}

func TestSendServiceComposesExternalPromptFromProfileAndAppGenerationMode(t *testing.T) {
	t.Parallel()

	fixture := newSendServiceFixture(t, sendFixtureOptions{})
	profile := agentprofiles.Profile{
		ID:             "profile-app-builder",
		Name:           "App Builder",
		Description:    "Build polished app specs.",
		SystemPrompt:   "Prioritize clean structure and concise tool use.",
		EngineConfigID: stringPtr(fixture.engineID),
		ToolAllowlist:  []string{"mcp__setta__set_app_definition"},
	}
	if err := fixture.profiles.Write([]agentprofiles.Profile{profile}); err != nil {
		t.Fatalf("write agent profiles: %v", err)
	}

	_, err := fixture.service.StartChat(context.Background(), StartChatRequest{
		Message: map[string]any{
			"id":   "user-1",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Generate the app spec."},
			},
		},
		EngineConfigID:          fixture.engineID,
		AgentProfileID:          stringPtr(profile.ID),
		Thinking:                false,
		ProjectConfigID:         "project-alpha",
		AllowUnscoped:           true,
		PermissionMode:          projectstate.ChatPermissionModeYOLO,
		SearchEnabled:           false,
		AppSpecStreamingEnabled: true,
		AppGenerationMode:       stringPtr(string(agentruns.AppGenerationModeJSONRender)),
	})
	if err != nil {
		t.Fatalf("start external app-generation chat: %v", err)
	}
	if fixture.executor.last == nil {
		t.Fatal("expected executor request")
	}
	if fixture.executor.last.Profile == nil || fixture.executor.last.Profile.ID != profile.ID {
		t.Fatalf("expected executor profile to be preserved, got %#v", fixture.executor.last.Profile)
	}

	systemPrompt, _ := fixture.executor.last.Inputs["systemPrompt"].(string)
	if !containsText(systemPrompt, "## Agent profile") {
		t.Fatalf("expected system prompt to include agent profile heading, got %q", systemPrompt)
	}
	if !containsText(systemPrompt, "- name: App Builder") {
		t.Fatalf("expected system prompt to include profile name, got %q", systemPrompt)
	}
	if !containsText(systemPrompt, "- description: Build polished app specs.") {
		t.Fatalf("expected system prompt to include profile description, got %q", systemPrompt)
	}
	if !containsText(systemPrompt, "Prioritize clean structure and concise tool use.") {
		t.Fatalf("expected system prompt to include profile system prompt, got %q", systemPrompt)
	}
	if !containsText(systemPrompt, "## App spec generation mode") {
		t.Fatalf("expected system prompt to include app-generation section, got %q", systemPrompt)
	}
	if !containsText(systemPrompt, "mode: json_render") {
		t.Fatalf("expected system prompt to include app-generation mode, got %q", systemPrompt)
	}
	if !containsText(systemPrompt, "streamingPreview: enabled") {
		t.Fatalf("expected system prompt to include streaming flag, got %q", systemPrompt)
	}
	if !containsText(systemPrompt, "setta__stream_app_definition") {
		t.Fatalf("expected system prompt to include stream app definition tool guidance, got %q", systemPrompt)
	}
	if !containsText(systemPrompt, "- permissionMode: yolo") {
		t.Fatalf("expected system prompt to include execution policy prompt, got %q", systemPrompt)
	}
	if got := fixture.executor.last.Inputs["approvalPolicy"]; got != "never" {
		t.Fatalf("expected yolo approval override, got %#v", got)
	}
	if got := fixture.executor.last.Inputs["sandboxPolicy"]; got != "danger-full-access" {
		t.Fatalf("expected yolo sandbox override, got %#v", got)
	}
}

func TestSendServiceLeavesConfiguredPoliciesRuntimeOwnedForConfigTomlCustom(t *testing.T) {
	t.Parallel()

	approvalPolicy := "never"
	sandboxPolicy := "danger-full-access"
	fixture := newSendServiceFixture(t, sendFixtureOptions{
		approvalPolicy: &approvalPolicy,
		sandboxPolicy:  &sandboxPolicy,
	})

	_, err := fixture.service.StartChat(context.Background(), StartChatRequest{
		Message: map[string]any{
			"id":   "user-1",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Use the configured runtime policy."},
			},
		},
		EngineConfigID:  fixture.engineID,
		Thinking:        false,
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		PermissionMode:  projectstate.ChatPermissionModeConfigTomlCustom,
		SearchEnabled:   true,
	})
	if err != nil {
		t.Fatalf("start external chat with config_toml_custom: %v", err)
	}
	if fixture.executor.last == nil {
		t.Fatal("expected executor request")
	}

	inputs := fixture.executor.last.Inputs
	if got := inputs["permissionMode"]; got != "config_toml_custom" {
		t.Fatalf("unexpected permissionMode %#v", got)
	}
	if got := inputs["searchEnabled"]; got != true {
		t.Fatalf("unexpected searchEnabled %#v", got)
	}
	if _, ok := inputs["approvalPolicy"]; ok {
		t.Fatalf("expected config_toml_custom to omit approval override, got %#v", inputs["approvalPolicy"])
	}
	if _, ok := inputs["sandboxPolicy"]; ok {
		t.Fatalf("expected config_toml_custom to omit sandbox override, got %#v", inputs["sandboxPolicy"])
	}

	systemPrompt, _ := inputs["systemPrompt"].(string)
	if !containsText(systemPrompt, "- permissionMode: config_toml_custom") {
		t.Fatalf("expected system prompt to include config_toml_custom policy, got %q", systemPrompt)
	}
	if !containsText(systemPrompt, "- searchEnabled: true") {
		t.Fatalf("expected system prompt to include searchEnabled, got %q", systemPrompt)
	}
}

func TestSendServiceOmitsAppGenerationPromptWhenModeUnset(t *testing.T) {
	t.Parallel()

	fixture := newSendServiceFixture(t, sendFixtureOptions{})

	_, err := fixture.service.StartChat(context.Background(), StartChatRequest{
		Message: map[string]any{
			"id":   "user-1",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Regular chat without app generation."},
			},
		},
		EngineConfigID:  fixture.engineID,
		Thinking:        false,
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		PermissionMode:  projectstate.ChatPermissionModeMinimal,
		SearchEnabled:   false,
	})
	if err != nil {
		t.Fatalf("start plain external chat: %v", err)
	}
	if fixture.executor.last == nil {
		t.Fatal("expected executor request")
	}

	systemPrompt, _ := fixture.executor.last.Inputs["systemPrompt"].(string)
	if strings.Contains(systemPrompt, "## App spec generation mode") {
		t.Fatalf("expected plain external chat prompt to omit app-generation guidance, got %q", systemPrompt)
	}
}

func TestSendServiceAppliesAdapterSpecificApprovalOverrides(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name           string
		toolType       externalagentconfigs.ToolType
		permissionMode ChatPermissionMode
		wantApproval   string
	}{
		{
			name:           "claude minimal maps to default",
			toolType:       externalagentconfigs.ToolTypeClaudeCode,
			permissionMode: projectstate.ChatPermissionModeMinimal,
			wantApproval:   "default",
		},
		{
			name:           "claude yolo maps to bypassPermissions",
			toolType:       externalagentconfigs.ToolTypeClaudeCode,
			permissionMode: projectstate.ChatPermissionModeYOLO,
			wantApproval:   "bypassPermissions",
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			fixture := newSendServiceFixture(t, sendFixtureOptions{
				externalToolType: testCase.toolType,
			})

			_, err := fixture.service.StartChat(context.Background(), StartChatRequest{
				Message: map[string]any{
					"id":   "user-1",
					"role": "user",
					"content": []any{
						map[string]any{"type": "text", "text": "Start adapter-specific run."},
					},
				},
				EngineConfigID:  fixture.engineID,
				Thinking:        false,
				ProjectConfigID: "project-alpha",
				AllowUnscoped:   true,
				PermissionMode:  testCase.permissionMode,
				SearchEnabled:   false,
			})
			if err != nil {
				t.Fatalf("start external chat: %v", err)
			}
			if fixture.executor.last == nil {
				t.Fatal("expected executor request")
			}
			if got := fixture.executor.last.Inputs["approvalPolicy"]; got != testCase.wantApproval {
				t.Fatalf("expected approvalPolicy %q, got %#v", testCase.wantApproval, got)
			}
			if _, ok := fixture.executor.last.Inputs["sandboxPolicy"]; ok {
				t.Fatalf("expected non-codex adapters to omit sandbox override, got %#v", fixture.executor.last.Inputs["sandboxPolicy"])
			}
		})
	}
}

func TestSendServiceBuildsCodexAttachmentPayload(t *testing.T) {
	t.Parallel()

	fixture := newSendServiceFixture(t, sendFixtureOptions{})
	writeAttachmentFile(t, fixture.root, "artifacts/notes.txt", "Hello from attachment.")
	writeAttachmentFile(t, fixture.root, "artifacts/image.png", "png-bytes")

	_, err := fixture.service.StartChat(context.Background(), StartChatRequest{
		Message: map[string]any{
			"id":   "user-1",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Use the attachment."},
			},
			"attachments": []any{
				map[string]any{"id": "artifacts/notes.txt", "name": "notes.txt", "mimeType": "text/plain", "size": 22},
				map[string]any{"id": "artifacts/image.png", "name": "image.png", "mimeType": "image/png", "size": 9},
			},
		},
		EngineConfigID:  fixture.engineID,
		Thinking:        false,
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		PermissionMode:  projectstate.ChatPermissionModeMinimal,
		SearchEnabled:   false,
	})
	if err != nil {
		t.Fatalf("start external chat with attachments: %v", err)
	}

	inputs := fixture.executor.last.Inputs
	if _, ok := inputs["attachmentText"]; ok {
		t.Fatalf("expected codex payload to omit attachmentText, got %#v", inputs["attachmentText"])
	}
	attachmentTextNoImages, _ := inputs["attachmentTextNoImages"].(string)
	if !containsText(attachmentTextNoImages, "notes.txt") || !containsText(attachmentTextNoImages, "Hello from attachment.") {
		t.Fatalf("expected codex payload to inline text attachment, got %q", attachmentTextNoImages)
	}
	if containsText(attachmentTextNoImages, "image.png") {
		t.Fatalf("expected codex payload to omit image placeholder text, got %q", attachmentTextNoImages)
	}
	attachmentURLs, _ := inputs["attachmentUrls"].(map[string]string)
	if len(attachmentURLs) != 2 {
		t.Fatalf("expected codex payload URLs for both attachments, got %#v", inputs["attachmentUrls"])
	}
	if !containsText(attachmentURLs["artifacts/image.png"], "/api/attachments/") {
		t.Fatalf("expected codex image URL to use attachment download route, got %#v", attachmentURLs)
	}
}

func TestSendServiceBuildsClaudeAttachmentTextPayload(t *testing.T) {
	t.Parallel()

	fixture := newSendServiceFixture(t, sendFixtureOptions{
		externalToolType: externalagentconfigs.ToolTypeClaudeCode,
		externalRunMode:  externalagentconfigs.RunModeSDK,
	})
	writeAttachmentFile(t, fixture.root, "artifacts/notes.txt", "Hello from attachment.")
	writeAttachmentFile(t, fixture.root, "artifacts/image.png", "png-bytes")

	_, err := fixture.service.StartChat(context.Background(), StartChatRequest{
		Message: map[string]any{
			"id":   "user-1",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Use the attachment."},
			},
			"attachments": []any{
				map[string]any{"id": "artifacts/notes.txt", "name": "notes.txt", "mimeType": "text/plain", "size": 22},
				map[string]any{"id": "artifacts/image.png", "name": "image.png", "mimeType": "image/png", "size": 9},
			},
		},
		EngineConfigID:  fixture.engineID,
		Thinking:        false,
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		PermissionMode:  projectstate.ChatPermissionModeMinimal,
		SearchEnabled:   false,
	})
	if err != nil {
		t.Fatalf("start claude external chat with attachments: %v", err)
	}

	inputs := fixture.executor.last.Inputs
	attachmentText, _ := inputs["attachmentText"].(string)
	if !containsText(attachmentText, "notes.txt") || !containsText(attachmentText, "Hello from attachment.") {
		t.Fatalf("expected claude payload to inline text attachment, got %q", attachmentText)
	}
	if !containsText(attachmentText, "image.png") {
		t.Fatalf("expected claude payload to include image placeholder text, got %q", attachmentText)
	}
	if _, ok := inputs["attachmentTextNoImages"]; ok {
		t.Fatalf("expected claude payload to omit attachmentTextNoImages, got %#v", inputs["attachmentTextNoImages"])
	}
	if _, ok := inputs["attachmentUrls"]; ok {
		t.Fatalf("expected claude payload to omit attachmentUrls, got %#v", inputs["attachmentUrls"])
	}
}

func TestSendServiceSeedsContinuationMessagesFromPriorExternalChat(t *testing.T) {
	t.Parallel()

	fixture := newSendServiceFixture(t, sendFixtureOptions{})
	seedChatID := "chat-source"
	fixture.seedExternalRun(t, seedChatID, agentruns.RunStatusCompleted, []map[string]any{
		{
			"id":   "source-user",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Source prompt"},
			},
		},
	}, []map[string]any{
		{
			"id":   "source-user",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Source prompt"},
			},
		},
		{
			"id":   "source-assistant",
			"role": "assistant",
			"content": []any{
				map[string]any{"type": "text", "text": "Source reply"},
			},
		},
	})

	result, err := fixture.service.StartChat(context.Background(), StartChatRequest{
		ContinueFromChatID: stringPtr(seedChatID),
		Message: map[string]any{
			"id":   "new-message",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Continue externally seeded chat"},
			},
		},
		EngineConfigID:  fixture.engineID,
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		PermissionMode:  projectstate.ChatPermissionModeMinimal,
		SearchEnabled:   true,
	})
	if err != nil {
		t.Fatalf("start continuation chat: %v", err)
	}
	if result.ChatID == seedChatID {
		t.Fatalf("expected a new chat id, got %q", result.ChatID)
	}
	if fixture.executor.last == nil {
		t.Fatal("expected executor request")
	}
	rawMessages, ok := fixture.executor.last.Inputs["messages"].([]any)
	if !ok {
		t.Fatalf("expected messages list, got %#v", fixture.executor.last.Inputs["messages"])
	}
	if len(rawMessages) != 3 {
		t.Fatalf("expected three messages, got %#v", rawMessages)
	}
	gotIDs := []string{}
	for _, raw := range rawMessages {
		message, ok := raw.(map[string]any)
		if !ok {
			t.Fatalf("expected message object, got %#v", raw)
		}
		messageID, err := messageID(message)
		if err != nil {
			t.Fatalf("message id: %v", err)
		}
		gotIDs = append(gotIDs, messageID)
	}
	expectedIDs := []string{"source-user", "source-assistant", "new-message"}
	for index, expectedID := range expectedIDs {
		if gotIDs[index] != expectedID {
			t.Fatalf("expected message ids %#v, got %#v", expectedIDs, gotIDs)
		}
	}
}

func TestSendServiceEnsureExternalChatIDCompatibleRejectsMissingEngineMetadata(t *testing.T) {
	t.Parallel()

	fixture := newSendServiceFixture(t, sendFixtureOptions{})
	run := agentruns.NewRun(nil, map[string]any{
		"runType":         RunTypeExternalAgent,
		"chatId":          "chat-external-legacy",
		"projectConfigId": "project-alpha",
		"messages":        []any{},
	}, fixture.now.Add(-time.Hour))
	run.Status = agentruns.RunStatusCompleted
	finishedAt := fixture.now.Add(-30 * time.Minute)
	run.FinishedAt = &finishedAt
	if err := fixture.runs.Save(run); err != nil {
		t.Fatalf("save external run without engine metadata: %v", err)
	}

	_, err := fixture.service.ensureExternalChatIDCompatible("chat-external-legacy", fixture.engineID, "project-alpha")
	if !errors.Is(err, ErrChatEngineMismatch) {
		t.Fatalf("expected chat engine mismatch, got %v", err)
	}
}

func TestSendServiceEnsureExternalChatIDCompatibleAllowsMatchingEngineMetadata(t *testing.T) {
	t.Parallel()

	fixture := newSendServiceFixture(t, sendFixtureOptions{})
	fixture.seedExternalRun(t, "chat-external-metadata-ok", agentruns.RunStatusCompleted, []map[string]any{}, []map[string]any{})

	runs, err := fixture.service.ensureExternalChatIDCompatible("chat-external-metadata-ok", fixture.engineID, "project-alpha")
	if err != nil {
		t.Fatalf("ensure compatible chat id: %v", err)
	}
	if len(runs) != 1 {
		t.Fatalf("expected one compatible run, got %#v", runs)
	}
	inputs := runs[0].Inputs
	got, ok := inputs["chatId"].(string)
	if !ok || got != "chat-external-metadata-ok" {
		t.Fatalf("expected returned run for matching external chat, got %#v", inputs["chatId"])
	}
}

func TestSendServiceEnsureExternalChatIDCompatibleRejectsExternalEngineMismatch(t *testing.T) {
	t.Parallel()

	fixture := newSendServiceFixture(t, sendFixtureOptions{})
	run := agentruns.NewRun(nil, map[string]any{
		"runType":         RunTypeExternalAgent,
		"chatId":          "chat-external-engine-mismatch",
		"projectConfigId": "project-alpha",
		"engineConfigId":  "engine-other",
		"messages":        []any{},
	}, fixture.now.Add(-time.Hour))
	run.Status = agentruns.RunStatusCompleted
	finishedAt := fixture.now.Add(-30 * time.Minute)
	run.FinishedAt = &finishedAt
	if err := fixture.runs.Save(run); err != nil {
		t.Fatalf("save external run with mismatched engine metadata: %v", err)
	}

	_, err := fixture.service.ensureExternalChatIDCompatible("chat-external-engine-mismatch", fixture.engineID, "project-alpha")
	if !errors.Is(err, ErrChatEngineMismatch) {
		t.Fatalf("expected chat engine mismatch, got %v", err)
	}
}

func TestSendServiceSeedsCodexThreadIDFromLatestExternalRun(t *testing.T) {
	t.Parallel()

	fixture := newSendServiceFixture(t, sendFixtureOptions{})
	chatID := "chat-codex-thread"
	fixture.seedExternalRun(t, chatID, agentruns.RunStatusCompleted, []map[string]any{
		{
			"id":   "source-user",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Resume this Codex chat"},
			},
		},
	}, []map[string]any{
		{
			"id":   "source-user",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Resume this Codex chat"},
			},
		},
		{
			"id":   "source-assistant",
			"role": "assistant",
			"content": []any{
				map[string]any{"type": "text", "text": "Prior Codex reply"},
			},
		},
	})

	runs, err := fixture.runs.ListByMetadata(agentruns.RunFilter{
		RunType:         stringPtr(RunTypeExternalAgent),
		ChatID:          stringPtr(chatID),
		ProjectConfigID: stringPtr("project-alpha"),
	})
	if err != nil {
		t.Fatalf("list prior external runs: %v", err)
	}
	latestRun, ok := selectLatestRun(runs)
	if !ok {
		t.Fatal("expected prior external run")
	}
	latestRun.Outputs = ensureAnyMap(latestRun.Outputs)
	latestRun.Outputs["threadId"] = "thread-codex-prior"
	if err := fixture.runs.Save(latestRun); err != nil {
		t.Fatalf("save prior thread id: %v", err)
	}

	_, err = fixture.service.StartChat(context.Background(), StartChatRequest{
		ChatID: stringPtr(chatID),
		Message: map[string]any{
			"id":   "new-message",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Continue on the same thread"},
			},
		},
		EngineConfigID:  fixture.engineID,
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		PermissionMode:  projectstate.ChatPermissionModeMinimal,
		SearchEnabled:   true,
	})
	if err != nil {
		t.Fatalf("start codex chat with prior thread: %v", err)
	}
	if fixture.executor.last == nil {
		t.Fatal("expected executor request")
	}
	if got := fixture.executor.last.Inputs["threadId"]; got != "thread-codex-prior" {
		t.Fatalf("expected prior thread id to seed executor inputs, got %#v", got)
	}
}

func TestSendServiceIncludesCodexSettaMCPGuidanceAndLastKnownToolCount(t *testing.T) {
	t.Parallel()

	fixture := newSendServiceFixture(t, sendFixtureOptions{})
	chatID := "chat-codex-mcp-status"
	fixture.seedExternalRun(t, chatID, agentruns.RunStatusCompleted, []map[string]any{
		{
			"id":   "source-user",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "How many Setta MCP tools do you have?"},
			},
		},
	}, []map[string]any{
		{
			"id":   "source-user",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "How many Setta MCP tools do you have?"},
			},
		},
		{
			"id":   "source-assistant",
			"role": "assistant",
			"content": []any{
				map[string]any{"type": "text", "text": "Let me check."},
			},
		},
	})

	runs, err := fixture.runs.ListByMetadata(agentruns.RunFilter{
		RunType:         stringPtr(RunTypeExternalAgent),
		ChatID:          stringPtr(chatID),
		ProjectConfigID: stringPtr("project-alpha"),
	})
	if err != nil {
		t.Fatalf("list prior external runs: %v", err)
	}
	latestRun, ok := selectLatestRun(runs)
	if !ok {
		t.Fatal("expected prior external run")
	}
	statusSnapshot, err := encodeExternalMCPStatusSnapshot([]mcpx.ServerRuntimeStatus{
		{
			ServerID:  "setta",
			Source:    "external_runtime",
			Transport: mcpx.TransportStreamableHTTP,
			Endpoint:  "http://127.0.0.1:8000/mcp",
			State:     mcpx.RuntimeStateConnected,
			ToolCount: 4,
		},
	})
	if err != nil {
		t.Fatalf("encode external mcp status snapshot: %v", err)
	}
	latestRun.Outputs = ensureAnyMap(latestRun.Outputs)
	latestRun.Outputs[externalMCPStatusSnapshotKey] = statusSnapshot
	if err := fixture.runs.Save(latestRun); err != nil {
		t.Fatalf("save external run with mcp snapshot: %v", err)
	}

	_, err = fixture.service.StartChat(context.Background(), StartChatRequest{
		ChatID: stringPtr(chatID),
		Message: map[string]any{
			"id":   "new-message",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "No, count the MCP tools."},
			},
		},
		EngineConfigID:  fixture.engineID,
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		PermissionMode:  projectstate.ChatPermissionModeConfigTomlCustom,
		SearchEnabled:   true,
	})
	if err != nil {
		t.Fatalf("start codex chat with prior mcp status: %v", err)
	}
	if fixture.executor.last == nil {
		t.Fatal("expected executor request")
	}

	systemPrompt, _ := fixture.executor.last.Inputs["systemPrompt"].(string)
	if !containsText(systemPrompt, "Setta MCP tools are namespaced as `mcp__setta__") {
		t.Fatalf("expected codex system prompt to include setta mcp namespace guidance, got %q", systemPrompt)
	}
	if !containsText(systemPrompt, "Do not use `list_mcp_resources` or `list_mcp_resource_templates` to decide whether Setta MCP tools are available.") {
		t.Fatalf("expected codex system prompt to forbid resources/templates inference, got %q", systemPrompt)
	}
	if !containsText(systemPrompt, "Last known Setta MCP runtime status: connected with 4 tools.") {
		t.Fatalf("expected codex system prompt to include last known tool count, got %q", systemPrompt)
	}
}

func TestSendServiceSeedsClaudeSessionIDFromLatestExternalRun(t *testing.T) {
	t.Parallel()

	fixture := newSendServiceFixture(t, sendFixtureOptions{
		externalToolType: externalagentconfigs.ToolTypeClaudeCode,
		externalRunMode:  externalagentconfigs.RunModeSDK,
	})
	chatID := "chat-claude-session"
	fixture.seedExternalRun(t, chatID, agentruns.RunStatusCompleted, []map[string]any{
		{
			"id":   "source-user",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Resume this Claude chat"},
			},
		},
	}, []map[string]any{
		{
			"id":   "source-user",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Resume this Claude chat"},
			},
		},
		{
			"id":   "source-assistant",
			"role": "assistant",
			"content": []any{
				map[string]any{"type": "text", "text": "Prior Claude reply"},
			},
		},
	})

	runs, err := fixture.runs.ListByMetadata(agentruns.RunFilter{
		RunType:         stringPtr(RunTypeExternalAgent),
		ChatID:          stringPtr(chatID),
		ProjectConfigID: stringPtr("project-alpha"),
	})
	if err != nil {
		t.Fatalf("list prior external runs: %v", err)
	}
	latestRun, ok := selectLatestRun(runs)
	if !ok {
		t.Fatal("expected prior external run")
	}
	latestRun.Outputs = ensureAnyMap(latestRun.Outputs)
	latestRun.Outputs["sessionId"] = "session-claude-prior"
	if err := fixture.runs.Save(latestRun); err != nil {
		t.Fatalf("save prior session id: %v", err)
	}

	_, err = fixture.service.StartChat(context.Background(), StartChatRequest{
		ChatID: stringPtr(chatID),
		Message: map[string]any{
			"id":   "new-message",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Continue on the same Claude session"},
			},
		},
		EngineConfigID:  fixture.engineID,
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		PermissionMode:  projectstate.ChatPermissionModeMinimal,
		SearchEnabled:   true,
	})
	if err != nil {
		t.Fatalf("start claude chat with prior session: %v", err)
	}
	if fixture.executor.last == nil {
		t.Fatal("expected executor request")
	}
	if got := fixture.executor.last.Inputs["sessionId"]; got != "session-claude-prior" {
		t.Fatalf("expected prior session id to seed executor inputs, got %#v", got)
	}
}

func TestSendServiceRejectsWhitespaceFrontendAffinityToken(t *testing.T) {
	t.Parallel()

	fixture := newSendServiceFixture(t, sendFixtureOptions{})
	_, err := fixture.service.StartChat(context.Background(), StartChatRequest{
		Message: map[string]any{
			"id":   "user-1",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Create a new project."},
			},
		},
		EngineConfigID:        fixture.engineID,
		ProjectConfigID:       "project-alpha",
		AllowUnscoped:         true,
		FrontendAffinityToken: stringPtr("   "),
		PermissionMode:        projectstate.ChatPermissionModeYOLO,
		SearchEnabled:         false,
	})
	if !errors.Is(err, ErrFrontendAffinityTokenInvalid) {
		t.Fatalf("expected frontend affinity token error, got %v", err)
	}
}

func TestSendServiceRejectsImageModeWithoutCurrentOrRetainedImageAttachment(t *testing.T) {
	t.Parallel()

	fixture := newSendServiceFixture(t, sendFixtureOptions{})
	_, err := fixture.service.StartChat(context.Background(), StartChatRequest{
		Message: map[string]any{
			"id":      "user-image",
			"role":    "user",
			"content": []any{map[string]any{"type": "text", "text": "Match this reference image."}},
		},
		EngineConfigID:    fixture.engineID,
		ProjectConfigID:   "project-alpha",
		AllowUnscoped:     true,
		PermissionMode:    projectstate.ChatPermissionModeMinimal,
		SearchEnabled:     false,
		AppGenerationMode: stringPtr(string(agentruns.AppGenerationModeJSONRenderWithImage)),
		AdditionalInputs: map[string]any{
			"appGenerationByMessageId": map[string]any{
				"user-image": agentruns.ChatAppGenerationMessageModeJSONRenderWithImage,
			},
		},
	})
	if !errors.Is(err, ErrAppGenerationImageAttachmentRequired) {
		t.Fatalf("expected image attachment requirement error, got %v", err)
	}
	if fixture.executor.last != nil {
		t.Fatalf("expected executor not to start, got %#v", fixture.executor.last)
	}
}

func TestSendServiceAllowsImageModeWithRetainedImageModeHistory(t *testing.T) {
	t.Parallel()

	fixture := newSendServiceFixture(t, sendFixtureOptions{})
	seedChatID := "chat-image-history"
	seedRun := agentruns.NewRun(nil, map[string]any{
		"runType":         RunTypeExternalAgent,
		"chatId":          seedChatID,
		"projectConfigId": "project-alpha",
		"engineConfigId":  fixture.engineID,
		"messages": []any{
			map[string]any{
				"id":      "user-image-initial",
				"role":    "user",
				"content": []any{map[string]any{"type": "text", "text": "Match this reference image."}},
				"attachments": []any{
					map[string]any{"id": "image-1", "name": "reference.png", "mimeType": "image/png", "size": 128},
				},
			},
		},
		"appGenerationByMessageId": map[string]any{
			"user-image-initial": agentruns.ChatAppGenerationMessageModeJSONRenderWithImage,
		},
	}, fixture.now.Add(-time.Hour))
	seedRun.Status = agentruns.RunStatusCompleted
	finishedAt := fixture.now.Add(-30 * time.Minute)
	seedRun.FinishedAt = &finishedAt
	if err := fixture.runs.Save(seedRun); err != nil {
		t.Fatalf("save external seed run: %v", err)
	}

	_, err := fixture.service.StartChat(context.Background(), StartChatRequest{
		ChatID: stringPtr(seedChatID),
		Message: map[string]any{
			"id":      "user-image-follow-up",
			"role":    "user",
			"content": []any{map[string]any{"type": "text", "text": "Tighten the spacing."}},
		},
		EngineConfigID:    fixture.engineID,
		ProjectConfigID:   "project-alpha",
		AllowUnscoped:     true,
		PermissionMode:    projectstate.ChatPermissionModeMinimal,
		SearchEnabled:     false,
		AppGenerationMode: stringPtr(string(agentruns.AppGenerationModeJSONRenderWithImage)),
		AdditionalInputs: map[string]any{
			"appGenerationByMessageId": map[string]any{
				"user-image-initial":   agentruns.ChatAppGenerationMessageModeJSONRenderWithImage,
				"user-image-follow-up": agentruns.ChatAppGenerationMessageModeJSONRenderWithImage,
			},
		},
	})
	if err != nil {
		t.Fatalf("start external image-mode chat with retained history: %v", err)
	}
	if fixture.executor.last == nil {
		t.Fatal("expected executor request for retained image-mode history")
	}
}

func TestSendServicePreservesProviderDefinedAppGenerationHistory(t *testing.T) {
	t.Parallel()

	fixture := newSendServiceFixture(t, sendFixtureOptions{})

	_, err := fixture.service.StartChat(context.Background(), StartChatRequest{
		Message: map[string]any{
			"id":      "user-follow-up",
			"role":    "user",
			"content": []any{map[string]any{"type": "text", "text": "Continue the provider-defined app flow."}},
		},
		EngineConfigID:  fixture.engineID,
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		PermissionMode:  projectstate.ChatPermissionModeMinimal,
		SearchEnabled:   false,
		AdditionalInputs: map[string]any{
			"appGenerationByMessageId": map[string]any{
				"user-seed": "vendor_mode",
			},
		},
	})
	if err != nil {
		t.Fatalf("start external provider-mode chat: %v", err)
	}
	if fixture.executor.last == nil {
		t.Fatal("expected executor request")
	}
	appGenerationByMessageID, ok := fixture.executor.last.Inputs["appGenerationByMessageId"].(map[string]string)
	if !ok {
		t.Fatalf("expected normalized app-generation provenance map, got %#v", fixture.executor.last.Inputs["appGenerationByMessageId"])
	}
	if appGenerationByMessageID["user-seed"] != "vendor_mode" {
		t.Fatalf("expected retained provider-defined provenance, got %#v", appGenerationByMessageID)
	}
	if appGenerationByMessageID["user-follow-up"] != string(agentruns.ChatAppGenerationMessageModePlainChat) {
		t.Fatalf("expected submitted message to default to plain chat, got %#v", appGenerationByMessageID)
	}
}

func TestSendServiceRejectsMissingContinuationSource(t *testing.T) {
	t.Parallel()

	fixture := newSendServiceFixture(t, sendFixtureOptions{})
	_, err := fixture.service.StartChat(context.Background(), StartChatRequest{
		ContinueFromChatID: stringPtr("chat-source-missing"),
		Message: map[string]any{
			"id":   "new-message",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Should fail before run creation"},
			},
		},
		EngineConfigID:  fixture.engineID,
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		PermissionMode:  projectstate.ChatPermissionModeMinimal,
		SearchEnabled:   true,
	})
	if !errors.Is(err, ErrContinueFromChatSourceNotFound) {
		t.Fatalf("expected continuation source not found, got %v", err)
	}
	var typedErr *ContinueFromChatSourceNotFoundError
	if !errors.As(err, &typedErr) {
		t.Fatalf("expected typed continuation error, got %v", err)
	}
	if typedErr.Error() != "Continuation source chat chat-source-missing not found." {
		t.Fatalf("unexpected continuation message %q", typedErr.Error())
	}
}

func TestSendServiceRejectsManagedContinuationSource(t *testing.T) {
	t.Parallel()

	fixture := newSendServiceFixture(t, sendFixtureOptions{})
	run := agentruns.NewRun(nil, map[string]any{
		"runType":         RunTypeManagedChat,
		"chatId":          "chat-source-managed",
		"projectConfigId": "project-alpha",
		"messages": []any{
			map[string]any{
				"id":   "source-user",
				"role": "user",
				"content": []any{
					map[string]any{"type": "text", "text": "Managed source prompt"},
				},
			},
		},
	}, fixture.now.Add(-time.Hour))
	run.Status = agentruns.RunStatusCompleted
	finishedAt := fixture.now.Add(-30 * time.Minute)
	run.FinishedAt = &finishedAt
	run.Outputs = map[string]any{
		"messages": []any{
			map[string]any{
				"id":   "source-user",
				"role": "user",
				"content": []any{
					map[string]any{"type": "text", "text": "Managed source prompt"},
				},
			},
			map[string]any{
				"id":   "source-assistant",
				"role": "assistant",
				"content": []any{
					map[string]any{"type": "text", "text": "Managed source reply"},
				},
			},
		},
	}
	if err := fixture.runs.Save(run); err != nil {
		t.Fatalf("save managed continuation source: %v", err)
	}

	_, err := fixture.service.StartChat(context.Background(), StartChatRequest{
		ContinueFromChatID: stringPtr("chat-source-managed"),
		Message: map[string]any{
			"id":   "new-message",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Should not seed managed history"},
			},
		},
		EngineConfigID:  fixture.engineID,
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		PermissionMode:  projectstate.ChatPermissionModeMinimal,
		SearchEnabled:   true,
	})
	if !errors.Is(err, ErrContinueFromChatSourceNotFound) {
		t.Fatalf("expected managed continuation source to fail closed, got %v", err)
	}
	if fixture.executor.last != nil {
		t.Fatalf("expected continuation validation to fail before executor start, got %#v", fixture.executor.last)
	}
}

func TestSendServiceRejectsChatEngineMismatch(t *testing.T) {
	t.Parallel()

	fixture := newSendServiceFixture(t, sendFixtureOptions{})
	run := agentruns.NewRun(nil, map[string]any{
		"runType":         RunTypeManagedChat,
		"chatId":          "chat-conflict",
		"projectConfigId": "project-alpha",
		"messages":        []any{},
	}, fixture.now)
	if err := fixture.runs.Save(run); err != nil {
		t.Fatalf("save managed run: %v", err)
	}

	_, err := fixture.service.StartChat(context.Background(), StartChatRequest{
		ChatID: stringPtr("chat-conflict"),
		Message: map[string]any{
			"id":   "user-1",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Hello"},
			},
		},
		EngineConfigID:  fixture.engineID,
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		PermissionMode:  projectstate.ChatPermissionModeMinimal,
		SearchEnabled:   true,
	})
	if !errors.Is(err, ErrChatEngineMismatch) {
		t.Fatalf("expected chat engine mismatch, got %v", err)
	}
}

func TestSendServicePreservesExplicitResumeIDsOverLatestExternalRun(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name          string
		options       sendFixtureOptions
		inputKey      string
		priorValue    string
		explicitValue string
	}{
		{
			name:          "codex thread id",
			options:       sendFixtureOptions{},
			inputKey:      "threadId",
			priorValue:    "thread-codex-prior",
			explicitValue: "thread-codex-explicit",
		},
		{
			name: "claude session id",
			options: sendFixtureOptions{
				externalToolType: externalagentconfigs.ToolTypeClaudeCode,
				externalRunMode:  externalagentconfigs.RunModeSDK,
			},
			inputKey:      "sessionId",
			priorValue:    "session-claude-prior",
			explicitValue: "session-claude-explicit",
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			fixture := newSendServiceFixture(t, testCase.options)
			chatID := strings.ReplaceAll(testCase.name, " ", "-")
			fixture.seedExternalRun(t, chatID, agentruns.RunStatusCompleted, []map[string]any{
				{
					"id":   "source-user",
					"role": "user",
					"content": []any{
						map[string]any{"type": "text", "text": "Resume this chat"},
					},
				},
			}, []map[string]any{
				{
					"id":   "source-user",
					"role": "user",
					"content": []any{
						map[string]any{"type": "text", "text": "Resume this chat"},
					},
				},
				{
					"id":   "source-assistant",
					"role": "assistant",
					"content": []any{
						map[string]any{"type": "text", "text": "Prior reply"},
					},
				},
			})

			runs, err := fixture.runs.ListByMetadata(agentruns.RunFilter{
				RunType:         stringPtr(RunTypeExternalAgent),
				ChatID:          stringPtr(chatID),
				ProjectConfigID: stringPtr("project-alpha"),
			})
			if err != nil {
				t.Fatalf("list prior external runs: %v", err)
			}
			latestRun, ok := selectLatestRun(runs)
			if !ok {
				t.Fatal("expected prior external run")
			}
			latestRun.Outputs = ensureAnyMap(latestRun.Outputs)
			latestRun.Outputs[testCase.inputKey] = testCase.priorValue
			if err := fixture.runs.Save(latestRun); err != nil {
				t.Fatalf("save prior resume id: %v", err)
			}

			_, err = fixture.service.StartChat(context.Background(), StartChatRequest{
				ChatID: stringPtr(chatID),
				Message: map[string]any{
					"id":   "new-message",
					"role": "user",
					"content": []any{
						map[string]any{"type": "text", "text": "Continue on the explicit resume target"},
					},
				},
				EngineConfigID:  fixture.engineID,
				ProjectConfigID: "project-alpha",
				AllowUnscoped:   true,
				PermissionMode:  projectstate.ChatPermissionModeMinimal,
				SearchEnabled:   true,
				AdditionalInputs: map[string]any{
					testCase.inputKey: testCase.explicitValue,
				},
			})
			if err != nil {
				t.Fatalf("start external chat with explicit resume id: %v", err)
			}
			if fixture.executor.last == nil {
				t.Fatal("expected executor request")
			}
			if got := fixture.executor.last.Inputs[testCase.inputKey]; got != testCase.explicitValue {
				t.Fatalf("expected explicit %s %q, got %#v", testCase.inputKey, testCase.explicitValue, got)
			}
		})
	}
}

type sendFixtureOptions struct {
	executorErr            error
	preflightStatus        *externalagentconfigs.Status
	externalToolType       externalagentconfigs.ToolType
	externalRunMode        externalagentconfigs.RunMode
	approvalPolicy         *string
	sandboxPolicy          *string
	completionGuardEnabled *bool
}

type sendServiceFixture struct {
	service  *SendService
	executor *stubExternalAgentExecutor
	runtime  *Runtime
	runs     *agentruns.RunStore
	profiles *agentprofiles.Store
	engineID string
	now      time.Time
	root     string
}

type testCurrentSessionProvider struct {
	current *auth.CurrentSession
}

func (p testCurrentSessionProvider) CurrentSession() (*auth.CurrentSession, bool) {
	if p.current == nil {
		return nil, false
	}
	return p.current, true
}

func newSendServiceFixture(t *testing.T, options sendFixtureOptions) sendServiceFixture {
	t.Helper()

	root := t.TempDir()
	engines, err := agentruns.NewEngineStore(root)
	if err != nil {
		t.Fatalf("new engine store: %v", err)
	}
	configs, err := externalagentconfigs.NewStore(root)
	if err != nil {
		t.Fatalf("new external config store: %v", err)
	}
	runs, err := agentruns.NewRunStore(root)
	if err != nil {
		t.Fatalf("new run store: %v", err)
	}
	profiles, err := agentprofiles.NewStore(root)
	if err != nil {
		t.Fatalf("new agent profile store: %v", err)
	}
	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {ID: "project-alpha", Name: "Alpha"},
		},
	})
	if err != nil {
		t.Fatalf("open project runtime: %v", err)
	}
	now := time.Date(2026, 3, 9, 9, 0, 0, 0, time.UTC)
	runtime, err := NewRuntime(RuntimeOptions{
		Runs: runs,
		TimeNow: func() time.Time {
			return now
		},
	})
	if err != nil {
		t.Fatalf("new runtime: %v", err)
	}
	if options.completionGuardEnabled != nil {
		writeSendCompletionGuardSetting(t, root, *options.completionGuardEnabled)
	}
	toolType := options.externalToolType
	if toolType == "" {
		toolType = externalagentconfigs.ToolTypeCodex
	}
	runMode := options.externalRunMode
	if runMode == "" {
		runMode = externalagentconfigs.RunModeAppServer
	}
	commandPath := "/usr/local/bin/codex"
	if err := configs.Write([]externalagentconfigs.Config{
		{
			ID:                 "external-config",
			Name:               "Codex app-server",
			ToolType:           toolType,
			RunMode:            runMode,
			CommandPath:        &commandPath,
			ApprovalPolicy:     cloneOptionalString(options.approvalPolicy),
			SandboxPolicy:      cloneOptionalString(options.sandboxPolicy),
			WorkingDirStrategy: externalagentconfigs.WorkingDirStrategyProjectRoot,
		},
	}); err != nil {
		t.Fatalf("write external configs: %v", err)
	}
	engineID := "engine-external"
	configID := "external-config"
	if err := engines.Write([]agentruns.EngineConfig{
		{
			ID:                    engineID,
			Name:                  "External Engine",
			EngineType:            agentruns.EngineTypeExternalAgent,
			ExternalAgentConfigID: &configID,
		},
	}); err != nil {
		t.Fatalf("write engine configs: %v", err)
	}
	if err := profiles.Write([]agentprofiles.Profile{
		{
			ID:             "profile-alpha",
			Name:           "Alpha",
			EngineConfigID: &engineID,
		},
	}); err != nil {
		t.Fatalf("write profiles: %v", err)
	}

	controller := &stubRunController{}
	executor := &stubExternalAgentExecutor{
		response: StartResponse{Controller: controller},
		err:      options.executorErr,
	}
	attachmentService, err := chatattachments.NewService(chatattachments.ServiceOptions{
		SettaFilesRoot: root,
		Host:           "127.0.0.1",
		Port:           8000,
		ProjectState:   projectRuntime,
		Sessions: testCurrentSessionProvider{current: &auth.CurrentSession{
			Metadata: auth.SessionMetadata{ID: "session-1"},
			Secret:   []byte("secret"),
		}},
		TimeNow: func() time.Time {
			return now
		},
	})
	if err != nil {
		t.Fatalf("new attachment service: %v", err)
	}
	preflightStatus := options.preflightStatus
	if preflightStatus == nil {
		preflightStatus = &externalagentconfigs.Status{
			ConfigID:  configID,
			Name:      "Codex app-server",
			ToolType:  toolType,
			RunMode:   runMode,
			Supported: true,
			Available: true,
			Issues:    []string{},
		}
	}
	service, err := NewSendService(SendServiceOptions{
		ProjectState:       projectRuntime,
		Engines:            engines,
		Runs:               runs,
		Profiles:           profiles,
		Configs:            configs,
		Runtime:            runtime,
		Preflight:          stubPreflightChecker{status: *preflightStatus},
		Attachments:        attachmentService,
		Executor:           executor,
		SettaFilesRoot:     root,
		AppGenerationModes: testSendAppGenerationModes(t),
		TimeNow: func() time.Time {
			return now
		},
	})
	if err != nil {
		t.Fatalf("new send service: %v", err)
	}
	return sendServiceFixture{
		service:  service,
		executor: executor,
		runtime:  runtime,
		runs:     runs,
		profiles: profiles,
		engineID: engineID,
		now:      now,
		root:     root,
	}
}

func writeSendCompletionGuardSetting(t *testing.T, root string, enabled bool) {
	t.Helper()

	settingsStore, err := settingsstate.NewStore(filepath.Join(root, settingsstate.DefaultFileName), settingsstate.StoreOptions{})
	if err != nil {
		t.Fatalf("open settings store: %v", err)
	}
	document, err := settingsstate.DefaultDocument()
	if err != nil {
		t.Fatalf("new settings document: %v", err)
	}
	document["backend"].(map[string]any)["completionGuardEnabled"] = enabled
	if err := settingsStore.Save(context.Background(), document); err != nil {
		t.Fatalf("save settings document: %v", err)
	}
}

func stringSliceValueAny(raw any) []string {
	switch typed := raw.(type) {
	case []string:
		return append([]string(nil), typed...)
	case []any:
		values := make([]string, 0, len(typed))
		for _, entry := range typed {
			value, ok := entry.(string)
			if !ok {
				return nil
			}
			values = append(values, value)
		}
		return values
	default:
		return nil
	}
}

func boolPtr(value bool) *bool {
	return &value
}

func (f sendServiceFixture) seedExternalRun(t *testing.T, chatID string, status agentruns.RunStatus, inputMessages []map[string]any, outputMessages []map[string]any) {
	t.Helper()

	run := agentruns.NewRun(nil, map[string]any{
		"runType":         RunTypeExternalAgent,
		"chatId":          chatID,
		"projectConfigId": "project-alpha",
		"engineConfigId":  f.engineID,
		"messages":        messageSliceToJSONList(inputMessages),
	}, f.now.Add(-time.Hour))
	run.Status = status
	if status != agentruns.RunStatusRunning {
		finishedAt := f.now.Add(-30 * time.Minute)
		run.FinishedAt = &finishedAt
	}
	if outputMessages != nil {
		run.Outputs = map[string]any{
			"messages": messageSliceToJSONList(outputMessages),
		}
	}
	if err := f.runs.Save(run); err != nil {
		t.Fatalf("save seeded external run: %v", err)
	}
}

func containsText(text string, expected string) bool {
	return text != "" && expected != "" && strings.Contains(text, expected)
}

func writeAttachmentFile(t *testing.T, root string, relativePath string, content string) {
	t.Helper()

	path := filepath.Join(root, relativePath)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir attachment dir: %v", err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write attachment file: %v", err)
	}
}
