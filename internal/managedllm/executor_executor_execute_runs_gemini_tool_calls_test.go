package managedllm

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"setta/internal/agentprofiles"
	"setta/internal/agentruns"
	"setta/internal/llmconfig"
	"setta/internal/managedchat"
	"setta/internal/mcpx"
	"setta/internal/tools"
)

func TestExecutorExecuteRunsGeminiToolCallsThroughMCPAndContinuesProviderTurns(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	temporaryIDs, err := mcpx.NewTemporaryIDStore(mcpx.TemporaryIDMapPath(root))
	if err != nil {
		t.Fatalf("new temporary id store: %v", err)
	}
	createdSectionID, err := temporaryIDs.EnsureTemporaryID("section-created")
	if err != nil {
		t.Fatalf("ensure temporary section id: %v", err)
	}

	requestBodies := make([]map[string]any, 0, 2)
	requestCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if handledManagedLLMModelLookupTestRequest(t, w, r) {
			return
		}
		body := map[string]any{}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("decode provider request: %v", err)
		}
		requestBodies = append(requestBodies, body)

		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			t.Fatal("expected flusher")
		}
		switch requestCount {
		case 0:
			fmt.Fprint(w, "data: {\"candidates\":[{\"content\":{\"role\":\"model\",\"parts\":[{\"functionCall\":{\"id\":\"tool-call-1\",\"name\":\"setta__create_top_level_section\",\"args\":{\"projectConfigId\":\"project-alpha\",\"implType\":\"Dict\"}}}]}}],\"usageMetadata\":{\"promptTokenCount\":18,\"candidatesTokenCount\":4,\"totalTokenCount\":22}}\n\n")
			flusher.Flush()
		case 1:
			fmt.Fprint(w, "data: {\"candidates\":[{\"content\":{\"role\":\"model\",\"parts\":[{\"text\":\"Tool loop complete\"}]}}],\"usageMetadata\":{\"promptTokenCount\":23,\"candidatesTokenCount\":3,\"totalTokenCount\":26}}\n\n")
			flusher.Flush()
		default:
			t.Fatalf("unexpected provider request count %d", requestCount)
		}
		requestCount++
	}))
	defer server.Close()

	broadcaster := &captureBroadcaster{}
	live := managedchat.NewLiveRuntime(managedchat.LiveRuntimeOptions{Broadcaster: broadcaster})
	run := newManagedChatTestRun()
	live.ActivateRun(run)

	capturedCalls := make([]struct {
		ToolName  string
		Arguments map[string]any
		Meta      map[string]any
	}, 0, 1)
	toolClient := &stubToolClient{
		initTools: managedCompletionStatusInitTools(),
		discoverableTools: map[string]mcpx.ToolDescriptor{
			"setta__create_top_level_section": {
				ServerID:       mcpx.DefaultServerID,
				NamespacedName: "setta__create_top_level_section",
				RemoteName:     "create_top_level_section",
				Description:    "Create a top-level section.",
				InputSchema: map[string]any{
					"type": "object",
				},
				Metadata: &tools.Metadata{
					ResultIDPathsByType: map[tools.IDType][]string{
						tools.IDTypeSection: {"sectionId"},
					},
				},
			},
		},
		call: func(_ context.Context, namespacedToolName string, arguments map[string]any, meta map[string]any) (mcpx.ToolCallResult, error) {
			capturedCalls = append(capturedCalls, struct {
				ToolName  string
				Arguments map[string]any
				Meta      map[string]any
			}{
				ToolName:  namespacedToolName,
				Arguments: arguments,
				Meta:      meta,
			})
			return mcpx.ToolCallResult{
				StructuredContent: map[string]any{"sectionId": createdSectionID},
				Text:              "{\"sectionId\":\"" + createdSectionID + "\"}",
			}, nil
		},
	}

	executor := NewExecutor(ExecutorOptions{
		Live:       live,
		Tools:      toolClient,
		HTTPClient: server.Client(),
		ResultFollow: NewToolResultFollowEmitter(ToolResultFollowEmitterOptions{
			Broadcaster:  broadcaster,
			TemporaryIDs: temporaryIDs,
		}),
	})
	result, err := executor.Execute(context.Background(), agentruns.ExecutionRequest{
		Run: run,
		LLMConfig: llmconfig.Config{
			ID:        "primary",
			Model:     "gemini-2.5-pro",
			Provider:  "gemini",
			BaseURL:   server.URL,
			APIKeyEnv: "GEMINI_API_KEY",
			MCPServerIDs: []string{
				mcpx.DefaultServerID,
			},
		},
		APIKeys: map[string]string{
			"GEMINI_API_KEY": "secret",
		},
		SystemPrompt:    "System prompt",
		ProjectConfigID: "project-alpha",
		ChatID:          "chat-alpha",
		Inputs: map[string]any{
			"runType": "llm_chat",
			"messages": []any{
				map[string]any{
					"id":   "user-1",
					"role": "user",
					"content": []any{
						map[string]any{"type": "text", "text": "Please create a section"},
					},
					"attachments": []any{},
				},
			},
		},
		MCPServerIDs: []string{mcpx.DefaultServerID},
		TemporaryIDs: temporaryIDs,
	})
	if err != nil {
		t.Fatalf("execute managed gemini tool stream: %v", err)
	}

	if len(capturedCalls) != 1 {
		t.Fatalf("expected one tool call, got %#v", capturedCalls)
	}
	if capturedCalls[0].ToolName != "setta__create_top_level_section" {
		t.Fatalf("unexpected tool name %#v", capturedCalls[0])
	}
	if capturedCalls[0].Arguments["projectConfigId"] != "project-alpha" {
		t.Fatalf("unexpected tool arguments %#v", capturedCalls[0].Arguments)
	}

	outputMessages, ok := result.Outputs["messages"].([]any)
	if !ok || len(outputMessages) != 4 {
		t.Fatalf("expected user, tool-call assistant, tool result, and final assistant messages, got %#v", result.Outputs["messages"])
	}
	finalAssistant, ok := outputMessages[3].(map[string]any)
	if !ok || assistantText(finalAssistant) != "Tool loop complete" {
		t.Fatalf("unexpected final assistant %#v", outputMessages[3])
	}

	if len(requestBodies) != 2 {
		t.Fatalf("expected two provider requests, got %#v", requestBodies)
	}
	if _, ok := requestBodies[0]["tools"].([]any); !ok {
		t.Fatalf("expected gemini tools on first request, got %#v", requestBodies[0])
	}
	secondContents, ok := requestBodies[1]["contents"].([]any)
	if !ok || len(secondContents) < 3 {
		t.Fatalf("expected follow-up contents with tool history, got %#v", requestBodies[1]["contents"])
	}
}

