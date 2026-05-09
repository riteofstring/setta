package managedllm

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"setta/internal/agentruns"
	"setta/internal/llmconfig"
	"setta/internal/managedchat"
	"setta/internal/mcpx"
	"setta/internal/realtime"
	"setta/internal/tools"
)

func TestExecutorExecuteRecoversOpenAIResponsesOutputItemDoneBeforeIncompleteFailure(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if handledManagedLLMModelLookupTestRequest(t, w, r) {
			return
		}
		if r.URL.Path != "/v1/responses" {
			t.Fatalf("unexpected path %q", r.URL.Path)
		}
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			t.Fatal("expected flusher")
		}
		fmt.Fprint(w, openAIResponseOutputTextDeltaEvent("message-1", 0, 0, "Recovered"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseOutputMessageDoneEvent("message-1", 0, "Recovered final item"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseIncompleteEvent("max_output_tokens"))
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
			ID:        "primary",
			Model:     "gpt-5-codex",
			Provider:  "openai",
			BaseURL:   server.URL + "/v1",
			APIKeyEnv: "OPENAI_API_KEY",
		},
		APIKeys: map[string]string{
			"OPENAI_API_KEY": "secret",
		},
		SystemPrompt:    "System prompt",
		ProjectConfigID: "project-alpha",
		ChatID:          "chat-alpha",
		SectionID:       testStringPtr("section-chat"),
		Thinking:        true,
		Inputs: map[string]any{
			"runType": "llm_chat",
			"messages": []any{
				map[string]any{
					"id":   "user-1",
					"role": "user",
					"content": []any{
						map[string]any{"type": "text", "text": "Keep going"},
					},
					"attachments": []any{},
				},
			},
		},
	})
	if err == nil {
		t.Fatal("expected provider failure from incomplete response")
	}
	if err.Error() != "managed llm provider request failed: response incomplete (max_output_tokens)" {
		t.Fatalf("unexpected provider error %q", err.Error())
	}

	messages, ok := result.Outputs["messages"].([]any)
	if !ok || len(messages) != 2 {
		t.Fatalf("expected user and partial assistant messages, got %#v", result.Outputs["messages"])
	}
	assistant, ok := messages[1].(map[string]any)
	if !ok {
		t.Fatalf("expected assistant message map, got %#v", messages[1])
	}
	if assistantText(assistant) != "Recovered final item" {
		t.Fatalf("expected output_item.done text to be preserved, got %#v", assistant)
	}

	state, stateErr := live.GetLiveChatState(run.ID)
	if stateErr != nil {
		t.Fatalf("get live state after provider failure: %v", stateErr)
	}
	if state == nil || state.WaitingForResponse {
		t.Fatalf("expected provider failure to clear waiting state, got %#v", state)
	}
	if len(state.Messages) != 2 || assistantText(state.Messages[1]) != "Recovered final item" {
		t.Fatalf("expected finalized live output_item.done assistant message, got %#v", state)
	}
	broadcastMessages := broadcaster.Messages()
	if findBroadcastTextDelta(broadcastMessages, 0, " final item") == nil {
		t.Fatalf("expected output_item.done text delta in %#v", broadcastMessages)
	}
	if broadcaster.Count() != 5 {
		t.Fatalf("expected start, two text deltas, stop, finalized broadcasts, got %d", broadcaster.Count())
	}
}

func TestExecutorExecuteRecoversOpenAIResponsesReasoningItemDoneBeforeIncompleteFailure(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if handledManagedLLMModelLookupTestRequest(t, w, r) {
			return
		}
		if r.URL.Path != "/v1/responses" {
			t.Fatalf("unexpected path %q", r.URL.Path)
		}
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			t.Fatal("expected flusher")
		}
		fmt.Fprint(w, openAIResponseReasoningItemAddedEvent(0, "reasoning-1"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseReasoningSummaryTextDeltaEvent("reasoning-1", 0, 0, "Plan"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseReasoningTextDeltaEvent("reasoning-1", 0, 0, "Planning"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseReasoningItemDoneEvent(
			0,
			"reasoning-1",
			"Plan summary",
			"Planning deeply",
		))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseIncompleteEvent("max_output_tokens"))
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
			ID:        "primary",
			Model:     "gpt-5-codex",
			Provider:  "openai",
			BaseURL:   server.URL + "/v1",
			APIKeyEnv: "OPENAI_API_KEY",
		},
		APIKeys: map[string]string{
			"OPENAI_API_KEY": "secret",
		},
		SystemPrompt:    "System prompt",
		ProjectConfigID: "project-alpha",
		ChatID:          "chat-alpha",
		SectionID:       testStringPtr("section-chat"),
		Thinking:        true,
		Inputs: map[string]any{
			"runType": "llm_chat",
			"messages": []any{
				map[string]any{
					"id":   "user-1",
					"role": "user",
					"content": []any{
						map[string]any{"type": "text", "text": "Keep going"},
					},
					"attachments": []any{},
				},
			},
		},
	})
	if err == nil {
		t.Fatal("expected provider failure from incomplete response")
	}
	if err.Error() != "managed llm provider request failed: response incomplete (max_output_tokens)" {
		t.Fatalf("unexpected provider error %q", err.Error())
	}

	messages, ok := result.Outputs["messages"].([]any)
	if !ok || len(messages) != 2 {
		t.Fatalf("expected user and partial assistant messages, got %#v", result.Outputs["messages"])
	}
	assistant, ok := messages[1].(map[string]any)
	if !ok {
		t.Fatalf("expected assistant message map, got %#v", messages[1])
	}
	assistantContent, ok := assistant["content"].([]any)
	if !ok || len(assistantContent) != 1 {
		t.Fatalf("expected one recovered thinking block, got %#v", assistant)
	}
	thinkingBlock, ok := assistantContent[0].(map[string]any)
	if !ok || thinkingBlock["summary"] != "Plan summary" || thinkingBlock["thinking"] != "Planning deeply" {
		t.Fatalf("expected recovered authoritative reasoning block, got %#v", assistant)
	}

	state, stateErr := live.GetLiveChatState(run.ID)
	if stateErr != nil {
		t.Fatalf("get live state after provider failure: %v", stateErr)
	}
	if state == nil || state.WaitingForResponse {
		t.Fatalf("expected provider failure to clear waiting state, got %#v", state)
	}
	stateContent, ok := state.Messages[1]["content"].([]any)
	if len(state.Messages) != 2 || !ok || len(stateContent) != 1 {
		t.Fatalf("expected finalized live reasoning block, got %#v", state)
	}
	stateThinkingBlock, ok := stateContent[0].(map[string]any)
	if !ok || stateThinkingBlock["summary"] != "Plan summary" || stateThinkingBlock["thinking"] != "Planning deeply" {
		t.Fatalf("expected finalized live authoritative reasoning block, got %#v", state)
	}
	broadcastMessages := broadcaster.Messages()
	expectedSummary := "Plan summary"
	if findBroadcastThinkingDelta(broadcastMessages, 0, "", &expectedSummary) == nil {
		t.Fatalf("expected reasoning item done summary delta in %#v", broadcastMessages)
	}
	if findBroadcastThinkingDelta(broadcastMessages, 0, " deeply", nil) == nil {
		t.Fatalf("expected reasoning item done thinking delta in %#v", broadcastMessages)
	}
	if broadcaster.Count() != 7 {
		t.Fatalf("expected start, four thinking deltas, stop, finalized broadcasts, got %d", broadcaster.Count())
	}
}

