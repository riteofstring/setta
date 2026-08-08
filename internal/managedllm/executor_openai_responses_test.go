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

	assertOpenAIResponsesThinkingRequest(t, seenRequest)
	assertOpenAIResponsesThinkingOutputs(t, result)
	assertOpenAIResponsesThinkingLiveState(t, live, run.ID)
	assertOpenAIResponsesThinkingBroadcasts(t, broadcaster)
}

func assertOpenAIResponsesThinkingRequest(t *testing.T, seenRequest map[string]any) {
	t.Helper()

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
}

func assertOpenAIResponsesThinkingOutputs(t *testing.T, result agentruns.ExecutionResult) {
	t.Helper()

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
	assertOpenAIResponsesThinkingAssistantMessage(t, assistant)
}

func assertOpenAIResponsesThinkingAssistantMessage(t *testing.T, assistant map[string]any) {
	t.Helper()

	content, ok := assistant["content"].([]any)
	if !ok || len(content) != 2 {
		t.Fatalf("expected thinking plus text content, got %#v", assistant["content"])
	}
	thinkingBlock, ok := content[0].(map[string]any)
	if !ok || thinkingBlock["type"] != "thinking" {
		t.Fatalf("expected thinking block, got %#v", content[0])
	}
	assertOpenAIResponsesThinkingBlock(t, thinkingBlock, "OpenAI reasoning")
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
}

func assertOpenAIResponsesThinkingBlock(t *testing.T, block map[string]any, contextLabel string) {
	t.Helper()

	if block["summary"] != "Plan summary" || block["thinking"] != "Planning deeply" {
		t.Fatalf("unexpected %s block %#v", contextLabel, block)
	}
	if block["signature"] != "enc-thinking" {
		t.Fatalf("expected %s signature, got %#v", contextLabel, block)
	}
	if block["provider_item_id"] != "reasoning-1" {
		t.Fatalf("expected %s item id, got %#v", contextLabel, block)
	}
}

func assertOpenAIResponsesThinkingLiveState(t *testing.T, live *managedchat.LiveRuntime, runID string) {
	t.Helper()

	state, stateErr := live.GetLiveChatState(runID)
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
	if !ok {
		t.Fatalf("expected completed response fallback thinking block, got %#v", stateContent[0])
	}
	assertOpenAIResponsesThinkingBlock(t, stateThinkingBlock, "completed response fallback")
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
}

func assertOpenAIResponsesThinkingBroadcasts(t *testing.T, broadcaster *captureBroadcaster) {
	t.Helper()

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

	input := requireOpenAIResponsesInput(t, seenRequest["input"], 3)
	assertOpenAIResponsesInputPreservesProviderMetadata(t, input)
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

	input := requireOpenAIResponsesInput(t, seenRequest["input"], 2)
	assertOpenAIResponsesInputPreservesRefusalContent(t, input)
}

func TestExecutorExecuteEmitsOpenAIResponsesOutputItemAddedContentDeltas(t *testing.T) {
	t.Parallel()

	result, fixture := executeOpenAIResponsesLiveEvents(t, []string{
		openAIResponseReasoningItemAddedWithContentEvent(0, "reasoning-1", "Plan summary", "Planning deeply"),
		openAIResponseOutputMessageAddedEvent("message-1", 1, "Final answer"),
		openAIResponseCompletedEvent([]map[string]any{}, 8, 3, 11, 2),
	})
	assertOpenAIResponsesThinkingTextFinalState(
		t,
		result,
		fixture,
		"Plan summary",
		"Planning deeply",
		"Final answer",
		6,
	)

	broadcastMessages := fixture.broadcaster.Messages()
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
}

