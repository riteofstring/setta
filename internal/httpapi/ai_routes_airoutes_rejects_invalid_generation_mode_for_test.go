package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"setta/internal/agentruns"
	"setta/internal/config"
	"setta/internal/externalagentconfigs"
	"setta/internal/externalagents"
	"setta/internal/managedchat"
	"setta/internal/managedllm"
	"setta/internal/mcpx"
	"setta/internal/modes"
	"setta/internal/realtime"
)

func TestRegisterAIRoutesRejectsInvalidAppGenerationModeForExternalSend(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	handler := newAIRouteTestHandler(t, config.ModeIDE, fixture.managed, fixture.send, fixture.service, fixture.runtime)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetLLMResponse,
		strings.NewReader(`{
			"chatId":null,
			"message":{"id":"user-1","role":"user","content":[{"type":"text","text":"Create a new app."}]},
			"engineConfigId":"engine-external",
			"thinking":false,
			"projectConfigId":"project-alpha",
			"sectionId":null,
			"allowUnscoped":true,
			"permissionMode":"minimal",
			"searchEnabled":false,
			"appGenerationMode":"unknown_mode"
		}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "app_generation_mode_invalid" {
		t.Fatalf("expected invalid app-generation mode error, got %#v", payload)
	}
}

func TestRegisterAIRoutesRejectsUnavailableAppGenerationModeForExternalSend(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{
		appGenerationModesAvailable: boolPtr(false),
	})
	handler := newAIRouteTestHandler(t, config.ModeIDE, fixture.managed, fixture.send, fixture.service, fixture.runtime)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetLLMResponse,
		strings.NewReader(`{
			"chatId":null,
			"message":{"id":"user-1","role":"user","content":[{"type":"text","text":"Create a new app."}]},
			"engineConfigId":"engine-external",
			"thinking":false,
			"projectConfigId":"project-alpha",
			"sectionId":null,
			"allowUnscoped":true,
			"permissionMode":"minimal",
			"searchEnabled":false,
			"appGenerationMode":"json_render"
		}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "app_generation_mode_invalid" {
		t.Fatalf("expected invalid app-generation mode error, got %#v", payload)
	}
}

func TestRegisterAIRoutesRejectsOversizedReferenceImageURLForExternalSend(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	handler := newAIRouteTestHandler(t, config.ModeIDE, fixture.managed, fixture.send, fixture.service, fixture.runtime)
	body, err := json.Marshal(map[string]any{
		"chatId":                         nil,
		"message":                        map[string]any{"id": "user-1", "role": "user", "content": []any{map[string]any{"type": "text", "text": "Create a new app."}}},
		"engineConfigId":                 "engine-external",
		"thinking":                       false,
		"projectConfigId":                "project-alpha",
		"sectionId":                      nil,
		"allowUnscoped":                  true,
		"permissionMode":                 "minimal",
		"searchEnabled":                  false,
		"appGenerationMode":              "json_render_with_image",
		"appGenerationReferenceImageUrl": strings.Repeat("x", 4097),
	})
	if err != nil {
		t.Fatalf("encode request body: %v", err)
	}
	request := httptest.NewRequest(http.MethodPost, "/api"+RouteGetLLMResponse, strings.NewReader(string(body)))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "app_generation_reference_image_url_too_large" {
		t.Fatalf("expected oversized reference image URL error, got %#v", payload)
	}
}

func TestRegisterAIRoutesRejectsImageModeWithoutAttachmentForManagedSend(t *testing.T) {
	t.Parallel()

	managedStarter := &aiRouteStubManagedStarter{}
	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{managedStarter: managedStarter})
	handler := newAIRouteTestHandler(t, config.ModeIDE, fixture.managed, fixture.send, fixture.service, fixture.runtime)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetLLMResponse,
		strings.NewReader(`{
			"chatId":null,
			"message":{"id":"user-managed","role":"user","content":[{"type":"text","text":"Match this reference image."}],"attachments":[]},
			"engineConfigId":"engine-managed",
			"thinking":false,
			"projectConfigId":"project-alpha",
			"sectionId":null,
			"allowUnscoped":true,
			"permissionMode":"minimal",
			"searchEnabled":false,
			"appGenerationMode":"json_render_with_image",
			"appGenerationByMessageId":{"user-managed":"json_render_with_image"}
		}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "app_generation_image_attachment_required" {
		t.Fatalf("expected image attachment requirement error, got %#v", payload)
	}
	if fixture.managedStarter.lastInputs != nil {
		t.Fatalf("expected managed starter not to run, got %#v", fixture.managedStarter.lastInputs)
	}
}

func TestRegisterAIRoutesRejectsImageModeWithoutAttachmentForExternalSend(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	handler := newAIRouteTestHandler(t, config.ModeIDE, fixture.managed, fixture.send, fixture.service, fixture.runtime)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetLLMResponse,
		strings.NewReader(`{
			"chatId":null,
			"message":{"id":"user-external","role":"user","content":[{"type":"text","text":"Match this reference image."}],"attachments":[]},
			"engineConfigId":"engine-external",
			"thinking":false,
			"projectConfigId":"project-alpha",
			"sectionId":null,
			"allowUnscoped":true,
			"permissionMode":"minimal",
			"searchEnabled":false,
			"appGenerationMode":"json_render_with_image",
			"appGenerationByMessageId":{"user-external":"json_render_with_image"}
		}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "app_generation_image_attachment_required" {
		t.Fatalf("expected image attachment requirement error, got %#v", payload)
	}
	runs, err := fixture.store.List()
	if err != nil {
		t.Fatalf("list runs: %v", err)
	}
	if len(runs) != 0 {
		t.Fatalf("expected external send not to persist a run, got %#v", runs)
	}
}

func TestRegisterAIRoutesReturnsConflictForExternalChatEngineMismatch(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	run := agentruns.NewRun(nil, map[string]any{
		"runType":         externalagents.RunTypeManagedChat,
		"chatId":          "chat-conflict",
		"projectConfigId": "project-alpha",
		"messages":        []any{},
	}, time.Date(2026, 3, 8, 12, 0, 0, 0, time.UTC))
	if err := fixture.store.Save(run); err != nil {
		t.Fatalf("save managed run: %v", err)
	}

	handler := newAIRouteTestHandler(t, config.ModeIDE, fixture.managed, fixture.send, fixture.service, fixture.runtime)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetLLMResponse,
		strings.NewReader(`{
			"chatId":"chat-conflict",
			"message":{"id":"user-1","role":"user","content":[{"type":"text","text":"Hello"}]},
			"engineConfigId":"engine-external",
			"thinking":false,
			"projectConfigId":"project-alpha",
			"sectionId":null,
			"allowUnscoped":true,
			"permissionMode":"minimal",
			"searchEnabled":true
		}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusConflict {
		t.Fatalf("expected 409, got %d with body %q", response.Code, response.Body.String())
	}
}

func TestRegisterAIRoutesBlocksExternalSendOnPreflightFailure(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{
		preflightStatus: &externalagentconfigs.Status{
			ConfigID:  "external-config",
			Name:      "Codex app-server",
			ToolType:  externalagentconfigs.ToolTypeCodex,
			RunMode:   externalagentconfigs.RunModeAppServer,
			Supported: true,
			Available: false,
			Issues:    []string{"Missing env vars: OPENAI_API_KEY"},
		},
	})
	handler := newAIRouteTestHandler(t, config.ModeIDE, fixture.managed, fixture.send, fixture.service, fixture.runtime)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetLLMResponse,
		strings.NewReader(`{
			"chatId":null,
			"message":{"id":"user-1","role":"user","content":[{"type":"text","text":"Create a new section."}]},
			"engineConfigId":"engine-external",
			"thinking":false,
			"projectConfigId":"project-alpha",
			"sectionId":null,
			"allowUnscoped":true,
			"permissionMode":"minimal",
			"searchEnabled":false
		}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "external_agent_preflight_failed" {
		t.Fatalf("expected preflight failure code, got %#v", payload)
	}
}

func TestResolveGetLLMResponseError(t *testing.T) {
	t.Parallel()

	for _, testCase := range []struct {
		name string
		err  error
		want llmResponseErrorDetails
	}{
		{
			name: "uses dynamic section id error text",
			err:  externalagents.ErrSectionIDRequired,
			want: llmResponseErrorDetails{
				Status:  http.StatusBadRequest,
				Code:    "section_id_required",
				Message: externalagents.ErrSectionIDRequired.Error(),
			},
		},
		{
			name: "uses typed continuation error text",
			err:  &managedchat.ContinueFromChatSourceNotFoundError{ChatID: "chat-source"},
			want: llmResponseErrorDetails{
				Status:  http.StatusNotFound,
				Code:    "source_chat_not_found",
				Message: "Continuation source chat chat-source not found.",
			},
		},
		{
			name: "uses typed branch error text",
			err:  &externalagents.BranchMessageNotFoundError{MessageID: "msg-42"},
			want: llmResponseErrorDetails{
				Status:  http.StatusNotFound,
				Code:    "branch_message_not_found",
				Message: "Message msg-42 not found in chat history",
			},
		},
		{
			name: "preserves wrapped provider config detail",
			err:  fmt.Errorf("%w: azure provider requires explicit api_version", managedllm.ErrProviderConfigInvalid),
			want: llmResponseErrorDetails{
				Status:  http.StatusBadRequest,
				Code:    "provider_config_invalid",
				Message: "managed llm provider config is invalid: azure provider requires explicit api_version",
			},
		},
		{
			name: "maps external agent config not found to fixed response",
			err:  fmt.Errorf("%w: %q", externalagentconfigs.ErrConfigNotFound, "codex"),
			want: llmResponseErrorDetails{
				Status:  http.StatusInternalServerError,
				Code:    "external_agent_config_not_found",
				Message: "External agent config not found.",
			},
		},
		{
			name: "uses preflight error detail",
			err: &externalagents.PreflightUnavailableError{
				Status: externalagentconfigs.Status{
					Issues: []string{"Missing env vars: OPENAI_API_KEY"},
				},
			},
			want: llmResponseErrorDetails{
				Status:  http.StatusServiceUnavailable,
				Code:    "external_agent_preflight_failed",
				Message: "External agent config is not available: Missing env vars: OPENAI_API_KEY",
			},
		},
		{
			name: "falls back to internal error",
			err:  fmt.Errorf("boom"),
			want: defaultGetLLMResponseError,
		},
	} {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			if got := resolveGetLLMResponseError(testCase.err); got != testCase.want {
				t.Fatalf("expected %#v, got %#v", testCase.want, got)
			}
		})
	}
}

