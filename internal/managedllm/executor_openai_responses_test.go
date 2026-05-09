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
)

func TestExecutorExecuteStreamsOpenAIResponsesThinkingAndReturnsOutputs(t *testing.T) {
	t.Parallel()

	var seenRequest map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if handledManagedLLMModelLookupTestRequest(t, w, r) {
			return
		}
		if r.URL.Path != "/v1/responses" {
			t.Fatalf("unexpected path %q", r.URL.Path)
		}
		if err := json.NewDecoder(r.Body).Decode(&seenRequest); err != nil {
			t.Fatalf("decode provider request: %v", err)
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
		fmt.Fprint(w, openAIResponseOutputTextDeltaEvent("message-1", 1, 0, "Final"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseCompletedEvent(
			[]map[string]any{
				{
					"type":              "reasoning",
					"id":                "reasoning-1",
					"summary":           []map[string]any{{"text": "Plan summary"}},
					"content":           []map[string]any{{"type": "reasoning_text", "text": "Planning deeply"}},
					"encrypted_content": "enc-thinking",
					"status":            "completed",
				},
				{
					"type":    "message",
					"id":      "message-1",
					"role":    "assistant",
					"status":  "completed",
					"phase":   "final_answer",
					"content": []map[string]any{{"type": "output_text", "text": "Final answer", "annotations": []any{}}},
				},
			},
			8,
			3,
			11,
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
		Thinking:        true,
		Inputs: map[string]any{
			"runType": "llm_chat",
			"messages": []any{
				map[string]any{
					"id":   "user-1",
					"role": "user",
					"content": []any{
						map[string]any{"type": "text", "text": "Think this through"},
					},
					"attachments": []any{},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("execute managed llm reasoning request: %v", err)
	}

	reasoning, ok := seenRequest["reasoning"].(map[string]any)
	if !ok {
		t.Fatalf("expected reasoning payload, got %#v", seenRequest["reasoning"])
	}
	if reasoning["effort"] != "high" {
		t.Fatalf("expected reasoning.effort=high, got %#v", reasoning)
	}
	if reasoning["summary"] != "auto" {
		t.Fatalf("expected reasoning.summary=auto, got %#v", reasoning)
	}
	if seenRequest["instructions"] != "System prompt" {
		t.Fatalf("expected responses instructions, got %#v", seenRequest["instructions"])
	}
	if seenRequest["store"] != false {
		t.Fatalf("expected responses store=false, got %#v", seenRequest["store"])
	}
	includes, ok := seenRequest["include"].([]any)
	if !ok || len(includes) != 1 || includes[0] != "reasoning.encrypted_content" {
		t.Fatalf("expected encrypted reasoning include, got %#v", seenRequest["include"])
	}
	usage, ok := result.Outputs["usage"].(map[string]any)
	if !ok {
		t.Fatalf("expected usage payload, got %#v", result.Outputs["usage"])
	}
	if int(usage["reasoning_output_tokens"].(float64)) != 2 {
		t.Fatalf("expected reasoning output tokens in usage, got %#v", usage)
	}

	messages, ok := result.Outputs["messages"].([]any)
	if !ok || len(messages) != 2 {
		t.Fatalf("expected user and assistant output messages, got %#v", result.Outputs["messages"])
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
		t.Fatalf("expected thinking block, got %#v", content[0])
	}
	if thinkingBlock["summary"] != "Plan summary" || thinkingBlock["thinking"] != "Planning deeply" {
		t.Fatalf("unexpected OpenAI reasoning block %#v", thinkingBlock)
	}
	if thinkingBlock["signature"] != "enc-thinking" {
		t.Fatalf("expected OpenAI reasoning signature, got %#v", thinkingBlock)
	}
	if thinkingBlock["provider_item_id"] != "reasoning-1" {
		t.Fatalf("expected OpenAI reasoning item id, got %#v", thinkingBlock)
	}
	if assistant["provider_message_id"] != "message-1" {
		t.Fatalf("expected OpenAI provider message id, got %#v", assistant)
	}
	if assistant["provider_message_phase"] != "final_answer" {
		t.Fatalf("expected OpenAI provider message phase, got %#v", assistant)
	}
	textBlock, ok := content[1].(map[string]any)
	if !ok || textBlock["text"] != "Final answer" {
		t.Fatalf("unexpected text block %#v", content[1])
	}
	state, stateErr := live.GetLiveChatState(run.ID)
	if stateErr != nil {
		t.Fatalf("get live state: %v", stateErr)
	}
	if state == nil || state.WaitingForResponse {
		t.Fatalf("expected finalized live state, got %#v", state)
	}
	stateContent, ok := state.Messages[1]["content"].([]any)
	if len(state.Messages) != 2 || !ok || len(stateContent) != 2 {
		t.Fatalf("expected completed response fallback to preserve full live assistant content, got %#v", state)
	}
	stateThinkingBlock, ok := stateContent[0].(map[string]any)
	if !ok || stateThinkingBlock["summary"] != "Plan summary" || stateThinkingBlock["thinking"] != "Planning deeply" {
		t.Fatalf("expected completed response fallback to preserve full live reasoning content, got %#v", state)
	}
	if stateThinkingBlock["signature"] != "enc-thinking" {
		t.Fatalf("expected completed response fallback to preserve encrypted reasoning signature, got %#v", stateThinkingBlock)
	}
	if stateThinkingBlock["provider_item_id"] != "reasoning-1" {
		t.Fatalf("expected completed response fallback to preserve reasoning item id, got %#v", stateThinkingBlock)
	}
	if state.Messages[1]["provider_message_id"] != "message-1" {
		t.Fatalf("expected completed response fallback to preserve provider message id, got %#v", state.Messages[1])
	}
	if state.Messages[1]["provider_message_phase"] != "final_answer" {
		t.Fatalf("expected completed response fallback to preserve provider message phase, got %#v", state.Messages[1])
	}
	stateTextBlock, ok := stateContent[1].(map[string]any)
	if !ok || stateTextBlock["text"] != "Final answer" {
		t.Fatalf("expected completed response fallback to preserve full live assistant text, got %#v", state)
	}
	broadcastMessages := broadcaster.Messages()
	expectedSummary := "Plan summary"
	if findBroadcastThinkingDelta(broadcastMessages, 0, "", &expectedSummary) == nil {
		t.Fatalf("expected completed fallback summary delta in %#v", broadcastMessages)
	}
	if findBroadcastThinkingDelta(broadcastMessages, 0, " deeply", nil) == nil {
		t.Fatalf("expected completed fallback thinking delta in %#v", broadcastMessages)
	}
	if findBroadcastThinkingSignatureDelta(broadcastMessages, 0, "enc-thinking") == nil {
		t.Fatalf("expected completed fallback signature delta in %#v", broadcastMessages)
	}
	if findBroadcastTextDelta(broadcastMessages, 1, " answer") == nil {
		t.Fatalf("expected completed fallback text delta in %#v", broadcastMessages)
	}
	if broadcaster.Count() != 10 {
		t.Fatalf("expected start, seven delta updates, stop, finalized broadcasts, got %d", broadcaster.Count())
	}
}

func TestExecutorExecuteResendsOpenAIResponsesProviderMessageMetadataInFollowUpTranscript(t *testing.T) {
	t.Parallel()

	var seenRequest map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if handledManagedLLMModelLookupTestRequest(t, w, r) {
			return
		}
		if r.URL.Path != "/v1/responses" {
			t.Fatalf("unexpected path %q", r.URL.Path)
		}
		if err := json.NewDecoder(r.Body).Decode(&seenRequest); err != nil {
			t.Fatalf("decode provider request: %v", err)
		}
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			t.Fatal("expected flusher")
		}
		// Follow-up Responses turns should resend provider-owned assistant IDs and phase metadata.
		fmt.Fprint(w, openAIResponseCompletedEvent(
			[]map[string]any{
				{
					"type":    "message",
					"id":      "message-2",
					"role":    "assistant",
					"status":  "completed",
					"phase":   "final_answer",
					"content": []map[string]any{{"type": "output_text", "text": "Next answer", "annotations": []any{}}},
				},
			},
			9,
			2,
			11,
			1,
		))
		flusher.Flush()
	}))
	defer server.Close()

	executor := NewExecutor(ExecutorOptions{
		HTTPClient: server.Client(),
	})
	_, err := executor.Execute(context.Background(), agentruns.ExecutionRequest{
		Run: agentruns.Run{ID: "run-alpha"},
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
		SystemPrompt: "System prompt",
		ChatID:       "chat-alpha",
		Thinking:     true,
		Inputs: map[string]any{
			"runType": "llm_chat",
			"messages": []any{
				map[string]any{
					"id":                     "assistant-local-1",
					"role":                   "assistant",
					"provider_message_id":    "provider-message-1",
					"provider_message_phase": "commentary",
					"content": []any{
						map[string]any{
							"type":             "thinking",
							"summary":          "Plan summary",
							"thinking":         "Planning deeply",
							"signature":        "enc-prior",
							"provider_item_id": "reasoning-provider-1",
						},
						map[string]any{
							"type": "text",
							"text": "Earlier answer",
						},
					},
					"attachments": []any{},
				},
				map[string]any{
					"id":   "user-1",
					"role": "user",
					"content": []any{
						map[string]any{"type": "text", "text": "Continue"},
					},
					"attachments": []any{},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("execute managed OpenAI Responses follow-up request: %v", err)
	}

	input, ok := seenRequest["input"].([]any)
	if !ok || len(input) < 3 {
		t.Fatalf("expected OpenAI Responses transcript input, got %#v", seenRequest["input"])
	}
	foundReasoning := false
	foundOutputMessage := false
	for _, rawItem := range input {
		item, ok := rawItem.(map[string]any)
		if !ok {
			continue
		}
		if item["type"] == "reasoning" && item["id"] == "reasoning-provider-1" && item["encrypted_content"] == "enc-prior" {
			foundReasoning = true
		}
		if item["type"] == "message" && item["id"] == "provider-message-1" && item["phase"] == "commentary" {
			content, ok := item["content"].([]any)
			if ok && len(content) == 1 {
				contentItem, ok := content[0].(map[string]any)
				if ok && contentItem["type"] == "output_text" && contentItem["text"] == "Earlier answer" {
					foundOutputMessage = true
				}
			}
		}
	}
	if !foundReasoning || !foundOutputMessage {
		t.Fatalf("expected follow-up Responses input to preserve provider reasoning/message metadata, got %#v", input)
	}
}

func TestExecutorExecuteResendsOpenAIResponsesRefusalContentInFollowUpTranscript(t *testing.T) {
	t.Parallel()

	var seenRequest map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if handledManagedLLMModelLookupTestRequest(t, w, r) {
			return
		}
		if r.URL.Path != "/v1/responses" {
			t.Fatalf("unexpected path %q", r.URL.Path)
		}
		if err := json.NewDecoder(r.Body).Decode(&seenRequest); err != nil {
			t.Fatalf("decode provider request: %v", err)
		}
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			t.Fatal("expected flusher")
		}
		fmt.Fprint(w, openAIResponseCompletedEvent(
			[]map[string]any{
				{
					"type":    "message",
					"id":      "message-2",
					"role":    "assistant",
					"status":  "completed",
					"phase":   "final_answer",
					"content": []map[string]any{{"type": "output_text", "text": "Next answer", "annotations": []any{}}},
				},
			},
			9,
			2,
			11,
			0,
		))
		flusher.Flush()
	}))
	defer server.Close()

	executor := NewExecutor(ExecutorOptions{
		HTTPClient: server.Client(),
	})
	_, err := executor.Execute(context.Background(), agentruns.ExecutionRequest{
		Run: agentruns.Run{ID: "run-alpha"},
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
		SystemPrompt: "System prompt",
		ChatID:       "chat-alpha",
		Thinking:     true,
		Inputs: map[string]any{
			"runType": "llm_chat",
			"messages": []any{
				map[string]any{
					"id":                            "assistant-local-1",
					"role":                          "assistant",
					"provider_message_id":           "provider-message-1",
					"provider_message_content_type": "refusal",
					"content": []any{
						map[string]any{
							"type": "text",
							"text": "Cannot comply",
						},
					},
					"attachments": []any{},
				},
				map[string]any{
					"id":   "user-1",
					"role": "user",
					"content": []any{
						map[string]any{"type": "text", "text": "Continue"},
					},
					"attachments": []any{},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("execute managed OpenAI Responses refusal follow-up request: %v", err)
	}

	input, ok := seenRequest["input"].([]any)
	if !ok || len(input) < 2 {
		t.Fatalf("expected OpenAI Responses transcript input, got %#v", seenRequest["input"])
	}
	foundRefusalMessage := false
	for _, rawItem := range input {
		item, ok := rawItem.(map[string]any)
		if !ok {
			continue
		}
		if item["type"] != "message" || item["id"] != "provider-message-1" {
			continue
		}
		content, ok := item["content"].([]any)
		if !ok || len(content) != 1 {
			continue
		}
		contentItem, ok := content[0].(map[string]any)
		if !ok {
			continue
		}
		if contentItem["type"] == "refusal" && contentItem["refusal"] == "Cannot comply" {
			foundRefusalMessage = true
		}
	}
	if !foundRefusalMessage {
		t.Fatalf("expected follow-up Responses input to preserve refusal content type, got %#v", input)
	}
}

func TestExecutorExecuteEmitsOpenAIResponsesOutputItemAddedContentDeltas(t *testing.T) {
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
		fmt.Fprint(w, openAIResponseReasoningItemAddedWithContentEvent(0, "reasoning-1", "Plan summary", "Planning deeply"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseOutputMessageAddedEvent("message-1", 1, "Final answer"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseCompletedEvent([]map[string]any{}, 8, 3, 11, 2))
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
		Thinking:        true,
		Inputs: map[string]any{
			"runType": "llm_chat",
			"messages": []any{
				map[string]any{
					"id":   "user-1",
					"role": "user",
					"content": []any{
						map[string]any{"type": "text", "text": "Think this through"},
					},
					"attachments": []any{},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("execute managed llm output_item.added request: %v", err)
	}

	messages, ok := result.Outputs["messages"].([]any)
	if !ok || len(messages) != 2 {
		t.Fatalf("expected user and assistant output messages, got %#v", result.Outputs["messages"])
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
	if !ok || thinkingBlock["summary"] != "Plan summary" || thinkingBlock["thinking"] != "Planning deeply" {
		t.Fatalf("unexpected thinking block %#v", content[0])
	}
	textBlock, ok := content[1].(map[string]any)
	if !ok || textBlock["text"] != "Final answer" {
		t.Fatalf("unexpected text block %#v", content[1])
	}

	broadcastMessages := broadcaster.Messages()
	expectedSummary := "Plan summary"
	if findBroadcastThinkingDelta(broadcastMessages, 0, "", &expectedSummary) == nil {
		t.Fatalf("expected output_item.added summary delta in %#v", broadcastMessages)
	}
	if findBroadcastThinkingDelta(broadcastMessages, 0, "Planning deeply", nil) == nil {
		t.Fatalf("expected output_item.added thinking delta in %#v", broadcastMessages)
	}
	if findBroadcastTextDelta(broadcastMessages, 1, "Final answer") == nil {
		t.Fatalf("expected output_item.added text delta in %#v", broadcastMessages)
	}
	if broadcaster.Count() != 6 {
		t.Fatalf("expected start, three delta updates, stop, finalized broadcasts, got %d", broadcaster.Count())
	}
}

func TestExecutorExecuteUsesOpenAIResponsesDoneEventsAsAuthoritativeContent(t *testing.T) {
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
		fmt.Fprint(w, openAIResponseReasoningSummaryTextDoneEvent("reasoning-1", 0, 0, "Plan summary"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseReasoningTextDeltaEvent("reasoning-1", 0, 0, "Planning"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseReasoningTextDoneEvent("reasoning-1", 0, 0, "Planning deeply"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseOutputTextDeltaEvent("message-1", 1, 0, "Final"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseOutputTextDoneEvent("message-1", 1, 0, "Final answer"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseCompletedEvent([]map[string]any{}, 8, 3, 11, 2))
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
		Thinking:        true,
		Inputs: map[string]any{
			"runType": "llm_chat",
			"messages": []any{
				map[string]any{
					"id":   "user-1",
					"role": "user",
					"content": []any{
						map[string]any{"type": "text", "text": "Think this through"},
					},
					"attachments": []any{},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("execute managed llm done-event request: %v", err)
	}

	messages, ok := result.Outputs["messages"].([]any)
	if !ok || len(messages) != 2 {
		t.Fatalf("expected user and assistant output messages, got %#v", result.Outputs["messages"])
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
	if !ok || thinkingBlock["summary"] != "Plan summary" || thinkingBlock["thinking"] != "Planning deeply" {
		t.Fatalf("unexpected thinking block %#v", content[0])
	}
	textBlock, ok := content[1].(map[string]any)
	if !ok || textBlock["text"] != "Final answer" {
		t.Fatalf("unexpected text block %#v", content[1])
	}

	state, stateErr := live.GetLiveChatState(run.ID)
	if stateErr != nil {
		t.Fatalf("get live state: %v", stateErr)
	}
	if state == nil || state.WaitingForResponse {
		t.Fatalf("expected finalized live state, got %#v", state)
	}
	stateContent, ok := state.Messages[1]["content"].([]any)
	if len(state.Messages) != 2 || !ok || len(stateContent) != 2 {
		t.Fatalf("expected finalized live done-event content, got %#v", state)
	}
	stateThinkingBlock, ok := stateContent[0].(map[string]any)
	if !ok || stateThinkingBlock["summary"] != "Plan summary" || stateThinkingBlock["thinking"] != "Planning deeply" {
		t.Fatalf("expected finalized live thinking block, got %#v", state)
	}
	stateTextBlock, ok := stateContent[1].(map[string]any)
	if !ok || stateTextBlock["text"] != "Final answer" {
		t.Fatalf("expected finalized live text block, got %#v", state)
	}
	if broadcaster.Count() != 9 {
		t.Fatalf("expected start, six delta updates, stop, finalized broadcasts, got %d", broadcaster.Count())
	}
}

func TestExecutorExecuteUsesOpenAIResponsesRefusalDoneAsAuthoritativeText(t *testing.T) {
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
		fmt.Fprint(w, openAIResponseRefusalDeltaEvent("message-1", 0, 0, "Cannot"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseRefusalDoneEvent("message-1", 0, 0, "Cannot comply"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseCompletedEvent([]map[string]any{}, 8, 3, 11, 0))
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
		Thinking:        true,
		Inputs: map[string]any{
			"runType": "llm_chat",
			"messages": []any{
				map[string]any{
					"id":   "user-1",
					"role": "user",
					"content": []any{
						map[string]any{"type": "text", "text": "Think this through"},
					},
					"attachments": []any{},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("execute managed llm refusal request: %v", err)
	}

	messages, ok := result.Outputs["messages"].([]any)
	if !ok || len(messages) != 2 {
		t.Fatalf("expected user and assistant output messages, got %#v", result.Outputs["messages"])
	}
	assistant, ok := messages[1].(map[string]any)
	if !ok || assistantText(assistant) != "Cannot comply" {
		t.Fatalf("unexpected refusal assistant message %#v", messages[1])
	}
	if assistant["provider_message_id"] != "message-1" {
		t.Fatalf("expected refusal provider message id, got %#v", assistant)
	}
	if assistant["provider_message_content_type"] != "refusal" {
		t.Fatalf("expected refusal provider content type, got %#v", assistant)
	}

	state, stateErr := live.GetLiveChatState(run.ID)
	if stateErr != nil {
		t.Fatalf("get live state: %v", stateErr)
	}
	if state == nil || state.WaitingForResponse {
		t.Fatalf("expected finalized live state, got %#v", state)
	}
	if len(state.Messages) != 2 || assistantText(state.Messages[1]) != "Cannot comply" {
		t.Fatalf("expected finalized live refusal text, got %#v", state)
	}
	if state.Messages[1]["provider_message_id"] != "message-1" {
		t.Fatalf("expected finalized refusal provider message id, got %#v", state.Messages[1])
	}
	if state.Messages[1]["provider_message_content_type"] != "refusal" {
		t.Fatalf("expected finalized refusal provider content type, got %#v", state.Messages[1])
	}
	if broadcaster.Count() != 5 {
		t.Fatalf("expected start, two delta updates, stop, finalized broadcasts, got %d", broadcaster.Count())
	}
}

func TestExecutorExecuteUsesOpenAIResponsesContentPartDoneAsAuthoritativeContent(t *testing.T) {
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
		fmt.Fprint(w, openAIResponseReasoningSummaryTextDoneEvent("reasoning-1", 0, 0, "Plan summary"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseReasoningTextDeltaEvent("reasoning-1", 0, 0, "Planning"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseContentPartDoneReasoningTextEvent("reasoning-1", 0, 0, "Planning deeply"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseOutputTextDeltaEvent("message-1", 1, 0, "Final"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseContentPartDoneOutputTextEvent("message-1", 1, 0, "Final answer"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseCompletedEvent([]map[string]any{}, 8, 3, 11, 2))
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
		Thinking:        true,
		Inputs: map[string]any{
			"runType": "llm_chat",
			"messages": []any{
				map[string]any{
					"id":   "user-1",
					"role": "user",
					"content": []any{
						map[string]any{"type": "text", "text": "Think this through"},
					},
					"attachments": []any{},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("execute managed llm content-part-done request: %v", err)
	}

	messages, ok := result.Outputs["messages"].([]any)
	if !ok || len(messages) != 2 {
		t.Fatalf("expected user and assistant output messages, got %#v", result.Outputs["messages"])
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
	if !ok || thinkingBlock["summary"] != "Plan summary" || thinkingBlock["thinking"] != "Planning deeply" {
		t.Fatalf("unexpected thinking block %#v", content[0])
	}
	textBlock, ok := content[1].(map[string]any)
	if !ok || textBlock["text"] != "Final answer" {
		t.Fatalf("unexpected text block %#v", content[1])
	}

	state, stateErr := live.GetLiveChatState(run.ID)
	if stateErr != nil {
		t.Fatalf("get live state: %v", stateErr)
	}
	if state == nil || state.WaitingForResponse {
		t.Fatalf("expected finalized live state, got %#v", state)
	}
	stateContent, ok := state.Messages[1]["content"].([]any)
	if len(state.Messages) != 2 || !ok || len(stateContent) != 2 {
		t.Fatalf("expected finalized live content-part-done content, got %#v", state)
	}
	stateThinkingBlock, ok := stateContent[0].(map[string]any)
	if !ok || stateThinkingBlock["summary"] != "Plan summary" || stateThinkingBlock["thinking"] != "Planning deeply" {
		t.Fatalf("expected finalized live thinking block, got %#v", state)
	}
	stateTextBlock, ok := stateContent[1].(map[string]any)
	if !ok || stateTextBlock["text"] != "Final answer" {
		t.Fatalf("expected finalized live text block, got %#v", state)
	}
	if broadcaster.Count() != 9 {
		t.Fatalf("expected start, six delta updates, stop, finalized broadcasts, got %d", broadcaster.Count())
	}
}

func TestExecutorExecuteUsesOpenAIResponsesContentPartDoneAsAuthoritativeRefusal(t *testing.T) {
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
		fmt.Fprint(w, openAIResponseRefusalDeltaEvent("message-1", 0, 0, "Cannot"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseContentPartDoneRefusalEvent("message-1", 0, 0, "Cannot comply"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseCompletedEvent([]map[string]any{}, 8, 3, 11, 0))
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
		Thinking:        true,
		Inputs: map[string]any{
			"runType": "llm_chat",
			"messages": []any{
				map[string]any{
					"id":   "user-1",
					"role": "user",
					"content": []any{
						map[string]any{"type": "text", "text": "Think this through"},
					},
					"attachments": []any{},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("execute managed llm content-part-done refusal request: %v", err)
	}

	messages, ok := result.Outputs["messages"].([]any)
	if !ok || len(messages) != 2 {
		t.Fatalf("expected user and assistant output messages, got %#v", result.Outputs["messages"])
	}
	assistant, ok := messages[1].(map[string]any)
	if !ok || assistantText(assistant) != "Cannot comply" {
		t.Fatalf("unexpected refusal assistant message %#v", messages[1])
	}
	if assistant["provider_message_id"] != "message-1" {
		t.Fatalf("expected content-part refusal provider message id, got %#v", assistant)
	}
	if assistant["provider_message_content_type"] != "refusal" {
		t.Fatalf("expected content-part refusal provider content type, got %#v", assistant)
	}

	state, stateErr := live.GetLiveChatState(run.ID)
	if stateErr != nil {
		t.Fatalf("get live state: %v", stateErr)
	}
	if state == nil || state.WaitingForResponse {
		t.Fatalf("expected finalized live state, got %#v", state)
	}
	if len(state.Messages) != 2 || assistantText(state.Messages[1]) != "Cannot comply" {
		t.Fatalf("expected finalized live refusal text, got %#v", state)
	}
	if state.Messages[1]["provider_message_id"] != "message-1" {
		t.Fatalf("expected finalized content-part refusal provider message id, got %#v", state.Messages[1])
	}
	if state.Messages[1]["provider_message_content_type"] != "refusal" {
		t.Fatalf("expected finalized content-part refusal provider content type, got %#v", state.Messages[1])
	}
	if broadcaster.Count() != 5 {
		t.Fatalf("expected start, two delta updates, stop, finalized broadcasts, got %d", broadcaster.Count())
	}
}

func TestExecutorExecuteUsesOpenAIResponsesSummaryPartAndContentPartAddedEvents(t *testing.T) {
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
		fmt.Fprint(w, openAIResponseReasoningSummaryPartAddedEvent("reasoning-1", 0, 1, "Second step"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseReasoningSummaryPartAddedEvent("reasoning-1", 0, 0, "First step"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseContentPartAddedReasoningTextEvent("reasoning-1", 0, 0, "Planning deeply"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseContentPartAddedOutputTextEvent("message-1", 1, 0, "Final answer"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseCompletedEvent([]map[string]any{}, 8, 3, 11, 2))
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
		Thinking:        true,
		Inputs: map[string]any{
			"runType": "llm_chat",
			"messages": []any{
				map[string]any{
					"id":   "user-1",
					"role": "user",
					"content": []any{
						map[string]any{"type": "text", "text": "Think this through"},
					},
					"attachments": []any{},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("execute managed llm summary-part/content-part-added request: %v", err)
	}

	messages, ok := result.Outputs["messages"].([]any)
	if !ok || len(messages) != 2 {
		t.Fatalf("expected user and assistant output messages, got %#v", result.Outputs["messages"])
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
	if !ok || thinkingBlock["summary"] != "First step\nSecond step" || thinkingBlock["thinking"] != "Planning deeply" {
		t.Fatalf("unexpected thinking block %#v", content[0])
	}
	textBlock, ok := content[1].(map[string]any)
	if !ok || textBlock["text"] != "Final answer" {
		t.Fatalf("unexpected text block %#v", content[1])
	}

	state, stateErr := live.GetLiveChatState(run.ID)
	if stateErr != nil {
		t.Fatalf("get live state: %v", stateErr)
	}
	if state == nil || state.WaitingForResponse {
		t.Fatalf("expected finalized live state, got %#v", state)
	}
	stateContent, ok := state.Messages[1]["content"].([]any)
	if len(state.Messages) != 2 || !ok || len(stateContent) != 2 {
		t.Fatalf("expected finalized live summary-part/content-part-added content, got %#v", state)
	}
	stateThinkingBlock, ok := stateContent[0].(map[string]any)
	if !ok || stateThinkingBlock["summary"] != "First step\nSecond step" || stateThinkingBlock["thinking"] != "Planning deeply" {
		t.Fatalf("expected finalized live thinking block, got %#v", state)
	}
	stateTextBlock, ok := stateContent[1].(map[string]any)
	if !ok || stateTextBlock["text"] != "Final answer" {
		t.Fatalf("expected finalized live text block, got %#v", state)
	}
	if broadcaster.Count() != 7 {
		t.Fatalf("expected start, four delta updates, stop, finalized broadcasts, got %d", broadcaster.Count())
	}
}

func TestExecutorExecuteRecoversOpenAIResponsesSummaryPartDoneAndContentPartAddedBeforeIncompleteFailure(t *testing.T) {
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
		fmt.Fprint(w, openAIResponseReasoningSummaryPartDoneEvent("reasoning-1", 0, 1, "Second step"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseReasoningSummaryPartDoneEvent("reasoning-1", 0, 0, "First step"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseContentPartAddedReasoningTextEvent("reasoning-1", 0, 0, "Planning deeply"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseContentPartAddedOutputTextEvent("message-1", 1, 0, "Partial answer"))
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
	content, ok := assistant["content"].([]any)
	if !ok || len(content) != 2 {
		t.Fatalf("expected thinking plus text content, got %#v", assistant["content"])
	}
	thinkingBlock, ok := content[0].(map[string]any)
	if !ok || thinkingBlock["summary"] != "First step\nSecond step" || thinkingBlock["thinking"] != "Planning deeply" {
		t.Fatalf("unexpected thinking block %#v", content[0])
	}
	textBlock, ok := content[1].(map[string]any)
	if !ok || textBlock["text"] != "Partial answer" {
		t.Fatalf("unexpected text block %#v", content[1])
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
		t.Fatalf("expected finalized live summary-part/content-part-added failure content, got %#v", state)
	}
	stateThinkingBlock, ok := stateContent[0].(map[string]any)
	if !ok || stateThinkingBlock["summary"] != "First step\nSecond step" || stateThinkingBlock["thinking"] != "Planning deeply" {
		t.Fatalf("expected finalized live thinking block, got %#v", state)
	}
	stateTextBlock, ok := stateContent[1].(map[string]any)
	if !ok || stateTextBlock["text"] != "Partial answer" {
		t.Fatalf("expected finalized live text block, got %#v", state)
	}
	if broadcaster.Count() != 7 {
		t.Fatalf("expected start, four delta updates, stop, finalized broadcasts, got %d", broadcaster.Count())
	}
}

func TestExecutorExecuteTreatsOpenAIResponsesIncompleteEventAsProviderFailure(t *testing.T) {
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
		fmt.Fprint(w, openAIResponseOutputTextDeltaEvent("message-1", 0, 0, "Partial answer"))
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
		SystemPrompt: "System prompt",
		ChatID:       "chat-alpha",
		Thinking:     true,
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
	if assistantText(assistant) != "Partial answer" {
		t.Fatalf("expected partial assistant text to be preserved, got %#v", assistant)
	}

	state, stateErr := live.GetLiveChatState(run.ID)
	if stateErr != nil {
		t.Fatalf("get live state after provider failure: %v", stateErr)
	}
	if state == nil || state.WaitingForResponse {
		t.Fatalf("expected provider failure to clear waiting state, got %#v", state)
	}
	if len(state.Messages) != 2 || assistantText(state.Messages[1]) != "Partial answer" {
		t.Fatalf("expected finalized live partial assistant message, got %#v", state)
	}
	if broadcaster.Count() != 4 {
		t.Fatalf("expected start, delta, stop, finalized broadcasts, got %d", broadcaster.Count())
	}
}

func TestExecutorExecutePreservesOpenAIResponsesEarlyTextWhenReasoningArrivesLaterBeforeIncompleteFailure(t *testing.T) {
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
		fmt.Fprint(w, openAIResponseOutputTextDeltaEvent("message-1", 1, 0, "Partial answer"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseReasoningItemAddedEvent(0, "reasoning-1"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseReasoningSummaryTextDeltaEvent("reasoning-1", 0, 0, "Plan"))
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
		SystemPrompt: "System prompt",
		ChatID:       "chat-alpha",
		Thinking:     true,
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
	content, ok := assistant["content"].([]any)
	if !ok || len(content) != 2 {
		t.Fatalf("expected thinking and text blocks after late reasoning, got %#v", assistant)
	}
	thinkingBlock, ok := content[0].(map[string]any)
	if !ok || thinkingBlock["summary"] != "Plan" {
		t.Fatalf("expected preserved reasoning summary block, got %#v", content[0])
	}
	textBlock, ok := content[1].(map[string]any)
	if !ok || textBlock["text"] != "Partial answer" {
		t.Fatalf("expected preserved early text block, got %#v", content[1])
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
		t.Fatalf("expected finalized live thinking and text blocks, got %#v", state)
	}
	stateThinkingBlock, ok := stateContent[0].(map[string]any)
	if !ok || stateThinkingBlock["summary"] != "Plan" {
		t.Fatalf("expected finalized live reasoning summary, got %#v", stateContent[0])
	}
	stateTextBlock, ok := stateContent[1].(map[string]any)
	if !ok || stateTextBlock["text"] != "Partial answer" {
		t.Fatalf("expected finalized live early text block, got %#v", stateContent[1])
	}
	if broadcaster.Count() != 5 {
		t.Fatalf("expected start, text delta, reasoning delta, stop, finalized broadcasts, got %d", broadcaster.Count())
	}
}

func TestExecutorExecuteFlushesBufferedOpenAIResponsesTextWhenReasoningNeverMaterializesBeforeIncompleteFailure(t *testing.T) {
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
		fmt.Fprint(w, openAIResponseOutputTextDeltaEvent("message-1", 1, 0, "Partial"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseReasoningItemAddedEvent(0, "reasoning-1"))
		flusher.Flush()
		fmt.Fprint(w, openAIResponseOutputTextDeltaEvent("message-1", 1, 0, " answer"))
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
		SystemPrompt: "System prompt",
		ChatID:       "chat-alpha",
		Thinking:     true,
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
	if assistantText(assistant) != "Partial answer" {
		t.Fatalf("expected buffered text to be flushed into the final assistant message, got %#v", assistant)
	}
	if hasMessageThinking(assistant) {
		t.Fatalf("expected empty reasoning placeholder to be compacted away, got %#v", assistant)
	}

	state, stateErr := live.GetLiveChatState(run.ID)
	if stateErr != nil {
		t.Fatalf("get live state after provider failure: %v", stateErr)
	}
	if state == nil || state.WaitingForResponse {
		t.Fatalf("expected provider failure to clear waiting state, got %#v", state)
	}
	if len(state.Messages) != 2 || assistantText(state.Messages[1]) != "Partial answer" {
		t.Fatalf("expected finalized live flushed text message, got %#v", state)
	}
	if hasMessageThinking(state.Messages[1]) {
		t.Fatalf("expected finalized live message to drop empty thinking placeholder, got %#v", state.Messages[1])
	}
	if broadcaster.Count() != 5 {
		t.Fatalf("expected start, first text delta, flushed text delta, stop, finalized broadcasts, got %d", broadcaster.Count())
	}
}