func TestExecutorExecuteUsesOpenAIResponsesDoneEventsAsAuthoritativeContent(t *testing.T) {
	t.Parallel()

	result, fixture := executeOpenAIResponsesLiveEvents(t, []string{
		openAIResponseReasoningItemAddedEvent(0, "reasoning-1"),
		openAIResponseReasoningSummaryTextDeltaEvent("reasoning-1", 0, 0, "Plan"),
		openAIResponseReasoningSummaryTextDoneEvent("reasoning-1", 0, 0, "Plan summary"),
		openAIResponseReasoningTextDeltaEvent("reasoning-1", 0, 0, "Planning"),
		openAIResponseReasoningTextDoneEvent("reasoning-1", 0, 0, "Planning deeply"),
		openAIResponseOutputTextDeltaEvent("message-1", 1, 0, "Final"),
		openAIResponseOutputTextDoneEvent("message-1", 1, 0, "Final answer"),
		openAIResponseCompletedEvent([]map[string]any{}, 8, 3, 11, 2),
	})
	assertOpenAIResponsesThinkingTextFinalState(
		t,
		result,
		fixture,
		"Plan summary",
		"Planning deeply",
		"Final answer",
		9,
	)
}

func TestExecutorExecuteUsesOpenAIResponsesRefusalDoneAsAuthoritativeText(t *testing.T) {
	t.Parallel()

	result, fixture := executeOpenAIResponsesLiveEvents(t, []string{
		openAIResponseRefusalDeltaEvent("message-1", 0, 0, "Cannot"),
		openAIResponseRefusalDoneEvent("message-1", 0, 0, "Cannot comply"),
		openAIResponseCompletedEvent([]map[string]any{}, 8, 3, 11, 0),
	})
	assertOpenAIResponsesRefusalFinalState(t, result, fixture, "Cannot comply", "message-1", 5)
}

func TestExecutorExecuteUsesOpenAIResponsesContentPartDoneAsAuthoritativeContent(t *testing.T) {
	t.Parallel()

	result, fixture := executeOpenAIResponsesLiveEvents(t, []string{
		openAIResponseReasoningItemAddedEvent(0, "reasoning-1"),
		openAIResponseReasoningSummaryTextDeltaEvent("reasoning-1", 0, 0, "Plan"),
		openAIResponseReasoningSummaryTextDoneEvent("reasoning-1", 0, 0, "Plan summary"),
		openAIResponseReasoningTextDeltaEvent("reasoning-1", 0, 0, "Planning"),
		openAIResponseContentPartDoneReasoningTextEvent("reasoning-1", 0, 0, "Planning deeply"),
		openAIResponseOutputTextDeltaEvent("message-1", 1, 0, "Final"),
		openAIResponseContentPartDoneOutputTextEvent("message-1", 1, 0, "Final answer"),
		openAIResponseCompletedEvent([]map[string]any{}, 8, 3, 11, 2),
	})
	assertOpenAIResponsesThinkingTextFinalState(
		t,
		result,
		fixture,
		"Plan summary",
		"Planning deeply",
		"Final answer",
		9,
	)
}

func TestExecutorExecuteUsesOpenAIResponsesContentPartDoneAsAuthoritativeRefusal(t *testing.T) {
	t.Parallel()

	result, fixture := executeOpenAIResponsesLiveEvents(t, []string{
		openAIResponseRefusalDeltaEvent("message-1", 0, 0, "Cannot"),
		openAIResponseContentPartDoneRefusalEvent("message-1", 0, 0, "Cannot comply"),
		openAIResponseCompletedEvent([]map[string]any{}, 8, 3, 11, 0),
	})
	assertOpenAIResponsesRefusalFinalState(t, result, fixture, "Cannot comply", "message-1", 5)
}

func TestExecutorExecuteUsesOpenAIResponsesSummaryPartAndContentPartAddedEvents(t *testing.T) {
	t.Parallel()

	result, fixture := executeOpenAIResponsesLiveEvents(t, []string{
		openAIResponseReasoningItemAddedEvent(0, "reasoning-1"),
		openAIResponseReasoningSummaryPartAddedEvent("reasoning-1", 0, 1, "Second step"),
		openAIResponseReasoningSummaryPartAddedEvent("reasoning-1", 0, 0, "First step"),
		openAIResponseContentPartAddedReasoningTextEvent("reasoning-1", 0, 0, "Planning deeply"),
		openAIResponseContentPartAddedOutputTextEvent("message-1", 1, 0, "Final answer"),
		openAIResponseCompletedEvent([]map[string]any{}, 8, 3, 11, 2),
	})
	assertOpenAIResponsesThinkingTextFinalState(
		t,
		result,
		fixture,
		"First step\nSecond step",
		"Planning deeply",
		"Final answer",
		7,
	)
}