func TestRegisterAIRoutesHydratesExternalAgentChat(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	fixture.seedHydrationRun(t)
	handler := newAIRouteTestHandler(t, config.ModeIDE, fixture.managed, fixture.send, fixture.service, fixture.runtime)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetExternalAgentChat,
		strings.NewReader(`{"chatId":"chat-external","projectConfigId":"project-alpha"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload ExternalAgentChatResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(payload.Messages) != 2 {
		t.Fatalf("expected 2 messages, got %d", len(payload.Messages))
	}
	if !payload.WaitingForResponse {
		t.Fatal("expected waitingForResponse to be true")
	}
	if payload.ContextUsage != nil {
		t.Fatalf("expected no context usage, got %#v", payload.ContextUsage)
	}
	if payload.AppGenerationByMessageID["user-1"] != string(agentruns.ChatAppGenerationMessageModeMCPServer) {
		t.Fatalf("expected external app-generation provenance, got %#v", payload.AppGenerationByMessageID)
	}
}

func TestRegisterAIRoutesReturnsExternalAIFollowSnapshot(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	run := fixture.seedRun("run-follow", agentruns.RunStatusRunning)
	if err := fixture.runtime.ActivateRun(run.ID, &aiRouteStubController{}); err != nil {
		t.Fatalf("activate run: %v", err)
	}
	if err := fixture.runtime.SetLiveChatState(run.ID, externalagents.ChatState{
		Messages: []map[string]any{
			{
				"id":      "assistant-1",
				"role":    "assistant",
				"content": []any{},
				"tool_calls": []any{
					map[string]any{
						"id": "tool-call-1",
						"function": map[string]any{
							"name": mcpx.BuildNamespacedToolName(mcpx.DefaultServerID, "setSectionSize"),
							"arguments": map[string]any{
								"sectionId": "section-alpha",
							},
						},
					},
				},
			},
		},
		ToolCallArguments: map[string]string{
			"tool-call-1": `{"sectionId":"section-alpha"}`,
		},
		WaitingForResponse: true,
	}); err != nil {
		t.Fatalf("set live follow state: %v", err)
	}
	handler := newAIRouteTestHandler(t, config.ModeIDE, fixture.managed, fixture.send, fixture.service, fixture.runtime, fixture.follow)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetAIFollowSnapshot,
		strings.NewReader(`{"projectConfigId":"project-alpha"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	var payload []realtime.AIFollowToolArgumentsUpdateContent
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode snapshot response: %v", err)
	}
	if len(payload) != 1 {
		t.Fatalf("expected one snapshot entry, got %#v", payload)
	}
	if payload[0].ProjectConfigID != "project-alpha" || payload[0].ChatID != "chat-alpha" {
		t.Fatalf("unexpected snapshot identity %#v", payload[0])
	}
	if len(payload[0].IDsByType["section"]) != 1 || payload[0].IDsByType["section"][0] != "section-alpha" {
		t.Fatalf("unexpected follow ids %#v", payload[0].IDsByType)
	}
}

func TestRegisterAIRoutesReturnsManagedAndExternalAIFollowSnapshot(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	managedRun := agentruns.NewRun(nil, map[string]any{
		"runType":         managedchat.RunTypeManagedChat,
		"chatId":          "chat-managed",
		"projectConfigId": "project-alpha",
		"engineConfigId":  "engine-managed",
		"messages":        []any{},
	}, time.Date(2026, 3, 8, 12, 0, 0, 0, time.UTC))
	managedRun.ID = "run-managed-follow"
	fixture.managedLive.ActivateRun(managedRun)
	if err := fixture.managedLive.ApplyChunk(context.Background(), managedchat.StreamChunkParams{
		RunID:           managedRun.ID,
		ChatID:          "chat-managed",
		ProjectConfigID: stringPtr("project-alpha"),
		Chunk: realtime.ToolArgumentPreviewDeltaEvent{
			Type:           realtime.StreamingEventTypeToolArgumentPreview,
			MessageID:      "assistant-managed",
			ToolCallID:     "tool-call-managed",
			ToolName:       mcpx.BuildNamespacedToolName(mcpx.DefaultServerID, "setSectionSize"),
			ArgumentsDelta: `{"sectionId":"section-managed"}`,
			PreviewKind:    "paramValue",
			TargetIDsByType: realtime.ToolArgumentPreviewTargetIDs{
				Section: []string{"section-managed", "section-managed"},
			},
		},
	}); err != nil {
		t.Fatalf("apply managed preview chunk: %v", err)
	}

	run := fixture.seedRun("run-follow", agentruns.RunStatusRunning)
	if err := fixture.runtime.ActivateRun(run.ID, &aiRouteStubController{}); err != nil {
		t.Fatalf("activate external run: %v", err)
	}
	if err := fixture.runtime.SetLiveChatState(run.ID, externalagents.ChatState{
		Messages: []map[string]any{
			{
				"id":      "assistant-1",
				"role":    "assistant",
				"content": []any{},
				"tool_calls": []any{
					map[string]any{
						"id": "tool-call-1",
						"function": map[string]any{
							"name": mcpx.BuildNamespacedToolName(mcpx.DefaultServerID, "setSectionSize"),
							"arguments": map[string]any{
								"sectionId": "section-alpha",
							},
						},
					},
				},
			},
		},
		ToolCallArguments: map[string]string{
			"tool-call-1": `{"sectionId":"section-alpha"}`,
		},
		WaitingForResponse: true,
	}); err != nil {
		t.Fatalf("set external live follow state: %v", err)
	}

	handler := newAIRouteTestHandler(t, config.ModeIDE, fixture.managed, fixture.send, fixture.service, fixture.runtime, fixture.follow)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetAIFollowSnapshot,
		strings.NewReader(`{"projectConfigId":"project-alpha"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	var payload []realtime.AIFollowToolArgumentsUpdateContent
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode snapshot response: %v", err)
	}
	if len(payload) != 2 {
		t.Fatalf("expected two snapshot entries, got %#v", payload)
	}
	if payload[0].ProjectConfigID != "project-alpha" || payload[0].ChatID != "chat-managed" {
		t.Fatalf("unexpected managed snapshot identity %#v", payload[0])
	}
	if len(payload[0].IDsByType["section"]) != 1 || payload[0].IDsByType["section"][0] != "section-managed" {
		t.Fatalf("unexpected managed follow ids %#v", payload[0].IDsByType)
	}
	if payload[1].ProjectConfigID != "project-alpha" || payload[1].ChatID != "chat-alpha" {
		t.Fatalf("unexpected external snapshot identity %#v", payload[1])
	}
	if len(payload[1].IDsByType["section"]) != 1 || payload[1].IDsByType["section"][0] != "section-alpha" {
		t.Fatalf("unexpected external follow ids %#v", payload[1].IDsByType)
	}
}

func TestValidateGetLLMResponseMessageMatchesSourceDiscriminatorValidation(t *testing.T) {
	t.Parallel()

	for _, testCase := range []struct {
		name           string
		rawMessage     string
		expectedDetail string
	}{
		{
			name:           "missing_role",
			rawMessage:     `{"id":"user-managed","content":[{"type":"text","text":"Create a managed project."}]}`,
			expectedDetail: "message: Unable to extract tag using discriminator 'role'",
		},
		{
			name:           "unknown_role",
			rawMessage:     `{"id":"user-managed","role":"banana","content":[{"type":"text","text":"Create a managed project."}]}`,
			expectedDetail: "message: Input tag 'banana' found using 'role' does not match any of the expected tags: <ChatRole.system: 'system'>, <ChatRole.assistant: 'assistant'>, <ChatRole.user: 'user'>, <ChatRole.tool: 'tool'>",
		},
		{
			name:           "null_role",
			rawMessage:     `{"id":"user-managed","role":null,"content":[{"type":"text","text":"Create a managed project."}]}`,
			expectedDetail: "message: Input tag 'None' found using 'role' does not match any of the expected tags: <ChatRole.system: 'system'>, <ChatRole.assistant: 'assistant'>, <ChatRole.user: 'user'>, <ChatRole.tool: 'tool'>",
		},
		{
			name:           "tool_message_missing_tool_call_id",
			rawMessage:     `{"id":"tool-managed","role":"tool","content":[]}`,
			expectedDetail: "message.tool.tool_call_id: Field required",
		},
		{
			name:           "tool_message_null_tool_call_id",
			rawMessage:     `{"id":"tool-managed","role":"tool","tool_call_id":null,"content":[]}`,
			expectedDetail: "message.tool.tool_call_id: Input should be a valid string",
		},
		{
			name:           "tool_message_number_tool_call_id",
			rawMessage:     `{"id":"tool-managed","role":"tool","tool_call_id":123,"content":[]}`,
			expectedDetail: "message.tool.tool_call_id: Input should be a valid string",
		},
		{
			name:           "tool_message_blank_tool_call_id_is_allowed",
			rawMessage:     `{"id":"tool-managed","role":"tool","tool_call_id":"","content":[]}`,
			expectedDetail: "",
		},
		{
			name:           "tool_message_whitespace_tool_call_id_is_allowed",
			rawMessage:     `{"id":"tool-managed","role":"tool","tool_call_id":"   ","content":[]}`,
			expectedDetail: "",
		},
	} {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			err := validateGetLLMResponseMessage(json.RawMessage(testCase.rawMessage))
			if testCase.expectedDetail == "" {
				if err != nil {
					t.Fatalf("expected raw message to pass, got %v", err)
				}
				return
			}
			if err == nil {
				t.Fatal("expected validation error")
			}
			if got := formatGetLLMResponseValidationMessage(err); got != testCase.expectedDetail {
				t.Fatalf("expected validation detail %q, got %q", testCase.expectedDetail, got)
			}
		})
	}
}

func TestRegisterAIRoutesAllowDeploymentAIFollowSnapshotWhenLLMAccessEnabled(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	managedRun := agentruns.NewRun(nil, map[string]any{
		"runType":         managedchat.RunTypeManagedChat,
		"chatId":          "chat-managed",
		"projectConfigId": "project-alpha",
		"engineConfigId":  "engine-managed",
		"messages":        []any{},
	}, time.Date(2026, 3, 8, 12, 0, 0, 0, time.UTC))
	managedRun.ID = "run-managed-follow"
	fixture.managedLive.ActivateRun(managedRun)
	if err := fixture.managedLive.ApplyChunk(context.Background(), managedchat.StreamChunkParams{
		RunID:           managedRun.ID,
		ChatID:          "chat-managed",
		ProjectConfigID: stringPtr("project-alpha"),
		Chunk: realtime.ToolArgumentPreviewDeltaEvent{
			Type:           realtime.StreamingEventTypeToolArgumentPreview,
			MessageID:      "assistant-managed",
			ToolCallID:     "tool-call-managed",
			ToolName:       mcpx.BuildNamespacedToolName(mcpx.DefaultServerID, "setSectionSize"),
			ArgumentsDelta: `{"sectionId":"section-managed"}`,
			PreviewKind:    "paramValue",
			TargetIDsByType: realtime.ToolArgumentPreviewTargetIDs{
				Section: []string{"section-managed"},
			},
		},
	}); err != nil {
		t.Fatalf("apply managed preview chunk: %v", err)
	}

	deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
		Policy: map[string]any{"allowLLM": true},
	})
	handler := newAIRouteTestHandlerWithTranscriptionDeployment(
		t,
		config.ModeShare,
		deploymentRuntime,
		fixture.managed,
		fixture.send,
		fixture.service,
		fixture.runtime,
		fixture.transcriptionProfiles,
		fixture.transcriptionSessions,
		fixture.sessions,
		fixture.follow,
	)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetAIFollowSnapshot,
		strings.NewReader(`{"projectConfigId":"project-alpha"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	var payload []realtime.AIFollowToolArgumentsUpdateContent
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode snapshot response: %v", err)
	}
	if len(payload) != 1 {
		t.Fatalf("expected one snapshot entry, got %#v", payload)
	}
	if payload[0].ProjectConfigID != "project-alpha" || payload[0].ChatID != "chat-managed" {
		t.Fatalf("unexpected managed snapshot identity %#v", payload[0])
	}
	if len(payload[0].IDsByType["section"]) != 1 || payload[0].IDsByType["section"][0] != "section-managed" {
		t.Fatalf("unexpected managed follow ids %#v", payload[0].IDsByType)
	}
}

func TestRegisterAIRoutesAIFollowSnapshotPreservesExactProjectConfigIDMatching(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	managedRun := agentruns.NewRun(nil, map[string]any{
		"runType":         managedchat.RunTypeManagedChat,
		"chatId":          "chat-managed",
		"projectConfigId": "project-alpha",
		"engineConfigId":  "engine-managed",
		"messages":        []any{},
	}, time.Date(2026, 3, 8, 12, 0, 0, 0, time.UTC))
	managedRun.ID = "run-managed-follow"
	fixture.managedLive.ActivateRun(managedRun)
	if err := fixture.managedLive.ApplyChunk(context.Background(), managedchat.StreamChunkParams{
		RunID:           managedRun.ID,
		ChatID:          "chat-managed",
		ProjectConfigID: stringPtr("project-alpha"),
		Chunk: realtime.ToolArgumentPreviewDeltaEvent{
			Type:           realtime.StreamingEventTypeToolArgumentPreview,
			MessageID:      "assistant-managed",
			ToolCallID:     "tool-call-managed",
			ToolName:       mcpx.BuildNamespacedToolName(mcpx.DefaultServerID, "setSectionSize"),
			ArgumentsDelta: `{"sectionId":"section-managed"}`,
			PreviewKind:    "paramValue",
			TargetIDsByType: realtime.ToolArgumentPreviewTargetIDs{
				Section: []string{"section-managed"},
			},
		},
	}); err != nil {
		t.Fatalf("apply managed preview chunk: %v", err)
	}

	run := fixture.seedRun("run-follow", agentruns.RunStatusRunning)
	if err := fixture.runtime.ActivateRun(run.ID, &aiRouteStubController{}); err != nil {
		t.Fatalf("activate external run: %v", err)
	}
	if err := fixture.runtime.SetLiveChatState(run.ID, externalagents.ChatState{
		Messages: []map[string]any{
			{
				"id":      "assistant-1",
				"role":    "assistant",
				"content": []any{},
				"tool_calls": []any{
					map[string]any{
						"id": "tool-call-1",
						"function": map[string]any{
							"name": mcpx.BuildNamespacedToolName(mcpx.DefaultServerID, "setSectionSize"),
							"arguments": map[string]any{
								"sectionId": "section-alpha",
							},
						},
					},
				},
			},
		},
		ToolCallArguments: map[string]string{
			"tool-call-1": `{"sectionId":"section-alpha"}`,
		},
		WaitingForResponse: true,
	}); err != nil {
		t.Fatalf("set external live follow state: %v", err)
	}

	handler := newAIRouteTestHandler(t, config.ModeIDE, fixture.managed, fixture.send, fixture.service, fixture.runtime, fixture.follow)

	for _, testCase := range []struct {
		name         string
		body         string
		expectedSize int
	}{
		{name: "exact_match", body: `{"projectConfigId":"project-alpha"}`, expectedSize: 2},
		{name: "surrounding_whitespace_not_trimmed", body: `{"projectConfigId":" project-alpha "}`, expectedSize: 0},
		{name: "blank_string_allowed", body: `{"projectConfigId":""}`, expectedSize: 0},
	} {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			request := httptest.NewRequest(
				http.MethodPost,
				"/api"+RouteGetAIFollowSnapshot,
				strings.NewReader(testCase.body),
			)
			request.Header.Set("Content-Type", "application/json")
			response := httptest.NewRecorder()

			handler.ServeHTTP(response, request)

			if response.Code != http.StatusOK {
				t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
			}
			var payload []realtime.AIFollowToolArgumentsUpdateContent
			if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
				t.Fatalf("decode snapshot response: %v", err)
			}
			if len(payload) != testCase.expectedSize {
				t.Fatalf("expected %d snapshot entries, got %#v", testCase.expectedSize, payload)
			}
		})
	}
}