func TestExecutorExecuteRecoversOpenAIResponsesIncompletePayloadContentBeforeFailure(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if handledManagedLLMModelLookupTestRequest(t, w, r) {
			return
		}
		if r.URL.Path != "/v1/responses" {
			t.Fatalf("unexpected path %q", r.URL.Path)
		}
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			t.Fatal("expected flusher")
		}
		fmt.Fprint(w, openAIResponseIncompleteEventWithOutput(
			"max_output_tokens",
			[]map[string]any{
				{
					"type":    "reasoning",
					"id":      "reasoning-1",
					"summary": []map[string]any{{"text": "Plan summary"}},
					"content": []map[string]any{{"type": "reasoning_text", "text": "Planning deeply"}},
					"status":  "incomplete",
				},
				{
					"type":    "message",
					"id":      "message-1",
					"role":    "assistant",
					"status":  "incomplete",
					"content": []map[string]any{{"type": "output_text", "text": "Recovered final answer", "annotations": []any{}}},
				},
			},
			2,
		))
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
			ID:        "primary",
			Model:     "gpt-5-codex",
			Provider:  "openai",
			BaseURL:   server.URL + "/v1",
			APIKeyEnv: "OPENAI_API_KEY",
		},
		APIKeys: map[string]string{
			"OPENAI_API_KEY": "secret",
		},
		SystemPrompt:    "System prompt",
		ProjectConfigID: "project-alpha",
		ChatID:          "chat-alpha",
		SectionID:       testStringPtr("section-chat"),
		Thinking:        true,
		Inputs: map[string]any{
			"runType": "llm_chat",
			"messages": []any{
				map[string]any{
					"id":   "user-1",
					"role": "user",
					"content": []any{
						map[string]any{"type": "text", "text": "Keep going"},
					},
					"attachments": []any{},
				},
			},
		},
	})
	if err == nil {
		t.Fatal("expected provider failure from incomplete response")
	}
	if err.Error() != "managed llm provider request failed: response incomplete (max_output_tokens)" {
		t.Fatalf("unexpected provider error %q", err.Error())
	}

	messages, ok := result.Outputs["messages"].([]any)
	if !ok || len(messages) != 2 {
		t.Fatalf("expected user and partial assistant messages, got %#v", result.Outputs["messages"])
	}
	assistant, ok := messages[1].(map[string]any)
	if !ok {
		t.Fatalf("expected assistant message map, got %#v", messages[1])
	}
	assistantContent, ok := assistant["content"].([]any)
	if !ok || len(assistantContent) != 2 {
		t.Fatalf("expected recovered thinking plus text blocks, got %#v", assistant)
	}
	thinkingBlock, ok := assistantContent[0].(map[string]any)
	if !ok || thinkingBlock["summary"] != "Plan summary" || thinkingBlock["thinking"] != "Planning deeply" {
		t.Fatalf("expected recovered authoritative reasoning block, got %#v", assistant)
	}
	textBlock, ok := assistantContent[1].(map[string]any)
	if !ok || textBlock["text"] != "Recovered final answer" {
		t.Fatalf("expected recovered authoritative text block, got %#v", assistant)
	}
	usage, ok := result.Outputs["usage"].(map[string]any)
	if !ok {
		t.Fatalf("expected usage payload on incomplete response, got %#v", result.Outputs["usage"])
	}
	if int(usage["reasoning_output_tokens"].(float64)) != 2 {
		t.Fatalf("unexpected incomplete response usage payload %#v", usage)
	}

	state, stateErr := live.GetLiveChatState(run.ID)
	if stateErr != nil {
		t.Fatalf("get live state after provider failure: %v", stateErr)
	}
	if state == nil || state.WaitingForResponse {
		t.Fatalf("expected provider failure to clear waiting state, got %#v", state)
	}
	stateContent, ok := state.Messages[1]["content"].([]any)
	if len(state.Messages) != 2 || !ok || len(stateContent) != 2 {
		t.Fatalf("expected finalized live recovered content, got %#v", state)
	}
	stateThinkingBlock, ok := stateContent[0].(map[string]any)
	if !ok || stateThinkingBlock["summary"] != "Plan summary" || stateThinkingBlock["thinking"] != "Planning deeply" {
		t.Fatalf("expected finalized live recovered reasoning block, got %#v", state)
	}
	stateTextBlock, ok := stateContent[1].(map[string]any)
	if !ok || stateTextBlock["text"] != "Recovered final answer" {
		t.Fatalf("expected finalized live recovered text block, got %#v", state)
	}

	broadcastMessages := broadcaster.Messages()
	expectedSummary := "Plan summary"
	if findBroadcastThinkingDelta(broadcastMessages, 0, "", &expectedSummary) == nil {
		t.Fatalf("expected incomplete payload summary delta in %#v", broadcastMessages)
	}
	if findBroadcastThinkingDelta(broadcastMessages, 0, "Planning deeply", nil) == nil {
		t.Fatalf("expected incomplete payload thinking delta in %#v", broadcastMessages)
	}
	if findBroadcastTextDelta(broadcastMessages, 1, "Recovered final answer") == nil {
		t.Fatalf("expected incomplete payload text delta in %#v", broadcastMessages)
	}
	if broadcaster.Count() != 6 {
		t.Fatalf("expected start, recovered deltas, stop, finalized broadcasts, got %d", broadcaster.Count())
	}
}