func TestExecutorExecuteRunsAnthropicToolCallsThroughMCPAndContinuesProviderTurns(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	temporaryIDs, err := mcpx.NewTemporaryIDStore(mcpx.TemporaryIDMapPath(root))
	if err != nil {
		t.Fatalf("new temporary id store: %v", err)
	}
	createdSectionID, err := temporaryIDs.EnsureTemporaryID("section-created")
	if err != nil {
		t.Fatalf("ensure temporary section id: %v", err)
	}

	requestBodies := make([]map[string]any, 0, 2)
	requestCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if handledManagedLLMModelLookupTestRequest(t, w, r) {
			return
		}
		body := map[string]any{}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("decode provider request: %v", err)
		}
		requestBodies = append(requestBodies, body)

		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			t.Fatal("expected flusher")
		}
		switch requestCount {
		case 0:
			fmt.Fprint(w, anthropicMessageStartEvent("msg-tool-1", "claude-sonnet-4-5-20250929", 18, 0))
			flusher.Flush()
			fmt.Fprint(w, anthropicToolUseBlockStartEvent(0, "tool-call-1", "setta__create_top_level_section"))
			flusher.Flush()
			fmt.Fprint(w, anthropicInputJSONDeltaEvent(0, `{"projectConfigId":"project-alpha","implType":"Dict"}`))
			flusher.Flush()
			fmt.Fprint(w, anthropicContentBlockStopEvent(0))
			flusher.Flush()
			fmt.Fprint(w, anthropicMessageDeltaEvent("tool_use", 18, 4))
			flusher.Flush()
			fmt.Fprint(w, anthropicMessageStopEvent())
			flusher.Flush()
		case 1:
			fmt.Fprint(w, anthropicMessageStartEvent("msg-tool-2", "claude-sonnet-4-5-20250929", 23, 0))
			flusher.Flush()
			fmt.Fprint(w, anthropicTextBlockStartEvent(0))
			flusher.Flush()
			fmt.Fprint(w, anthropicTextDeltaEvent(0, "Tool loop complete"))
			flusher.Flush()
			fmt.Fprint(w, anthropicContentBlockStopEvent(0))
			flusher.Flush()
			fmt.Fprint(w, anthropicMessageDeltaEvent("end_turn", 23, 3))
			flusher.Flush()
			fmt.Fprint(w, anthropicMessageStopEvent())
			flusher.Flush()
		default:
			t.Fatalf("unexpected provider request count %d", requestCount)
		}
		requestCount++
	}))
	defer server.Close()

	broadcaster := &captureBroadcaster{}
	live := managedchat.NewLiveRuntime(managedchat.LiveRuntimeOptions{Broadcaster: broadcaster})
	run := newManagedChatTestRun()
	live.ActivateRun(run)

	capturedCalls := make([]struct {
		ToolName  string
		Arguments map[string]any
		Meta      map[string]any
	}, 0, 1)
	toolClient := &stubToolClient{
		initTools: managedCompletionStatusInitTools(),
		discoverableTools: map[string]mcpx.ToolDescriptor{
			"setta__create_top_level_section": {
				ServerID:       mcpx.DefaultServerID,
				NamespacedName: "setta__create_top_level_section",
				RemoteName:     "create_top_level_section",
				Description:    "Create a top-level section.",
				InputSchema: map[string]any{
					"type": "object",
				},
				Metadata: &tools.Metadata{
					ResultIDPathsByType: map[tools.IDType][]string{
						tools.IDTypeSection: {"sectionId"},
					},
				},
			},
		},
		call: func(_ context.Context, namespacedToolName string, arguments map[string]any, meta map[string]any) (mcpx.ToolCallResult, error) {
			capturedCalls = append(capturedCalls, struct {
				ToolName  string
				Arguments map[string]any
				Meta      map[string]any
			}{
				ToolName:  namespacedToolName,
				Arguments: arguments,
				Meta:      meta,
			})
			return mcpx.ToolCallResult{
				StructuredContent: map[string]any{"sectionId": createdSectionID},
				Text:              "{\"sectionId\":\"" + createdSectionID + "\"}",
			}, nil
		},
	}

	executor := NewExecutor(ExecutorOptions{
		Live:       live,
		Tools:      toolClient,
		HTTPClient: server.Client(),
		ResultFollow: NewToolResultFollowEmitter(ToolResultFollowEmitterOptions{
			Broadcaster:  broadcaster,
			TemporaryIDs: temporaryIDs,
		}),
	})
	result, err := executor.Execute(context.Background(), agentruns.ExecutionRequest{
		Profile: agentprofiles.Profile{
			ID:   "profile-alpha",
			Name: "Alpha",
		},
		Run: run,
		LLMConfig: llmconfig.Config{
			ID:        "primary",
			Model:     "claude-sonnet-4-5-20250929",
			Provider:  "anthropic",
			BaseURL:   server.URL,
			APIKeyEnv: "ANTHROPIC_API_KEY",
		},
		MCPServerIDs:           []string{mcpx.DefaultServerID},
		CompletionGuardEnabled: true,
		APIKeys: map[string]string{
			"ANTHROPIC_API_KEY": "secret",
		},
		SystemPrompt:    "System prompt",
		ProjectConfigID: "project-alpha",
		ChatID:          "chat-alpha",
		Inputs: map[string]any{
			"runType":       "llm_chat",
			"allowUnscoped": true,
			"messages": []any{
				map[string]any{
					"id":   "user-1",
					"role": "user",
					"content": []any{
						map[string]any{"type": "text", "text": "Use the tool"},
					},
					"attachments": []any{},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("execute managed anthropic tool stream: %v", err)
	}

	if len(capturedCalls) != 1 {
		t.Fatalf("expected one tool call, got %#v", capturedCalls)
	}
	if capturedCalls[0].ToolName != "setta__create_top_level_section" {
		t.Fatalf("unexpected tool name %#v", capturedCalls[0])
	}
	if capturedCalls[0].Arguments["projectConfigId"] != "project-alpha" {
		t.Fatalf("unexpected tool arguments %#v", capturedCalls[0].Arguments)
	}

	if len(requestBodies) != 2 {
		t.Fatalf("expected two provider requests, got %d", len(requestBodies))
	}
	firstTools, ok := requestBodies[0]["tools"].([]any)
	if !ok || len(firstTools) != 2 {
		t.Fatalf("expected anthropic tool definitions including completion reporting, got %#v", requestBodies[0]["tools"])
	}
	if !toolPayloadIncludesName(firstTools, "setta__create_top_level_section") {
		t.Fatalf("expected anthropic tool payload to include create_top_level_section, got %#v", firstTools)
	}
	if !toolPayloadIncludesName(firstTools, "setta__report_completion_status") {
		t.Fatalf("expected anthropic tool payload to include report_completion_status, got %#v", firstTools)
	}
	secondMessages, ok := requestBodies[1]["messages"].([]any)
	if !ok || len(secondMessages) < 3 {
		t.Fatalf("expected follow-up anthropic transcript, got %#v", requestBodies[1]["messages"])
	}
	foundAssistantToolUse := false
	foundUserToolResult := false
	for _, rawMessage := range secondMessages {
		message, ok := rawMessage.(map[string]any)
		if !ok {
			continue
		}
		role, _ := message["role"].(string)
		content, _ := message["content"].([]any)
		if role == "assistant" {
			for _, rawBlock := range content {
				block, _ := rawBlock.(map[string]any)
				if block["type"] == "tool_use" && block["id"] == "tool-call-1" {
					foundAssistantToolUse = true
				}
			}
		}
		if role == "user" {
			for _, rawBlock := range content {
				block, _ := rawBlock.(map[string]any)
				if block["type"] == "tool_result" && block["tool_use_id"] == "tool-call-1" {
					foundUserToolResult = true
				}
			}
		}
	}
	if !foundAssistantToolUse || !foundUserToolResult {
		t.Fatalf("expected anthropic follow-up transcript with tool_use and tool_result, got %#v", secondMessages)
	}

	messages, ok := result.Outputs["messages"].([]any)
	if !ok || len(messages) != 4 {
		t.Fatalf("expected user, tool-call assistant, tool, final assistant messages, got %#v", result.Outputs["messages"])
	}
	if len(result.ToolCalls) != 1 {
		t.Fatalf("expected one persisted tool call, got %#v", result.ToolCalls)
	}
	if assistantText(messages[3].(map[string]any)) != "Tool loop complete" {
		t.Fatalf("unexpected final assistant text %#v", messages[3])
	}
	if broadcaster.Count() != 10 {
		t.Fatalf("expected 10 managed stream broadcasts, got %d", broadcaster.Count())
	}
	followMessages := broadcaster.ResultFollowMessages()
	if len(followMessages) != 1 {
		t.Fatalf("expected one result-follow update, got %#v", followMessages)
	}
	if got := followMessages[0].Content.IDsByType["section"]; len(got) != 1 || got[0] != "section-created" {
		t.Fatalf("expected canonical section follow id, got %#v", followMessages[0].Content.IDsByType)
	}
}

func TestExecutorValidateAllowsThinkingWithExplicitReasoningConfig(t *testing.T) {
	t.Parallel()

	executor := NewExecutor(ExecutorOptions{})
	err := executor.Validate(agentruns.ExecutionRequest{
		Run: agentruns.Run{ID: "run-alpha"},
		LLMConfig: llmconfig.Config{
			Model:     "gpt-4o-mini",
			Provider:  "openai",
			APIKeyEnv: "OPENAI_API_KEY",
		},
		RequestParams: map[string]any{
			"model":               "gpt-4o-mini",
			"custom_llm_provider": "openai",
			"reasoning_effort":    "high",
		},
		SystemPrompt: "System prompt",
		ChatID:       "chat-alpha",
		Thinking:     true,
		Inputs: map[string]any{
			"runType": "llm_chat",
		},
	})
	if err != nil {
		t.Fatalf("expected explicit reasoning config to validate, got %v", err)
	}
}

func TestExecutorValidateAllowsThinkingForOpenAIReasoningModel(t *testing.T) {
	t.Parallel()

	executor := NewExecutor(ExecutorOptions{})
	err := executor.Validate(agentruns.ExecutionRequest{
		Run: agentruns.Run{ID: "run-alpha"},
		LLMConfig: llmconfig.Config{
			Model:     "gpt-5-codex",
			Provider:  "openai",
			APIKeyEnv: "OPENAI_API_KEY",
		},
		APIKeys: map[string]string{
			"OPENAI_API_KEY": "secret",
		},
		SystemPrompt: "System prompt",
		ChatID:       "chat-alpha",
		Thinking:     true,
		Inputs: map[string]any{
			"runType": "llm_chat",
		},
	})
	if err != nil {
		t.Fatalf("expected supported OpenAI reasoning model to validate, got %v", err)
	}
}

func TestExecutorValidateRejectsAzureWithoutExplicitConfig(t *testing.T) {
	t.Parallel()

	executor := NewExecutor(ExecutorOptions{})
	err := executor.Validate(agentruns.ExecutionRequest{
		Run: agentruns.Run{ID: "run-alpha"},
		LLMConfig: llmconfig.Config{
			Model:     "gpt-4o-mini",
			Provider:  "azure",
			APIKeyEnv: "AZURE_OPENAI_API_KEY",
			BaseURL:   "https://example-resource.openai.azure.com",
		},
		APIKeys: map[string]string{
			"AZURE_OPENAI_API_KEY": "secret",
		},
		SystemPrompt: "System prompt",
		ChatID:       "chat-alpha",
		Inputs: map[string]any{
			"runType": "llm_chat",
		},
	})
	if !errors.Is(err, ErrProviderConfigInvalid) {
		t.Fatalf("expected provider config invalid, got %v", err)
	}
}

func TestExecutorValidateRejectsAzureThinking(t *testing.T) {
	t.Parallel()

	executor := NewExecutor(ExecutorOptions{})
	err := executor.Validate(agentruns.ExecutionRequest{
		Run: agentruns.Run{ID: "run-alpha"},
		LLMConfig: llmconfig.Config{
			Model:     "gpt-4o-mini",
			Provider:  "azure",
			APIKeyEnv: "AZURE_OPENAI_API_KEY",
			BaseURL:   "https://example-resource.openai.azure.com",
		},
		RequestParams: map[string]any{
			"api_version": "2024-06-01",
		},
		APIKeys: map[string]string{
			"AZURE_OPENAI_API_KEY": "secret",
		},
		SystemPrompt: "System prompt",
		ChatID:       "chat-alpha",
		Thinking:     true,
		Inputs: map[string]any{
			"runType": "llm_chat",
		},
	})
	if !errors.Is(err, ErrReasoningUnsupported) {
		t.Fatalf("expected reasoning unsupported, got %v", err)
	}
}

func TestExecutorValidateAllowsThinkingForAnthropicWithExplicitConfig(t *testing.T) {
	t.Parallel()

	executor := NewExecutor(ExecutorOptions{})
	err := executor.Validate(agentruns.ExecutionRequest{
		Run: agentruns.Run{ID: "run-alpha"},
		LLMConfig: llmconfig.Config{
			Model:     "claude-sonnet-4-5-20250929",
			Provider:  "anthropic",
			APIKeyEnv: "ANTHROPIC_API_KEY",
		},
		RequestParams: map[string]any{
			"model":               "claude-sonnet-4-5-20250929",
			"custom_llm_provider": "anthropic",
			"max_tokens":          4096,
			"thinking": map[string]any{
				"type":          "enabled",
				"budget_tokens": 1024,
			},
		},
		SystemPrompt: "System prompt",
		ChatID:       "chat-alpha",
		Thinking:     true,
		Inputs: map[string]any{
			"runType": "llm_chat",
		},
	})
	if err != nil {
		t.Fatalf("expected explicit anthropic thinking config to validate, got %v", err)
	}
}

func TestExecutorValidateAllowsThinkingForGeminiWithExplicitConfig(t *testing.T) {
	t.Parallel()

	executor := NewExecutor(ExecutorOptions{})
	err := executor.Validate(agentruns.ExecutionRequest{
		Run: agentruns.Run{ID: "run-alpha"},
		LLMConfig: llmconfig.Config{
			Model:     "gemini-2.5-pro",
			Provider:  "gemini",
			APIKeyEnv: "GEMINI_API_KEY",
		},
		RequestParams: map[string]any{
			"model":               "gemini-2.5-pro",
			"custom_llm_provider": "gemini",
			"thinking_config": map[string]any{
				"thinking_budget": 128,
				"thinking_level":  "medium",
			},
		},
		SystemPrompt: "System prompt",
		ChatID:       "chat-alpha",
		Thinking:     true,
		Inputs: map[string]any{
			"runType": "llm_chat",
		},
	})
	if err != nil {
		t.Fatalf("expected explicit gemini thinking config to validate, got %v", err)
	}
}

func TestExecutorExecuteStreamsAnthropicThinkingBlocksAndReturnsOutputs(t *testing.T) {
	t.Parallel()

	var seenRequest map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if handledManagedLLMModelLookupTestRequest(t, w, r) {
			return
		}
		if err := json.NewDecoder(r.Body).Decode(&seenRequest); err != nil {
			t.Fatalf("decode provider request: %v", err)
		}
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			t.Fatal("expected flusher")
		}
		fmt.Fprint(w, anthropicMessageStartEvent("msg-thinking", "claude-sonnet-4-5-20250929", 12, 0))
		flusher.Flush()
		fmt.Fprint(w, anthropicThinkingBlockStartEvent(0, "Planning"))
		flusher.Flush()
		fmt.Fprint(w, anthropicThinkingDeltaEvent(0, " deeply"))
		flusher.Flush()
		fmt.Fprint(w, anthropicSignatureDeltaEvent(0, "sig-thinking"))
		flusher.Flush()
		fmt.Fprint(w, anthropicContentBlockStopEvent(0))
		flusher.Flush()
		fmt.Fprint(w, anthropicTextBlockStartEvent(1))
		flusher.Flush()
		fmt.Fprint(w, anthropicTextDeltaEvent(1, "Final answer"))
		flusher.Flush()
		fmt.Fprint(w, anthropicContentBlockStopEvent(1))
		flusher.Flush()
		fmt.Fprint(w, anthropicMessageDeltaEvent("end_turn", 12, 3))
		flusher.Flush()
		fmt.Fprint(w, anthropicMessageStopEvent())
		flusher.Flush()
	}))
	defer server.Close()

	broadcaster := &captureBroadcaster{}
	live := managedchat.NewLiveRuntime(managedchat.LiveRuntimeOptions{Broadcaster: broadcaster})
	run := newManagedChatTestRun()
	live.ActivateRun(run)

	executor := NewExecutor(ExecutorOptions{
		Live:       live,
		HTTPClient: server.Client(),
	})
	result, err := executor.Execute(context.Background(), agentruns.ExecutionRequest{
		Run: run,
		LLMConfig: llmconfig.Config{
			ID:       "primary",
			Model:    "claude-sonnet-4-5-20250929",
			Provider: "anthropic",
			BaseURL:  server.URL,
			OtherParams: map[string]any{
				"max_tokens": 4096,
				"thinking": map[string]any{
					"type":          "enabled",
					"budget_tokens": 1024,
				},
			},
			APIKeyEnv: "ANTHROPIC_API_KEY",
		},
		RequestParams: map[string]any{
			"max_tokens": 4096,
			"thinking": map[string]any{
				"type":          "enabled",
				"budget_tokens": 1024,
			},
		},
		APIKeys: map[string]string{
			"ANTHROPIC_API_KEY": "secret",
		},
		SystemPrompt:    "System prompt",
		ProjectConfigID: "project-alpha",
		ChatID:          "chat-alpha",
		Thinking:        true,
		Inputs: map[string]any{
			"runType": "llm_chat",
			"messages": []any{
				map[string]any{
					"id":   "user-1",
					"role": "user",
					"content": []any{
						map[string]any{"type": "text", "text": "Think through this"},
					},
					"attachments": []any{},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("execute managed anthropic thinking stream: %v", err)
	}

	thinkingConfig, ok := seenRequest["thinking"].(map[string]any)
	if !ok || thinkingConfig["type"] != "enabled" || thinkingConfig["budget_tokens"] != float64(1024) {
		t.Fatalf("expected anthropic thinking request config, got %#v", seenRequest["thinking"])
	}
	if seenRequest["max_tokens"] != float64(4096) {
		t.Fatalf("expected anthropic max_tokens override, got %#v", seenRequest["max_tokens"])
	}

	messages, ok := result.Outputs["messages"].([]any)
	if !ok || len(messages) != 2 {
		t.Fatalf("expected user and assistant messages, got %#v", result.Outputs["messages"])
	}
	assistant, ok := messages[1].(map[string]any)
	if !ok {
		t.Fatalf("expected assistant message map, got %#v", messages[1])
	}
	content, ok := assistant["content"].([]any)
	if !ok || len(content) != 2 {
		t.Fatalf("expected thinking plus text content, got %#v", assistant["content"])
	}
	thinkingBlock, ok := content[0].(map[string]any)
	if !ok || thinkingBlock["type"] != "thinking" {
		t.Fatalf("expected thinking block at content[0], got %#v", content[0])
	}
	if thinkingBlock["thinking"] != "Planning deeply" {
		t.Fatalf("unexpected thinking content %#v", thinkingBlock)
	}
	if thinkingBlock["signature"] != "sig-thinking" {
		t.Fatalf("unexpected thinking signature %#v", thinkingBlock)
	}
	textBlock, ok := content[1].(map[string]any)
	if !ok || textBlock["text"] != "Final answer" {
		t.Fatalf("unexpected text block %#v", content[1])
	}
	if broadcaster.Count() != 7 {
		t.Fatalf("expected 7 streaming broadcasts, got %d", broadcaster.Count())
	}
}

func TestExecutorExecuteStreamsGeminiThinkingBlocksAndReturnsOutputs(t *testing.T) {
	t.Parallel()

	var seenRequest map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if handledManagedLLMModelLookupTestRequest(t, w, r) {
			return
		}
		if err := json.NewDecoder(r.Body).Decode(&seenRequest); err != nil {
			t.Fatalf("decode provider request: %v", err)
		}
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			t.Fatal("expected flusher")
		}
		fmt.Fprint(w, "data: {\"candidates\":[{\"content\":{\"role\":\"model\",\"parts\":[{\"text\":\"Planning\",\"thought\":true,\"thoughtSignature\":\"c2ln\"}]}}]}\n\n")
		flusher.Flush()
		fmt.Fprint(w, "data: {\"candidates\":[{\"content\":{\"role\":\"model\",\"parts\":[{\"text\":\"Final answer\"}]}}],\"usageMetadata\":{\"promptTokenCount\":12,\"candidatesTokenCount\":3,\"totalTokenCount\":15,\"thoughtsTokenCount\":2}}\n\n")
		flusher.Flush()
	}))
	defer server.Close()

	broadcaster := &captureBroadcaster{}
	live := managedchat.NewLiveRuntime(managedchat.LiveRuntimeOptions{Broadcaster: broadcaster})
	run := newManagedChatTestRun()
	live.ActivateRun(run)

	executor := NewExecutor(ExecutorOptions{
		Live:       live,
		HTTPClient: server.Client(),
	})
	result, err := executor.Execute(context.Background(), agentruns.ExecutionRequest{
		Run: run,
		LLMConfig: llmconfig.Config{
			ID:       "primary",
			Model:    "gemini-2.5-pro",
			Provider: "gemini",
			BaseURL:  server.URL,
			OtherParams: map[string]any{
				"thinking_config": map[string]any{
					"thinking_budget": 128,
					"thinking_level":  "medium",
				},
			},
			APIKeyEnv: "GEMINI_API_KEY",
		},
		RequestParams: map[string]any{
			"thinking_config": map[string]any{
				"thinking_budget": 128,
				"thinking_level":  "medium",
			},
		},
		APIKeys: map[string]string{
			"GEMINI_API_KEY": "secret",
		},
		SystemPrompt:    "System prompt",
		ProjectConfigID: "project-alpha",
		ChatID:          "chat-alpha",
		Thinking:        true,
		Inputs: map[string]any{
			"runType": "llm_chat",
			"messages": []any{
				map[string]any{
					"id":   "user-1",
					"role": "user",
					"content": []any{
						map[string]any{"type": "text", "text": "Think through this"},
					},
					"attachments": []any{},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("execute managed gemini thinking stream: %v", err)
	}

	generationConfig, ok := seenRequest["generationConfig"].(map[string]any)
	if !ok {
		t.Fatalf("expected generationConfig payload, got %#v", seenRequest["generationConfig"])
	}
	thinkingConfig, ok := generationConfig["thinkingConfig"].(map[string]any)
	if !ok {
		t.Fatalf("expected gemini thinkingConfig, got %#v", generationConfig["thinkingConfig"])
	}
	if thinkingConfig["includeThoughts"] != true {
		t.Fatalf("expected includeThoughts=true, got %#v", thinkingConfig)
	}
	if thinkingConfig["thinkingBudget"] != float64(128) {
		t.Fatalf("expected gemini thinkingBudget=128, got %#v", thinkingConfig)
	}
	if thinkingConfig["thinkingLevel"] != "MEDIUM" {
		t.Fatalf("expected gemini thinkingLevel=MEDIUM, got %#v", thinkingConfig)
	}

	messages, ok := result.Outputs["messages"].([]any)
	if !ok || len(messages) != 2 {
		t.Fatalf("expected user and assistant messages, got %#v", result.Outputs["messages"])
	}
	assistant, ok := messages[1].(map[string]any)
	if !ok {
		t.Fatalf("expected assistant message map, got %#v", messages[1])
	}
	content, ok := assistant["content"].([]any)
	if !ok || len(content) != 2 {
		t.Fatalf("expected thinking plus text content, got %#v", assistant["content"])
	}
	thinkingBlock, ok := content[0].(map[string]any)
	if !ok || thinkingBlock["type"] != "thinking" {
		t.Fatalf("expected thinking block at content[0], got %#v", content[0])
	}
	if thinkingBlock["thinking"] != "Planning" {
		t.Fatalf("unexpected thinking content %#v", thinkingBlock)
	}
	if thinkingBlock["signature"] != "c2ln" {
		t.Fatalf("unexpected thinking signature %#v", thinkingBlock)
	}
	textBlock, ok := content[1].(map[string]any)
	if !ok || textBlock["text"] != "Final answer" {
		t.Fatalf("unexpected text block %#v", content[1])
	}

	usage, ok := result.Outputs["usage"].(map[string]any)
	if !ok || int(usage["reasoning_output_tokens"].(float64)) != 2 {
		t.Fatalf("unexpected usage payload %#v", result.Outputs["usage"])
	}
	if broadcaster.Count() != 5 {
		t.Fatalf("expected 5 streaming broadcasts, got %d", broadcaster.Count())
	}
}

func TestExecutorExecuteRunsToolCallsThroughMCPAndContinuesProviderTurns(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	temporaryIDs, err := mcpx.NewTemporaryIDStore(mcpx.TemporaryIDMapPath(root))
	if err != nil {
		t.Fatalf("new temporary id store: %v", err)
	}
	createdSectionID, err := temporaryIDs.EnsureTemporaryID("section-created")
	if err != nil {
		t.Fatalf("ensure temporary section id: %v", err)
	}

	requestBodies := make([]map[string]any, 0, 2)
	requestCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if handledManagedLLMModelLookupTestRequest(t, w, r) {
			return
		}
		body := map[string]any{}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("decode provider request: %v", err)
		}
		requestBodies = append(requestBodies, body)

		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			t.Fatal("expected flusher")
		}

		switch requestCount {
		case 0:
			fmt.Fprint(w, "data: {\"choices\":[{\"index\":0,\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"tool-call-1\",\"type\":\"function\",\"function\":{\"name\":\"setta__create_top_level_section\",\"arguments\":\"{\\\"projectConfigId\\\":\\\"project-alpha\\\",\\\"implType\\\":\\\"Dict\\\"}\"}}]},\"finish_reason\":\"tool_calls\"}]}\n\n")
			flusher.Flush()
			fmt.Fprint(w, "data: [DONE]\n\n")
		case 1:
			fmt.Fprint(w, "data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"Tool loop complete\"},\"finish_reason\":\"stop\"}]}\n\n")
			flusher.Flush()
			fmt.Fprint(w, "data: [DONE]\n\n")
		default:
			t.Fatalf("unexpected provider request count %d", requestCount)
		}
		requestCount++
	}))
	defer server.Close()

	broadcaster := &captureBroadcaster{}
	live := managedchat.NewLiveRuntime(managedchat.LiveRuntimeOptions{Broadcaster: broadcaster})
	run := newManagedChatTestRun()
	live.ActivateRun(run)

	capturedCalls := make([]struct {
		ToolName  string
		Arguments map[string]any
		Meta      map[string]any
	}, 0, 1)
	toolClient := &stubToolClient{
		initTools: managedCompletionStatusInitTools(),
		discoverableTools: map[string]mcpx.ToolDescriptor{
			"setta__create_top_level_section": {
				ServerID:       mcpx.DefaultServerID,
				NamespacedName: "setta__create_top_level_section",
				RemoteName:     "create_top_level_section",
				Description:    "Create a top-level section.",
				InputSchema: map[string]any{
					"type": "object",
				},
				Metadata: &tools.Metadata{
					ResultIDPathsByType: map[tools.IDType][]string{
						tools.IDTypeSection: {"sectionId"},
					},
				},
			},
		},
		call: func(_ context.Context, namespacedToolName string, arguments map[string]any, meta map[string]any) (mcpx.ToolCallResult, error) {
			capturedCalls = append(capturedCalls, struct {
				ToolName  string
				Arguments map[string]any
				Meta      map[string]any
			}{
				ToolName:  namespacedToolName,
				Arguments: arguments,
				Meta:      meta,
			})
			return mcpx.ToolCallResult{
				StructuredContent: map[string]any{"sectionId": createdSectionID},
				Text:              "{\"sectionId\":\"" + createdSectionID + "\"}",
			}, nil
		},
	}

	executor := NewExecutor(ExecutorOptions{
		Live:       live,
		Tools:      toolClient,
		HTTPClient: server.Client(),
		ResultFollow: NewToolResultFollowEmitter(ToolResultFollowEmitterOptions{
			Broadcaster:  broadcaster,
			TemporaryIDs: temporaryIDs,
		}),
	})
	result, err := executor.Execute(context.Background(), agentruns.ExecutionRequest{
		Profile: agentprofiles.Profile{
			ID:   "profile-alpha",
			Name: "Alpha",
		},
		Run: run,
		LLMConfig: llmconfig.Config{
			ID:        "primary",
			Model:     "gpt-4o-mini",
			Provider:  "openai",
			BaseURL:   server.URL + "/v1",
			APIKeyEnv: "OPENAI_API_KEY",
		},
		MCPServerIDs:           []string{mcpx.DefaultServerID},
		CompletionGuardEnabled: true,
		APIKeys: map[string]string{
			"OPENAI_API_KEY": "secret",
		},
		SystemPrompt:    "System prompt",
		ProjectConfigID: "project-alpha",
		ChatID:          "chat-alpha",
		Inputs: map[string]any{
			"runType":       "llm_chat",
			"allowUnscoped": true,
			"messages": []any{
				map[string]any{
					"id":   "user-1",
					"role": "user",
					"content": []any{
						map[string]any{"type": "text", "text": "Use the tool"},
					},
					"attachments": []any{},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("execute managed llm tool stream: %v", err)
	}

	if len(capturedCalls) != 1 {
		t.Fatalf("expected one tool call, got %#v", capturedCalls)
	}
	if capturedCalls[0].ToolName != "setta__create_top_level_section" {
		t.Fatalf("unexpected tool name %#v", capturedCalls[0])
	}
	if capturedCalls[0].Arguments["projectConfigId"] != "project-alpha" {
		t.Fatalf("unexpected tool arguments %#v", capturedCalls[0].Arguments)
	}
	if capturedCalls[0].Meta["projectConfigId"] != "project-alpha" {
		t.Fatalf("unexpected tool meta %#v", capturedCalls[0].Meta)
	}
	if capturedCalls[0].Meta["chatId"] != "chat-alpha" {
		t.Fatalf("unexpected tool meta %#v", capturedCalls[0].Meta)
	}
	if capturedCalls[0].Meta["allowUnscoped"] != true {
		t.Fatalf("unexpected tool meta %#v", capturedCalls[0].Meta)
	}

	if len(requestBodies) != 2 {
		t.Fatalf("expected two provider requests, got %d", len(requestBodies))
	}
	firstTools, ok := requestBodies[0]["tools"].([]any)
	if !ok || len(firstTools) != 2 {
		t.Fatalf("expected tool definitions including completion reporting, got %#v", requestBodies[0]["tools"])
	}
	if !toolPayloadIncludesName(firstTools, "setta__create_top_level_section") {
		t.Fatalf("expected OpenAI chat tool payload to include create_top_level_section, got %#v", firstTools)
	}
	if !toolPayloadIncludesName(firstTools, "setta__report_completion_status") {
		t.Fatalf("expected OpenAI chat tool payload to include report_completion_status, got %#v", firstTools)
	}
	secondMessages, ok := requestBodies[1]["messages"].([]any)
	if !ok || len(secondMessages) < 4 {
		t.Fatalf("expected follow-up provider transcript, got %#v", requestBodies[1]["messages"])
	}
	foundToolMessage := false
	for _, rawMessage := range secondMessages {
		message, ok := rawMessage.(map[string]any)
		if !ok {
			continue
		}
		if message["role"] != "tool" {
			continue
		}
		if message["tool_call_id"] != "tool-call-1" {
			t.Fatalf("unexpected tool follow-up message %#v", message)
		}
		foundToolMessage = true
	}
	if !foundToolMessage {
		t.Fatalf("expected provider follow-up to include tool result message, got %#v", secondMessages)
	}

	messages, ok := result.Outputs["messages"].([]any)
	if !ok || len(messages) != 4 {
		t.Fatalf("expected user, tool-call assistant, tool, final assistant messages, got %#v", result.Outputs["messages"])
	}
	if len(result.ToolCalls) != 1 {
		t.Fatalf("expected one persisted tool call, got %#v", result.ToolCalls)
	}
	if assistantText(messages[3].(map[string]any)) != "Tool loop complete" {
		t.Fatalf("unexpected final assistant text %#v", messages[3])
	}
	if broadcaster.Count() != 9 {
		t.Fatalf("expected 9 managed stream broadcasts, got %d", broadcaster.Count())
	}
	followMessages := broadcaster.ResultFollowMessages()
	if len(followMessages) != 1 {
		t.Fatalf("expected one result-follow update, got %#v", followMessages)
	}
	if followMessages[0].Content.ProjectConfigID != "project-alpha" || followMessages[0].Content.ChatID != "chat-alpha" {
		t.Fatalf("unexpected result-follow message %#v", followMessages[0])
	}
	if got := followMessages[0].Content.IDsByType["section"]; len(got) != 1 || got[0] != "section-created" {
		t.Fatalf("expected canonical section follow id, got %#v", followMessages[0].Content.IDsByType)
	}
}

func newManagedChatTestRun() agentruns.Run {
	now := time.Date(2026, 3, 9, 22, 0, 0, 0, time.UTC)
	run := agentruns.NewRun(nil, map[string]any{
		"runType":         "llm_chat",
		"chatId":          "chat-alpha",
		"projectConfigId": "project-alpha",
		"sectionId":       "section-chat",
		"messages": []any{
			map[string]any{
				"id":   "user-1",
				"role": "user",
				"content": []any{
					map[string]any{"type": "text", "text": "Hello from the user"},
				},
				"attachments": []any{},
			},
		},
	}, now)
	run.ID = "run-alpha"
	run.Status = agentruns.RunStatusRunning
	return run
}

func assistantText(message map[string]any) string {
	content, ok := message["content"].([]any)
	if !ok || len(content) == 0 {
		return ""
	}
	block, ok := content[0].(map[string]any)
	if !ok {
		return ""
	}
	text, _ := block["text"].(string)
	return text
}

func waitForCondition(t *testing.T, timeout time.Duration, check func() bool) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if check() {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("timed out waiting for condition")
}

func testStringPtr(value string) *string {
	return &value
}

func filterToolDescriptorsForServers(source map[string]mcpx.ToolDescriptor, serverIDs map[string]struct{}) map[string]mcpx.ToolDescriptor {
	filtered := map[string]mcpx.ToolDescriptor{}
	for name, descriptor := range source {
		if len(serverIDs) > 0 {
			if _, ok := serverIDs[descriptor.ServerID]; !ok {
				continue
			}
		}
		filtered[name] = descriptor
	}
	return filtered
}

func openAIResponseReasoningItemAddedEvent(outputIndex int, itemID string) string {
	return openAIResponseEvent(map[string]any{
		"type":            "response.output_item.added",
		"sequence_number": 1,
		"output_index":    outputIndex,
		"item": map[string]any{
			"type":    "reasoning",
			"id":      itemID,
			"summary": []any{},
			"content": []any{},
			"status":  "in_progress",
		},
	})
}

func openAIResponseReasoningItemAddedWithContentEvent(outputIndex int, itemID string, summary string, reasoning string) string {
	return openAIResponseEvent(map[string]any{
		"type":            "response.output_item.added",
		"sequence_number": 1,
		"output_index":    outputIndex,
		"item": map[string]any{
			"type":   "reasoning",
			"id":     itemID,
			"status": "in_progress",
			"summary": []any{
				map[string]any{"text": summary},
			},
			"content": []any{
				map[string]any{"type": "reasoning_text", "text": reasoning},
			},
		},
	})
}

func openAIResponseReasoningSummaryPartAddedEvent(itemID string, outputIndex int, summaryIndex int, text string) string {
	return openAIResponseEvent(map[string]any{
		"type":            "response.reasoning_summary_part.added",
		"sequence_number": 2,
		"item_id":         itemID,
		"output_index":    outputIndex,
		"summary_index":   summaryIndex,
		"part": map[string]any{
			"type": "summary_text",
			"text": text,
		},
	})
}

func openAIResponseReasoningSummaryPartDoneEvent(itemID string, outputIndex int, summaryIndex int, text string) string {
	return openAIResponseEvent(map[string]any{
		"type":            "response.reasoning_summary_part.done",
		"sequence_number": 3,
		"item_id":         itemID,
		"output_index":    outputIndex,
		"summary_index":   summaryIndex,
		"part": map[string]any{
			"type": "summary_text",
			"text": text,
		},
	})
}

func openAIResponseReasoningSummaryTextDeltaEvent(itemID string, outputIndex int, summaryIndex int, delta string) string {
	return openAIResponseEvent(map[string]any{
		"type":            "response.reasoning_summary_text.delta",
		"sequence_number": 2,
		"item_id":         itemID,
		"output_index":    outputIndex,
		"summary_index":   summaryIndex,
		"delta":           delta,
	})
}

func openAIResponseReasoningSummaryTextDoneEvent(itemID string, outputIndex int, summaryIndex int, text string) string {
	return openAIResponseEvent(map[string]any{
		"type":            "response.reasoning_summary_text.done",
		"sequence_number": 3,
		"item_id":         itemID,
		"output_index":    outputIndex,
		"summary_index":   summaryIndex,
		"text":            text,
	})
}

func openAIResponseReasoningTextDeltaEvent(itemID string, outputIndex int, contentIndex int, delta string) string {
	return openAIResponseEvent(map[string]any{
		"type":            "response.reasoning_text.delta",
		"sequence_number": 3,
		"item_id":         itemID,
		"output_index":    outputIndex,
		"content_index":   contentIndex,
		"delta":           delta,
	})
}

func openAIResponseReasoningTextDoneEvent(itemID string, outputIndex int, contentIndex int, text string) string {
	return openAIResponseEvent(map[string]any{
		"type":            "response.reasoning_text.done",
		"sequence_number": 4,
		"item_id":         itemID,
		"output_index":    outputIndex,
		"content_index":   contentIndex,
		"text":            text,
	})
}

func openAIResponseContentPartDoneReasoningTextEvent(itemID string, outputIndex int, contentIndex int, text string) string {
	return openAIResponseEvent(map[string]any{
		"type":            "response.content_part.done",
		"sequence_number": 4,
		"item_id":         itemID,
		"output_index":    outputIndex,
		"content_index":   contentIndex,
		"part": map[string]any{
			"type": "reasoning_text",
			"text": text,
		},
	})
}

func openAIResponseContentPartAddedReasoningTextEvent(itemID string, outputIndex int, contentIndex int, text string) string {
	return openAIResponseEvent(map[string]any{
		"type":            "response.content_part.added",
		"sequence_number": 4,
		"item_id":         itemID,
		"output_index":    outputIndex,
		"content_index":   contentIndex,
		"part": map[string]any{
			"type": "reasoning_text",
			"text": text,
		},
	})
}

func openAIResponseReasoningItemDoneEvent(outputIndex int, itemID string, summary string, reasoning string) string {
	return openAIResponseEvent(map[string]any{
		"type":            "response.output_item.done",
		"sequence_number": 4,
		"output_index":    outputIndex,
		"item": map[string]any{
			"type":   "reasoning",
			"id":     itemID,
			"status": "completed",
			"summary": []any{
				map[string]any{"text": summary},
			},
			"content": []any{
				map[string]any{"type": "reasoning_text", "text": reasoning},
			},
		},
	})
}

func openAIResponseOutputTextDoneEvent(itemID string, outputIndex int, contentIndex int, text string) string {
	return openAIResponseEvent(map[string]any{
		"type":            "response.output_text.done",
		"sequence_number": 5,
		"item_id":         itemID,
		"output_index":    outputIndex,
		"content_index":   contentIndex,
		"text":            text,
		"logprobs":        []any{},
	})
}

func openAIResponseContentPartDoneOutputTextEvent(itemID string, outputIndex int, contentIndex int, text string) string {
	return openAIResponseEvent(map[string]any{
		"type":            "response.content_part.done",
		"sequence_number": 5,
		"item_id":         itemID,
		"output_index":    outputIndex,
		"content_index":   contentIndex,
		"part": map[string]any{
			"type":        "output_text",
			"text":        text,
			"annotations": []any{},
			"logprobs":    []any{},
		},
	})
}

func openAIResponseContentPartAddedOutputTextEvent(itemID string, outputIndex int, contentIndex int, text string) string {
	return openAIResponseEvent(map[string]any{
		"type":            "response.content_part.added",
		"sequence_number": 5,
		"item_id":         itemID,
		"output_index":    outputIndex,
		"content_index":   contentIndex,
		"part": map[string]any{
			"type":        "output_text",
			"text":        text,
			"annotations": []any{},
			"logprobs":    []any{},
		},
	})
}

func openAIResponseOutputTextDeltaEvent(itemID string, outputIndex int, contentIndex int, delta string) string {
	return openAIResponseEvent(map[string]any{
		"type":            "response.output_text.delta",
		"sequence_number": 4,
		"item_id":         itemID,
		"output_index":    outputIndex,
		"content_index":   contentIndex,
		"delta":           delta,
		"logprobs":        []any{},
	})
}

func openAIResponseRefusalDeltaEvent(itemID string, outputIndex int, contentIndex int, delta string) string {
	return openAIResponseEvent(map[string]any{
		"type":            "response.refusal.delta",
		"sequence_number": 6,
		"item_id":         itemID,
		"output_index":    outputIndex,
		"content_index":   contentIndex,
		"delta":           delta,
	})
}

func openAIResponseContentPartDoneRefusalEvent(itemID string, outputIndex int, contentIndex int, refusal string) string {
	return openAIResponseEvent(map[string]any{
		"type":            "response.content_part.done",
		"sequence_number": 7,
		"item_id":         itemID,
		"output_index":    outputIndex,
		"content_index":   contentIndex,
		"part": map[string]any{
			"type":    "refusal",
			"refusal": refusal,
		},
	})
}

func openAIResponseRefusalDoneEvent(itemID string, outputIndex int, contentIndex int, refusal string) string {
	return openAIResponseEvent(map[string]any{
		"type":            "response.refusal.done",
		"sequence_number": 7,
		"item_id":         itemID,
		"output_index":    outputIndex,
		"content_index":   contentIndex,
		"refusal":         refusal,
	})
}

func openAIResponseOutputMessageDoneEvent(itemID string, outputIndex int, text string) string {
	return openAIResponseEvent(map[string]any{
		"type":            "response.output_item.done",
		"sequence_number": 5,
		"output_index":    outputIndex,
		"item": map[string]any{
			"type":   "message",
			"id":     itemID,
			"role":   "assistant",
			"status": "incomplete",
			"content": []any{
				map[string]any{
					"type":        "output_text",
					"text":        text,
					"annotations": []any{},
				},
			},
		},
	})
}

func openAIResponseOutputMessageAddedEvent(itemID string, outputIndex int, text string) string {
	return openAIResponseEvent(map[string]any{
		"type":            "response.output_item.added",
		"sequence_number": 5,
		"output_index":    outputIndex,
		"item": map[string]any{
			"type":   "message",
			"id":     itemID,
			"role":   "assistant",
			"status": "in_progress",
			"content": []any{
				map[string]any{
					"type":        "output_text",
					"text":        text,
					"annotations": []any{},
				},
			},
		},
	})
}

func openAIResponseFunctionCallItemAddedEvent(outputIndex int, itemID string, callID string, name string) string {
	return openAIResponseEvent(map[string]any{
		"type":            "response.output_item.added",
		"sequence_number": 1,
		"output_index":    outputIndex,
		"item": map[string]any{
			"type":      "function_call",
			"id":        itemID,
			"call_id":   callID,
			"name":      name,
			"arguments": "",
			"status":    "in_progress",
		},
	})
}

func openAIResponseFunctionCallItemDoneEvent(outputIndex int, itemID string, callID string, name string, arguments string) string {
	return openAIResponseEvent(map[string]any{
		"type":            "response.output_item.done",
		"sequence_number": 2,
		"output_index":    outputIndex,
		"item": map[string]any{
			"type":      "function_call",
			"id":        itemID,
			"call_id":   callID,
			"name":      name,
			"arguments": arguments,
			"status":    "completed",
		},
	})
}

func openAIResponseFunctionCallArgumentsDoneEvent(itemID string, outputIndex int, name string, arguments string) string {
	return openAIResponseEvent(map[string]any{
		"type":            "response.function_call_arguments.done",
		"sequence_number": 3,
		"item_id":         itemID,
		"output_index":    outputIndex,
		"name":            name,
		"arguments":       arguments,
	})
}

func openAIResponseFunctionCallArgumentsDeltaEvent(itemID string, outputIndex int, delta string) string {
	return openAIResponseEvent(map[string]any{
		"type":            "response.function_call_arguments.delta",
		"sequence_number": 2,
		"item_id":         itemID,
		"output_index":    outputIndex,
		"delta":           delta,
	})
}

func openAIResponseCompletedEvent(output []map[string]any, inputTokens int, outputTokens int, totalTokens int, reasoningTokens int) string {
	return openAIResponseEvent(map[string]any{
		"type":            "response.completed",
		"sequence_number": 99,
		"response": map[string]any{
			"id":         "response-1",
			"object":     "response",
			"created_at": 1741567200,
			"status":     "completed",
			"model":      "gpt-5-codex",
			"output":     output,
			"usage": map[string]any{
				"input_tokens": inputTokens,
				"input_tokens_details": map[string]any{
					"cached_tokens": 0,
				},
				"output_tokens": outputTokens,
				"output_tokens_details": map[string]any{
					"reasoning_tokens": reasoningTokens,
				},
				"total_tokens": totalTokens,
			},
		},
	})
}

func openAIResponseIncompleteEvent(reason string) string {
	return openAIResponseIncompleteEventWithOutput(reason, nil, 0)
}

func openAIResponseIncompleteEventWithOutput(reason string, output []map[string]any, reasoningTokens int) string {
	return openAIResponseEvent(map[string]any{
		"type":            "response.incomplete",
		"sequence_number": 98,
		"response": map[string]any{
			"id":                 "response-1",
			"object":             "response",
			"created_at":         1741567200,
			"status":             "incomplete",
			"model":              "gpt-5-codex",
			"output":             output,
			"incomplete_details": map[string]any{"reason": reason},
			"usage": map[string]any{
				"input_tokens": 8,
				"input_tokens_details": map[string]any{
					"cached_tokens": 0,
				},
				"output_tokens": 1,
				"output_tokens_details": map[string]any{
					"reasoning_tokens": reasoningTokens,
				},
				"total_tokens": 9,
			},
		},
	})
}

func openAIResponseFailedEventWithOutput(message string, output []map[string]any, reasoningTokens int) string {
	return openAIResponseEvent(map[string]any{
		"type":            "response.failed",
		"sequence_number": 98,
		"response": map[string]any{
			"id":         "response-1",
			"object":     "response",
			"created_at": 1741567200,
			"status":     "failed",
			"model":      "gpt-5-codex",
			"output":     output,
			"error": map[string]any{
				"message": message,
			},
			"usage": map[string]any{
				"input_tokens": 8,
				"input_tokens_details": map[string]any{
					"cached_tokens": 0,
				},
				"output_tokens": 1,
				"output_tokens_details": map[string]any{
					"reasoning_tokens": reasoningTokens,
				},
				"total_tokens": 9,
			},
		},
	})
}

func openAIResponseEvent(payload map[string]any) string {
	encoded, err := json.Marshal(payload)
	if err != nil {
		panic(err)
	}
	return "data: " + string(encoded) + "\n\n"
}

func anthropicMessageStartEvent(messageID string, model string, inputTokens int, outputTokens int) string {
	return fmt.Sprintf("event: message_start\ndata: {\"type\":\"message_start\",\"message\":{\"id\":%q,\"type\":\"message\",\"role\":\"assistant\",\"content\":[],\"model\":%q,\"stop_reason\":null,\"stop_sequence\":null,\"container\":{\"id\":\"container-1\",\"expires_at\":\"2026-03-12T00:00:00Z\"},\"usage\":{\"input_tokens\":%d,\"output_tokens\":%d,\"cache_creation_input_tokens\":0,\"cache_read_input_tokens\":0,\"inference_geo\":\"us\",\"server_tool_use\":{\"web_fetch_requests\":0,\"web_search_requests\":0},\"service_tier\":\"standard\",\"cache_creation\":{\"ephemeral_1h_input_tokens\":0,\"ephemeral_5m_input_tokens\":0}}}}\n\n", messageID, model, inputTokens, outputTokens)
}

func anthropicTextBlockStartEvent(index int) string {
	return fmt.Sprintf("event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":%d,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}\n\n", index)
}

func anthropicThinkingBlockStartEvent(index int, thinking string) string {
	return fmt.Sprintf("event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":%d,\"content_block\":{\"type\":\"thinking\",\"thinking\":%q}}\n\n", index, thinking)
}

func anthropicToolUseBlockStartEvent(index int, toolCallID string, toolName string) string {
	return fmt.Sprintf("event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":%d,\"content_block\":{\"type\":\"tool_use\",\"id\":%q,\"name\":%q,\"input\":{}}}\n\n", index, toolCallID, toolName)
}

func anthropicTextDeltaEvent(index int, text string) string {
	return fmt.Sprintf("event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":%d,\"delta\":{\"type\":\"text_delta\",\"text\":%q}}\n\n", index, text)
}

func anthropicThinkingDeltaEvent(index int, thinking string) string {
	return fmt.Sprintf("event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":%d,\"delta\":{\"type\":\"thinking_delta\",\"thinking\":%q}}\n\n", index, thinking)
}

func anthropicSignatureDeltaEvent(index int, signature string) string {
	return fmt.Sprintf("event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":%d,\"delta\":{\"type\":\"signature_delta\",\"signature\":%q}}\n\n", index, signature)
}

func anthropicInputJSONDeltaEvent(index int, partialJSON string) string {
	return fmt.Sprintf("event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":%d,\"delta\":{\"type\":\"input_json_delta\",\"partial_json\":%q}}\n\n", index, partialJSON)
}

func anthropicContentBlockStopEvent(index int) string {
	return fmt.Sprintf("event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":%d}\n\n", index)
}

func anthropicMessageDeltaEvent(stopReason string, inputTokens int, outputTokens int) string {
	return fmt.Sprintf("event: message_delta\ndata: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":%q,\"stop_sequence\":null},\"usage\":{\"input_tokens\":%d,\"output_tokens\":%d,\"cache_creation_input_tokens\":0,\"cache_read_input_tokens\":0,\"server_tool_use\":{\"web_fetch_requests\":0,\"web_search_requests\":0}}}\n\n", stopReason, inputTokens, outputTokens)
}

func anthropicMessageStopEvent() string {
	return "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n"
}