func TestRegisterAIRoutesBlockDeploymentAIFollowSnapshotWhenLLMAccessDisabled(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
		Policy: map[string]any{"allowLLM": false},
	})
	handler := newAIRouteTestHandlerWithTranscriptionDeployment(
		t,
		config.ModeShare,
		deploymentRuntime,
		fixture.managed,
		fixture.send,
		fixture.service,
		fixture.runtime,
		fixture.transcriptionProfiles,
		fixture.transcriptionSessions,
		fixture.sessions,
		fixture.follow,
	)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetAIFollowSnapshot,
		strings.NewReader(`{"projectConfigId":"project-alpha"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "llm_access_forbidden" {
		t.Fatalf("expected llm_access_forbidden, got %#v", payload)
	}
}

func TestRegisterAIRoutesAIFollowSnapshotReturnsValidationEnvelopeForMalformedJSONAndMissingProjectID(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	handler := newAIRouteTestHandler(t, config.ModeIDE, fixture.managed, fixture.send, fixture.service, fixture.runtime, fixture.follow)

	for _, testCase := range []struct {
		name           string
		body           string
		expectedDetail string
	}{
		{name: "malformed_json", body: `{"projectConfigId":`, expectedDetail: "unexpected end of JSON input"},
		{name: "missing_project_config_id", body: `{}`, expectedDetail: "projectConfigId: Field required"},
		{name: "null_project_config_id", body: `{"projectConfigId":null}`, expectedDetail: "projectConfigId: Field required"},
	} {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			request := httptest.NewRequest(
				http.MethodPost,
				"/api"+RouteGetAIFollowSnapshot,
				strings.NewReader(testCase.body),
			)
			request.Header.Set("Content-Type", "application/json")
			response := httptest.NewRecorder()

			handler.ServeHTTP(response, request)

			if response.Code != http.StatusUnprocessableEntity {
				t.Fatalf("expected 422, got %d with body %q", response.Code, response.Body.String())
			}
			var payload validationErrorResponse
			if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
				t.Fatalf("decode follow snapshot validation payload: %v", err)
			}
			if payload.StatusCode != 10422 {
				t.Fatalf("expected validation status code 10422, got %#v", payload)
			}
			if payload.Message != testCase.expectedDetail {
				t.Fatalf("expected validation detail %q, got %#v", testCase.expectedDetail, payload)
			}
			if payload.Data != nil {
				t.Fatalf("expected nil validation data, got %#v", payload.Data)
			}
		})
	}
}

func TestRegisterAIRoutesReturnsContextUsage(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	run := agentruns.NewRun(nil, map[string]any{
		"runType":         externalagents.RunTypeExternalAgent,
		"chatId":          "chat-usage",
		"projectConfigId": "project-alpha",
		"messages":        []any{},
	}, time.Date(2026, 3, 8, 12, 0, 0, 0, time.UTC))
	run.Status = agentruns.RunStatusCompleted
	run.Outputs = map[string]any{
		"messages": []any{},
		"usage": map[string]any{
			"promptTokens": 99,
		},
	}
	if err := fixture.store.Save(run); err != nil {
		t.Fatalf("save run: %v", err)
	}
	handler := newAIRouteTestHandler(t, config.ModeIDE, fixture.managed, fixture.send, fixture.service, fixture.runtime)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetExternalAgentChat,
		strings.NewReader(`{"chatId":"chat-usage","projectConfigId":"project-alpha"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	var payload ExternalAgentChatResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload.ContextUsage == nil || payload.ContextUsage.ContextUsedTokens == nil || *payload.ContextUsage.ContextUsedTokens != 99 {
		t.Fatalf("unexpected context usage %#v", payload.ContextUsage)
	}
	if !payload.ContextUsage.Estimated {
		t.Fatalf("expected prompt-only usage to be estimated, got %#v", payload.ContextUsage)
	}
}

func TestRegisterAIRoutesReturnsTypedNotFound(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	handler := newAIRouteTestHandler(t, config.ModeIDE, fixture.managed, fixture.send, fixture.service, fixture.runtime)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetExternalAgentChat,
		strings.NewReader(`{"chatId":"missing-chat","projectConfigId":"project-alpha"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "chat_not_found" {
		t.Fatalf("expected chat_not_found error code, got %#v", payload)
	}
}

func TestRegisterAIRoutesRejectsMissingChatID(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	fixture.seedHydrationRun(t)
	handler := newAIRouteTestHandler(t, config.ModeIDE, fixture.managed, fixture.send, fixture.service, fixture.runtime)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetExternalAgentChat,
		strings.NewReader(`{"chatId":"   ","projectConfigId":"project-alpha"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "chat_id_required" {
		t.Fatalf("expected chat_id_required, got %#v", payload)
	}
}

func TestRegisterAIRoutesRejectsOmittedProjectConfigIDFieldOnChatHydration(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	handler := newAIRouteTestHandler(t, config.ModeIDE, fixture.managed, fixture.send, fixture.service, fixture.runtime)

	testCases := []struct {
		name  string
		route string
		body  string
	}{
		{
			name:  "managed chat hydration",
			route: RouteGetLLMChat,
			body:  `{"chatId":"chat-managed"}`,
		},
		{
			name:  "external chat hydration",
			route: RouteGetExternalAgentChat,
			body:  `{"chatId":"chat-external"}`,
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			request := httptest.NewRequest(
				http.MethodPost,
				"/api"+testCase.route,
				strings.NewReader(testCase.body),
			)
			request.Header.Set("Content-Type", "application/json")
			response := httptest.NewRecorder()

			handler.ServeHTTP(response, request)

			if response.Code != http.StatusBadRequest {
				t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
			}
			var payload errorResponse
			if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
				t.Fatalf("decode error payload: %v", err)
			}
			if payload.Error.Code != "project_config_id_required" {
				t.Fatalf("expected project_config_id_required, got %#v", payload)
			}
		})
	}
}

func TestRegisterAIRoutesAllowsExplicitNullProjectConfigIDOnChatHydration(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	fixture.seedManagedHydrationRun(t)
	fixture.seedHydrationRun(t)
	handler := newAIRouteTestHandler(t, config.ModeIDE, fixture.managed, fixture.send, fixture.service, fixture.runtime)

	testCases := []struct {
		name  string
		route string
		body  string
	}{
		{
			name:  "managed chat hydration",
			route: RouteGetLLMChat,
			body:  `{"chatId":"chat-managed","projectConfigId":null}`,
		},
		{
			name:  "external chat hydration",
			route: RouteGetExternalAgentChat,
			body:  `{"chatId":"chat-external","projectConfigId":null}`,
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			request := httptest.NewRequest(
				http.MethodPost,
				"/api"+testCase.route,
				strings.NewReader(testCase.body),
			)
			request.Header.Set("Content-Type", "application/json")
			response := httptest.NewRecorder()

			handler.ServeHTTP(response, request)

			if response.Code != http.StatusOK {
				t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
			}
		})
	}
}

func TestRegisterAIRoutesAllowDeploymentLLMSurfacesWhenLLMAccessEnabled(t *testing.T) {
	t.Parallel()

	type testCase struct {
		name         string
		setup        func(*testing.T, aiRouteFixture)
		requestBody  string
		route        string
		expectedCode int
	}

	testCases := []testCase{
		{
			name:  "shared send route",
			route: RouteGetLLMResponse,
			requestBody: `{
				"chatId":null,
				"message":{"id":"user-1","role":"user","content":[{"type":"text","text":"Create a new section."}]},
				"engineConfigId":"engine-external",
				"thinking":false,
				"projectConfigId":"project-alpha",
				"sectionId":null,
				"allowUnscoped":true,
				"permissionMode":"minimal",
				"searchEnabled":false,
				"appGenerationByMessageId":{"user-1":"mcp_server"}
			}`,
			expectedCode: http.StatusOK,
		},
		{
			name: "managed hydrate route",
			setup: func(t *testing.T, fixture aiRouteFixture) {
				fixture.seedManagedHydrationRun(t)
			},
			route:        RouteGetLLMChat,
			requestBody:  `{"chatId":"chat-managed","projectConfigId":"project-alpha"}`,
			expectedCode: http.StatusOK,
		},
		{
			name: "managed stop route",
			setup: func(t *testing.T, fixture aiRouteFixture) {
				fixture.seedManagedRunningRun(t)
			},
			route:        RouteStopLLMChat,
			requestBody:  `{"chatId":"chat-managed-stop"}`,
			expectedCode: http.StatusOK,
		},
		{
			name: "external hydrate route",
			setup: func(t *testing.T, fixture aiRouteFixture) {
				fixture.seedHydrationRun(t)
			},
			route:        RouteGetExternalAgentChat,
			requestBody:  `{"chatId":"chat-external","projectConfigId":"project-alpha"}`,
			expectedCode: http.StatusOK,
		},
		{
			name: "external stop route",
			setup: func(t *testing.T, fixture aiRouteFixture) {
				run := fixture.seedRun("run-stop-deployment", agentruns.RunStatusRunning)
				controller := &aiRouteStubController{}
				if err := fixture.runtime.ActivateRun(run.ID, controller); err != nil {
					t.Fatalf("activate run: %v", err)
				}
			},
			route:        RouteStopExternalAgentRun,
			requestBody:  `{"runId":"run-stop-deployment"}`,
			expectedCode: http.StatusOK,
		},
		{
			name: "external approval route",
			setup: func(t *testing.T, fixture aiRouteFixture) {
				run := fixture.seedRun("run-approval-deployment", agentruns.RunStatusRunning)
				controller := &aiRouteStubController{}
				if err := fixture.runtime.ActivateRun(run.ID, controller); err != nil {
					t.Fatalf("activate run: %v", err)
				}
				if err := fixture.runtime.RegisterApproval(externalagents.ApprovalState{
					ApprovalID:      "approval-deployment",
					RunID:           run.ID,
					ProjectConfigID: "project-alpha",
					ChatID:          "chat-alpha",
				}); err != nil {
					t.Fatalf("register approval: %v", err)
				}
			},
			route:        RouteRespondExternalAgentApproval,
			requestBody:  `{"approvalId":"approval-deployment","approved":true}`,
			expectedCode: http.StatusOK,
		},
		{
			name: "external question route",
			setup: func(t *testing.T, fixture aiRouteFixture) {
				run := fixture.seedRun("run-question-deployment", agentruns.RunStatusRunning)
				controller := &aiRouteStubController{}
				if err := fixture.runtime.ActivateRun(run.ID, controller); err != nil {
					t.Fatalf("activate run: %v", err)
				}
				if err := fixture.runtime.RegisterQuestion(externalagents.QuestionState{
					ToolCallID:      "question-deployment",
					RunID:           run.ID,
					ProjectConfigID: "project-alpha",
					ChatID:          "chat-alpha",
				}); err != nil {
					t.Fatalf("register question: %v", err)
				}
			},
			route:        RouteRespondExternalAgentQuestion,
			requestBody:  `{"toolCallId":"question-deployment","answers":{"Language":"Go"}}`,
			expectedCode: http.StatusOK,
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
			if testCase.setup != nil {
				testCase.setup(t, fixture)
			}
			deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
				Mode:   config.ModeShare,
				Policy: map[string]any{"allowLLM": true},
			})
			shareSession, _, err := deploymentRuntime.GetOrCreateSession("share-a")
			if err != nil {
				t.Fatalf("get or create share session: %v", err)
			}
			handler := newAIRouteTestHandlerWithTranscriptionDeployment(
				t,
				config.ModeShare,
				deploymentRuntime,
				fixture.managed,
				fixture.send,
				fixture.service,
				fixture.runtime,
				fixture.transcriptionProfiles,
				fixture.transcriptionSessions,
				fixture.sessions,
				fixture.follow,
			)
			request := httptest.NewRequest(
				http.MethodPost,
				"/api"+testCase.route,
				strings.NewReader(testCase.requestBody),
			)
			request.Header.Set("Content-Type", "application/json")
			request.Header.Set(modes.ShareSessionHeaderName, shareSession.ID)
			response := httptest.NewRecorder()

			handler.ServeHTTP(response, request)

			if response.Code != testCase.expectedCode {
				t.Fatalf("expected %d, got %d with body %q", testCase.expectedCode, response.Code, response.Body.String())
			}
		})
	}
}