func TestExecutorExecuteRecoversOpenAIResponsesFailedPayloadContentBeforeFailure(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if handledManagedLLMModelLookupTestRequest(t, w, r) {
			return
		}
		if r.URL.Path != "/v1/responses" {
			t.Fatalf("unexpected path %q", r.URL.Path)
		}
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			t.Fatal("expected flusher")
		}
		fmt.Fprint(w, openAIResponseFailedEventWithOutput(
			"upstream execution failed",
			[]map[string]any{
				{
					"type":    "reasoning",
					"id":      "reasoning-1",
					"summary": []map[string]any{{"text": "Plan summary"}},
					"content": []map[string]any{{"type": "reasoning_text", "text": "Planning deeply"}},
					"status":  "failed",
				},
				{
					"type":    "message",
					"id":      "message-1",
					"role":    "assistant",
					"status":  "failed",
					"content": []map[string]any{{"type": "output_text", "text": "Recovered failed answer", "annotations": []any{}}},
				},
			},
			2,
		))
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
			ID:        "primary",
			Model:     "gpt-5-codex",
			Provider:  "openai",
			BaseURL:   server.URL + "/v1",
			APIKeyEnv: "OPENAI_API_KEY",
		},
		APIKeys: map[string]string{
			"OPENAI_API_KEY": "secret",
		},
		SystemPrompt:    "System prompt",
		ProjectConfigID: "project-alpha",
		ChatID:          "chat-alpha",
		SectionID:       testStringPtr("section-chat"),
		Thinking:        true,
		Inputs: map[string]any{
			"runType": "llm_chat",
			"messages": []any{
				map[string]any{
					"id":   "user-1",
					"role": "user",
					"content": []any{
						map[string]any{"type": "text", "text": "Keep going"},
					},
					"attachments": []any{},
				},
			},
		},
	})
	if err == nil {
		t.Fatal("expected provider failure from failed response")
	}
	if err.Error() != "managed llm provider request failed: upstream execution failed" {
		t.Fatalf("unexpected provider error %q", err.Error())
	}

	messages, ok := result.Outputs["messages"].([]any)
	if !ok || len(messages) != 2 {
		t.Fatalf("expected user and partial assistant messages, got %#v", result.Outputs["messages"])
	}
	assistant, ok := messages[1].(map[string]any)
	if !ok {
		t.Fatalf("expected assistant message map, got %#v", messages[1])
	}
	assistantContent, ok := assistant["content"].([]any)
	if !ok || len(assistantContent) != 2 {
		t.Fatalf("expected recovered thinking plus text blocks, got %#v", assistant)
	}
	thinkingBlock, ok := assistantContent[0].(map[string]any)
	if !ok || thinkingBlock["summary"] != "Plan summary" || thinkingBlock["thinking"] != "Planning deeply" {
		t.Fatalf("expected recovered authoritative reasoning block, got %#v", assistant)
	}
	textBlock, ok := assistantContent[1].(map[string]any)
	if !ok || textBlock["text"] != "Recovered failed answer" {
		t.Fatalf("expected recovered authoritative text block, got %#v", assistant)
	}
	usage, ok := result.Outputs["usage"].(map[string]any)
	if !ok {
		t.Fatalf("expected usage payload on failed response, got %#v", result.Outputs["usage"])
	}
	if int(usage["reasoning_output_tokens"].(float64)) != 2 {
		t.Fatalf("unexpected failed response usage payload %#v", usage)
	}

	state, stateErr := live.GetLiveChatState(run.ID)
	if stateErr != nil {
		t.Fatalf("get live state after provider failure: %v", stateErr)
	}
	if state == nil || state.WaitingForResponse {
		t.Fatalf("expected provider failure to clear waiting state, got %#v", state)
	}
	stateContent, ok := state.Messages[1]["content"].([]any)
	if len(state.Messages) != 2 || !ok || len(stateContent) != 2 {
		t.Fatalf("expected finalized live recovered content, got %#v", state)
	}
	stateThinkingBlock, ok := stateContent[0].(map[string]any)
	if !ok || stateThinkingBlock["summary"] != "Plan summary" || stateThinkingBlock["thinking"] != "Planning deeply" {
		t.Fatalf("expected finalized live recovered reasoning block, got %#v", state)
	}
	stateTextBlock, ok := stateContent[1].(map[string]any)
	if !ok || stateTextBlock["text"] != "Recovered failed answer" {
		t.Fatalf("expected finalized live recovered text block, got %#v", state)
	}

	broadcastMessages := broadcaster.Messages()
	expectedSummary := "Plan summary"
	if findBroadcastThinkingDelta(broadcastMessages, 0, "", &expectedSummary) == nil {
		t.Fatalf("expected failed payload summary delta in %#v", broadcastMessages)
	}
	if findBroadcastThinkingDelta(broadcastMessages, 0, "Planning deeply", nil) == nil {
		t.Fatalf("expected failed payload thinking delta in %#v", broadcastMessages)
	}
	if findBroadcastTextDelta(broadcastMessages, 1, "Recovered failed answer") == nil {
		t.Fatalf("expected failed payload text delta in %#v", broadcastMessages)
	}
	if broadcaster.Count() != 6 {
		t.Fatalf("expected start, recovered deltas, stop, finalized broadcasts, got %d", broadcaster.Count())
	}
}

