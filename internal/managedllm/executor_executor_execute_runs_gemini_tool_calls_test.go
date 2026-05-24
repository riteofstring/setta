package managedllm

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"testing"
	"time"

	"setta/internal/agentprofiles"
	"setta/internal/agentruns"
	"setta/internal/llmconfig"
	"setta/internal/managedchat"
	"setta/internal/mcpx"
)

func TestExecutorExecuteRunsGeminiToolCallsThroughMCPAndContinuesProviderTurns(t *testing.T) {
	t.Parallel()

	harness := newManagedLLMToolLoopHarness(t)
	requestBodies := make([]map[string]any, 0, 2)
	server := newManagedLLMProviderEventServer(
		t,
		&requestBodies,
		[]string{
			"data: {\"candidates\":[{\"content\":{\"role\":\"model\",\"parts\":[{\"functionCall\":{\"id\":\"tool-call-1\",\"name\":\"setta__create_top_level_section\",\"args\":{\"projectConfigId\":\"project-alpha\",\"implType\":\"Dict\"}}}]}}],\"usageMetadata\":{\"promptTokenCount\":18,\"candidatesTokenCount\":4,\"totalTokenCount\":22}}\n\n",
		},
		[]string{
			"data: {\"candidates\":[{\"content\":{\"role\":\"model\",\"parts\":[{\"text\":\"Tool loop complete\"}]}}],\"usageMetadata\":{\"promptTokenCount\":23,\"candidatesTokenCount\":3,\"totalTokenCount\":26}}\n\n",
		},
	)
	defer server.Close()

	executor := harness.executor(server.Client())
	result, err := executor.Execute(context.Background(), agentruns.ExecutionRequest{
		Run: harness.run,
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
		TemporaryIDs: harness.temporaryIDs,
	})
	if err != nil {
		t.Fatalf("execute managed gemini tool stream: %v", err)
	}

	assertCreateSectionToolCall(t, harness.capturedCalls)
	assertOutputMessagesWithFinalAssistant(t, result, 4, "Tool loop complete")
	assertProviderRequestCount(t, requestBodies, 2)
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

	harness := newManagedLLMToolLoopHarness(t)
	requestBodies := make([]map[string]any, 0, 2)
	server := newManagedLLMProviderEventServer(
		t,
		&requestBodies,
		[]string{
			anthropicMessageStartEvent("msg-tool-1", "claude-sonnet-4-5-20250929", 18, 0),
			anthropicToolUseBlockStartEvent(0, "tool-call-1", "setta__create_top_level_section"),
			anthropicInputJSONDeltaEvent(0, `{"projectConfigId":"project-alpha","implType":"Dict"}`),
			anthropicContentBlockStopEvent(0),
			anthropicMessageDeltaEvent("tool_use", 18, 4),
			anthropicMessageStopEvent(),
		},
		[]string{
			anthropicMessageStartEvent("msg-tool-2", "claude-sonnet-4-5-20250929", 23, 0),
			anthropicTextBlockStartEvent(0),
			anthropicTextDeltaEvent(0, "Tool loop complete"),
			anthropicContentBlockStopEvent(0),
			anthropicMessageDeltaEvent("end_turn", 23, 3),
			anthropicMessageStopEvent(),
		},
	)
	defer server.Close()

	executor := harness.executor(server.Client())
	result, err := executor.Execute(context.Background(), agentruns.ExecutionRequest{
		Profile: agentprofiles.Profile{
			ID:   "profile-alpha",
			Name: "Alpha",
		},
		Run: harness.run,
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

	assertCreateSectionToolCall(t, harness.capturedCalls)
	assertProviderRequestCount(t, requestBodies, 2)
	assertToolDefinitionsInclude(t, requestBodies[0]["tools"], 2, "setta__create_top_level_section", "setta__report_completion_status")
	assertAnthropicFollowUpToolExchange(t, requestBodies[1]["messages"])
	assertOutputMessagesWithFinalAssistant(t, result, 4, "Tool loop complete")
	assertSinglePersistedToolCall(t, result)
	if harness.broadcaster.Count() != 10 {
		t.Fatalf("expected 10 managed stream broadcasts, got %d", harness.broadcaster.Count())
	}
	assertResultFollowSectionID(t, harness.broadcaster)
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

	requestBodies := make([]map[string]any, 0, 1)
	server := newManagedLLMProviderEventServer(
		t,
		&requestBodies,
		[]string{
			anthropicMessageStartEvent("msg-thinking", "claude-sonnet-4-5-20250929", 12, 0),
			anthropicThinkingBlockStartEvent(0, "Planning"),
			anthropicThinkingDeltaEvent(0, " deeply"),
			anthropicSignatureDeltaEvent(0, "sig-thinking"),
			anthropicContentBlockStopEvent(0),
			anthropicTextBlockStartEvent(1),
			anthropicTextDeltaEvent(1, "Final answer"),
			anthropicContentBlockStopEvent(1),
			anthropicMessageDeltaEvent("end_turn", 12, 3),
			anthropicMessageStopEvent(),
		},
	)
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

	assertProviderRequestCount(t, requestBodies, 1)
	assertAnthropicThinkingRequest(t, requestBodies[0])
	assertThinkingAssistantOutput(t, result, "Planning deeply", "sig-thinking", "Final answer")
	if broadcaster.Count() != 7 {
		t.Fatalf("expected 7 streaming broadcasts, got %d", broadcaster.Count())
	}
}

func TestExecutorExecuteStreamsGeminiThinkingBlocksAndReturnsOutputs(t *testing.T) {
	t.Parallel()

	requestBodies := make([]map[string]any, 0, 1)
	server := newManagedLLMProviderEventServer(
		t,
		&requestBodies,
		[]string{
			"data: {\"candidates\":[{\"content\":{\"role\":\"model\",\"parts\":[{\"text\":\"Planning\",\"thought\":true,\"thoughtSignature\":\"c2ln\"}]}}]}\n\n",
			"data: {\"candidates\":[{\"content\":{\"role\":\"model\",\"parts\":[{\"text\":\"Final answer\"}]}}],\"usageMetadata\":{\"promptTokenCount\":12,\"candidatesTokenCount\":3,\"totalTokenCount\":15,\"thoughtsTokenCount\":2}}\n\n",
		},
	)
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

	assertProviderRequestCount(t, requestBodies, 1)
	assertGeminiThinkingRequest(t, requestBodies[0])
	assertThinkingAssistantOutput(t, result, "Planning", "c2ln", "Final answer")
	assertReasoningUsageTokens(t, result, 2)
	if broadcaster.Count() != 5 {
		t.Fatalf("expected 5 streaming broadcasts, got %d", broadcaster.Count())
	}
}

func TestExecutorExecuteRunsToolCallsThroughMCPAndContinuesProviderTurns(t *testing.T) {
	t.Parallel()

	harness := newManagedLLMToolLoopHarness(t)
	requestBodies := make([]map[string]any, 0, 2)
	server := newManagedLLMProviderEventServer(
		t,
		&requestBodies,
		[]string{
			"data: {\"choices\":[{\"index\":0,\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"tool-call-1\",\"type\":\"function\",\"function\":{\"name\":\"setta__create_top_level_section\",\"arguments\":\"{\\\"projectConfigId\\\":\\\"project-alpha\\\",\\\"implType\\\":\\\"Dict\\\"}\"}}]},\"finish_reason\":\"tool_calls\"}]}\n\n",
			"data: [DONE]\n\n",
		},
		[]string{
			"data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"Tool loop complete\"},\"finish_reason\":\"stop\"}]}\n\n",
			"data: [DONE]\n\n",
		},
	)
	defer server.Close()

	executor := harness.executor(server.Client())
	result, err := executor.Execute(context.Background(), agentruns.ExecutionRequest{
		Profile: agentprofiles.Profile{
			ID:   "profile-alpha",
			Name: "Alpha",
		},
		Run: harness.run,
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

	toolCall := assertCreateSectionToolCall(t, harness.capturedCalls)
	assertCreateSectionToolMeta(t, toolCall)
	assertProviderRequestCount(t, requestBodies, 2)
	assertToolDefinitionsInclude(t, requestBodies[0]["tools"], 2, "setta__create_top_level_section", "setta__report_completion_status")
	assertOpenAIFollowUpToolResult(t, requestBodies[1]["messages"])
	assertOutputMessagesWithFinalAssistant(t, result, 4, "Tool loop complete")
	assertSinglePersistedToolCall(t, result)
	if harness.broadcaster.Count() != 9 {
		t.Fatalf("expected 9 managed stream broadcasts, got %d", harness.broadcaster.Count())
	}
	assertResultFollowScope(t, harness.broadcaster)
	assertResultFollowSectionID(t, harness.broadcaster)
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