func TestRegisterAIRoutesBlockDeploymentLLMSurfacesWhenLLMAccessDisabled(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name        string
		route       string
		requestBody string
	}{
		{
			name:  "shared send route",
			route: RouteGetLLMResponse,
			requestBody: `{
				"chatId":null,
				"message":{"id":"user-1","role":"user","content":[{"type":"text","text":"Create a new section."}]},
				"engineConfigId":"engine-external",
				"thinking":false,
				"projectConfigId":"project-alpha",
				"sectionId":null,
				"allowUnscoped":true,
				"permissionMode":"minimal",
				"searchEnabled":false
			}`,
		},
		{
			name:        "managed hydrate route",
			route:       RouteGetLLMChat,
			requestBody: `{"chatId":"chat-managed","projectConfigId":"project-alpha"}`,
		},
		{
			name:        "managed stop route",
			route:       RouteStopLLMChat,
			requestBody: `{"chatId":"chat-managed-stop"}`,
		},
		{
			name:        "external hydrate route",
			route:       RouteGetExternalAgentChat,
			requestBody: `{"chatId":"chat-external","projectConfigId":"project-alpha"}`,
		},
		{
			name:        "external stop route",
			route:       RouteStopExternalAgentRun,
			requestBody: `{"runId":"run-stop-deployment"}`,
		},
		{
			name:        "external approval route",
			route:       RouteRespondExternalAgentApproval,
			requestBody: `{"approvalId":"approval-deployment","approved":true}`,
		},
		{
			name:        "external question route",
			route:       RouteRespondExternalAgentQuestion,
			requestBody: `{"toolCallId":"question-deployment","answers":{"Language":"Go"}}`,
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
			deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
				Mode:   config.ModeShare,
				Policy: map[string]any{"allowLLM": false},
			})
			shareSession, _, err := deploymentRuntime.GetOrCreateSession("share-a")
			if err != nil {
				t.Fatalf("get or create share session: %v", err)
			}
			handler := newAIRouteTestHandlerWithTranscriptionDeployment(
				t,
				config.ModeShare,
				deploymentRuntime,
				fixture.managed,
				fixture.send,
				fixture.service,
				fixture.runtime,
				fixture.transcriptionProfiles,
				fixture.transcriptionSessions,
				fixture.sessions,
				fixture.follow,
			)
			request := httptest.NewRequest(
				http.MethodPost,
				"/api"+testCase.route,
				strings.NewReader(testCase.requestBody),
			)
			request.Header.Set("Content-Type", "application/json")
			request.Header.Set(modes.ShareSessionHeaderName, shareSession.ID)
			response := httptest.NewRecorder()

			handler.ServeHTTP(response, request)

			if response.Code != http.StatusForbidden {
				t.Fatalf("expected 403, got %d with body %q", response.Code, response.Body.String())
			}
			var payload errorResponse
			if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
				t.Fatalf("decode error payload: %v", err)
			}
			if payload.Error.Code != "llm_access_forbidden" {
				t.Fatalf("expected llm_access_forbidden, got %#v", payload)
			}
		})
	}
}