func TestExecutorExecuteRunsOpenAIResponsesToolCallsThroughMCPAndContinuesProviderTurns(t *testing.T) {
	t.Parallel()

	requestBodies := make([]map[string]any, 0, 2)
	requestCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if handledManagedLLMModelLookupTestRequest(t, w, r) {
			return
		}
		if r.URL.Path != "/v1/responses" {
			t.Fatalf("unexpected path %q", r.URL.Path)
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
			fmt.Fprint(w, openAIResponseReasoningItemAddedWithContentEvent(0, "reasoning-1", "Plan summary", "Planning deeply"))
			flusher.Flush()
			fmt.Fprint(w, openAIResponseFunctionCallItemAddedEvent(1, "function-item-1", "tool-call-1", "setta__create_top_level_section"))
			flusher.Flush()
			fmt.Fprint(w, openAIResponseFunctionCallArgumentsDeltaEvent("function-item-1", 1, `{"projectConfigId":"project-alpha","implType":"Dict"}`))
			flusher.Flush()
			fmt.Fprint(w, openAIResponseCompletedEvent(
				[]map[string]any{
					{
						"type":              "reasoning",
						"id":                "reasoning-1",
						"summary":           []map[string]any{{"text": "Plan summary"}},
						"content":           []map[string]any{{"type": "reasoning_text", "text": "Planning deeply"}},
						"encrypted_content": "enc-tool-turn",
						"status":            "completed",
					},
					{
						"type":      "function_call",
						"id":        "function-item-1",
						"call_id":   "tool-call-1",
						"name":      "setta__create_top_level_section",
						"arguments": `{"projectConfigId":"project-alpha","implType":"Dict"}`,
						"status":    "completed",
					},
				},
				12,
				2,
				14,
				1,
			))
			flusher.Flush()
		case 1:
			fmt.Fprint(w, openAIResponseOutputTextDeltaEvent("message-2", 0, 0, "Tool loop complete"))
			flusher.Flush()
			fmt.Fprint(w, openAIResponseCompletedEvent(
				[]map[string]any{
					{
						"type":    "message",
						"id":      "message-2",
						"role":    "assistant",
						"status":  "completed",
						"content": []map[string]any{{"type": "output_text", "text": "Tool loop complete", "annotations": []any{}}},
					},
				},
				15,
				3,
				18,
				1,
			))
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
				StructuredContent: map[string]any{"sectionId": "section-created"},
				Text:              "{\"sectionId\":\"section-created\"}",
			}, nil
		},
	}

	executor := NewExecutor(ExecutorOptions{
		Live:       live,
		Tools:      toolClient,
		HTTPClient: server.Client(),
	})
	result, err := executor.Execute(context.Background(), agentruns.ExecutionRequest{
		Run: run,
		LLMConfig: llmconfig.Config{
			ID:        "primary",
			Model:     "gpt-5-codex",
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
		Thinking:        true,
		Inputs: map[string]any{
			"runType": "llm_chat",
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
		t.Fatalf("execute managed OpenAI Responses tool stream: %v", err)
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
		t.Fatalf("expected two OpenAI responses requests, got %d", len(requestBodies))
	}
	firstTools, ok := requestBodies[0]["tools"].([]any)
	if !ok || len(firstTools) != 2 {
		t.Fatalf("expected OpenAI function tools including completion reporting, got %#v", requestBodies[0]["tools"])
	}
	if !toolPayloadIncludesName(firstTools, "setta__create_top_level_section") {
		t.Fatalf("expected OpenAI Responses tool payload to include create_top_level_section, got %#v", firstTools)
	}
	if !toolPayloadIncludesName(firstTools, "setta__report_completion_status") {
		t.Fatalf("expected OpenAI Responses tool payload to include report_completion_status, got %#v", firstTools)
	}
	secondInput, ok := requestBodies[1]["input"].([]any)
	if !ok || len(secondInput) < 3 {
		t.Fatalf("expected follow-up Responses transcript input, got %#v", requestBodies[1]["input"])
	}
	foundReasoning := false
	foundFunctionCall := false
	foundFunctionResult := false
	for _, rawItem := range secondInput {
		item, ok := rawItem.(map[string]any)
		if !ok {
			continue
		}
		if item["type"] == "reasoning" && item["encrypted_content"] == "enc-tool-turn" && item["id"] == "reasoning-1" {
			foundReasoning = true
		}
		if item["type"] == "function_call" && item["call_id"] == "tool-call-1" && item["id"] == "function-item-1" {
			foundFunctionCall = true
		}
		if item["type"] == "function_call_output" && item["call_id"] == "tool-call-1" {
			foundFunctionResult = true
		}
	}
	if !foundReasoning || !foundFunctionCall || !foundFunctionResult {
		t.Fatalf("expected follow-up Responses input with reasoning, function call, and result, got %#v", secondInput)
	}

	messages, ok := result.Outputs["messages"].([]any)
	if !ok || len(messages) != 4 {
		t.Fatalf("expected user, tool-call assistant, tool, final assistant messages, got %#v", result.Outputs["messages"])
	}
	if len(result.ToolCalls) != 1 {
		t.Fatalf("expected one persisted tool call, got %#v", result.ToolCalls)
	}
	assistantWithToolCall, ok := messages[1].(map[string]any)
	if !ok {
		t.Fatalf("expected assistant tool-call message map, got %#v", messages[1])
	}
	persistedToolCalls := assistantToolCalls(assistantWithToolCall)
	if len(persistedToolCalls) != 1 || persistedToolCalls[0]["provider_item_id"] != "function-item-1" {
		t.Fatalf("expected persisted provider tool-call item id, got %#v", assistantWithToolCall["tool_calls"])
	}
	if assistantText(messages[3].(map[string]any)) != "Tool loop complete" {
		t.Fatalf("unexpected final assistant text %#v", messages[3])
	}
}

func TestExecutorExecuteRecoversOpenAIResponsesToolCallsFromCompletedFallback(t *testing.T) {
	t.Parallel()

	requestBodies := make([]map[string]any, 0, 2)
	requestCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if handledManagedLLMModelLookupTestRequest(t, w, r) {
			return
		}
		if r.URL.Path != "/v1/responses" {
			t.Fatalf("unexpected path %q", r.URL.Path)
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
			// Some Responses turns may only surface the final function_call item in response.completed.
			fmt.Fprint(w, openAIResponseCompletedEvent(
				[]map[string]any{
					{
						"type":      "function_call",
						"id":        "function-item-1",
						"call_id":   "tool-call-1",
						"name":      "setta__create_top_level_section",
						"arguments": `{"projectConfigId":"project-alpha","implType":"Dict"}`,
						"status":    "completed",
					},
				},
				12,
				2,
				14,
				1,
			))
			flusher.Flush()
		case 1:
			fmt.Fprint(w, openAIResponseOutputTextDeltaEvent("message-2", 0, 0, "Recovered tool call"))
			flusher.Flush()
			fmt.Fprint(w, openAIResponseCompletedEvent(
				[]map[string]any{
					{
						"type":    "message",
						"id":      "message-2",
						"role":    "assistant",
						"status":  "completed",
						"content": []map[string]any{{"type": "output_text", "text": "Recovered tool call", "annotations": []any{}}},
					},
				},
				15,
				3,
				18,
				1,
			))
			flusher.Flush()
		default:
			t.Fatalf("unexpected provider request count %d", requestCount)
		}
		requestCount++
	}))
	defer server.Close()

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
			},
		},
		call: func(_ context.Context, namespacedToolName string, arguments map[string]any, _ map[string]any) (mcpx.ToolCallResult, error) {
			if namespacedToolName != "setta__create_top_level_section" {
				t.Fatalf("unexpected tool name %q", namespacedToolName)
			}
			if arguments["projectConfigId"] != "project-alpha" || arguments["implType"] != "Dict" {
				t.Fatalf("unexpected tool arguments %#v", arguments)
			}
			return mcpx.ToolCallResult{
				StructuredContent: map[string]any{"sectionId": "section-created"},
				Text:              "{\"sectionId\":\"section-created\"}",
			}, nil
		},
	}

	executor := NewExecutor(ExecutorOptions{
		Tools:      toolClient,
		HTTPClient: server.Client(),
	})
	result, err := executor.Execute(context.Background(), agentruns.ExecutionRequest{
		Run: agentruns.Run{ID: "run-alpha"},
		LLMConfig: llmconfig.Config{
			ID:        "primary",
			Model:     "gpt-5-codex",
			Provider:  "openai",
			BaseURL:   server.URL + "/v1",
			APIKeyEnv: "OPENAI_API_KEY",
		},
		MCPServerIDs: []string{mcpx.DefaultServerID},
		APIKeys: map[string]string{
			"OPENAI_API_KEY": "secret",
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
						map[string]any{"type": "text", "text": "Use the tool"},
					},
					"attachments": []any{},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("execute managed OpenAI Responses completed-fallback tool stream: %v", err)
	}

	if len(requestBodies) != 2 {
		t.Fatalf("expected two OpenAI responses requests, got %d", len(requestBodies))
	}
	secondInput, ok := requestBodies[1]["input"].([]any)
	if !ok || len(secondInput) < 3 {
		t.Fatalf("expected follow-up Responses transcript input, got %#v", requestBodies[1]["input"])
	}
	foundFunctionCall := false
	foundFunctionResult := false
	for _, rawItem := range secondInput {
		item, ok := rawItem.(map[string]any)
		if !ok {
			continue
		}
		if item["type"] == "function_call" && item["call_id"] == "tool-call-1" && item["id"] == "function-item-1" {
			foundFunctionCall = true
		}
		if item["type"] == "function_call_output" && item["call_id"] == "tool-call-1" {
			foundFunctionResult = true
		}
	}
	if !foundFunctionCall || !foundFunctionResult {
		t.Fatalf("expected recovered function call and result in follow-up input, got %#v", secondInput)
	}

	messages, ok := result.Outputs["messages"].([]any)
	if !ok || len(messages) != 4 {
		t.Fatalf("expected user, tool-call assistant, tool, final assistant messages, got %#v", result.Outputs["messages"])
	}
	if len(result.ToolCalls) != 1 {
		t.Fatalf("expected one persisted tool call, got %#v", result.ToolCalls)
	}
	assistantWithToolCall, ok := messages[1].(map[string]any)
	if !ok {
		t.Fatalf("expected assistant tool-call message map, got %#v", messages[1])
	}
	persistedToolCalls := assistantToolCalls(assistantWithToolCall)
	if len(persistedToolCalls) != 1 || persistedToolCalls[0]["provider_item_id"] != "function-item-1" {
		t.Fatalf("expected recovered provider tool-call item id, got %#v", assistantWithToolCall["tool_calls"])
	}
	if assistantText(messages[3].(map[string]any)) != "Recovered tool call" {
		t.Fatalf("unexpected final assistant text %#v", messages[3])
	}
}