func TestExecutorExecuteRecoversOpenAIResponsesSummaryPartDoneAndContentPartAddedBeforeIncompleteFailure(t *testing.T) {
	t.Parallel()

	result, fixture, err := executeOpenAIResponsesRecoveryEvents(t, []string{
		openAIResponseReasoningItemAddedEvent(0, "reasoning-1"),
		openAIResponseReasoningSummaryPartDoneEvent("reasoning-1", 0, 1, "Second step"),
		openAIResponseReasoningSummaryPartDoneEvent("reasoning-1", 0, 0, "First step"),
		openAIResponseContentPartAddedReasoningTextEvent("reasoning-1", 0, 0, "Planning deeply"),
		openAIResponseContentPartAddedOutputTextEvent("message-1", 1, 0, "Partial answer"),
		openAIResponseIncompleteEvent("max_output_tokens"),
	})
	assertOpenAIResponsesProviderError(
		t,
		err,
		"managed llm provider request failed: response incomplete (max_output_tokens)",
	)
	assertOpenAIResponsesThinkingTextFinalState(
		t,
		result,
		fixture,
		"First step\nSecond step",
		"Planning deeply",
		"Partial answer",
		7,
	)
}

func TestExecutorExecuteTreatsOpenAIResponsesIncompleteEventAsProviderFailure(t *testing.T) {
	t.Parallel()

	result, fixture, err := executeOpenAIResponsesRecoveryEvents(t, []string{
		openAIResponseOutputTextDeltaEvent("message-1", 0, 0, "Partial answer"),
		openAIResponseIncompleteEvent("max_output_tokens"),
	})
	assertOpenAIResponsesProviderError(
		t,
		err,
		"managed llm provider request failed: response incomplete (max_output_tokens)",
	)
	assertOpenAIResponsesPlainTextFinalState(t, result, fixture, "Partial answer", 4)
}

func TestExecutorExecutePreservesOpenAIResponsesEarlyTextWhenReasoningArrivesLaterBeforeIncompleteFailure(t *testing.T) {
	t.Parallel()

	result, fixture, err := executeOpenAIResponsesRecoveryEvents(t, []string{
		openAIResponseOutputTextDeltaEvent("message-1", 1, 0, "Partial answer"),
		openAIResponseReasoningItemAddedEvent(0, "reasoning-1"),
		openAIResponseReasoningSummaryTextDeltaEvent("reasoning-1", 0, 0, "Plan"),
		openAIResponseIncompleteEvent("max_output_tokens"),
	})
	assertOpenAIResponsesProviderError(
		t,
		err,
		"managed llm provider request failed: response incomplete (max_output_tokens)",
	)
	assertOpenAIResponsesSummaryTextFinalState(t, result, fixture, "Plan", "Partial answer", 5)
}

func TestExecutorExecuteFlushesBufferedOpenAIResponsesTextWhenReasoningNeverMaterializesBeforeIncompleteFailure(t *testing.T) {
	t.Parallel()

	result, fixture, err := executeOpenAIResponsesRecoveryEvents(t, []string{
		openAIResponseOutputTextDeltaEvent("message-1", 1, 0, "Partial"),
		openAIResponseReasoningItemAddedEvent(0, "reasoning-1"),
		openAIResponseOutputTextDeltaEvent("message-1", 1, 0, " answer"),
		openAIResponseIncompleteEvent("max_output_tokens"),
	})
	assertOpenAIResponsesProviderError(
		t,
		err,
		"managed llm provider request failed: response incomplete (max_output_tokens)",
	)
	assertOpenAIResponsesPlainTextFinalState(t, result, fixture, "Partial answer", 5)
}