func TestExecutorExecuteEmitsOpenAIResponsesToolPreviewFromCompletedFallback(t *testing.T) {
	t.Parallel()

	requestCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if handledManagedLLMModelLookupTestRequest(t, w, r) {
			return
		}
		if r.URL.Path != "/v1/responses" {
			t.Fatalf("unexpected path %q", r.URL.Path)
		}
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			t.Fatal("expected flusher")
		}
		switch requestCount {
		case 0:
			fmt.Fprint(w, openAIResponseCompletedEvent(
				[]map[string]any{
					{
						"type":      "function_call",
						"id":        "function-item-1",
						"call_id":   "tool-call-1",
						"name":      "setta__stream_app_definition",
						"arguments": `{"projectConfigId":"project-alpha","patches":"{\"op\":\"set\",\"path\":\"/root\",\"value\":\"stream-root\"}\n"}`,
						"status":    "completed",
					},
				},
				12,
				2,
				14,
				0,
			))
			flusher.Flush()
		case 1:
			fmt.Fprint(w, openAIResponseOutputTextDeltaEvent("message-2", 0, 0, "Preview applied"))
			flusher.Flush()
			fmt.Fprint(w, openAIResponseCompletedEvent([]map[string]any{}, 8, 1, 9, 0))
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

	toolClient := &stubToolClient{
		discoverableTools: map[string]mcpx.ToolDescriptor{
			"setta__stream_app_definition": {
				ServerID:       mcpx.DefaultServerID,
				NamespacedName: "setta__stream_app_definition",
				RemoteName:     "stream_app_definition",
				Description:    "Stream app definition patches.",
				InputSchema: map[string]any{
					"type": "object",
				},
				Metadata: &tools.Metadata{
					Kind:       tools.KindDiscoverable,
					AccessType: tools.AccessTypeStructural,
					ToolArgumentPreview: &tools.ToolArgumentPreviewMetadata{
						TargetIDPathsByType: map[tools.IDType][]string{},
						PreviewValuePath:    "patches",
						PreviewKind:         tools.PreviewKindAppSpecPatch,
					},
				},
			},
		},
		call: func(context.Context, string, map[string]any, map[string]any) (mcpx.ToolCallResult, error) {
			return mcpx.ToolCallResult{
				StructuredContent: map[string]any{"status": "ok"},
				Text:              "{\"status\":\"ok\"}",
			}, nil
		},
	}

	executor := NewExecutor(ExecutorOptions{
		Live:       live,
		Tools:      toolClient,
		HTTPClient: server.Client(),
	})
	result, err := executor.Execute(context.Background(), agentruns.ExecutionRequest{
		Run: run,
		LLMConfig: llmconfig.Config{
			ID:        "primary",
			Model:     "gpt-5-codex",
			Provider:  "openai",
			BaseURL:   server.URL + "/v1",
			APIKeyEnv: "OPENAI_API_KEY",
		},
		MCPServerIDs: []string{mcpx.DefaultServerID},
		APIKeys: map[string]string{
			"OPENAI_API_KEY": "secret",
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
						map[string]any{"type": "text", "text": "Stream the app definition"},
					},
					"attachments": []any{},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("execute managed OpenAI Responses completed-fallback tool preview stream: %v", err)
	}

	var toolDeltaEvent *realtime.ToolCallDeltaEvent
	var previewEvent *realtime.ToolArgumentPreviewDeltaEvent
	for _, message := range broadcaster.Messages() {
		switch chunk := message.Content.Chunk.(type) {
		case realtime.ToolCallDeltaEvent:
			if chunk.ToolCallID == "tool-call-1" {
				copied := chunk
				toolDeltaEvent = &copied
			}
		case realtime.ToolArgumentPreviewDeltaEvent:
			if chunk.ToolCallID == "tool-call-1" {
				copied := chunk
				previewEvent = &copied
			}
		}
	}
	if toolDeltaEvent == nil {
		t.Fatalf("expected tool call delta event in %#v", broadcaster.Messages())
	}
	if toolDeltaEvent.ArgumentsDelta != `{"projectConfigId":"project-alpha","patches":"{\"op\":\"set\",\"path\":\"/root\",\"value\":\"stream-root\"}\n"}` {
		t.Fatalf("unexpected tool delta event %#v", toolDeltaEvent)
	}
	if toolDeltaEvent.ToolName == nil || *toolDeltaEvent.ToolName != "setta__stream_app_definition" {
		t.Fatalf("unexpected tool delta tool name %#v", toolDeltaEvent)
	}
	if previewEvent == nil {
		t.Fatalf("expected tool preview event in %#v", broadcaster.Messages())
	}
	if previewEvent.PreviewKind != tools.PreviewKindAppSpecPatch {
		t.Fatalf("unexpected preview kind %#v", previewEvent)
	}
	if previewEvent.PreviewValueDelta != "{\"op\":\"set\",\"path\":\"/root\",\"value\":\"stream-root\"}\n" {
		t.Fatalf("unexpected preview delta %#v", previewEvent)
	}
	if previewEvent.ArgumentsDelta != `{"projectConfigId":"project-alpha","patches":"{\"op\":\"set\",\"path\":\"/root\",\"value\":\"stream-root\"}\n"}` {
		t.Fatalf("unexpected preview arguments delta %#v", previewEvent)
	}
	if len(result.ToolCalls) != 1 {
		t.Fatalf("expected one persisted tool call, got %#v", result.ToolCalls)
	}
	messages, ok := result.Outputs["messages"].([]any)
	if !ok || len(messages) != 4 {
		t.Fatalf("expected user, tool-call assistant, tool, final assistant messages, got %#v", result.Outputs["messages"])
	}
	if assistantText(messages[3].(map[string]any)) != "Preview applied" {
		t.Fatalf("unexpected final assistant text %#v", messages[3])
	}
}

func TestExecutorExecuteEmitsOpenAIResponsesToolPreviewFromArgumentsDoneEvent(t *testing.T) {
	t.Parallel()

	requestCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if handledManagedLLMModelLookupTestRequest(t, w, r) {
			return
		}
		if r.URL.Path != "/v1/responses" {
			t.Fatalf("unexpected path %q", r.URL.Path)
		}
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			t.Fatal("expected flusher")
		}
		switch requestCount {
		case 0:
			fmt.Fprint(w, openAIResponseFunctionCallItemAddedEvent(0, "function-item-1", "tool-call-1", "setta__stream_app_definition"))
			flusher.Flush()
			fmt.Fprint(w, openAIResponseFunctionCallArgumentsDoneEvent(
				"function-item-1",
				0,
				"setta__stream_app_definition",
				`{"projectConfigId":"project-alpha","patches":"{\"op\":\"set\",\"path\":\"/root\",\"value\":\"stream-root\"}\n"}`,
			))
			flusher.Flush()
			fmt.Fprint(w, openAIResponseCompletedEvent(
				[]map[string]any{
					{
						"type":      "function_call",
						"id":        "function-item-1",
						"call_id":   "tool-call-1",
						"name":      "setta__stream_app_definition",
						"arguments": `{"projectConfigId":"project-alpha","patches":"{\"op\":\"set\",\"path\":\"/root\",\"value\":\"stream-root\"}\n"}`,
						"status":    "completed",
					},
				},
				12,
				2,
				14,
				1,
			))
			flusher.Flush()
		case 1:
			fmt.Fprint(w, openAIResponseOutputTextDeltaEvent("message-2", 0, 0, "Preview applied"))
			flusher.Flush()
			fmt.Fprint(w, openAIResponseCompletedEvent(
				[]map[string]any{
					{
						"type":    "message",
						"id":      "message-2",
						"role":    "assistant",
						"status":  "completed",
						"content": []map[string]any{{"type": "output_text", "text": "Preview applied", "annotations": []any{}}},
					},
				},
				15,
				3,
				18,
				1,
			))
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

	toolClient := &stubToolClient{
		discoverableTools: map[string]mcpx.ToolDescriptor{
			"setta__stream_app_definition": {
				ServerID:       mcpx.DefaultServerID,
				NamespacedName: "setta__stream_app_definition",
				RemoteName:     "stream_app_definition",
				Description:    "Stream app definition patches.",
				InputSchema: map[string]any{
					"type": "object",
				},
				Metadata: &tools.Metadata{
					Kind:       tools.KindDiscoverable,
					AccessType: tools.AccessTypeStructural,
					ToolArgumentPreview: &tools.ToolArgumentPreviewMetadata{
						TargetIDPathsByType: map[tools.IDType][]string{},
						PreviewValuePath:    "patches",
						PreviewKind:         tools.PreviewKindAppSpecPatch,
					},
				},
			},
		},
		call: func(context.Context, string, map[string]any, map[string]any) (mcpx.ToolCallResult, error) {
			return mcpx.ToolCallResult{
				StructuredContent: map[string]any{"status": "ok"},
				Text:              "{\"status\":\"ok\"}",
			}, nil
		},
	}

	executor := NewExecutor(ExecutorOptions{
		Live:       live,
		Tools:      toolClient,
		HTTPClient: server.Client(),
	})
	result, err := executor.Execute(context.Background(), agentruns.ExecutionRequest{
		Run: run,
		LLMConfig: llmconfig.Config{
			ID:        "primary",
			Model:     "gpt-5-codex",
			Provider:  "openai",
			BaseURL:   server.URL + "/v1",
			APIKeyEnv: "OPENAI_API_KEY",
		},
		MCPServerIDs: []string{mcpx.DefaultServerID},
		APIKeys: map[string]string{
			"OPENAI_API_KEY": "secret",
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
						map[string]any{"type": "text", "text": "Stream the app definition"},
					},
					"attachments": []any{},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("execute managed OpenAI Responses tool preview stream: %v", err)
	}

	var toolDeltaEvent *realtime.ToolCallDeltaEvent
	var previewEvent *realtime.ToolArgumentPreviewDeltaEvent
	for _, message := range broadcaster.Messages() {
		switch chunk := message.Content.Chunk.(type) {
		case realtime.ToolCallDeltaEvent:
			if chunk.ToolCallID == "tool-call-1" {
				copied := chunk
				toolDeltaEvent = &copied
			}
		case realtime.ToolArgumentPreviewDeltaEvent:
			if chunk.ToolCallID == "tool-call-1" {
				copied := chunk
				previewEvent = &copied
			}
		}
	}
	if toolDeltaEvent == nil {
		t.Fatalf("expected tool call delta event in %#v", broadcaster.Messages())
	}
	if toolDeltaEvent.ArgumentsDelta != `{"projectConfigId":"project-alpha","patches":"{\"op\":\"set\",\"path\":\"/root\",\"value\":\"stream-root\"}\n"}` {
		t.Fatalf("unexpected tool delta event %#v", toolDeltaEvent)
	}
	if toolDeltaEvent.ToolName == nil || *toolDeltaEvent.ToolName != "setta__stream_app_definition" {
		t.Fatalf("unexpected tool delta tool name %#v", toolDeltaEvent)
	}
	if previewEvent == nil {
		t.Fatalf("expected tool preview event in %#v", broadcaster.Messages())
	}
	if previewEvent.PreviewKind != tools.PreviewKindAppSpecPatch {
		t.Fatalf("unexpected preview kind %#v", previewEvent)
	}
	if previewEvent.PreviewValueDelta != "{\"op\":\"set\",\"path\":\"/root\",\"value\":\"stream-root\"}\n" {
		t.Fatalf("unexpected preview delta %#v", previewEvent)
	}
	if previewEvent.ArgumentsDelta != `{"projectConfigId":"project-alpha","patches":"{\"op\":\"set\",\"path\":\"/root\",\"value\":\"stream-root\"}\n"}` {
		t.Fatalf("unexpected preview arguments delta %#v", previewEvent)
	}
	if len(result.ToolCalls) != 1 {
		t.Fatalf("expected one persisted tool call, got %#v", result.ToolCalls)
	}
	messages, ok := result.Outputs["messages"].([]any)
	if !ok || len(messages) != 4 {
		t.Fatalf("expected user, tool-call assistant, tool, final assistant messages, got %#v", result.Outputs["messages"])
	}
	if assistantText(messages[3].(map[string]any)) != "Preview applied" {
		t.Fatalf("unexpected final assistant text %#v", messages[3])
	}
}

func TestExecutorExecuteEmitsOpenAIResponsesToolPreviewFromFunctionCallItemDoneEvent(t *testing.T) {
	t.Parallel()

	requestCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if handledManagedLLMModelLookupTestRequest(t, w, r) {
			return
		}
		if r.URL.Path != "/v1/responses" {
			t.Fatalf("unexpected path %q", r.URL.Path)
		}
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			t.Fatal("expected flusher")
		}
		switch requestCount {
		case 0:
			fmt.Fprint(w, openAIResponseFunctionCallItemDoneEvent(
				0,
				"function-item-1",
				"tool-call-1",
				"setta__stream_app_definition",
				`{"projectConfigId":"project-alpha","patches":"{\"op\":\"set\",\"path\":\"/root\",\"value\":\"stream-root\"}\n"}`,
			))
			flusher.Flush()
			fmt.Fprint(w, openAIResponseCompletedEvent(
				[]map[string]any{
					{
						"type":      "function_call",
						"id":        "function-item-1",
						"call_id":   "tool-call-1",
						"name":      "setta__stream_app_definition",
						"arguments": `{"projectConfigId":"project-alpha","patches":"{\"op\":\"set\",\"path\":\"/root\",\"value\":\"stream-root\"}\n"}`,
						"status":    "completed",
					},
				},
				12,
				2,
				14,
				0,
			))
			flusher.Flush()
		case 1:
			fmt.Fprint(w, openAIResponseOutputTextDeltaEvent("message-2", 0, 0, "Preview applied"))
			flusher.Flush()
			fmt.Fprint(w, openAIResponseCompletedEvent([]map[string]any{}, 8, 1, 9, 0))
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

	toolClient := &stubToolClient{
		discoverableTools: map[string]mcpx.ToolDescriptor{
			"setta__stream_app_definition": {
				ServerID:       mcpx.DefaultServerID,
				NamespacedName: "setta__stream_app_definition",
				RemoteName:     "stream_app_definition",
				Description:    "Stream app definition patches.",
				InputSchema: map[string]any{
					"type": "object",
				},
				Metadata: &tools.Metadata{
					Kind:       tools.KindDiscoverable,
					AccessType: tools.AccessTypeStructural,
					ToolArgumentPreview: &tools.ToolArgumentPreviewMetadata{
						TargetIDPathsByType: map[tools.IDType][]string{},
						PreviewValuePath:    "patches",
						PreviewKind:         tools.PreviewKindAppSpecPatch,
					},
				},
			},
		},
		call: func(context.Context, string, map[string]any, map[string]any) (mcpx.ToolCallResult, error) {
			return mcpx.ToolCallResult{
				StructuredContent: map[string]any{"status": "ok"},
				Text:              "{\"status\":\"ok\"}",
			}, nil
		},
	}

	executor := NewExecutor(ExecutorOptions{
		Live:       live,
		Tools:      toolClient,
		HTTPClient: server.Client(),
	})
	result, err := executor.Execute(context.Background(), agentruns.ExecutionRequest{
		Run: run,
		LLMConfig: llmconfig.Config{
			ID:        "primary",
			Model:     "gpt-5-codex",
			Provider:  "openai",
			BaseURL:   server.URL + "/v1",
			APIKeyEnv: "OPENAI_API_KEY",
		},
		MCPServerIDs: []string{mcpx.DefaultServerID},
		APIKeys: map[string]string{
			"OPENAI_API_KEY": "secret",
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
						map[string]any{"type": "text", "text": "Stream the app definition"},
					},
					"attachments": []any{},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("execute managed OpenAI Responses output_item.done tool preview stream: %v", err)
	}

	var toolDeltaEvent *realtime.ToolCallDeltaEvent
	var previewEvent *realtime.ToolArgumentPreviewDeltaEvent
	for _, message := range broadcaster.Messages() {
		switch chunk := message.Content.Chunk.(type) {
		case realtime.ToolCallDeltaEvent:
			if chunk.ToolCallID == "tool-call-1" {
				copied := chunk
				toolDeltaEvent = &copied
			}
		case realtime.ToolArgumentPreviewDeltaEvent:
			if chunk.ToolCallID == "tool-call-1" {
				copied := chunk
				previewEvent = &copied
			}
		}
	}
	if toolDeltaEvent == nil {
		t.Fatalf("expected tool call delta event in %#v", broadcaster.Messages())
	}
	if toolDeltaEvent.ArgumentsDelta != `{"projectConfigId":"project-alpha","patches":"{\"op\":\"set\",\"path\":\"/root\",\"value\":\"stream-root\"}\n"}` {
		t.Fatalf("unexpected tool delta event %#v", toolDeltaEvent)
	}
	if toolDeltaEvent.ToolName == nil || *toolDeltaEvent.ToolName != "setta__stream_app_definition" {
		t.Fatalf("unexpected tool delta tool name %#v", toolDeltaEvent)
	}
	if previewEvent == nil {
		t.Fatalf("expected tool preview event in %#v", broadcaster.Messages())
	}
	if previewEvent.PreviewKind != tools.PreviewKindAppSpecPatch {
		t.Fatalf("unexpected preview kind %#v", previewEvent)
	}
	if previewEvent.PreviewValueDelta != "{\"op\":\"set\",\"path\":\"/root\",\"value\":\"stream-root\"}\n" {
		t.Fatalf("unexpected preview delta %#v", previewEvent)
	}
	if previewEvent.ArgumentsDelta != `{"projectConfigId":"project-alpha","patches":"{\"op\":\"set\",\"path\":\"/root\",\"value\":\"stream-root\"}\n"}` {
		t.Fatalf("unexpected preview arguments delta %#v", previewEvent)
	}
	if len(result.ToolCalls) != 1 {
		t.Fatalf("expected one persisted tool call, got %#v", result.ToolCalls)
	}
	messages, ok := result.Outputs["messages"].([]any)
	if !ok || len(messages) != 4 {
		t.Fatalf("expected user, tool-call assistant, tool, final assistant messages, got %#v", result.Outputs["messages"])
	}
	if assistantText(messages[3].(map[string]any)) != "Preview applied" {
		t.Fatalf("unexpected final assistant text %#v", messages[3])
	}
}

func TestExecutorExecutePreservesCompletedOpenAIResponsesToolCallBeforeIncompleteFailure(t *testing.T) {
	t.Parallel()

	requestBodies := make([]map[string]any, 0, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if handledManagedLLMModelLookupTestRequest(t, w, r) {
			return
		}
		if r.URL.Path != "/v1/responses" {
			t.Fatalf("unexpected path %q", r.URL.Path)
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
		fmt.Fprint(w, openAIResponseFunctionCallItemDoneEvent(0, "function-item-1", "tool-call-1", "setta__create_top_level_section", `{"projectConfigId":"project-alpha","implType":"Dict"}`))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseIncompleteEvent("max_output_tokens"))
		flusher.Flush()
	}))
	defer server.Close()

	broadcaster := &captureBroadcaster{}
	live := managedchat.NewLiveRuntime(managedchat.LiveRuntimeOptions{Broadcaster: broadcaster})
	run := newManagedChatTestRun()
	live.ActivateRun(run)

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
			},
		},
		call: func(context.Context, string, map[string]any, map[string]any) (mcpx.ToolCallResult, error) {
			t.Fatal("tool execution should not run after provider failure")
			return mcpx.ToolCallResult{}, nil
		},
	}

	executor := NewExecutor(ExecutorOptions{
		Live:       live,
		Tools:      toolClient,
		HTTPClient: server.Client(),
	})
	result, err := executor.Execute(context.Background(), agentruns.ExecutionRequest{
		Run: run,
		LLMConfig: llmconfig.Config{
			ID:        "primary",
			Model:     "gpt-5-codex",
			Provider:  "openai",
			BaseURL:   server.URL + "/v1",
			APIKeyEnv: "OPENAI_API_KEY",
		},
		MCPServerIDs: []string{mcpx.DefaultServerID},
		APIKeys: map[string]string{
			"OPENAI_API_KEY": "secret",
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
						map[string]any{"type": "text", "text": "Use the tool"},
					},
					"attachments": []any{},
				},
			},
		},
	})
	if err == nil {
		t.Fatal("expected provider failure from incomplete response")
	}
	if err.Error() != "managed llm provider request failed: response incomplete (max_output_tokens)" {
		t.Fatalf("unexpected provider error %q", err.Error())
	}

	if len(requestBodies) != 1 {
		t.Fatalf("expected only the failing Responses request, got %d", len(requestBodies))
	}
	messages, ok := result.Outputs["messages"].([]any)
	if !ok || len(messages) != 2 {
		t.Fatalf("expected user and assistant messages, got %#v", result.Outputs["messages"])
	}
	assistant, ok := messages[1].(map[string]any)
	if !ok {
		t.Fatalf("expected assistant message map, got %#v", messages[1])
	}
	preservedToolCalls := assistantToolCalls(assistant)
	if len(preservedToolCalls) != 1 {
		t.Fatalf("expected one preserved assistant tool call, got %#v", assistant["tool_calls"])
	}
	if preservedToolCalls[0]["id"] != "tool-call-1" {
		t.Fatalf("unexpected preserved tool call %#v", preservedToolCalls[0])
	}
	if preservedToolCalls[0]["provider_item_id"] != "function-item-1" {
		t.Fatalf("expected preserved provider tool-call item id, got %#v", preservedToolCalls[0])
	}
	if len(result.ToolCalls) != 1 {
		t.Fatalf("expected one preserved result tool call, got %#v", result.ToolCalls)
	}
	if result.ToolCalls[0]["id"] != "tool-call-1" {
		t.Fatalf("unexpected preserved result tool call %#v", result.ToolCalls[0])
	}
	if result.ToolCalls[0]["provider_item_id"] != "function-item-1" {
		t.Fatalf("expected preserved result provider tool-call item id, got %#v", result.ToolCalls[0])
	}

	state, stateErr := live.GetLiveChatState(run.ID)
	if stateErr != nil {
		t.Fatalf("get live state after provider failure: %v", stateErr)
	}
	if state == nil || state.WaitingForResponse {
		t.Fatalf("expected provider failure to clear waiting state, got %#v", state)
	}
	if len(state.Messages) != 2 {
		t.Fatalf("expected finalized live assistant message, got %#v", state)
	}
	stateAssistantToolCalls := assistantToolCalls(state.Messages[1])
	if len(stateAssistantToolCalls) != 1 || stateAssistantToolCalls[0]["id"] != "tool-call-1" {
		t.Fatalf("expected finalized live preserved tool call, got %#v", state.Messages[1])
	}
	foundToolDelta := false
	for _, message := range broadcaster.Messages() {
		chunk, ok := message.Content.Chunk.(realtime.ToolCallDeltaEvent)
		if !ok {
			continue
		}
		if chunk.ToolCallID == "tool-call-1" && chunk.ArgumentsDelta == `{"projectConfigId":"project-alpha","implType":"Dict"}` {
			foundToolDelta = true
		}
	}
	if !foundToolDelta {
		t.Fatalf("expected live tool delta event in %#v", broadcaster.Messages())
	}
	if broadcaster.Count() != 4 {
		t.Fatalf("expected start, tool delta, stop, finalized broadcasts, got %d", broadcaster.Count())
	}
}
